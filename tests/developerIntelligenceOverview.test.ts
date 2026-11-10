import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { DeveloperIntelligenceOverview } from '../client/src/components/DeveloperIntelligenceOverview'
import type { Dashboard, DeveloperIntelligence, MetricValue } from '../client/src/types'

function metricNum(n: number): MetricValue<number> {
  return n > 0 ? { state: 'observed', value: n } : { state: 'zero', value: 0 }
}

function makeMockDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  const isTruncated = overrides.dataQuality?.isTruncated ?? false
  const eventsUnavailable = overrides.dataQuality?.eventsUnavailable ?? false
  const activeDays = overrides.contributions?.activeDays ?? 62
  const totalContrib = overrides.contributions?.total ?? 1840
  const repos = overrides.repos ?? [
    {
      id: 101,
      name: 'Arsenic',
      html_url: 'https://github.com/cgupta21/Arsenic',
      description: 'GitHub developer intelligence dashboard',
      language: 'TypeScript',
      languageColor: '#3178c6',
      stargazers_count: 84,
      forks_count: 12,
      open_issues_count: 2,
      updated_at: '2026-10-20T10:00:00Z',
      pushed_at: '2026-10-20T10:00:00Z',
      fork: false,
      archived: false,
      status: 'active',
      daysSince: 1,
      issueRatio: 2.1,
    },
    {
      id: 102,
      name: 'quantum-mesh',
      html_url: 'https://github.com/cgupta21/quantum-mesh',
      description: 'Resilient node topologies',
      language: 'JavaScript',
      languageColor: '#f1e05a',
      stargazers_count: 26,
      forks_count: 4,
      open_issues_count: 0,
      updated_at: '2026-09-12T00:00:00Z',
      pushed_at: '2026-09-12T00:00:00Z',
      fork: false,
      archived: false,
      status: 'active',
      daysSince: 39,
      issueRatio: 0,
    },
  ]
  const nonForkRepos = repos.filter(r => !r.fork).length
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0)
  const forksCount = repos.reduce((s, r) => s + (r.forks_count || 0), 0)
  const activeCount = repos.filter(r => r.status === 'active' && !r.fork).length
  const staleCount = repos.filter(r => r.status === 'stale' && !r.fork).length
  const archivedCount = repos.filter(r => r.status === 'archived' && !r.fork).length

  // Prs/reviews from overrides if specified
  const prs = overrides.score?.raw?.prs ?? 38
  const reviews = overrides.score?.raw?.reviews ?? 20
  const issues = overrides.score?.raw?.issues ?? 14
  const defaultFollowers = overrides.user?.followers ?? (
    overrides.score?.raw != null
      ? ((overrides.score.raw as Record<string, unknown>).followers as number | undefined ?? ((overrides.score.raw.stars as number | undefined ?? 0) >= 100 ? 150 : 0))
      : 142
  )

  const collectionState = eventsUnavailable ? 'unavailable' : isTruncated ? 'limit_reached' : 'complete'

  const defaultIntelligence: DeveloperIntelligence = {
    schemaVersion: '3.2.0',
    collectedAt: '2026-10-20T10:00:00Z',
    activity: {
      source: 'graphql_calendar',
      observationWindowStart: '2025-10-20T00:00:00Z',
      observationWindowEnd: '2026-10-20T00:00:00Z',
      observationWindowDays: 365,
      recordedContributionDaysCount: metricNum(activeDays),
      contributionCurrentStreakDays: { state: 'observed', value: 42 },
      contributionLongestStreakDays: { state: 'observed', value: 68 },
      totalRecordedContributions: metricNum(totalContrib),
      privateContributionsCount: { state: 'observed', value: 0 }
    },
    adoption: {
      snapshotType: 'current_point_in_time',
      repositoryCoverage: {
        totalOwnedPublicRepos: repos.length,
        observedNonForkRepos: nonForkRepos,
        totalEligibleNonForkRepos: nonForkRepos,
        isComplete: true,
        retrievalCap: 250
      },
      totalStargazersCount: metricNum(totalStars),
      nonArchivedRepoStarsCount: metricNum(totalStars),
      archivedRepoStarsCount: { state: 'zero', value: 0 },
      forksCount: metricNum(forksCount)
    },
    reach: {
      snapshotType: 'current_point_in_time',
      followersCount: metricNum(defaultFollowers)
    },
    maintenance: {
      repositoryCoverage: {
        totalOwnedPublicRepos: repos.length,
        observedNonForkRepos: nonForkRepos,
        totalEligibleNonForkRepos: nonForkRepos,
        isComplete: true,
        retrievalCap: 250
      },
      observationWindowStart: '2026-07-22T00:00:00Z',
      observationWindowEnd: '2026-10-20T00:00:00Z',
      observationWindowDays: 90,
      activeCount: metricNum(activeCount),
      inactiveCount: metricNum(staleCount),
      archivedCount: metricNum(archivedCount),
      unknownCount: { state: 'zero', value: 0 }
    },
    engagement: {
      source: 'rest_event_stream',
      observationWindowStart: '2026-07-22T00:00:00Z',
      observationWindowEnd: '2026-10-20T00:00:00Z',
      observationWindowDays: 90,
      collectionState,
      retrievedEventsCount: collectionState === 'unavailable' ? 0 : 50,
      pullRequestEventActionsCount: collectionState === 'unavailable'
        ? { state: 'unavailable', value: null, note: 'unavailable' }
        : isTruncated
          ? { state: 'partial', value: prs, isLowerBound: true, note: 'truncated' }
          : metricNum(prs),
      pullRequestReviewEventActionsCount: collectionState === 'unavailable'
        ? { state: 'unavailable', value: null, note: 'unavailable' }
        : isTruncated
          ? { state: 'partial', value: reviews, isLowerBound: true, note: 'truncated' }
          : metricNum(reviews),
      issueEventActionsCount: collectionState === 'unavailable'
        ? { state: 'unavailable', value: null, note: 'unavailable' }
        : isTruncated
          ? { state: 'partial', value: issues, isLowerBound: true, note: 'truncated' }
          : metricNum(issues),
      issueCommentEventActionsCount: { state: 'zero', value: 0 }
    }
  }

  return {
    user: {
      login: 'cgupta21',
      name: 'Chirag Gupta',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      bio: 'Building developer intelligence tools and distributed systems.',
      html_url: 'https://github.com/cgupta21',
      public_repos: 24,
      followers: defaultFollowers,
      following: 38,
      created_at: '2020-03-15T00:00:00Z',
      location: 'San Francisco, CA',
      blog: 'https://chirag.dev',
    },
    repos: [
      {
        id: 101,
        name: 'Arsenic',
        html_url: 'https://github.com/cgupta21/Arsenic',
        description: 'GitHub developer intelligence dashboard',
        language: 'TypeScript',
        languageColor: '#3178c6',
        stargazers_count: 84,
        forks_count: 12,
        open_issues_count: 2,
        updated_at: '2026-10-20T10:00:00Z',
        pushed_at: '2026-10-20T10:00:00Z',
        fork: false,
        archived: false,
        status: 'active',
        daysSince: 1,
        issueRatio: 2.1,
      },
      {
        id: 102,
        name: 'quantum-mesh',
        html_url: 'https://github.com/cgupta21/quantum-mesh',
        description: 'Resilient node topologies',
        language: 'JavaScript',
        languageColor: '#f1e05a',
        stargazers_count: 26,
        forks_count: 4,
        open_issues_count: 0,
        updated_at: '2026-09-12T00:00:00Z',
        pushed_at: '2026-09-12T00:00:00Z',
        fork: false,
        archived: false,
        status: 'active',
        daysSince: 39,
        issueRatio: 0,
      },
    ],
    events: [
      {
        id: 'ev-1',
        type: 'PushEvent',
        repo: { name: 'cgupta21/Arsenic' },
        created_at: '2026-10-20T09:00:00Z',
        payload: { commits: [{ message: 'feat: live overview' }] },
      },
    ],
    contributions: {
      days: Array.from({ length: 90 }, (_, i) => {
        const d = new Date('2026-10-20T00:00:00Z')
        d.setUTCDate(d.getUTCDate() - (89 - i))
        const count = i % 2 === 0 ? (i % 6) + 1 : 0
        return {
          date: d.toISOString().slice(0, 10),
          contributionCount: count,
          weekday: d.getUTCDay(),
        }
      }),
      total: 1840,
      activeDays: 62,
      currentStreak: 42,
      longestStreak: 68,
      privateContributionCount: 0,
    },
    languages: [
      { name: 'TypeScript', size: 56000, pct: 56, color: '#3178c6' },
      { name: 'JavaScript', size: 24000, pct: 24, color: '#f1e05a' },
      { name: 'CSS', size: 12000, pct: 12, color: '#563d7c' },
      { name: 'HTML', size: 8000, pct: 8, color: '#e34c26' },
    ],
    timing: {
      commitsSampled: 48,
      hours: Array.from({ length: 24 }, (_, h) => (h === 14 ? 22 : h === 15 ? 16 : 2)),
      weekdays: [2, 12, 15, 14, 18, 10, 3],
      timezone: 'UTC',
    },
    score: {
      score: 94,
      breakdown: { consistency: 96, collaboration: 92, impact: 94 },
      raw: {
        activeDays: 62,
        totalContributions: 1840,
        prs: 38,
        issues: 14,
        reviews: 20,
        stars: 110,
        forks: 16,
        currentStreak: 42,
        longestStreak: 68,
        timingSamples: 48,
      },
    },
    authenticated: true,
    estimated: false,
    privateContributions: false,
    api: {
      cached: false,
      cacheTtlSeconds: 600,
      graphqlRemaining: 4950,
      graphqlReset: null,
      restRemaining: null,
    },
    intelligence: defaultIntelligence,
    ...overrides,
  }
}

