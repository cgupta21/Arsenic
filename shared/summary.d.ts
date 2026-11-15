export interface SummaryMetrics {
  contributions: {
    total: number | null
    label: string
    activeDays: number | null
    windowDays: number
    verifiedDays: number | null
    coverageStatus: 'complete' | 'partial' | 'unavailable'
    isEstimated: boolean
    isTruncated: boolean
    oldestEventDate: string | null
    eventsUnavailable: boolean
  }
  repositories: {
    total: number
    active: number
    watch: number
    stale: number
    archived: number
  }
  language: { name: string; pct: number } | null
  timing: {
    hour: number
    weekday: string
    sampled: number
  } | null
}

export interface CoverageDetermination {
  coverageStatus: 'complete' | 'partial' | 'unavailable'
  verifiedDays: number | null
  isComplete: boolean
  isPartial: boolean
  isUnavailable: boolean
  isTruncated?: boolean
  boundaryDate: string | null
  description: string
}

export function determineCoverage(options: {
  dataQuality?: {
    isTruncated?: boolean
    oldestEventDate?: string | null
    observedDaysCount?: number
    eventsUnavailable?: boolean
    isEstimated?: boolean
  }
  intelligence?: unknown
  isEstimated?: boolean
  authenticated?: boolean
  windowDays?: number
  eventsUnavailable?: boolean
}): CoverageDetermination

export function generateDeveloperSummary(data: unknown): string
export function extractSummaryMetrics(data: unknown): SummaryMetrics
