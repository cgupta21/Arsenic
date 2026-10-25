export function clampScore(value) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function calculateScore({ activeDays, prs, issues, reviews, stars, forks, followers }) {
  const consistency = Math.min(100, Math.round((activeDays / 120) * 100))
  const collaboration = Math.min(100, Math.round(((prs + issues + reviews) / 40) * 100))
  const impact = Math.min(100, Math.round(
    (Math.log1p(stars) / Math.log1p(1000)) * 55 +
    (Math.log1p(forks) / Math.log1p(100)) * 20 +
    (Math.log1p(followers || 0) / Math.log1p(1000)) * 25
  ))
  const score = clampScore(consistency * 0.45 + collaboration * 0.3 + impact * 0.25)
  return { score, breakdown: { consistency, collaboration, impact } }
}

export function getHealthGrade(score) {
  const num = Number(score) || 0
  if (num >= 85) return 'Excellent Health'
  if (num >= 70) return 'Strong Health'
  if (num >= 50) return 'Moderate Health'
  if (num >= 30) return 'Developing Health'
  return 'Low Activity'
}

export function getHealthGradeColor(score) {
  const num = Number(score) || 0
  if (num >= 85) return '#58A65C'
  if (num >= 70) return '#87966A'
  if (num >= 50) return '#D4A373'
  if (num >= 30) return '#C96A45'
  return '#7A7870'
}
