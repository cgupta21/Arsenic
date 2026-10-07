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
// Signal scoring (all values normalised to 0–100)
// ---------------------------------------------------------------------------

function scoreSignals({ user, repos, languages, contributions, score, timing }) {
  const totalStars    = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0)
  const totalForks    = repos.reduce((f, r) => f + (r.forks_count    || 0), 0)
  const followers     = user.followers ?? 0
  const totalContrib  = contributions.total      || 0
  const activeDays    = contributions.activeDays || 0
  const longestStreak = contributions.longestStreak || 0
  const currentStreak = contributions.currentStreak || 0
  const prs           = score.raw?.prs     || 0
  const issues        = score.raw?.issues  || 0
  const reviews       = score.raw?.reviews || 0
  const totalCollab   = prs + issues + reviews
  const totalRepos    = repos.length || 0
  const activeRepos   = repos.filter(r => r.status === 'active').length
  const staleRepos    = repos.filter(r => r.status === 'stale').length
  const archivedRepos = repos.filter(r => r.status === 'archived').length
  const topLangs      = languages.slice(0, 3).map(l => l.name)
  const langConc      = topLangs.length && languages.length
    ? (languages[0].size / languages.reduce((s, l) => s + l.size, 0)) * 100
    : 0

  // Normalised signal strengths
  const signals = {
    impact: Math.min(100,
      (Math.log1p(totalStars)    / Math.log1p(10000))  * 50 +
      (Math.log1p(totalForks)    / Math.log1p(100000)) * 30 +
      (Math.log1p(followers)     / Math.log1p(10000))  * 20
    ),
    // Normalise against 150 so a moderate contributor (100+ commits) ranks meaningfully
    contributions: Math.min(100, (totalContrib / 150) * 100),
    consistency: Math.min(100,
      (activeDays    / 120) * 50 +
      (longestStreak / 60)  * 30 +
      (currentStreak / 30)  * 20
    ),
    collaboration: Math.min(100, (totalCollab / 40) * 100),
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
    raw: { totalStars, totalForks, followers, totalContrib, activeDays,
           longestStreak, currentStreak, prs, issues, reviews, totalCollab,
           totalRepos, activeRepos, staleRepos, archivedRepos, topLangs, langConc }
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
  if (totalStars > 0)   parts.push(`${fmt(totalStars)} stars`)
  if (totalForks > 0)   parts.push(`${fmt(totalForks)} forks`)
  if (followers  > 100) parts.push(`${fmt(followers)} followers`)

  const seed = totalStars + totalForks
  return pick(seed, [
    `The strongest signal in ${subject}'s profile is community reach: ${parts.join(', ')} across the analyzed repositories.`,
    `${subject} stands out for repository impact — ${parts.join(', ')} indicate substantial community interest.`,
    `Community reach defines ${subject}'s GitHub presence, with ${parts.join(', ')} on record.`,
  ])
}

function insightContributions(raw, subject) {
  const { totalContrib } = raw
  if (totalContrib === 0) return null
  return pick(totalContrib, [
    `${subject} has logged ${fmt(totalContrib)} contributions over the analyzed window, pointing to active development.`,
    `A contribution count of ${fmt(totalContrib)} anchors ${subject}'s activity record.`,
    `${subject}'s activity totals ${fmt(totalContrib)} contributions, indicating regular engagement with the platform.`,
  ])
}

function insightConsistency(raw, subject) {
  const { activeDays, longestStreak, currentStreak } = raw
  if (activeDays === 0 && longestStreak === 0) return null
  const streakNote = currentStreak > 0
    ? `a current streak of ${currentStreak} days`
    : longestStreak > 0 ? `a peak streak of ${longestStreak} days` : null
  const parts = [`${activeDays} active day${activeDays !== 1 ? 's' : ''}`]
  if (streakNote) parts.push(streakNote)

  return pick(activeDays, [
    `Consistency is reflected by ${parts.join(' and ')} in the contribution record.`,
    `The activity pattern shows ${parts.join(' and ')}, suggesting ${activeDays > 60 ? 'sustained' : 'periodic'} engagement.`,
    `${subject}'s commit cadence spans ${parts.join(' and ')}.`,
  ])
}

