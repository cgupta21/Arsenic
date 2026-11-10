// shared/intelligence.js
// Final Measurement Contract & Comparison Registry for M-03

export class MetricValidationError extends Error {
  constructor(field, reason, invalidPayload) {
    super(`MetricValidationError on '${field}': ${reason}`)
    this.name = 'MetricValidationError'
    this.field = field
    this.reason = reason
    this.invalidPayload = invalidPayload
  }
}

export class TelemetryIntegrityError extends Error {
  constructor(message, payload) {
    super(`TelemetryIntegrityError: ${message}`)
    this.name = 'TelemetryIntegrityError'
    this.payload = payload
  }
}

/**
 * Validates a single MetricValue object at runtime.
 * Throws MetricValidationError on any state/value inconsistency.
 */
export function validateMetricValue(field, metric) {
  if (!metric || typeof metric !== 'object') {
    throw new MetricValidationError(field, 'Metric must be an object', metric)
  }

  switch (metric.state) {
    case 'observed':
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || !Number.isSafeInteger(metric.value) || metric.value <= 0) {
        throw new MetricValidationError(field, "State 'observed' requires a finite, strictly positive safe integer (> 0)", metric)
      }
      break

    case 'zero':
      if (metric.value !== 0) {
        throw new MetricValidationError(field, "State 'zero' requires value === 0", metric)
      }
      break

    case 'ambiguous_zero':
      if (metric.value !== 0) {
        throw new MetricValidationError(field, "State 'ambiguous_zero' requires value === 0", metric)
      }
      if (!metric.note || typeof metric.note !== 'string') {
        throw new MetricValidationError(field, "State 'ambiguous_zero' requires an explanatory note", metric)
      }
      break

    case 'partial':
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || !Number.isSafeInteger(metric.value) || metric.value < 0) {
        throw new MetricValidationError(field, "State 'partial' requires a finite, non-negative safe integer", metric)
      }
      if (metric.isLowerBound !== true) {
        throw new MetricValidationError(field, "State 'partial' requires isLowerBound: true", metric)
      }
      if (!metric.note || typeof metric.note !== 'string') {
        throw new MetricValidationError(field, "State 'partial' requires an explanatory note", metric)
      }
      break

    case 'unknown':
    case 'unavailable':
      if (metric.value !== null) {
        throw new MetricValidationError(field, `State '${metric.state}' requires value === null`, metric)
      }
      if (!metric.note || typeof metric.note !== 'string') {
        throw new MetricValidationError(field, `State '${metric.state}' requires an explanatory note`, metric)
      }
      break

    default:
      throw new MetricValidationError(field, `Unrecognized observation state: ${metric.state}`, metric)
  }
}

/**
 * Strict runtime predicate for numerical winner comparisons.
 * Accepts ONLY:
 * 1. state === 'observed' with finite, positive safe integer (value > 0)
 * 2. state === 'zero' with value === 0
 *
 * Rejects: ambiguous_zero, partial, unknown, unavailable, null, undefined, NaN, Infinity, negative, fractional.
 */
export function isComparableNumericValue(metric) {
  if (!metric || typeof metric !== 'object') {
    return false
  }

  if (metric.state !== 'observed' && metric.state !== 'zero') {
    return false
  }

  const v = metric.value
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isSafeInteger(v)) {
    return false
  }

  if (metric.state === 'observed') {
    return v > 0
  }

  if (metric.state === 'zero') {
    return v === 0
  }

  return false
}

/**
 * Asserts structural and logical integrity between REST activity and community engagement telemetry.
 */
export function assertTelemetryIntegrity(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new TelemetryIntegrityError('Profile must be an object', profile)
  }
  const intelligence = profile.intelligence || profile
  if (!intelligence || typeof intelligence !== 'object') {
    throw new TelemetryIntegrityError('Developer intelligence payload missing', profile)
  }

  if (intelligence.activity?.source === 'rest_event_stream') {
    if (intelligence.activity.collectionState !== intelligence.engagement?.collectionState) {
      throw new TelemetryIntegrityError(
        `Contradictory collection states: activity=${intelligence.activity.collectionState}, engagement=${intelligence.engagement?.collectionState}`,
        intelligence
      )
    }
    if (intelligence.activity.retrievedEventsCount !== intelligence.engagement?.retrievedEventsCount) {
      throw new TelemetryIntegrityError(
        `Contradictory retrieved event counts: activity=${intelligence.activity.retrievedEventsCount}, engagement=${intelligence.engagement?.retrievedEventsCount}`,
        intelligence
      )
    }
    if (
      intelligence.activity.observationWindowStart !== intelligence.engagement?.observationWindowStart ||
      intelligence.activity.observationWindowEnd !== intelligence.engagement?.observationWindowEnd
    ) {
      throw new TelemetryIntegrityError(
        'Contradictory observation window timestamps between REST activity and engagement',
        intelligence
      )
    }
  }
}

