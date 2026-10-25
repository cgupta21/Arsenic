import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
// @ts-expect-error – server/index.js is plain JS
import app from '../server/index.js'
import {
  createScoreSnapshot,
  evaluateSnapshotEligibility,
  computeScoreTrend,
  type ScoreSnapshot
} from '../shared/history.js'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import {
  readUserHistory,
  recordScoreSnapshot,
  clearUserHistory,
  clearAllMemoryHistory,
  atomicWriteFile,
  getUserFilePath,
  getHistoryDir,
  resolveRedisConfig,
  getStorageMode,
  sanitizeError,
  getRedisKey,
  executeRedisCommand,
  withUserLock
} from '../server/historyStore.js'

afterEach(() => {
  vi.restoreAllMocks()
  clearAllMemoryHistory()
})

const nativeFetch = global.fetch

function inProcessFetch(
  pathStr: string
): Promise<{ status: number; json: () => Record<string, unknown>; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${pathStr}`
      nativeFetch(url)
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key] = value
          })
          resolve({
            status: r.status,
            json: () => {
              try {
                return JSON.parse(text) as Record<string, unknown>
              } catch {
                return { rawText: text }
              }
            },
            headers: hdrs
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

describe('Phase 2: Score History', () => {
  describe('1. Shared History Model & Calculations', () => {
    it('creates score snapshot with valid bounds and health metadata', () => {
      const snap = createScoreSnapshot({
        score: 88,
        breakdown: { consistency: 90, collaboration: 85, impact: 88 },
        date: '2026-10-25'
      })

      expect(snap.score).toBe(88)
      expect(snap.grade).toBe('Excellent Health')
      expect(snap.color).toBe('#58A65C')
      expect(snap.date).toBe('2026-10-25')
      expect(snap.breakdown).toEqual({ consistency: 90, collaboration: 85, impact: 88 })
    })

    it('clamps negative or out-of-range scores safely', () => {
      const low = createScoreSnapshot({ score: -10 })
      expect(low.score).toBe(0)
      expect(low.grade).toBe('Low Activity')

      const high = createScoreSnapshot({ score: 120 })
      expect(high.score).toBe(100)
      expect(high.grade).toBe('Excellent Health')
    })

    it('evaluates snapshot eligibility: allows new date, prevents duplicate on same date', () => {
      const existing: ScoreSnapshot[] = [
        createScoreSnapshot({
          score: 75,
          breakdown: { consistency: 70, collaboration: 80, impact: 75 },
          date: '2026-10-20'
        })
      ]

      // Different day -> should record
      const diffDay = evaluateSnapshotEligibility(existing, 75, { consistency: 70, collaboration: 80, impact: 75 }, '2026-10-21')
      expect(diffDay.shouldRecord).toBe(true)
      expect(diffDay.isUpdate).toBe(false)

      // Same day, exact same score & breakdown -> should NOT record (de-duplication)
      const sameDayDuplicate = evaluateSnapshotEligibility(existing, 75, { consistency: 70, collaboration: 80, impact: 75 }, '2026-10-20')
      expect(sameDayDuplicate.shouldRecord).toBe(false)

      // Same day, score changed -> should update
      const sameDayScoreChange = evaluateSnapshotEligibility(existing, 82, { consistency: 80, collaboration: 85, impact: 80 }, '2026-10-20')
      expect(sameDayScoreChange.shouldRecord).toBe(true)
      expect(sameDayScoreChange.isUpdate).toBe(true)
      expect(sameDayScoreChange.index).toBe(0)
    })

    it('computes trend and score delta accurately across chronological snapshots', () => {
      // Empty snapshots
      const empty = computeScoreTrend([], 'testuser')
      expect(empty.currentScore).toBeNull()
      expect(empty.previousScore).toBeNull()
      expect(empty.scoreChange).toBeNull()
      expect(empty.trend).toBe('none')

      // Single snapshot baseline
      const s1 = createScoreSnapshot({ score: 70, date: '2026-10-20' })
      const single = computeScoreTrend([s1], 'testuser')
      expect(single.currentScore).toBe(70)
      expect(single.previousScore).toBeNull()
      expect(single.scoreChange).toBeNull()
      expect(single.trend).toBe('none')

      // Two snapshots: upward trend
      const s2 = createScoreSnapshot({ score: 85, date: '2026-10-21' })
      const up = computeScoreTrend([s1, s2], 'testuser')
      expect(up.currentScore).toBe(85)
      expect(up.previousScore).toBe(70)
      expect(up.scoreChange).toBe(15)
      expect(up.trend).toBe('up')

      // Downward trend
      const s3 = createScoreSnapshot({ score: 62, date: '2026-10-22' })
      const down = computeScoreTrend([s1, s2, s3], 'testuser')
      expect(down.currentScore).toBe(62)
      expect(down.previousScore).toBe(85)
      expect(down.scoreChange).toBe(-23)
      expect(down.trend).toBe('down')

      // Neutral (unchanged) trend
      const s4 = createScoreSnapshot({ score: 62, date: '2026-10-23' })
      const neutral = computeScoreTrend([s1, s2, s3, s4], 'testuser')
      expect(neutral.currentScore).toBe(62)
      expect(neutral.previousScore).toBe(62)
      expect(neutral.scoreChange).toBe(0)
      expect(neutral.trend).toBe('neutral')
    })
  })

  describe('2. Server History Store & Persistence', () => {
    const testUser = 'historytester99'

    beforeEach(async () => {
      await clearUserHistory(testUser)
    })

    afterEach(async () => {
      await clearUserHistory(testUser)
    })

    it('returns empty history for fresh user without errors', async () => {
      const history = await readUserHistory(testUser)
      expect(history.snapshots).toEqual([])
      expect(history.currentScore).toBeNull()
      expect(history.previousScore).toBeNull()
      expect(history.scoreChange).toBeNull()
      expect(history.trend).toBe('none')
    })

    it('records and retrieves score snapshots', async () => {
      await recordScoreSnapshot(
        testUser,
        { score: 65, breakdown: { consistency: 60, collaboration: 70, impact: 65 } },
        '2026-10-20'
      )

      const history = await readUserHistory(testUser)
      expect(history.snapshots.length).toBe(1)
      expect(history.currentScore).toBe(65)
      expect(history.snapshots[0].date).toBe('2026-10-20')
      expect(history.snapshots[0].grade).toBe('Moderate Health')
    })

    it('prevents duplicate snapshots on the same day when score is unchanged', async () => {
      await recordScoreSnapshot(
        testUser,
        { score: 70, breakdown: { consistency: 70, collaboration: 70, impact: 70 } },
        '2026-10-21'
      )

      // Second call on identical day & score
      await recordScoreSnapshot(
        testUser,
        { score: 70, breakdown: { consistency: 70, collaboration: 70, impact: 70 } },
        '2026-10-21'
      )

      const history = await readUserHistory(testUser)
      expect(history.snapshots.length).toBe(1)
    })

    it('updates snapshot when score changes on the same day', async () => {
      await recordScoreSnapshot(
        testUser,
        { score: 70, breakdown: { consistency: 70, collaboration: 70, impact: 70 } },
        '2026-10-22'
      )

      await recordScoreSnapshot(
        testUser,
        { score: 85, breakdown: { consistency: 85, collaboration: 85, impact: 85 } },
        '2026-10-22'
      )

      const history = await readUserHistory(testUser)
      expect(history.snapshots.length).toBe(1)
      expect(history.currentScore).toBe(85)
      expect(history.snapshots[0].grade).toBe('Excellent Health')
    })

    it('appends snapshots across different dates and calculates trend', async () => {
      await recordScoreSnapshot(testUser, { score: 60 }, '2026-10-20')
      await recordScoreSnapshot(testUser, { score: 75 }, '2026-10-21')
      await recordScoreSnapshot(testUser, { score: 82 }, '2026-10-22')

      const history = await readUserHistory(testUser)
      expect(history.snapshots.length).toBe(3)
      expect(history.currentScore).toBe(82)
      expect(history.previousScore).toBe(75)
      expect(history.scoreChange).toBe(7)
      expect(history.trend).toBe('up')
    })
  })

  describe('3. GET /api/history/:username Endpoint', () => {
    it('rejects invalid GitHub username with 400 and invalidInput flag', async () => {
      const res = await inProcessFetch('/api/history/invalid--user')
      expect(res.status).toBe(400)
      const body = res.json()
      expect(body.invalidInput).toBe(true)
      expect(body.error).toContain('Invalid GitHub username')
    })

    it('returns 200 and graceful empty history for fresh user', async () => {
      const res = await inProcessFetch('/api/history/brandnewuser999')
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body.username).toBe('brandnewuser999')
      expect(body.snapshots).toEqual([])
      expect(body.currentScore).toBeNull()
      expect(body.trend).toBe('none')
    })

    it('returns recorded snapshots via endpoint', async () => {
      const user = 'endpointtester'
      await clearUserHistory(user)
      await recordScoreSnapshot(user, { score: 72 }, '2026-10-24')

      const res = await inProcessFetch(`/api/history/${user}`)
      expect(res.status).toBe(200)
      const body = res.json()
      expect(body.username).toBe(user)
      expect(body.currentScore).toBe(72)
      expect(Array.isArray(body.snapshots)).toBe(true)
      expect((body.snapshots as ScoreSnapshot[])[0].score).toBe(72)

      await clearUserHistory(user)
    })
  })

  describe('4. Dashboard Integration', () => {
    it('returns history object directly in /api/dashboard/:username payload', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        if (urlStr.includes('graphql')) {
          return new Response(JSON.stringify({
            data: {
              user: {
                login: 'histdashuser',
                name: 'Hist Dash User',
                avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
                bio: 'Bio',
                url: 'https://github.com/histdashuser',
                location: null,
                websiteUrl: null,
                createdAt: '2026-01-01T00:00:00Z',
                followers: { totalCount: 0 },
                following: { totalCount: 0 },
                repositories: {
                  totalCount: 0,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: []
                },
                contributionsCollection: {
                  totalCommitContributions: 0,
                  totalPullRequestContributions: 0,
                  totalIssueContributions: 0,
                  totalPullRequestReviewContributions: 0,
                  restrictedContributionsCount: 0,
                  contributionCalendar: {
                    totalContributions: 0,
                    weeks: []
                  }
                }
              },
              rateLimit: { limit: 5000, remaining: 4999, used: 1, resetAt: '2026-10-25T15:00:00Z', cost: 1 }
            }
          }), { headers: { 'Content-Type': 'application/json' } })
        }
        if (urlStr.includes('/users/histdashuser/repos')) {
          return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })
        }
        if (urlStr.includes('/users/histdashuser/events/public')) {
          return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })
        }
        if (urlStr.includes('/users/histdashuser')) {
          return new Response(JSON.stringify({
            login: 'histdashuser',
            public_repos: 0,
            followers: 0,
            following: 0,
          }), { headers: { 'Content-Type': 'application/json' } })
        }
        return nativeFetch(input, init)
      })

      const res = await inProcessFetch('/api/dashboard/histdashuser')
      expect(res.status).toBe(200)
      const body = res.json() as {
        history: { username: string; snapshots: ScoreSnapshot[]; currentScore: number }
        score: { score: number }
      }
      expect(body.history).toBeDefined()
      expect(body.history.username).toBe('histdashuser')
      expect(Array.isArray(body.history.snapshots)).toBe(true)
      expect(body.history.currentScore).toBe(body.score.score)

      await clearUserHistory('histdashuser')
    })
  })

  describe('5. File Storage Hardening & Atomic Safety', () => {
    const testDir = getHistoryDir()

    it('atomicWriteFile writes data correctly and target file exists', async () => {
      const target = path.join(testDir, 'atomic-test.json')
      await atomicWriteFile(target, JSON.stringify({ hello: 'world' }))
      const content = await fsPromises.readFile(target, 'utf-8')
      expect(JSON.parse(content)).toEqual({ hello: 'world' })
      await fsPromises.unlink(target).catch(() => {})
    })

    it('atomicWriteFile cleans up temporary file on rename failure', async () => {
      const target = path.join(testDir, 'atomic-fail-test.json')
      const renameSpy = vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('Simulated rename failure'))

      await expect(atomicWriteFile(target, 'test-data')).rejects.toThrow('Simulated rename failure')
      renameSpy.mockRestore()

      // Confirm no .tmp files were left behind in the directory
      const files = await fsPromises.readdir(testDir)
      const orphanTmp = files.filter((f) => f.includes('atomic-fail-test') && f.endsWith('.tmp'))
      expect(orphanTmp).toHaveLength(0)
    })

    it('getUserFilePath rejects path traversal attempts', () => {
      expect(() => getUserFilePath('../evil')).toThrow(/Invalid GitHub username/)
      expect(() => getUserFilePath('evil/user')).toThrow(/Invalid GitHub username/)
      expect(() => getUserFilePath('..\\evil')).toThrow(/Invalid GitHub username/)
      expect(() => getUserFilePath('.')).toThrow(/Invalid GitHub username/)
    })

    it('getUserFilePath returns absolute path strictly within configured directory', () => {
      const filePath = getUserFilePath('legit-user')
      expect(filePath.startsWith(testDir)).toBe(true)
      expect(filePath.endsWith('legit-user.json')).toBe(true)
    })

    it('handles concurrent writes for the same user safely using withUserLock', async () => {
      const user = 'concurrentuser'
      await clearUserHistory(user)

      // Launch 5 concurrent writes on different simulated days
      const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']
      await Promise.all(
        dates.map((d, idx) =>
          recordScoreSnapshot(user, { score: 60 + idx * 5 }, d)
        )
      )

      const history = await readUserHistory(user)
      expect(history.snapshots).toHaveLength(5)
      expect(history.snapshots.map((s) => s.date).sort()).toEqual(dates)

      await clearUserHistory(user)
    })
  })

  describe('6. Upstash Redis REST Support & Isolation', () => {
    it('resolves Redis configuration with UPSTASH credentials', () => {
      const conf = resolveRedisConfig({
        UPSTASH_REDIS_REST_URL: 'https://test-db.upstash.io/',
        UPSTASH_REDIS_REST_TOKEN: 'secret_upstash_token'
      })
      expect(conf).toEqual({
        url: 'https://test-db.upstash.io',
        token: 'secret_upstash_token'
      })
    })

    it('resolves Redis configuration with KV compatible fallback', () => {
      const conf = resolveRedisConfig({
        KV_REST_API_URL: 'https://kv-db.vercel-storage.com',
        KV_REST_API_TOKEN: 'secret_kv_token'
      })
      expect(conf).toEqual({
        url: 'https://kv-db.vercel-storage.com',
        token: 'secret_kv_token'
      })
    })

    it('returns null when credentials are missing or incomplete', () => {
      expect(resolveRedisConfig({})).toBeNull()
      expect(resolveRedisConfig({ UPSTASH_REDIS_REST_URL: 'https://test.upstash.io' })).toBeNull()
      expect(resolveRedisConfig({ UPSTASH_REDIS_REST_TOKEN: 'token-only' })).toBeNull()
    })

    it('isolates Redis keys by lowercase username', () => {
      expect(getRedisKey('Alice')).toBe('arsenic:history:alice')
      expect(getRedisKey('Bob-Developer')).toBe('arsenic:history:bob-developer')
      expect(getRedisKey('  Charlie  ')).toBe('arsenic:history:charlie')
    })

    it('redacts tokens and Bearer headers in sanitizeError', () => {
      const token = 'upstash-secret-token-xyz'
      const err = `Failed to connect with Bearer ${token} to endpoint`
      const sanitized = sanitizeError(err, token)
      expect(sanitized).not.toContain(token)
      expect(sanitized).toContain('[REDACTED]')
    })

    it('executes Redis command and parses result correctly with mock fetch', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'PONG' }), { status: 200 })
      )

      const result = await executeRedisCommand('PING', [], {
        url: 'https://mock.upstash.io',
        token: 'mock-token'
      })
      expect(result).toBe('PONG')
    })

    it('handles Redis HTTP 500 error gracefully without leaking token', async () => {
      const token = 'super-secret-token-123'
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(`Internal error with token ${token}`, { status: 500 })
      )

      await expect(
        executeRedisCommand('GET', ['key'], { url: 'https://mock.upstash.io', token })
      ).rejects.toThrow(/Redis HTTP error 500/)
    })

    it('records and reads snapshot using Redis mode via mock', async () => {
      const originalEnv = { ...process.env }
      process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token'

      let storedData: string | null = null
      vi.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
        const body = JSON.parse(String(init?.body || '[]')) as [string, ...unknown[]]
        const cmd = body[0]

        if (cmd === 'EVAL') {
          const snap = JSON.parse(String(body[4])) as ScoreSnapshot
          storedData = JSON.stringify([snap])
          return new Response(JSON.stringify({ result: storedData }))
        }

        if (cmd === 'GET') {
          return new Response(JSON.stringify({ result: storedData }))
        }

        if (cmd === 'DEL') {
          storedData = null
          return new Response(JSON.stringify({ result: 1 }))
        }

        return new Response(JSON.stringify({ result: null }))
      })

      const redisUser = 'redisuser'
      const recorded = await recordScoreSnapshot(redisUser, { score: 75 }, '2026-10-25')
      expect(recorded.durable).toBe(true)
      expect(recorded.snapshots).toHaveLength(1)
      expect(recorded.currentScore).toBe(75)

      const fetched = await readUserHistory(redisUser)
      expect(fetched.durable).toBe(true)
      expect(fetched.snapshots).toHaveLength(1)
      expect(fetched.currentScore).toBe(75)

      await clearUserHistory(redisUser)
      process.env = originalEnv
    })

    it('falls back safely when Redis throws a network failure without fabricating data', async () => {
      const originalEnv = { ...process.env }
      process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token'

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection timed out'))

      const result = await readUserHistory('unreachableuser')
      expect(result.durable).toBe(false)
      expect(result.warning).toContain('Persistent storage temporarily unavailable')
      expect(result.snapshots).toEqual([])

      process.env = originalEnv
    })
  })

  describe('7. Storage Selection & Vercel Warning Mode', () => {
    it('selects file storage in local environment', () => {
      const mode = getStorageMode({})
      expect(mode).toBe('file')
    })

    it('selects redis storage when credentials are set', () => {
      const mode = getStorageMode({
        UPSTASH_REDIS_REST_URL: 'https://db.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'token'
      })
      expect(mode).toBe('redis')
    })

    it('selects ephemeral-warning on Vercel when Redis is not configured', () => {
      const mode = getStorageMode({ VERCEL: '1' })
      expect(mode).toBe('ephemeral-warning')
    })

    it('attaches operational warning on Vercel without persistent credentials', async () => {
      const originalEnv = { ...process.env }
      process.env.VERCEL = '1'
      delete process.env.UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_TOKEN
      delete process.env.KV_REST_API_URL
      delete process.env.KV_REST_API_TOKEN

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const history = await readUserHistory('vercelwarnuser')
      expect(history.durable).toBe(false)
      expect(history.warning).toContain('ephemeral serverless storage')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Score History Warning]'))

      process.env = originalEnv
    })
  })
})
