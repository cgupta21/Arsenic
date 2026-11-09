import { Target, UsersRound, Zap } from 'lucide-react'
import type { Dashboard } from '../types'

export function ScoreBreakdown({ score }: { score: Dashboard['score'] }) {
  const items = [
    { label: 'Consistency', value: score.breakdown.consistency, icon: Target },
    { label: 'Collaboration', value: score.breakdown.collaboration, icon: UsersRound },
    { label: 'Impact', value: score.breakdown.impact, icon: Zap },
  ]
  const isUnavailable = score.score == null || score.breakdown.consistency == null
  const isTruncated = !isUnavailable && (score.scoringModel === 'two_pillar_renormalized' || score.breakdown.collaboration == null)

  const note = isUnavailable
    ? 'Insufficient contribution telemetry prevents calculating a reliable overall score. Repository impact signals remain available.'
    : isTruncated
      ? 'Truncated activity stream: score is reweighted across observed dimensions (64% consistency, 36% impact). Collaboration is excluded from the truncated window to prevent volatility.'
      : 'Complete three-pillar score: weighted 45% consistency, 30% collaboration, and 25% impact across the full observation calendar.'

  return (
    <div className="scoreBreakdown">
      {items.map(({ label, value, icon: Icon }) => (
        <div className="scoreMetric" key={label}>
          <div className="scoreMetricHead"><span><Icon size={15} />{label}</span><b>{value != null ? value : '—'}</b></div>
          <div className="meter"><span style={{ width: `${value ?? 0}%` }} /></div>
        </div>
      ))}
      <p className="scoreNote">{note}</p>
    </div>
  )
}
