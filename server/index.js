import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { getIronSession } from 'iron-session'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fs from 'node:fs'
import { generateDeveloperSummary } from '../shared/summary.js'
import { isValidGitHubUsername, GITHUB_USERNAME_REGEX } from '../shared/validation.js'
import {
  validateMetricValue,
  assertTelemetryIntegrity,
  compareMetric,
  METRIC_REGISTRY
} from '../shared/intelligence.js'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const fallbackSessionSecret = 'arsenic-local-secret-change-me-32-chars!!'

function isPlaceholderSecret(secret) {
  if (!secret || typeof secret !== 'string') return true
  const trimmed = secret.trim()
  if (trimmed.length < 32) return true
  if (/^(change-this|change-me|placeholder|your-secret)/i.test(trimmed)) return true
  if (/change-this|change-me/i.test(trimmed)) return true
  if (trimmed === fallbackSessionSecret) return true
  return false
}

function resolveSessionSecret(env = process.env) {
  const isProduction =
    env.NODE_ENV === 'production' ||
    env.VERCEL_ENV === 'production' ||
    (env.VERCEL === '1' && env.NODE_ENV !== 'test' && env.NODE_ENV !== 'development')
  const rawSecret = env.SESSION_SECRET || ''
  if (isProduction) {
    if (isPlaceholderSecret(rawSecret)) {
      throw new Error(
        'SESSION_SECRET must be set to a secure, random string of at least 32 characters in production. Fallback secret is not permitted in production.'
      )
    }
    return rawSecret.trim()
  }
  return rawSecret.trim() || fallbackSessionSecret
}

const isProd =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  (process.env.VERCEL === '1' && process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development')
const sessionSecret = resolveSessionSecret(process.env)

const cookieSameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase()
const sessionOptions = {
  password: sessionSecret,
  cookieName: 'session',
  ttl: 7 * 24 * 60 * 60,
  cookieOptions: {
    httpOnly: true,
    sameSite: cookieSameSite === 'none' ? 'none' : 'lax',
    secure: cookieSameSite === 'none' ? true : isProd
  }
};


const app = express()
// Render, Railway, Fly etc. terminate TLS in a proxy. Without this, secure cookies are dropped
// and the rate limiter sees every visitor as the same IP.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1))
const PORT = Number(process.env.PORT || 5000)
const TTL = Math.max(60, Number(process.env.CACHE_TTL_SECONDS || 600)) * 1000
const defaultToken = process.env.GITHUB_TOKEN?.trim() || ''
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const cache = new Map()
const inflight = new Map()

const corsOptions = {
  origin(origin, callback) {
    if (!origin || clientOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed by CORS'))
  },
  credentials: true
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://avatars.githubusercontent.com', 'https://lh3.googleusercontent.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'", 'https://github.com', 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false
  })
)
app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))
app.use(async (req, res, next) => {
  try {
    req.session = await getIronSession(req, res, sessionOptions);
    next();
  } catch (e) {
    console.error('Session initialization error:', e.name, e.message);
    res.status(500).json({ error: 'Session initialization failed.' });
  }
});

const isDebugMode = !isProd || process.env.DEBUG === 'true' || process.env.DEBUG === '1'

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests to Arsenic. Please slow down for a moment.' }
})
app.use('/api/', generalLimiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
})
app.use('/auth/', authLimiter)
app.use('/api/auth/', authLimiter)

/** CSRF Origin validation for state-changing requests */
function verifySameOriginOrAllowed(req, res, next) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return next()
  }
  const originHeader = req.get('origin')
  const refererHeader = req.get('referer')

  let refererOrigin = null
  if (refererHeader) {
    try {
      refererOrigin = new URL(refererHeader).origin
    } catch {
      return res.status(403).json({ error: 'Malformed Referer header on state-changing request.' })
    }
  }

  const origin = originHeader || refererOrigin
  if (!origin) {
    return res.status(403).json({ error: 'Missing Origin or Referer header on state-changing request.' })
  }
  if (clientOrigins.includes(origin)) {
    return next()
  }
  return res.status(403).json({ error: 'Forbidden cross-origin request.' })
}

// Deterministic summaries are local and free, but the endpoint is rate-limited to prevent abuse.
const summaryLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: Number(process.env.SUMMARY_LIMIT_PER_10_MIN || 5),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Summary limit reached. Please try again in a few minutes.' }
})
const SUMMARY_DAILY_CAP = Number(process.env.SUMMARY_DAILY_CAP || 200)
const summaryCache = new Map()

function setSummaryCache(key, summary) {
  const now = Date.now()
  if (summaryCache.size > 200) {
    for (const [k, v] of summaryCache) {
      if (v.expires <= now) summaryCache.delete(k)
    }
  }
  if (summaryCache.size > 200) {
    const oldestKey = summaryCache.keys().next().value
    if (oldestKey) summaryCache.delete(oldestKey)
  }
  summaryCache.set(key, { summary, expires: now + 60 * 60 * 1000 })
}

let summaryDay = new Date().toISOString().slice(0, 10)
let summaryCount = 0

const headersFor = (authToken) => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Arsenic-Developer-Intelligence'
  }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return headers
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function cacheKey(username, tierOrScope = 'public') {
  const normUser = String(username || '').toLowerCase()
  if (tierOrScope === true || tierOrScope === 'private') {
    return `v3:${normUser}::private`
  }
  if (tierOrScope === 'verified') {
    return `v3:${normUser}::verified`
  }
  if (tierOrScope === 'estimated') {
    return `v3:${normUser}::estimated`
  }
  return `v3:${normUser}::public`
}

