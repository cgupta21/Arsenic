import React from 'react'
import { Sparkles, AlertCircle, RefreshCw, FolderGit2, GitCommit, Code2, Clock, Info } from 'lucide-react'
import type { Dashboard } from '../types'
import { extractSummaryMetrics } from '../../../shared/summary.js'
import { compactNumber } from '../lib/analytics'

export interface DeveloperSummaryCardProps {
  data: Dashboard
  summary: string
  summaryLoading: boolean
  summaryError: string | null
  onGenerate: () => void
}

function formatHour(h: number): string {
  const period = h < 12 ? 'am' : 'pm'
  const display = h % 12 || 12
  return `${display}${period}`
}

export function DeveloperSummaryCard({
  data,
  summary,
  summaryLoading,
  summaryError,
  onGenerate,
}: DeveloperSummaryCardProps) {
  const metrics = extractSummaryMetrics(data)
  const paragraphs = summary ? summary.split('\n\n').filter(Boolean) : []

  // Build repository breakdown string
  const repoParts: string[] = []
  if (metrics.repositories.active > 0) repoParts.push(`${metrics.repositories.active} active`)
  if (metrics.repositories.watch > 0) repoParts.push(`${metrics.repositories.watch} watch`)
  if (metrics.repositories.stale > 0) repoParts.push(`${metrics.repositories.stale} stale`)
  if (metrics.repositories.archived > 0) repoParts.push(`${metrics.repositories.archived} archived`)
  const repoBreakdownStr = repoParts.length > 0 ? repoParts.join(' · ') : '0 repositories'

  return (
    <div className="card developerSummaryCard" data-testid="developer-summary-card">
      <div className="cardHead">
        <h3>
          <Sparkles size={16} /> Intelligent developer summary
        </h3>
        <span>Deterministic analysis</span>
      </div>

      <div className="summaryCardBody">
        {summaryLoading ? (
          <div className="summaryLoadingState" role="status" aria-live="polite">
            <div className="summaryLoadingPulse">
              <div className="skeletonLine skeletonTitle" />
              <div className="skeletonLine skeletonText" />
              <div className="skeletonLine skeletonText short" />
            </div>
            <p className="summaryLoadingText">
              <span className="pulseDot" /> Synthesizing developer telemetry from verified repository, contribution, and cadence signals…
            </p>
          </div>
        ) : summaryError ? (
          <div className="summaryErrorState" role="alert">
            <div className="summaryAlert">
              <AlertCircle size={18} className="summaryAlertIcon" />
              <div className="summaryAlertContent">
                <div className="summaryAlertTitle">Summary generation failed</div>
                <p className="summaryAlertMessage">{summaryError}</p>
              </div>
            </div>
            <button
              type="button"
              className="primaryBtn summaryRetryBtn"
              onClick={onGenerate}
              disabled={summaryLoading}
            >
              <RefreshCw size={14} className={summaryLoading ? 'spin' : ''} /> Try again
            </button>
          </div>
        ) : !summary ? (
          <div className="summaryEmptyState">
            <p className="summaryEmptyText">
              Generate a concise, evidence-based profile summary synthesized directly from Arsenic's verified GitHub telemetry. Analyzes repository health, contribution velocity, language concentration, and commit cadence without external AI or LLM API calls.
            </p>
            <button
              type="button"
              className="primaryBtn generateSummaryBtn"
              onClick={onGenerate}
              disabled={summaryLoading}
            >
              Generate summary <Sparkles size={15} />
            </button>
          </div>
        ) : (
          <div className="summaryContent">
            {/* Structured key metrics grid */}
            <div className="summaryMetricsGrid" data-testid="summary-metrics-grid">
              <div className="summaryMetricItem">
                <div className="metricHeader">
                  <GitCommit size={14} className="metricIcon" />
                  <span className="metricLabel">
                    {metrics.contributions.label ||
                      (metrics.contributions.coverageStatus === 'complete' && !metrics.contributions.isEstimated
                        ? 'Verified Contributions'
                        : 'Observed Contributions')}
                  </span>
                </div>
                <div className="metricValue">
                  {metrics.contributions.eventsUnavailable
                    ? 'Unavailable'
                    : compactNumber(metrics.contributions.total)}
                </div>
                <div className="metricSub">
                  {metrics.contributions.eventsUnavailable
                    ? 'Event feed unindexed'
                    : metrics.contributions.coverageStatus === 'partial'
                    ? (metrics.contributions.oldestEventDate
                        ? `${metrics.contributions.activeDays ?? 0} active days (since ${metrics.contributions.oldestEventDate})`
                        : (metrics.contributions.verifiedDays
                            ? `${metrics.contributions.activeDays ?? 0} active days (${metrics.contributions.verifiedDays}d observed)`
                            : `${metrics.contributions.activeDays ?? 0} active days (partial feed)`))
                    : `${metrics.contributions.activeDays ?? 0} active days (${metrics.contributions.windowDays}d window)`}
                </div>
              </div>

              <div className="summaryMetricItem">
                <div className="metricHeader">
                  <FolderGit2 size={14} className="metricIcon" />
                  <span className="metricLabel">Repositories</span>
                </div>
                <div className="metricValue">
                  {metrics.repositories.total} {metrics.repositories.total === 1 ? 'Repo' : 'Repos'}
                </div>
                <div className="metricSub">{repoBreakdownStr}</div>
              </div>

              <div className="summaryMetricItem">
                <div className="metricHeader">
                  <Code2 size={14} className="metricIcon" />
                  <span className="metricLabel">Primary Technology</span>
                </div>
                <div className="metricValue">
                  {metrics.language ? `${metrics.language.name} (${metrics.language.pct}%)` : 'Multi-language'}
                </div>
                <div className="metricSub">Code volume concentration</div>
              </div>

              <div className="summaryMetricItem">
                <div className="metricHeader">
                  <Clock size={14} className="metricIcon" />
                  <span className="metricLabel">Peak Cadence</span>
                </div>
                <div className="metricValue">
                  {metrics.timing
                    ? `${metrics.timing.weekday}s at ${formatHour(metrics.timing.hour)}`
                    : (metrics.contributions.eventsUnavailable ? 'Unavailable' : 'Scattered cadence')}
                </div>
                <div className="metricSub">
                  {metrics.timing
                    ? `Based on ${metrics.timing.sampled} commits`
                    : 'Insufficient commit sample'}
                </div>
              </div>
            </div>

            {/* Partial-data / Notice badge if applicable */}
            {metrics.contributions.eventsUnavailable ? (
              <div className="summaryNoticeTag eventsUnavailable">
                <Info size={14} />
                <span>Public event history was unavailable from GitHub; activity and contribution metrics could not be verified.</span>
              </div>
            ) : metrics.contributions.coverageStatus === 'partial' ? (
              <div className="summaryNoticeTag isTruncated">
                <Info size={14} />
                <span>
                  {metrics.contributions.oldestEventDate
                    ? `GitHub Events API coverage begins on ${metrics.contributions.oldestEventDate}. Activity prior to this date in the ${metrics.contributions.windowDays}-day observation window is unobserved.`
                    : `Historical event feed coverage is partial or boundary metadata is unavailable. Earlier activity in the requested ${metrics.contributions.windowDays}-day window could not be verified.`}
                </span>
              </div>
            ) : metrics.contributions.isEstimated ? (
              <div className="summaryNoticeTag isEstimated">
                <Info size={14} />
                <span>Contribution metrics are estimated from public GitHub event streams.</span>
              </div>
            ) : null}

            {/* Narrative insights */}
            <div className="summaryNarrative">
              {paragraphs.map((p, idx) => (
                <p key={idx} className="summaryParagraph">{p}</p>
              ))}
            </div>

            {/* Footer with Refresh button */}
            <div className="summaryFooter">
              <button
                type="button"
                className="secondaryBtn refreshSummaryBtn"
                onClick={onGenerate}
                disabled={summaryLoading}
                aria-label="Refresh summary"
              >
                <RefreshCw size={13} className={summaryLoading ? 'spin' : ''} /> Refresh summary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
