import { getHealthGrade, getHealthGradeColor } from './score.js'

/**
 * @typedef {Object} ScoreSnapshot
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {number} score - Health score (0-100)
 * @property {string} grade - Contextual health grade
 * @property {string} color - Theme color hex code
 * @property {{ consistency: number, collaboration: number, impact: number }} breakdown
 */

/**
 * @typedef {Object} HistorySummary
 * @property {string} username
 * @property {ScoreSnapshot[]} snapshots
 * @property {number|null} currentScore
 * @property {number|null} previousScore
 * @property {number|null} scoreChange
 * @property {'up'|'down'|'neutral'|'none'} trend
 * @property {boolean} [durable]
 * @property {string} [warning]
 */

/**
 * Format a score snapshot object.
 * @param {object} params
 * @param {number} params.score
 * @param {object} [params.breakdown]
 * @param {string} [params.date]
 * @returns {ScoreSnapshot}
 */
export function createScoreSnapshot({ score, breakdown = { consistency: 0, collaboration: 0, impact: 0 }, date }) {
  const numScore = Math.min(100, Math.max(0, Math.round(Number(score) || 0)))
  const safeDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? date.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  return {
    date: safeDate,
    score: numScore,
    grade: getHealthGrade(numScore),
    color: getHealthGradeColor(numScore),
    breakdown: {
      consistency: Math.min(100, Math.max(0, Math.round(Number(breakdown?.consistency) || 0))),
      collaboration: Math.min(100, Math.max(0, Math.round(Number(breakdown?.collaboration) || 0))),
      impact: Math.min(100, Math.max(0, Math.round(Number(breakdown?.impact) || 0))),
    }
  }
}

/**
 * Determine whether a new snapshot should be appended, updated, or skipped.
 * Prevents identical snapshots from being recorded on the same calendar day.
 * @param {ScoreSnapshot[]} existingSnapshots
 * @param {number} newScore
 * @param {object} [newBreakdown]
 * @param {string} [targetDate]
 * @returns {{ shouldRecord: boolean, isUpdate: boolean, index: number }}
 */
export function evaluateSnapshotEligibility(
  existingSnapshots = [],
  newScore,
  newBreakdown = {},
  targetDate
) {
  const dateStr = typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(targetDate)
    ? targetDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const numScore = Math.min(100, Math.max(0, Math.round(Number(newScore) || 0)))
  const existingIndex = existingSnapshots.findIndex((s) => s.date === dateStr)

  if (existingIndex === -1) {
    // New calendar day, eligible for a new snapshot
    return { shouldRecord: true, isUpdate: false, index: -1 }
  }

  const existing = existingSnapshots[existingIndex]
  const sameScore = existing.score === numScore
  const sameConsistency = existing.breakdown?.consistency === Math.round(Number(newBreakdown?.consistency) || 0)
  const sameCollaboration = existing.breakdown?.collaboration === Math.round(Number(newBreakdown?.collaboration) || 0)
  const sameImpact = existing.breakdown?.impact === Math.round(Number(newBreakdown?.impact) || 0)

  if (sameScore && sameConsistency && sameCollaboration && sameImpact) {
    // Exact duplicate for today: skip
    return { shouldRecord: false, isUpdate: false, index: existingIndex }
  }

  // Same day but score or breakdown updated: update today's snapshot
  return { shouldRecord: true, isUpdate: true, index: existingIndex }
}

/**
 * Compute trend and delta metrics across chronological snapshots.
 * @param {ScoreSnapshot[]} snapshots
 * @param {string} username
 * @param {object} [options]
 * @param {boolean} [options.durable]
 * @param {string} [options.warning]
 * @returns {HistorySummary}
 */
export function computeScoreTrend(snapshots = [], username = '', options = {}) {
  const meta = {
    ...(typeof options?.durable === 'boolean' ? { durable: options.durable } : {}),
    ...(options?.warning ? { warning: options.warning } : {})
  }

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      username,
      snapshots: [],
      currentScore: null,
      previousScore: null,
      scoreChange: null,
      trend: 'none',
      ...meta
    }
  }

  // Ensure chronological order by date
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]

  if (sorted.length === 1) {
    return {
      username,
      snapshots: sorted,
      currentScore: latest.score,
      previousScore: null,
      scoreChange: null,
      trend: 'none',
      ...meta
    }
  }

  const prev = sorted[sorted.length - 2]
  const scoreChange = latest.score - prev.score
  const trend = scoreChange > 0 ? 'up' : scoreChange < 0 ? 'down' : 'neutral'

  return {
    username,
    snapshots: sorted,
    currentScore: latest.score,
    previousScore: prev.score,
    scoreChange,
    trend,
    ...meta
  }
}
