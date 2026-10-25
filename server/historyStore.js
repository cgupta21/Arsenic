import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  createScoreSnapshot,
  evaluateSnapshotEligibility,
  computeScoreTrend
} from '../shared/history.js'
import { isValidGitHubUsername } from '../shared/validation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * In-memory snapshot cache (lowerUsername -> ScoreSnapshot[]).
 * Provides fast retrieval and continuity within warm serverless containers.
 */
const historyMemoryCache = new Map()

/**
 * Per-username in-process lock to prevent race conditions during concurrent updates.
 */
const userWriteLocks = new Map()

/**
 * Acquire a sequential execution lock for a given username.
 * @template T
 * @param {string} username
 * @param {() => Promise<T>} action
 * @returns {Promise<T>}
 */
export async function withUserLock(username, action) {
  const key = String(username || '').toLowerCase().trim()
  const previousLock = userWriteLocks.get(key) || Promise.resolve()

  let resolveCurrent
  const currentLock = new Promise((resolve) => {
    resolveCurrent = resolve
  })

  // Chain this lock onto the previous lock
  userWriteLocks.set(
    key,
    previousLock.then(
      () => currentLock,
      () => currentLock
    )
  )

  try {
    await previousLock
    return await action()
  } finally {
    resolveCurrent()
    if (userWriteLocks.get(key) === currentLock) {
      userWriteLocks.delete(key)
    }
  }
}

/**
 * Resolve Upstash Redis or KV REST credentials from environment variables.
 * Prioritizes UPSTASH_REDIS_REST_*, supports KV_REST_API_* as compatible alternative.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ url: string, token: string } | null}
 */
export function resolveRedisConfig(env = process.env) {
  const urlCandidate = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const tokenCandidate = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN

  if (!urlCandidate || !tokenCandidate) {
    return null
  }

  let url = String(urlCandidate).trim()
  const token = String(tokenCandidate).trim()

  if (!url || !token) {
    return null
  }

  // Ensure URL scheme
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  // Remove trailing slashes
  url = url.replace(/\/+$/, '')

  return { url, token }
}

/**
 * Determine the active storage mode.
 * @param {Record<string, string | undefined>} [env]
 * @returns {'redis' | 'ephemeral-warning' | 'file'}
 */
export function getStorageMode(env = process.env) {
  if (resolveRedisConfig(env)) {
    return 'redis'
  }
  if (env.VERCEL === '1' || env.VERCEL === 'true') {
    return 'ephemeral-warning'
  }
  return 'file'
}

/**
 * Sanitize error messages and strings to prevent logging or exposing sensitive tokens.
 * @param {unknown} err
 * @param {string} [token]
 * @returns {string}
 */
export function sanitizeError(err, token) {
  if (!err) return 'Unknown error'
  let msg = typeof err === 'string' ? err : (err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err))

  if (token) {
    msg = msg.split(token).join('[REDACTED]')
  }

  // Redact any Bearer tokens or authorization strings
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')

  return msg
}

/**
 * Determine the root directory for score history storage.
 * @returns {string} Directory path
 */
export function getHistoryDir() {
  if (process.env.SCORE_HISTORY_DIR) {
    return path.resolve(process.env.SCORE_HISTORY_DIR)
  }
  if (process.env.VERCEL === '1') {
    return path.join('/tmp', 'arsenic-history')
  }
  return path.resolve(__dirname, '../data/history')
}

/**
 * Ensure the history storage directory exists.
 */
function ensureHistoryDirSync() {
  try {
    const dir = getHistoryDir()
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true })
    }
  } catch (err) {
    console.warn('[Score History] Notice: Could not create directory, using in-memory store:', err?.message || err)
  }
}

/**
 * Get and validate the JSON file path for a specific GitHub user.
 * Prevents path traversal outside of the configured history directory.
 * @param {string} username
 * @returns {string} Absolute path to the user's history JSON file
 */
export function getUserFilePath(username) {
  const normalized = String(username || '').replace(/^@/, '').trim()
  if (!isValidGitHubUsername(normalized)) {
    throw new Error(`Invalid GitHub username: ${username}`)
  }

  const baseDir = path.resolve(getHistoryDir())
  const safeName = encodeURIComponent(normalized.toLowerCase())
  const resolvedPath = path.resolve(baseDir, `${safeName}.json`)

  // Security: strict path traversal boundary check
  if (!resolvedPath.startsWith(baseDir + path.sep)) {
    throw new Error(`Path traversal detected for username: ${username}`)
  }

  return resolvedPath
}

/**
 * Atomically write data to a file using a unique temporary file followed by rename.
 * Automatically cleans up temporary files if writing or renaming fails.
 * @param {string} filePath
 * @param {string} content
 */
