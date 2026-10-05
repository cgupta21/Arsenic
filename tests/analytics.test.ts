import { describe, expect, it } from 'vitest'
import { buildInsights, heatmapCells } from '../client/src/lib/analytics'
import { calculateScore } from '../shared/score.js'
import { generateDeveloperSummary } from '../shared/summary.js'

describe('Arsenic score model', () => {
  it('allows genuinely low scores', () => {
    const result = calculateScore({ activeDays: 0, prs: 0, issues: 0, reviews: 0, stars: 0, forks: 0, followers: 0 })
    expect(result.score).toBe(0)
    expect(result.breakdown.consistency).toBe(0)
  })

  it('rewards consistency, collaboration and impact', () => {
    const low = calculateScore({ activeDays: 4, prs: 0, issues: 0, reviews: 0, stars: 0, forks: 0, followers: 0 })
    const high = calculateScore({ activeDays: 110, prs: 25, issues: 18, reviews: 12, stars: 500, forks: 80, followers: 400 })
    expect(high.score).toBeGreaterThan(low.score)
    expect(high.breakdown.collaboration).toBeGreaterThan(low.breakdown.collaboration)
    expect(high.breakdown.impact).toBeGreaterThan(low.breakdown.impact)
  })
})

describe('developer insights', () => {
  it('does not use second-person language for someone else', () => {
    const insights = buildInsights({
      user: { login: 'octocat', name: 'The Octocat', avatar_url: '', bio: null, html_url: '', public_repos: 3, followers: 2, following: 1, created_at: null, location: null, blog: null },
      repos: [], events: [],
      contributions: { days: [], total: 12, activeDays: 12, currentStreak: 3, longestStreak: 8, privateContributionCount: 0 },
      languages: [{ name: 'TypeScript', size: 100, pct: 70, color: null }],
      timing: { commitsSampled: 5, hours: [], weekdays: [] },
      score: { score: 24, breakdown: { consistency: 10, collaboration: 20, impact: 40 }, raw: { activeDays: 12, totalContributions: 12, prs: 1, issues: 1, reviews: 0, stars: 2, forks: 0, currentStreak: 3, longestStreak: 8, timingSamples: 5 } },
      authenticated: true, privateContributions: false, api: { cached: true, cacheTtlSeconds: 600, graphqlRemaining: 4990, graphqlReset: null, restRemaining: null }
    })
    expect(insights.join(' ')).not.toMatch(/\byou\b/i)
    expect(insights.join(' ')).toContain('TypeScript')
  })
})

describe('heatmap layout', () => {
  it('pads the first column to the right weekday', () => {
    // 2026-10-07 is a Wednesday, so three blank cells (Sun, Mon, Tue) come first.
    const cells = heatmapCells([
      { date: '2026-10-08', contributionCount: 2 },
      { date: '2026-10-07', contributionCount: 1 },
    ])
    expect(cells.slice(0, 3)).toEqual([null, null, null])
    expect(cells[3]?.date).toBe('2026-10-07')
    expect(cells[4]?.date).toBe('2026-10-08')
  })

  it('returns nothing for an empty calendar', () => {
    expect(heatmapCells([])).toEqual([])
  })
})

describe('deterministic developer summary', () => {
  it('builds a concise summary without second-person language or external AI', () => {
    const summary = generateDeveloperSummary({
      user: { login: 'octocat', name: 'The Octocat', avatar_url: '', bio: null, html_url: '', public_repos: 3, followers: 2, following: 1, created_at: null, location: null, blog: null },
      repos: [
        { id: 1, name: 'demo', html_url: '', description: null, language: 'TypeScript', stargazers_count: 12, forks_count: 2, open_issues_count: 1, updated_at: '2026-10-01', pushed_at: '2026-10-01', fork: false, archived: false, status: 'active', daysSince: 4, issueRatio: 7 }
      ],
      events: [],
      contributions: { days: [], total: 42, activeDays: 18, currentStreak: 5, longestStreak: 11, privateContributionCount: 0 },
      languages: [{ name: 'TypeScript', size: 100, pct: 70, color: null }],
      timing: { commitsSampled: 6, hours: Array.from({ length: 24 }, (_, i) => i === 18 ? 4 : 0), weekdays: Array.from({ length: 7 }, (_, i) => i === 2 ? 4 : 0), timezone: 'UTC' },
      score: { score: 68, breakdown: { consistency: 76, collaboration: 62, impact: 58 }, raw: { activeDays: 18, totalContributions: 42, prs: 3, issues: 2, reviews: 1, stars: 12, forks: 2, currentStreak: 5, longestStreak: 11, timingSamples: 6 } },
      authenticated: true, estimated: false, privateContributions: false, api: { cached: false, cacheTtlSeconds: 600, graphqlRemaining: 4990, graphqlReset: null, restRemaining: '4990' }
    })
    expect(summary).toContain('The Octocat')
    expect(summary).toContain('TypeScript')
    expect(summary).not.toMatch(/\byou\b/i)
    expect(summary).toContain('68/100')
  })
})
