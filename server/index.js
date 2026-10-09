import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { getIronSession } from 'iron-session'
import crypto from 'node:crypto'
import path from 'node:path'
import { calculateScore as calculateScoreModel } from '../shared/score.js'
import { generateDeveloperSummary } from '../shared/summary.js'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const isProd = process.env.NODE_ENV === 'production'

const sessionSecret = process.env.SESSION_SECRET || ''
if (isProd && (sessionSecret.length < 32 || /^change-this/i.test(sessionSecret))) {
  console.error('SESSION_SECRET must be a random value of at least 32 characters in production.')
  // Do not terminate the process; continue with a fallback secret.
}

const sessionOptions = {
  password: sessionSecret || 'arsenic-local-secret-change-me-32-chars!!',
  cookieName: 'session',
  ttl: 7 * 24 * 60 * 60,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  }
};


const app = express()
// Render, Railway, Fly etc. terminate TLS in a proxy. Without this, secure cookies are dropped
// and the rate limiter sees every visitor as the same IP.
if (isProd || process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY || 1))
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

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
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

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests to Arsenic. Please slow down for a moment.' }
})
app.use('/api/', generalLimiter)

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

function cacheKey(username, privateScope) {
  return `${username.toLowerCase()}::${privateScope ? 'private' : 'public'}`
}

async function cachedDashboard(key, producer) {
  const existing = cache.get(key)
  if (existing && existing.expires > Date.now()) {
    const hit = clone(existing.value)
    if (hit.api) hit.api.cached = true
    return hit
  }
  if (cache.size > 500) {
    for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k)
  }

  if (inflight.has(key)) return clone(await inflight.get(key))

  const promise = producer()
    .then((value) => {
      cache.set(key, { value: clone(value), expires: Date.now() + TTL })
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

async function githubRest(pathname, authToken = defaultToken, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      ...headersFor(authToken),
      ...(options.headers || {})
    }
  })
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
}

async function githubGraphQL(query, variables, authToken) {
  if (!authToken) return null
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      ...headersFor(authToken),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })
  const rate = rateInfoFromResponse(response)
  const body = await response.json()

  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error) => error.message).join('; ') || `GitHub GraphQL returned ${response.status}`
    const error = new Error(message)
    error.status = response.status || 400
    error.rate = rate
    error.body = body
    throw error
  }

  return { body: body.data, rate }
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
  }
}

// Without a token there is no GraphQL contribution calendar, so approximate one from the public
// events feed (GitHub only keeps roughly 90 days / 300 events). The UI labels this as estimated.
function contributionsFromEvents(events) {
  const counts = new Map()
  let prs = 0
  let issues = 0
  let reviews = 0
  for (const event of events || []) {
    const day = String(event.created_at || '').slice(0, 10)
    if (!day) continue
    const weight = event.type === 'PushEvent' ? Math.max(1, event.payload?.commits?.length || event.payload?.size || 1) : 1
    counts.set(day, (counts.get(day) || 0) + weight)
    if (event.type === 'PullRequestEvent') prs += 1
    if (event.type === 'IssuesEvent') issues += 1
    if (event.type === 'PullRequestReviewEvent') reviews += 1
  }
  const contributionDays = []
  const today = new Date()
  for (let offset = 89; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset))
    const date = d.toISOString().slice(0, 10)
    contributionDays.push({ date, contributionCount: counts.get(date) || 0, weekday: d.getUTCDay() })
  }
  const total = contributionDays.reduce((sum, day) => sum + day.contributionCount, 0)
  return {
    totalPullRequestContributions: prs,
    totalIssueContributions: issues,
    totalPullRequestReviewContributions: reviews,
    restrictedContributionsCount: 0,
    contributionCalendar: { totalContributions: total, weeks: [{ contributionDays }] }
  }
}