export async function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath)
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
  }

  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${randomSuffix}.tmp`)

  try {
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, filePath)
  } catch (err) {
    try {
      await fs.unlink(tempPath)
    } catch {
      // Ignore cleanup error if temp file does not exist
    }
    throw err
  }
}

/**
 * Execute a command against Upstash Redis REST API.
 * Uses native fetch with timeout, error handling, and token redaction.
 * @param {string} command
 * @param {unknown[]} args
 * @param {{ url: string, token: string }} config
 * @returns {Promise<unknown>}
 */
export async function executeRedisCommand(command, args, config) {
  const endpoint = config.url
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json'
  }

  const body = JSON.stringify([command, ...args])

  let res
  let timerId
  try {
    let signal
    if (typeof globalThis.AbortSignal !== 'undefined' && typeof globalThis.AbortSignal.timeout === 'function') {
      signal = globalThis.AbortSignal.timeout(4000)
    } else if (typeof globalThis.AbortController !== 'undefined') {
      const controller = new globalThis.AbortController()
      timerId = setTimeout(() => controller.abort(), 4000)
      signal = controller.signal
    }

    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      signal
    })
  } catch (netErr) {
    throw new Error(`Redis network failure on ${command}: ${sanitizeError(netErr, config.token)}`)
  } finally {
    if (timerId) {
      clearTimeout(timerId)
    }
  }

  if (!res.ok) {
    let errBody = ''
    try {
      errBody = await res.text()
    } catch {
      // ignore
    }
    throw new Error(`Redis HTTP error ${res.status} on ${command}: ${sanitizeError(errBody, config.token)}`)
  }

  let data
  try {
    data = await res.json()
  } catch (jsonErr) {
    throw new Error(`Redis malformed JSON on ${command}: ${sanitizeError(jsonErr, config.token)}`)
  }

  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(`Redis error on ${command}: ${sanitizeError(data.error, config.token)}`)
  }

  return data?.result
}

/**
 * Isolated Redis key for a developer's score history.
 * @param {string} username
 * @returns {string}
 */
export function getRedisKey(username) {
  return `arsenic:history:${username.toLowerCase().trim()}`
}

/**
 * Lua script for atomic read-modify-write in Redis.
 * Evaluates same-day de-duplication, updates, chronological sorting, and capping at 90 snapshots.
 */
const LUA_ATOMIC_RECORD = `
local key = KEYS[1]
local new_snapshot_json = ARGV[1]
local target_date = ARGV[2]
local new_score = tonumber(ARGV[3])
local max_snapshots = 90

local raw = redis.call('GET', key)
local snapshots = {}
if raw and type(raw) == 'string' and #raw > 0 then
  local ok, parsed = pcall(cjson.decode, raw)
  if ok and type(parsed) == 'table' then
    snapshots = parsed
  end
end

local existing_idx = nil
for i, s in ipairs(snapshots) do
  if s.date == target_date then
    existing_idx = i
    break
  end
end

local new_snap = cjson.decode(new_snapshot_json)

if existing_idx then
  local existing = snapshots[existing_idx]
  local same_score = (existing.score == new_score)
  local same_b = true
  if existing.breakdown and new_snap.breakdown then
    if existing.breakdown.consistency ~= new_snap.breakdown.consistency or
       existing.breakdown.collaboration ~= new_snap.breakdown.collaboration or
       existing.breakdown.impact ~= new_snap.breakdown.impact then
      same_b = false
    end
  elseif existing.breakdown or new_snap.breakdown then
    same_b = false
  end

  if same_score and same_b then
    return cjson.encode(snapshots)
  else
    snapshots[existing_idx] = new_snap
  end
else
  table.insert(snapshots, new_snap)
end

table.sort(snapshots, function(a, b) return a.date < b.date end)

if #snapshots > max_snapshots then
  local trimmed = {}
  for i = #snapshots - max_snapshots + 1, #snapshots do
    table.insert(trimmed, snapshots[i])
  end
  snapshots = trimmed
end

