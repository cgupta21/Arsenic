import { useState } from 'react'
import { ArrowLeftRight, CheckCircle2, FolderGit2, Info, Search, ShieldAlert, Users } from 'lucide-react'
import type { CompareResponse, Dashboard } from '../types'
import { compareDashboards } from '../hooks/useDashboard'
import { compactNumber } from '../lib/analytics'
import { compareMetric } from '../../../shared/intelligence.js'

function CompareColumn({ title, data }: { title: string; data: Dashboard }) {
  const intel = data.intelligence
  const nonForkRepos = intel?.maintenance?.repositoryCoverage?.observedNonForkRepos ?? data.repos.filter((r) => !r.fork).length
  const totalStars = intel?.adoption?.totalStargazersCount?.value ?? data.repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)

  return (
    <div className="compareColumn">
      <div className="compareIdentity">
        <img src={data.user.avatar_url} alt="" />
        <div>
          <b>{data.user.name || data.user.login}</b>
          <span>@{data.user.login}</span>
        </div>
      </div>
      <div className="compareStats">
        <div><span>Contributions</span><b>{data.contributions.total != null ? compactNumber(data.contributions.total) : '—'}</b></div>
        <div><span>Non-Fork Repos</span><b>{nonForkRepos}</b></div>
        <div><span>Stars</span><b>{compactNumber(totalStars)}</b></div>
        <div><span>Followers</span><b>{compactNumber(data.user.followers)}</b></div>
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
      <div className="sectionHead compact">
        <div>
          <h2>Compare developers</h2>
          <p>Metric-specific side-by-side comparison across multidimensional intelligence.</p>
        </div>
      </div>
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

          {result.left.intelligence && result.right.intelligence && (
            <div className="dimensionalComparisonSection" style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
              <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <Info size={18} /> Multidimensional Metric Comparisons
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {[
                  { key: 'account_followers', label: 'Current Followers' },
                  { key: 'repo_total_stars', label: 'Repository Total Stars' },
                  { key: 'repo_non_archived_stars', label: 'Non-Archived Stars' },
                  { key: 'repo_archived_stars', label: 'Archived Stars' },
                  { key: 'repo_forks', label: 'Forks Count' },
                  {
                    key: result.left.intelligence.activity.source === 'graphql_calendar' && result.right.intelligence.activity.source === 'graphql_calendar'
                      ? 'graphql_recorded_contribution_days'
                      : 'rest_observed_public_event_days',
                    label: 'Observed Active Days'
                  },
                  { key: 'rest_pr_event_actions', label: 'PR Event Actions' }
                ].map(({ key, label }) => {
                  try {
                    const comp = compareMetric(result.left, result.right, key)
                    const winnerText = comp.eligible
                      ? comp.winner === 'tie'
                        ? 'Tie'
                        : `${comp.winner === 'profile_a' ? result.left.user.login : result.right.user.login} leads`
                      : 'Comparison Locked'

                    return (
                      <div key={key} className="previewMetricItem" style={{ padding: '12px', borderRadius: '8px', background: 'var(--card-subtle, rgba(255,255,255,0.03))' }}>
                        <span className="metricLabel">{label}</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                          <span>{result.left.user.login}: <b>{comp.valueA != null ? comp.valueA.toLocaleString() : '—'}</b></span>
                          <span>{result.right.user.login}: <b>{comp.valueB != null ? comp.valueB.toLocaleString() : '—'}</b></span>
                        </div>
                        <span className={`metricTrend ${comp.eligible ? 'positive' : ''}`} style={{ fontSize: '0.8rem' }}>
                          {comp.eligible ? <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} /> : <ShieldAlert size={12} style={{ display: 'inline', marginRight: 4 }} />}
                          {winnerText} {comp.reason ? `(${comp.reason})` : ''}
                        </span>
                      </div>
                    )
                  } catch {
                    return null
                  }
                })}
              </div>

              {/* Maintenance Dimension: Factual side-by-side counts only (no winner declaration) */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.98rem', color: 'var(--muted)' }}>
                  <FolderGit2 size={16} /> Repository Maintenance (Factual Side-by-Side Breakdown)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Non-Fork Repos', a: result.left.intelligence.maintenance.repositoryCoverage.observedNonForkRepos, b: result.right.intelligence.maintenance.repositoryCoverage.observedNonForkRepos },
                    { label: 'Active Repos', a: result.left.intelligence.maintenance.activeCount.value, b: result.right.intelligence.maintenance.activeCount.value },
                    { label: 'Inactive Repos', a: result.left.intelligence.maintenance.inactiveCount.value, b: result.right.intelligence.maintenance.inactiveCount.value },
                    { label: 'Archived Repos', a: result.left.intelligence.maintenance.archivedCount.value, b: result.right.intelligence.maintenance.archivedCount.value },
                  ].map((item) => (
                    <div key={item.label} className="previewMetricItem" style={{ padding: '10px', borderRadius: '6px', background: 'var(--card-subtle, rgba(255,255,255,0.02))' }}>
                      <span className="metricLabel" style={{ fontSize: '0.78rem' }}>{item.label}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.88rem' }}>
                        <span>{result.left.user.login}: <b>{item.a ?? '—'}</b></span>
                        <span>{result.right.user.login}: <b>{item.b ?? '—'}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
