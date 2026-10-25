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
