import type { Dashboard } from '../types'
import { compactNumber, heatmapCells } from '../lib/analytics'

function levelClass(day: Dashboard['contributions']['days'][number] | null, eventsUnavailable?: boolean) {
  if (eventsUnavailable || (day && day.isObserved === false)) return 'levelUnobserved'
  if (!day || day.contributionCount <= 0) return 'level0'
  if (day.contributionCount < 2) return 'level1'
  if (day.contributionCount < 5) return 'level2'
  if (day.contributionCount < 10) return 'level3'
  return 'level4'
}

export function normalizeHeatmapDays(
  rawDays: Dashboard['contributions']['days'],
  dataQuality?: Dashboard['dataQuality']
): Dashboard['contributions']['days'] {
  const dayMap = new Map<string, Dashboard['contributions']['days'][number]>()
  for (const day of rawDays || []) {
    if (day?.date) dayMap.set(day.date, day)
  }

  const eventsUnavailable = Boolean(dataQuality?.eventsUnavailable)
  const isTruncated = Boolean(dataQuality?.isTruncated)
  const oldestEventDate = dataQuality?.oldestEventDate || null

  const today = new Date()
  const todayIso = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)

  let endIso = todayIso
  if (rawDays && rawDays.length > 0) {
    const sortedDates = [...rawDays].map((d) => d.date).sort()
    const maxDate = sortedDates[sortedDates.length - 1]
    if (maxDate && maxDate > todayIso) {
      endIso = maxDate
    }
  }

  const endDate = new Date(`${endIso}T00:00:00Z`)
  const result: Dashboard['contributions']['days'] = []

  for (let offset = 364; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() - offset))
    const dateStr = d.toISOString().slice(0, 10)
    const existing = dayMap.get(dateStr)
    if (existing) {
      result.push(existing)
    } else {
      const isObserved = !eventsUnavailable && (!isTruncated || !oldestEventDate || dateStr >= oldestEventDate)
      result.push({
        date: dateStr,
        contributionCount: 0,
        weekday: d.getUTCDay(),
        isObserved,
      })
    }
  }

  return result
}

export function ContributionHeatmap({ data }: { data: Dashboard }) {
  const eventsUnavailable = Boolean(data.dataQuality?.eventsUnavailable)
  const fullYearDays = normalizeHeatmapDays(data.contributions.days, data.dataQuality)
  const cells = heatmapCells(fullYearDays)

  return (
    <div className="heatmapWrap">
      <div className="heatmapMeta">
        <div><b>{data.contributions.total != null ? compactNumber(data.contributions.total) : '—'}</b><span>contributions</span></div>
        <div><b>{eventsUnavailable || data.contributions.activeDays == null ? '—' : `${data.contributions.currentStreak}d`}</b><span>current streak</span></div>
        <div><b>{eventsUnavailable || data.contributions.activeDays == null ? '—' : `${data.contributions.longestStreak}d`}</b><span>longest streak</span></div>
      </div>
      <div className="heatmap" aria-label="Contribution heatmap">
        {cells.map((day, index) => day
          ? (
            <span
              key={day.date}
              className={levelClass(day, eventsUnavailable)}
              title={
                eventsUnavailable || day.isObserved === false
                  ? `${day.date}: Activity unobserved`
                  : `${day.date}: ${day.contributionCount} contributions`
              }
            />
          )
          : <span key={`pad-${index}`} className="pad" />)}
      </div>
      <div className="legend"><span>Less</span><i className="level0"/><i className="level1"/><i className="level2"/><i className="level3"/><i className="level4"/><span>More</span></div>
    </div>
  )
}
