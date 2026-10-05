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
  const { user, repos, languages, contributions, score } = data
  const insights: string[] = []
  const stale = repos.filter((repo) => repo.status === 'stale').length
  const active = repos.filter((repo) => repo.status === 'active').length

  if (contributions.currentStreak >= 7) {
    insights.push(`${user.name || `@${user.login}`} currently has a ${contributions.currentStreak}-day contribution streak.`)
  } else {
    insights.push(`${user.name || `@${user.login}`} has ${contributions.activeDays} active contribution days in the last ${data.estimated ? '90 days (estimated from public events)' : 'year'}.`)
  }
  if (languages[0]) {
    insights.push(`${languages[0].name} leads by code volume across the analyzed repositories.`)
  }
  if (score.breakdown.collaboration >= 65) {
    insights.push(`Collaboration is a strong signal, with ${score.raw.prs} pull requests, ${score.raw.issues} issues and ${score.raw.reviews} reviews in the contribution window.`)
  } else {
    insights.push(`Collaboration is currently lighter than coding activity, so issues and pull requests are a useful growth area.`)
  }
  if (stale) {
    insights.push(`${stale} repositories are stale; ${active} are active in the last 30 days.`)
  } else {
    insights.push(`Repository health is relatively fresh: ${active} repositories were updated within the last 30 days.`)
  }
  return insights.slice(0, 4)
}

// Pads the start so the first column begins on the correct weekday (Sunday = row 1), like GitHub's calendar.
export function heatmapCells(days: Dashboard['contributions']['days']) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-371)
  if (!sorted.length) return []
  const firstWeekday = new Date(`${sorted[0].date}T00:00:00Z`).getUTCDay()
  return [...Array.from({ length: firstWeekday }, () => null), ...sorted] as (Dashboard['contributions']['days'][number] | null)[]
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

export const compactNumber = (value: number) => new Intl.NumberFormat('en', { notation: value > 999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
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
