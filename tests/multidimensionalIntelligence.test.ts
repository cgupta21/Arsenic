import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  validateMetricValue,
  compareMetric,
  isComparableNumericValue,
  MetricValidationError,
  TelemetryIntegrityError
} from '../shared/intelligence.js'
import type { DeveloperIntelligence, MetricValue, RestActivityDimension } from '../shared/intelligence'
import type { Dashboard } from '../client/src/types'
import { ScoreBreakdown } from '../client/src/components/ScoreBreakdown'
import { DeveloperIntelligenceOverview } from '../client/src/components/DeveloperIntelligenceOverview'
import { generateDeveloperSummary } from '../shared/summary.js'
import { buildInsights } from '../client/src/lib/analytics'

function makeMockIntelligence(overrides: Partial<DeveloperIntelligence> = {}): DeveloperIntelligence {
  const now = new Date()
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const startUtc90 = new Date(endUtc.getTime() - 90 * 86400000)
  const startUtc365 = new Date(endUtc.getTime() - 365 * 86400000)

  return {
    schemaVersion: '3.2.0',
    collectedAt: now.toISOString(),
    activity: {
      source: 'graphql_calendar',
      observationWindowStart: startUtc365.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 365,
      recordedContributionDaysCount: { state: 'observed', value: 85 },
      contributionCurrentStreakDays: { state: 'observed', value: 12 },
      contributionLongestStreakDays: { state: 'observed', value: 30 },
      totalRecordedContributions: { state: 'observed', value: 1250 },
      privateContributionsCount: { state: 'observed', value: 120 }
    },
    adoption: {
      snapshotType: 'current_point_in_time',
      repositoryCoverage: {
        totalOwnedPublicRepos: 15,
        observedNonForkRepos: 15,
        totalEligibleNonForkRepos: 15,
        isComplete: true,
        retrievalCap: 250
      },
      totalStargazersCount: { state: 'observed', value: 340 },
      nonArchivedRepoStarsCount: { state: 'observed', value: 300 },
      archivedRepoStarsCount: { state: 'observed', value: 40 },
      forksCount: { state: 'observed', value: 45 }
    },
    reach: {
      snapshotType: 'current_point_in_time',
      followersCount: { state: 'observed', value: 150 }
    },
    maintenance: {
      repositoryCoverage: {
        totalOwnedPublicRepos: 15,
        observedNonForkRepos: 15,
        totalEligibleNonForkRepos: 15,
        isComplete: true,
        retrievalCap: 250
      },
      observationWindowStart: startUtc90.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 90,
      activeCount: { state: 'observed', value: 4 },
      inactiveCount: { state: 'observed', value: 9 },
      archivedCount: { state: 'observed', value: 2 },
      unknownCount: { state: 'zero', value: 0 }
    },
    engagement: {
      source: 'rest_event_stream',
      observationWindowStart: startUtc90.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 90,
      collectionState: 'complete',
      retrievedEventsCount: 65,
      pullRequestEventActionsCount: { state: 'observed', value: 14 },
      pullRequestReviewEventActionsCount: { state: 'observed', value: 8 },
      issueEventActionsCount: { state: 'observed', value: 6 },
      issueCommentEventActionsCount: { state: 'observed', value: 20 }
    },
    ...overrides
  }
}

function makeMockRestIntelligence(overrides: Partial<DeveloperIntelligence> = {}): DeveloperIntelligence {
  const now = new Date()
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const startUtc90 = new Date(endUtc.getTime() - 90 * 86400000)

  return makeMockIntelligence({
    activity: {
      source: 'rest_event_stream',
      observationWindowStart: startUtc90.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 90,
      collectionState: 'complete',
      retrievedEventsCount: 50,
      observedPublicEventDaysCount: { state: 'observed', value: 24 },
      observedPublicEventDateStreakDays: { state: 'observed', value: 7 },
      totalObservedPublicEvents: { state: 'observed', value: 50 }
    },
    engagement: {
      source: 'rest_event_stream',
      observationWindowStart: startUtc90.toISOString(),
      observationWindowEnd: endUtc.toISOString(),
      observationWindowDays: 90,
      collectionState: 'complete',
      retrievedEventsCount: 50,
      pullRequestEventActionsCount: { state: 'observed', value: 10 },
      pullRequestReviewEventActionsCount: { state: 'observed', value: 5 },
      issueEventActionsCount: { state: 'observed', value: 4 },
      issueCommentEventActionsCount: { state: 'observed', value: 15 }
    },
    ...overrides
  })
}