async function cachedDashboard(key, producer, onStoreKey = null) {
  const existing = cache.get(key)
  if (existing && existing.expires > Date.now()) {
    // M-03 Cache Versioning: prevent legacy score-shaped cached payloads without intelligence or with legacy score from being returned
    if (existing.value && (!existing.value.intelligence || existing.value.score !== undefined)) {
      cache.delete(key)
    } else {
      const hit = clone(existing.value)
      if (hit.api) hit.api.cached = true
      return hit
    }
  }
  if (cache.size > 500) {
    for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k)
  }

  if (inflight.has(key)) return clone(await inflight.get(key))

  const promise = producer()
    .then((value) => {
      const storeKey = (typeof onStoreKey === 'function' ? onStoreKey(value) : null) || key
      cache.set(storeKey, { value: clone(value), expires: Date.now() + TTL })
      return value
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return clone(await promise)
}

function rateInfoFromResponse(response) {
  return {
    remaining: response.headers.get('x-ratelimit-remaining'),
    limit: response.headers.get('x-ratelimit-limit'),
    reset: response.headers.get('x-ratelimit-reset'),
    retryAfter: response.headers.get('retry-after')
  }
}

const GITHUB_REQUEST_TIMEOUT_MS = Number(process.env.GITHUB_FETCH_TIMEOUT_MS || 9000)

async function githubRest(pathname, authToken = defaultToken, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }
  try {
    const response = await fetch(`https://api.github.com${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...headersFor(authToken),
        ...(options.headers || {})
      }
    })
    clearTimeout(timeoutId)
    const rate = rateInfoFromResponse(response)
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }

    if (!response.ok) {
      const error = new Error(body?.message || `GitHub API returned ${response.status}`)
      error.status = response.status
      error.rate = rate
      error.body = body
      throw error
    }

    return { body, rate }
  } catch (caught) {
    clearTimeout(timeoutId)
    if (caught.name === 'AbortError' && !options.signal?.aborted) {
      const error = new Error(`GitHub request to ${pathname} timed out after ${GITHUB_REQUEST_TIMEOUT_MS / 1000}s.`)
      error.status = 504
      throw error
    }
    throw caught
  }
}

async function githubGraphQL(query, variables, authToken, options = {}) {
  if (!authToken) return null
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS)
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...headersFor(authToken),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    })
    clearTimeout(timeoutId)
    const rate = rateInfoFromResponse(response)
    const body = await response.json().catch(() => ({}))

    if (!response.ok || body.errors?.length) {
      const isUserNotFound = body.errors?.some((error) => error.type === 'NOT_FOUND' || error.message?.includes('Could not resolve to a User'))
      if (isUserNotFound) {
        const error = new Error(`GitHub user "${variables.login}" was not found.`)
        error.status = 404
        throw error
      }

      const message = body.errors?.map((error) => error.message).join('; ') || `GitHub GraphQL returned ${response.status}`
      const error = new Error(message)
      error.status = response.status || 400
      error.rate = rate
      error.body = body
      throw error
    }

    return { body: body.data, rate }
  } catch (caught) {
    clearTimeout(timeoutId)
    if (caught.name === 'AbortError' && !options.signal?.aborted) {
      const error = new Error(`GitHub GraphQL request timed out after ${GITHUB_REQUEST_TIMEOUT_MS / 1000}s.`)
      error.status = 504
      throw error
    }
    throw caught
  }
}

const dashboardQuery = `
query($login:String!,$from:DateTime!,$to:DateTime!,$cursor:String) {
  user(login:$login) {
    login
    name
    avatarUrl
    bio
    url
    location
    websiteUrl
    createdAt
    followers { totalCount }
    following { totalCount }
    repositories(first:100, after:$cursor, ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        url
        description
        stargazerCount
        forkCount
        updatedAt
        pushedAt
        isFork
        isArchived
        primaryLanguage { name color }
        issues(states:OPEN) { totalCount }
        languages(first:10, orderBy:{field:SIZE,direction:DESC}) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection(from:$from,to:$to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount contributionLevel weekday }
        }
      }
    }
  }
  rateLimit { limit remaining used resetAt cost }
}`

async function fetchPublicEvents(username, authToken) {
  try {
    const { body } = await githubRest(`/users/${encodeURIComponent(username)}/events/public?per_page=100`, authToken)
    return Array.isArray(body) ? body : []
  } catch {
    return []
  }
}

async function fetchGraphQLBundle(username, authToken) {
  const end = new Date()
  const start = new Date(end)
  start.setFullYear(end.getFullYear() - 1)
  const data = await githubGraphQL(dashboardQuery, {
    login: username,
    from: start.toISOString(),
    to: end.toISOString(),
    cursor: null
  }, authToken)

  if (!data?.body?.user) return null

  const first = data.body.user
  let nodes = first.repositories.nodes || []
  let pageInfo = first.repositories.pageInfo

  for (let page = 0; page < 2 && pageInfo?.hasNextPage; page += 1) {
    const next = await githubGraphQL(dashboardQuery, {
      login: username,
      from: start.toISOString(),
      to: end.toISOString(),
      cursor: pageInfo.endCursor
    }, authToken)
    const nextUser = next.body.user
    nodes = nodes.concat(nextUser.repositories.nodes || [])
    pageInfo = nextUser.repositories.pageInfo
  }

  return {
    user: {
      login: first.login,
      name: first.name,
      avatar_url: first.avatarUrl,
      bio: first.bio,
      html_url: first.url,
      public_repos: first.repositories.totalCount || nodes.length,
      followers: first.followers?.totalCount || 0,
      following: first.following?.totalCount || 0,
      created_at: first.createdAt || null,
      location: first.location || null,
      blog: first.websiteUrl || null
    },
    repos: nodes,
    events: await fetchPublicEvents(username, authToken),
    contributions: first.contributionsCollection,
    graphqlRate: data.body.rateLimit,
    totalRepoCount: first.repositories.totalCount
  }
}

// Without a token there is no GraphQL contribution calendar, so approximate one from the public
// events feed (GitHub only keeps roughly 90 days / 300 events). The UI labels this as estimated.
function contributionsFromEvents(events = [], options = {}) {
  const eventsUnavailable = Boolean(options.eventsUnavailable || events === null)
  const windowDays = 90
  const counts = new Map()
  let prs = 0
  let issues = 0
  let reviews = 0
  let oldestTimestamp = null

  const validEvents = Array.isArray(events) ? events : []

  if (!eventsUnavailable) {
    for (const event of validEvents) {
      const rawDate = event?.created_at
      if (!rawDate) continue
      const dateObj = new Date(rawDate)
      if (isNaN(dateObj.getTime())) continue

      const day = dateObj.toISOString().slice(0, 10)
      const time = dateObj.getTime()
      if (oldestTimestamp === null || time < oldestTimestamp) {
        oldestTimestamp = time
      }

      const weight = event.type === 'PushEvent' ? Math.max(1, event.payload?.commits?.length || event.payload?.size || 1) : 1
      counts.set(day, (counts.get(day) || 0) + weight)
      if (event.type === 'PullRequestEvent') prs += 1
      if (event.type === 'IssuesEvent') issues += 1
      if (event.type === 'PullRequestReviewEvent') reviews += 1
    }
  }

  const oldestEventDate = oldestTimestamp ? new Date(oldestTimestamp).toISOString().slice(0, 10) : null
  const today = new Date()
  const cutoffDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (windowDays - 1)))
  const cutoffIso = cutoffDate.toISOString().slice(0, 10)

  // If we fetched the maximum page capacity (e.g. 100 or 200 events) and the oldest event is newer than the 90-day cutoff,
  // then earlier days were not observed due to GitHub event pagination limits.
  const isTruncated = eventsUnavailable
    ? true
    : (options.collectionState ? (options.collectionState === 'limit_reached' || options.collectionState === 'incomplete') : ((validEvents.length === 100 || validEvents.length >= 200) && oldestEventDate !== null && oldestEventDate > cutoffIso))
  const collectionState = options.collectionState || (eventsUnavailable ? 'unavailable' : (isTruncated ? 'limit_reached' : 'complete'))

  const contributionDays = []
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset))
    const date = d.toISOString().slice(0, 10)
    const isObserved = !eventsUnavailable && (!isTruncated || !oldestEventDate || date >= oldestEventDate)
    contributionDays.push({
      date,
      contributionCount: counts.get(date) || 0,
      weekday: d.getUTCDay(),
      isObserved
    })
  }

  const observedDays = contributionDays.filter((d) => d.isObserved)
  const observedDaysCount = eventsUnavailable ? 0 : (observedDays.length || 1)
  const total = eventsUnavailable ? null : contributionDays.reduce((sum, day) => sum + day.contributionCount, 0)

  return {
    totalPullRequestContributions: eventsUnavailable ? null : prs,
    totalIssueContributions: eventsUnavailable ? null : issues,
    totalPullRequestReviewContributions: eventsUnavailable ? null : reviews,
    restrictedContributionsCount: 0,
    contributionCalendar: { totalContributions: total, weeks: [{ contributionDays }] },
    dataQuality: {
      observationWindowDays: windowDays,
      isEstimated: true,
      isTruncated,
      collectionState,
      eventsUnavailable,
      oldestEventDate,
      eventCount: validEvents.length,
      observedDaysCount
    }
  }
}

async function fetchPublicBundle(username, authToken) {
  const [userRes, reposRes, eventsRes] = await Promise.all([
    githubRest(`/users/${encodeURIComponent(username)}`, authToken),
    githubRest(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, authToken),
    githubRest(`/users/${encodeURIComponent(username)}/events/public?per_page=100`, authToken)
      .catch((err) => ({ body: null, rate: null, error: err }))
  ])

  const user = userRes.body
  const userRate = userRes.rate
  const repos = Array.isArray(reposRes.body) ? reposRes.body : []
  const reposRate = reposRes.rate
  const eventsFailed = eventsRes.body === null
  const events = Array.isArray(eventsRes.body) ? eventsRes.body : []
  const eventsRate = eventsRes.rate

  const pages = [repos]
  if (repos.length === 100) {
    try {
      const { body: next } = await githubRest(`/users/${encodeURIComponent(username)}/repos?per_page=100&page=2&sort=updated`, authToken)
      if (Array.isArray(next)) pages.push(next)
    } catch {
      // Page 2 failure is non-fatal
    }
  }

  const allRepos = pages.flat()
  const recentRepos = allRepos.filter((repo) => !repo.fork).slice(0, 250)

  // Bounded public events pagination (at most page 2, up to 200 events total)
  const allEvents = [...events]
  let collectionState = 'complete'
  if (eventsFailed) {
    collectionState = 'unavailable'
  } else {
    const ninetyDaysAgo = Date.now() - 90 * 86400000
    if (events.length < 100) {
      collectionState = 'complete'
    } else {
      const oldestP1 = events[events.length - 1]?.created_at
      const oldestP1Time = oldestP1 ? new Date(oldestP1).getTime() : 0
      if (!isNaN(oldestP1Time) && oldestP1Time <= ninetyDaysAgo) {
        collectionState = 'complete'
      } else {
        let p2Success = false
        try {
          const { body: nextEvents } = await githubRest(
            `/users/${encodeURIComponent(username)}/events/public?per_page=100&page=2`,
            authToken
          )
          if (Array.isArray(nextEvents)) {
            p2Success = true
            allEvents.push(...nextEvents)
            if (nextEvents.length < 100) {
              collectionState = 'complete'
            } else {
              const oldestP2 = nextEvents[nextEvents.length - 1]?.created_at
              const oldestP2Time = oldestP2 ? new Date(oldestP2).getTime() : 0
              if (!isNaN(oldestP2Time) && oldestP2Time <= ninetyDaysAgo) {
                collectionState = 'complete'
              } else {
                collectionState = 'limit_reached'
              }
            }
          }
        } catch {
          // Page 2 failure is non-fatal
        }
        if (!p2Success) {
          collectionState = 'incomplete'
        }
      }
    }
  }

  return {
    user,
    repos: recentRepos,
    events: eventsFailed ? [] : allEvents,
    contributions: contributionsFromEvents(eventsFailed ? null : allEvents, { eventsUnavailable: eventsFailed, collectionState }),
    estimated: true,
    graphqlRate: null,
    restRate: eventsRate?.remaining ?? reposRate?.remaining ?? userRate?.remaining ?? null,
    publicModeFallback: true,
    collectionState
  }
}

async function fetchCommitTiming(username, repos, authToken) {
  const candidates = repos
    .filter((repo) => repo.name && !repo.fork)
    .sort((a, b) => new Date(b.pushed_at || b.updated_at).getTime() - new Date(a.pushed_at || a.updated_at).getTime())
    .slice(0, 3)

  const timingPromise = Promise.all(candidates.map(async (repo) => {
    try {
      const { body } = await githubRest(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/commits?author=${encodeURIComponent(username)}&per_page=100`, authToken)
      return Array.isArray(body) ? body : []
    } catch {
      // Timing is a secondary feature; one inaccessible repository should not fail the dashboard.
      return []
    }
  }))

  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 3500))
  const results = await Promise.race([timingPromise, timeoutPromise])
  const commits = Array.isArray(results) ? results.flat() : []

  const hours = Array.from({ length: 24 }, () => 0)
  const weekdays = Array.from({ length: 7 }, () => 0)
  for (const item of commits) {
    const stamp = item?.commit?.author?.date
    if (!stamp) continue
    const d = new Date(stamp)
    if (Number.isNaN(d.getTime())) continue
    // GitHub returns UTC timestamps, so bucket in UTC rather than the server's local timezone.
    hours[d.getUTCHours()] += 1
    weekdays[d.getUTCDay()] += 1
  }
  return { commitsSampled: commits.length, hours, weekdays, timezone: 'UTC' }
}