function insightCollaboration(raw, subject) {
  const { prs, issues, reviews, totalCollab } = raw
  if (totalCollab === 0) return null
  const breakdown = []
  if (prs     > 0) breakdown.push(`${prs} PR${prs !== 1 ? 's' : ''}`)
  if (issues  > 0) breakdown.push(`${issues} issue${issues !== 1 ? 's' : ''}`)
  if (reviews > 0) breakdown.push(`${reviews} review${reviews !== 1 ? 's' : ''}`)

  return pick(totalCollab, [
    `Collaboration activity includes ${breakdown.join(', ')}, signalling engagement beyond solo commits.`,
    `${subject} shows community involvement through ${breakdown.join(', ')}.`,
    `External engagement is evidenced by ${breakdown.join(', ')}.`,
  ])
}

function insightNoCollaboration(raw, subject) {
  // Useful contrast insight when collaboration is zero but contributions exist
  const { totalCollab, totalContrib } = raw
  if (totalCollab > 0 || totalContrib === 0) return null
  return pick(totalContrib, [
    `No public pull-request, issue, or review activity is visible in the analyzed data.`,
    `Public collaboration signals (PRs, issues, reviews) are not present in the analyzed window.`,
  ])
}

function insightRepositories(raw, subject) {
  const { totalRepos, activeRepos, staleRepos, archivedRepos } = raw
  if (totalRepos === 0) return null

  // All-stale special case: say it plainly, no contradiction
  if (staleRepos === totalRepos && activeRepos === 0 && archivedRepos === 0) {
    return pick(totalRepos, [
      `All ${totalRepos} analyzed ${totalRepos === 1 ? 'repository is' : 'repositories are'} currently classified as stale.`,
      `The ${totalRepos} repositories in the analysis are all stale, indicating limited recent maintenance.`,
    ])
  }

  // All-active special case
  if (activeRepos === totalRepos && staleRepos === 0 && archivedRepos === 0) {
    return pick(totalRepos, [
      `All ${totalRepos} analyzed ${totalRepos === 1 ? 'repository is' : 'repositories are'} currently active.`,
      `The entire portfolio of ${totalRepos} repositories is actively maintained.`,
    ])
  }

  // Mixed case: list breakdown without appending a contradictory health label
  const parts = []
  if (activeRepos   > 0) parts.push(`${activeRepos} active`)
  if (staleRepos    > 0) parts.push(`${staleRepos} stale`)
  if (archivedRepos > 0) parts.push(`${archivedRepos} archived`)

  return pick(totalRepos, [
    `The analyzed portfolio contains ${totalRepos} repositories, including ${parts.join(', ')}.`,
    `Across ${totalRepos} repositories the breakdown is ${parts.join(', ')}.`,
    `Repository health: ${parts.join(', ')} out of ${totalRepos} total projects.`,
  ])
}

function insightLanguages(raw, subject) {
  const { topLangs, langConc } = raw
  if (topLangs.length === 0) return null
  const primary = topLangs[0]
  const rest    = topLangs.slice(1)
  const focused = langConc > 60

  if (focused) {
    return pick(langConc, [
      `The codebase is heavily oriented around ${primary}${rest.length ? `, with ${rest.join(' and ')} also present` : ''}.`,
      `${primary} dominates the visible codebase${rest.length ? `, alongside ${rest.join(' and ')}` : ''}, indicating a focused technology stack.`,
    ])
  }
  return pick(topLangs.length, [
    `The language mix spans ${topLangs.join(', ')}, reflecting breadth across multiple technology areas.`,
    `Across the analyzed repositories, ${topLangs.join(', ')} form the primary language spread.`,
  ])
}

function insightTiming(raw, timing, subject) {
  if ((timing.commitsSampled || 0) < 10) return null
  const topHour    = timing.hours.reduce((b, c, i, a) => c > a[b] ? i : b, 0)
  const topWeekday = timing.weekdays.reduce((b, c, i, a) => c > a[b] ? i : b, 0)
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return pick(topHour + topWeekday, [
    `Commit timing clusters around ${String(topHour).padStart(2,'0')}:00 UTC on ${days[topWeekday]}s.`,
    `Most commits land around ${String(topHour).padStart(2,'0')}:00 UTC, with ${days[topWeekday]} as the busiest day.`,
  ])
}

