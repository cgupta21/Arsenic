/**
 * Deterministic developer summary generator.
 * Architecture: signal-ranking → deduplication → insight generation.
 * Each factual signal is used AT MOST ONCE in the output.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return Number(n).toLocaleString()
}

function pick(seed, arr) {
  return arr[Math.abs(Math.round(seed)) % arr.length]
}

// ---------------------------------------------------------------------------
// Source coverage determination
// ---------------------------------------------------------------------------

export function determineCoverage({
  dataQuality,
  intelligence,
  isEstimated,
  authenticated,
  windowDays = 365,
  eventsUnavailable = false
}) {
  if (eventsUnavailable) {
    return {
      coverageStatus: 'unavailable',
      verifiedDays: 0,
      isComplete: false,
      isPartial: false,
      isUnavailable: true,
      boundaryDate: null,
      description: 'unavailable'
    }
  }

  const isGraphql = intelligence?.activity?.source === 'graphql_calendar' || (!isEstimated && authenticated)

  if (isGraphql) {
    return {
      coverageStatus: 'complete',
      verifiedDays: windowDays,
      isComplete: true,
      isPartial: false,
      isUnavailable: false,
      boundaryDate: null,
      description: `${windowDays}-day observation window`
    }
  }

  // REST event stream / public estimate
  const oldestEventDate = dataQuality?.oldestEventDate || null
  const isTruncated = Boolean(dataQuality?.isTruncated)
  const observedDaysCount = typeof dataQuality?.observedDaysCount === 'number' ? dataQuality.observedDaysCount : null

  let verifiedDays = null
  if (oldestEventDate) {
    const ms = Date.now() - new Date(oldestEventDate).getTime()
    const daysSince = Math.max(1, Math.round(ms / 86400000))
    verifiedDays = observedDaysCount ? Math.min(observedDaysCount, daysSince) : daysSince
  } else if (observedDaysCount) {
    verifiedDays = observedDaysCount
  }

  if (!oldestEventDate && !observedDaysCount) {
    return {
      coverageStatus: 'partial',
      verifiedDays: null,
      isComplete: false,
      isPartial: true,
      isUnavailable: false,
      isTruncated,
      boundaryDate: null,
      description: 'recent public events'
    }
  }

  const coversFullWindow = !isTruncated && verifiedDays !== null && verifiedDays >= windowDays && windowDays <= 90

  if (coversFullWindow) {
    return {
      coverageStatus: 'complete',
      verifiedDays: windowDays,
      isComplete: true,
      isPartial: false,
      isUnavailable: false,
      boundaryDate: null,
      description: `${windowDays}-day observation window`
    }
  }

  return {
    coverageStatus: 'partial',
    verifiedDays,
    isComplete: false,
    isPartial: true,
    isUnavailable: false,
    isTruncated,
    boundaryDate: oldestEventDate,
    description: oldestEventDate
      ? `since ${oldestEventDate}`
      : (verifiedDays ? `the observed ${verifiedDays}-day event stream` : 'the observed event stream')
  }
}

// ---------------------------------------------------------------------------
// Signal scoring (all values normalised to 0–100)
// ---------------------------------------------------------------------------

function scoreSignals({ user = {}, repos = [], languages = [], contributions = {}, timing = {}, observationWindowDays, dataQuality, intelligence, authenticated, estimated }) {
  const windowDays = Math.max(1, Number(observationWindowDays) || Number(intelligence?.activity?.observationWindowDays) || 365)
  const eventsUnavailable = Boolean(dataQuality?.eventsUnavailable)
  const isTruncated = Boolean(dataQuality?.isTruncated)
  const isEstimated = Boolean(dataQuality?.isEstimated || estimated)

  const coverage = determineCoverage({
    dataQuality,
    intelligence,
    isEstimated,
    authenticated: Boolean(authenticated),
    windowDays,
    eventsUnavailable
  })

  const effectiveWindow = coverage.isComplete
    ? windowDays
    : Math.min(windowDays, Math.max(14, coverage.verifiedDays || 90))

  const eng = intelligence?.engagement
  const collaborationUnavailable = eventsUnavailable || isTruncated || (eng && eng.collectionState !== 'complete')

  const safeRepos = Array.isArray(repos) ? repos : []
  const safeLangs = Array.isArray(languages) ? languages : []
  const totalStars = intelligence?.adoption?.totalStargazersCount?.value ?? safeRepos.reduce((s, r) => s + (r.stargazers_count || 0), 0)
  const totalForks = intelligence?.adoption?.forksCount?.value ?? safeRepos.reduce((f, r) => f + (r.forks_count || 0), 0)
  const followers = intelligence?.reach?.followersCount?.value ?? user.followers ?? 0

  const actDays = intelligence?.activity?.source === 'graphql_calendar'
    ? intelligence.activity.recordedContributionDaysCount?.value
    : intelligence?.activity?.observedPublicEventDaysCount?.value
  const actLongest = intelligence?.activity?.source === 'graphql_calendar'
    ? intelligence.activity.contributionLongestStreakDays?.value
    : intelligence?.activity?.observedPublicEventDateStreakDays?.value
  const actCurrent = intelligence?.activity?.source === 'graphql_calendar'
    ? intelligence.activity.contributionCurrentStreakDays?.value
    : 0

  const totalContrib = eventsUnavailable
    ? null
    : (contributions?.total ?? (Array.isArray(contributions?.days) ? contributions.days.reduce((s, d) => s + (d.contributionCount || 0), 0) : null) ?? (intelligence?.activity?.source === 'graphql_calendar' ? intelligence.activity.totalRecordedContributions?.value : null) ?? null)
  const activeDays = eventsUnavailable ? null : (contributions.activeDays ?? actDays ?? 0)
  const longestStreak = eventsUnavailable ? 0 : (contributions.longestStreak ?? actLongest ?? 0)
  const currentStreak = eventsUnavailable ? 0 : (contributions.currentStreak ?? actCurrent ?? 0)

  const prs = eventsUnavailable ? null : (eng?.pullRequestEventActionsCount?.value ?? null)
  const issues = eventsUnavailable ? null : (eng?.issueEventActionsCount?.value ?? null)
  const reviews = eventsUnavailable ? null : (eng?.pullRequestReviewEventActionsCount?.value ?? null)
  const totalCollab = (eventsUnavailable || collaborationUnavailable || (prs == null && issues == null && reviews == null))
    ? null
    : ((prs || 0) + (issues || 0) + (reviews || 0))

  const totalRepos = safeRepos.length || 0
  const activeRepos = safeRepos.filter(r => r.status === 'active').length
  const watchRepos = safeRepos.filter(r => r.status === 'watch').length
  const staleRepos = safeRepos.filter(r => r.status === 'stale').length
  const archivedRepos = safeRepos.filter(r => r.status === 'archived').length
  const topLangs = safeLangs.slice(0, 3).map(l => l.name)
  const langConc = topLangs.length && safeLangs.length
    ? (safeLangs[0].size / safeLangs.reduce((s, l) => s + l.size, 0)) * 100
    : 0

  const targetContrib = Math.max(1, (150 / 365) * effectiveWindow)
  const targetActive = Math.max(1, (120 / 365) * effectiveWindow)
  const targetLongest = Math.max(1, (60 / 365) * effectiveWindow)
  const targetCurrent = Math.max(1, (30 / 365) * effectiveWindow)
  const targetCollab = Math.max(1, (40 / 365) * effectiveWindow)

  // Normalised signal strengths
  const signals = {
    impact: Math.min(100,
      (Math.log1p(totalStars) / Math.log1p(10000)) * 50 +
      (Math.log1p(totalForks) / Math.log1p(100000)) * 30 +
      (Math.log1p(followers) / Math.log1p(10000)) * 20
    ),
    // Normalise against targetContrib so a moderate contributor ranks meaningfully
    contributions: eventsUnavailable || totalContrib == null ? 0 : Math.min(100, (totalContrib / targetContrib) * 100),
    consistency: eventsUnavailable || activeDays == null ? 0 : Math.min(100,
      (activeDays / targetActive) * 50 +
      (longestStreak / targetLongest) * 30 +
      (currentStreak / targetCurrent) * 20
    ),
    collaboration: collaborationUnavailable || totalCollab == null ? 0 : Math.min(100, (totalCollab / targetCollab) * 100),
    repositories: Math.min(100,
      totalRepos > 0
        ? ((activeRepos / totalRepos) * 60) + Math.min(40, (totalRepos / 20) * 40)
        : 0
    ),
    // Language signal has NO floor — only scores when data is substantive
    languages: topLangs.length > 0 ? Math.min(60, langConc * 0.6) : 0,
    // Timing only scores when enough samples exist (≥20)
    timing: (timing.commitsSampled || 0) >= 20
      ? Math.min(40, ((timing.commitsSampled || 0) / 80) * 40)
      : 0,
  }

  return {
    signals,
    raw: {
      totalStars, totalForks, followers, totalContrib, activeDays,
      longestStreak, currentStreak, prs, issues, reviews, totalCollab,
      totalRepos, activeRepos, watchRepos, staleRepos, archivedRepos, topLangs, langConc,
      eventsUnavailable, collaborationUnavailable, isTruncated,
      windowDays, effectiveWindow, observedDaysCount: dataQuality?.observedDaysCount ?? null,
      oldestEventDate: coverage.boundaryDate,
      isEstimated,
      coverage
    }
  }
}

// ---------------------------------------------------------------------------
// Per-signal insight generators
// Each function returns a sentence string or null (if data is insufficient).
// They receive raw metrics so they can read whatever they need, but the
// CALLER is responsible for ensuring no two generators share a signal.
// ---------------------------------------------------------------------------

function insightImpact(raw, subject) {
  const { totalStars, totalForks, followers } = raw
  if (totalStars === 0 && totalForks === 0 && followers < 50) return null
  const parts = []
  if (totalStars > 0) parts.push(`${fmt(totalStars)} ${totalStars === 1 ? 'star' : 'stars'}`)
  if (totalForks > 0) parts.push(`${fmt(totalForks)} ${totalForks === 1 ? 'fork' : 'forks'}`)
  if (followers > 100) parts.push(`${fmt(followers)} followers`)

  const seed = totalStars + totalForks
  return pick(seed, [
    `Public repository impact includes ${parts.join(' and ')} across the analyzed codebase.`,
    `${subject} has accumulated ${parts.join(' and ')} across public repositories, demonstrating observable repository impact.`,
    `Repository impact and audience reach show ${parts.join(' and ')} across verified public projects.`,
  ])
}

function insightContributions(raw, subject) {
  if (raw.eventsUnavailable) return null
  const { totalContrib, activeDays, windowDays, coverage, isEstimated } = raw
  if (totalContrib == null || totalContrib === 0) return null

  const isVerified = coverage.isComplete && !isEstimated
  const term = isVerified ? 'verified contributions' : 'observed contributions'

  // Case 1: Genuinely complete source (GraphQL calendar)
  if (coverage.isComplete) {
    const mode = isEstimated ? ' (estimated from public events)' : ''
    return pick(totalContrib, [
      `${subject} has logged ${fmt(totalContrib)} ${term} over the ${windowDays}-day observation window${mode}, spanning ${activeDays ?? 0} active days.`,
      `Activity records document ${fmt(totalContrib)} ${term} across ${activeDays ?? 0} active days within the ${windowDays}-day observation period${mode}.`,
      `${subject}'s activity totals ${fmt(totalContrib)} ${term} across ${activeDays ?? 0} active days in the ${windowDays}-day observation window${mode}.`,
    ])
  }

  // Case 2: Partial coverage with boundaryDate (whether isTruncated or not, e.g. 20 or 99 events)
  if (coverage.boundaryDate) {
    return `${subject} logged ${fmt(totalContrib)} ${term} across ${activeDays ?? 0} active days since ${coverage.boundaryDate}; historical activity earlier in the ${windowDays}-day period is unobserved due to GitHub event feed limits.`
  }

  // Case 3: Partial coverage with verifiedDays
  if (coverage.verifiedDays) {
    return `${subject} logged ${fmt(totalContrib)} ${term} across ${activeDays ?? 0} active days across ${coverage.verifiedDays} observed days; earlier activity in the ${windowDays}-day observation window is unobserved.`
  }

  // Case 4: Partial coverage with missing coverage-boundary metadata
  return `${subject} logged ${fmt(totalContrib)} ${term} across ${activeDays ?? 0} active days in recent public events; complete historical coverage across the requested ${windowDays}-day window could not be verified.`
}

function insightConsistency(raw, subject) {
  if (raw.eventsUnavailable) return null
  const { activeDays, longestStreak, currentStreak, windowDays, coverage } = raw
  if (activeDays == null || (activeDays === 0 && longestStreak === 0)) return null
  const streakNote = currentStreak > 0
    ? `a current streak of ${currentStreak} day${currentStreak !== 1 ? 's' : ''}`
    : longestStreak > 0 ? `a peak streak of ${longestStreak} day${longestStreak !== 1 ? 's' : ''}` : null
  const parts = [`${activeDays} active day${activeDays !== 1 ? 's' : ''}`]
  if (streakNote) parts.push(streakNote)

  const periodDesc = coverage.isComplete
    ? `the ${windowDays}-day observation window`
    : (coverage.boundaryDate
      ? `the observed period since ${coverage.boundaryDate}`
      : (coverage.verifiedDays ? `the observed ${coverage.verifiedDays}-day event stream` : 'the observed event stream'))

  return pick(activeDays, [
    `Contribution cadence reflects ${parts.join(' with ')} over ${periodDesc}.`,
    `Activity records document ${parts.join(' and ')} across ${periodDesc}.`,
    `${subject}'s commit cadence spans ${parts.join(' and ')} within ${periodDesc}.`,
  ])
}

function insightCollaboration(raw, subject) {
  if (raw.eventsUnavailable || raw.collaborationUnavailable) return null
  const { prs, issues, reviews, totalCollab } = raw
  if (totalCollab == null || totalCollab === 0) return null
  const breakdown = []
  if (prs > 0) breakdown.push(`${prs} pull request${prs !== 1 ? 's' : ''}`)
  if (issues > 0) breakdown.push(`${issues} issue${issues !== 1 ? 's' : ''}`)
  if (reviews > 0) breakdown.push(`${reviews} code review${reviews !== 1 ? 's' : ''}`)

  return pick(totalCollab, [
    `Recorded collaboration activity consists of ${breakdown.join(', ')}.`,
    `Public collaboration includes ${breakdown.join(', ')} across accessible event streams.`,
    `${subject}'s collaborative contributions show ${breakdown.join(', ')}.`,
  ])
}

function insightNoCollaboration(raw, _subject) {
  if (raw.eventsUnavailable || raw.collaborationUnavailable) return null
  // Useful contrast insight when collaboration is zero but contributions exist
  const { totalCollab, totalContrib } = raw
  if (totalCollab == null || totalContrib == null) return null
  if (totalCollab > 0 || totalContrib === 0) return null
  return `No public pull-request, issue, or review activity is visible in the analyzed data.`
}

function insightRepositories(raw, _subject) {
  const { totalRepos, activeRepos, watchRepos, staleRepos, archivedRepos } = raw
  if (totalRepos === 0) return null

  // All-stale special case: say it plainly, no contradiction
  if (staleRepos === totalRepos && activeRepos === 0 && watchRepos === 0 && archivedRepos === 0) {
    return pick(totalRepos, [
      `All ${totalRepos} analyzed ${totalRepos === 1 ? 'repository is' : 'repositories are'} currently classified as stale (no activity in over 90 days).`,
      `The ${totalRepos} repositories in the analysis are all stale, indicating limited recent maintenance.`,
    ])
  }

  // All-active special case
  if (activeRepos === totalRepos && watchRepos === 0 && staleRepos === 0 && archivedRepos === 0) {
    return pick(totalRepos, [
      `All ${totalRepos} analyzed ${totalRepos === 1 ? 'repository is' : 'repositories are'} currently active (updated within the last 30 days).`,
      `The entire portfolio of ${totalRepos} repositories is actively maintained with recent activity.`,
    ])
  }

  // All-watch special case
  if (watchRepos === totalRepos && activeRepos === 0 && staleRepos === 0 && archivedRepos === 0) {
    return pick(totalRepos, [
      `All ${totalRepos} analyzed ${totalRepos === 1 ? 'repository is' : 'repositories are'} currently under watch (updated within 31–90 days).`,
    ])
  }

  // Mixed case: list breakdown without omitting categories so they strictly sum to totalRepos
  const parts = []
  if (activeRepos > 0) parts.push(`${activeRepos} active`)
  if (watchRepos > 0) parts.push(`${watchRepos} watch`)
  if (staleRepos > 0) parts.push(`${staleRepos} stale`)
  if (archivedRepos > 0) parts.push(`${archivedRepos} archived`)

  return pick(totalRepos, [
    `Across ${totalRepos} analyzed repositories, the maintenance distribution is ${parts.join(', ')}.`,
    `The analyzed portfolio consists of ${totalRepos} repositories: ${parts.join(', ')}.`,
    `Repository portfolio breakdown: ${parts.join(', ')} across ${totalRepos} total projects.`,
  ])
}

function insightLanguages(raw, _subject) {
  const { topLangs, langConc } = raw
  if (topLangs.length === 0) return null
  const primary = topLangs[0]
  const rest = topLangs.slice(1)
  const focused = langConc > 60

  if (focused) {
    return pick(Math.round(langConc), [
      `The codebase is primarily concentrated in ${primary} (${Math.round(langConc)}% volume)${rest.length ? `, with secondary contributions in ${rest.join(' and ')}` : ''}.`,
      `${primary} represents the primary code volume at ${Math.round(langConc)}%${rest.length ? `, accompanied by ${rest.join(' and ')}` : ''}.`,
    ])
  }
  return pick(topLangs.length, [
    `The primary language distribution spans ${topLangs.join(', ')}.`,
    `Analyzed repositories reflect development across ${topLangs.join(', ')}.`,
  ])
}

function insightTiming(raw, timing, _subject) {
  if ((timing?.commitsSampled || 0) < 10) return null
  const topHour = timing.hours.reduce((b, c, i, a) => c > a[b] ? i : b, 0)
  const topWeekday = timing.weekdays.reduce((b, c, i, a) => c > a[b] ? i : b, 0)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return pick(topHour + topWeekday, [
    `Commit timing peaks around ${String(topHour).padStart(2, '0')}:00 UTC on ${days[topWeekday]}s, based on ${timing.commitsSampled} sampled commits.`,
    `Based on ${timing.commitsSampled} sampled commits, the primary contribution window is ${String(topHour).padStart(2, '0')}:00 UTC on ${days[topWeekday]}s.`,
  ])
}

function insightNoActivity(raw, subject) {
  if (raw.eventsUnavailable) return null
  const { totalContrib, activeDays } = raw
  if (totalContrib == null || activeDays == null) return null
  if (totalContrib > 0 || activeDays > 0) return null
  return `No contribution activity was recorded in the analyzed window for ${subject}; the profile's visibility comes primarily from repository adoption rather than recent commits.`
}

// ---------------------------------------------------------------------------
// Dimensional intelligence synthesis (no score, no arbitrary /100)
// ---------------------------------------------------------------------------

function synthesiseDimensionalIntelligence(raw, usedSignals, subject, _intelligence) {
  const dims = []
  if (!usedSignals.has('impact') && (raw.totalStars > 0 || raw.totalForks > 0)) {
    dims.push(`repository adoption (${fmt(raw.totalStars)} ${raw.totalStars === 1 ? 'star' : 'stars'})`)
  }
  if (!usedSignals.has('consistency') && raw.activeDays != null && raw.activeDays > 0) {
    dims.push(`contribution cadence (${raw.activeDays} active day${raw.activeDays !== 1 ? 's' : ''})`)
  }
  if (!usedSignals.has('collaboration') && raw.totalCollab != null && raw.totalCollab > 0) {
    dims.push(`collaborative activity (${raw.totalCollab} PR/issue action${raw.totalCollab !== 1 ? 's' : ''})`)
  }
  if (!usedSignals.has('reach') && raw.followers > 0) {
    dims.push(`account reach (${fmt(raw.followers)} follower${raw.followers !== 1 ? 's' : ''})`)
  }

  if (dims.length === 0) {
    return `${subject}'s public profile displays verified repository and code metrics without composite scores.`
  }

  return `${subject}'s profile displays verified repository metrics characterized by ${dims.join(', ')}.`
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateDeveloperSummary(data) {
  const { user = {}, repos = [], languages = [], contributions = {}, timing = {}, intelligence } = data || {}
  const subject = user.name?.trim() || (user.login ? `@${user.login}` : 'Developer')

  const dataQuality = data?.dataQuality || data?.contributions?.dataQuality || null
  const observationWindowDays = dataQuality?.observationWindowDays ||
    intelligence?.activity?.observationWindowDays ||
    data?.observationWindowDays ||
    (data?.estimated ? 90 : 365)

  const { signals, raw } = scoreSignals({ user, repos, languages, contributions, timing, observationWindowDays, dataQuality, intelligence, authenticated: data?.authenticated, estimated: data?.estimated })

  // Rank signals (descending strength), exclude zero-value
  const ranked = Object.entries(signals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k)

  // Build insight pool – one insight per signal, in ranked order
  // usedSignals tracks what we've consumed so the synthesis can avoid repeats
  const usedSignals = new Set()
  const insights = []

  const MAX_INSIGHTS = 3  // cap before dimensional synthesis

  for (const sig of ranked) {
    if (insights.length >= MAX_INSIGHTS) break
    let text = null

    switch (sig) {
      case 'impact':
        text = insightImpact(raw, subject)
        // If no recent activity, add a contrast note as part of the same signal slot
        if (text && !raw.eventsUnavailable) {
          const contrast = insightNoActivity(raw, subject)
          if (contrast) text = text + '\n\n' + contrast
        }
        break
      case 'contributions':
        text = insightContributions(raw, subject)
        break
      case 'consistency':
        text = insightConsistency(raw, subject)
        break
      case 'collaboration':
        text = insightCollaboration(raw, subject)
        break
      case 'repositories':
        text = insightRepositories(raw, subject)
        break
      case 'languages':
        text = insightLanguages(raw, subject)
        break
      case 'timing':
        text = insightTiming(raw, timing, subject)
        break
    }

    if (text) {
      insights.push(text)
      usedSignals.add(sig)
    }
  }

  // If no collaboration data was consumed and contributions were shown, add contrast note
  if (!raw.eventsUnavailable && !usedSignals.has('collaboration') && usedSignals.has('contributions')) {
    const noCollab = insightNoCollaboration(raw, subject)
    if (noCollab && insights.length < MAX_INSIGHTS + 1) {
      insights.push(noCollab)
      usedSignals.add('collaboration')
    }
  }

  // Dimensional intelligence synthesis (reads usedSignals to avoid repeating metrics)
  insights.push(synthesiseDimensionalIntelligence(raw, usedSignals, subject, intelligence))

  // Deduplication guard: strip any paragraph that shares a 6+ digit numeral
  // with an earlier paragraph (catches accidental metric repeats)
  const seenNumbers = new Set()
  const deduplicated = insights.filter(para => {
    const nums = (para.match(/[\d,]{4,}/g) || []).map(n => n.replace(/,/g, ''))
    const conflict = nums.some(n => seenNumbers.has(n))
    if (!conflict) nums.forEach(n => seenNumbers.add(n))
    return !conflict
  })

  if (data?.estimated || dataQuality?.isEstimated) {
    if (!deduplicated.some(p => p.includes('Some contribution metrics are estimated from public GitHub events'))) {
      deduplicated.push('Some contribution metrics are estimated from public GitHub events due to limited access to the full contribution calendar.')
    }
  }

  return deduplicated.join('\n\n')
}

export function extractSummaryMetrics(data = {}) {
  const { repos = [], languages = [], contributions = {}, timing = {}, observationWindowDays, dataQuality, intelligence, authenticated, estimated } = data || {}
  const windowDays = Math.max(1, Number(observationWindowDays) || Number(intelligence?.activity?.observationWindowDays) || 365)
  const eventsUnavailable = Boolean(dataQuality?.eventsUnavailable)
  const isEstimated = Boolean(dataQuality?.isEstimated || estimated)

  const coverage = determineCoverage({
    dataQuality,
    intelligence,
    isEstimated,
    authenticated: Boolean(authenticated),
    windowDays,
    eventsUnavailable
  })

  const safeRepos = Array.isArray(repos) ? repos : []
  const safeLangs = Array.isArray(languages) ? languages : []

  const actDays = intelligence?.activity?.source === 'graphql_calendar'
    ? intelligence.activity.recordedContributionDaysCount?.value
    : intelligence?.activity?.observedPublicEventDaysCount?.value

  const totalContrib = eventsUnavailable
    ? null
    : (contributions?.total ?? (Array.isArray(contributions?.days) ? contributions.days.reduce((s, d) => s + (d.contributionCount || 0), 0) : null) ?? (intelligence?.activity?.source === 'graphql_calendar' ? intelligence.activity.totalRecordedContributions?.value : null) ?? null)
  const activeDays = eventsUnavailable ? null : (contributions.activeDays ?? actDays ?? null)

  const isVerified = coverage.coverageStatus === 'complete' && !isEstimated
  const contributionLabel = isVerified ? 'Verified Contributions' : 'Observed Contributions'

  const totalRepos = safeRepos.length || 0
  const activeRepos = safeRepos.filter(r => r.status === 'active').length
  const watchRepos = safeRepos.filter(r => r.status === 'watch').length
  const staleRepos = safeRepos.filter(r => r.status === 'stale').length
  const archivedRepos = safeRepos.filter(r => r.status === 'archived').length

  const totalLangSize = safeLangs.reduce((s, l) => s + (l.size || 0), 0)
  const primaryLang = (safeLangs.length > 0 && totalLangSize > 0)
    ? { name: safeLangs[0].name, pct: Math.round((safeLangs[0].size / totalLangSize) * 100) }
    : null

  const sampled = timing?.commitsSampled || 0
  const timingMetric = (sampled >= 10 && timing?.peakWeekday != null && timing?.peakHour != null)
    ? {
      hour: timing.peakHour,
      weekday: timing.peakWeekday,
      sampled
    }
    : null

  return {
    contributions: {
      total: totalContrib,
      label: contributionLabel,
      activeDays,
      windowDays,
      verifiedDays: coverage.verifiedDays,
      coverageStatus: coverage.coverageStatus,
      isEstimated,
      isTruncated: Boolean(dataQuality?.isTruncated),
      oldestEventDate: coverage.boundaryDate,
      eventsUnavailable
    },
    repositories: {
      total: totalRepos,
      active: activeRepos,
      watch: watchRepos,
      stale: staleRepos,
      archived: archivedRepos
    },
    language: primaryLang,
    timing: timingMetric
  }
}
