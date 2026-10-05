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
}

export type Dashboard = {
  user: User
  repos: Repo[]
  events: ActivityEvent[]
  contributions: {
    days: ContributionDay[]
    total: number
    activeDays: number
    currentStreak: number
    longestStreak: number
    privateContributionCount: number
  }
  languages: { name: string; size: number; pct: number; color: string | null }[]
  timing: { commitsSampled: number; hours: number[]; weekdays: number[]; timezone?: string }
  score: {
    score: number
    breakdown: { consistency: number; collaboration: number; impact: number }
    raw: {
      activeDays: number
      totalContributions: number
      prs: number
      issues: number
      reviews: number
      stars: number
      forks: number
      currentStreak: number
      longestStreak: number
      timingSamples: number
    }
  }
  authenticated: boolean
  estimated?: boolean
  privateContributions: boolean
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