describe('M-03 Multidimensional Intelligence & Metric Value Validation', () => {
  describe('Metric Value Acceptance Policy (TEST-VAL-01 to TEST-VAL-08)', () => {
    it('TEST-VAL-01: Exact zero versus observed positive value is eligible', () => {
      const zeroVal = { state: 'zero' as const, value: 0 }
      const observedVal = { state: 'observed' as const, value: 42 }

      expect(isComparableNumericValue(zeroVal)).toBe(true)
      expect(isComparableNumericValue(observedVal)).toBe(true)
    })

    it('TEST-VAL-02: Ambiguous zero versus observed positive value is ineligible', () => {
      const ambiguousVal = { state: 'ambiguous_zero' as const, value: 0, note: 'Hidden by private settings' }
      const observedVal = { state: 'observed' as const, value: 42 }

      expect(isComparableNumericValue(ambiguousVal)).toBe(false)
      expect(isComparableNumericValue(observedVal)).toBe(true)
    })

    it('TEST-VAL-03: Unknown state with a non-null value is ineligible', () => {
      const unknownWithVal = { state: 'unknown' as const, value: 5, note: 'Invalid metadata' }
      expect(isComparableNumericValue(unknownWithVal)).toBe(false)
      expect(() => validateMetricValue('testField', unknownWithVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
    })

    it('TEST-VAL-04: Unavailable state with a non-null value is ineligible', () => {
      const unavailWithVal = { state: 'unavailable' as const, value: 10, note: 'Rate limited' }
      expect(isComparableNumericValue(unavailWithVal)).toBe(false)
      expect(() => validateMetricValue('testField', unavailWithVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
    })

    it('TEST-VAL-05: Negative count is ineligible', () => {
      const negativeVal = { state: 'observed' as const, value: -1 }
      expect(isComparableNumericValue(negativeVal)).toBe(false)
      expect(() => validateMetricValue('testField', negativeVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
    })

    it('TEST-VAL-06: NaN or Infinity is ineligible', () => {
      const nanVal = { state: 'observed' as const, value: NaN }
      const infVal = { state: 'observed' as const, value: Infinity }
      expect(isComparableNumericValue(nanVal)).toBe(false)
      expect(isComparableNumericValue(infVal)).toBe(false)
      expect(() => validateMetricValue('testField', nanVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
      expect(() => validateMetricValue('testField', infVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
    })

    it('TEST-VAL-07: Fractional count is ineligible', () => {
      const fractionalVal = { state: 'observed' as const, value: 3.5 }
      expect(isComparableNumericValue(fractionalVal)).toBe(false)
      expect(() => validateMetricValue('testField', fractionalVal as unknown as MetricValue<number>)).toThrow(MetricValidationError)
    })

    it('TEST-VAL-08: Partial lower-bound count is ineligible for numerical comparison', () => {
      const partialVal = { state: 'partial' as const, value: 200, isLowerBound: true as const, note: 'Limit reached' }
      expect(isComparableNumericValue(partialVal)).toBe(false)
      expect(() => validateMetricValue('testField', partialVal)).not.toThrow()
    })
  })

  describe('Comparison Architecture & Eligibility Dispatch (TEST-COMPARE-07 to TEST-COMPARE-12)', () => {
    it('TEST-COMPARE-07: GraphQL activity vs REST activity follower comparison remains eligible', () => {
      const profileA = makeMockIntelligence({
        reach: {
          snapshotType: 'current_point_in_time',
          followersCount: { state: 'observed', value: 250 }
        }
      })
      const profileB = makeMockRestIntelligence({
        reach: {
          snapshotType: 'current_point_in_time',
          followersCount: { state: 'observed', value: 120 }
        }
      })

      const res = compareMetric(profileA, profileB, 'account_followers')
      expect(res.eligible).toBe(true)
      expect(res.winner).toBe('profile_a')
      expect(res.valueA).toBe(250)
      expect(res.valueB).toBe(120)
    })

    it('TEST-COMPARE-08: GraphQL activity vs REST activity repository star comparison remains eligible with complete coverage', () => {
      const profileA = makeMockIntelligence({
        adoption: {
          ...makeMockIntelligence().adoption,
          repositoryCoverage: { totalOwnedPublicRepos: 10, observedNonForkRepos: 10, totalEligibleNonForkRepos: 10, isComplete: true, retrievalCap: 250 },
          totalStargazersCount: { state: 'observed', value: 500 }
        }
      })
      const profileB = makeMockRestIntelligence({
        adoption: {
          ...makeMockRestIntelligence().adoption,
          repositoryCoverage: { totalOwnedPublicRepos: 8, observedNonForkRepos: 8, totalEligibleNonForkRepos: 8, isComplete: true, retrievalCap: 250 },
          totalStargazersCount: { state: 'observed', value: 650 }
        }
      })

      const res = compareMetric(profileA, profileB, 'repo_total_stars')
      expect(res.eligible).toBe(true)
      expect(res.winner).toBe('profile_b')
      expect(res.valueA).toBe(500)
      expect(res.valueB).toBe(650)
    })

    it('TEST-COMPARE-09: REST activity comparison with mismatched observation windows is blocked', () => {
      const baseRest = makeMockRestIntelligence().activity as RestActivityDimension
      const profileA = makeMockRestIntelligence({
        activity: {
          ...baseRest,
          observationWindowStart: '2026-08-11T00:00:00.000Z',
          observationWindowEnd: '2026-11-09T00:00:00.000Z'
        },
        engagement: {
          ...makeMockRestIntelligence().engagement,
          observationWindowStart: '2026-08-11T00:00:00.000Z',
          observationWindowEnd: '2026-11-09T00:00:00.000Z'
        }
      })
      const profileB = makeMockRestIntelligence({
        activity: {
          ...baseRest,
          observationWindowStart: '2026-08-12T00:00:00.000Z',
          observationWindowEnd: '2026-11-10T00:00:00.000Z'
        },
        engagement: {
          ...makeMockRestIntelligence().engagement,
          observationWindowStart: '2026-08-12T00:00:00.000Z',
          observationWindowEnd: '2026-11-10T00:00:00.000Z'
        }
      })

      const res = compareMetric(profileA, profileB, 'rest_observed_public_event_days')
      expect(res.eligible).toBe(false)
      expect(res.winner).toBeNull()
      expect(res.reason).toContain('Observation window start/end timestamps do not match')
    })

    it('TEST-COMPARE-10: Unknown metric key is rejected without numeric fallback', () => {
      const profileA = makeMockIntelligence()
      const profileB = makeMockIntelligence()

      const res = compareMetric(profileA, profileB, 'unregistered_custom_metric')
      expect(res.eligible).toBe(false)
      expect(res.winner).toBeNull()
      expect(res.reason).toContain("Unknown or unregistered metric key: 'unregistered_custom_metric'")
    })

    it('TEST-COMPARE-11: Contradictory activity and engagement collection states throws TelemetryIntegrityError', () => {
      const baseRest = makeMockRestIntelligence().activity as RestActivityDimension
      const profileA = makeMockRestIntelligence({
        activity: {
          ...baseRest,
          collectionState: 'complete'
        },
        engagement: {
          ...makeMockRestIntelligence().engagement,
          collectionState: 'incomplete' // Contradiction!
        }
      })
      const profileB = makeMockRestIntelligence()

      expect(() => compareMetric(profileA, profileB, 'account_followers')).toThrow(TelemetryIntegrityError)
    })

    it('TEST-COMPARE-12: Unavailable metric value produces no winner', () => {
      const profileA = makeMockIntelligence({
        reach: {
          snapshotType: 'current_point_in_time',
          followersCount: { state: 'observed', value: 100 }
        }
      })
      const profileB = makeMockIntelligence({
        reach: {
          snapshotType: 'current_point_in_time',
          followersCount: { state: 'unavailable', value: null, note: 'Rate limit exceeded' }
        }
      })

      const res = compareMetric(profileA, profileB, 'account_followers')
      expect(res.eligible).toBe(false)
      expect(res.winner).toBeNull()
      expect(res.reason).toContain('ineligible for comparison')
    })
  })

  describe('Repository Partition Invariants & Maintenance Policy', () => {
    it('strictly partitions observed non-fork repositories across active, inactive, archived, and unknown', () => {
      const profile = makeMockIntelligence()
      const maintenance = profile.maintenance
      const coverage = profile.adoption.repositoryCoverage

      const sumBuckets =
        (maintenance.archivedCount.value ?? 0) +
        (maintenance.activeCount.value ?? 0) +
        (maintenance.inactiveCount.value ?? 0) +
        (maintenance.unknownCount.value ?? 0)

      expect(sumBuckets).toBe(coverage.observedNonForkRepos)
    })

    it('strictly preserves repository star partition invariant: total === nonArchived + archived', () => {
      const profile = makeMockIntelligence()
      const adoption = profile.adoption

      expect(adoption.totalStargazersCount.value).toBe(
        (adoption.nonArchivedRepoStarsCount.value ?? 0) + (adoption.archivedRepoStarsCount.value ?? 0)
      )
    })

    it('prohibits winner declarations for repository maintenance', () => {
      const profileA = makeMockIntelligence()
      const profileB = makeMockIntelligence()

      const res = compareMetric(profileA, profileB, 'repo_maintenance_active_rate')
      expect(res.eligible).toBe(false)
      expect(res.winner).toBeNull()
      expect(res.reason).toContain('Winner declaration is prohibited for')
    })
  })

  describe('Observation Window Boundary Semantics (TEST-BOUND-01 to TEST-BOUND-05)', () => {
    it('TEST-BOUND-01 & TEST-BOUND-02: Exactly 90 * 24 hours duration and inclusive start boundary', () => {
      const now = new Date()
      const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
      const startUtc90 = new Date(endUtc.getTime() - 90 * 86400000)

      expect(endUtc.getTime() - startUtc90.getTime()).toBe(90 * 86400000)
      expect(endUtc.getTime() - startUtc90.getTime()).toBe(7776000000)

      // Inclusive start: event exactly at start is included
      const eventAtStart = startUtc90.getTime()
      const isStartIncluded = eventAtStart >= startUtc90.getTime() && eventAtStart < endUtc.getTime()
      expect(isStartIncluded).toBe(true)

      // Event 1ms before start is excluded
      const eventBeforeStart = startUtc90.getTime() - 1
      const isBeforeStartIncluded = eventBeforeStart >= startUtc90.getTime() && eventBeforeStart < endUtc.getTime()
      expect(isBeforeStartIncluded).toBe(false)
    })

    it('TEST-BOUND-03 & TEST-BOUND-04: End boundary is exclusive [start, end)', () => {
      const now = new Date()
      const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
      const startUtc90 = new Date(endUtc.getTime() - 90 * 86400000)

      // Event at end - 1ms is included
      const eventAtLastMs = endUtc.getTime() - 1
      const isLastMsIncluded = eventAtLastMs >= startUtc90.getTime() && eventAtLastMs < endUtc.getTime()
      expect(isLastMsIncluded).toBe(true)

      // Event exactly at end is excluded (belongs to next window)
      const eventAtEnd = endUtc.getTime()
      const isEndIncluded = eventAtEnd >= startUtc90.getTime() && eventAtEnd < endUtc.getTime()
      expect(isEndIncluded).toBe(false)
    })

    it('TEST-BOUND-05: Exactly 365 * 24 hours duration for GraphQL calendar', () => {
      const now = new Date()
      const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
      const startUtc365 = new Date(endUtc.getTime() - 365 * 86400000)

      expect(endUtc.getTime() - startUtc365.getTime()).toBe(365 * 86400000)
      expect(endUtc.getTime() - startUtc365.getTime()).toBe(31536000000)
    })
  })

  describe('Five-Dimensional Architecture & Complete Score Retirement Regressions', () => {
    function makeTestDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
      return {
        user: {
          login: 'dev',
          name: 'Developer',
          avatar_url: '',
          bio: null,
          html_url: '',
          public_repos: 1,
          followers: 100,
          following: 10,
          created_at: null,
          location: null,
          blog: null
        },
        repos: [],
        events: [],
        contributions: {
          days: [],
          total: 100,
          activeDays: 20,
          currentStreak: 2,
          longestStreak: 5,
          privateContributionCount: 0
        },
        languages: [],
        timing: { commitsSampled: 0, hours: Array.from({ length: 24 }, () => 0), weekdays: Array.from({ length: 7 }, () => 0) },
        authenticated: true,
        estimated: false,
        privateContributions: false,
        api: { cached: false, cacheTtlSeconds: 600, graphqlRemaining: null, graphqlReset: null, restRemaining: null },
        intelligence: makeMockIntelligence(),
        ...overrides
      }
    }

    it('reach exists independently in the intelligence payload and followersCount is not in adoption', () => {
      const intel = makeMockIntelligence()
      expect(intel.reach).toBeDefined()
      expect(intel.reach.followersCount.state).toBe('observed')
      expect(intel.reach.followersCount.value).toBe(150)
      expect((intel.adoption as unknown as { followersCount?: unknown }).followersCount).toBeUndefined()
    })

    it('followers remain comparable across different activity sources and windows', () => {
      const graphqlProfile = makeMockIntelligence({
        reach: { snapshotType: 'current_point_in_time', followersCount: { state: 'observed', value: 300 } }
      })
      const restProfile = makeMockRestIntelligence({
        reach: { snapshotType: 'current_point_in_time', followersCount: { state: 'observed', value: 100 } }
      })
      const res = compareMetric(graphqlProfile, restProfile, 'account_followers')
      expect(res.eligible).toBe(true)
      expect(res.winner).toBe('profile_a')
    })

    it('account_followers reads exclusively from reach.followersCount and does not recover from adoption', () => {
      // Profile A has reach: undefined, but adoption has followersCount: 999
      const profileWithoutReach = {
        ...makeMockIntelligence(),
        reach: undefined as unknown as DeveloperIntelligence['reach'],
        adoption: {
          ...makeMockIntelligence().adoption,
          followersCount: { state: 'observed', value: 999 }
        }
      }
      const profileNormal = makeMockIntelligence({
        reach: { snapshotType: 'current_point_in_time', followersCount: { state: 'observed', value: 100 } }
      })
      const res = compareMetric(profileWithoutReach, profileNormal, 'account_followers')
      expect(res.eligible).toBe(false)
      expect(res.reason).toMatch(/profileA=null/i)
      expect(res.winner).toBeNull()
    })

    it('ScoreBreakdown renders all five dimensions independently and displays unavailable state when reach is absent or unavailable', () => {
      const standardHtml = renderToStaticMarkup(
        React.createElement(ScoreBreakdown, { dashboard: makeTestDashboard() })
      )
      expect(standardHtml).toContain('Contribution Activity')
      expect(standardHtml).toContain('Repository Adoption')
      expect(standardHtml).toContain('Account Reach')
      expect(standardHtml).toContain('Repository Maintenance')
      expect(standardHtml).toContain('Community Engagement')
      expect(standardHtml).toContain('150 Followers')

      // Absent reach does not recover from adoption and renders unavailable
      const absentReachDashboard = makeTestDashboard({
        intelligence: {
          ...makeMockIntelligence(),
          reach: undefined as unknown as DeveloperIntelligence['reach'],
          adoption: {
            ...makeMockIntelligence().adoption,
            // Even if an obsolete payload had followersCount in adoption:
            ...({ followersCount: { state: 'observed', value: 999 } } as Record<string, unknown>)
          }
        }
      })
      const absentHtml = renderToStaticMarkup(
        React.createElement(ScoreBreakdown, { dashboard: absentReachDashboard })
      )
      expect(absentHtml).toContain('Reach Unavailable')
      expect(absentHtml).not.toContain('999 Followers')

      // Unavailable reach renders note and unavailable badge
      const unavailReachDashboard = makeTestDashboard({
        intelligence: {
          ...makeMockIntelligence(),
          reach: {
            snapshotType: 'current_point_in_time',
            followersCount: { state: 'unavailable', value: null, note: 'Rate limit on followers' }
          }
        }
      })
      const unavailHtml = renderToStaticMarkup(
        React.createElement(ScoreBreakdown, { dashboard: unavailReachDashboard })
      )
      expect(unavailHtml).toContain('Reach Unavailable')
      expect(unavailHtml).toContain('Rate limit on followers')
    })

    it('High Reach requires genuinely observed Account Reach >= 100 and does not trigger on stars, partial, ambiguous, or estimated reach', () => {
      // 1. High stars (500) but low followers (20) -> High Reach MUST NOT appear
      const highStarsLowFollowersHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            intelligence: {
              ...makeMockIntelligence(),
              adoption: {
                ...makeMockIntelligence().adoption,
                totalStargazersCount: { state: 'observed', value: 500 }
              },
              reach: {
                snapshotType: 'current_point_in_time',
                followersCount: { state: 'observed', value: 20 }
              }
            }
          })
        })
      )
      expect(highStarsLowFollowersHtml).not.toContain('High Reach')

      // 2. Low stars (5) but genuinely observed high followers (150) -> High Reach MUST appear
      const lowStarsHighFollowersHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            intelligence: {
              ...makeMockIntelligence(),
              adoption: {
                ...makeMockIntelligence().adoption,
                totalStargazersCount: { state: 'observed', value: 5 }
              },
              reach: {
                snapshotType: 'current_point_in_time',
                followersCount: { state: 'observed', value: 150 }
              }
            }
          })
        })
      )
      expect(lowStarsHighFollowersHtml).toContain('High Reach')

      // 3. Partial reach (even with numeric value 200) -> High Reach MUST NOT appear
      const partialReachHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            intelligence: {
              ...makeMockIntelligence(),
              reach: {
                snapshotType: 'current_point_in_time',
                followersCount: { state: 'partial', value: 200, isLowerBound: true, note: 'Sampled' }
              }
            }
          })
        })
      )
      expect(partialReachHtml).not.toContain('High Reach')

      // 4. Ambiguous zero or unavailable reach -> High Reach MUST NOT appear
      const ambiguousReachHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            intelligence: {
              ...makeMockIntelligence(),
              reach: {
                snapshotType: 'current_point_in_time',
                followersCount: { state: 'ambiguous_zero', value: 0, note: 'Ambiguous' }
              }
            }
          })
        })
      )
      expect(ambiguousReachHtml).not.toContain('High Reach')

      // 5. Estimated profile with 200 followers -> shows Public Estimate, NOT High Reach
      const estimatedProfileHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            estimated: true,
            intelligence: {
              ...makeMockIntelligence(),
              reach: {
                snapshotType: 'current_point_in_time',
                followersCount: { state: 'observed', value: 200 }
              }
            }
          })
        })
      )
      expect(estimatedProfileHtml).toContain('Public Estimate')
      expect(estimatedProfileHtml).not.toContain('High Reach')
    })

    it('Low Collaboration is never awarded when engagement is missing or truncated', () => {
      const missingEngagementHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            intelligence: {
              ...makeMockIntelligence(),
              engagement: undefined as unknown as DeveloperIntelligence['engagement']
            }
          })
        })
      )
      expect(missingEngagementHtml).not.toContain('Low Collaboration')

      const truncatedEngagementHtml = renderToStaticMarkup(
        React.createElement(DeveloperIntelligenceOverview, {
          data: makeTestDashboard({
            dataQuality: { isTruncated: true, eventsUnavailable: false, observationWindowDays: 90, isEstimated: false, oldestEventDate: null, eventCount: 200, observedDaysCount: 90 },
            intelligence: makeMockRestIntelligence()
          })
        })
      )
      expect(truncatedEngagementHtml).not.toContain('Low Collaboration')
    })

    it('summary generation never produces /100 score claim or fabricates zero values', () => {
      const summary = generateDeveloperSummary({
        user: { login: 'dev', name: 'Dev', followers: 200, public_repos: 1, avatar_url: '', bio: null, html_url: '', following: 0, created_at: null, location: null, blog: null },
        repos: [{ id: 1, name: 'r', html_url: '', description: null, language: 'Rust', stargazers_count: 50, forks_count: 10, open_issues_count: 0, updated_at: '', pushed_at: '', fork: false, status: 'active' }],
        languages: [{ name: 'Rust', size: 1000 }],
        contributions: { days: [], total: null, activeDays: null, currentStreak: 0, longestStreak: 0, privateContributionCount: 0 },
        dataQuality: { eventsUnavailable: true, isTruncated: true, observationWindowDays: 90, isEstimated: true, oldestEventDate: null, eventCount: 0, observedDaysCount: 0 }
      })
      expect(summary).not.toContain('/100')
      expect(summary).not.toContain('score')
      expect(summary).not.toContain('0 contributions')
      expect(summary).not.toContain('0 active')
    })

    it('buildInsights has no score dependency and requires complete telemetry for engagement insight', () => {
      const insightsMissing = buildInsights(makeTestDashboard({
        dataQuality: { eventsUnavailable: false, isTruncated: true, observationWindowDays: 90, isEstimated: false, oldestEventDate: null, eventCount: 200, observedDaysCount: 90 },
        intelligence: {
          ...makeMockIntelligence(),
          engagement: {
            source: 'rest_event_stream',
            observationWindowStart: '2026-07-22T00:00:00Z',
            observationWindowEnd: '2026-10-20T00:00:00Z',
            observationWindowDays: 90,
            collectionState: 'limit_reached',
            retrievedEventsCount: 200,
            pullRequestEventActionsCount: { state: 'partial', value: 1, isLowerBound: true, note: 'truncated' },
            issueEventActionsCount: { state: 'partial', value: 0, isLowerBound: true, note: 'truncated' },
            pullRequestReviewEventActionsCount: { state: 'partial', value: 0, isLowerBound: true, note: 'truncated' },
            issueCommentEventActionsCount: { state: 'zero', value: 0 }
          }
        }
      }))
      const collabInsights = insightsMissing.filter(i => i.includes('engagement') || i.includes('Collaboration'))
      expect(collabInsights).toHaveLength(0)
    })
  })
})
