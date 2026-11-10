// shared/intelligence.d.ts

export type ObservationState =
  | 'observed'
  | 'zero'
  | 'ambiguous_zero'
  | 'partial'
  | 'unknown'
  | 'unavailable';

export type MetricValue<T> =
  | { state: 'observed'; value: T; observationWindowStart?: string; observationWindowEnd?: string; note?: string }
  | { state: 'zero'; value: 0; observationWindowStart?: string; observationWindowEnd?: string; note?: string }
  | { state: 'ambiguous_zero'; value: 0; observationWindowStart?: string; observationWindowEnd?: string; note: string }
  | { state: 'partial'; value: T; isLowerBound: true; observationWindowStart?: string; observationWindowEnd?: string; note: string }
  | { state: 'unknown'; value: null; note: string }
  | { state: 'unavailable'; value: null; note: string };

export type TelemetrySource = 'graphql_calendar' | 'rest_event_stream';
export type RestCollectionState = 'complete' | 'limit_reached' | 'incomplete' | 'unavailable';

export interface RepositoryCoverage {
  totalOwnedPublicRepos: number;
  observedNonForkRepos: number;
  totalEligibleNonForkRepos: number | null;
  isComplete: boolean;
  retrievalCap: number;
}

export interface GraphQLActivityDimension {
  source: 'graphql_calendar';
  observationWindowStart: string;
  observationWindowEnd: string;
  observationWindowDays: 365;
  recordedContributionDaysCount: MetricValue<number>;
  contributionCurrentStreakDays: MetricValue<number>;
  contributionLongestStreakDays: MetricValue<number>;
  totalRecordedContributions: MetricValue<number>;
  privateContributionsCount: MetricValue<number>;
}

export interface RestActivityDimension {
  source: 'rest_event_stream';
  observationWindowStart: string;
  observationWindowEnd: string;
  observationWindowDays: 90;
  collectionState: RestCollectionState;
  retrievedEventsCount: number;
  observedPublicEventDaysCount: MetricValue<number>;
  observedPublicEventDateStreakDays: MetricValue<number>;
  totalObservedPublicEvents: MetricValue<number>;
}

export type ContributionActivityDimension = GraphQLActivityDimension | RestActivityDimension;

export interface RepositoryAdoptionDimension {
  snapshotType: 'current_point_in_time';
  repositoryCoverage: RepositoryCoverage;
  totalStargazersCount: MetricValue<number>;
  nonArchivedRepoStarsCount: MetricValue<number>;
  archivedRepoStarsCount: MetricValue<number>;
  forksCount: MetricValue<number>;
}

export interface AccountReachDimension {
  snapshotType: 'current_point_in_time';
  followersCount: MetricValue<number>;
}

export interface RepositoryMaintenanceDimension {
  repositoryCoverage: RepositoryCoverage;
  observationWindowStart: string;
  observationWindowEnd: string;
  observationWindowDays: 90;
  activeCount: MetricValue<number>;
  inactiveCount: MetricValue<number>;
  archivedCount: MetricValue<number>;
  unknownCount: MetricValue<number>;
}

export interface CommunityEngagementDimension {
  source: 'rest_event_stream';
  observationWindowStart: string;
  observationWindowEnd: string;
  observationWindowDays: 90;
  collectionState: RestCollectionState;
  retrievedEventsCount: number;
  pullRequestEventActionsCount: MetricValue<number>;
  pullRequestReviewEventActionsCount: MetricValue<number>;
  issueEventActionsCount: MetricValue<number>;
  issueCommentEventActionsCount: MetricValue<number>;
}

export interface DeveloperIntelligence {
  schemaVersion: '3.2.0';
  collectedAt: string;
  activity: ContributionActivityDimension;
  adoption: RepositoryAdoptionDimension;
  reach: AccountReachDimension;
  maintenance: RepositoryMaintenanceDimension;
  engagement: CommunityEngagementDimension;
}

export class MetricValidationError extends Error {
  field: string;
  reason: string;
  invalidPayload: unknown;
  constructor(field: string, reason: string, invalidPayload: unknown);
}

export class TelemetryIntegrityError extends Error {
  payload: unknown;
  constructor(message: string, payload?: unknown);
}

export function validateMetricValue<T>(field: string, metric: MetricValue<T>): void;

export interface ComparableNumericMetric {
  readonly state: 'observed' | 'zero';
  readonly value: number;
}

export function isComparableNumericValue(metric: unknown): metric is ComparableNumericMetric;

export function assertTelemetryIntegrity(profile: unknown): void;

export type MetricScope = 'snapshot' | 'window';
export type MetricKey =
  | 'account_followers'
  | 'repo_total_stars'
  | 'repo_non_archived_stars'
  | 'repo_archived_stars'
  | 'repo_forks'
  | 'repo_maintenance_active_rate'
  | 'graphql_recorded_contribution_days'
  | 'graphql_contribution_longest_streak'
  | 'graphql_total_recorded_contributions'
  | 'rest_observed_public_event_days'
  | 'rest_observed_public_event_streak'
  | 'rest_pr_event_actions'
  | 'rest_review_event_actions'
  | 'rest_issue_event_actions'
  | 'rest_comment_event_actions';

export interface MetricComparisonRule {
  readonly key: MetricKey;
  readonly scope: MetricScope;
  readonly requiredSource?: TelemetrySource;
  readonly requiresWindowParity: boolean;
  readonly requiredCollectionState?: RestCollectionState;
  readonly requiresCompleteRepoCoverage: boolean;
  readonly winnerPermitted: boolean;
  readonly extractMetric: (profile: unknown) => MetricValue<number> | null;
}

export const METRIC_REGISTRY: Map<MetricKey, MetricComparisonRule>;

export interface MetricComparisonResult {
  readonly metricKey: MetricKey;
  readonly eligible: boolean;
  readonly winner: 'profile_a' | 'profile_b' | 'tie' | null;
  readonly reason?: string;
  readonly valueA?: number;
  readonly valueB?: number;
}

export function compareMetric(
  profileA: unknown,
  profileB: unknown,
  metricKey: string
): MetricComparisonResult;