function flattenCalendar(calendar) {
  return (calendar?.weeks || []).flatMap((week) => week?.contributionDays || [])
}

function getPreviousDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getNextDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function calculateStreaks(days, today) {
  if (!Array.isArray(days) || days.length === 0) {
    return { current: 0, longest: 0 }
  }

  const countByDate = new Map()
  for (const day of days) {
    if (!day || typeof day.date !== 'string') continue
    const date = day.date.slice(0, 10)
    countByDate.set(date, (countByDate.get(date) || 0) + (Number(day.contributionCount) || 0))
  }

  if (countByDate.size === 0) {
    return { current: 0, longest: 0 }
  }

  // Reference date defaults to server UTC date (YYYY-MM-DD). GitHub returns
  // contribution dates and commit timestamps in UTC, so the backend consistently evaluates
  // calendars against UTC today unless an explicit reference date is injected (e.g. in tests).
  let todayStr
  if (typeof today === 'string' && today.length >= 10) {
    todayStr = today.slice(0, 10)
  } else if (today instanceof Date && !Number.isNaN(today.getTime())) {
    todayStr = today.toISOString().slice(0, 10)
  } else {
    todayStr = new Date().toISOString().slice(0, 10)
  }

  const sortedDates = Array.from(countByDate.keys()).sort((a, b) => a.localeCompare(b))

  // Only consider dates up to the reference date so future-dated entries cannot anchor or inflate streaks
  const eligibleDates = sortedDates.filter((date) => date <= todayStr)

  let longest = 0
  let run = 0
  let prevDate = null

  for (const date of eligibleDates) {
    const count = countByDate.get(date) || 0
    if (count > 0) {
      if (prevDate && date === getNextDate(prevDate)) {
        run += 1
      } else {
        run = 1
      }
      if (run > longest) longest = run
    } else {
      run = 0
    }
    prevDate = date
  }

  const yesterdayStr = getPreviousDate(todayStr)
  const todayCount = countByDate.get(todayStr) || 0
  const yesterdayCount = countByDate.get(yesterdayStr) || 0

  let current = 0
  let startDate = null

  if (todayCount > 0) {
    startDate = todayStr
  } else if (yesterdayCount > 0) {
    startDate = yesterdayStr
  }

  if (startDate) {
    let curr = startDate
    while (countByDate.has(curr) && (countByDate.get(curr) || 0) > 0) {
      current += 1
      curr = getPreviousDate(curr)
    }
  }

  return { current, longest }
}


function aggregateLanguages(repos) {
  const map = new Map()
  for (const repo of repos) {
    const edges = repo.languages?.edges
    if (Array.isArray(edges) && edges.length) {
      for (const edge of edges) {
        const name = edge?.node?.name
        const size = Number(edge?.size || 0)
        if (!name || !size) continue
        map.set(name, {
          name,
          size: (map.get(name)?.size || 0) + size,
          color: edge.node.color || null
        })
      }
    } else if (repo.language) {
      const name = repo.language
      map.set(name, {
        name,
        size: (map.get(name)?.size || 0) + 1,
        color: null
      })
    } else if (repo.primaryLanguage?.name) {
      const name = repo.primaryLanguage.name
      map.set(name, {
        name,
        size: (map.get(name)?.size || 0) + 1,
        color: repo.primaryLanguage.color || null
      })
    }
  }
  const total = [...map.values()].reduce((sum, item) => sum + item.size, 0) || 1
  return [...map.values()]
    .sort((a, b) => b.size - a.size)
    .slice(0, 8)
    .map((item) => ({ ...item, pct: Math.round((item.size / total) * 100) }))
}

function normalizeRepo(repo) {
  return {
    id: repo.id,
    name: repo.name,
    html_url: repo.url || repo.html_url,
    description: repo.description,
    language: repo.primaryLanguage?.name || repo.language || null,
    languageColor: repo.primaryLanguage?.color || null,
    stargazers_count: repo.stargazerCount ?? repo.stargazers_count ?? 0,
    forks_count: repo.forkCount ?? repo.forks_count ?? 0,
    open_issues_count: repo.issues?.totalCount ?? repo.open_issues_count ?? 0,
    updated_at: repo.updatedAt || repo.updated_at,
    pushed_at: repo.pushedAt || repo.pushed_at,
    fork: repo.isFork ?? repo.fork ?? false,
    archived: Boolean(repo.isArchived ?? repo.archived ?? false),
    languages: repo.languages?.edges || []
  }
}

