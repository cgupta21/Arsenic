import type {
  DeveloperIntelligence,
  ContributionActivityDimension,
  RepositoryAdoptionDimension,
  AccountReachDimension,
  RepositoryMaintenanceDimension,
  CommunityEngagementDimension,
  MetricValue,
  ObservationState,
  RestCollectionState,
  TelemetrySource,
  RepositoryCoverage,
  MetricKey,
  MetricComparisonResult
} from '../../shared/intelligence'

export type {
  DeveloperIntelligence,
  ContributionActivityDimension,
  RepositoryAdoptionDimension,
  AccountReachDimension,
  RepositoryMaintenanceDimension,
  CommunityEngagementDimension,
  MetricValue,
  ObservationState,
  RestCollectionState,
  TelemetrySource,
  RepositoryCoverage,
  MetricKey,
  MetricComparisonResult
}

export type User = {
  login: string
  name: string | null
  avatar_url: string
  bio: string | null
  html_url: string
  public_repos: number
  followers: number
  following: number
  created_at: string | null
  location: string | null
  blog: string | null
}

export type Repo = {
  id: number
  name: string
  html_url: string
  description: string | null
  language: string | null
  languageColor?: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  updated_at: string
  pushed_at: string | null
  fork: boolean
  archived?: boolean
  status?: 'active' | 'watch' | 'stale' | 'archived'
  daysSince?: number
  issueRatio?: number
  languages?: { size: number; node: { name: string; color?: string | null } }[]
}

export type ActivityEvent = {
  id: string
  type: string
  repo: { name: string }
  created_at: string
  payload: { action?: string; commits?: { message: string }[] }
}

export type ContributionDay = {
  date: string
  contributionCount: number
  contributionLevel?: string
  weekday?: number
  isObserved?: boolean
}

export type Dashboard = {
  user: User
  repos: Repo[]
  events: ActivityEvent[]
  contributions: {
    days: ContributionDay[]
    total: number | null
    activeDays: number | null
    currentStreak: number
    longestStreak: number
    privateContributionCount: number
  }
  dataQuality?: {
    observationWindowDays: number
    isEstimated: boolean
    isTruncated: boolean
    eventsUnavailable?: boolean
    oldestEventDate: string | null
    eventCount: number
    observedDaysCount?: number
  }
  observationWindowDays?: number
  languages: { name: string; size: number; pct: number; color: string | null }[]
  timing: { commitsSampled: number; hours: number[]; weekdays: number[]; timezone?: string }
  intelligence?: DeveloperIntelligence
  /** @deprecated Retired in M-03 in favor of multidimensional intelligence */
  score?: {
    score: number | null
    scoringModel?: 'three_pillar' | 'two_pillar_renormalized' | 'unavailable'
    breakdown: {
      consistency: number | null
      collaboration: number | null
      impact: number
    }
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
      observationWindowDays?: number
      targetActiveDays?: number
    }
  }
  authenticated: boolean
  estimated?: boolean
  privateContributions: boolean
  privateContributionsStatus?: 'included' | 'zero_or_hidden' | 'unavailable'
  api: {
    cached: boolean
    cacheTtlSeconds: number
    graphqlRemaining: number | null
    graphqlReset: string | null
    restRemaining: string | null
  }
}

export type CompareResponse = {
  left: Dashboard
  right: Dashboard
}
