import { useMemo } from 'react'
import { CheckCircle2, FolderGit2, GitBranch, Sparkles } from 'lucide-react'
import type { Dashboard } from '../types'
import { compactNumber, topTiming } from '../lib/analytics'

export interface DeveloperIntelligenceOverviewProps {
  data: Dashboard
  loading?: boolean
}

function getDensityLevelClass(day: { contributionCount: number; isObserved?: boolean } | null, eventsUnavailable?: boolean): string {
  if (eventsUnavailable || (day && day.isObserved === false)) return 'lvl-unobserved'
  if (!day || day.contributionCount <= 0) return 'lvl-0'
  if (day.contributionCount < 2) return 'lvl-1'
  if (day.contributionCount < 5) return 'lvl-2'
  if (day.contributionCount < 10) return 'lvl-3'
  return 'lvl-4'
}

export function DeveloperIntelligenceOverview({ data, loading = false }: DeveloperIntelligenceOverviewProps) {
  const user = data.user
  const score = data.score
  const intelligence = data.intelligence
  const repos = data.repos || []
  const days = data.contributions?.days || []

  // Top non-fork active repo for title display
  const primaryRepo = useMemo(() => {
    return repos.find((r) => !r.fork) || repos[0] || null
  }, [repos])

  const hasActiveRepos = useMemo(() => {
    return repos.some((r) => r.status === 'active')
  }, [repos])

  // Total stars across analyzed repos
  const totalStars = useMemo(() => {
    if (intelligence?.adoption?.totalStargazersCount?.value != null) {
      return intelligence.adoption.totalStargazersCount.value
    }
    return score?.raw?.stars ?? repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)
  }, [intelligence?.adoption?.totalStargazersCount?.value, score?.raw?.stars, repos])

  const nonForkReposCount = useMemo(() => {
    if (intelligence?.maintenance?.repositoryCoverage?.observedNonForkRepos != null) {
      return intelligence.maintenance.repositoryCoverage.observedNonForkRepos
    }
    return repos.filter((r) => !r.fork).length
  }, [intelligence?.maintenance?.repositoryCoverage?.observedNonForkRepos, repos])

  const activeDaysCount = useMemo(() => {
    if (!intelligence) return data.contributions?.activeDays ?? score?.raw?.activeDays ?? null
    if (intelligence.activity.source === 'graphql_calendar') {
      return intelligence.activity.recordedContributionDaysCount.value
    }
    return intelligence.activity.observedPublicEventDaysCount.value
  }, [intelligence, data.contributions?.activeDays, score?.raw?.activeDays])

  const eventsUnavailable = Boolean(data.dataQuality?.eventsUnavailable)

  // Determine whether genuine positive contribution activity has been demonstrated
  const hasDemonstratedActivity = useMemo(() => {
    if (eventsUnavailable) return false
    const total = data.contributions?.total ?? score?.raw?.totalContributions
    const activeDays = data.contributions?.activeDays ?? score?.raw?.activeDays
    const prs = score?.raw?.prs ?? intelligence?.engagement?.pullRequestEventActionsCount?.value
    const issues = score?.raw?.issues ?? intelligence?.engagement?.issueEventActionsCount?.value
    const reviews = score?.raw?.reviews ?? intelligence?.engagement?.pullRequestReviewEventActionsCount?.value
    const hasDayActivity = days.some((d) => (d.contributionCount || 0) > 0)
    return (
      (total != null && total > 0) ||
      (activeDays != null && activeDays > 0) ||
      (prs != null && prs > 0) ||
      (issues != null && issues > 0) ||
      (reviews != null && reviews > 0) ||
      hasDayActivity
    )
  }, [
    eventsUnavailable,
    data.contributions?.total,
    data.contributions?.activeDays,
    score?.raw?.totalContributions,
    score?.raw?.activeDays,
    score?.raw?.prs,
    score?.raw?.issues,
    score?.raw?.reviews,
    intelligence?.engagement,
    days,
  ])

  // Trend calculation comparing the last 28 days vs prior 28 days (4-week periods)
  const commitTrend = useMemo(() => {
    if (eventsUnavailable || data.contributions.total == null) {
      return { text: 'Telemetry unavailable', positive: false }
    }
    if (!days.length) {
      return { text: 'No recent activity', positive: false }
    }
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const recent28 = sorted.slice(-28).reduce((sum, d) => sum + (d.contributionCount || 0), 0)
    const prior28 = sorted.slice(-56, -28).reduce((sum, d) => sum + (d.contributionCount || 0), 0)

    if (prior28 > 0) {
      const pct = Math.round(((recent28 - prior28) / prior28) * 100)
      return {
        text: `${pct >= 0 ? '+' : ''}${pct}% vs prior 4w`,
        positive: pct >= 0,
      }
    }
    if (recent28 > 0) {
      return {
        text: `+${recent28} in last 4w`,
        positive: true,
      }
    }
    const prs = score?.raw?.prs ?? intelligence?.engagement?.pullRequestEventActionsCount?.value ?? 0
    if (prs > 0) {
      return { text: `${prs} PRs on record`, positive: false }
    }
    return { text: '0 recent contributions', positive: false }
  }, [days, score?.raw?.prs, intelligence?.engagement?.pullRequestEventActionsCount?.value, eventsUnavailable, data.contributions.total])

  // PR velocity calculated over weeks in contribution window
  const prVelocityData = useMemo(() => {
    const rawPrCount = score?.raw?.prs ?? intelligence?.engagement?.pullRequestEventActionsCount?.value
    if (eventsUnavailable || rawPrCount == null) {
      return {
        velocity: '—',
        subtext: 'Telemetry unavailable',
        positive: false,
      }
    }
    const prCount = rawPrCount
    const weeksCount = data.estimated
      ? 13 // ~90 days in public fallback mode
      : days.length > 0
        ? Math.max(1, Math.round(days.length / 7))
        : 52

    const velocity = (prCount / weeksCount).toFixed(1)
    const numericVel = Number(velocity)

    let subtext = 'No recent PRs'
    let positive = false

    if (numericVel >= 4) {
      subtext = 'Top 5% velocity'
      positive = true
    } else if (numericVel >= 2) {
      subtext = 'High velocity'
      positive = true
    } else if (prCount > 0) {
      subtext = `${prCount} PR${prCount === 1 ? '' : 's'} in window`
      positive = false
    }

    return {
      velocity,
      subtext,
      positive,
    }
  }, [score?.raw?.prs, intelligence?.engagement?.pullRequestEventActionsCount?.value, data.estimated, days.length, eventsUnavailable])

  // Recent 64 days for the 16x4 desktop / 8x8 mobile density grid
  const recentDensityDays = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const slice = sorted.slice(-64)
    if (slice.length < 64) {
      const padCount = 64 - slice.length
      const pads = Array.from({ length: padCount }, () => null)
      return [...pads, ...slice]
    }
    return slice
  }, [days])

  // Peak commit timing pattern
  const timingInfo = useMemo(() => {
    if (eventsUnavailable) return 'Telemetry unobserved'
    const peak = topTiming(data)
    const sampled = data.timing?.commitsSampled ?? 0
    if (sampled > 0 && peak.hour !== undefined) {
      return `Peak: ${peak.hour.toString().padStart(2, '0')}:00 UTC · ${peak.weekday}`
    }
    return data.estimated ? 'Recent activity (~90 days)' : 'Last 16 weeks'
  }, [data, eventsUnavailable])

  return (
    <div className="dashboardOverviewWrap">
      <div
        className={`dashboardPreviewCard liveOverviewCard ${loading ? 'overviewLoading' : ''}`}
        aria-label="Developer Intelligence Overview"
        id="developer-intelligence-overview"
      >
        {/* Card Header with Window Controls, Context & Status */}
        <div className="previewCardHeader">
          <div className="previewWindowControls" aria-hidden="true">
            <span className="dot dotRed" />
            <span className="dot dotYellow" />
            <span className="dot dotGreen" />
          </div>
          <div className="previewCardTitle">
            <FolderGit2 size={14} aria-hidden="true" />
            <span>
              @{user.login}
              {primaryRepo ? ` / ${primaryRepo.name}` : ''}
            </span>
            <span className="previewStatusBadge">
              {data.authenticated ? 'Authenticated' : 'Public API'} •{' '}
              {hasActiveRepos ? 'Active' : repos.length === 0 ? 'No Repos' : 'Dormant'}
            </span>
          </div>
          <div className="previewLivePill">
            <span className="pulseIndicator" aria-hidden="true" />
            <span>{loading ? 'Refreshing Intelligence…' : 'Live Intelligence Overview'}</span>
          </div>
        </div>

        <div className="previewCardBody">
          {/* Top Score Strip with Transparent Multidimensional Intelligence */}
          {(() => {
            const engagement = intelligence?.engagement
            const isCollabComplete = engagement
              ? engagement.collectionState === 'complete'
              : !data.dataQuality?.isTruncated && !eventsUnavailable

            const prCollabActions = engagement?.pullRequestEventActionsCount?.value ?? score?.raw?.prs ?? 0
            const reviewCollabActions = engagement?.pullRequestReviewEventActionsCount?.value ?? score?.raw?.reviews ?? 0

            const isHighVelocity = !eventsUnavailable && (
              (engagement ? prCollabActions >= 8 : (score?.breakdown?.collaboration != null && score.breakdown.collaboration >= 60)) ||
              (prVelocityData.velocity !== '—' && Number(prVelocityData.velocity) >= 2)
            )

            const isActiveCollab = !eventsUnavailable && !isHighVelocity && (
              engagement
                ? (prCollabActions + reviewCollabActions) >= 3
                : (score?.breakdown?.collaboration != null && score.breakdown.collaboration >= 35)
            )

            const isLowCollab = !eventsUnavailable && isCollabComplete && hasDemonstratedActivity && (
              engagement
                ? (prCollabActions + reviewCollabActions) <= 1
                : (score?.breakdown?.collaboration != null ? score.breakdown.collaboration < 35 : (prCollabActions + reviewCollabActions) <= 1)
            )

            return (
              <div className="previewScoreStrip">
                <div className="previewScoreMain">
                  <div className="previewScoreValue" data-testid="overview-health-score">
                    {activeDaysCount != null ? activeDaysCount : '—'}
                  </div>
                  <div className="previewScoreMeta">
                    <div className="scoreGrade">Active Days Recorded</div>
                    <div className="scoreSubtext" data-testid="overview-score-breakdown">
                      {activeDaysCount != null ? `${activeDaysCount} Active Days` : 'Activity Unobserved'} • {nonForkReposCount} Non-Fork Repos • {compactNumber(totalStars)} Stars • {compactNumber(user.followers)} Followers
                    </div>
                  </div>
                </div>
                <div className="previewScoreTags">
                  {eventsUnavailable ? (
                    <span className="previewTag tagSand">
                      <Sparkles size={12} aria-hidden="true" /> Telemetry Partial
                    </span>
                  ) : isHighVelocity ? (
                    <span className="previewTag tagSage">
                      <CheckCircle2 size={12} aria-hidden="true" /> High Velocity
                    </span>
                  ) : isActiveCollab ? (
                    <span className="previewTag tagSage">
                      <CheckCircle2 size={12} aria-hidden="true" /> Active Collab
                    </span>
                  ) : isLowCollab ? (
                    <span
                      className="previewTag tagSand"
                      title="Limited collaboration signals in observed public activity"
                    >
                      <CheckCircle2 size={12} aria-hidden="true" /> Low Collaboration
                    </span>
                  ) : null}

                  {eventsUnavailable ? (
                    hasActiveRepos ? (
                      <span className="previewTag tagSand">
                        <GitBranch size={12} aria-hidden="true" /> Active Maintenance
                      </span>
                    ) : null
                  ) : (data.contributions?.currentStreak ?? 0) >= 7 || (intelligence ? (activeDaysCount != null && activeDaysCount >= 30) : (score?.breakdown?.consistency != null ? score.breakdown.consistency >= 75 : (activeDaysCount != null && activeDaysCount >= 30))) ? (
                    <span className="previewTag tagSand">
                      <GitBranch size={12} aria-hidden="true" /> Steady Cadence
                    </span>
                  ) : hasActiveRepos ? (
                    <span className="previewTag tagSand">
                      <GitBranch size={12} aria-hidden="true" /> Active Maintenance
                    </span>
                  ) : null}

                  {data.estimated ? (
                    <span className="previewTag tagTerracotta">
                      <Sparkles size={12} aria-hidden="true" /> Public Estimate
                    </span>
                  ) : (intelligence ? (intelligence.adoption.totalStargazersCount.value != null && intelligence.adoption.totalStargazersCount.value >= 100) : (score?.breakdown?.impact != null ? score.breakdown.impact >= 60 : totalStars >= 100)) ? (
                    <span className="previewTag tagTerracotta">
                      <Sparkles size={12} aria-hidden="true" /> High Reach
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })()}

          {/* Metric Cards Row: Commits & PRs, Active Streak, PR Velocity, Tracked Repos */}
          <div className="previewMetricsGrid">
            <div className="previewMetricItem" data-testid="metric-commits-prs">
              <span className="metricLabel">Commits & PRs</span>
              <span className="metricVal">{data.contributions.total != null ? data.contributions.total.toLocaleString() : '—'}</span>
              <span className={`metricTrend ${commitTrend.positive ? 'positive' : ''}`}>
                {commitTrend.text}
              </span>
            </div>

            <div className="previewMetricItem" data-testid="metric-active-streak">
              <span className="metricLabel">Active Streak</span>
              <span className="metricVal">
                {eventsUnavailable || data.contributions.activeDays == null
                  ? '—'
                  : `${data.contributions.currentStreak} ${data.contributions.currentStreak === 1 ? 'Day' : 'Days'}`}
              </span>
              <span className="metricTrend">
                {eventsUnavailable || data.contributions.activeDays == null
                  ? 'Unobserved'
                  : `Longest: ${data.contributions.longestStreak}d`}
              </span>
            </div>

            <div className="previewMetricItem" data-testid="metric-pr-velocity">
              <span className="metricLabel">PR Velocity</span>
              <span className="metricVal">{prVelocityData.velocity} {prVelocityData.velocity !== '—' ? '/ wk' : ''}</span>
              <span className={`metricTrend ${prVelocityData.positive ? 'positive' : ''}`}>
                {prVelocityData.subtext}
              </span>
            </div>

            <div className="previewMetricItem" data-testid="metric-tracked-repos">
              <span className="metricLabel">Tracked Repos</span>
              <span className="metricVal">{repos.length}</span>
              <span className="metricTrend">{compactNumber(totalStars)} Stars</span>
            </div>
          </div>

          {/* Contribution Timing & Density Section */}
          <div className="previewHeatmapSection">
            <div className="previewSectionLabel">
              <span>Contribution Timing & Density</span>
              <span className="heatmapLegendNote" data-testid="overview-timing-note">
                {timingInfo}
              </span>
            </div>
            <div
              className="previewHeatmapGrid"
              role="img"
              aria-label="Recent contribution timing and density grid"
            >
              {recentDensityDays.map((day, idx) => (
                <div
                  key={day ? day.date : `pad-${idx}`}
                  className={`heatmapCell ${getDensityLevelClass(day, eventsUnavailable)}`}
                  title={
                    eventsUnavailable || (day && day.isObserved === false)
                      ? `${day ? day.date : 'Unobserved'}: Activity unobserved`
                      : day
                        ? `${day.date}: ${day.contributionCount} contribution${day.contributionCount === 1 ? '' : 's'}`
                        : 'No recorded activity'
                  }
                />
              ))}
            </div>
          </div>

          {/* Language Distribution */}
          {data.languages && data.languages.length > 0 ? (
            <div className="previewSummaryRow">
              <div className="previewLangBar" role="progressbar" aria-label="Language distribution bar">
                {data.languages.slice(0, 6).map((lang) => (
                  <div
                    key={lang.name}
                    className="langSegment"
                    style={{
                      width: `${lang.pct}%`,
                      backgroundColor: lang.color || 'var(--terracotta)',
                    }}
                    title={`${lang.name} ${lang.pct}%`}
                  />
                ))}
              </div>
              <div className="previewLangLegend">
                {data.languages.slice(0, 4).map((lang) => (
                  <span className="langLegendItem" key={lang.name}>
                    <span
                      className="langDot"
                      style={{ backgroundColor: lang.color || 'var(--terracotta)' }}
                      aria-hidden="true"
                    />
                    {lang.name} ({lang.pct}%)
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="previewSummaryRow">
              <span className="mutedSmall">No language data available for analyzed repositories.</span>
            </div>
          )}
        </div>

        {/* Card Footer */}
        <div className="previewCardFooter">
          <span className="previewCaption">
            Live developer intelligence for @{user.login} ·{' '}
            {data.authenticated ? 'Authenticated GitHub data' : 'Public API mode'}
          </span>
          <div className="previewFooterActions">
            <a
              href="#activity"
              className="previewExploreBtn"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Activity & Timing →
            </a>
            <a
              href="#repositories"
              className="previewExploreBtn"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('repositories')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Repositories ({repos.length}) →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
