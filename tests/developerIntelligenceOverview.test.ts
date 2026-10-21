import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { DeveloperIntelligenceOverview } from '../client/src/components/DeveloperIntelligenceOverview'
import type { Dashboard } from '../client/src/types'

function makeMockDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    user: {
      login: 'cgupta21',
      name: 'Chirag Gupta',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      bio: 'Building developer intelligence tools and distributed systems.',
      html_url: 'https://github.com/cgupta21',
      public_repos: 24,
      followers: 142,
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

      expect(html).toContain('94')
      expect(html).toContain('Excellent Health')
      expect(html).toContain('Consistency 96%')
      expect(html).toContain('Collaboration 92%')
      expect(html).toContain('Impact 94%')
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
})