async function buildDashboard(username, authToken, includePrivate = false) {
  const normalized = username.replace(/^@/, '').trim()
  if (!isValidGitHubUsername(normalized)) {
    const error = new Error('Invalid GitHub username.')
    error.status = 400
    throw error
  }

  const requestedTier = includePrivate ? 'private' : (authToken ? 'verified' : 'estimated')
  const key = cacheKey(normalized, requestedTier)
  return cachedDashboard(key, async () => {
    let bundle = null
    if (authToken) {
      try {
        bundle = await fetchGraphQLBundle(normalized, authToken)
      } catch (err) {
        if (err.status === 404) throw err
        bundle = null
      }
    }
    if (!bundle) bundle = await fetchPublicBundle(normalized, authToken)
    if (!bundle) {
      const error = new Error(`GitHub user "${normalized}" was not found.`)
      error.status = 404
      throw error
    }

    const user = bundle.user
    const repos = (bundle.repos || []).map(normalizeRepo).filter((repo) => !repo.fork)
    const timing = await fetchCommitTiming(normalized, repos, authToken)
    const days = flattenCalendar(bundle.contributions?.contributionCalendar)
    const streaks = calculateStreaks(days)
    const languages = aggregateLanguages(bundle.repos || [])

    const isEstimated = Boolean(bundle.estimated)
    const observationWindowDays = isEstimated ? 90 : 365
    const dataQuality = bundle.contributions?.dataQuality || {
      observationWindowDays,
      isEstimated,
      isTruncated: false,
      eventsUnavailable: false,
      oldestEventDate: null,
      eventCount: bundle.events?.length || 0,
      observedDaysCount: days.length
    }

    const eventsUnavailable = Boolean(dataQuality.eventsUnavailable)
    const activeDays = eventsUnavailable ? null : days.filter((day) => day.contributionCount > 0).length
    const totalContrib = eventsUnavailable ? null : (bundle.contributions?.contributionCalendar?.totalContributions || 0)

    const repoHealth = repos.map((repo) => {
      const last = new Date(repo.pushed_at || repo.updated_at).getTime()
      const daysSince = Math.max(0, Math.floor((Date.now() - last) / 86400000))
      const status = repo.archived ? 'archived' : daysSince <= 30 ? 'active' : daysSince <= 90 ? 'watch' : 'stale'
      const issueBase = repo.stargazers_count + repo.forks_count + 1
      return {
        ...repo,
        status,
        daysSince,
        issueRatio: Number(((repo.open_issues_count / issueBase) * 100).toFixed(1))
      }
    })

    const rawRestricted = bundle.contributions?.restrictedContributionsCount
    const hasRestrictedCount = typeof rawRestricted === 'number'
    const privateContributionCount = includePrivate && hasRestrictedCount ? rawRestricted : 0

    let privateContributionsStatus = 'unavailable'
    if (includePrivate) {
      if (hasRestrictedCount && rawRestricted > 0) {
        privateContributionsStatus = 'included'
      } else {
        privateContributionsStatus = 'zero_or_hidden'
      }
    }

    // M-03 Multidimensional Intelligence Construction
    const now = new Date()
    const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    const startUtc90 = new Date(endUtc.getTime() - 90 * 86400000)
    const startUtc365 = new Date(endUtc.getTime() - 365 * 86400000)

    const totalOwnedPublicRepos = user.public_repos || 0
    const observedNonForkRepos = repos.length
    const totalEligibleNonForkRepos = bundle.totalRepoCount != null ? bundle.totalRepoCount : (totalOwnedPublicRepos <= observedNonForkRepos ? observedNonForkRepos : null)
    const isRepoCoverageComplete = totalEligibleNonForkRepos != null && totalEligibleNonForkRepos <= observedNonForkRepos

    const repositoryCoverage = {
      totalOwnedPublicRepos,
      observedNonForkRepos,
      totalEligibleNonForkRepos,
      isComplete: isRepoCoverageComplete,
      retrievalCap: 250
    }

    const archivedRepos = repos.filter((r) => r.archived)
    const nonArchivedRepos = repos.filter((r) => !r.archived)
    const archivedCount = archivedRepos.length
    const archivedRepoStarsCount = archivedRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)
    const nonArchivedRepoStarsCount = nonArchivedRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)
    const totalStargazersCount = archivedRepoStarsCount + nonArchivedRepoStarsCount
    const forksCount = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0)
    const followersCount = user.followers || 0

    let activeCount = 0
    let inactiveCount = 0
    let unknownCount = 0

    for (const repo of nonArchivedRepos) {
      if (!repo.pushed_at) {
        unknownCount += 1
      } else {
        const pushTime = new Date(repo.pushed_at).getTime()
        if (isNaN(pushTime)) {
          unknownCount += 1
        } else if (pushTime >= startUtc90.getTime() && pushTime < endUtc.getTime()) {
          activeCount += 1
        } else {
          inactiveCount += 1
        }
      }
    }

    const adoption = {
      snapshotType: 'current_point_in_time',
      repositoryCoverage,
      totalStargazersCount: { state: totalStargazersCount > 0 ? 'observed' : 'zero', value: totalStargazersCount },
      nonArchivedRepoStarsCount: { state: nonArchivedRepoStarsCount > 0 ? 'observed' : 'zero', value: nonArchivedRepoStarsCount },
      archivedRepoStarsCount: { state: archivedRepoStarsCount > 0 ? 'observed' : 'zero', value: archivedRepoStarsCount },
      forksCount: { state: forksCount > 0 ? 'observed' : 'zero', value: forksCount }
    }

    const reach = {
      snapshotType: 'current_point_in_time',
      followersCount: { state: followersCount > 0 ? 'observed' : 'zero', value: followersCount }
    }

    const maintenance = {
      repositoryCoverage,
      observationWindowStart: startUtc90.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 90,
      activeCount: { state: activeCount > 0 ? 'observed' : 'zero', value: activeCount },
      inactiveCount: { state: inactiveCount > 0 ? 'observed' : 'zero', value: inactiveCount },
      archivedCount: { state: archivedCount > 0 ? 'observed' : 'zero', value: archivedCount },
      unknownCount: { state: unknownCount > 0 ? 'observed' : 'zero', value: unknownCount }
    }

    let activity = null
    let engagement = null

    if (!isEstimated) {
      activity = {
        source: 'graphql_calendar',
        observationWindowStart: startUtc365.toISOString(),
        observationWindowEnd: endUtc.toISOString(),
        observationWindowDays: 365,
        recordedContributionDaysCount: {
          state: (activeDays || 0) > 0 ? 'observed' : 'zero',
          value: activeDays || 0,
          observationWindowStart: startUtc365.toISOString(),
          observationWindowEnd: endUtc.toISOString()
        },
        contributionCurrentStreakDays: {
          state: (streaks.current || 0) > 0 ? 'observed' : 'zero',
          value: streaks.current || 0
        },
        contributionLongestStreakDays: {
          state: (streaks.longest || 0) > 0 ? 'observed' : 'zero',
          value: streaks.longest || 0
        },
        totalRecordedContributions: {
          state: (totalContrib || 0) > 0 ? 'observed' : 'zero',
          value: totalContrib || 0
        },
        privateContributionsCount: includePrivate
          ? (hasRestrictedCount && rawRestricted > 0
              ? { state: 'observed', value: rawRestricted }
              : { state: 'ambiguous_zero', value: 0, note: 'Zero or hidden by private contributions profile setting' })
          : { state: 'unavailable', value: null, note: 'Private contributions unobserved without OAuth authorization' }
      }

      const prs = bundle.contributions?.totalPullRequestContributions || 0
      const reviews = bundle.contributions?.totalPullRequestReviewContributions || 0
      const issues = bundle.contributions?.totalIssueContributions || 0
      engagement = {
        source: 'rest_event_stream',
        observationWindowStart: startUtc90.toISOString(),
        observationWindowEnd: endUtc.toISOString(),
        observationWindowDays: 90,
        collectionState: 'complete',
        retrievedEventsCount: (bundle.events || []).length,
        pullRequestEventActionsCount: { state: prs > 0 ? 'observed' : 'zero', value: prs },
        pullRequestReviewEventActionsCount: { state: reviews > 0 ? 'observed' : 'zero', value: reviews },
        issueEventActionsCount: { state: issues > 0 ? 'observed' : 'zero', value: issues },
        issueCommentEventActionsCount: { state: 'zero', value: 0 }
      }
    } else {
      const restCollectionState = bundle.collectionState || dataQuality.collectionState || (eventsUnavailable ? 'unavailable' : (dataQuality.isTruncated ? 'limit_reached' : 'complete'))
      const allEvents = bundle.events || []

      if (restCollectionState === 'unavailable') {
        activity = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: 'unavailable',
          retrievedEventsCount: 0,
          observedPublicEventDaysCount: { state: 'unavailable', value: null, note: 'Public events telemetry unavailable' },
          observedPublicEventDateStreakDays: { state: 'unavailable', value: null, note: 'Public events telemetry unavailable' },
          totalObservedPublicEvents: { state: 'unavailable', value: null, note: 'Public events telemetry unavailable' }
        }
        engagement = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: 'unavailable',
          retrievedEventsCount: 0,
          pullRequestEventActionsCount: { state: 'unavailable', value: null, note: 'Telemetry unavailable' },
          pullRequestReviewEventActionsCount: { state: 'unavailable', value: null, note: 'Telemetry unavailable' },
          issueEventActionsCount: { state: 'unavailable', value: null, note: 'Telemetry unavailable' },
          issueCommentEventActionsCount: { state: 'unavailable', value: null, note: 'Telemetry unavailable' }
        }
      } else if (restCollectionState === 'limit_reached' || restCollectionState === 'incomplete') {
        const isLimit = restCollectionState === 'limit_reached'
        const note = isLimit
          ? 'Activity reached 200-event retrieval limit (observed lower bound)'
          : 'Event collection was interrupted mid-stream'

        activity = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: restCollectionState,
          retrievedEventsCount: allEvents.length,
          observedPublicEventDaysCount: { state: 'partial', value: activeDays || 0, isLowerBound: true, note },
          observedPublicEventDateStreakDays: { state: 'partial', value: streaks.longest || 0, isLowerBound: true, note },
          totalObservedPublicEvents: { state: 'partial', value: allEvents.length, isLowerBound: true, note }
        }

        const prEvents = allEvents.filter((e) => e.type === 'PullRequestEvent').length
        const reviewEvents = allEvents.filter((e) => e.type === 'PullRequestReviewEvent').length
        const issueEvents = allEvents.filter((e) => e.type === 'IssuesEvent').length
        const commentEvents = allEvents.filter((e) => e.type === 'IssueCommentEvent').length

        engagement = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: restCollectionState,
          retrievedEventsCount: allEvents.length,
          pullRequestEventActionsCount: { state: 'partial', value: prEvents, isLowerBound: true, note },
          pullRequestReviewEventActionsCount: { state: 'partial', value: reviewEvents, isLowerBound: true, note },
          issueEventActionsCount: { state: 'partial', value: issueEvents, isLowerBound: true, note },
          issueCommentEventActionsCount: { state: 'partial', value: commentEvents, isLowerBound: true, note }
        }
      } else {
        // complete
        activity = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: 'complete',
          retrievedEventsCount: allEvents.length,
          observedPublicEventDaysCount: { state: (activeDays || 0) > 0 ? 'observed' : 'zero', value: activeDays || 0 },
          observedPublicEventDateStreakDays: { state: (streaks.longest || 0) > 0 ? 'observed' : 'zero', value: streaks.longest || 0 },
          totalObservedPublicEvents: { state: allEvents.length > 0 ? 'observed' : 'zero', value: allEvents.length }
        }

        const prEvents = allEvents.filter((e) => e.type === 'PullRequestEvent').length
        const reviewEvents = allEvents.filter((e) => e.type === 'PullRequestReviewEvent').length
        const issueEvents = allEvents.filter((e) => e.type === 'IssuesEvent').length
        const commentEvents = allEvents.filter((e) => e.type === 'IssueCommentEvent').length

        engagement = {
          source: 'rest_event_stream',
          observationWindowStart: startUtc90.toISOString(),
          observationWindowEnd: endUtc.toISOString(),
          observationWindowDays: 90,
          collectionState: 'complete',
          retrievedEventsCount: allEvents.length,
          pullRequestEventActionsCount: { state: prEvents > 0 ? 'observed' : 'zero', value: prEvents },
          pullRequestReviewEventActionsCount: { state: reviewEvents > 0 ? 'observed' : 'zero', value: reviewEvents },
          issueEventActionsCount: { state: issueEvents > 0 ? 'observed' : 'zero', value: issueEvents },
          issueCommentEventActionsCount: { state: commentEvents > 0 ? 'observed' : 'zero', value: commentEvents }
        }
      }
    }

    const intelligence = {
      schemaVersion: '3.2.0',
      collectedAt: new Date().toISOString(),
      activity,
      adoption,
      reach,
      maintenance,
      engagement
    }

    assertTelemetryIntegrity({ intelligence })

    return {
      user,
      repos: repoHealth,
      events: bundle.events || [],
      contributions: {
        days,
        total: totalContrib,
        activeDays,
        currentStreak: eventsUnavailable ? 0 : streaks.current,
        longestStreak: eventsUnavailable ? 0 : streaks.longest,
        privateContributionCount
      },
      dataQuality,
      observationWindowDays,
      languages,
      timing,
      intelligence,
      authenticated: Boolean(authToken),
      estimated: isEstimated,
      privateContributions: Boolean(includePrivate),
      privateContributionsStatus,
      api: {
        cached: false,
        cacheTtlSeconds: TTL / 1000,
        graphqlRemaining: bundle.graphqlRate?.remaining ?? null,
        graphqlReset: bundle.graphqlRate?.resetAt ?? null,
        restRemaining: bundle.restRate ?? null
      }
    }
  }, (result) => {
    if (includePrivate) return cacheKey(normalized, 'private')
    if (result.estimated) return cacheKey(normalized, 'estimated')
    return cacheKey(normalized, 'verified')
  })
}

