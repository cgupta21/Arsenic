import type { Dashboard, ContributionDay, Repo, MetricValue } from '../types'

function metricNum(val: number): MetricValue<number> {
  if (val > 0) return { state: 'observed', value: val }
  return { state: 'zero', value: 0 }
}

// Generate 365 days with realistic activity for sample preview
function generateSampleDays(): ContributionDay[] {
  const days: ContributionDay[] = []
  const today = new Date('2026-11-19T00:00:00Z')

  // Sample density pattern for the most recent 64 days
  const recentLevels = [
    1, 2, 3, 0, 2, 3, 2, 1, 3, 4, 2, 0, 1, 2, 3, 2,
    2, 3, 1, 0, 3, 2, 4, 1, 2, 3, 3, 0, 1, 2, 2, 1,
    3, 4, 3, 0, 2, 3, 2, 1, 1, 2, 4, 0, 3, 3, 2, 1,
    2, 3, 1, 0, 2, 4, 3, 1, 3, 2, 2, 0, 1, 3, 2, 1,
  ]

  const countForLevel = (lvl: number): number => {
    switch (lvl) {
      case 1: return 1
      case 2: return 3
      case 3: return 6
      case 4: return 12
      default: return 0
    }
  }

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    const weekday = d.getUTCDay()

    let count = 0
    if (i < 64) {
      const lvl = recentLevels[63 - i] ?? 1
      count = countForLevel(lvl)
    } else {
      const rand = (i * 17 + 11) % 100
      count = rand > 65 ? (rand % 5) + 1 : 0
    }

    days.push({
      date: dateStr,
      contributionCount: count,
      weekday,
      isObserved: true,
    })
  }
  return days
}

const sampleDays = generateSampleDays()

export const sampleDashboardData: Dashboard = {
  user: {
    login: 'cgupta21',
    name: 'Chandan Kumar Gupta',
    avatar_url: 'https://avatars.githubusercontent.com/u/101920803?v=4',
    bio: 'Inspect commit frequency, repository health, contribution velocity, and collaboration patterns.',
    html_url: 'https://github.com/cgupta21',
    public_repos: 24,
    followers: 84,
    following: 12,
    created_at: '2022-01-15T00:00:00Z',
    location: 'Bengaluru, India',
    blog: 'https://arsenic-rho.vercel.app',
  },
  repos: [
    {
      id: 1,
      name: 'Arsenic',
      html_url: 'https://github.com/cgupta21/Arsenic',
      description: 'GitHub Developer Intelligence Dashboard — Objective developer insights and engineering benchmarks.',
      language: 'TypeScript',
      languageColor: '#3178c6',
      stargazers_count: 84,
      forks_count: 18,
      open_issues_count: 3,
      updated_at: '2026-11-19T00:00:00Z',
      pushed_at: '2026-11-19T00:00:00Z',
      fork: false,
      status: 'active',
      daysSince: 0,
      issueRatio: 3.5,
    },
    ...Array.from({ length: 23 }, (_, idx) => ({
      id: idx + 2,
      name: `project-${idx + 1}`,
      html_url: `https://github.com/cgupta21/project-${idx + 1}`,
      description: 'Public developer tooling and software library.',
      language: idx % 3 === 0 ? 'TypeScript' : idx % 3 === 1 ? 'CSS' : 'JavaScript',
      languageColor: idx % 3 === 0 ? '#3178c6' : idx % 3 === 1 ? '#563d7c' : '#f1e05a',
      stargazers_count: 0,
      forks_count: 0,
      open_issues_count: 0,
      updated_at: '2026-11-10T00:00:00Z',
      pushed_at: '2026-11-10T00:00:00Z',
      fork: false,
      status: (idx < 8 ? 'active' : idx < 16 ? 'watch' : 'stale') as Repo['status'],
      daysSince: idx * 5,
      issueRatio: 2.1,
    })),
  ],
  events: [],
  contributions: {
    days: sampleDays,
    total: 1842,
    activeDays: 62,
    currentStreak: 42,
    longestStreak: 68,
    privateContributionCount: 0,
  },
  dataQuality: {
    observationWindowDays: 365,
    isEstimated: false,
    isTruncated: false,
    eventsUnavailable: false,
    oldestEventDate: null,
    eventCount: 457,
    observedDaysCount: 365,
  },
  languages: [
    { name: 'TypeScript', pct: 58, color: '#3178C6', size: 580000 },
    { name: 'CSS', pct: 22, color: '#563D7C', size: 220000 },
    { name: 'JavaScript', pct: 14, color: '#F7DF1E', size: 140000 },
    { name: 'HTML', pct: 6, color: '#E34F26', size: 60000 },
  ],
  timing: {
    commitsSampled: 457,
    hours: [16, 16, 16, 17, 18, 19],
    weekdays: [0, 0, 0, 1, 2, 3],
  },
  intelligence: {
    schemaVersion: '3.2.0',
    collectedAt: '2026-11-19T00:00:00.000Z',
    activity: {
      source: 'graphql_calendar',
      observationWindowStart: '2025-11-19T00:00:00Z',
      observationWindowEnd: '2026-11-19T00:00:00Z',
      observationWindowDays: 365,
      recordedContributionDaysCount: metricNum(62),
      contributionCurrentStreakDays: { state: 'observed', value: 42 },
      contributionLongestStreakDays: { state: 'observed', value: 68 },
      totalRecordedContributions: metricNum(1842),
      privateContributionsCount: { state: 'observed', value: 0 },
    },
    adoption: {
      snapshotType: 'current_point_in_time',
      repositoryCoverage: {
        totalOwnedPublicRepos: 24,
        observedNonForkRepos: 24,
        totalEligibleNonForkRepos: 24,
        isComplete: true,
        retrievalCap: 250,
      },
      totalStargazersCount: metricNum(84),
      nonArchivedRepoStarsCount: metricNum(84),
      archivedRepoStarsCount: { state: 'zero', value: 0 },
      forksCount: metricNum(18),
    },
    reach: {
      snapshotType: 'current_point_in_time',
      followersCount: metricNum(84),
    },
    maintenance: {
      repositoryCoverage: {
        totalOwnedPublicRepos: 24,
        observedNonForkRepos: 24,
        totalEligibleNonForkRepos: 24,
        isComplete: true,
        retrievalCap: 250,
      },
      observationWindowStart: '2026-08-19T00:00:00Z',
      observationWindowEnd: '2026-11-19T00:00:00Z',
      observationWindowDays: 90,
      activeCount: metricNum(9),
      inactiveCount: metricNum(15),
      archivedCount: { state: 'zero', value: 0 },
      unknownCount: { state: 'zero', value: 0 },
    },
    engagement: {
      source: 'rest_event_stream',
      observationWindowStart: '2026-08-19T00:00:00Z',
      observationWindowEnd: '2026-11-19T00:00:00Z',
      observationWindowDays: 90,
      collectionState: 'complete',
      retrievedEventsCount: 50,
      pullRequestEventActionsCount: metricNum(14),
      issueEventActionsCount: metricNum(6),
      issueCommentEventActionsCount: metricNum(20),
      pullRequestReviewEventActionsCount: metricNum(8),
    },
  },
  authenticated: true,
  estimated: false,
  privateContributions: false,
  privateContributionsStatus: 'unavailable',
  api: {
    cached: true,
    graphqlReset: null,
    restRemaining: null,
    graphqlRemaining: 4998,
    cacheTtlSeconds: 600,
  },
}
