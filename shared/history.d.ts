export interface ScoreSnapshot {
  date: string
  score: number
  grade: string
  color: string
  breakdown: {
    consistency: number
    collaboration: number
    impact: number
  }
}

export interface HistorySummary {
  username: string
  snapshots: ScoreSnapshot[]
  currentScore: number | null
  previousScore: number | null
  scoreChange: number | null
  trend: 'up' | 'down' | 'neutral' | 'none'
  durable?: boolean
  warning?: string
}

export function createScoreSnapshot(params: {
  score: number
  breakdown?: { consistency?: number; collaboration?: number; impact?: number }
  date?: string
}): ScoreSnapshot

export function evaluateSnapshotEligibility(
  existingSnapshots?: ScoreSnapshot[],
  newScore?: number,
  newBreakdown?: { consistency?: number; collaboration?: number; impact?: number },
  targetDate?: string
): { shouldRecord: boolean; isUpdate: boolean; index: number }

export function computeScoreTrend(
  snapshots?: ScoreSnapshot[],
  username?: string,
  options?: { durable?: boolean; warning?: string }
): HistorySummary