/**
 * Declarative Metric Comparison Registry
 */
export const METRIC_REGISTRY = new Map([
  // ─── 1. Account Reach (Snapshots: Source-Agnostic, Window-Agnostic) ───
  [
    'account_followers',
    {
      key: 'account_followers',
      scope: 'snapshot',
      requiresWindowParity: false,
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).reach?.followersCount ?? null
    }
  ],

  // ─── 2. Repository Adoption (Snapshots: Require Complete Repo Coverage) ───
  [
    'repo_total_stars',
    {
      key: 'repo_total_stars',
      scope: 'snapshot',
      requiresWindowParity: false,
      requiresCompleteRepoCoverage: true,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).adoption?.totalStargazersCount ?? null
    }
  ],
  [
    'repo_non_archived_stars',
    {
      key: 'repo_non_archived_stars',
      scope: 'snapshot',
      requiresWindowParity: false,
      requiresCompleteRepoCoverage: true,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).adoption?.nonArchivedRepoStarsCount ?? null
    }
  ],
  [
    'repo_archived_stars',
    {
      key: 'repo_archived_stars',
      scope: 'snapshot',
      requiresWindowParity: false,
      requiresCompleteRepoCoverage: true,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).adoption?.archivedRepoStarsCount ?? null
    }
  ],
  [
    'repo_forks',
    {
      key: 'repo_forks',
      scope: 'snapshot',
      requiresWindowParity: false,
      requiresCompleteRepoCoverage: true,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).adoption?.forksCount ?? null
    }
  ],

  // ─── 3. Repository Maintenance (Factual Display Only: Winner Strictly Prohibited) ───
  [
    'repo_maintenance_active_rate',
    {
      key: 'repo_maintenance_active_rate',
      scope: 'window',
      requiresWindowParity: true,
      requiresCompleteRepoCoverage: true,
      winnerPermitted: false,
      extractMetric: () => null
    }
  ],

  // ─── 4. GraphQL Activity (365d Window, GraphQL Required) ─────────────────
  [
    'graphql_recorded_contribution_days',
    {
      key: 'graphql_recorded_contribution_days',
      scope: 'window',
      requiredSource: 'graphql_calendar',
      requiresWindowParity: true,
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => {
        const intel = p.intelligence || p
        return intel.activity?.source === 'graphql_calendar' ? intel.activity.recordedContributionDaysCount : null
      }
    }
  ],
  [
    'graphql_contribution_longest_streak',
    {
      key: 'graphql_contribution_longest_streak',
      scope: 'window',
      requiredSource: 'graphql_calendar',
      requiresWindowParity: true,
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => {
        const intel = p.intelligence || p
        return intel.activity?.source === 'graphql_calendar' ? intel.activity.contributionLongestStreakDays : null
      }
    }
  ],
  [
    'graphql_total_recorded_contributions',
    {
      key: 'graphql_total_recorded_contributions',
      scope: 'window',
      requiredSource: 'graphql_calendar',
      requiresWindowParity: true,
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => {
        const intel = p.intelligence || p
        return intel.activity?.source === 'graphql_calendar' ? intel.activity.totalRecordedContributions : null
      }
    }
  ],

  // ─── 5. REST Activity (90d Window, REST Required, Complete State Required) ───
  [
    'rest_observed_public_event_days',
    {
      key: 'rest_observed_public_event_days',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => {
        const intel = p.intelligence || p
        return intel.activity?.source === 'rest_event_stream' ? intel.activity.observedPublicEventDaysCount : null
      }
    }
  ],
  [
    'rest_observed_public_event_streak',
    {
      key: 'rest_observed_public_event_streak',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => {
        const intel = p.intelligence || p
        return intel.activity?.source === 'rest_event_stream' ? intel.activity.observedPublicEventDateStreakDays : null
      }
    }
  ],

  // ─── 6. REST Engagement (90d Window, REST Required, Complete State Required) ───
  [
    'rest_pr_event_actions',
    {
      key: 'rest_pr_event_actions',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).engagement?.pullRequestEventActionsCount ?? null
    }
  ],
  [
    'rest_review_event_actions',
    {
      key: 'rest_review_event_actions',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).engagement?.pullRequestReviewEventActionsCount ?? null
    }
  ],
  [
    'rest_issue_event_actions',
    {
      key: 'rest_issue_event_actions',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).engagement?.issueEventActionsCount ?? null
    }
  ],
  [
    'rest_comment_event_actions',
    {
      key: 'rest_comment_event_actions',
      scope: 'window',
      requiredSource: 'rest_event_stream',
      requiresWindowParity: true,
      requiredCollectionState: 'complete',
      requiresCompleteRepoCoverage: false,
      winnerPermitted: true,
      extractMetric: (p) => (p.intelligence || p).engagement?.issueCommentEventActionsCount ?? null
    }
  ]
])