async function fetchPublicBundle(username, authToken) {
  const { body: user, rate: userRate } = await githubRest(`/users/${encodeURIComponent(username)}`, authToken)
  const { body: repos, rate: reposRate } = await githubRest(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, authToken)
  const { body: events, rate: eventsRate } = await githubRest(`/users/${encodeURIComponent(username)}/events/public?per_page=100`, authToken)

  const pages = [repos]
  let page = 2
  while (repos.length === 100 && page <= 3) {
    const { body: next } = await githubRest(`/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`, authToken)
    pages.push(next)
    if (next.length < 100) break
    page += 1
  }

  const allRepos = pages.flat()
  const recentRepos = allRepos.filter((repo) => !repo.fork).slice(0, 250)

  return {
    user,
    repos: recentRepos,
    events,
    contributions: contributionsFromEvents(events),
    estimated: true,
    graphqlRate: null,
    restRate: eventsRate?.remaining ?? reposRate?.remaining ?? userRate?.remaining ?? null,
    publicModeFallback: true
  }
}

async function fetchCommitTiming(username, repos, authToken) {
  const candidates = repos
    .filter((repo) => repo.name && !repo.fork)
    .sort((a, b) => new Date(b.pushed_at || b.updated_at).getTime() - new Date(a.pushed_at || a.updated_at).getTime())
    .slice(0, 5)

  const results = await Promise.all(candidates.map(async (repo) => {
    try {
      const { body } = await githubRest(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/commits?author=${encodeURIComponent(username)}&per_page=100`, authToken)
      return Array.isArray(body) ? body : []
    } catch {
      // Timing is a secondary feature; one inaccessible repository should not fail the dashboard.
      return []
    }
  }))
  const commits = results.flat()

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

function calculateScore({ contributions, repos, followers, timing }) {
  const days = flattenCalendar(contributions?.contributionCalendar)
  const activeDays = days.filter((day) => day.contributionCount > 0).length
  const totalContributions = contributions?.contributionCalendar?.totalContributions || 0
  const prs = contributions?.totalPullRequestContributions || 0
  const issues = contributions?.totalIssueContributions || 0
  const reviews = contributions?.totalPullRequestReviewContributions || 0
  const stars = repos.reduce((sum, repo) => sum + Number(repo.stargazerCount ?? repo.stargazers_count ?? 0), 0)
  const forks = repos.reduce((sum, repo) => sum + Number(repo.forkCount ?? repo.forks_count ?? 0), 0)
  const result = calculateScoreModel({ activeDays, prs, issues, reviews, stars, forks, followers })
  const streaks = calculateStreaks(days)
  return {
    ...result,
    raw: { activeDays, totalContributions, prs, issues, reviews, stars, forks, currentStreak: streaks.current, longestStreak: streaks.longest, timingSamples: timing.commitsSampled }
  }
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
    archived: Boolean(repo.isArchived),
    languages: repo.languages?.edges || []
  }
}

async function buildDashboard(username, authToken, includePrivate = false) {
  const normalized = username.replace(/^@/, '').trim()
  if (!/^[a-zA-Z0-9-]+$/.test(normalized)) {
    const error = new Error('Invalid GitHub username.')
    error.status = 400
    throw error
  }

  const key = cacheKey(normalized, includePrivate)
  return cachedDashboard(key, async () => {
    let bundle = null
    if (authToken) {
      bundle = await fetchGraphQLBundle(normalized, authToken)
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
    const score = calculateScore({
      contributions: bundle.contributions,
      repos,
      followers: user.followers || 0,
      timing
    })

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

    return {
      user,
      repos: repoHealth,
      events: bundle.events || [],
      contributions: {
        days,
        total: bundle.contributions?.contributionCalendar?.totalContributions || 0,
        activeDays: days.filter((day) => day.contributionCount > 0).length,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        privateContributionCount: bundle.contributions?.restrictedContributionsCount || 0
      },
      languages,
      timing,
      score,
      authenticated: Boolean(authToken),
      estimated: Boolean(bundle.estimated),
      privateContributions: Boolean(includePrivate),
      api: {
        cached: false,
        cacheTtlSeconds: TTL / 1000,
        graphqlRemaining: bundle.graphqlRate?.remaining ?? null,
        graphqlReset: bundle.graphqlRate?.resetAt ?? null,
        restRemaining: bundle.restRate ?? null
      }
    }
  })
}

function sessionToken(req) {
  return req.session?.githubAccessToken || defaultToken
}

function userCanSeePrivate(req, username) {
  return Boolean(req.session?.githubUser?.login && req.session.githubUser.login.toLowerCase() === username.toLowerCase())
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, authenticated: Boolean(defaultToken), summaryConfigured: true, summaryMode: 'deterministic', oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) })
})

app.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ user: req.session?.githubUser || null })
})

app.get('/api/search-history', (_req, res) => {
  res.json({ enabled: false })
})
app.post('/api/search/consume', (req, res) => {
  // Logged-in users have unlimited searches.
  if (req.session?.githubUser) {
    return res.json({
      allowed: true,
      remaining: null,
      authenticated: true
    })
  }

  const limit = 3
  const used = Number(req.session?.guestSearches || 0)

  if (used >= limit) {
    return res.status(403).json({
      allowed: false,
      remaining: 0,
      authenticated: false,
      requiresLogin: true,
      error: 'Guest search limit reached. Please sign in with GitHub to continue.'
    })
  }

  const nextUsed = used + 1
  req.session.guestSearches = nextUsed

  return res.json({
    allowed: true,
    remaining: limit - nextUsed,
    authenticated: false
  })
})

app.post('/api/search/consume', (req, res) => {
  if (req.session?.githubUser) {
    return res.json({ allowed: true, authenticated: true, searchesRemaining: null })
  }

  const used = Number(req.session?.guestSearches || 0)
  if (used >= 3) {
    return res.status(401).json({
      allowed: false,
      authenticated: false,
      searchesRemaining: 0,
      loginRequired: true,
      error: 'You have used your 3 free searches. Sign in with GitHub to continue.'
    })
  }

  req.session.guestSearches = used + 1
  return res.json({
    allowed: true,
    authenticated: false,
    searchesRemaining: 3 - (used + 1)
  })
})

app.get('/api/dashboard/:username', async (req, res) => {
  const username = req.params.username.replace(/^@/, '').trim()
  const privateScope = userCanSeePrivate(req, username)
  const token = sessionToken(req)
  try {
    const data = await buildDashboard(username, token, privateScope)
    return res.json(data)
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: `GitHub user "${username}" was not found.` })

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
    console.error('Dashboard error:', error)
    return res.status(502).json({ error: error.message || 'Could not reach GitHub right now. Please try again.' })
  }
})

app.get('/api/compare/:left/:right', async (req, res) => {
  const left = req.params.left.replace(/^@/, '').trim()
  const right = req.params.right.replace(/^@/, '').trim()
  try {
    const [leftData, rightData] = await Promise.all([
      buildDashboard(left, sessionToken(req), userCanSeePrivate(req, left)),
      buildDashboard(right, sessionToken(req), userCanSeePrivate(req, right))
    ])
    res.json({ left: leftData, right: rightData })
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message })
    if (error.status === 429 || error.rate?.remaining === '0') return res.status(429).json({ error: 'GitHub is rate-limiting the comparison. Please wait and try again.', rateLimit: true })
    console.error('Compare error:', error)
    res.status(502).json({ error: error.message || 'Could not compare those profiles.' })
  }
})

app.post('/api/summary/:username', summaryLimiter, async (req, res) => {
  const username = req.params.username.replace(/^@/, '').trim()
  const summaryKey = cacheKey(username, userCanSeePrivate(req, username))
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
    const data = await buildDashboard(username, sessionToken(req), userCanSeePrivate(req, username))
    const text = generateDeveloperSummary(data)
    summaryCount += 1
    summaryCache.set(summaryKey, { summary: text, expires: Date.now() + 60 * 60 * 1000 })
    return res.json({ summary: text, model: 'deterministic-rules', cached: false })
  } catch (error) {
    console.error('Deterministic summary error:', error)
    return res.status(error.status === 429 ? 429 : 502).json({ error: error.message || 'The developer summary could not be generated right now.' })
  }
})

app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) return res.status(501).send('GitHub OAuth is not configured.')
  const state = crypto.randomBytes(24).toString('hex')
  // Create a signed state token to prevent tampering
  const signature = crypto.createHmac('sha256', sessionSecret).update(state).digest('hex')
  const signedState = `${state}.${signature}`
  // Set cookie (10 minutes maxAge)
  const cookieParts = [
    `oauth_state=${signedState}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=600',
    'SameSite=Lax',
    isProd ? 'Secure' : ''
  ].filter(Boolean)
  res.setHeader('Set-Cookie', cookieParts.join('; '))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.GITHUB_CALLBACK_URL || `http://127.0.0.1:${PORT}/auth/github/callback`,
    scope: 'read:user user:email',
    state
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})



app.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query
  // Retrieve and verify signed state from cookie
  const cookieHeader = req.headers.cookie || ''
  const match = cookieHeader.match(/oauth_state=([^;]+)/)
  const signedState = match ? decodeURIComponent(match[1]) : ''
  // Clear the cookie early (whether valid or not)
  const clearParts = [
    'oauth_state=; HttpOnly',
    'Path=/',
    'Max-Age=0',
    isProd ? 'Secure' : ''
  ].filter(Boolean)
  res.setHeader('Set-Cookie', clearParts.join('; '))
  if (!signedState) return res.status(400).send('Invalid OAuth state.')
  const [originalState, signature] = signedState.split('.')
  const expectedSig = crypto.createHmac('sha256', sessionSecret).update(originalState).digest('hex')
  if (state !== originalState || signature !== expectedSig) {
    return res.status(400).send('Invalid OAuth state.')
  }
  // Proceed with OAuth token exchange as before

  // `code` and `state` have been validated above
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL || `http://127.0.0.1:${PORT}/auth/github/callback`
      })
    })
    const tokenBody = await tokenResponse.json()
    if (!tokenBody.access_token) return res.status(502).send(tokenBody.error_description || 'GitHub OAuth failed.')

    const userResponse = await fetch('https://api.github.com/user', { headers: headersFor(tokenBody.access_token) })
    const user = await userResponse.json()
    req.session.githubAccessToken = tokenBody.access_token
    req.session.githubUser = { login: user.login, name: user.name, avatar_url: user.avatar_url }
    await req.session.save()
    res.redirect(clientOrigins[0])
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(502).send('GitHub sign-in failed.')
  }
})

