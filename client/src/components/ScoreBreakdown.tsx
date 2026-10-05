import { Target, UsersRound, Zap } from 'lucide-react'
import type { Dashboard } from '../types'

export function ScoreBreakdown({ score }: { score: Dashboard['score'] }) {
  const items = [
    { label: 'Consistency', value: score.breakdown.consistency, icon: Target },
    { label: 'Collaboration', value: score.breakdown.collaboration, icon: UsersRound },
    { label: 'Impact', value: score.breakdown.impact, icon: Zap },
  ]
  return (
    <div className="scoreBreakdown">
      {items.map(({ label, value, icon: Icon }) => (
        <div className="scoreMetric" key={label}>
          <div className="scoreMetricHead"><span><Icon size={15} />{label}</span><b>{value}</b></div>
          <div className="meter"><span style={{ width: `${value}%` }} /></div>
        </div>
      ))}
      <p className="scoreNote">Overall Arsenic score is weighted 45% consistency, 30% collaboration, and 25% impact. Low activity can produce a low score.</p>
    </div>
  )
}
