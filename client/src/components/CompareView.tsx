import { useState } from 'react'
import { ArrowLeftRight, Medal, Search, Users } from 'lucide-react'
import type { CompareResponse, Dashboard } from '../types'
import { compareDashboards } from '../hooks/useDashboard'
import { compactNumber } from '../lib/analytics'

function CompareColumn({ title, data }: { title: string; data: Dashboard }) {
  return (
    <div className="compareColumn">
      <div className="compareIdentity"><img src={data.user.avatar_url} alt="" /><div><b>{data.user.name || data.user.login}</b><span>@{data.user.login}</span></div><strong>{data.score.score}</strong></div>
      <div className="compareStats">
        <div><span>Contributions</span><b>{compactNumber(data.contributions.total)}</b></div>
        <div><span>Repos</span><b>{data.repos.length}</b></div>
        <div><span>Stars</span><b>{compactNumber(data.score.raw.stars)}</b></div>
        <div><span>Followers</span><b>{compactNumber(data.user.followers)}</b></div>
      </div>
      <div className="compareBars">
        {(['consistency', 'collaboration', 'impact'] as const).map((key) => <div key={key}><span>{key}</span><i><em style={{ width: `${data.score.breakdown[key]}%` }} /></i><b>{data.score.breakdown[key]}</b></div>)}
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
      {result && <div className="compareGrid"><CompareColumn title="Developer A" data={result.left} /><CompareColumn title="Developer B" data={result.right} /><div className="winner"><Medal size={18} />{result.left.score.score === result.right.score.score ? 'Tie on Arsenic score' : result.left.score.score > result.right.score.score ? `${result.left.user.login} leads by overall score` : `${result.right.user.login} leads by overall score`}</div></div>}
    </section>
  )
}
