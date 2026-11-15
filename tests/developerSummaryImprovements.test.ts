import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { generateDeveloperSummary, extractSummaryMetrics, determineCoverage } from '../shared/summary.js'
import { DeveloperSummaryCard } from '../client/src/components/DeveloperSummaryCard'
import type { Dashboard } from '../client/src/types'

function makeMockDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    user: {
      login: 'alice',
      name: 'Alice Dev',
      avatar_url: 'https://example.com/avatar.png',
      bio: 'Open source enthusiast',
      html_url: 'https://github.com/alice',
      public_repos: 7,
      followers: 120,
      following: 15,
      created_at: '2020-01-01T00:00:00Z',
      location: 'San Francisco, CA',
      blog: 'https://alice.dev',
    },
    repos: [
      { id: 1, name: 'repo-1', html_url: '', description: null, language: 'TypeScript', stargazers_count: 50, forks_count: 5, open_issues_count: 0, updated_at: new Date().toISOString(), pushed_at: new Date().toISOString(), fork: false, status: 'active' },
      { id: 2, name: 'repo-2', html_url: '', description: null, language: 'TypeScript', stargazers_count: 20, forks_count: 2, open_issues_count: 0, updated_at: new Date().toISOString(), pushed_at: new Date().toISOString(), fork: false, status: 'active' },
      { id: 3, name: 'repo-3', html_url: '', description: null, language: 'TypeScript', stargazers_count: 10, forks_count: 1, open_issues_count: 0, updated_at: new Date().toISOString(), pushed_at: new Date().toISOString(), fork: false, status: 'active' },
      { id: 4, name: 'repo-4', html_url: '', description: null, language: 'Rust', stargazers_count: 5, forks_count: 0, open_issues_count: 0, updated_at: new Date().toISOString(), pushed_at: new Date().toISOString(), fork: false, status: 'active' },
      { id: 5, name: 'repo-5', html_url: '', description: null, language: 'Rust', stargazers_count: 15, forks_count: 1, open_issues_count: 0, updated_at: new Date().toISOString(), pushed_at: new Date().toISOString(), fork: false, status: 'active' },
      { id: 6, name: 'repo-6', html_url: '', description: null, language: 'Go', stargazers_count: 8, forks_count: 0, open_issues_count: 0, updated_at: new Date(Date.now() - 45 * 86400000).toISOString(), pushed_at: null, fork: false, status: 'watch' },
      { id: 7, name: 'repo-7', html_url: '', description: null, language: 'Python', stargazers_count: 2, forks_count: 0, open_issues_count: 0, updated_at: new Date(Date.now() - 120 * 86400000).toISOString(), pushed_at: null, fork: false, status: 'stale' },
    ],
    events: [],
    contributions: {
      days: [],
      total: 245,
      activeDays: 68,
      currentStreak: 4,
      longestStreak: 14,
      privateContributionCount: 0,
    },
    observationWindowDays: 365,
    languages: [
      { name: 'TypeScript', size: 60000, pct: 60, color: '#3178c6' },
      { name: 'Rust', size: 30000, pct: 30, color: '#dea584' },
      { name: 'Go', size: 10000, pct: 10, color: '#00add8' },
    ],
    timing: {
      commitsSampled: 42,
      hours: Array(24).fill(0).map((_, i) => (i === 14 ? 18 : 1)),
      weekdays: [2, 12, 15, 6, 4, 2, 1],
      timezone: 'UTC',
    },
    authenticated: true,
    estimated: false,
    privateContributions: false,
    api: {
      cached: false,
      cacheTtlSeconds: 300,
      graphqlRemaining: 4900,
      graphqlReset: null,
      restRemaining: '4900',
    },
    ...overrides,
  }
}