/** Parses the granted scope string returned by GitHub into an array of lowercase scopes. */
function parseGrantedScopes(scopeHeader) {
  if (typeof scopeHeader !== 'string') return []
  return scopeHeader
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function isSelfUser(req, username) {
  return Boolean(req.session?.githubUser?.login && req.session.githubUser.login.toLowerCase() === username.toLowerCase())
}

function userCanSeePrivate(req, username) {
  if (!isSelfUser(req, username)) return false
  // Explicitly disallow private contribution analytics if the session lacks the read:user scope
  if (req.session?.hasPrivateContributionsScope === false) return false
  return true
}

/**
 * Returns the appropriate GitHub access token.
 * Security enforcement: The user's OAuth access token is ONLY used when querying
 * that specific user's own profile. For any other user, the server's defaultToken
 * is used to prevent cross-user data leakage and rate limit draining.
 */
function sessionToken(req, targetUsername = null) {
  if (targetUsername && isSelfUser(req, targetUsername)) {
    return req.session?.githubAccessToken || defaultToken
  }
  return defaultToken
}

/** Returns true if the request carries a recognised authenticated session (GitHub or Google). */
function isAuthenticated(req) {
  return Boolean(req.session?.githubUser || req.session?.googleUser)
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    authenticated: Boolean(defaultToken),
    summaryConfigured: true,
    summaryMode: 'deterministic',
    oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    googleOauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  })
})

app.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store')
  // Prefer GitHub identity (has login = GitHub username). Fall back to Google identity.
  const user = req.session?.githubUser || req.session?.googleUser || null
  const provider = user
    ? (req.session?.githubUser ? 'github' : 'google')
    : null
  const hasPrivateContributionsScope = req.session?.githubUser
    ? (req.session.hasPrivateContributionsScope !== false)
    : false
  res.json({ user, provider, hasPrivateContributionsScope })
})

app.get('/api/search-history', (_req, res) => {
  res.json({ enabled: false })
})
const GUEST_SEARCH_LIMIT = 3
const FALLBACK_PROFILE = 'cgupta21'

/**
 * Evaluates guest search quota status for one or more requested usernames.
 *
 * Architectural Note on Guest Quota & Stateless Concurrency:
 * Arsenic enforces guest search quota using encrypted, stateless client cookies (iron-session)
 * without a persistent database or distributed cache (e.g. Redis).
 * This acts as a UX onboarding gate to encourage GitHub/Google sign-in.
 * In a serverless multi-instance deployment (e.g. Vercel), concurrent requests from the same
 * unauthenticated client may read the same cookie snapshot before session writes settle.
 * Robust, race-proof rate-limiting across distributed serverless instances would require
 * external shared infrastructure.
 */
function getGuestQuotaStatus(req, usernames) {
  if (isAuthenticated(req)) {
    return { allowed: true, neededProfiles: [], used: 0, remaining: null }
  }

  const searched = Array.isArray(req.session?.searchedProfiles) ? [...req.session.searchedProfiles] : []
  const used = Math.max(searched.length, Number(req.session?.guestSearches || 0))
  const remaining = Math.max(0, GUEST_SEARCH_LIMIT - used)

  // Find unique, unexempt profiles that have not been searched yet
  const neededProfiles = []
  for (const raw of usernames) {
    if (!raw) continue
    const lower = String(raw).replace(/^@/, '').trim().toLowerCase()
    if (lower !== FALLBACK_PROFILE.toLowerCase() && !searched.includes(lower) && !neededProfiles.includes(lower)) {
      neededProfiles.push(lower)
    }
  }

  const allowed = neededProfiles.length <= remaining
  return {
    allowed,
    neededProfiles,
    used,
    remaining,
    error: allowed ? null : "You've used your 3 free searches. Sign in with GitHub to continue."
  }
}

async function recordGuestSearches(req, neededProfiles) {
  if (isAuthenticated(req) || !req.session || !neededProfiles || neededProfiles.length === 0) return
  const searched = Array.isArray(req.session.searchedProfiles) ? [...req.session.searchedProfiles] : []
  let modified = false
  for (const p of neededProfiles) {
    const lower = String(p).replace(/^@/, '').trim().toLowerCase()
    if (lower !== FALLBACK_PROFILE.toLowerCase() && !searched.includes(lower)) {
      searched.push(lower)
      modified = true
    }
  }
  if (modified) {
    req.session.searchedProfiles = searched
    req.session.guestSearches = searched.length
    await req.session.save()
  }
}

