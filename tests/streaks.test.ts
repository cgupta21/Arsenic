import { describe, expect, it } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import { calculateStreaks, flattenCalendar } from '../server/index.js'

function offsetDate(baseDate: Date, daysOffset: number): string {
  const d = new Date(baseDate)
  d.setUTCDate(d.getUTCDate() + daysOffset)
  return d.toISOString().slice(0, 10)
}

describe('calculateStreaks', () => {
  describe('regression tests for current streak calculation', () => {
    it('contributions on today and the previous three days → current streak 4', () => {
      const now = new Date()
      const d0 = offsetDate(now, 0)   // today
      const d1 = offsetDate(now, -1)  // yesterday
      const d2 = offsetDate(now, -2)  // 2 days ago
      const d3 = offsetDate(now, -3)  // 3 days ago
      const d4 = offsetDate(now, -4)  // 4 days ago (no contributions)

      const days = [
        { date: d4, contributionCount: 0 },
        { date: d3, contributionCount: 2 },
        { date: d2, contributionCount: 1 },
        { date: d1, contributionCount: 5 },
        { date: d0, contributionCount: 3 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(4)
      expect(result.longest).toBe(4)
    })

    it('no contributions today, but contributions yesterday and the previous three days → current streak 4', () => {
      const now = new Date()
      const d0 = offsetDate(now, 0)   // today (0 contributions)
      const d1 = offsetDate(now, -1)  // yesterday
      const d2 = offsetDate(now, -2)  // 2 days ago
      const d3 = offsetDate(now, -3)  // 3 days ago
      const d4 = offsetDate(now, -4)  // 4 days ago
      const d5 = offsetDate(now, -5)  // 5 days ago (0 contributions)

      const days = [
        { date: d5, contributionCount: 0 },
        { date: d4, contributionCount: 1 },
        { date: d3, contributionCount: 3 },
        { date: d2, contributionCount: 2 },
        { date: d1, contributionCount: 4 },
        { date: d0, contributionCount: 0 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(4)
      expect(result.longest).toBe(4)
    })

    it('contributions today but a gap yesterday → current streak 1', () => {
      const now = new Date()
      const d0 = offsetDate(now, 0)   // today (has contributions)
      const d1 = offsetDate(now, -1)  // yesterday (gap / 0 contributions)
      const d2 = offsetDate(now, -2)  // 2 days ago (had contributions)
      const d3 = offsetDate(now, -3)  // 3 days ago (had contributions)

      const days = [
        { date: d3, contributionCount: 2 },
        { date: d2, contributionCount: 5 },
        { date: d1, contributionCount: 0 },
        { date: d0, contributionCount: 1 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(1)
      expect(result.longest).toBe(2)
    })

    it('no contributions today or yesterday → current streak 0', () => {
      const now = new Date()
      const d0 = offsetDate(now, 0)   // today (0)
      const d1 = offsetDate(now, -1)  // yesterday (0)
      const d2 = offsetDate(now, -2)  // 2 days ago (active)
      const d3 = offsetDate(now, -3)  // 3 days ago (active)

      const days = [
        { date: d3, contributionCount: 4 },
        { date: d2, contributionCount: 2 },
        { date: d1, contributionCount: 0 },
        { date: d0, contributionCount: 0 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(0)
      expect(result.longest).toBe(2)
    })

    it('longest streak remains correctly calculated when earlier streak was larger than current streak', () => {
      const now = new Date()
      const d0 = offsetDate(now, 0)
      const d1 = offsetDate(now, -1)
      const d2 = offsetDate(now, -2)
      const d3 = offsetDate(now, -3)
      const d4 = offsetDate(now, -4)
      const d5 = offsetDate(now, -5)
      const d6 = offsetDate(now, -6)
      const d7 = offsetDate(now, -7)
      const d8 = offsetDate(now, -8)

      // An earlier 4-day streak, followed by a gap, then 2 active days ending today
      const days = [
        { date: d8, contributionCount: 1 },
        { date: d7, contributionCount: 2 },
        { date: d6, contributionCount: 1 },
        { date: d5, contributionCount: 3 }, // 4-day streak (d8..d5)
        { date: d4, contributionCount: 0 }, // gap
        { date: d3, contributionCount: 0 },
        { date: d2, contributionCount: 0 },
        { date: d1, contributionCount: 2 },
        { date: d0, contributionCount: 1 }, // 2-day current streak (d1..d0)
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(2)
      expect(result.longest).toBe(4)
    })
  })

  describe('stale contribution calendars', () => {
    it('returns current streak 0 when the latest calendar date is several days in the past (default date)', () => {
      const now = new Date()
      // A calendar where the user had a 4-day streak ending 5 days ago, and no entries since
      const days = [
        { date: offsetDate(now, -8), contributionCount: 1 },
        { date: offsetDate(now, -7), contributionCount: 2 },
        { date: offsetDate(now, -6), contributionCount: 3 },
        { date: offsetDate(now, -5), contributionCount: 1 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(0)
      expect(result.longest).toBe(4)
    })

    it('returns current streak 0 when calendar ends two days ago without contributions yesterday or today', () => {
      const now = new Date()
      const days = [
        { date: offsetDate(now, -4), contributionCount: 1 },
        { date: offsetDate(now, -3), contributionCount: 2 },
        { date: offsetDate(now, -2), contributionCount: 3 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(0)
      expect(result.longest).toBe(3)
    })

    it('allows streak to continue when calendar latest date is yesterday and active (today missing from calendar)', () => {
      const now = new Date()
      const days = [
        { date: offsetDate(now, -3), contributionCount: 1 },
        { date: offsetDate(now, -2), contributionCount: 2 },
        { date: offsetDate(now, -1), contributionCount: 3 }, // yesterday
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(3)
      expect(result.longest).toBe(3)
    })

    it('returns current streak 0 when latest calendar date is several days before an explicit reference date', () => {
      const fixedRefDate = '2026-10-09'
      const days = [
        { date: '2026-10-01', contributionCount: 2 },
        { date: '2026-10-02', contributionCount: 3 },
        { date: '2026-10-03', contributionCount: 1 },
      ]

      const result = calculateStreaks(days, fixedRefDate)
      expect(result.current).toBe(0)
      expect(result.longest).toBe(3)
    })
  })

  describe('explicit reference date support', () => {
    const fixedToday = '2026-10-09'

    it('works with fixed reference dates for historical testing', () => {
      const days = [
        { date: '2026-10-05', contributionCount: 1 },
        { date: '2026-10-06', contributionCount: 2 },
        { date: '2026-10-07', contributionCount: 1 },
        { date: '2026-10-08', contributionCount: 4 },
        { date: '2026-10-09', contributionCount: 0 },
      ]

      const result = calculateStreaks(days, fixedToday)
      expect(result.current).toBe(4)
      expect(result.longest).toBe(4)
    })
  })

  describe('future-dated entries', () => {
    it('does not anchor or inflate streak when calendar contains future-dated entries (default date)', () => {
      const now = new Date()
      const dFuture = offsetDate(now, 2)
      const dTomorrow = offsetDate(now, 1)
      const dToday = offsetDate(now, 0)
      const dYesterday = offsetDate(now, -1)
      const d2DaysAgo = offsetDate(now, -2)

      // 3 active days (d2DaysAgo, dYesterday, dToday) + 2 future-dated entries
      const days = [
        { date: d2DaysAgo, contributionCount: 2 },
        { date: dYesterday, contributionCount: 1 },
        { date: dToday, contributionCount: 4 },
        { date: dTomorrow, contributionCount: 5 },
        { date: dFuture, contributionCount: 3 },
      ]

      const result = calculateStreaks(days)
      // Current streak must anchor to today, not tomorrow or future dates -> streak 3
      expect(result.current).toBe(3)
      // Longest streak must not be inflated by future dates -> longest 3
      expect(result.longest).toBe(3)
    })

    it('does not anchor streak to future date when today and yesterday have no contributions', () => {
      const now = new Date()
      const dTomorrow = offsetDate(now, 1)
      const dToday = offsetDate(now, 0)
      const dYesterday = offsetDate(now, -1)

      const days = [
        { date: dYesterday, contributionCount: 0 },
        { date: dToday, contributionCount: 0 },
        { date: dTomorrow, contributionCount: 5 },
      ]

      const result = calculateStreaks(days)
      expect(result.current).toBe(0)
      expect(result.longest).toBe(0)
    })

    it('ignores entries after explicit reference date', () => {
      const fixedRefDate = '2026-10-09'
      const days = [
        { date: '2026-10-08', contributionCount: 2 },
        { date: '2026-10-09', contributionCount: 3 },
        { date: '2026-10-10', contributionCount: 4 }, // future relative to ref date
        { date: '2026-10-11', contributionCount: 1 }, // future relative to ref date
      ]

      const result = calculateStreaks(days, fixedRefDate)
      expect(result.current).toBe(2)
      expect(result.longest).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('returns 0 for empty or invalid calendar', () => {
      expect(calculateStreaks([])).toEqual({ current: 0, longest: 0 })
      expect(calculateStreaks(null)).toEqual({ current: 0, longest: 0 })
      expect(calculateStreaks(undefined)).toEqual({ current: 0, longest: 0 })
    })

    it('handles out-of-order date input properly', () => {
      const days = [
        { date: '2026-10-09', contributionCount: 1 },
        { date: '2026-10-07', contributionCount: 1 },
        { date: '2026-10-08', contributionCount: 1 },
      ]
      const result = calculateStreaks(days, '2026-10-09')
      expect(result.current).toBe(3)
      expect(result.longest).toBe(3)
    })

    it('does not bridge gaps in non-consecutive dates', () => {
      const days = [
        { date: '2026-10-01', contributionCount: 5 },
        { date: '2026-10-05', contributionCount: 3 },
      ]
      const result = calculateStreaks(days, '2026-10-05')
      expect(result.current).toBe(1)
      expect(result.longest).toBe(1)
    })
  })

  describe('flattenCalendar', () => {
    it('flattens contribution weeks into days array', () => {
      const calendar = {
        weeks: [
          {
            contributionDays: [
              { date: '2026-10-01', contributionCount: 1 },
              { date: '2026-10-02', contributionCount: 2 },
            ],
          },
          {
            contributionDays: [
              { date: '2026-10-03', contributionCount: 0 },
            ],
          },
        ],
      }
      const flattened = flattenCalendar(calendar)
      expect(flattened).toHaveLength(3)
      expect(flattened[0].date).toBe('2026-10-01')
      expect(flattened[2].date).toBe('2026-10-03')
    })

    it('returns empty array for missing or malformed calendar', () => {
      expect(flattenCalendar(null)).toEqual([])
      expect(flattenCalendar({})).toEqual([])
      expect(flattenCalendar({ weeks: null })).toEqual([])
    })
  })
})