/**
 * Metric comparison dispatch engine
 */
export function compareMetric(profileA, profileB, metricKey) {
  // 1. Verify telemetry payload integrity on both profiles
  assertTelemetryIntegrity(profileA)
  assertTelemetryIntegrity(profileB)

  const intelA = profileA.intelligence || profileA
  const intelB = profileB.intelligence || profileB

  // 2. Reject unregistered metric keys (no generic numeric fallback)
  const rule = METRIC_REGISTRY.get(metricKey)
  if (!rule) {
    return {
      metricKey,
      eligible: false,
      winner: null,
      reason: `Unknown or unregistered metric key: '${metricKey}'`
    }
  }

  // 3. Reject if winner declarations are prohibited for this metric
  if (!rule.winnerPermitted) {
    return {
      metricKey: rule.key,
      eligible: false,
      winner: null,
      reason: `Winner declaration is prohibited for '${rule.key}'. Factual display only.`
    }
  }

  // 4. Source constraint check
  if (rule.requiredSource) {
    if (intelA.activity?.source !== rule.requiredSource || intelB.activity?.source !== rule.requiredSource) {
      return {
        metricKey: rule.key,
        eligible: false,
        winner: null,
        reason: `Metric requires both profiles to use source '${rule.requiredSource}'`
      }
    }
  }

  // 5. Collection state constraint check
  if (rule.requiredCollectionState) {
    const stateA = intelA.activity?.source === 'rest_event_stream' ? intelA.activity.collectionState : null
    const stateB = intelB.activity?.source === 'rest_event_stream' ? intelB.activity.collectionState : null
    if (stateA !== rule.requiredCollectionState || stateB !== rule.requiredCollectionState) {
      return {
        metricKey: rule.key,
        eligible: false,
        winner: null,
        reason: `Comparison requires REST collectionState '${rule.requiredCollectionState}' on both profiles`
      }
    }
  }

  // 6. Window parity check (only if metric scope is 'window')
  if (rule.requiresWindowParity) {
    if (
      intelA.activity?.observationWindowStart !== intelB.activity?.observationWindowStart ||
      intelA.activity?.observationWindowEnd !== intelB.activity?.observationWindowEnd
    ) {
      return {
        metricKey: rule.key,
        eligible: false,
        winner: null,
        reason: 'Observation window start/end timestamps do not match'
      }
    }
  }

  // 7. Repository coverage check (only if metric requires complete repo coverage)
  if (rule.requiresCompleteRepoCoverage) {
    if (!intelA.adoption?.repositoryCoverage?.isComplete || !intelB.adoption?.repositoryCoverage?.isComplete) {
      return {
        metricKey: rule.key,
        eligible: false,
        winner: null,
        reason: 'Incomplete repository coverage on one or both profiles'
      }
    }
  }

  // 8. Extract metric values
  const valA = rule.extractMetric(profileA)
  const valB = rule.extractMetric(profileB)

  // 9. Validate metric availability with strict predicate
  if (!isComparableNumericValue(valA) || !isComparableNumericValue(valB)) {
    const stateDescA = valA && typeof valA === 'object' ? `${valA.state} (${valA.value})` : String(valA)
    const stateDescB = valB && typeof valB === 'object' ? `${valB.state} (${valB.value})` : String(valB)
    return {
      metricKey: rule.key,
      eligible: false,
      winner: null,
      reason: `Metric value ineligible for comparison: profileA=${stateDescA}, profileB=${stateDescB}`
    }
  }

  // 10. Evaluate numeric winner
  const a = valA.value
  const b = valB.value
  const winner = a > b ? 'profile_a' : b > a ? 'profile_b' : 'tie'

  return {
    metricKey: rule.key,
    eligible: true,
    winner,
    valueA: a,
    valueB: b
  }
}