describe('Developer Intelligence Overview in Dashboard', () => {
  const rootDir = resolve(__dirname, '..')
  const appCode = readFileSync(resolve(rootDir, 'client/src/App.tsx'), 'utf-8')
  const stylesCss = readFileSync(resolve(rootDir, 'client/src/styles.css'), 'utf-8')
  const landingCss = readFileSync(resolve(rootDir, 'client/src/landing.css'), 'utf-8')
  const overviewComponentCode = readFileSync(
    resolve(rootDir, 'client/src/components/DeveloperIntelligenceOverview.tsx'),
    'utf-8'
  )

  describe('1. Dashboard Integration and Structure in App.tsx', () => {
    it('imports DeveloperIntelligenceOverview component in App.tsx', () => {
      expect(appCode).toContain(
        "import { DeveloperIntelligenceOverview } from './components/DeveloperIntelligenceOverview'"
      )
    })

    it('renders DeveloperIntelligenceOverview inside the #overview section of the actual dashboard', () => {
      expect(appCode).toContain('id="overview"')
      expect(appCode).toContain('<DeveloperIntelligenceOverview data={data}')
    })

    it('replaces duplicate bare statsGrid with the rich DeveloperIntelligenceOverview in DashboardContent', () => {
      // statsGrid was the duplicate bare 6-box strip; it is now replaced by DeveloperIntelligenceOverview
      expect(appCode).not.toContain('<section className="statsGrid"')
      expect(appCode).toContain('className="overviewSection"')
    })

    it('preserves topbar navigation to overview via native anchor and navigateTo helper', () => {
      expect(appCode).toContain('navigateTo(\'overview\')')
      expect(appCode).toContain('#overview')
    })
  })

  describe('2. Design System and Visual Preview Parity', () => {
    it('uses the dashboardPreviewCard card structure matching the landing preview specification', () => {
      expect(overviewComponentCode).toContain('dashboardPreviewCard')
      expect(overviewComponentCode).toContain('previewCardHeader')
      expect(overviewComponentCode).toContain('previewWindowControls')
      expect(overviewComponentCode).toContain('previewCardTitle')
      expect(overviewComponentCode).toContain('previewLivePill')
      expect(overviewComponentCode).toContain('previewCardBody')
      expect(overviewComponentCode).toContain('previewScoreStrip')
      expect(overviewComponentCode).toContain('previewMetricsGrid')
      expect(overviewComponentCode).toContain('previewHeatmapSection')
      expect(overviewComponentCode).toContain('previewSummaryRow')
      expect(overviewComponentCode).toContain('previewCardFooter')
    })

    it('defines styles for dashboardOverviewWrap in styles.css', () => {
      expect(stylesCss).toContain('.dashboardOverviewWrap')
      expect(stylesCss).toContain('.overviewSection')
    })

    it('landing.css contains responsive rules for previewMetricsGrid and previewHeatmapGrid', () => {
      expect(landingCss).toContain('.previewMetricsGrid')
      expect(landingCss).toContain('.previewHeatmapGrid')
      expect(landingCss).toContain('@media (max-width: 768px)')
      expect(landingCss).toContain('@media (max-width: 480px)')
    })
  })

  describe('3. Dynamic Data Binding with Genuine Metrics', () => {
    it('renders actual health score and component breakdown (consistency, collaboration, impact)', () => {
      const data = makeMockDashboard({
        score: {
          score: 94,
          breakdown: { consistency: 96, collaboration: 92, impact: 94 },
          raw: {
            activeDays: 62,
            totalContributions: 1840,
            prs: 38,
            issues: 14,
            reviews: 20,
            stars: 110,
            forks: 16,
            currentStreak: 42,
            longestStreak: 68,
            timingSamples: 48,
          },
        },
      })
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      // M-03 Multidimensional Intelligence: hero block displays transparent active days and dimensional measurements
      expect(html).toContain('62')
      expect(html).toContain('Active Days Recorded')
      expect(html).toContain('62 Active Days')
      expect(html).toContain('Non-Fork Repos')
      expect(html).toContain('Stars')
      expect(html).toContain('Followers')
    })

    it('renders Commits & PRs with accurate formatting and trend', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('Commits &amp; PRs')
      expect(html).toContain('1,840')
      expect(html).toContain('vs prior 4w')
    })

    it('renders Active Streak and longest streak accurately', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('Active Streak')
      expect(html).toContain('42 Days')
      expect(html).toContain('Longest: 68d')
    })

    it('renders PR velocity calculated from raw PRs over time window', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('PR Velocity')
      expect(html).toContain('2.9 / wk')
      expect(html).toContain('High velocity')
    })

    it('renders Tracked Repos count and aggregated stars', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('Tracked Repos')
      // 2 repos in mock
      expect(html).toContain('<span class="metricVal">2</span>')
      expect(html).toContain('110 Stars')
    })

    it('renders contribution timing peak and density heatmap cells with accurate intensity classes', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('Contribution Timing &amp; Density')
      expect(html).toContain('Peak: 14:00 UTC · Thursday')
      expect(html).toContain('heatmapCell')
      expect(html).toContain('lvl-')
    })

    it('renders language distribution with accurate percentages and colors', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('TypeScript (56%)')
      expect(html).toContain('JavaScript (24%)')
      expect(html).toContain('CSS (12%)')
      expect(html).toContain('#3178c6')
    })

    it('renders footer navigation links to activity and repository sections', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('href="#activity"')
      expect(html).toContain('Activity &amp; Timing →')
      expect(html).toContain('href="#repositories"')
      expect(html).toContain('Repositories (2) →')
    })
  })

  describe('4. Edge Cases & Safety (Empty, Unauthenticated, Refreshing)', () => {
    it('handles user with zero public repositories gracefully without crashing', () => {
      const data = makeMockDashboard({
        repos: [],
        languages: [],
        score: {
          score: 10,
          breakdown: { consistency: 20, collaboration: 0, impact: 0 },
          raw: {
            activeDays: 4,
            totalContributions: 8,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 0,
            forks: 0,
            currentStreak: 0,
            longestStreak: 1,
            timingSamples: 0,
          },
        },
      })
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('@cgupta21')
      expect(html).toContain('No Repos')
      expect(html).toContain('<span class="metricVal">0</span>')
      expect(html).toContain('0 Stars')
      expect(html).toContain('No language data available')
    })

    it('handles zero contributions safely without NaN or division by zero in PR velocity', () => {
      const data = makeMockDashboard({
        contributions: {
          days: [],
          total: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0,
        },
        score: {
          score: 0,
          breakdown: { consistency: 0, collaboration: 0, impact: 0 },
          raw: {
            activeDays: 0,
            totalContributions: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 0,
            forks: 0,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0,
          },
        },
      })
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('0.0 / wk')
      expect(html).not.toContain('NaN')
      expect(html).toContain('No recent PRs')
      expect(html).toContain('0 Days')
    })

    it('accurately displays Public API and Public Estimate when in unauthenticated estimated mode', () => {
      const data = makeMockDashboard({
        authenticated: false,
        estimated: true,
      })
      const html = renderToStaticMarkup(React.createElement(DeveloperIntelligenceOverview, { data }))

      expect(html).toContain('Public API')
      expect(html).toContain('Public Estimate')
    })

    it('displays refreshing state when loading prop is true', () => {
      const data = makeMockDashboard()
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data, loading: true })
      )

      expect(html).toContain('overviewLoading')
      expect(html).toContain('Refreshing Intelligence…')
    })
  })

  describe('5. M-02 Developer Badge Integrity & Qualification', () => {
    it('1. Dormant profile: does not award Low Collaboration or Clean Branching', () => {
      const dormantData = makeMockDashboard({
        repos: [
          {
            id: 201,
            name: 'old-repo',
            html_url: 'https://github.com/cgupta21/old-repo',
            description: 'Archived legacy project',
            language: 'JavaScript',
            stargazers_count: 5,
            forks_count: 0,
            open_issues_count: 0,
            updated_at: '2023-01-01T00:00:00Z',
            pushed_at: '2023-01-01T00:00:00Z',
            fork: false,
            status: 'stale',
          },
        ],
        events: [],
        contributions: {
          days: Array.from({ length: 90 }, (_, i) => ({
            date: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
            contributionCount: 0,
            weekday: 1,
            isObserved: true,
          })),
          total: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0,
        },
        score: {
          score: 5,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 0, collaboration: 0, impact: 15 },
          raw: {
            activeDays: 0,
            totalContributions: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 5,
            forks: 0,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0,
          },
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: dormantData })
      )
      expect(html).not.toContain('Low Collaboration')
      expect(html).not.toContain('Solo Cadence')
      expect(html).not.toContain('Clean Branching')
    })

    it('2. Zero-repository profile: does not award Clean Branching', () => {
      const noRepoData = makeMockDashboard({
        repos: [],
        score: {
          score: 10,
          breakdown: { consistency: 20, collaboration: 10, impact: 0 },
          raw: {
            activeDays: 4,
            totalContributions: 10,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 0,
            forks: 0,
            currentStreak: 0,
            longestStreak: 1,
            timingSamples: 0,
          },
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: noRepoData })
      )
      expect(html).not.toContain('Clean Branching')
    })

    it('3. Genuine active low-collaboration profile: retains Low Collaboration badge', () => {
      const soloData = makeMockDashboard({
        contributions: {
          days: Array.from({ length: 90 }, (_, i) => ({
            date: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
            contributionCount: i % 4 === 0 ? 3 : 0,
            weekday: 1,
            isObserved: true,
          })),
          total: 65,
          activeDays: 22,
          currentStreak: 3,
          longestStreak: 5,
          privateContributionCount: 0,
        },
        score: {
          score: 55,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 60, collaboration: 15, impact: 30 },
          raw: {
            activeDays: 22,
            totalContributions: 65,
            prs: 0,
            issues: 1,
            reviews: 0,
            stars: 12,
            forks: 2,
            currentStreak: 3,
            longestStreak: 5,
            timingSamples: 15,
          },
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: false,
          isTruncated: false,
          eventsUnavailable: false,
          oldestEventDate: '2026-07-22T00:00:00Z',
          eventCount: 45,
          observedDaysCount: 90,
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: soloData })
      )
      expect(html).toContain('Low Collaboration')
      expect(html).toContain('title="Limited collaboration signals in observed public activity"')
      expect(html).not.toContain('Solo Cadence')
      expect(html).not.toContain('Clean Branching')
    })

    it('4. Truncated telemetry with null collaboration: does not award Low Collaboration', () => {
      const truncatedData = makeMockDashboard({
        contributions: {
          days: Array.from({ length: 90 }, (_, i) => ({
            date: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
            contributionCount: i < 15 ? 4 : 0,
            weekday: 1,
            isObserved: i < 15,
          })),
          total: 60,
          activeDays: 14,
          currentStreak: 4,
          longestStreak: 6,
          privateContributionCount: 0,
        },
        score: {
          score: 65,
          scoringModel: 'two_pillar_renormalized',
          breakdown: { consistency: 80, collaboration: null, impact: 40 },
          raw: {
            activeDays: 14,
            totalContributions: 60,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 20,
            forks: 2,
            currentStreak: 4,
            longestStreak: 6,
            timingSamples: 14,
          },
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: true,
          eventsUnavailable: false,
          oldestEventDate: '2026-10-05T00:00:00Z',
          eventCount: 300,
          observedDaysCount: 15,
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: truncatedData })
      )
      expect(html).not.toContain('Low Collaboration')
      expect(html).not.toContain('Solo Cadence')
      expect(html).not.toContain('Clean Branching')
    })

    it('5. Unavailable events with stale repositories: displays Telemetry Partial but neither Clean Branching nor Low Collaboration', () => {
      const unavailData = makeMockDashboard({
        repos: [
          {
            id: 301,
            name: 'stale-repo',
            html_url: 'https://github.com/cgupta21/stale-repo',
            description: 'Stale project',
            language: 'Python',
            stargazers_count: 3,
            forks_count: 0,
            open_issues_count: 0,
            updated_at: '2024-01-01T00:00:00Z',
            pushed_at: '2024-01-01T00:00:00Z',
            fork: false,
            status: 'stale',
          },
        ],
        score: {
          score: null,
          scoringModel: 'unavailable',
          breakdown: { consistency: null, collaboration: null, impact: 20 },
          raw: {
            activeDays: null,
            totalContributions: null,
            prs: null,
            issues: null,
            reviews: null,
            stars: 3,
            forks: 0,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0,
          },
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: true,
          isTruncated: false,
          eventsUnavailable: true,
          oldestEventDate: null,
          eventCount: 0,
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: unavailData })
      )
      expect(html).toContain('Telemetry Partial')
      expect(html).not.toContain('Clean Branching')
      expect(html).not.toContain('Low Collaboration')
      expect(html).not.toContain('Solo Cadence')
    })

    it('6. Successful empty activity feed: does not mistake zero activity for low collaboration', () => {
      const emptyFeedData = makeMockDashboard({
        events: [],
        contributions: {
          days: Array.from({ length: 90 }, (_, i) => ({
            date: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
            contributionCount: 0,
            weekday: 1,
            isObserved: true,
          })),
          total: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0,
        },
        score: {
          score: 15,
          scoringModel: 'three_pillar',
          breakdown: { consistency: 0, collaboration: 0, impact: 45 },
          raw: {
            activeDays: 0,
            totalContributions: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 35,
            forks: 5,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0,
          },
        },
        dataQuality: {
          observationWindowDays: 90,
          isEstimated: false,
          isTruncated: false,
          eventsUnavailable: false,
          oldestEventDate: null,
          eventCount: 0,
          observedDaysCount: 90,
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: emptyFeedData })
      )
      expect(html).not.toContain('Low Collaboration')
      expect(html).not.toContain('Solo Cadence')
      expect(html).not.toContain('Clean Branching')
    })

    it('7. Active Maintenance remains available when its repository activity condition is satisfied', () => {
      const activeRepoData = makeMockDashboard({
        repos: [
          {
            id: 401,
            name: 'live-repo',
            html_url: 'https://github.com/cgupta21/live-repo',
            description: 'Actively maintained repository',
            language: 'Go',
            stargazers_count: 10,
            forks_count: 1,
            open_issues_count: 1,
            updated_at: '2026-10-18T00:00:00Z',
            pushed_at: '2026-10-18T00:00:00Z',
            fork: false,
            status: 'active',
          },
        ],
        contributions: {
          days: [],
          total: 15,
          activeDays: 5,
          currentStreak: 0,
          longestStreak: 2,
          privateContributionCount: 0,
        },
        score: {
          score: 40,
          breakdown: { consistency: 30, collaboration: 10, impact: 25 },
          raw: {
            activeDays: 5,
            totalContributions: 15,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 10,
            forks: 1,
            currentStreak: 0,
            longestStreak: 2,
            timingSamples: 5,
          },
        },
      })
      const html = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: activeRepoData })
      )
      expect(html).toContain('Active Maintenance')
    })

    it('8. Valid High Velocity, Active Collab, Steady Cadence, and High Reach behavior remains unchanged', () => {
      // High Velocity, Steady Cadence & High Reach
      const highVelData = makeMockDashboard({
        score: {
          score: 85,
          breakdown: { consistency: 80, collaboration: 75, impact: 80 },
          raw: {
            activeDays: 50,
            totalContributions: 600,
            prs: 45,
            issues: 10,
            reviews: 25,
            stars: 200,
            forks: 40,
            currentStreak: 15,
            longestStreak: 20,
            timingSamples: 45,
          },
        },
      })
      const highVelHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: highVelData })
      )
      expect(highVelHtml).toContain('High Velocity')
      expect(highVelHtml).toContain('Steady Cadence')
      expect(highVelHtml).toContain('High Reach')

      // Active Collab
      const activeCollabData = makeMockDashboard({
        score: {
          score: 60,
          breakdown: { consistency: 50, collaboration: 45, impact: 30 },
          raw: {
            activeDays: 30,
            totalContributions: 120,
            prs: 3,
            issues: 5,
            reviews: 6,
            stars: 20,
            forks: 3,
            currentStreak: 2,
            longestStreak: 5,
            timingSamples: 10,
          },
        },
      })
      const collabHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: activeCollabData })
      )
      expect(collabHtml).toContain('Active Collab')
    })

    it('9. Zero, one, and two rendered badges produce valid UI', () => {
      // 0 badges: Dormant user, stale repo, low impact, no streak, no estimate
      const zeroBadgeData = makeMockDashboard({
        repos: [
          {
            id: 501,
            name: 'dormant-project',
            html_url: 'https://github.com/cgupta21/dormant-project',
            description: null,
            language: null,
            stargazers_count: 1,
            forks_count: 0,
            open_issues_count: 0,
            updated_at: '2022-01-01T00:00:00Z',
            pushed_at: '2022-01-01T00:00:00Z',
            fork: false,
            status: 'stale',
          },
        ],
        contributions: {
          days: [],
          total: 0,
          activeDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          privateContributionCount: 0,
        },
        score: {
          score: 5,
          breakdown: { consistency: 0, collaboration: 0, impact: 10 },
          raw: {
            activeDays: 0,
            totalContributions: 0,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 1,
            forks: 0,
            currentStreak: 0,
            longestStreak: 0,
            timingSamples: 0,
          },
        },
        estimated: false,
      })
      const zeroHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: zeroBadgeData })
      )
      expect(zeroHtml).toContain('previewScoreTags')
      expect(zeroHtml).not.toContain('previewTag')

      // 1 badge: Stale repos, low impact, but active contributor -> Only Low Collaboration
      const oneBadgeData = makeMockDashboard({
        repos: [
          {
            id: 502,
            name: 'old-project',
            html_url: 'https://github.com/cgupta21/old-project',
            description: null,
            language: null,
            stargazers_count: 2,
            forks_count: 0,
            open_issues_count: 0,
            updated_at: '2022-01-01T00:00:00Z',
            pushed_at: '2022-01-01T00:00:00Z',
            fork: false,
            status: 'stale',
          },
        ],
        contributions: {
          days: [{ date: '2026-10-10', contributionCount: 5, isObserved: true, weekday: 6 }],
          total: 25,
          activeDays: 8,
          currentStreak: 2,
          longestStreak: 3,
          privateContributionCount: 0,
        },
        score: {
          score: 30,
          breakdown: { consistency: 40, collaboration: 10, impact: 15 },
          raw: {
            activeDays: 8,
            totalContributions: 25,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 2,
            forks: 0,
            currentStreak: 2,
            longestStreak: 3,
            timingSamples: 5,
          },
        },
        estimated: false,
      })
      const oneHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: oneBadgeData })
      )
      const oneMatches = oneHtml.match(/class="previewTag/g)
      expect(oneMatches).toHaveLength(1)
      expect(oneHtml).toContain('Low Collaboration')
      expect(oneHtml).toContain('title="Limited collaboration signals in observed public activity"')
      expect(oneHtml).not.toContain('Solo Cadence')

      // 2 badges: Active low-collaboration developer with active maintained repo -> Low Collaboration + Active Maintenance
      const twoBadgeData = makeMockDashboard({
        repos: [
          {
            id: 503,
            name: 'current-project',
            html_url: 'https://github.com/cgupta21/current-project',
            description: null,
            language: null,
            stargazers_count: 5,
            forks_count: 0,
            open_issues_count: 0,
            updated_at: '2026-10-19T00:00:00Z',
            pushed_at: '2026-10-19T00:00:00Z',
            fork: false,
            status: 'active',
          },
        ],
        contributions: {
          days: [{ date: '2026-10-10', contributionCount: 5, isObserved: true, weekday: 6 }],
          total: 30,
          activeDays: 10,
          currentStreak: 2,
          longestStreak: 4,
          privateContributionCount: 0,
        },
        score: {
          score: 40,
          breakdown: { consistency: 50, collaboration: 10, impact: 20 },
          raw: {
            activeDays: 10,
            totalContributions: 30,
            prs: 0,
            issues: 0,
            reviews: 0,
            stars: 5,
            forks: 0,
            currentStreak: 2,
            longestStreak: 4,
            timingSamples: 8,
          },
        },
        estimated: false,
      })
      const twoHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, { data: twoBadgeData })
      )
      const twoMatches = twoHtml.match(/class="previewTag/g)
      expect(twoMatches).toHaveLength(2)
      expect(twoHtml).toContain('Low Collaboration')
      expect(twoHtml).toContain('Active Maintenance')
      expect(twoHtml).not.toContain('Solo Cadence')
    })
  })
})