app.post(['/auth/logout', '/api/auth/logout'], async (req, res) => {
  console.log(`[LOGOUT DIAGNOSTICS] ${req.method} ${req.url}`)
  console.log(`[LOGOUT DIAGNOSTICS] req.session exists: ${!!req.session}`)
  console.log(`[LOGOUT DIAGNOSTICS] req.session.destroy exists: ${!!(req.session && req.session.destroy)}`)
  try {
    if (req.session && req.session.destroy) {
      await req.session.destroy()
      console.log('[LOGOUT DIAGNOSTICS] req.session.destroy() succeeded')
    } else {
      console.log('[LOGOUT DIAGNOSTICS] req.session or destroy() missing, proceeding to clear cookie anyway')
    }
    // iron-session's destroy() clears the session data but does NOT expire the browser cookie.
    // We must explicitly overwrite the cookie with Max-Age=0 and expired date so the browser removes it.
    // Use the exact same cookie name and attributes as sessionOptions so the browser matches it.
    const clearCookieParts = [
      `${sessionOptions.cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`,
      'HttpOnly',
      `SameSite=${sessionOptions.cookieOptions.sameSite === 'lax' ? 'Lax' : sessionOptions.cookieOptions.sameSite}`,
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

// Local development serves the built frontend from Express. On Vercel, the
// frontend is served by Vercel and this Express app is exposed as a function.
if (process.env.VERCEL !== '1') {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next()
    res.sendFile(path.join(distPath, 'index.html'), (error) => {
      if (error) next()
    })
  })
}

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err)
  if (err.message?.includes('CORS')) return res.status(403).json({ error: err.message })
  res.status(500).json({ error: 'Unexpected server error.' })
})

export { calculateStreaks, flattenCalendar }
export default app

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Arsenic API running at http://localhost:${PORT}`)
    console.log(defaultToken ? 'GitHub authentication: ENABLED' : 'GitHub authentication: DISABLED — public API rate limit applies')
    console.log('Developer summary: ENABLED (deterministic, no external AI key required)')
    console.log(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? 'GitHub OAuth: ENABLED' : 'GitHub OAuth: DISABLED')
  })
}