local serialized = cjson.encode(snapshots)
redis.call('SET', key, serialized)
return serialized
`

/**
 * Read user score history from Upstash Redis.
 * @param {string} username
 * @param {{ url: string, token: string }} config
 * @returns {Promise<import('../shared/history.js').ScoreSnapshot[]>}
 */
async function readHistoryFromRedis(username, config) {
  const key = getRedisKey(username)
  const result = await executeRedisCommand('GET', [key], config)

  if (!result) {
    return []
  }

  if (typeof result === 'string') {
    const parsed = JSON.parse(result)
    return Array.isArray(parsed) ? parsed : []
  }

  if (Array.isArray(result)) {
    return result
  }

  return []
}

/**
 * Record score snapshot in Upstash Redis atomically.
 * @param {string} username
 * @param {import('../shared/history.js').ScoreSnapshot} newSnapshot
 * @param {number} score
 * @param {string} targetDate
 * @param {{ url: string, token: string }} config
 * @returns {Promise<import('../shared/history.js').ScoreSnapshot[]>}
 */
async function recordSnapshotInRedis(username, newSnapshot, score, targetDate, config) {
  const key = getRedisKey(username)

  // Try atomic Lua script first
  try {
    const result = await executeRedisCommand(
      'EVAL',
      [LUA_ATOMIC_RECORD, '1', key, JSON.stringify(newSnapshot), targetDate, String(score)],
      config
    )
    if (typeof result === 'string') {
      const parsed = JSON.parse(result)
      if (Array.isArray(parsed)) return parsed
    } else if (Array.isArray(result)) {
      return result
    }
  } catch (luaErr) {
    // If EVAL is unsupported in a mock or restricted tier, fall back to GET + SET
    console.warn('[Score History] Redis EVAL fallback to GET/SET:', sanitizeError(luaErr, config.token))
  }

  // Fallback GET + SET
  const existing = await readHistoryFromRedis(username, config)
  const eligibility = evaluateSnapshotEligibility(existing, score, newSnapshot.breakdown, targetDate)

  if (!eligibility.shouldRecord) {
    return existing
  }

  let updated
  if (eligibility.isUpdate && eligibility.index >= 0) {
    updated = [...existing]
    updated[eligibility.index] = newSnapshot
  } else {
    updated = [...existing, newSnapshot]
  }

  if (updated.length > 90) {
    updated = updated.slice(-90)
  }

  await executeRedisCommand('SET', [key, JSON.stringify(updated)], config)
  return updated
}

/**
 * Read the historical score snapshots for a developer.
 * @param {string} username
 * @returns {Promise<import('../shared/history.js').HistorySummary>}
 */
export async function readUserHistory(username) {
  const normalized = String(username || '').replace(/^@/, '').trim()
  if (!isValidGitHubUsername(normalized)) {
    return computeScoreTrend([], normalized)
  }

  const key = normalized.toLowerCase()
  const mode = getStorageMode()

  if (mode === 'redis') {
    const config = resolveRedisConfig()
    if (config) {
      try {
        const snapshots = await readHistoryFromRedis(normalized, config)
        historyMemoryCache.set(key, snapshots)
        return computeScoreTrend(snapshots, normalized, { durable: true })
      } catch (err) {
        console.error('[Score History] Redis read failure:', sanitizeError(err, config.token))
        const cached = historyMemoryCache.get(key) || []
        return computeScoreTrend(cached, normalized, {
          durable: false,
          warning: 'Persistent storage temporarily unavailable'
        })
      }
    }
  }

  if (mode === 'ephemeral-warning') {
    console.warn(
      '[Score History Warning] Persistent Upstash Redis is not configured. Running in ephemeral serverless storage; score history will not persist across container cold starts.'
    )

    let snapshots = historyMemoryCache.get(key) || []
    if (snapshots.length === 0) {
      try {
        const filePath = getUserFilePath(normalized)
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed?.snapshots)) {
          snapshots = parsed.snapshots
          historyMemoryCache.set(key, snapshots)
        }
      } catch {
        // Ephemeral read error or missing
      }
    }

    return computeScoreTrend(snapshots, normalized, {
      durable: false,
      warning:
        'Score history is currently running in ephemeral serverless storage. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for durable cross-instance persistence.'
    })
  }

  // Local file mode
  if (historyMemoryCache.has(key)) {
    return computeScoreTrend(historyMemoryCache.get(key), normalized, { durable: true })
  }

  try {
    const filePath = getUserFilePath(normalized)
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    const snapshots = Array.isArray(parsed?.snapshots) ? parsed.snapshots : []
    historyMemoryCache.set(key, snapshots)
    return computeScoreTrend(snapshots, normalized, { durable: true })
  } catch {
    return computeScoreTrend([], normalized, { durable: true })
  }
}

/**
 * Record a new score snapshot for a developer, respecting daily de-duplication.
 * Concurrency-safe per user via withUserLock.
 * @param {string} username
 * @param {object} scoreData
 * @param {number} scoreData.score
 * @param {object} [scoreData.breakdown]
 * @param {string} [targetDate]
 * @returns {Promise<import('../shared/history.js').HistorySummary>}
 */
export async function recordScoreSnapshot(username, scoreData, targetDate) {
  const normalized = String(username || '').replace(/^@/, '').trim()
  if (!isValidGitHubUsername(normalized) || !scoreData || typeof scoreData.score !== 'number') {
    return computeScoreTrend([], normalized)
  }

  return withUserLock(normalized, async () => {
    const key = normalized.toLowerCase()
    const mode = getStorageMode()
    const safeDate = typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(targetDate)
      ? targetDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const newSnapshot = createScoreSnapshot({
      score: scoreData.score,
      breakdown: scoreData.breakdown,
      date: safeDate
    })

    if (mode === 'redis') {
      const config = resolveRedisConfig()
      if (config) {
        try {
          const updated = await recordSnapshotInRedis(normalized, newSnapshot, scoreData.score, safeDate, config)
          historyMemoryCache.set(key, updated)
          return computeScoreTrend(updated, normalized, { durable: true })
        } catch (err) {
          console.error('[Score History] Redis write failure:', sanitizeError(err, config.token))
          // Keep in-memory cache updated for current session, but mark as non-durable with observable warning
          const current = historyMemoryCache.get(key) || []
          const eligibility = evaluateSnapshotEligibility(current, scoreData.score, scoreData.breakdown, safeDate)
          let fallbackUpdated = current
          if (eligibility.shouldRecord) {
            fallbackUpdated = eligibility.isUpdate && eligibility.index >= 0
              ? current.map((s, idx) => (idx === eligibility.index ? newSnapshot : s))
              : [...current, newSnapshot]
          }
          historyMemoryCache.set(key, fallbackUpdated)
          return computeScoreTrend(fallbackUpdated, normalized, {
            durable: false,
            warning: 'Persistent storage write failed'
          })
        }
      }
    }

    if (mode === 'ephemeral-warning') {
      console.warn(
        '[Score History Warning] Persistent Upstash Redis is not configured. Recording score history ephemerally.'
      )

      let current = historyMemoryCache.get(key) || []
      const eligibility = evaluateSnapshotEligibility(current, scoreData.score, scoreData.breakdown, safeDate)
      let updated = current

      if (eligibility.shouldRecord) {
        if (eligibility.isUpdate && eligibility.index >= 0) {
          updated = [...current]
          updated[eligibility.index] = newSnapshot
        } else {
          updated = [...current, newSnapshot]
        }
        if (updated.length > 90) {
          updated = updated.slice(-90)
        }
        historyMemoryCache.set(key, updated)

        // Best effort write to /tmp
        try {
          ensureHistoryDirSync()
          const filePath = getUserFilePath(normalized)
          const payload = JSON.stringify({ username: normalized, snapshots: updated }, null, 2)
          await atomicWriteFile(filePath, payload)
        } catch (fileErr) {
          console.warn('[Score History] Ephemeral filesystem write notice:', fileErr?.message || fileErr)
        }
      }

      return computeScoreTrend(updated, normalized, {
        durable: false,
        warning:
          'Score history is currently running in ephemeral serverless storage. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for durable cross-instance persistence.'
      })
    }

    // Local file mode
    let currentSnapshots = []
    if (historyMemoryCache.has(key)) {
      currentSnapshots = [...historyMemoryCache.get(key)]
    } else {
      try {
        const filePath = getUserFilePath(normalized)
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed?.snapshots)) {
          currentSnapshots = [...parsed.snapshots]
        }
      } catch {
        currentSnapshots = []
      }
    }

    const eligibility = evaluateSnapshotEligibility(
      currentSnapshots,
      scoreData.score,
      scoreData.breakdown || {},
      safeDate
    )

    if (!eligibility.shouldRecord) {
      return computeScoreTrend(currentSnapshots, normalized, { durable: true })
    }

    let updatedSnapshots
    if (eligibility.isUpdate && eligibility.index >= 0) {
      updatedSnapshots = [...currentSnapshots]
      updatedSnapshots[eligibility.index] = newSnapshot
    } else {
      updatedSnapshots = [...currentSnapshots, newSnapshot]
    }

    if (updatedSnapshots.length > 90) {
      updatedSnapshots = updatedSnapshots.slice(-90)
    }

    historyMemoryCache.set(key, updatedSnapshots)

    try {
      ensureHistoryDirSync()
      const filePath = getUserFilePath(normalized)
      const payload = JSON.stringify({ username: normalized, snapshots: updatedSnapshots }, null, 2)
      await atomicWriteFile(filePath, payload)
    } catch (err) {
      console.warn('[Score History] Warning: Could not write snapshot to disk:', err?.message || err)
    }

    return computeScoreTrend(updatedSnapshots, normalized, { durable: true })
  })
}

/**
 * Clear history for a specific user (useful for test resets).
 * @param {string} username
 */
export async function clearUserHistory(username) {
  const normalized = String(username || '').replace(/^@/, '').trim().toLowerCase()
  historyMemoryCache.delete(normalized)

  const config = resolveRedisConfig()
  if (config) {
    try {
      await executeRedisCommand('DEL', [getRedisKey(normalized)], config)
    } catch {
      // Ignore cleanup error
    }
  }

  try {
    const filePath = getUserFilePath(normalized)
    await fs.unlink(filePath)
  } catch {
    // Ignore error if file did not exist
  }
}

/**
 * Clear all in-memory history cache.
 */
export function clearAllMemoryHistory() {
  historyMemoryCache.clear()
}
