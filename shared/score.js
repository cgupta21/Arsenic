export function clampScore(value) {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Math.min(100, Math.max(0, Math.round(Number(value))))
}

export function calculateScore({
  activeDays = 0,
  prs = 0,
  issues = 0,
  reviews = 0,
  stars = 0,
  forks = 0,
  followers = 0,
  observationWindowDays = 365,
  dataQuality = null
} = {}) {
  const eventsUnavailable = Boolean(dataQuality?.eventsUnavailable)
  const isTruncated = Boolean(dataQuality?.isTruncated)
  const cleanStars = Math.max(0, Number(stars) || 0)
  const cleanForks = Math.max(0, Number(forks) || 0)
  const cleanFollowers = Math.max(0, Number(followers) || 0)
  const cleanWindow = Math.max(1, Number(observationWindowDays) || 365)

  const impact = Math.min(100, Math.max(0, Math.round(
    (Math.log1p(cleanStars) / Math.log1p(1000)) * 55 +
    (Math.log1p(cleanForks) / Math.log1p(100)) * 20 +
    (Math.log1p(cleanFollowers) / Math.log1p(1000)) * 25
  )))

  // When GitHub public events retrieval fails (network timeout, rate-limit, 5xx),
  // event-based metrics (active days, PR/issue events) are unobserved.
  // Calculating a normal consistency or collaboration score from missing data would
  // falsely penalize an active developer with confirmed-zero metrics.
  if (eventsUnavailable) {
    return {
      score: null,
      scoringModel: 'unavailable',
      breakdown: { consistency: null, collaboration: null, impact },
      observationWindowDays: cleanWindow,
      effectiveWindowDays: 0,
      targetActiveDays: 0
    }
  }

  let effectiveWindow = cleanWindow
  if (isTruncated && typeof dataQuality?.observedDaysCount === 'number') {
    // When the events feed is truncated, scale consistency against the observed window (minimum 14 days)
    effectiveWindow = Math.min(cleanWindow, Math.max(14, dataQuality.observedDaysCount))
  }

  const cleanActiveDays = Math.max(0, Number(activeDays) || 0)
  // Target active days benchmark: 120 active days per 365-day year (~32.8% active cadence)
  const targetActiveDays = Math.max(1, (120 / 365) * effectiveWindow)
  const consistency = Math.min(100, Math.max(0, Math.round((cleanActiveDays / targetActiveDays) * 100)))

  // Collaboration scoring rationale:
  // In verified 365-day GraphQL mode, collaboration metrics are authoritative yearly creation totals.
  // In untruncated 90-day REST mode, all public events across the full 90 days are observed, allowing proportional scaling.
  // However, in truncated REST mode (event cap reached, spanning a short slice like 5-20 days),
  // public stream events (commits, PR updates, issue labels) are low-frequency, sparse, and non-comparable
  // to yearly creation counts. Linearly scaling yearly thresholds down to a 10-14 day window sets the target to <= 1.5 events,
  // causing severe volatility where 1 random timeline event yields 65-100% collaboration.
  // Therefore, truncated REST feeds represent collaboration as unavailable (null).
  let collaboration = null
  let score = null
  let scoringModel = 'three_pillar'

  if (!isTruncated) {
    const cleanPrs = Math.max(0, Number(prs) || 0)
    const cleanIssues = Math.max(0, Number(issues) || 0)
    const cleanReviews = Math.max(0, Number(reviews) || 0)
    // Target collaboration benchmark: 40 collaborative contributions per 365-day year
    const targetCollaboration = Math.max(1, (40 / 365) * effectiveWindow)
    const totalCollab = cleanPrs + cleanIssues + cleanReviews
    collaboration = Math.min(100, Math.max(0, Math.round((totalCollab / targetCollaboration) * 100)))
    score = clampScore(consistency * 0.45 + collaboration * 0.3 + impact * 0.25)
    scoringModel = 'three_pillar'
  } else {
    // When collaboration is unavailable due to truncation, reweight score across the observed dimensions:
    // Consistency (weight 45) and Impact (weight 25) -> normalized weights: (45/70) and (25/70)
    score = clampScore(consistency * (45 / 70) + impact * (25 / 70))
    scoringModel = 'two_pillar_renormalized'
  }

  return {
    score,
    scoringModel,
    breakdown: { consistency, collaboration, impact },
    observationWindowDays: cleanWindow,
    effectiveWindowDays: effectiveWindow,
    targetActiveDays: Number(targetActiveDays.toFixed(1))
  }
}
