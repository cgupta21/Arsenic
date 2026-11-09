export function clampScore(value: unknown): number
export function calculateScore(input?: {
  activeDays?: number | null
  prs?: number | null
  issues?: number | null
  reviews?: number | null
  stars?: number
  forks?: number
  followers?: number
  observationWindowDays?: number
  dataQuality?: {
    isTruncated?: boolean
    eventsUnavailable?: boolean
    observedDaysCount?: number
    [key: string]: unknown
  } | null
}): {
  score: number | null
  scoringModel: 'three_pillar' | 'two_pillar_renormalized' | 'unavailable'
  breakdown: { consistency: number | null; collaboration: number | null; impact: number }
  observationWindowDays: number
  effectiveWindowDays: number
  targetActiveDays: number
}
