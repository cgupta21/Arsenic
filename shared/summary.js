function scoreBand(value) {
  if (value >= 80) return 'very strong'
  if (value >= 65) return 'strong'
  if (value >= 50) return 'steady'
  if (value >= 30) return 'developing'
  return 'early-stage'
}

function formatList(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

export function generateDeveloperSummary(data) {
  const { user, repos, languages, contributions, score, timing } = data
  const subject = user.name?.trim() || `@${user.login}`
  const activeRepos = repos.filter((repo) => repo.status === 'active').length
  const staleRepos = repos.filter((repo) => repo.status === 'stale').length
  const archivedRepos = repos.filter((repo) => repo.status === 'archived').length
  const totalRepos = repos.length
  const topLanguages = languages.slice(0, 3).map((item) => item.name)
  const consistency = score.breakdown.consistency
  const collaboration = score.breakdown.collaboration
  const impact = score.breakdown.impact
  const currentStreak = contributions.currentStreak || 0
  const longestStreak = contributions.longestStreak || 0
  const timingSamples = timing.commitsSampled || 0

  const paragraphs = []

  paragraphs.push(
    `${subject} shows ${scoreBand(consistency)} development consistency, ${scoreBand(collaboration)} collaboration activity, and ${scoreBand(impact)} external impact. Arsenic's overall developer score is ${score.score}/100, based on contribution consistency, collaboration signals, and repository/community impact.`
  )

  if (currentStreak > 0 || longestStreak > 0) {
    const streakText = currentStreak > 0
      ? `The current contribution streak is ${currentStreak} day${currentStreak === 1 ? '' : 's'}`
      : 'No active contribution streak is currently recorded'
    const longestText = longestStreak > 0
      ? `, with a longest observed streak of ${longestStreak} day${longestStreak === 1 ? '' : 's'}`
      : ''
    paragraphs.push(`${streakText}${longestText}. The analyzed contribution window contains ${contributions.activeDays} active contribution day${contributions.activeDays === 1 ? '' : 's'} and ${contributions.total} contribution${contributions.total === 1 ? '' : 's'}.`)
  } else {
    paragraphs.push(`The analyzed contribution window contains ${contributions.activeDays} active contribution day${contributions.activeDays === 1 ? '' : 's'} and ${contributions.total} contribution${contributions.total === 1 ? '' : 's'}, with no current streak recorded.`)
  }

  const collaborationText = `${score.raw.prs} pull request contribution${score.raw.prs === 1 ? '' : 's'}, ${score.raw.issues} issue contribution${score.raw.issues === 1 ? '' : 's'}, and ${score.raw.reviews} review contribution${score.raw.reviews === 1 ? '' : 's'}`
  paragraphs.push(`Collaboration signals include ${collaborationText}. ${collaboration >= 65 ? 'These signals indicate meaningful participation beyond direct code changes.' : 'These signals are lighter than the direct contribution activity, leaving room for stronger issue, pull-request, and review participation.'}`)

  let repoHealth = 'No repositories are available in the analyzed set.'
  if (totalRepos > 0) {
    const noun = totalRepos === 1 ? 'repository' : 'repositories'
    repoHealth = `${activeRepos} active, ${staleRepos} stale, and ${archivedRepos} archived ${noun} are represented in the analyzed set.`
  }
  const languageText = topLanguages.length ? ` The strongest code-volume signals are ${formatList(topLanguages)}.` : ''
  paragraphs.push(`${repoHealth}${languageText}`)

  if (timingSamples > 0) {
    const topHour = timing.hours.reduce((best, count, index, source) => count > source[best] ? index : best, 0)
    const topWeekday = timing.weekdays.reduce((best, count, index, source) => count > source[best] ? index : best, 0)
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    paragraphs.push(`Commit timing analysis sampled ${timingSamples} commits in ${timing.timezone || 'UTC'}. The most active commit hour was around ${String(topHour).padStart(2, '0')}:00, and the most active weekday was ${weekdayNames[topWeekday]}.`)
  }

  if (data.estimated) {
    paragraphs.push('Some contribution metrics are estimated from GitHub public events because a full authenticated contribution calendar is not available.')
  }

  return paragraphs.join('\n\n')
}
