# Changelog

All notable changes to **Arsenic** are documented in this file. The project adheres to [Semantic Versioning](https://semver.org/).

---

## [2.0.0] - 2026-10-22

### Added
- **Developer Intelligence Overview Component (`DeveloperIntelligenceOverview`)**:
  - High-density synthesis component embedded directly into the developer profile overview.
  - Real-time Arsenic Health Score (out of 100) paired with contextual health grades (`Excellent Health`, `Strong Health`, `Moderate Health`, `Developing Health`, `Low Activity`).
  - Dynamic behavioral tags evaluated from telemetry: `High Velocity`, `Active Collab`, `Solo Cadence`, `Steady Cadence`, `Active Maintenance`, `Clean Branching`, `Public Estimate`, and `High Reach`.
  - Metric strip displaying Commits & PRs (with 4-week trend: last 28 days vs. prior 28 days), Active & historical streaks, PR velocity (per week with percentile benchmarks), and tracked repositories with star totals.
  - 64-day contribution density matrix (16 × 4 desktop / 8 × 8 mobile) with peak hour (UTC) and weekday pattern detection.
  - Language distribution multi-segment progress bar and legend based on repository byte volume.
  - In-page smooth-scroll deep links to `#activity` and `#repositories`.
- **Dashboard Performance, Concurrency & Resilience**:
  - Parallel GitHub API aggregation via `Promise.all` across `/users`, `/repos`, and `/events/public`.
  - Non-blocking commit timing pattern analysis with bounded 3.5s timeout (`Promise.race`) over top 3 candidate repositories.
  - 12-second backend abort timeout (`GITHUB_REQUEST_TIMEOUT_MS`) and 18-second client-side timeout (`DEFAULT_REQUEST_TIMEOUT_MS`).
  - Request cancellation lifecycle: in-flight queries aborted on search change or component unmount via `AbortController`.
  - Request generation tracking (`genRef`) discarding stale, out-of-order network responses.
  - Duplicate-submission locking (`submitting` state) preventing accidental repeated requests.
  - Same-profile re-query optimization refreshing active dashboard data in-place without view unmount.
  - Dedicated HTTP 504 Gateway Timeout error card with retry handler and showcase profile fallback.
- **Landing & Registration Flow**:
  - Dedicated landing page with live intelligence showcases and smooth navigation.
  - Multi-provider registration supporting both GitHub OAuth and Google Cloud OAuth 2.0 PKCE.
- **Authentication & Security Hardening**:
  - Dual OAuth state persistence (`oauth_state` signed cookie + encrypted session fallback).
  - Stateless encrypted cookie sessions (`iron-session` AES-256-GCM) eliminating Redis requirements.
  - Google ID token verification via `jose`.
  - Strict Content Security Policy (CSP), HSTS, and framing restrictions via Helmet and Vercel edge configuration.
- **Comprehensive Quality Assurance**:
  - Added `tests/developerIntelligenceOverview.test.ts` (19 tests).
  - Added `tests/loadingAndTimeout.test.ts` (9 tests).
  - Expanded total automated test coverage to 228 passing tests across 14 test suites.

---

## [1.0.0] - 2026-10-19

### Added
- Initial public release of Arsenic GitHub Developer Intelligence Dashboard.
- Public developer profile telemetry, active streak tracking, and commit timing analysis.
- Deterministic 3-pillar Arsenic Developer Score (Consistency 40%, Collaboration 35%, Impact 25%).
- Repository health categorization (`Active`, `Watch`, `Stale`, `Archived`) and language byte distribution.
- Side-by-side developer comparison mode (`/compare`).
- Deterministic developer summary narrative engine.
- High-resolution PNG and vector PDF developer share card exports.
- Social crawler edge prerendering (`api/meta/[username].js`) for dynamic Open Graph and Twitter Card tags.
- Cookie-based guest search allowance (3 free profile searches before GitHub sign-in).
- Dual REST and GraphQL GitHub data pipeline with ephemeral in-memory caching.