app.post('/api/search/consume', verifySameOriginOrAllowed, async (req, res) => {
  res.set('Cache-Control', 'no-store')

  // Logged-in users (GitHub or Google) have unlimited searches.
  if (isAuthenticated(req)) {
    return res.json({
      allowed: true,
      authenticated: true,
      searchesRemaining: null,
      remaining: null
    })
  }

  let requestedUser = null
  if (req.body?.username) {
    const rawUser = String(req.body.username).replace(/^@/, '').trim()
    if (!isValidGitHubUsername(rawUser)) {
      return res.status(400).json({ error: 'Invalid GitHub username.' })
    }
    requestedUser = rawUser.toLowerCase()
  }
  const searched = Array.isArray(req.session?.searchedProfiles) ? [...req.session.searchedProfiles] : []
  const used = Math.max(searched.length, Number(req.session?.guestSearches || 0))

  // If a specific username was passed, check if it's already searched or is the showcase profile
  if (requestedUser) {
    const isRepeated = searched.includes(requestedUser) || requestedUser === FALLBACK_PROFILE.toLowerCase()
    if (isRepeated) {
      return res.json({
        allowed: true,
        authenticated: false,
        searchesRemaining: Math.max(0, GUEST_SEARCH_LIMIT - used),
        remaining: Math.max(0, GUEST_SEARCH_LIMIT - used)
      })
    }
  }

  if (used >= GUEST_SEARCH_LIMIT) {
    return res.status(401).json({
      allowed: false,
      authenticated: false,
      searchesRemaining: 0,
      remaining: 0,
      loginRequired: true,
      requiresLogin: true,
      error: "You've used your 3 free searches. Sign in with GitHub to continue."
    })
  }

  // If a specific username was passed, we verify it is allowed (searched < 3).
  // The search allowance is only consumed when the dashboard data is successfully retrieved.
  // This guarantees that if the subsequent dashboard request fails (404, 403, 429, 500, network error)
  // or if the user disconnects before dashboard load, their free search is NOT lost or desynchronized.
  if (requestedUser) {
    return res.json({
      allowed: true,
      authenticated: false,
      searchesRemaining: Math.max(0, GUEST_SEARCH_LIMIT - used),
      remaining: Math.max(0, GUEST_SEARCH_LIMIT - used)
    })
  }

  // If no username was passed (generic consume endpoint caller), consume 1 credit
  const nextUsed = used + 1
  req.session.guestSearches = nextUsed
  await req.session.save()

  return res.json({
    allowed: true,
    authenticated: false,
    searchesRemaining: GUEST_SEARCH_LIMIT - nextUsed,
    remaining: GUEST_SEARCH_LIMIT - nextUsed
  })
})

app.get('/api/dashboard/:username', async (req, res) => {
  const username = req.params.username.replace(/^@/, '').trim()
  if (!isValidGitHubUsername(username)) {
    return res.status(400).json({ error: 'Invalid GitHub username.' })
  }
  const lowerUser = username.toLowerCase()
  const privateScope = userCanSeePrivate(req, username)
  const token = sessionToken(req, username)

  // Enforce guest search limit on the backend
  const quota = getGuestQuotaStatus(req, [lowerUser])
  if (!quota.allowed) {
    return res.status(401).json({
      error: quota.error,
      loginRequired: true,
      authError: true
    })
  }

  const recordGuestSearch = async () => {
    await recordGuestSearches(req, quota.neededProfiles)
  }

  try {
    try {
      const data = await buildDashboard(username, token, privateScope)
      await recordGuestSearch()
      return res.json(data)
    } catch (error) {
      if (error.status === 401) {
        // Invalidate stale token
        req.session.githubAccessToken = null
        if (!privateScope) {
          // Retry with server token for public data
          const fallbackData = await buildDashboard(username, defaultToken, privateScope)
          await recordGuestSearch()
          return res.json(fallbackData)
        }
        return res.status(401).json({ error: 'GitHub authentication expired. Please sign in again.', authError: true })
      }
      // Existing error handling below will be applied after this block
      throw error
    }
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message || 'Invalid GitHub username.' })
    }
    if (error.status === 404 || error.message?.includes('was not found') || error.message?.includes('Could not resolve to a User')) {
      return res.status(404).json({ error: `GitHub user "${username}" was not found.` })
    }

    const remaining = error.rate?.remaining
    const reset = error.rate?.reset
    const retryAfter = error.rate?.retryAfter
    if (error.status === 429 || (error.status === 403 && remaining === '0')) {
      return res.status(429).json({
        error: error.status === 429
          ? 'GitHub temporarily throttled this integration. Please wait before trying again.'
          : `GitHub API rate limit reached. Try again after ${reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'the reset time'}.`,
        rateLimit: true,
        secondary: error.status === 429 || Boolean(retryAfter),
        reset: reset || null,
        retryAfter: retryAfter || null
      })
    }
    if (error.status === 504) {
      return res.status(504).json({
        error: error.message || 'GitHub took too long to respond. Please try again.',
        timeout: true
      })
    }
    console.error('Dashboard error:', error)
    return res.status(502).json({ error: error.message || 'Could not reach GitHub right now. Please try again.' })
  }
})

app.get('/api/meta/:username', (req, res) => {
  const rawUser = req.params.username || ''
  const username = decodeURIComponent(String(rawUser)).replace(/^@/, '').trim()
  if (!isValidGitHubUsername(username)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    return res.status(400).send('Invalid username')
  }
  const displayUser = username || 'Developer'
  const title = `Arsenic — @${displayUser}`
  const description = `GitHub developer intelligence, contribution patterns and repository health for @${displayUser} on Arsenic.`
  const url = `https://arsenic-rho.vercel.app/u/${encodeURIComponent(username)}`
  const image = 'https://arsenic-rho.vercel.app/assets/social-preview.png'

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#11110F" />
    <meta name="description" content="${description}" />

    <!-- Open Graph -->
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${title}" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${url}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${title}" />

    <!-- Canonical -->
    <link rel="canonical" href="${url}" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />

    <title>${title}</title>
    <meta http-equiv="refresh" content="0;url=/u/${encodeURIComponent(username)}" />
  </head>
  <body>
    <p>Viewing <a href="/u/${encodeURIComponent(username)}">${title}</a> on Arsenic.</p>
  </body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  return res.status(200).send(html)
})

app.get('/api/compare/:left/:right', async (req, res) => {
  const left = req.params.left.replace(/^@/, '').trim()
  const right = req.params.right.replace(/^@/, '').trim()
  if (!isValidGitHubUsername(left) || !isValidGitHubUsername(right)) {
    return res.status(400).json({ error: 'Invalid GitHub username.' })
  }

  // Enforce guest search limit on comparison (accounting for both developers)
  const quota = getGuestQuotaStatus(req, [left, right])
  if (!quota.allowed) {
    return res.status(401).json({
      error: quota.error,
      loginRequired: true,
      authError: true
    })
  }

  try {
    const [leftData, rightData] = await Promise.all([
      buildDashboard(left, sessionToken(req, left), userCanSeePrivate(req, left)),
      buildDashboard(right, sessionToken(req, right), userCanSeePrivate(req, right))
    ])
    await recordGuestSearches(req, quota.neededProfiles)
    return res.json({ left: leftData, right: rightData })
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message || 'Invalid GitHub username.' })
    if (error.status === 401) {
      // Invalidate stale token and inform client
      req.session.githubAccessToken = null
      return res.status(401).json({ error: 'GitHub authentication expired. Please sign in again.', authError: true })
    }
    if (error.status === 404) return res.status(404).json({ error: error.message })
    if (error.status === 429 || error.rate?.remaining === '0') return res.status(429).json({ error: 'GitHub is rate-limiting the comparison. Please wait and try again.', rateLimit: true })
    console.error('Compare error:', error)
    return res.status(502).json({ error: error.message || 'Could not compare those profiles.' })
  }
})

app.post('/api/summary/:username', summaryLimiter, verifySameOriginOrAllowed, async (req, res) => {
  const username = req.params.username.replace(/^@/, '').trim()
  if (!isValidGitHubUsername(username)) {
    return res.status(400).json({ error: 'Invalid GitHub username.' })
  }
  const isPrivate = userCanSeePrivate(req, username)
  const token = sessionToken(req, username)
  const initialTier = isPrivate ? 'private' : (token ? 'verified' : 'estimated')
  const summaryKey = cacheKey(username, initialTier)
  const cachedSummary = summaryCache.get(summaryKey)
  if (cachedSummary && cachedSummary.expires > Date.now()) {
    return res.json({ summary: cachedSummary.summary, model: 'deterministic-rules', cached: true })
  }

  const today = new Date().toISOString().slice(0, 10)
  if (today !== summaryDay) { summaryDay = today; summaryCount = 0 }
  if (summaryCount >= SUMMARY_DAILY_CAP) {
    return res.status(429).json({ error: 'The daily summary limit has been reached. Please try again tomorrow.' })
  }

  try {
    const data = await buildDashboard(username, token, isPrivate)
    const text = generateDeveloperSummary(data)
    summaryCount += 1
    const actualTier = data.privateContributions ? 'private' : (data.estimated ? 'estimated' : 'verified')
    const storeSummaryKey = cacheKey(username, actualTier)
    setSummaryCache(storeSummaryKey, text)
    return res.json({ summary: text, model: 'deterministic-rules', cached: false })
  } catch (error) {
    if (error.status === 401) {
      // Invalidate stale token, fallback to server token for public data
      req.session.githubAccessToken = null
      return res.status(401).json({ error: 'GitHub authentication expired. Please sign in again.', authError: true })
    }
    console.error('Deterministic summary error:', error)
    return res.status(error.status === 429 ? 429 : 502).json({ error: error.message || 'The developer summary could not be generated right now.' })
  }
})

