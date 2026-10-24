# Rate Limiting & Caching Architecture

This document explains GitHub API rate limits, application-level rate limiting, in-memory caching behavior, and the architectural trade-offs of running in serverless environments.

---

## 1. Upstream GitHub API Rate Limits

GitHub enforces strict rate limits on upstream API requests:

| Access Mode | Rate Limit | Telemetry Source | Capabilities |
|:---|:---|:---|:---|
| **Unauthenticated (Public API)** | 60 requests / hour per IP address | Public events feed (`/users/:username/events/public`) | Estimates ~90 days or up to 300 recent public events. Calendar heatmaps use estimated telemetry. |
| **Authenticated (Token / OAuth)** | 5,000 requests / hour | GitHub GraphQL API & REST endpoints | Full 1-year contribution calendars, private contribution counts (if authorized), and exact repository byte breakdowns. |

### Upstream Rate Limit Protection
- **Server Token Injection:** Supplying a server-side `GITHUB_TOKEN` applies the 5,000 req/hr allowance to all dashboard and comparison requests handled by the server.
- **In-Flight Request Deduplication:** If multiple concurrent requests arrive for the same user profile while an upstream fetch is underway, the promises are coalesced (`inflight` Map) so upstream APIs are queried only once.
- **Caching:** Responses are cached in memory for 10 minutes (`CACHE_TTL_SECONDS = 600`), preventing repeated upstream requests for frequently accessed profiles.

---

## 2. Application Rate Limiting Middleware

Arsenic protects its backend endpoints using `express-rate-limit`:

### General API Limiter (`/api/*`)
- **Threshold:** 90 requests per minute per client IP (`windowMs: 60_000`, `max: 90`).
- **Headers:** Uses draft-8 rate limit headers (`standardHeaders: 'draft-8'`, `legacyHeaders: false`).
- **Scope:** Applied across all data and health routes.

### Developer Summary Limiter (`/api/summary/:username`)
- **Threshold:** 5 requests per 10 minutes per IP (`windowMs: 10 * 60_000`, `max: 5`).
- **Configurable:** Overridable via `SUMMARY_LIMIT_PER_10_MIN`.
- **Purpose:** Prevents excessive load on the deterministic narrative generation engine.

### Daily Summary Server Cap
- **Threshold:** 200 summary generations per day across the server process (`SUMMARY_DAILY_CAP`).
- **Cache Pre-Check:** The summary cache (`summaryCache`, 1-hour TTL) is evaluated before checking the daily cap. Cached hits return immediately with `{ cached: true }` and do not consume daily cap allowance.

---

## 3. In-Memory Caching Architecture

Arsenic uses in-memory JavaScript `Map` structures for caching:

- **Profile & Comparison Cache (`cache`):** Stores normalized GitHub profile and repository telemetry with a default TTL of 600 seconds (10 minutes). Minimum enforced TTL is 60 seconds.
- **Summary Cache (`summaryCache`):** Stores generated deterministic developer narratives with a 1-hour TTL.
- **In-Flight Deduplication (`inflight`):** Tracks active `fetch` promises to collapse concurrent identical queries into a single upstream request.

---

## 4. Multi-Instance & Serverless Behavior

When deployed on serverless platforms such as Vercel:

- **Local Instance State:** In-memory rate limiting is local to a serverless instance and does not provide globally shared limits across instances. Each warm serverless container maintains its own process memory, which resets on cold starts or when requests are routed to new containers.
- **Cache Behavior Across Instances:** Cache hits occur when requests land on a warm container with active entries. If a request hits a cold or separate instance, data is fetched fresh from upstream GitHub APIs, which is accommodated seamlessly within available GitHub token quotas.
- **Shared Storage as a Scaling Option:** A shared store such as Redis is a scaling option if globally synchronized rate limits and centralized cross-instance caching are required in the future.