function insightNoActivity(raw, subject) {
  const { totalContrib, activeDays } = raw
  if (totalContrib > 0 || activeDays > 0) return null
  return `No contribution activity was recorded in the analyzed window for ${subject}; the profile's visibility comes primarily from repository adoption rather than recent commits.`
}

// ---------------------------------------------------------------------------
// Score synthesis (no raw metrics repeated)
// ---------------------------------------------------------------------------

function synthesiseScore(scoreData, usedSignals, subject) {
  const { score, breakdown } = scoreData
  const { consistency: cons, collaboration: coll, impact: imp } = breakdown

  const dims = []
  if (!usedSignals.has('impact'))       dims.push(imp  >= 50 ? 'strong impact'      : imp  >= 20 ? 'moderate impact'      : 'limited impact')
  if (!usedSignals.has('consistency'))  dims.push(cons >= 50 ? 'strong consistency' : cons >= 20 ? 'moderate consistency' : 'limited consistency')
  if (!usedSignals.has('collaboration'))dims.push(coll >= 50 ? 'robust collaboration': coll >= 20 ? 'moderate collaboration': 'limited collaboration')

  // Which dimension is dominant?
  const dominant =
    imp  > coll && imp  > cons ? 'impact'
    : cons > coll             ? 'consistency'
    : coll > 0               ? 'collaboration'
    : 'impact'

  const usedAny = usedSignals.size > 0

  if (dims.length === 0) {
    // All dimensions already discussed — very brief closing
    return `The combined developer score is ${score}/100.`
  }

  return pick(score, [
    `The developer score of ${score}/100 reflects ${dims.join(', ')}.`,
    `Scoring ${score}/100, ${subject}'s profile is defined by ${dims.join(', ')}.`,
    `Overall, ${dims.join(', ')} compose the ${score}/100 developer score.`,
  ])
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateDeveloperSummary(data) {
  const { user, repos, languages, contributions, score, timing } = data
  const subject = user.name?.trim() || `@${user.login}`

  const { signals, raw } = scoreSignals({ user, repos, languages, contributions, score, timing })

  // Rank signals (descending strength), exclude zero-value
  const ranked = Object.entries(signals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k)

  // Build insight pool – one insight per signal, in ranked order
  // usedSignals tracks what we've consumed so the synthesis can avoid repeats
  const usedSignals = new Set()
  const insights    = []

  const MAX_INSIGHTS = 3  // cap before score synthesis

  for (const sig of ranked) {
    if (insights.length >= MAX_INSIGHTS) break
    let text = null

    switch (sig) {
      case 'impact':
        text = insightImpact(raw, subject)
        // If no recent activity, add a contrast note as part of the same signal slot
        if (text) {
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
  if (!usedSignals.has('collaboration') && usedSignals.has('contributions')) {
    const noCollab = insightNoCollaboration(raw, subject)
    if (noCollab && insights.length < MAX_INSIGHTS + 1) {
      insights.push(noCollab)
      usedSignals.add('collaboration')
    }
  }

  // Score synthesis (reads usedSignals to avoid repeating metrics)
  insights.push(synthesiseScore(score, usedSignals, subject))

  // Deduplication guard: strip any paragraph that shares a 6+ digit numeral
  // with an earlier paragraph (catches accidental metric repeats)
  const seenNumbers = new Set()
  const deduplicated = insights.filter(para => {
    const nums = (para.match(/[\d,]{4,}/g) || []).map(n => n.replace(/,/g, ''))
    const conflict = nums.some(n => seenNumbers.has(n))
    if (!conflict) nums.forEach(n => seenNumbers.add(n))
    return !conflict
  })

  if (data.estimated) {
    deduplicated.push('Some contribution metrics are estimated from public GitHub events due to limited access to the full contribution calendar.')
  }

  return deduplicated.join('\n\n')
}