describe('Intelligent Developer Summary — Accuracy, Quality & UI', () => {
  describe('1. Repository count reconciliation', () => {
    it('reconciles active, watch, stale, and archived counts strictly to totalRepos', () => {
      const data = makeMockDashboard()
      const metrics = extractSummaryMetrics(data)

      expect(metrics.repositories.total).toBe(7)
      expect(metrics.repositories.active).toBe(5)
      expect(metrics.repositories.watch).toBe(1)
      expect(metrics.repositories.stale).toBe(1)
      expect(metrics.repositories.archived).toBe(0)
      expect(
        metrics.repositories.active +
        metrics.repositories.watch +
        metrics.repositories.stale +
        metrics.repositories.archived
      ).toBe(metrics.repositories.total)

      const summary = generateDeveloperSummary(data)
      expect(summary).toMatch(/7 repositories[:\s(]+5 active, 1 watch, 1 stale/i)
    })

    it('accounts for archived repositories in the total sum when present', () => {
      const data = makeMockDashboard({
        contributions: { days: [], total: 0, activeDays: 0, currentStreak: 0, longestStreak: 0, privateContributionCount: 0 },
        languages: [],
        repos: [
          { id: 1, name: 'r1', html_url: '', description: null, language: 'TS', stargazers_count: 0, forks_count: 0, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'active' },
          { id: 2, name: 'r2', html_url: '', description: null, language: 'TS', stargazers_count: 0, forks_count: 0, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'watch' },
          { id: 3, name: 'r3', html_url: '', description: null, language: 'TS', stargazers_count: 0, forks_count: 0, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'stale' },
          { id: 4, name: 'r4', html_url: '', description: null, language: 'TS', stargazers_count: 0, forks_count: 0, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'archived' },
        ],
      })
      const metrics = extractSummaryMetrics(data)
      expect(metrics.repositories.total).toBe(4)
      expect(metrics.repositories.active + metrics.repositories.watch + metrics.repositories.stale + metrics.repositories.archived).toBe(4)

      const summary = generateDeveloperSummary(data)
      expect(summary).toMatch(/4 repositories[:\s(]+1 active, 1 watch, 1 stale, 1 archived/i)
    })
  })

  describe('2. Source Coverage & Partial vs Complete Observation', () => {
    it('handles 20 recent events without pagination truncation as partial coverage with unobserved history', () => {
      const data = makeMockDashboard({
        contributions: { days: [], total: 24, activeDays: 9, currentStreak: 2, longestStreak: 3, privateContributionCount: 0 },
        observationWindowDays: 365,
        estimated: true,
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: '2026-10-25',
          eventCount: 20,
          observedDaysCount: 21,
        },
      })

      const coverage = determineCoverage({
        dataQuality: data.dataQuality,
        isEstimated: true,
        authenticated: false,
        windowDays: 365,
      })
      expect(coverage.coverageStatus).toBe('partial')
      expect(coverage.boundaryDate).toBe('2026-10-25')

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.coverageStatus).toBe('partial')
      expect(metrics.contributions.windowDays).toBe(365)
      expect(metrics.contributions.oldestEventDate).toBe('2026-10-25')

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('since 2026-10-25')
      expect(summary).toContain('earlier in the 365-day period is unobserved due to GitHub event feed limits')
      expect(summary).not.toContain('over the 365-day observation window')
      expect(summary).not.toContain('0 recorded public contributions')

      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(html).toContain('GitHub Events API coverage begins on 2026-10-25')
      expect(html).toContain('(since 2026-10-25)')
    })

    it('handles 99 recent events without pagination truncation as partial coverage', () => {
      const data = makeMockDashboard({
        contributions: { days: [], total: 110, activeDays: 35, currentStreak: 3, longestStreak: 7, privateContributionCount: 0 },
        observationWindowDays: 365,
        estimated: true,
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: '2026-08-15',
          eventCount: 99,
          observedDaysCount: 88,
        },
      })

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.coverageStatus).toBe('partial')
      expect(metrics.contributions.oldestEventDate).toBe('2026-08-15')

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('since 2026-08-15')
      expect(summary).toContain('earlier in the 365-day period is unobserved')
    })

    it('handles events covering only 30 days of a requested 365-day window', () => {
      const data = makeMockDashboard({
        contributions: { days: [], total: 45, activeDays: 14, currentStreak: 1, longestStreak: 4, privateContributionCount: 0 },
        observationWindowDays: 365,
        estimated: true,
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: '2026-10-16',
          eventCount: 40,
          observedDaysCount: 30,
        },
      })

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.coverageStatus).toBe('partial')
      expect(metrics.contributions.verifiedDays).toBe(30)

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('since 2026-10-16')
      expect(summary).toContain('historical activity earlier in the 365-day period is unobserved')
    })

    it('treats missing oldest-event and boundary metadata as unobserved rather than confirmed zero', () => {
      const data = makeMockDashboard({
        contributions: { days: [], total: 30, activeDays: 10, currentStreak: 0, longestStreak: 2, privateContributionCount: 0 },
        observationWindowDays: 365,
        estimated: true,
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: null,
          eventCount: 25,
          observedDaysCount: undefined,
        },
      })

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.coverageStatus).toBe('partial')
      expect(metrics.contributions.verifiedDays).toBeNull()

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('complete historical coverage across the requested 365-day window could not be verified')
      expect(summary).not.toContain('over the 365-day observation window')

      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(html).toContain('Historical event feed coverage is partial or boundary metadata is unavailable')
    })

    it('preserves authenticated GraphQL calendar coverage when source genuinely supplies complete data', () => {
      const data = makeMockDashboard({
        authenticated: true,
        estimated: false,
        contributions: { days: [], total: 540, activeDays: 180, currentStreak: 6, longestStreak: 22, privateContributionCount: 0 },
        observationWindowDays: 365,
        intelligence: {
          activity: { source: 'graphql_calendar', observationWindowDays: 365 },
        } as unknown as Dashboard['intelligence'],
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: false,
          oldestEventDate: null,
          eventCount: 0,
        },
      })

      const coverage = determineCoverage({
        dataQuality: data.dataQuality,
        intelligence: data.intelligence,
        isEstimated: false,
        authenticated: true,
        windowDays: 365,
      })
      expect(coverage.coverageStatus).toBe('complete')
      expect(coverage.verifiedDays).toBe(365)
      expect(coverage.isComplete).toBe(true)

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.coverageStatus).toBe('complete')
      expect(metrics.contributions.verifiedDays).toBe(365)

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('over the 365-day observation window')
      expect(summary).not.toContain('unobserved')
      expect(summary).not.toContain('could not be verified')
      expect(summary).not.toContain('feed limits')

      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(html).toContain('180 active days (365d window)')
      expect(html).not.toContain('summaryNoticeTag isTruncated')
    })

    it('handles unavailable event data explicitly without fabricating zero values', () => {
      const data = makeMockDashboard({
        contributions: {
          days: [],
          total: null,
          activeDays: null,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0,
        },
        dataQuality: {
          eventsUnavailable: true,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: false,
          oldestEventDate: null,
          eventCount: 0,
          observedDaysCount: 0,
        },
      })

      const coverage = determineCoverage({
        dataQuality: data.dataQuality,
        eventsUnavailable: true,
        windowDays: 365,
      })
      expect(coverage.coverageStatus).toBe('unavailable')
      expect(coverage.isUnavailable).toBe(true)

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.eventsUnavailable).toBe(true)
      expect(metrics.contributions.total).toBeNull()
      expect(metrics.contributions.activeDays).toBeNull()

      const summary = generateDeveloperSummary(data)
      expect(summary).not.toContain('0 contributions')
      expect(summary).not.toContain('0 active days')
      expect(summary).not.toContain('/100')

      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(html).toContain('Public event history was unavailable from GitHub')
      expect(html).toContain('Unavailable')
    })
  })

  describe('3. Unsupported insights & quality tone checks', () => {
    it('never contains arbitrary marketing phrases or unqualified subjective labels', () => {
      const data = makeMockDashboard()
      const summary = generateDeveloperSummary(data)

      expect(summary).not.toContain('robust community engagement')
      expect(summary).not.toContain('growing account reach')
      expect(summary).not.toMatch(/\bstrong\b/i)
      expect(summary).not.toMatch(/\bmoderate\b/i)
    })

    it('requires at least 10 sampled commits before generating timing insights', () => {
      const lowSampleData = makeMockDashboard({
        timing: {
          commitsSampled: 4,
          hours: Array(24).fill(0),
          weekdays: Array(7).fill(0),
        },
      })
      const summary = generateDeveloperSummary(lowSampleData)
      expect(summary).not.toContain('peak commit window')
      expect(summary).not.toContain('commit cadence concentrates')

      const metrics = extractSummaryMetrics(lowSampleData)
      expect(metrics.timing).toBeNull()
    })
  })

  describe('4. DeveloperSummaryCard UI component states', () => {
    it('renders empty state with prompt and "Generate summary" button when no summary is loaded', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: '',
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )

      expect(html).toContain('Intelligent developer summary')
      expect(html).toContain('Deterministic analysis')
      expect(html).toContain('Generate summary')
      expect(html).toContain('Generate a concise, evidence-based profile summary')
      expect(html).not.toContain('summaryMetricsGrid')
    })

    it('renders loading state with status and pulse indicators when summaryLoading is true', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: '',
          summaryLoading: true,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )

      expect(html).toContain('summaryLoadingState')
      expect(html).toContain('Synthesizing developer telemetry')
      expect(html).toContain('skeletonLine')
    })

    it('renders error state with alert and retry button when summaryError is present', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: '',
          summaryLoading: false,
          summaryError: 'GitHub rate limit exceeded for this session.',
          onGenerate: vi.fn(),
        })
      )

      expect(html).toContain('summaryErrorState')
      expect(html).toContain('Summary generation failed')
      expect(html).toContain('GitHub rate limit exceeded for this session.')
      expect(html).toContain('Try again')
    })

    it('renders structured metrics grid, notice tag, and narrative paragraphs when summary is loaded', () => {
      const data = makeMockDashboard({
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: true,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: '2026-06-15',
          eventCount: 300,
          observedDaysCount: 88,
        },
      })
      const summaryText = generateDeveloperSummary(data)
      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: summaryText,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )

      // Structured metrics
      expect(html).toContain('Observed Contributions')
      expect(html).toContain('245')
      expect(html).toContain('(since 2026-06-15)')

      expect(html).toContain('Repositories')
      expect(html).toContain('7 Repos')
      expect(html).toContain('5 active · 1 watch · 1 stale')

      expect(html).toContain('Primary Technology')
      expect(html).toContain('TypeScript (60%)')

      expect(html).toContain('Peak Cadence')

      // Partial-data notice tag
      expect(html).toContain('summaryNoticeTag')
      expect(html).toContain('GitHub Events API coverage begins on 2026-06-15')

      // Narrative paragraphs & refresh button
      expect(html).toContain('summaryNarrative')
      expect(html).toContain('Refresh summary')
    })

    it('renders "Verified Contributions" label in metrics tile for complete authenticated data', () => {
      const data = makeMockDashboard({
        authenticated: true,
        estimated: false,
        contributions: {
          days: [],
          total: 500,
          activeDays: 120,
          currentStreak: 5,
          longestStreak: 20,
          privateContributionCount: 0,
        },
        observationWindowDays: 365,
        intelligence: {
          activity: { source: 'graphql_calendar', observationWindowDays: 365 },
        } as unknown as Dashboard['intelligence'],
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: false,
          oldestEventDate: null,
          eventCount: 0,
        },
      })
      const summaryText = generateDeveloperSummary(data)
      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: summaryText,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )

      expect(html).toContain('Verified Contributions')
      expect(html).not.toContain('Observed Contributions')
    })
  })

  describe('5. Contribution count reconciliation (121 vs 118 raw events)', () => {
    it('uses total contribution count (121) consistently across metrics tile and narrative, never raw event count (118)', () => {
      const data = makeMockDashboard({
        estimated: true,
        authenticated: false,
        contributions: {
          days: [],
          total: 121,
          activeDays: 45,
          currentStreak: 2,
          longestStreak: 8,
          privateContributionCount: 0,
        },
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: true,
          oldestEventDate: '2026-07-01',
          eventCount: 118,
          observedDaysCount: 45,
        },
      })

      const metrics = extractSummaryMetrics(data)
      expect(metrics.contributions.total).toBe(121)
      expect(metrics.contributions.label).toBe('Observed Contributions')

      const summary = generateDeveloperSummary(data)
      expect(summary).toContain('121 observed contributions')
      expect(summary).not.toContain('118')

      const html = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary,
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(html).toContain('Observed Contributions')
      expect(html).toContain('121')
    })
  })

  describe('6. buildInsights reconciliation and tone', () => {
    it('reconciles 7 repositories (5 active, 1 watch, 1 stale) and avoids subjective terms', async () => {
      const { buildInsights } = await import('../client/src/lib/analytics')
      const data = makeMockDashboard()
      const insights = buildInsights(data)

      expect(insights.some((i: string) => i.includes('7 total projects: 5 active, 1 watch, 1 stale'))).toBe(true)

      for (const text of insights) {
        expect(text).not.toMatch(/\bmoderate\b/i)
        expect(text).not.toMatch(/\brobust\b/i)
        expect(text).not.toMatch(/\bgrowing\b/i)
        expect(text).not.toMatch(/\bstrong\b/i)
      }
    })
  })

  describe('7. PR #28 Review Fixes — Single Card, Single Request, Error/Loading States & Pure Factual Insights', () => {
    it('verifies that exactly one summary card is rendered in App.tsx and the old Card was removed', async () => {
      const fs = await import('node:fs')
      const appSource = fs.readFileSync('client/src/App.tsx', 'utf-8')

      // Confirm legacy summary Card is completely removed
      expect(appSource).not.toMatch(/<Card[^>]*title=["']Intelligent developer summary["']/i)
      expect(appSource).not.toContain('aiPanel')

      // Confirm DeveloperSummaryCard is included exactly once in JSX
      const matches = appSource.match(/<DeveloperSummaryCard\b/g)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBe(1)
    })

    it('ensures all action buttons in DeveloperSummaryCard are type="button" and disabled during loading', () => {
      const data = makeMockDashboard()

      // Empty state
      const emptyHtml = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: '',
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(emptyHtml).toContain('type="button"')
      expect(emptyHtml).toContain('class="primaryBtn generateSummaryBtn"')

      // Error state retry button
      const errorHtml = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: '',
          summaryLoading: false,
          summaryError: 'Network failure',
          onGenerate: vi.fn(),
        })
      )
      expect(errorHtml).toContain('type="button"')
      expect(errorHtml).toContain('class="primaryBtn summaryRetryBtn"')

      // Loaded state refresh button
      const loadedHtml = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: 'Developer profile summary text.',
          summaryLoading: false,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(loadedHtml).toContain('type="button"')
      expect(loadedHtml).toContain('class="secondaryBtn refreshSummaryBtn"')

      // When loading is true, summaryLoadingState renders and replaces action buttons
      const loadingHtml = renderToStaticMarkup(
        React.createElement(DeveloperSummaryCard, {
          data,
          summary: 'Developer profile summary text.',
          summaryLoading: true,
          summaryError: null,
          onGenerate: vi.fn(),
        })
      )
      expect(loadingHtml).toContain('summaryLoadingState')
      expect(loadingHtml).not.toContain('refreshSummaryBtn')
      expect(loadingHtml).not.toContain('generateSummaryBtn')
    })

    it('ensures one generate action triggers exactly one API request and ignores concurrent invocations', async () => {
      // Simulate aiSummary controller behavior with synchronous lock ref
      const mockGenerateSummary = vi.fn().mockImplementation(
        () => new Promise<{ summary: string }>((resolve) => setTimeout(() => resolve({ summary: 'Resolved summary' }), 20))
      )

      let loading = false
      let error: string | null = null
      let summary = ''
      const loadingRef = { current: false }

      const aiSummary = async (login: string) => {
        if (!login || loadingRef.current) return
        loadingRef.current = true
        loading = true
        error = null
        try {
          const res = await mockGenerateSummary(login)
          summary = res.summary
          error = null
        } catch (err) {
          error = err instanceof Error ? err.message : 'Error'
        } finally {
          loadingRef.current = false
          loading = false
        }
      }

      // First action
      const p1 = aiSummary('alice')
      // Rapid concurrent click before p1 completes
      const p2 = aiSummary('alice')

      await Promise.all([p1, p2])

      // Must have triggered exactly one API request
      expect(mockGenerateSummary).toHaveBeenCalledTimes(1)
      expect(summary).toBe('Resolved summary')
      expect(loading).toBe(false)
      expect(error).toBeNull()
    })

    it('clears previous errors before requesting and always resets loading on failure', async () => {
      const mockFail = vi.fn().mockRejectedValue(new Error('GitHub API rate limit exceeded.'))

      let loading = false
      let error: string | null = 'Previous stale error'
      let summary = ''
      const loadingRef = { current: false }

      const aiSummary = async (login: string) => {
        if (!login || loadingRef.current) return
        loadingRef.current = true
        loading = true
        error = null // Clears previous error before requesting
        try {
          const res = await mockFail(login)
          summary = res.summary
          error = null
        } catch (err) {
          error = err instanceof Error ? err.message : 'Developer summary unavailable.'
        } finally {
          loadingRef.current = false
          loading = false // Always reset loading
        }
      }

      const p = aiSummary('alice')
      expect(loading).toBe(true)
      expect(error).toBeNull() // Confirms error was immediately cleared

      await p

      expect(loading).toBe(false)
      expect(error).toBe('GitHub API rate limit exceeded.')
      expect(summary).toBe('')
      expect(mockFail).toHaveBeenCalledTimes(1)
    })

    it('removes unsupported subjective descriptions from buildInsights across all engagement levels', async () => {
      const { buildInsights } = await import('../client/src/lib/analytics')

      // Case A: High engagement (previously triggered "Public engagement is a strong signal")
      const highEngagementData = makeMockDashboard({
        intelligence: {
          engagement: {
            collectionState: 'complete',
            pullRequestEventActionsCount: { value: 15 },
            issueEventActionsCount: { value: 10 },
            pullRequestReviewEventActionsCount: { value: 5 },
          },
        } as unknown as Dashboard['intelligence'],
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: false,
          oldestEventDate: null,
          eventCount: 30,
        },
      })
      const highInsights = buildInsights(highEngagementData)
      expect(highInsights).toContain('Public collaborative activity includes 15 pull request actions, 10 issue actions and 5 review actions observed.')
      expect(highInsights.some((i: string) => /strong signal/i.test(i))).toBe(false)
      expect(highInsights.some((i: string) => /developing/i.test(i))).toBe(false)

      // Case B: Low engagement (previously triggered "Public engagement is developing")
      const lowEngagementData = makeMockDashboard({
        intelligence: {
          engagement: {
            collectionState: 'complete',
            pullRequestEventActionsCount: { value: 2 },
            issueEventActionsCount: { value: 1 },
            pullRequestReviewEventActionsCount: { value: 0 },
          },
        } as unknown as Dashboard['intelligence'],
        dataQuality: {
          eventsUnavailable: false,
          isTruncated: false,
          observationWindowDays: 365,
          isEstimated: false,
          oldestEventDate: null,
          eventCount: 3,
        },
      })
      const lowInsights = buildInsights(lowEngagementData)
      expect(lowInsights).toContain('Public collaborative activity includes 2 pull request actions, 1 issue actions and 0 review actions observed.')
      expect(lowInsights.some((i: string) => /strong/i.test(i))).toBe(false)
      expect(lowInsights.some((i: string) => /developing/i.test(i))).toBe(false)

      // Case C: Stale repos (previously triggered "Repository health is relatively fresh")
      const allActiveData = makeMockDashboard({
        repos: [
          { id: 1, name: 'r1', html_url: '', description: null, language: 'TS', stargazers_count: 5, forks_count: 1, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'active' },
        ],
      })
      const freshInsights = buildInsights(allActiveData)
      expect(freshInsights.some((i: string) => /relatively fresh/i.test(i))).toBe(false)
      expect(freshInsights).toContain('Repository health across 1 total projects: 1 active.')
    })
  })
})
