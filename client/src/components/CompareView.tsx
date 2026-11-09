import { useState } from 'react'
import { ArrowLeftRight, Medal, Search, Users } from 'lucide-react'
import type { CompareResponse, Dashboard } from '../types'
import { compareDashboards } from '../hooks/useDashboard'
import { compactNumber } from '../lib/analytics'

export type ScoringModelType = 'three_pillar' | 'two_pillar_renormalized' | 'unavailable'

export function resolveScoringModel(dashboard: Dashboard): ScoringModelType {
  if (dashboard.score.score == null || dashboard.score.breakdown.consistency == null) {
    return 'unavailable'
  }
  if (dashboard.score.scoringModel) {
    return dashboard.score.scoringModel
  }
  if (dashboard.dataQuality?.eventsUnavailable) {
    return 'unavailable'
  }
  if (dashboard.score.breakdown.collaboration == null || dashboard.dataQuality?.isTruncated) {
    return 'two_pillar_renormalized'
  }
  return 'three_pillar'
}

function getModelLabel(model: ScoringModelType): string {
  switch (model) {
    case 'three_pillar': return 'Complete 3-Pillar'
    case 'two_pillar_renormalized': return 'Truncated 2-Pillar'
    case 'unavailable': return 'Telemetry Incomplete'
  }
}

export function getComparisonVerdict(left: Dashboard, right: Dashboard): string {
  const modelLeft = resolveScoringModel(left)
  const modelRight = resolveScoringModel(right)

  if (modelLeft === 'unavailable' || modelRight === 'unavailable' || left.score.score == null || right.score.score == null) {
    return 'Overall comparison unavailable: one or both developers have incomplete contribution telemetry.'
  }

  if (modelLeft !== modelRight) {
    return `Overall score comparison disabled: incompatible scoring models (${getModelLabel(modelLeft)} vs. ${getModelLabel(modelRight)}). Individual metrics remain visible above.`
  }

  if (modelLeft === 'two_pillar_renormalized') {
    return 'Overall score comparison disabled: both profiles have truncated contribution telemetry and should not be used to determine an overall winner. Individual metrics remain visible above.'
  }

  const scoreLeft = left.score.score
  const scoreRight = right.score.score

  if (scoreLeft === scoreRight) {
    return 'Tie on Arsenic score'
  }

  const leader = scoreLeft > scoreRight ? left.user.login : right.user.login
  return `${leader} leads by overall score`
}

function CompareColumn({ title, data }: { title: string; data: Dashboard }) {
  const model = resolveScoringModel(data)
  return (
    <div className="compareColumn">
      <div className="compareIdentity">
        <img src={data.user.avatar_url} alt="" />
        <div>
          <b>{data.user.name || data.user.login}</b>
          <span>@{data.user.login}</span>
          <span className="compareModelBadge">{getModelLabel(model)}</span>
        </div>
        <strong>{data.score.score != null ? data.score.score : '—'}</strong>
      </div>
      <div className="compareStats">
        <div><span>Contributions</span><b>{data.contributions.total != null ? compactNumber(data.contributions.total) : '—'}</b></div>
        <div><span>Repos</span><b>{data.repos.length}</b></div>
        <div><span>Stars</span><b>{compactNumber(data.score.raw.stars)}</b></div>
        <div><span>Followers</span><b>{compactNumber(data.user.followers)}</b></div>
      </div>
      <div className="compareBars">
        {(['consistency', 'collaboration', 'impact'] as const).map((key) => <div key={key}><span>{key}</span><i><em style={{ width: `${data.score.breakdown[key] ?? 0}%` }} /></i><b>{data.score.breakdown[key] != null ? data.score.breakdown[key] : '—'}</b></div>)}
      </div>
      <h4>{title}</h4>
    </div>
  )
}

export function CompareView({ initialLeft, initialRight }: { initialLeft: string; initialRight: string }) {
  const [left, setLeft] = useState(initialLeft || 'cgupta21')
  const [right, setRight] = useState(initialRight || 'torvalds')
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!left.trim() || !right.trim()) return
    setLoading(true)
    setError('')
    try { setResult(await compareDashboards(left.trim(), right.trim())) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Comparison failed.') } finally { setLoading(false) }
  }

  return (
    <section className="comparePage">
      <div className="sectionHead compact"><div><h2>Compare developers</h2><p>Side-by-side signals for consistency, collaboration and impact.</p></div></div>
      <form className="compareForm" onSubmit={run}>
        <div><label htmlFor="compare-left">Developer A</label><div className="inputWrap"><Users size={16} /><input id="compare-left" value={left} onChange={(e) => setLeft(e.target.value)} /></div></div>
        <ArrowLeftRight className="compareArrow" aria-hidden="true" />
        <div><label htmlFor="compare-right">Developer B</label><div className="inputWrap"><Users size={16} /><input id="compare-right" value={right} onChange={(e) => setRight(e.target.value)} /></div></div>
        <button className="primaryBtn" disabled={loading}><Search size={15} />{loading ? 'Comparing…' : 'Compare'}</button>
      </form>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="compareGrid">
          <CompareColumn title="Developer A" data={result.left} />
          <CompareColumn title="Developer B" data={result.right} />
          <div className="winner">
            <Medal size={18} />
            {getComparisonVerdict(result.left, result.right)}
          </div>
        </div>
      )}
    </section>
  )
}
