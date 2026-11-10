import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sealData } from 'iron-session'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app, { resolveSessionSecret } from '../server/index.js'
// @ts-expect-error – server/index.js is plain JS without declaration files
import * as serverModule from '../server/index.js'
import { calculateScore as calculateScoreModel, clampScore } from '../shared/score.js'
import { generateDeveloperSummary } from '../shared/summary.js'
import { DeveloperIntelligenceOverview } from '../client/src/components/DeveloperIntelligenceOverview'
import { ContributionHeatmap } from '../client/src/components/ContributionHeatmap'
import { ScoreBreakdown } from '../client/src/components/ScoreBreakdown'
import { compareMetric } from '../shared/intelligence.js'
import type { DeveloperIntelligence, RestActivityDimension } from '../shared/intelligence'
import { buildInsights } from '../client/src/lib/analytics'
import type { Dashboard } from '../client/src/types'

const SESSION_PASSWORD = resolveSessionSecret(process.env)

interface ServerModule {
  cacheKey: (username: string, tierOrScope?: unknown) => string
  cachedDashboard: (
    key: string,
    producer: () => Promise<Record<string, unknown>>,
    onStoreKey?: ((val: Record<string, unknown>) => string) | null
  ) => Promise<Record<string, unknown>>
  cache: Map<string, { value: Record<string, unknown>; expires: number }>
  summaryCache: Map<string, { summary: string; expires: number }>
  setSummaryCache: (key: string, summary: string) => void
  contributionsFromEvents: (events: unknown[] | null, options?: { eventsUnavailable?: boolean }) => {
    totalPullRequestContributions: number | null
    totalIssueContributions: number | null
    totalPullRequestReviewContributions: number | null
    restrictedContributionsCount: number
    contributionCalendar: {
      totalContributions: number | null
      weeks: Array<{
        contributionDays: Array<{
          date: string
          contributionCount: number
          weekday?: number
          isObserved?: boolean
        }>
      }>
    }
    dataQuality: {
      observationWindowDays: number
      isEstimated: boolean
      isTruncated: boolean
      eventsUnavailable?: boolean
      oldestEventDate: string | null
      eventCount: number
      observedDaysCount: number
    }
  }
  buildDashboard: (username: string, authToken: string | null, includePrivate?: boolean) => Promise<Record<string, unknown>>
  calculateScore?: (input: Record<string, unknown>) => unknown
  userCanSeePrivate: (req: unknown, username: string) => boolean
  isSelfUser: (req: unknown, username: string) => boolean
}

const {
  cacheKey,
  cachedDashboard,
  cache,
  summaryCache,
  setSummaryCache,
  contributionsFromEvents,
  calculateScore
} = serverModule as unknown as ServerModule

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; json: () => Record<string, unknown>; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Origin: 'http://127.0.0.1:5173',
          ...(options.headers ?? {}),
        },
        body: options.body,
      })
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key.toLowerCase()] = value
          })
          resolve({
            status: r.status,
            json: () => {
              try {
                return JSON.parse(text) as Record<string, unknown>
              } catch {
                return { raw: text }
              }
            },
            headers: hdrs,
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

async function createAuthCookie(sessionData: Record<string, unknown>): Promise<string> {
  const sealed = await sealData(sessionData, { password: SESSION_PASSWORD })
  return `session=${sealed}`
}

function mockGitHubUpstream(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const origFetch = globalThis.fetch
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (urlStr.includes('api.github.com')) {
      return handler(urlStr, init)
    }
    return origFetch(input, init)
  })
}

