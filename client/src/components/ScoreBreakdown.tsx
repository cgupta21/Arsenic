import { Activity, Award, GitPullRequest, FolderGit2, Users, UsersRound, Zap, Target } from 'lucide-react'
import type { Dashboard } from '../types'
import { compactNumber } from '../lib/analytics'

export interface ScoreBreakdownProps {
  dashboard?: Dashboard
  /** @deprecated Retained for legacy test compatibility */
  score?: Dashboard['score']
}

export function ScoreBreakdown({ dashboard, score }: ScoreBreakdownProps) {
  const intel = dashboard?.intelligence

  // If dashboard with multidimensional intelligence is available, render the 5 transparent dimensions
  if (intel) {
    const act = intel.activity
    const adopt = intel.adoption
    const reach = intel.reach
    const maint = intel.maintenance
    const eng = intel.engagement

    const reachMetric = reach?.followersCount
    let reachValue = '—'
    let reachBadge = 'Reach Unavailable'
    let reachNote = reachMetric?.note || 'Account reach telemetry unavailable'

    if (reachMetric) {
      switch (reachMetric.state) {
        case 'observed': {
          const formatted = typeof reachMetric.value === 'number' ? compactNumber(reachMetric.value) : '—'
          reachValue = formatted
          reachBadge = `${formatted} Followers`
          reachNote = reachMetric.note || 'Point-in-time public developer account reach'
          break
        }
        case 'zero': {
          reachValue = '0'
          reachBadge = '0 Followers'
          reachNote = reachMetric.note || 'Confirmed zero public followers recorded'
          break
        }
        case 'partial': {
          const lowerBound = typeof reachMetric.value === 'number' ? compactNumber(reachMetric.value) : '0'
          reachValue = `≥${lowerBound}`
          reachBadge = `≥${lowerBound} Followers (Incomplete)`
          reachNote = reachMetric.note || 'Incomplete telemetry: observed lower bound only'
          break
        }
        case 'ambiguous_zero': {
          reachValue = '—'
          reachBadge = 'Ambiguous Reach'
          reachNote = reachMetric.note || 'Unconfirmed zero: telemetry incomplete or unverified'
          break
        }
        case 'unknown':
        case 'unavailable':
        default: {
          reachValue = '—'
          reachBadge = 'Reach Unavailable'
          reachNote = reachMetric.note || 'Account reach telemetry unavailable'
          break
        }
      }
    }

    const dimensions = [
      {
        title: 'Contribution Activity',
        icon: Activity,
        badge: act.source === 'graphql_calendar' ? 'GraphQL Calendar' : 'REST Public Events',
        stats: [
          {
            label: 'Active Days',
            value: (act.source === 'graphql_calendar' ? act.recordedContributionDaysCount.value : act.observedPublicEventDaysCount.value) ?? '—'
          },
          {
            label: 'Total Output',
            value: (act.source === 'graphql_calendar' ? act.totalRecordedContributions.value : act.totalObservedPublicEvents.value) != null
              ? compactNumber((act.source === 'graphql_calendar' ? act.totalRecordedContributions.value : act.totalObservedPublicEvents.value)!)
              : '—'
          },
          {
            label: 'Current Streak',
            value: (act.source === 'graphql_calendar' ? act.contributionCurrentStreakDays.value : null) != null
              ? `${(act.source === 'graphql_calendar' ? act.contributionCurrentStreakDays.value : null)}d`
              : '—'
          },
          {
            label: 'Longest Streak',
            value: (act.source === 'graphql_calendar' ? act.contributionLongestStreakDays.value : act.observedPublicEventDateStreakDays.value) != null
              ? `${(act.source === 'graphql_calendar' ? act.contributionLongestStreakDays.value : act.observedPublicEventDateStreakDays.value)}d`
              : '—'
          }
        ],
        note: act.source === 'graphql_calendar'
          ? '365-day observation window'
          : (act.collectionState === 'complete' ? '90-day observation window' : `Collection: ${act.collectionState}`)
      },
      {
        title: 'Repository Adoption',
        icon: Award,
        badge: `${compactNumber(adopt.totalStargazersCount.value ?? 0)} Stars`,
        stats: [
          { label: 'Total Stars', value: compactNumber(adopt.totalStargazersCount.value ?? 0) },
          { label: 'Non-Archived Stars', value: compactNumber(adopt.nonArchivedRepoStarsCount.value ?? 0) },
          { label: 'Archived Stars', value: compactNumber(adopt.archivedRepoStarsCount.value ?? 0) },
          { label: 'Forks Count', value: compactNumber(adopt.forksCount.value ?? 0) }
        ],
        note: 'Direct engagement across public repositories'
      },
      {
        title: 'Account Reach',
        icon: Users,
        badge: reachBadge,
        stats: [
          { label: 'Followers', value: reachValue }
        ],
        note: reachNote
      },
      {
        title: 'Repository Maintenance',
        icon: FolderGit2,
        badge: `${maint.repositoryCoverage.observedNonForkRepos} Non-Fork Repos`,
        stats: [
          { label: 'Active', value: maint.activeCount.value ?? 0 },
          { label: 'Inactive', value: maint.inactiveCount.value ?? 0 },
          { label: 'Archived', value: maint.archivedCount.value ?? 0 },
          { label: 'Unknown', value: maint.unknownCount.value ?? 0 }
        ],
        note: `Coverage: ${maint.repositoryCoverage.isComplete ? 'Complete non-fork' : 'Sampled non-fork'}`
      },
      {
        title: 'Community Engagement',
        icon: GitPullRequest,
        badge: eng.collectionState === 'complete' ? 'Complete Stream' : `Stream: ${eng.collectionState}`,
        stats: [
          { label: 'PR Actions', value: eng.pullRequestEventActionsCount.value ?? '—' },
          { label: 'Review Actions', value: eng.pullRequestReviewEventActionsCount.value ?? '—' },
          { label: 'Issue Actions', value: eng.issueEventActionsCount.value ?? '—' }
        ],
        note: eng.collectionState === 'complete' ? 'Verified event actions in observation window' : 'Telemetry restricted or truncated'
      }
    ]

    return (
      <div className="scoreBreakdown dimensionalBreakdown">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {dimensions.map((dim) => {
            const Icon = dim.icon
            return (
              <div key={dim.title} className="previewMetricItem" style={{ padding: '14px', borderRadius: '10px', background: 'var(--card-subtle, rgba(255,255,255,0.03))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.92rem' }}>
                    <Icon size={16} /> {dim.title}
                  </span>
                  <span className="previewTag tagSand" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                    {dim.badge}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', margin: '10px 0' }}>
                  {dim.stats.map((st) => (
                    <div key={st.label} style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.75rem' }}>{st.label}</span>
                      <strong style={{ fontSize: '1rem' }}>{st.value}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', paddingTop: '6px' }}>
                  {dim.note}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Fallback for legacy score prop if passed in tests
  const activeScore = score || dashboard?.score
  if (activeScore) {
    const items = [
      { label: 'Consistency', value: activeScore.breakdown?.consistency, icon: Target },
      { label: 'Collaboration', value: activeScore.breakdown?.collaboration, icon: UsersRound },
      { label: 'Impact', value: activeScore.breakdown?.impact, icon: Zap },
    ]
    const isUnavailable = activeScore.score == null || activeScore.breakdown?.consistency == null
    const isTruncated = !isUnavailable && (activeScore.scoringModel === 'two_pillar_renormalized' || activeScore.breakdown?.collaboration == null)

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

  return (
    <div className="scoreBreakdown">
      <p className="scoreNote">Multidimensional telemetry loaded.</p>
    </div>
  )
}