/** Shared helper: safely append a Set-Cookie header. */
function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader('set-cookie') || res.getHeader('Set-Cookie')
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr)
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr])
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr])
  }
}

/** Shared helper: set the short-lived signed oauth_state cookie. */
function setOAuthStateCookie(res, signedState) {
  const sameSiteValue = sessionOptions.cookieOptions.sameSite === 'none' ? 'None' : 'Lax'
  const cookieParts = [
    `oauth_state=${signedState}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=600',
    `SameSite=${sameSiteValue}`,
    sessionOptions.cookieOptions.secure ? 'Secure' : ''
  ].filter(Boolean)
  appendSetCookie(res, cookieParts.join('; '))
}

/** Shared helper: safely resolve OAuth callback redirect URI between local and production. */
function resolveOAuthCallbackUri(req, provider) {
  const envUrl = provider === 'github' ? process.env.GITHUB_CALLBACK_URL : process.env.GOOGLE_CALLBACK_URL

  if (isProd) {
    return envUrl || `https://arsenic-rho.vercel.app/auth/${provider}/callback`
  }

  // In local development:
  // If explicitly configured with a local URL (e.g. 127.0.0.1 or localhost), honor it
  if (envUrl && (envUrl.includes('127.0.0.1') || envUrl.includes('localhost'))) {
    return envUrl
  }

  // If pointing to production while running locally, warn and use local host
  if (envUrl && (envUrl.includes('vercel.app') || envUrl.startsWith('https://'))) {
    try {
      console.warn(`[OAuth Warning] ${provider.toUpperCase()}_CALLBACK_URL is set to production (${new URL(envUrl).host}) while running locally. Using local callback URI to keep OAuth flow on local machine.`)
    } catch {
      // ignore URL parsing error
    }
  }

  // Derive local host from Vite proxy or direct Express request
  let host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || `127.0.0.1:${PORT}`
  // If client origin is on 127.0.0.1, align callback host to 127.0.0.1 to avoid cross-host cookie drops
  if (clientOrigins[0]?.includes('127.0.0.1') && host.includes('localhost')) {
    host = host.replace('localhost', '127.0.0.1')
  }
  const proto = req?.headers?.['x-forwarded-proto'] || (req?.protocol === 'https' ? 'https' : 'http')
  return `${proto}://${host}/auth/${provider}/callback`
}

/** Shared helper: resolve the trusted frontend origin for redirects. */
function resolveFrontendOrigin(req) {
  const reqOrigin = req?.get?.('origin') || (req?.get?.('referer') ? new URL(req.get('referer')).origin : null)
  if (reqOrigin && clientOrigins.includes(reqOrigin)) {
    return reqOrigin.replace(/\/+$/, '')
  }
  return (clientOrigins[0] || 'http://127.0.0.1:5173').replace(/\/+$/, '')
}

