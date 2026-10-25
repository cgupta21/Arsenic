import { useMemo } from 'react'
import { CheckCircle2, FolderGit2, GitBranch, Sparkles } from 'lucide-react'
import type { Dashboard } from '../types'
import { compactNumber, topTiming } from '../lib/analytics'
import { getHealthGrade } from '../../../shared/score.js'

export interface DeveloperIntelligenceOverviewProps {
  data: Dashboard
  loading?: boolean
}


function getDensityLevelClass(count: number): string {
  if (count <= 0) return 'lvl-0'
  if (count < 2) return 'lvl-1'
  if (count < 5) return 'lvl-2'
  if (count < 10) return 'lvl-3'
  return 'lvl-4'
}

export function DeveloperIntelligenceOverview({ data, loading = false }: DeveloperIntelligenceOverviewProps) {
  const user = data.user
  const score = data.score
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
    return score.raw?.stars ?? repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0)
  }, [score.raw?.stars, repos])

  // Trend calculation comparing the last 28 days vs prior 28 days (4-week periods)
  const commitTrend = useMemo(() => {
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
    const prs = score.raw?.prs ?? 0
    if (prs > 0) {
      return { text: `${prs} PRs on record`, positive: false }
    }
    return { text: '0 recent contributions', positive: false }
  }, [days, score.raw?.prs])

  // PR velocity calculated over weeks in contribution window
  const prVelocityData = useMemo(() => {
    const prCount = score.raw?.prs ?? 0
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
  }, [score.raw?.prs, data.estimated, days.length])

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
    const peak = topTiming(data)
    const sampled = data.timing?.commitsSampled ?? 0
    if (sampled > 0 && peak.hour !== undefined) {
      return `Peak: ${peak.hour.toString().padStart(2, '0')}:00 UTC · ${peak.weekday}`
    }
    return data.estimated ? 'Recent activity (~90 days)' : 'Last 16 weeks'
  }, [data])

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
          {/* Top Score Strip with Health Score and Component Indicators */}
          <div className="previewScoreStrip">
            <div className="previewScoreMain">
              <div className="previewScoreValue" data-testid="overview-health-score">
                {score.score}
              </div>
              <div className="previewScoreMeta">
                <div className="scoreGrade">{getHealthGrade(score.score)}</div>
                <div className="scoreSubtext" data-testid="overview-score-breakdown">
                  Consistency {score.breakdown.consistency}% • Collaboration{' '}
                  {score.breakdown.collaboration}% • Impact {score.breakdown.impact}%
                </div>
              </div>
            </div>
            <div className="previewScoreTags">
              {score.breakdown.collaboration >= 60 || Number(prVelocityData.velocity) >= 2 ? (
                <span className="previewTag tagSage">
                  <CheckCircle2 size={12} aria-hidden="true" /> High Velocity
                </span>
              ) : score.breakdown.collaboration >= 35 ? (
                <span className="previewTag tagSage">
                  <CheckCircle2 size={12} aria-hidden="true" /> Active Collab
                </span>
              ) : (
                <span className="previewTag tagSand">
                  <CheckCircle2 size={12} aria-hidden="true" /> Solo Cadence
                </span>
              )}

              {data.contributions.currentStreak >= 7 || score.breakdown.consistency >= 75 ? (
                <span className="previewTag tagSand">
                  <GitBranch size={12} aria-hidden="true" /> Steady Cadence
                </span>
              ) : hasActiveRepos ? (
                <span className="previewTag tagSand">
                  <GitBranch size={12} aria-hidden="true" /> Active Maintenance
                </span>
              ) : (
                <span className="previewTag tagSand">
                  <GitBranch size={12} aria-hidden="true" /> Clean Branching
                </span>
              )}

              {data.estimated ? (
                <span className="previewTag tagTerracotta">
                  <Sparkles size={12} aria-hidden="true" /> Public Estimate
                </span>
              ) : score.breakdown.impact >= 60 ? (
                <span className="previewTag tagTerracotta">
                  <Sparkles size={12} aria-hidden="true" /> High Reach
                </span>
              ) : null}
            </div>
          </div>

          {/* Metric Cards Row: Commits & PRs, Active Streak, PR Velocity, Tracked Repos */}
          <div className="previewMetricsGrid">
            <div className="previewMetricItem" data-testid="metric-commits-prs">
              <span className="metricLabel">Commits & PRs</span>
              <span className="metricVal">{data.contributions.total.toLocaleString()}</span>
              <span className={`metricTrend ${commitTrend.positive ? 'positive' : ''}`}>
                {commitTrend.text}
              </span>
            </div>

            <div className="previewMetricItem" data-testid="metric-active-streak">
              <span className="metricLabel">Active Streak</span>
              <span className="metricVal">
                {data.contributions.currentStreak}{' '}
                {data.contributions.currentStreak === 1 ? 'Day' : 'Days'}
              </span>
              <span className="metricTrend">Longest: {data.contributions.longestStreak}d</span>
            </div>

            <div className="previewMetricItem" data-testid="metric-pr-velocity">
              <span className="metricLabel">PR Velocity</span>
              <span className="metricVal">{prVelocityData.velocity} / wk</span>
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
                  className={`heatmapCell ${day ? getDensityLevelClass(day.contributionCount) : 'lvl-0'}`}
                  title={
                    day
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
