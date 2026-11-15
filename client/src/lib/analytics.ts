import type { Dashboard } from '../types'

export const palette = {
  terracotta: '#C96A45',
  sage: '#87966A',
  sand: '#E5D3B3',
  ink: '#11110F',
  paper: '#F4EEE3',
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function buildInsights(data: Dashboard) {
  const { user, repos, languages, contributions } = data
  const insights: string[] = []
  const stale = repos.filter((repo) => repo.status === 'stale').length
  const active = repos.filter((repo) => repo.status === 'active').length
  const watch = repos.filter((repo) => repo.status === 'watch').length
  const archived = repos.filter((repo) => repo.status === 'archived').length

  const eventsUnavailable = Boolean(data.dataQuality?.eventsUnavailable)
  const isTruncated = Boolean(data.dataQuality?.isTruncated)

  if (eventsUnavailable || contributions.activeDays == null) {
    insights.push(`Contribution cadence is currently unobserved due to limited public events data.`)
  } else if (contributions.currentStreak >= 7) {
    insights.push(`${user.name || `@${user.login}`} currently has a ${contributions.currentStreak}-day contribution streak.`)
  } else {
    insights.push(`${user.name || `@${user.login}`} has ${contributions.activeDays} active contribution days in the last ${data.estimated ? '365 days (estimated from public events)' : 'year'}.`)
  }
  if (languages[0]) {
    insights.push(`${languages[0].name} leads by code volume across the analyzed repositories.`)
  }
  const engagement = data.intelligence?.engagement
  if (engagement && engagement.collectionState === 'complete' && !isTruncated && !eventsUnavailable) {
    const prs = engagement.pullRequestEventActionsCount.value ?? 0
    const issues = engagement.issueEventActionsCount.value ?? 0
    const reviews = engagement.pullRequestReviewEventActionsCount.value ?? 0
    if (prs + reviews + issues > 0) {
      insights.push(`Public collaborative activity includes ${prs} pull request actions, ${issues} issue actions and ${reviews} review actions observed.`)
    }
  }
  const repoBreakdownParts: string[] = []
  if (active > 0) repoBreakdownParts.push(`${active} active`)
  if (watch > 0) repoBreakdownParts.push(`${watch} watch`)
  if (stale > 0) repoBreakdownParts.push(`${stale} stale`)
  if (archived > 0) repoBreakdownParts.push(`${archived} archived`)
  if (repoBreakdownParts.length > 0) {
    insights.push(`Repository health across ${repos.length} total projects: ${repoBreakdownParts.join(', ')}.`)
  }
  return insights.slice(0, 4)
}

// Pads the start so the first column begins on the correct weekday (Sunday = row 1)
// and pads the end so the final column completes all 7 weekdays, matching GitHub's 53-week calendar.
export function heatmapCells(days: Dashboard['contributions']['days']) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-371)
  if (!sorted.length) return []
  const firstWeekday = new Date(`${sorted[0].date}T00:00:00Z`).getUTCDay()
  const leadingPads = Array.from({ length: firstWeekday }, () => null)
  const allCells = [...leadingPads, ...sorted] as (Dashboard['contributions']['days'][number] | null)[]
  const remainder = allCells.length % 7
  const trailingPads = remainder > 0 ? Array.from({ length: 7 - remainder }, () => null) : []
  return [...allCells, ...trailingPads]
}

export function topTiming(data: Dashboard) {
  const hourIndex = data.timing.hours.reduce((best, count, index, source) => count > source[best] ? index : best, 0)
  const dayIndex = data.timing.weekdays.reduce((best, count, index, source) => count > source[best] ? index : best, 0)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return { hour: hourIndex, weekday: days[dayIndex] || '—' }
}

export function relativeDays(value: string | null) {
  if (!value) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
}

export const compactNumber = (value: number | null | undefined) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { notation: value > 999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}
export const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export function eventText(event: Dashboard['events'][number]) {
  const repo = event.repo.name.split('/')[1] || event.repo.name
  if (event.type === 'PushEvent') return `Pushed code to ${repo}`
  if (event.type === 'PullRequestEvent') return `${event.payload.action || 'Updated'} a pull request in ${repo}`
  if (event.type === 'IssuesEvent') return `${event.payload.action || 'Updated'} an issue in ${repo}`
  if (event.type === 'CreateEvent') return `Created something in ${repo}`
  if (event.type === 'WatchEvent') return `Starred ${repo}`
  return `Activity in ${repo}`
}
