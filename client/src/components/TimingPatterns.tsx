import type { Dashboard } from '../types'
import { topTiming } from '../lib/analytics'

export function TimingPatterns({ data }: { data: Dashboard }) {
  const peak = topTiming(data)
  const maxHour = Math.max(...data.timing.hours, 1)
  const maxDay = Math.max(...data.timing.weekdays, 1)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return (
    <div className="timingGrid">
      <div>
        <div className="miniLabel">Peak activity</div>
        <div className="peakValue">{peak.hour.toString().padStart(2, '0')}:00 <span>· {peak.weekday}</span></div>
      </div>
      <div className="bars hours" aria-label="Commit activity by hour">
        {data.timing.hours.map((value, index) => <span key={index} title={`${index}:00 — ${value} commits`} style={{ height: `${Math.max(4, (value / maxHour) * 100)}%` }} />)}
      </div>
      <div className="dayBars" aria-label="Commit activity by weekday">
        {data.timing.weekdays.map((value, index) => <div key={index}><span>{weekdays[index]}</span><i style={{ width: `${Math.max(4, (value / maxDay) * 100)}%` }} /></div>)}
      </div>
      <p className="mutedSmall">Based on {data.timing.commitsSampled} sampled commits from the most recently active repositories. Times are in {data.timing.timezone || 'UTC'}.</p>
    </div>
  )
}