/** Shared helper: resolve the destination URL on the trusted frontend origin. */
function resolvePostLoginRedirect(req, fallbackPath = '/dashboard') {
  const origin = resolveFrontendOrigin(req)
  const path = fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`
  return `${origin}${path}`
}

/** Shared helper: persist signed OAuth state to cookie and session. */
async function persistOAuthState(req, res, state, redirectUri = null, frontendOrigin = null) {
  const signature = crypto.createHmac('sha256', sessionSecret).update(state).digest('hex')
  const signedState = `${state}.${signature}`
  if (req.session) {
    req.session.oauthState = signedState
    if (redirectUri) {
      req.session.oauthRedirectUri = redirectUri
    }
    if (frontendOrigin) {
      req.session.oauthFrontendOrigin = frontendOrigin
    }
    try {
      await req.session.save()
    } catch (err) {
      console.warn('Failed to save oauthState into session:', err)
    }
  }
  setOAuthStateCookie(res, signedState)
  return signedState
}

/** Shared helper: read + clear + verify the oauth_state from cookie and/or session. Returns {ok, state, frontendOrigin} or {ok:false}. */
async function consumeOAuthState(req, res, returnedState) {
  const cookieHeader = req.headers?.cookie || ''
  const match = cookieHeader.match(/(?:^|;\s*)oauth_state=([^;]+)/)
  const cookieSignedState = match ? decodeURIComponent(match[1]) : ''
  const sessionSignedState = req.session?.oauthState || ''

  if (isDebugMode) {
    console.log(`[OAuth Diagnostic] consumeOAuthState: hasCookieState=${!!cookieSignedState}, hasSessionState=${!!sessionSignedState}, hasReturnedState=${!!returnedState}`)
  }

  // Clear the cookie immediately (valid or not)
  const sameSiteValue = sessionOptions.cookieOptions.sameSite === 'none' ? 'None' : 'Lax'
  const clearParts = [
    'oauth_state=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `SameSite=${sameSiteValue}`,
    sessionOptions.cookieOptions.secure ? 'Secure' : ''
  ].filter(Boolean)
  appendSetCookie(res, clearParts.join('; '))

  // Clear session state immediately, preserving saved frontendOrigin for redirect
  let savedFrontendOrigin = null
  if (req.session?.oauthState || req.session?.oauthRedirectUri || req.session?.oauthFrontendOrigin) {
    savedFrontendOrigin = req.session.oauthFrontendOrigin || null
    delete req.session.oauthState
    delete req.session.oauthRedirectUri
    delete req.session.oauthFrontendOrigin
    try {
      await req.session.save()
    } catch (err) {
      console.warn('Failed to clear oauthState from session:', err)
    }
  }

  if (!returnedState || typeof returnedState !== 'string') return { ok: false, frontendOrigin: savedFrontendOrigin }

  const candidates = [cookieSignedState, sessionSignedState].filter(Boolean)
  if (candidates.length === 0) return { ok: false, frontendOrigin: savedFrontendOrigin }

  for (const candidate of candidates) {
    const dotIndex = candidate.indexOf('.')
    if (dotIndex === -1) {
      continue
    }
    const originalState = candidate.substring(0, dotIndex)
    const signature = candidate.substring(dotIndex + 1)
    const expectedSig = crypto.createHmac('sha256', sessionSecret).update(originalState).digest('hex')

    if (returnedState !== originalState) continue

    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expectedSig, 'hex')
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { ok: true, state: originalState, frontendOrigin: savedFrontendOrigin }
    }
  }

  return { ok: false, frontendOrigin: savedFrontendOrigin }
}

app.get('/auth/github', async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) return res.status(501).send('GitHub OAuth is not configured.')
  const state = crypto.randomBytes(24).toString('hex')
  const redirectUri = resolveOAuthCallbackUri(req, 'github')
  const frontendOrigin = resolveFrontendOrigin(req)
  await persistOAuthState(req, res, state, redirectUri, frontendOrigin)
  if (isDebugMode) {
    try {
      console.log(`[OAuth Diagnostic] /auth/github: hasClientId=${!!clientId}, isProd=${isProd}, redirectHost=${new URL(redirectUri).host}`)
    } catch {
      console.log(`[OAuth Diagnostic] /auth/github: hasClientId=${!!clientId}, isProd=${isProd}, redirectUriSet=${!!redirectUri}`)
    }
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

app.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query
  const verification = await consumeOAuthState(req, res, state)
  if (isDebugMode) {
    console.log(`[OAuth Diagnostic] /auth/github/callback: hasCode=${!!code}, hasState=${!!state}, hasCookie=${!!req.headers?.cookie}, hasSession=${!!req.session}, stateValid=${verification.ok}`)
  }
  if (!verification.ok) return res.status(400).send('Invalid OAuth state.')

  try {
    const redirectUri = req.session?.oauthRedirectUri || resolveOAuthCallbackUri(req, 'github')
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      })
    })
    const tokenBody = await tokenResponse.json()
    if (!tokenBody.access_token) return res.status(502).send(tokenBody.error_description || 'GitHub OAuth failed.')

    const grantedScopes = parseGrantedScopes(tokenBody.scope)
    const hasPrivateContributionsScope = grantedScopes.includes('read:user')

    const userResponse = await fetch('https://api.github.com/user', { headers: headersFor(tokenBody.access_token) })
    const user = await userResponse.json()
    req.session.githubAccessToken = tokenBody.access_token
    req.session.githubUser = { login: user.login, name: user.name, avatar_url: user.avatar_url }
    req.session.hasPrivateContributionsScope = hasPrivateContributionsScope
    req.session.githubScopes = grantedScopes
    await req.session.save()
    if (isDebugMode) {
      console.log(`[OAuth Diagnostic] /auth/github/callback: user=${user.login}, hasPrivateScope=${hasPrivateContributionsScope}, scopeCount=${grantedScopes.length}`)
    }
    const targetOrigin = verification.frontendOrigin || resolveFrontendOrigin(req)
    res.redirect(`${targetOrigin}/dashboard`)
  } catch (error) {
    console.error('GitHub OAuth callback error:', error)
    res.status(502).send('GitHub sign-in failed.')
  }
})

// ---------------------------------------------------------------------------
// Google OAuth routes
// ---------------------------------------------------------------------------

// Lazily initialise the JWKS fetcher so the module can load even when Google
// credentials are not configured (e.g. during CI test runs).
let googleJWKS = null
function getGoogleJWKS() {
  if (!googleJWKS) {
    googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  }
  return googleJWKS
}

app.get('/auth/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return res.status(501).send('Google OAuth is not configured.')
  const state = crypto.randomBytes(24).toString('hex')
  const redirectUri = resolveOAuthCallbackUri(req, 'google')
  const frontendOrigin = resolveFrontendOrigin(req)
  await persistOAuthState(req, res, state, redirectUri, frontendOrigin)
  if (isDebugMode) {
    try {
      console.log(`[OAuth Diagnostic] /auth/google: hasClientId=${!!clientId}, isProd=${isProd}, redirectHost=${new URL(redirectUri).host}`)
    } catch {
      console.log(`[OAuth Diagnostic] /auth/google: hasClientId=${!!clientId}, isProd=${isProd}, redirectUriSet=${!!redirectUri}`)
    }
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query
  const frontendOrigin = req.session?.oauthFrontendOrigin || resolveFrontendOrigin(req)

  // Google may return an error (e.g. user denied consent)
  if (oauthError) {
    console.warn('Google OAuth error from provider:', oauthError)
    return res.redirect(`${frontendOrigin}/register?auth_error=google_denied`)
  }

  const verification = await consumeOAuthState(req, res, state)
  if (isDebugMode) {
    console.log(`[OAuth Diagnostic] /auth/google/callback: hasCode=${!!code}, hasState=${!!state}, hasCookie=${!!req.headers?.cookie}, hasSession=${!!req.session}, stateValid=${verification.ok}`)
  }
  if (!verification.ok) return res.status(400).send('Invalid OAuth state.')

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing authorization code.')
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).send('Google OAuth is not configured.')
  }

  try {
    const redirectUri = req.session?.oauthRedirectUri || resolveOAuthCallbackUri(req, 'google')

    // Exchange authorisation code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })
    const tokenBody = await tokenResponse.json()
    if (!tokenBody.id_token) {
      console.error('Google token exchange failed:', tokenBody.error)
      return res.status(502).send('Google OAuth token exchange failed.')
    }

    // Verify the ID token: signature, issuer, audience, expiry, subject
    const { payload } = await jwtVerify(tokenBody.id_token, getGoogleJWKS(), {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: process.env.GOOGLE_CLIENT_ID,
      algorithms: ['RS256']
    })

    if (!payload.sub) return res.status(502).send('Google ID token missing subject.')

    // Store only verified identity — never trust unverified profile data from a body
    req.session.googleUser = {
      id: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : (payload.email ? String(payload.email).split('@')[0] : 'Google User'),
      email: typeof payload.email === 'string' ? payload.email : null,
      avatar_url: typeof payload.picture === 'string' && payload.picture ? payload.picture : '/assets/arsenic-mark.svg',
      // Expose a stable display handle: prefer email prefix, fallback to sub
      login: typeof payload.email === 'string'
        ? payload.email
        : `google:${payload.sub}`
    }
    // Do not overwrite an existing GitHub session unnecessarily
    await req.session.save()
    const targetOrigin = verification.frontendOrigin || frontendOrigin
    res.redirect(`${targetOrigin}/dashboard`)
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    res.status(502).send('Google sign-in failed.')
  }
})

app.post(['/auth/logout', '/api/auth/logout'], verifySameOriginOrAllowed, async (req, res) => {
  if (isDebugMode) {
    console.log(`[LOGOUT DIAGNOSTICS] ${req.method} ${req.url}`)
    console.log(`[LOGOUT DIAGNOSTICS] req.session exists: ${!!req.session}`)
    console.log(`[LOGOUT DIAGNOSTICS] req.session.destroy exists: ${!!(req.session && req.session.destroy)}`)
  }
  try {
    if (req.session && req.session.destroy) {
      await req.session.destroy()
      if (isDebugMode) console.log('[LOGOUT DIAGNOSTICS] req.session.destroy() succeeded')
    } else {
      if (isDebugMode) console.log('[LOGOUT DIAGNOSTICS] req.session or destroy() missing, proceeding to clear cookie anyway')
    }
    // iron-session's destroy() clears the session data but does NOT expire the browser cookie.
    // We must explicitly overwrite the cookie with Max-Age=0 and expired date so the browser removes it.
    // Use the exact same cookie name and attributes as sessionOptions so the browser matches it.
    const sameSiteValue = sessionOptions.cookieOptions.sameSite === 'none' ? 'None' : 'Lax'
    const clearCookieParts = [
      `${sessionOptions.cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`,
      'HttpOnly',
      `SameSite=${sameSiteValue}`,
      sessionOptions.cookieOptions.secure ? 'Secure' : ''
    ].filter(Boolean)
    res.setHeader('Set-Cookie', clearCookieParts.join('; '))
    res.set('Cache-Control', 'no-store')
    res.json({ ok: true })
  } catch (error) {
    console.error('[LOGOUT DIAGNOSTICS] Logout error:', error)
    res.status(500).json({ ok: false, error: 'Logout failed.' })
  }
})

const distPath = path.resolve(__dirname, '../client/dist')
const sourceIndexPath = path.resolve(__dirname, '../client/index.html')
const distIndexPath = path.join(distPath, 'index.html')
const spaIndexPath = fs.existsSync(distIndexPath) ? distIndexPath : sourceIndexPath
let spaIndexTemplate = null
try {
  spaIndexTemplate = fs.readFileSync(spaIndexPath, 'utf-8')
} catch {
  spaIndexTemplate = null
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Local development serves the built frontend from Express. On Vercel, the
// frontend is served by Vercel and this Express app is exposed as a function.
if (process.env.VERCEL !== '1') {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next()
    if (!spaIndexTemplate) return next()
    const match = req.path.match(/^\/u\/([^/]+)/)
    if (match) {
      let rawUser = ''
      try {
        rawUser = decodeURIComponent(match[1]).replace(/^@/, '').trim()
      } catch {
        rawUser = ''
      }
      if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(rawUser)) {
        const username = rawUser
        const title = `Arsenic — @${username}`
        const desc = `GitHub developer intelligence, contribution patterns and repository health for @${username} on Arsenic.`
        const url = `https://arsenic-rho.vercel.app/u/${encodeURIComponent(username)}`
        const safeTitle = escapeHtml(title)
        const safeDesc = escapeHtml(desc)
        const safeUrl = escapeHtml(url)
        const content = spaIndexTemplate
          .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
          .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${safeTitle}" />`)
          .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${safeDesc}" />`)
          .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${safeUrl}" />`)
          .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="profile" />`)
          .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${safeTitle}" />`)
          .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${safeDesc}" />`)
          .replace(/<meta name="twitter:url" content="[^"]*" \/>/, `<meta name="twitter:url" content="${safeUrl}" />`)
          .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${safeUrl}" />`)
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        return res.send(content)
      }
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(spaIndexTemplate)
  })
}

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err)
  if (err.message?.includes('CORS')) return res.status(403).json({ error: err.message })
  res.status(500).json({ error: 'Unexpected server error.' })
})

export {
  calculateStreaks,
  flattenCalendar,
  isValidGitHubUsername,
  GITHUB_USERNAME_REGEX,
  fallbackSessionSecret,
  isPlaceholderSecret,
  resolveSessionSecret,
  setOAuthStateCookie,
  consumeOAuthState,
  persistOAuthState,
  resolveOAuthCallbackUri,
  resolveFrontendOrigin,
  resolvePostLoginRedirect,
  sessionToken,
  userCanSeePrivate,
  parseGrantedScopes,
  isSelfUser,
  cacheKey,
  cachedDashboard,
  cache,
  inflight,
  summaryCache,
  setSummaryCache,
  contributionsFromEvents,
  buildDashboard,
  validateMetricValue,
  assertTelemetryIntegrity,
  compareMetric,
  METRIC_REGISTRY
}
export default app

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Arsenic API running at http://localhost:${PORT}`)
    console.log(defaultToken ? 'GitHub authentication: ENABLED' : 'GitHub authentication: DISABLED — public API rate limit applies')
    console.log('Developer summary: ENABLED (deterministic, no external AI key required)')
    console.log(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? 'GitHub OAuth: ENABLED' : 'GitHub OAuth: DISABLED')
  })
}
