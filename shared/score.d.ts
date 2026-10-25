export function clampScore(value: number): number
export function calculateScore(input: {
  activeDays: number
  prs: number
  issues: number
  reviews: number
  stars: number
  forks: number
  followers: number
}): {
  score: number
  breakdown: { consistency: number; collaboration: number; impact: number }
}
