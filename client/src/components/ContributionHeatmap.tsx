import type { Dashboard } from '../types'
import { compactNumber, heatmapCells } from '../lib/analytics'

function levelClass(count: number) {
  if (count <= 0) return 'level0'
  if (count < 2) return 'level1'
  if (count < 5) return 'level2'
  if (count < 10) return 'level3'
  return 'level4'
}

export function ContributionHeatmap({ data }: { data: Dashboard }) {
  const cells = heatmapCells(data.contributions.days)
  return (
    <div className="heatmapWrap">
      <div className="heatmapMeta">
        <div><b>{compactNumber(data.contributions.total)}</b><span>contributions</span></div>
        <div><b>{data.contributions.currentStreak}d</b><span>current streak</span></div>
        <div><b>{data.contributions.longestStreak}d</b><span>longest streak</span></div>
      </div>
      <div className="heatmap" aria-label="Contribution heatmap">
        {cells.map((day, index) => day
          ? <span key={day.date} className={levelClass(day.contributionCount)} title={`${day.date}: ${day.contributionCount} contributions`} />
          : <span key={`pad-${index}`} className="pad" />)}
      </div>
      <div className="legend"><span>Less</span><i className="level0"/><i className="level1"/><i className="level2"/><i className="level3"/><i className="level4"/><span>More</span></div>
    </div>
  )
}
