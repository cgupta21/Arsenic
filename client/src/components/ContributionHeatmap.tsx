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

export function ContributionHeatmap({ data }: { data: Dashboard }) {
  const cells = heatmapCells(data.contributions.days)
  const eventsUnavailable = Boolean(data.dataQuality?.eventsUnavailable)

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