describe('M-01: Contribution Scoring Integrity, Data Quality & Cache Isolation', () => {
  beforeEach(() => {
    cache.clear()
    summaryCache.clear()
  })

  afterEach(() => {
    cache.clear()
    summaryCache.clear()
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Equivalent cadence across 90-day and 365-day observation windows
  // -------------------------------------------------------------------------
  describe('1. Equivalent Cadence Across Observation Windows', () => {
    it('awards 100% consistency at ~32.8% active cadence across both 90-day and 365-day windows', () => {
      // 365-day window: 120 active days out of 365 is the 32.8% benchmark
      const score365 = calculateScoreModel({
        activeDays: 120,
        prs: 10,
        issues: 10,
        reviews: 20,
        stars: 100,
        observationWindowDays: 365
      })

      // 90-day window: 30 active days out of 90 is ~33.3% (~32.8% benchmark target of ~29.6 days)
      const score90 = calculateScoreModel({
        activeDays: 30,
        prs: 3,
        issues: 3,
        reviews: 4,
        stars: 100,
        observationWindowDays: 90
      })

      expect(score365.breakdown.consistency).toBe(100)
      expect(score90.breakdown.consistency).toBe(100)
    })

    it('scales consistency proportionately for half-benchmark active cadence', () => {
      // 365 days: 60 active days = 50%
      const score365 = calculateScoreModel({
        activeDays: 60,
        observationWindowDays: 365
      })

      // 90 days: 15 active days = ~51% (15 / 29.589 = 50.7%)
      const score90 = calculateScoreModel({
        activeDays: 15,
        observationWindowDays: 90
      })

      expect(score365.breakdown.consistency).toBe(50)
      expect(score90.breakdown.consistency).toBe(51)
    })

    it('scales collaboration proportionally across observation windows in untruncated mode', () => {
      // 40 collaboration contributions in 365 days = 100%
      const score365 = calculateScoreModel({
        prs: 20,
        issues: 10,
        reviews: 10,
        observationWindowDays: 365
      })

      // 10 collaboration contributions in untruncated 90 days = 100% ((40/365)*90 = 9.86 -> 10/9.86 >= 100%)
      const score90 = calculateScoreModel({
        prs: 5,
        issues: 3,
        reviews: 2,
        observationWindowDays: 90
      })

      expect(score365.breakdown.collaboration).toBe(100)
      expect(score90.breakdown.collaboration).toBe(100)
    })
  })

  // -------------------------------------------------------------------------
  // 2. Incomplete REST event coverage (isTruncated flagged) & Collaboration Reassessment
  // -------------------------------------------------------------------------
  describe('2. Incomplete REST Event Coverage & Collaboration Reassessment', () => {
    it('flags isTruncated when 100 events span only a fraction of the 90-day window', () => {
      const now = new Date()
      // Create 100 events spanning only the last 15 days
      const events = Array.from({ length: 100 }, (_, i) => {
        const eventDate = new Date(now.getTime() - (i % 15) * 86400000)
        return {
          id: `evt-${i}`,
          type: 'PushEvent',
          created_at: eventDate.toISOString(),
          payload: { commits: [{ message: 'feat: change' }] }
        }
      })

      const result = contributionsFromEvents(events)
      expect(result.dataQuality).toBeDefined()
      expect(result.dataQuality.isTruncated).toBe(true)
      expect(result.dataQuality.oldestEventDate).toBeTruthy()
      expect(result.dataQuality.eventCount).toBe(100)
      expect(result.dataQuality.observedDaysCount).toBeLessThan(90)

      // Days before oldestEventDate must be marked as not observed
      const unobservedDays = result.contributionCalendar.weeks[0].contributionDays.filter(
        (d: { isObserved?: boolean }) => !d.isObserved
      )
      expect(unobservedDays.length).toBeGreaterThan(0)
    })

    it('does not flag isTruncated when event count is below page limit', () => {
      const now = new Date()
      const events = Array.from({ length: 25 }, (_, i) => {
        const eventDate = new Date(now.getTime() - i * 86400000)
        return {
          id: `evt-${i}`,
          type: 'PushEvent',
          created_at: eventDate.toISOString(),
          payload: { commits: [{ message: 'feat: change' }] }
        }
      })

      const result = contributionsFromEvents(events)
      expect(result.dataQuality.isTruncated).toBe(false)
      expect(result.dataQuality.eventCount).toBe(25)

      // All days should be marked as observed
      const allObserved = result.contributionCalendar.weeks[0].contributionDays.every(
        (d: { isObserved?: boolean }) => Boolean(d.isObserved)
      )
      expect(allObserved).toBe(true)
    })

    it('represents collaboration as null and renormalizes score when isTruncated is true', () => {
      // 14 active days observed in an events feed that only spanned 20 days due to truncation
      const scoreWithTruncation = calculateScoreModel({
        activeDays: 14,
        prs: 5,
        issues: 3,
        reviews: 2,
        stars: 100,
        observationWindowDays: 90,
        dataQuality: {
          isTruncated: true,
          observedDaysCount: 20
        }
      })

      // In truncated feeds, collaboration is non-comparable to yearly totals and is marked unavailable (null)
      expect(scoreWithTruncation.breakdown.collaboration).toBeNull()
      // Consistency scales against the 20-day observed window: 14 / ((120/365)*20 = 6.57) = 100%
      expect(scoreWithTruncation.breakdown.consistency).toBe(100)
      // Score is valid and reweighted across consistency (45/70) and impact (25/70)
      expect(scoreWithTruncation.score).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // 3. Zero-event and empty-calendar cases
  // -------------------------------------------------------------------------
  describe('3. Zero-Event and Empty-Calendar Cases', () => {
    it('handles empty events array cleanly without crashing or producing NaN', () => {
      const result = contributionsFromEvents([])
      expect(result.contributionCalendar.totalContributions).toBe(0)
      expect(result.totalPullRequestContributions).toBe(0)
      expect(result.totalIssueContributions).toBe(0)
      expect(result.totalPullRequestReviewContributions).toBe(0)
      expect(result.dataQuality.isTruncated).toBe(false)
      expect(result.dataQuality.eventsUnavailable).toBe(false)
      expect(result.dataQuality.eventCount).toBe(0)
      expect(result.dataQuality.oldestEventDate).toBeNull()
    })

    it('calculates score with zero metrics cleanly', () => {
      const score = calculateScoreModel({})
      expect(score.score).toBe(0)
      expect(score.breakdown.consistency).toBe(0)
      expect(score.breakdown.collaboration).toBe(0)
      expect(score.breakdown.impact).toBe(0)
      expect(Number.isNaN(score.score)).toBe(false)
    })

    it('generates summary for zero-activity developer without NaN or crashes', () => {
      const summary = generateDeveloperSummary({
        user: { login: 'inactive-dev' },
        repos: [],
        languages: [],
        contributions: { total: 0, activeDays: 0, currentStreak: 0, longestStreak: 0 },
        score: { score: 0, raw: { activeDays: 0, totalContributions: 0, prs: 0, issues: 0, reviews: 0 } },
        timing: { commitsSampled: 0 }
      })
      expect(summary).toBeTruthy()
      expect(typeof summary).toBe('string')
      expect(summary).not.toContain('NaN')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Invalid and missing dates handling
  // -------------------------------------------------------------------------
  describe('4. Invalid and Missing Dates Handling', () => {
    it('safely skips events with null, invalid, or missing created_at', () => {
      const events = [
        { type: 'PushEvent', created_at: null },
        { type: 'PushEvent', created_at: 'not-a-valid-date' },
        { type: 'PushEvent', created_at: '' },
        { type: 'PushEvent' },
        { type: 'PushEvent', created_at: new Date().toISOString(), payload: { commits: [1] } }
      ]

      const result = contributionsFromEvents(events)
      expect(result.contributionCalendar.totalContributions).toBe(1)
      expect(result.dataQuality.eventCount).toBe(5)
    })

    it('clamps negative, non-numeric, or null score inputs cleanly', () => {
      expect(clampScore(null)).toBe(0)
      expect(clampScore(undefined)).toBe(0)
      expect(clampScore(NaN)).toBe(0)
      expect(clampScore(-50)).toBe(0)
      expect(clampScore(150)).toBe(100)
      expect(clampScore('85')).toBe(85)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Estimated and GraphQL cache isolation
  // -------------------------------------------------------------------------
  describe('5. Estimated and GraphQL Cache Isolation', () => {
    it('generates distinct cache keys for private, verified, and estimated tiers', () => {
      expect(cacheKey('torvalds', 'private')).toBe('v3:torvalds::private')
      expect(cacheKey('torvalds', true)).toBe('v3:torvalds::private')
      expect(cacheKey('torvalds', 'verified')).toBe('v3:torvalds::verified')
      expect(cacheKey('torvalds', 'estimated')).toBe('v3:torvalds::estimated')
      expect(cacheKey('torvalds', 'public')).toBe('v3:torvalds::public')
    })

    it('ensures a cached estimated result does NOT satisfy a verified GraphQL lookup', async () => {
      const estimatedPayload = {
        user: { login: 'octocat' },
        estimated: true,
        api: { cached: false }
      }
      cache.set('octocat::estimated', { value: estimatedPayload, expires: Date.now() + 60000 })

      let producerCalled = false
      const verifiedPayload = {
        user: { login: 'octocat' },
        estimated: false,
        api: { cached: false }
      }

      const result = await cachedDashboard('octocat::verified', async () => {
        producerCalled = true
        return verifiedPayload
      })

      expect(producerCalled).toBe(true)
      expect(result.estimated).toBe(false)
      expect(cache.has('octocat::verified')).toBe(true)
      expect(cache.has('octocat::estimated')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // 6. Cache population in both request orders & Summary Cache Pruning
  // -------------------------------------------------------------------------
  describe('6. Cache Population in Both Request Orders & Summary Eviction', () => {
    it('Order 1: Guest request (estimated) followed by Auth request (verified)', async () => {
      await cachedDashboard('alice::estimated', async () => ({
        user: { login: 'alice' },
        estimated: true
      }))
      expect(cache.has('alice::estimated')).toBe(true)
      expect(cache.has('alice::verified')).toBe(false)

      let authFetched = false
      const authResult = await cachedDashboard('alice::verified', async () => {
        authFetched = true
        return { user: { login: 'alice' }, estimated: false }
      })

      expect(authFetched).toBe(true)
      expect(authResult.estimated).toBe(false)
      expect(cache.has('alice::estimated')).toBe(true)
      expect(cache.has('alice::verified')).toBe(true)
    })

    it('Order 2: Auth request (verified) followed by Guest request (estimated)', async () => {
      await cachedDashboard('bob::verified', async () => ({
        user: { login: 'bob' },
        estimated: false
      }))
      expect(cache.has('bob::verified')).toBe(true)
      expect(cache.has('bob::estimated')).toBe(false)

      let guestFetched = false
      const guestResult = await cachedDashboard('bob::estimated', async () => {
        guestFetched = true
        return { user: { login: 'bob' }, estimated: true }
      })

      expect(guestFetched).toBe(true)
      expect(guestResult.estimated).toBe(true)
      expect(cache.has('bob::verified')).toBe(true)
      expect(cache.has('bob::estimated')).toBe(true)
    })

    it('bypasses expired cache entries and calls producer', async () => {
      cache.set('carol::verified', {
        value: { user: { login: 'carol' }, api: { cached: false } },
        expires: Date.now() - 1000
      })

      let freshProduced = false
      const result = await cachedDashboard('carol::verified', async () => {
        freshProduced = true
        return { user: { login: 'carol' }, fresh: true, api: { cached: false } }
      })

      expect(freshProduced).toBe(true)
      expect(result.fresh).toBe(true)
    })

    it('summaryCache evicts expired entries and enforces upper bound', () => {
      const now = Date.now()
      // Seed 205 entries: 100 expired, 105 active
      for (let i = 0; i < 100; i++) {
        summaryCache.set(`user-old-${i}::estimated`, { summary: 'old', expires: now - 5000 })
      }
      for (let i = 0; i < 105; i++) {
        summaryCache.set(`user-active-${i}::estimated`, { summary: 'active', expires: now + 60000 })
      }

      expect(summaryCache.size).toBe(205)

      // Add a new entry through setSummaryCache
      setSummaryCache('newuser::verified', 'new summary')

      // Expired entries should be pruned, keeping size within 201
      expect(summaryCache.size).toBeLessThanOrEqual(201)
      expect(summaryCache.get('newuser::verified')?.summary).toBe('new summary')
      expect(summaryCache.get('user-old-0::estimated')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // 7. Events API failure handling
  // -------------------------------------------------------------------------
  describe('7. Events API Failure Handling', () => {
    it('sets eventsUnavailable: true and nulls score when events retrieval fails', () => {
      const result = contributionsFromEvents(null, { eventsUnavailable: true })

      expect(result.dataQuality.eventsUnavailable).toBe(true)
      expect(result.dataQuality.isTruncated).toBe(true)
      expect(result.dataQuality.observedDaysCount).toBe(0)
      expect(result.contributionCalendar.totalContributions).toBeNull()

      const days = result.contributionCalendar.weeks[0].contributionDays
      expect(days.every((d: { isObserved?: boolean }) => d.isObserved === false)).toBe(true)

      const score = calculateScoreModel({
        activeDays: 0,
        stars: 50,
        forks: 5,
        followers: 10,
        dataQuality: result.dataQuality
      })

      expect(score.score).toBeNull()
      expect(score.breakdown.consistency).toBeNull()
      expect(score.breakdown.collaboration).toBeNull()
      expect(score.breakdown.impact).toBeGreaterThan(0)
    })

    it('calculateScore wrapper is retired from server exports in M-03', () => {
      expect(calculateScore).toBeUndefined()
    })

    it('summary generator handles eventsUnavailable gracefully without claiming zero activity', () => {
      const summary = generateDeveloperSummary({
        user: { login: 'failevents-user', name: 'Failed Events' },
        repos: [{ status: 'active', stargazers_count: 50, forks_count: 5 }],
        languages: [{ name: 'TypeScript', size: 1000 }],
        contributions: { total: null, activeDays: null, currentStreak: 0, longestStreak: 0 },
        score: { score: null, breakdown: { consistency: null, collaboration: null, impact: 60 } },
        dataQuality: { eventsUnavailable: true, isEstimated: true, isTruncated: true }
      })

      expect(summary).toBeTruthy()
      expect(summary).not.toContain('NaN')
      expect(summary).not.toContain('limited consistency')
      expect(summary).toContain('verified repository')
    })
  })

  // -------------------------------------------------------------------------
  // 8. HTTP-Level Integration Tests (inProcessFetch)
  // -------------------------------------------------------------------------
  describe('8. HTTP-Level Integration Tests', () => {
    it('Requirement 1: Guest request uses estimated REST data; subsequent authenticated request uses verified GraphQL data', async () => {
      const targetUser = 'tiereduser'
      let graphqlCalled = false
      let restEventsCalled = false

      mockGitHubUpstream((url) => {
        if (url.includes('/graphql')) {
          graphqlCalled = true
          return new Response(JSON.stringify({
            data: {
              user: {
                login: targetUser,
                name: 'Tiered User',
                avatarUrl: 'https://example.com/avatar.png',
                bio: 'Bio',
                websiteUrl: null,
                location: null,
                createdAt: '2020-01-01T00:00:00Z',
                repositories: { nodes: [], pageInfo: { hasNextPage: false } },
                contributionsCollection: {
                  totalCommitContributions: 100,
                  totalPullRequestContributions: 10,
                  totalIssueContributions: 5,
                  totalPullRequestReviewContributions: 5,
                  restrictedContributionsCount: 0,
                  contributionCalendar: {
                    totalContributions: 120,
                    weeks: [{ contributionDays: [{ date: '2026-11-01', contributionCount: 2, weekday: 0 }] }]
                  }
                }
              },
              rateLimit: { remaining: 4990, resetAt: '2026-11-10T02:00:00Z' }
            }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}/events/public`)) {
          restEventsCalled = true
          return new Response(JSON.stringify([
            { id: 'evt-1', type: 'PushEvent', created_at: new Date().toISOString(), payload: { commits: [1] } }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}/repos`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}`)) {
          return new Response(JSON.stringify({ login: targetUser }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response('Not Found', { status: 404 })
      })

      // 1. Guest request (unauthenticated)
      const guestRes = await inProcessFetch(`/api/dashboard/${targetUser}`)
      expect(guestRes.status).toBe(200)
      const guestData = guestRes.json()
      expect(guestData.estimated).toBe(true)
      expect(guestData.dataQuality).toBeDefined()
      expect(cache.has(`v3:${targetUser}::estimated`)).toBe(true)
      expect(cache.has(`v3:${targetUser}::verified`)).toBe(false)
      expect(restEventsCalled).toBe(true)

      // 2. Authenticated request for targetUser's profile
      const authCookie = await createAuthCookie({
        githubUser: { login: targetUser },
        githubAccessToken: 'token-valid-auth',
        hasPrivateContributionsScope: false
      })

      const authRes = await inProcessFetch(`/api/dashboard/${targetUser}`, {
        headers: { Cookie: authCookie }
      })

      expect(authRes.status).toBe(200)
      const authData = authRes.json()
      expect(authData.estimated).toBe(false)
      expect(graphqlCalled).toBe(true)
      expect(cache.has(`v3:${targetUser}::verified`)).toBe(true)
      expect(cache.has(`v3:${targetUser}::estimated`)).toBe(true)
    })

    it('Requirement 2: GraphQL 429 and 500 failures fall back to estimated REST data and store under estimated cache tier', async () => {
      const targetUser = 'ratelimiteduser'

      mockGitHubUpstream((url) => {
        if (url.includes('/graphql')) {
          // Upstream GraphQL rate limited (HTTP 429)
          return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        if (url.includes(`/users/${targetUser}/events/public`)) {
          return new Response(JSON.stringify([
            { id: 'evt-1', type: 'PushEvent', created_at: new Date().toISOString(), payload: { commits: [1] } }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}/repos`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}`)) {
          return new Response(JSON.stringify({ login: targetUser }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response('Not Found', { status: 404 })
      })

      const authCookie = await createAuthCookie({
        githubUser: { login: targetUser },
        githubAccessToken: 'token-fallback',
        hasPrivateContributionsScope: false
      })

      const res = await inProcessFetch(`/api/dashboard/${targetUser}`, {
        headers: { Cookie: authCookie }
      })

      expect(res.status).toBe(200)
      const data = res.json()
      expect(data.estimated).toBe(true)
      // Stored in ::estimated tier
      expect(cache.has(`v3:${targetUser}::estimated`)).toBe(true)
      // ::verified tier was NOT poisoned
      expect(cache.has(`v3:${targetUser}::verified`)).toBe(false)
    })

    it('Requirement 3: Public events pagination fetches page 2 when appropriate and never fetches page 3', async () => {
      const targetUser = 'pageduser'
      const requestedUrls: string[] = []
      const now = new Date()

      mockGitHubUpstream((url) => {
        requestedUrls.push(url)

        if (url.includes(`/users/${targetUser}/events/public?per_page=100&page=2`)) {
          // Page 2 returns 100 events
          const page2Events = Array.from({ length: 100 }, (_, i) => ({
            id: `p2-evt-${i}`,
            type: 'PushEvent',
            created_at: new Date(now.getTime() - (20 + (i % 10)) * 86400000).toISOString(),
            payload: { commits: [1] }
          }))
          return new Response(JSON.stringify(page2Events), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}/events/public`)) {
          // Page 1 returns 100 events spanning only 15 days
          const page1Events = Array.from({ length: 100 }, (_, i) => ({
            id: `p1-evt-${i}`,
            type: 'PushEvent',
            created_at: new Date(now.getTime() - (i % 15) * 86400000).toISOString(),
            payload: { commits: [1] }
          }))
          return new Response(JSON.stringify(page1Events), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}/repos`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}`)) {
          return new Response(JSON.stringify({ login: targetUser }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response('Not Found', { status: 404 })
      })

      const res = await inProcessFetch(`/api/dashboard/${targetUser}`)
      expect(res.status).toBe(200)
      const data = res.json()

      // Verify page 1 and page 2 were requested, but page 3 was never requested
      expect(requestedUrls.some(u => u.includes('events/public?per_page=100') && !u.includes('page=2'))).toBe(true)
      expect(requestedUrls.some(u => u.includes('events/public?per_page=100&page=2'))).toBe(true)
      expect(requestedUrls.some(u => u.includes('page=3'))).toBe(false)

      const dq = data.dataQuality as Record<string, unknown>
      expect(dq.eventCount).toBe(200)
      expect(dq.isTruncated).toBe(true)
      // M-03 Score retirement: score is retired from API responses, replaced with multidimensional intelligence
      expect(data.score).toBeUndefined()
      expect(data.intelligence).toBeDefined()
      const intel = data.intelligence as DeveloperIntelligence
      const act = intel.activity as RestActivityDimension
      expect(act.collectionState).toBe('limit_reached')
      expect(intel.engagement.collectionState).toBe('limit_reached')
    })

    it('Requirement 4: Failed page-one events retrieval does not produce a confirmed zero-activity dashboard', async () => {
      const targetUser = 'faileventsuser'

      mockGitHubUpstream((url) => {
        if (url.includes(`/users/${targetUser}/events/public`)) {
          // GitHub events endpoint fails with 502 Bad Gateway
          return new Response(JSON.stringify({ message: 'Bad Gateway' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        if (url.includes(`/users/${targetUser}/repos`)) {
          return new Response(JSON.stringify([
            { id: 1, name: 'active-repo', stargazers_count: 50, forks_count: 5, open_issues_count: 2, pushed_at: new Date().toISOString() }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        if (url.includes(`/users/${targetUser}`)) {
          return new Response(JSON.stringify({ login: targetUser, followers: 20 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response('Not Found', { status: 404 })
      })

      const res = await inProcessFetch(`/api/dashboard/${targetUser}`)
      expect(res.status).toBe(200)
      const data = res.json()

      const dq = data.dataQuality as Record<string, unknown>
      expect(dq.eventsUnavailable).toBe(true)
      expect(dq.isTruncated).toBe(true)
      expect(dq.observedDaysCount).toBe(0)

      const contribs = data.contributions as Record<string, unknown>
      expect(contribs.total).toBeNull()
      expect(contribs.activeDays).toBeNull()

      // M-03 Score retirement: score is retired from API responses, replaced with multidimensional intelligence
      expect(data.score).toBeUndefined()
      expect(data.intelligence).toBeDefined()
      const intel = data.intelligence as DeveloperIntelligence
      const act = intel.activity as RestActivityDimension
      expect(act.collectionState).toBe('unavailable')
      expect(act.observedPublicEventDaysCount.state).toBe('unavailable')
    })

    it('Requirement 5: An unauthenticated request cannot receive private cached data', async () => {
      const targetUser = 'privateisolationuser'

      // Pre-seed cache with private data
      cache.set(`${targetUser}::private`, {
        value: {
          user: { login: targetUser },
          privateContributions: true,
          privateContributionsStatus: 'included',
          api: { cached: true }
        },
        expires: Date.now() + 60000
      })

      mockGitHubUpstream((url) => {
        if (url.includes(`/users/${targetUser}/events/public`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes(`/users/${targetUser}/repos`)) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes(`/users/${targetUser}`)) {
          return new Response(JSON.stringify({ login: targetUser }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response('Not Found', { status: 404 })
      })

      // Unauthenticated request
      const res = await inProcessFetch(`/api/dashboard/${targetUser}`)
      expect(res.status).toBe(200)
      const data = res.json()

      // Must not receive privateContributions: true
      expect(data.privateContributions).toBe(false)
      expect(data.privateContributionsStatus).toBe('unavailable')
    })
  })

  // -------------------------------------------------------------------------
  // 9. Frontend and Summary Defect Regression Tests
  // -------------------------------------------------------------------------
  describe('9. Frontend and Summary Defect Regression Tests', () => {
    function makeRestActivity(overrides: Partial<RestActivityDimension> = {}): RestActivityDimension {
      return {
        source: 'rest_event_stream',
        collectionState: 'complete',
        retrievedEventsCount: 180,
        observationWindowStart: '2026-08-03T00:00:00.000Z',
        observationWindowEnd: '2026-11-01T00:00:00.000Z',
        observationWindowDays: 90,
        observedPublicEventDaysCount: { state: 'observed', value: 45 },
        observedPublicEventDateStreakDays: { state: 'observed', value: 12 },
        totalObservedPublicEvents: { state: 'observed', value: 180 },
        ...overrides
      }
    }

    function makeDashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
      const base: Dashboard = {
        user: {
          login: 'fixtureuser',
          name: 'Fixture User',
          avatar_url: 'https://example.com/avatar.png',
          bio: 'Developer bio',
          html_url: 'https://github.com/fixtureuser',
          public_repos: 5,
          followers: 40,
          following: 10,
          created_at: '2021-01-01T00:00:00Z',
          location: 'Remote',
          blog: null
        },
        repos: [
          {
            id: 1,
            name: 'primary-repo',
            html_url: 'https://github.com/fixtureuser/primary-repo',
            description: 'Core project',
            language: 'TypeScript',
            languageColor: '#3178c6',
            stargazers_count: 50,
            forks_count: 10,
            open_issues_count: 1,
            updated_at: '2026-11-01T00:00:00Z',
            pushed_at: '2026-11-01T00:00:00Z',
            fork: false,
            archived: false,
            status: 'active'
          }
        ],
        events: [],
        contributions: {
          days: Array.from({ length: 90 }, (_, i) => ({
            date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
            contributionCount: 2,
            isObserved: true
          })),
          total: 180,
          activeDays: 45,
          currentStreak: 5,
          longestStreak: 12,
          privateContributionCount: 0
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: false,
          eventsUnavailable: false,
          oldestEventDate: '2026-08-01',
          eventCount: 180,
          observedDaysCount: 90
        },
        observationWindowDays: 90,
        languages: [{ name: 'TypeScript', size: 10000, pct: 100, color: '#3178c6' }],
        timing: {
          commitsSampled: 25,
          hours: Array.from({ length: 24 }, (_, i) => (i === 14 ? 15 : 0)),
          weekdays: Array.from({ length: 7 }, (_, i) => (i === 2 ? 20 : 0))
        },
        intelligence: {
          schemaVersion: '3.2.0',
          collectedAt: '2026-11-01T00:00:00.000Z',
          activity: makeRestActivity(),
          adoption: {
            snapshotType: 'current_point_in_time',
            repositoryCoverage: {
              totalOwnedPublicRepos: 1,
              observedNonForkRepos: 1,
              totalEligibleNonForkRepos: 1,
              isComplete: true,
              retrievalCap: 250
            },
            totalStargazersCount: { state: 'observed', value: 50 },
            nonArchivedRepoStarsCount: { state: 'observed', value: 50 },
            archivedRepoStarsCount: { state: 'zero', value: 0 },
            forksCount: { state: 'observed', value: 10 },
            followersCount: { state: 'observed', value: 40 }
          },
          maintenance: {
            repositoryCoverage: {
              totalOwnedPublicRepos: 1,
              observedNonForkRepos: 1,
              totalEligibleNonForkRepos: 1,
              isComplete: true,
              retrievalCap: 250
            },
            observationWindowStart: '2026-08-03T00:00:00.000Z',
            observationWindowEnd: '2026-11-01T00:00:00.000Z',
            observationWindowDays: 90,
            activeCount: { state: 'observed', value: 1 },
            inactiveCount: { state: 'zero', value: 0 },
            archivedCount: { state: 'zero', value: 0 },
            unknownCount: { state: 'zero', value: 0 }
          },
          engagement: {
            source: 'rest_event_stream',
            collectionState: 'complete',
            retrievedEventsCount: 180,
            observationWindowStart: '2026-08-03T00:00:00.000Z',
            observationWindowEnd: '2026-11-01T00:00:00.000Z',
            observationWindowDays: 90,
            pullRequestEventActionsCount: { state: 'observed', value: 5 },
            pullRequestReviewEventActionsCount: { state: 'observed', value: 5 },
            issueEventActionsCount: { state: 'observed', value: 5 },
            issueCommentEventActionsCount: { state: 'zero', value: 0 }
          }
        },
        score: {
          score: 75,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 80, collaboration: 60, impact: 70 },
          raw: {
            activeDays: 45,
            totalContributions: 180,
            prs: 5,
            issues: 5,
            reviews: 5,
            stars: 50,
            forks: 10,
            currentStreak: 5,
            longestStreak: 12,
            timingSamples: 25,
            observationWindowDays: 90,
            targetActiveDays: 29.6
          }
        },
        authenticated: false,
        estimated: true,
        privateContributions: false,
        privateContributionsStatus: 'unavailable',
        api: {
          cached: false,
          cacheTtlSeconds: 1800,
          graphqlRemaining: null,
          graphqlReset: null,
          restRemaining: '4500'
        }
      }
      return { ...base, ...overrides }
    }

    // Requirement 1: No inactivity statement after failed events retrieval
    it('1. Never generates an inactivity statement after failed events retrieval', () => {
      const summary = generateDeveloperSummary({
        user: { login: 'failedstream', name: 'Failed Stream' },
        repos: [{ status: 'active', stargazers_count: 500, forks_count: 50 }],
        languages: [{ name: 'TypeScript', size: 5000 }],
        contributions: { total: null, activeDays: null, currentStreak: 0, longestStreak: 0 },
        score: {
          score: null,
          scoringModel: 'unavailable',
          breakdown: { consistency: null, collaboration: null, impact: 65 }
        },
        dataQuality: { eventsUnavailable: true, isEstimated: true, isTruncated: true }
      })

      expect(summary).not.toContain('No contribution activity was recorded')
      expect(summary).not.toContain('No public pull-request')
      expect(summary).not.toContain('limited consistency')
      expect(summary).not.toContain('0 contributions')
      expect(summary).toContain('repository impact')
      expect(summary).toContain('verified repository')
    })

    // Requirement 2: Successful empty events feed still correctly reports zero activity
    it('2. Successful empty events feed still correctly reports confirmed zero activity', () => {
      const summary = generateDeveloperSummary({
        user: { login: 'trulyinactive', name: 'Truly Inactive' },
        repos: [{ status: 'stale', stargazers_count: 200, forks_count: 20 }],
        languages: [{ name: 'Python', size: 3000 }],
        contributions: { total: 0, activeDays: 0, currentStreak: 0, longestStreak: 0 },
        score: {
          score: 15,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 0, collaboration: 0, impact: 45 },
          raw: { totalContributions: 0, activeDays: 0, prs: 0, issues: 0, reviews: 0 }
        },
        dataQuality: { eventsUnavailable: false, isEstimated: true, isTruncated: false }
      })

      expect(summary).toContain('No contribution activity was recorded in the analyzed window')
    })

    // Requirement 3: No literal "null" in score/contribution UI labels or analytics
    it('3. Does not render literal null in score or contribution UI labels or analytics', () => {
      const unavailDash = makeDashboardFixture({
        contributions: {
          days: Array.from({ length: 90 }, () => ({ date: '2026-10-01', contributionCount: 0, isObserved: false })),
          total: null,
          activeDays: null,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0
        },
        score: {
          score: null,
          scoringModel: 'unavailable',
          breakdown: { consistency: null, collaboration: null, impact: 40 },
          raw: {
            activeDays: null,
            totalContributions: null,
            prs: null,
            issues: null,
            reviews: null,
            stars: 50,
            forks: 10,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0
          }
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: true,
          eventsUnavailable: true,
          oldestEventDate: null,
          eventCount: 0,
          observedDaysCount: 0
        }
      })

      // Analytics insights
      const insights = buildInsights(unavailDash)
      for (const str of insights) {
        expect(str).not.toMatch(/\bnull\b/i)
      }
      expect(insights.some(s => s.includes('unobserved'))).toBe(true)

      // DeveloperIntelligenceOverview
      const overviewMarkup = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: unavailDash })
      )
      expect(overviewMarkup).not.toContain('null/100')
      expect(overviewMarkup).not.toContain('null%')
      expect(overviewMarkup).not.toContain('null Days')
      expect(overviewMarkup).not.toContain('null active')

      // ScoreBreakdown
      const breakdownMarkup = renderToStaticMarkup(
        React.createElement(ScoreBreakdown, { score: unavailDash.score })
      )
      expect(breakdownMarkup).not.toContain('null')
      expect(breakdownMarkup).toContain('Insufficient contribution telemetry')
    })

    // Requirement 4: No Solo Cadence badge when telemetry is unavailable
    it('4. Does not award Solo Cadence badge when telemetry is unavailable', () => {
      const unavailDash = makeDashboardFixture({
        score: {
          score: null,
          scoringModel: 'unavailable',
          breakdown: { consistency: null, collaboration: null, impact: 50 },
          raw: {
            activeDays: null,
            totalContributions: null,
            prs: null,
            issues: null,
            reviews: null,
            stars: 50,
            forks: 10,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0
          }
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: true,
          eventsUnavailable: true,
          oldestEventDate: null,
          eventCount: 0
        }
      })

      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: unavailDash })
      )

      expect(html).not.toContain('Solo Cadence')
      expect(html).toContain('Telemetry Partial')
    })

    // Requirement 5: Heatmap distinguishes unobserved days from zero-contribution days
    it('5. Distinguishes unobserved heatmap days from zero-contribution days', () => {
      // Unobserved days
      const unavailDash = makeDashboardFixture({
        contributions: {
          days: [
            { date: '2026-10-01', contributionCount: 0, isObserved: false },
            { date: '2026-10-02', contributionCount: 0, isObserved: false }
          ],
          total: null,
          activeDays: null,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: true,
          eventsUnavailable: true,
          oldestEventDate: null,
          eventCount: 0
        }
      })

      const unobservedHtml = renderToStaticMarkup(
        React.createElement(ContributionHeatmap, { data: unavailDash })
      )
      expect(unobservedHtml).toContain('levelUnobserved')
      expect(unobservedHtml).toContain('Activity unobserved')
      expect(unobservedHtml).not.toContain('0 contributions')

      // Observed zero activity
      const zeroDash = makeDashboardFixture({
        contributions: {
          days: [
            { date: '2026-10-01', contributionCount: 0, isObserved: true },
            { date: '2026-10-02', contributionCount: 0, isObserved: true }
          ],
          total: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: false,
          eventsUnavailable: false,
          oldestEventDate: '2026-10-01',
          eventCount: 0
        }
      })

      const zeroHtml = renderToStaticMarkup(
        React.createElement(ContributionHeatmap, { data: zeroDash })
      )
      expect(zeroHtml).toContain('level0')
      expect(zeroHtml).toContain('0 contributions')
      expect(zeroHtml).not.toContain('levelUnobserved')
    })

    // Requirement 6: Multidimensional metric comparison prohibits declaring an overall winner when comparing incompatible sources
    it('6. Cannot compare activity metrics between incompatible data sources', () => {
      const completeProfile = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: {
            source: 'graphql_calendar',
            observationWindowStart: '2025-11-01T00:00:00.000Z',
            observationWindowEnd: '2026-11-01T00:00:00.000Z',
            observationWindowDays: 365,
            recordedContributionDaysCount: { state: 'observed', value: 60 },
            contributionCurrentStreakDays: { state: 'observed', value: 5 },
            contributionLongestStreakDays: { state: 'observed', value: 12 },
            totalRecordedContributions: { state: 'observed', value: 180 },
            privateContributionsCount: { state: 'unavailable', value: null, note: 'none' }
          }
        }
      })

      const restProfile = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            observedPublicEventDaysCount: { state: 'observed', value: 60 }
          })
        }
      })

      const compGraphql = compareMetric(completeProfile, restProfile, 'graphql_recorded_contribution_days')
      expect(compGraphql.eligible).toBe(false)
      expect(compGraphql.reason).toContain('source')

      const compRest = compareMetric(completeProfile, restProfile, 'rest_observed_public_event_days')
      expect(compRest.eligible).toBe(false)
      expect(compRest.reason).toContain('source')
    })

    // Requirement 7: Metric Comparison Winner Policy
    it('7. Metric comparison declares winner or tie on eligible metrics; incomplete activity always locks comparison', () => {
      const aliceComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          adoption: {
            ...makeDashboardFixture().intelligence!.adoption,
            totalStargazersCount: { state: 'observed', value: 150 }
          }
        }
      })

      const bobComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          adoption: {
            ...makeDashboardFixture().intelligence!.adoption,
            totalStargazersCount: { state: 'observed', value: 50 }
          }
        }
      })

      const tieComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'charlie' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          adoption: {
            ...makeDashboardFixture().intelligence!.adoption,
            totalStargazersCount: { state: 'observed', value: 150 }
          }
        }
      })

      // Complete vs complete: metric winner / tie behavior
      const compAliceBob = compareMetric(aliceComplete, bobComplete, 'repo_total_stars')
      expect(compAliceBob.eligible).toBe(true)
      expect(compAliceBob.winner).toBe('profile_a')

      const compAliceTie = compareMetric(aliceComplete, tieComplete, 'repo_total_stars')
      expect(compAliceTie.eligible).toBe(true)
      expect(compAliceTie.winner).toBe('tie')

      // Truncated / limit_reached activity stream: cannot declare activity winner
      const truncated12d = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'limit_reached',
            retrievedEventsCount: 200,
            observedPublicEventDaysCount: { state: 'partial', value: 12, isLowerBound: true, note: 'truncated' }
          }),
          engagement: {
            ...makeDashboardFixture().intelligence!.engagement,
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          }
        }
      })

      const truncated75d = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'limit_reached',
            retrievedEventsCount: 200,
            observedPublicEventDaysCount: { state: 'partial', value: 75, isLowerBound: true, note: 'truncated' }
          }),
          engagement: {
            ...makeDashboardFixture().intelligence!.engagement,
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          }
        }
      })

      const compTruncated = compareMetric(truncated12d, truncated75d, 'rest_observed_public_event_days')
      expect(compTruncated.eligible).toBe(false)
      expect(compTruncated.reason).toContain('complete')
    })

    it('8. Independent metrics remain comparable when activity telemetry is limited or truncated', () => {
      const truncatedLeft = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice', name: 'Alice Dev', followers: 120 },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          }),
          engagement: {
            ...makeDashboardFixture().intelligence!.engagement,
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          },
          adoption: {
            ...makeDashboardFixture().intelligence!.adoption,
            followersCount: { state: 'observed', value: 120 },
            totalStargazersCount: { state: 'observed', value: 80 }
          }
        }
      })

      const truncatedRight = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob', name: 'Bob Dev', followers: 45 },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          }),
          engagement: {
            ...makeDashboardFixture().intelligence!.engagement,
            collectionState: 'limit_reached',
            retrievedEventsCount: 200
          },
          adoption: {
            ...makeDashboardFixture().intelligence!.adoption,
            followersCount: { state: 'observed', value: 45 },
            totalStargazersCount: { state: 'observed', value: 110 }
          }
        }
      })

      // Followers comparison is eligible even though activity is truncated
      const compFollowers = compareMetric(truncatedLeft, truncatedRight, 'account_followers')
      expect(compFollowers.eligible).toBe(true)
      expect(compFollowers.winner).toBe('profile_a')

      // Stars comparison is eligible independently
      const compStars = compareMetric(truncatedLeft, truncatedRight, 'repo_total_stars')
      expect(compStars.eligible).toBe(true)
      expect(compStars.winner).toBe('profile_b')
    })

    // Requirement 9: Unavailable scores and metrics never generate a winner
    it('9. Unavailable scores and metrics never generate a winner', () => {
      const aliceUnavail = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'unavailable',
            retrievedEventsCount: 0,
            observedPublicEventDaysCount: { state: 'unavailable', value: null, note: 'unavailable' }
          }),
          engagement: {
            ...makeDashboardFixture().intelligence!.engagement,
            collectionState: 'unavailable',
            retrievedEventsCount: 0
          }
        }
      })

      const bobComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        intelligence: {
          ...makeDashboardFixture().intelligence!,
          activity: makeRestActivity({
            collectionState: 'complete',
            observedPublicEventDaysCount: { state: 'observed', value: 40 }
          })
        }
      })

      const comp = compareMetric(aliceUnavail, bobComplete, 'rest_observed_public_event_days')
      expect(comp.eligible).toBe(false)
      expect(comp.winner).toBeNull()
      expect(comp.reason).toContain('complete')
    })
  })
})
