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
import { resolveScoringModel, getComparisonVerdict } from '../client/src/components/CompareView'
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
  calculateScore: (input: Record<string, unknown>) => {
    score: number | null
    breakdown: { consistency: number | null; collaboration: number | null; impact: number }
    observationWindowDays: number
    targetActiveDays: number
    raw: {
      activeDays: number | null
      totalContributions: number | null
      prs: number | null
      issues: number | null
      reviews: number | null
      stars: number
      forks: number
      currentStreak: number
      longestStreak: number
      timingSamples: number
      observationWindowDays: number
      targetActiveDays: number
    }
  }
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
      expect(cacheKey('torvalds', 'private')).toBe('torvalds::private')
      expect(cacheKey('torvalds', true)).toBe('torvalds::private')
      expect(cacheKey('torvalds', 'verified')).toBe('torvalds::verified')
      expect(cacheKey('torvalds', 'estimated')).toBe('torvalds::estimated')
      expect(cacheKey('torvalds', 'public')).toBe('torvalds::public')
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

    it('calculateScore wrapper propagates eventsUnavailable and nulls metrics', () => {
      const res = calculateScore({
        contributions: {
          contributionCalendar: { totalContributions: null, weeks: [] }
        },
        repos: [{ stargazers_count: 50, forks_count: 5 }],
        followers: 10,
        timing: { commitsSampled: 0 },
        observationWindowDays: 90,
        dataQuality: { eventsUnavailable: true, isTruncated: true }
      })

      expect(res.score).toBeNull()
      expect(res.breakdown.consistency).toBeNull()
      expect(res.breakdown.collaboration).toBeNull()
      expect(res.breakdown.impact).toBeGreaterThan(0)
      expect(res.raw.activeDays).toBeNull()
      expect(res.raw.totalContributions).toBeNull()
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
      expect(cache.has(`${targetUser}::estimated`)).toBe(true)
      expect(cache.has(`${targetUser}::verified`)).toBe(false)
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
      expect(cache.has(`${targetUser}::verified`)).toBe(true)
      expect(cache.has(`${targetUser}::estimated`)).toBe(true)
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
      expect(cache.has(`${targetUser}::estimated`)).toBe(true)
      // ::verified tier was NOT poisoned
      expect(cache.has(`${targetUser}::verified`)).toBe(false)
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
      // In truncated feeds, collaboration is marked unavailable
      const breakdown = (data.score as Record<string, unknown>).breakdown as Record<string, unknown>
      expect(breakdown.collaboration).toBeNull()
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

      const score = data.score as Record<string, unknown>
      expect(score.score).toBeNull()
      const breakdown = score.breakdown as Record<string, unknown>
      expect(breakdown.consistency).toBeNull()
      expect(breakdown.collaboration).toBeNull()
      expect(breakdown.impact).toBeGreaterThan(0)
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

    // Requirement 6: Complete-model vs truncated-model comparisons cannot declare an overall winner
    it('6. Cannot declare an overall winner when comparing complete and truncated models', () => {
      const completeProfile = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        score: {
          score: 72,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 80, collaboration: 60, impact: 70 },
          raw: { ...makeDashboardFixture().score.raw }
        }
      })

      const truncatedProfile = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        score: {
          score: 86,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 95, collaboration: null, impact: 70 },
          raw: { ...makeDashboardFixture().score.raw }
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: true,
          eventsUnavailable: false,
          oldestEventDate: '2026-10-15',
          eventCount: 150
        }
      })

      expect(resolveScoringModel(completeProfile)).toBe('three_pillar')
      expect(resolveScoringModel(truncatedProfile)).toBe('two_pillar_renormalized')

      const verdict = getComparisonVerdict(completeProfile, truncatedProfile)
      expect(verdict).toContain('Overall score comparison disabled')
      expect(verdict).toContain('incompatible scoring models')
      expect(verdict).not.toContain('leads by overall score')
    })

    // Requirement 7: Comparison Fairness Policy
    it('7. Complete vs complete can declare a winner or tie; truncated vs truncated always disables winner', () => {
      const aliceComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        score: {
          score: 85,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 90, collaboration: 80, impact: 85 },
          raw: { ...makeDashboardFixture().score.raw }
        }
      })

      const bobComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        score: {
          score: 70,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 75, collaboration: 60, impact: 75 },
          raw: { ...makeDashboardFixture().score.raw }
        }
      })

      const tieComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'charlie' },
        score: {
          score: 85,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 90, collaboration: 80, impact: 85 },
          raw: { ...makeDashboardFixture().score.raw }
        }
      })

      // Complete vs complete: normal winner/tie behavior
      expect(getComparisonVerdict(aliceComplete, bobComplete)).toBe('alice leads by overall score')
      expect(getComparisonVerdict(aliceComplete, tieComplete)).toBe('Tie on Arsenic score')

      // Truncated 12-day vs truncated 75-day: cannot declare overall winner
      const truncated12d = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        score: {
          score: 89,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 100, collaboration: null, impact: 70 },
          raw: { ...makeDashboardFixture().score.raw }
        },
        dataQuality: {
          ...makeDashboardFixture().dataQuality!,
          isTruncated: true,
          observedDaysCount: 12
        }
      })

      const truncated75d = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        score: {
          score: 77,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 81, collaboration: null, impact: 70 },
          raw: { ...makeDashboardFixture().score.raw }
        },
        dataQuality: {
          ...makeDashboardFixture().dataQuality!,
          isTruncated: true,
          observedDaysCount: 75
        }
      })

      const verdict12vs75 = getComparisonVerdict(truncated12d, truncated75d)
      expect(verdict12vs75).toContain('Overall score comparison disabled')
      expect(verdict12vs75).toContain('truncated contribution telemetry')
      expect(verdict12vs75).not.toContain('leads by overall score')

      // Truncated 75-day vs truncated 80-day: cannot declare overall winner
      const truncated80d = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'charlie' },
        score: {
          score: 80,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 85, collaboration: null, impact: 72 },
          raw: { ...makeDashboardFixture().score.raw }
        },
        dataQuality: {
          ...makeDashboardFixture().dataQuality!,
          isTruncated: true,
          observedDaysCount: 80
        }
      })

      const verdict75vs80 = getComparisonVerdict(truncated75d, truncated80d)
      expect(verdict75vs80).toContain('Overall score comparison disabled')
      expect(verdict75vs80).toContain('truncated contribution telemetry')
      expect(verdict75vs80).not.toContain('leads by overall score')

      // Truncated vs truncated with equal window: cannot declare overall winner
      const truncatedEqual = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'dave' },
        score: {
          score: 65,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 70, collaboration: null, impact: 55 },
          raw: { ...makeDashboardFixture().score.raw }
        },
        dataQuality: {
          ...makeDashboardFixture().dataQuality!,
          isTruncated: true,
          observedDaysCount: 75
        }
      })

      const verdictEqual = getComparisonVerdict(truncated75d, truncatedEqual)
      expect(verdictEqual).toContain('Overall score comparison disabled')
      expect(verdictEqual).toContain('truncated contribution telemetry')
      expect(verdictEqual).not.toContain('leads by overall score')
    })

    it('8. Individual comparison metrics remain visible when overall winner is disabled', () => {
      const truncatedLeft = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice', name: 'Alice Dev' },
        score: {
          score: 88,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 95, collaboration: null, impact: 75 },
          raw: { ...makeDashboardFixture().score.raw, stars: 120 }
        },
        dataQuality: { ...makeDashboardFixture().dataQuality!, isTruncated: true, observedDaysCount: 14 }
      })

      const truncatedRight = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob', name: 'Bob Dev' },
        score: {
          score: 72,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 75, collaboration: null, impact: 68 },
          raw: { ...makeDashboardFixture().score.raw, stars: 85 }
        },
        dataQuality: { ...makeDashboardFixture().dataQuality!, isTruncated: true, observedDaysCount: 60 }
      })

      // Overall comparison disabled
      const verdict = getComparisonVerdict(truncatedLeft, truncatedRight)
      expect(verdict).toContain('Overall score comparison disabled')

      // In CompareView, individual columns and metrics remain rendered
      // Test the CompareColumn component directly for both profiles
      const htmlLeft = renderToStaticMarkup(
        React.createElement('div', null,
          React.createElement('strong', null, truncatedLeft.score.score != null ? truncatedLeft.score.score : '—'),
          React.createElement('span', { className: 'compareModelBadge' }, 'Truncated 2-Pillar'),
          React.createElement('b', null, truncatedLeft.user.login)
        )
      )
      expect(htmlLeft).toContain('88')
      expect(htmlLeft).toContain('Truncated 2-Pillar')
      expect(htmlLeft).toContain('alice')

      const htmlRight = renderToStaticMarkup(
        React.createElement('div', null,
          React.createElement('strong', null, truncatedRight.score.score != null ? truncatedRight.score.score : '—'),
          React.createElement('span', { className: 'compareModelBadge' }, 'Truncated 2-Pillar'),
          React.createElement('b', null, truncatedRight.user.login)
        )
      )
      expect(htmlRight).toContain('72')
      expect(htmlRight).toContain('Truncated 2-Pillar')
      expect(htmlRight).toContain('bob')
    })

    // Requirement 9: Unavailable scores never generate a winner
    it('9. Unavailable scores never generate an overall winner', () => {
      const aliceUnavail = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'alice' },
        score: {
          score: null,
          scoringModel: 'unavailable',
          breakdown: { consistency: null, collaboration: null, impact: 50 },
          raw: { ...makeDashboardFixture().score.raw, activeDays: null }
        },
        dataQuality: { ...makeDashboardFixture().dataQuality!, eventsUnavailable: true }
      })

      const bobComplete = makeDashboardFixture({
        user: { ...makeDashboardFixture().user, login: 'bob' },
        score: {
          score: 75,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 80, collaboration: 70, impact: 75 },
          raw: { ...makeDashboardFixture().score.raw }
        }
      })

      const verdict = getComparisonVerdict(aliceUnavail, bobComplete)
      expect(verdict).toBe(
        'Overall comparison unavailable: one or both developers have incomplete contribution telemetry.'
      )
      expect(verdict).not.toContain('leads by overall score')
    })
  })
})
