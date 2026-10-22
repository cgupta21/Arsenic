# Arsenic — GitHub Developer Intelligence Dashboard

**Turning GitHub activity into transparent developer insights, repository signals, and side-by-side engineering benchmarks.**

Arsenic is a developer intelligence dashboard that analyzes GitHub profiles, repository health, contribution velocity, coding consistency, collaboration habits, and code volume. It translates raw GitHub API telemetry into actionable visualizations, helping developers and engineering teams understand their real-world development patterns.

<p align="center">
  <a href="https://github.com/cgupta21/Arsenic/actions/workflows/ci.yml">
    <img src="https://github.com/cgupta21/Arsenic/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License">
  </a>
  <a href="https://arsenic-rho.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-arsenic--rho.vercel.app-C96A45?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo">
  </a>
  <a href="https://github.com/cgupta21/Arsenic/releases">
    <img src="https://img.shields.io/badge/Version-2.0.0-D4A373?style=for-the-badge&logo=github" alt="Version 2.0.0">
  </a>
  <a href="https://github.com/cgupta21/Arsenic">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github" alt="GitHub Repository">
  </a>
  <a href="https://github.com/cgupta21">
    <img src="https://img.shields.io/badge/Developer-Chandan%20Kumar%20Gupta-87966A?style=for-the-badge&logo=github&logoColor=white" alt="Developer Profile">
  </a>
</p>

---

> **Live Application:** [https://arsenic-rho.vercel.app](https://arsenic-rho.vercel.app/)  
> Try searching `@cgupta21` or any public GitHub username to explore the live dashboard.

---

## Screenshots & Visual Overview

<p align="center">
  <img src="docs/screenshots/landing-page.png" alt="Arsenic Landing Page & Repository Intelligence Entry" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-overview.png" alt="Arsenic Developer Intelligence Dashboard Overview" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/developer-comparison.png" alt="Side-by-Side Developer Comparison" width="49%">
  &nbsp;
  <img src="docs/screenshots/contribution-heatmap.png" alt="1-Year Contribution Heatmap and Commit Timing Patterns" width="49%">
</p>

<p align="center">
  <img src="docs/screenshots/share-card.png" alt="Exportable Arsenic Developer Share Card (PNG & PDF)" width="100%">
</p>

> **Note on Visual Assets:** All previews above are genuine captures from Arsenic v2.0's running application—including the landing page, live developer dashboard with Developer Intelligence Overview, side-by-side comparison, contribution heatmap, and high-DPI export card.

### How to Capture Screenshots from the Running Application
To capture pixel-perfect screenshots directly from the running application:
1. Start the local full-stack development server:
   ```bash
   npm run dev
   ```
2. Using headless Edge or Chrome, capture the landing page and developer dashboard:
   ```powershell
   # Landing Page (1280 × 1280)
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --window-size=1280,1280 --virtual-time-budget=6000 --screenshot="docs/screenshots/landing-page.png" "http://127.0.0.1:5173/"

   # Developer Intelligence Dashboard (1280 × 1400)
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --window-size=1280,1400 --virtual-time-budget=6000 --screenshot="docs/screenshots/dashboard-overview.png" "http://127.0.0.1:5173/u/cgupta21"
   ```

---

## Why I Built This

Standard GitHub profile pages do a great job highlighting pinned repositories and basic contribution green-squares. However, they leave much of an engineer's day-to-day story fragmented across disparate commits, pull requests, issue threads, and release histories. Furthermore, standard contribution graphs treat a one-line typo fix identically to a complex multi-file pull request.

I built Arsenic to explore GitHub developer activity through a unified, intelligence-driven perspective. My goal was to create a focused dashboard that accomplishes four things:

1. **Synthesize Meaningful Developer Signals:** Translate raw public events and GraphQL metrics into transparent indicators for consistency, collaboration, and code volume.
2. **Evaluate Repository Health Beyond Stars:** Surface actionable repository indicators—such as active vs. stale maintenance cycles, issue-to-PR closure ratios, and language code-volume breakdowns—rather than relying solely on star counts.
3. **Enable Objective Developer Comparisons:** Provide side-by-side benchmarking between developers to compare contribution cadence, language diversity, and repository velocity across projects.
4. **Produce Clean, Shareable Portfolio Artifacts:** Generate exportable developer summary cards and crawler-optimized profile links suitable for resumes, portfolios, and technical interviews.

Above all, I wanted the dashboard to remain fast, privacy-focused, and deterministic—delivering valuable insights without calling expensive third-party AI APIs or requesting intrusive OAuth write permissions.

---

## Features

### Developer Intelligence Overview
- Embedded synthesis component (`DeveloperIntelligenceOverview`) summarizing developer health, velocity, and cadence directly at the top of the dashboard.
- Real-time Arsenic Health Score (out of 100) paired with contextual health grades (`Excellent Health`, `Strong Health`, `Moderate Health`, `Developing Health`, `Low Activity`).
- Dynamic behavioral badges evaluated directly from activity telemetry: `High Velocity`, `Active Collab`, `Solo Cadence`, `Steady Cadence`, `Active Maintenance`, `Clean Branching`, `Public Estimate`, and `High Reach`.
- High-level metric strip tracking:
  - **Commits & PRs:** Total volume paired with a 4-week trend indicator (recent 28 days vs. prior 28 days).
  - **Active Streak:** Current daily contribution streak alongside historical longest streak.
  - **PR Velocity:** Weekly pull request rate benchmarked against engineering cohorts (e.g., *Top 5% velocity*).
  - **Tracked Repositories:** Total analyzed repositories with compact total star counts.
- 64-day contribution density matrix (16 × 4 desktop / 8 × 8 mobile) visualizing recent contribution intensity alongside peak commit hours (UTC) and weekdays.
- Color-coded multi-segment language distribution progress bar and legend.
- In-page smooth-scroll navigation deep links directly to `#activity` and `#repositories`.

### Dashboard Performance, Loading Resilience & Request Lifecycle
- **Parallel GitHub API Aggregation:** `fetchPublicBundle` queries `/users/:username`, `/users/:username/repos`, and `/users/:username/events/public` simultaneously via `Promise.all`, preventing sequential network waterfalls.
- **Non-Blocking Commit Timing Queries:** Recent repository candidate analysis is limited to the top 3 active non-fork repositories and raced against a bounded 3.5s timeout (`Promise.race`) so deep commit histories never stall dashboard rendering.
- **Dedicated Request Timeouts:**
  - Upstream backend REST and GraphQL queries are bounded by a 12-second abort controller (`GITHUB_REQUEST_TIMEOUT_MS = 12_000`).
  - Frontend dashboard requests are bounded by an 18-second timeout (`DEFAULT_REQUEST_TIMEOUT_MS = 18_000`).
- **Request Cancellation & Out-of-Order Protection:**
  - Active in-flight `fetch` operations are aborted via `AbortController` whenever the query changes or the component unmounts.
  - Request generation counters (`genRef`) discard out-of-order responses from cancelled searches, preventing stale data from overwriting newer queries.
- **Duplicate Submission Prevention:** Form submission handlers lock submission state (`submitting` flag) during in-flight network requests, preventing rapid multi-clicks or duplicate submissions.
- **Same-Profile Re-Query Optimization:** Submitting the username already loaded on the dashboard refreshes active data in-place without triggering an unnecessary view unmount.
- **Granular 504 Timeout Error Recovery:** Dedicated HTTP 504 timeout error card with immediate "Retry search" action and one-click fallback to the `@cgupta21` showcase profile.

### Developer Profile Analytics
- Analyzes public GitHub user profiles, bios, follower ratios, and repository counts.
- Highlights active coding streaks, longest historical streaks, and total contributions.
- Calculates commit timing patterns by day-of-week and time-of-day from sampled commits.
- Clearly distinguishes between authenticated GraphQL calendar data and public-event estimates.

### Transparent Arsenic Developer Score
- Deterministic score out of 100 based on three core pillars:
  - **Consistency (40%):** Active contribution days, streak length, and commit regularity.
  - **Collaboration (35%):** Pull request authoring, review contributions, and issue resolutions.
  - **Impact (25%):** Repository stars, project volume, and multi-repository activity.
- Generates transparent breakdown cards explaining exactly how each score was calculated without opaque ratings.

### Repository Health & Code Volume
- Automatic repository health labels: `Active`, `Watch`, `Stale`, and `Archived`.
- Real-time client filtering by maintenance status and programming language.
- Language distribution analysis based on repository byte counts rather than superficial file counts.
- Graceful empty states when a developer profile has zero public repositories.

### Side-by-Side Developer Comparison
- Compare any two GitHub developers simultaneously via `/compare` or `/api/compare/:left/:right`.
- Parallel data fetching with automatic delta calculations across repos, stars, PRs, and scoring pillars.
- Visual bar comparisons and category winner badges.

### Deterministic Developer Summary Engine
- Generates a structured developer narrative directly from collected repository and activity metrics.
- Evaluates dominant language focus, workflow style, and repository maintenance habits.
- Runs entirely on local logic without external AI service dependencies, latency, or paid API keys.

### Sharing, SEO & Social Crawlers
- Pre-rendered Open Graph and Twitter Cards (`summary_large_image`) with exact 1200 × 630 px preview assets.
- Serverless crawler edge route (`/u/:username` rewritten to `api/meta/[username].js`) delivering profile-specific Open Graph and Twitter Card metadata to social bots without running the client-side SPA.
- Single-click export of developer share cards to high-resolution PNG and PDF formats.

### Session & Access Control Features
- **Stateless Encrypted Sessions (`iron-session`):** Authentication credentials and session states are sealed inside encrypted, HTTP-only, `SameSite=Lax` browser cookies with a 7-day TTL (`secure: true` in production). Sessions are destroyed immediately on sign-out (`Max-Age=0`).
- **Multi-Instance Ready without Redis:** Because session state is stored entirely client-side in encrypted cookies, horizontal scaling across multiple server instances or ephemeral serverless functions does **not** require Redis or a centralized session database. Any instance sharing the same `SESSION_SECRET` can decrypt and validate sessions.
- **Cookie-Based Guest Search Allowance:**
  - Anonymous visitors receive a quota of **three (3) distinct successful profile analyses** before being prompted to sign in with GitHub.
  - **Quota Preservation:**
    - **Repeated searches:** Viewing a profile already analyzed in the current session does not consume additional attempts.
    - **Failed requests:** 400 (invalid username), 404 (user not found), 429 (rate-limited), and 500 (upstream outage) errors never consume guest search attempts.
    - **Authenticated users:** Completely exempt with unlimited searches.
    - **Showcase profile:** The configured showcase account (`cgupta21`) is exempt from quota consumption.
  - **Cookie-Based Tracking & Limitations:** The guest allowance is tracked directly in the user's encrypted session cookie (`req.session.searchedProfiles`). It is not a centralized server-side counter or an abuse prevention boundary; visitors can reset their quota by clearing browser cookies, using private/incognito browsing, switching browsers, or accessing from a different device. The limit is intended as a frictionless onboarding guardrail to encourage GitHub sign-in, while backend abuse is mitigated by upstream GitHub IP rate limits and local rate limiters.
- **Strictly Read-Only OAuth Scopes:** Requests only `read:user user:email`. Zero repository write scopes, organization administration, or workflow permissions are requested.
- **No Persistent Storage:** Zero database connections, user profiles, or access tokens stored on disk.
- **Security Headers (Helmet & Vercel Edge):** Enforces Content-Security-Policy (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security` (HSTS).

---

## Challenges and What I Learned

### 1. Dual REST & GraphQL GitHub Integration with Resilient Rate Limiting
- **Challenge:** GitHub's unauthenticated REST API limits clients to only 60 requests per hour per IP address, while the GraphQL API requires authentication but provides rich one-year contribution calendars. When users browse unauthenticated, relying strictly on GraphQL would cause immediate failures.
- **Implementation & Learning:** Implemented a resilient hybrid data-fetching pipeline in `server/index.js`. When a server-side `GITHUB_TOKEN` or user OAuth session is present, Arsenic queries the GraphQL API for complete one-year contribution calendars and byte-level language statistics. When unauthenticated, the engine gracefully falls back to the public events feed (`/users/:username/events/public`), estimating recent activity signals (~90 days). I paired this with in-memory RAM caching (10-minute TTL) and in-flight request deduplication to prevent redundant calls and protect rate-limit quotas.

### 2. Encrypted-Cookie Sessions & Cookie-Based Guest Quotas
- **Challenge:** Preventing automated scraping and API abuse on the public web app while maintaining a frictionless onboarding experience for visitors who do not want to sign in immediately.
- **Implementation & Learning:** Implemented a stateless guest search allowance in `server/index.js` backed by encrypted client cookies via `iron-session`. Guests receive 3 distinct successful profile analyses before being prompted to sign in. Crucially, I engineered the middleware so that failed queries (e.g., 404 user not found or 400 invalid usernames) and repeated visits to already-analyzed profiles do not consume a guest's search credit, and the showcase account (`@cgupta21`) is exempt. For authenticated users, `iron-session` encrypts the GitHub access token inside an encrypted cookie, avoiding database connection latency, eliminating the need for a centralized session store (such as Redis) across serverless instances, and preventing access token leakage.

### 3. Hybrid Vercel Serverless Architecture & Standalone Express Execution
- **Challenge:** Single Page Applications deployed on serverless hosting often face cold starts, distinct routing rules between static assets and dynamic APIs, and volatile memory Lifecycles.
- **Implementation & Learning:** Structured the codebase so that thin serverless functions in `api/` act as adapters delegating incoming HTTP requests directly to the Express application exported from `server/index.js`. This allows the exact same business logic to run in Vercel's serverless environment or inside a traditional standalone Node/Express container (`npm start`). I also designed the in-memory RAM caches (`cache`, `summaryCache`) to acknowledge that serverless memory is container-scoped rather than globally shared across instances.

### 4. Social Crawler Edge Prerendering for Dynamic Profile Links
- **Challenge:** Client-side SPAs render empty HTML shells until JavaScript runs in the browser. Social media bots (Twitterbot, Discordbot, LinkedIn, Facebook) scraping shareable profile links (`/u/:username`) do not execute client JS and therefore receive a blank preview without user-specific titles, bios, or cards.
- **Implementation & Learning:** Configured an edge rewrite in `vercel.json` that inspects User-Agent headers for social crawlers. When a bot requests `/u/:username`, Vercel proxies the request directly to a dedicated serverless handler (`api/meta/[username].js`) that dynamically serves an HTML document containing profile-specific Open Graph and Twitter Card tags. Human visitors continue directly to the static client bundle cached on the global CDN.

### 5. Mobile Responsiveness & Canvas Export Reliability (PNG/PDF)
- **Challenge:** On mobile browsers, navigation elements overlapped, hamburger click handlers failed to open menus, and export actions failed or crashed tabs due to canvas tainting from cross-origin avatars and memory limits on high-DPI screens.
- **Implementation & Learning:** Refactored navigation to use semantic `<nav>` elements with ARIA attributes (`aria-expanded`, `aria-controls`), body scroll locking (`overflow: hidden`), and minimum 44 × 44 px touch targets. For card exports, added `crossOrigin="anonymous"` to user avatars to prevent CORS canvas tainting, awaited `document.fonts.ready` before rasterization, passed the canvas directly to `jsPDF` to avoid memory-heavy base64 string duplication, and integrated the native Web Share API (`navigator.share`) for smooth saving on iOS Safari and Android Chrome.

### 6. Security Hardening, Strict Input Validation & Comprehensive Testing
- **Challenge:** Protecting the application against parameter injection, cross-origin security violations, and iframe embedding without breaking GitHub user avatars or OAuth redirects.
- **Implementation & Learning:** Integrated Helmet middleware with a tailored Content Security Policy (allowing `https://avatars.githubusercontent.com` and blob/data URIs), enforced HSTS in production, and locked down framing policies. Standardized strict GitHub username validation via regex `/^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/`, returning HTTP 400 across all endpoints before calling upstream GitHub APIs. Backed the entire application with an automated test suite of 228 tests across 14 suites in Vitest.

### 7. High-Concurrency Dashboard Loading, Request Cancellation & Timeout Resilience
- **Challenge:** Fetching multiple upstream GitHub API endpoints sequentially (user profile, repository list, public event streams, and commit trees) introduced network waterfall delays. Slow upstream responses or network lag caused UI hanging, while rapid username searches caused out-of-order race conditions where stale data overwrote newer query results.
- **Implementation & Learning:** Re-architected both backend aggregation and frontend state management for high concurrency. On the server, `fetchPublicBundle` executes `/users`, `/repos`, and `/events/public` concurrently via `Promise.all`, and commit timing queries are capped to top 3 repositories raced against a 3.5s bounded timeout (`Promise.race`) so deep commit histories never block the main dashboard response. On the frontend, `useDashboard` wraps all requests in a standardized `request()` utility with an 18-second timeout, `AbortController` cancellation for in-flight requests on query change or unmount, request generation counters (`genRef`) to discard stale responses, duplicate-submission locking (`submitting` state), and dedicated HTTP 504 timeout recovery UI with instantaneous retry capabilities.

---

## Architecture

```text
               +-------------------------------------------------------+
               |                    Browser / Client                   |
               |          (React 18 + TypeScript + Vite + CSS)         |
               +---------------------------+---------------------------+
                                           |
                    +-----------------------+-----------------------+
                    |                                               |
       (API / Auth / Proxy)                             (Direct Crawler Hits)
                    v                                               v
+--------------------------------------+       +---------------------------------------+
|        Vercel Serverless Functions   |       |        Vercel Edge Rewrite            |
|       (api/* → Express app handler)  |       |      (has User-Agent: *bot*)          |
+------------------+-------------------+       +-------------------+-------------------+
                   |                                               |
                   | (Optional Standalone:                         v
                   |  node server/index.js)        +-----------------------------------+
                   |                               |      api/meta/[username].js       |
                   |                               |  (Pre-rendered OG/Twitter HTML)   |
                   |                               +-----------------------------------+
                   |
   +---------------+---------------+-------------------------------+
   |                               |                               |
   v                               v                               v
+--------------------+   +--------------------+          +--------------------+
|  GitHub REST API   |   | GitHub GraphQL API |          | Ephemeral In-Memory|
| (Events, Repos,    |   | (1-Yr Calendar,    |          | RAM Cache (Map)    |
|  Languages, Users) |   |  Private Counts)   |          | (Per-instance TTL) |
+--------------------+   +--------------------+          +--------------------+
```

### Architecture Overview & Runtime Environments

- **Vite & React Single Page Application:** The frontend is built with React 18, TypeScript, and Vite. It renders responsive developer telemetry, Recharts data visualizers, and interactive dashboard components styled with custom CSS variables.
- **Unified Full-Stack Deployment on Vercel:** Production hosting is powered entirely by Vercel as a unified full-stack application.
  - **Static Frontend SPA:** Built with Vite (`npm run build`) and distributed globally from `client/dist` across Vercel's edge CDN.
  - **Dynamic Backend Serverless Functions:** All API requests (`/api/*`), OAuth flows (`/auth/*`), and social crawler previews (`/u/:username`) are executed natively on Vercel via serverless function adapters in `api/` (such as `api/[...path].js`, `api/dashboard/[username].js`, `api/compare/[left]/[right].js`, `api/auth/...`, and `api/meta/[username].js`). These functions delegate incoming requests into the core Express application.
  - **No Separate Backend Required:** The live site is completely self-contained on Vercel. A separate backend host (such as Render or a dedicated VM) is **not required** for production operation.
- **Edge Rewrites (`vercel.json`):**
  - `/auth/github` → `/api/auth/github` (GitHub OAuth initiation)
  - `/auth/github/callback` → `/api/auth/github/callback` (GitHub OAuth callback)
  - `/auth/google` → `/api/auth/google` (Google OAuth initiation)
  - `/auth/google/callback` → `/api/auth/google/callback` (Google OAuth callback)
  - `/auth/logout` → `/api/auth/logout` (session revocation)
  - `/u/:username` (when requested by social crawlers/bots) → `/api/meta/:username` (lightweight Open Graph & Twitter Card HTML)
  - `/api/*` → serverless function handlers in `api/`
  - SPA Catch-All (`/((?!api|auth|assets|.*\.[^/]+$).*)`) → `/index.html` (client-side React router)
- **Optional Alternative: Standalone Node.js/Express Deployment:**
  - `server/index.js` includes a standalone server listener (`if (process.env.VERCEL !== '1') app.listen(PORT)`).
  - Can be run locally via `npm run dev` (concurrent Vite + Express) or `npm start`.
  - Can optionally be built and deployed as a persistent container using the included multi-stage [`Dockerfile`](Dockerfile) (targeting `node:22-alpine` with build and runtime stages) or deployed to container services like Render using the included [`render.yaml`](render.yaml) specification. This is an optional alternative deployment model, not a dependency for the live site.
- **Stateless Sessions vs. In-Memory Caching Realities:**
  - **Stateless Encrypted Sessions (`iron-session`):** User authentication and guest search counters are sealed using AES-256-GCM encryption in an HTTP-only browser cookie (`session`). Sessions are completely stateless on the server, meaning all Vercel serverless function invocations across cold starts and regions decrypt sessions identically without requiring a database or Redis.
  - **In-Memory Cache Realities (`cache`, `inflight`, `summaryCache`):** In-memory JavaScript `Map` data structures provide best-effort performance caching per warm serverless container. Caches are not shared globally between parallel instances or across cold starts; when an instance restarts or scales to zero, data is refetched from GitHub. This reduces upstream API traffic on warm instances without breaking application functionality or user sessions.

### Repository & Project Structure

```text
Arsenic/
├── .github/workflows/         # CI/CD workflows (lint, test, build pipeline)
├── api/                       # Vercel serverless function entry points & adapters
│   ├── auth/                  # GitHub & Google OAuth serverless handlers
│   ├── compare/               # Side-by-side comparison serverless handler
│   ├── dashboard/             # Dashboard telemetry serverless handler
│   ├── meta/                  # Social crawler edge prerender handler (OG/Twitter HTML)
│   └── summary/               # Deterministic developer narrative serverless handler
├── client/                    # Vite + React 18 single page application
│   ├── public/                # Favicon and client static assets
│   ├── src/
│   │   ├── components/        # UI components (DeveloperIntelligenceOverview, LandingPage, etc.)
│   │   ├── hooks/             # Custom React hooks (useDashboard with timeout & abort control)
│   │   ├── lib/               # Deterministic scoring algorithms, analytics, and date helpers
│   │   ├── types/             # TypeScript interface definitions
│   │   ├── App.tsx            # Main application router and view controller
│   │   └── styles.css         # Curated theme styling, tokens, and responsive utilities
│   └── index.html             # Client HTML entry
├── docs/                      # Documentation and visual portfolio assets
│   ├── screenshots/           # Application screenshots (landing, dashboard, compare, heatmap)
│   └── social-preview.png     # Open Graph preview asset (1200 × 630 px)
├── public/                    # Static public assets (favicons, manifests, branding)
├── server/
│   └── index.js               # Core Express application (data aggregation, caching, sessions)
├── shared/
│   └── validation.js          # Shared GitHub username regex validation
├── tests/                     # 14 Vitest automated test suites (228 tests)
├── Dockerfile                 # Multi-stage production container build
├── render.yaml                # Persistent container deployment specification
└── vercel.json                # Vercel routing, CSP edge headers, and serverless rewrites
```

---

## Deployment

The live production application is deployed on Vercel at:

> **Production URL:** [https://arsenic-rho.vercel.app/](https://arsenic-rho.vercel.app/)

### 1. Primary Production Deployment: Vercel Full-Stack Serverless
- **Self-Contained Deployment:** Both the Vite frontend and Express serverless functions run directly on Vercel under a single project domain.
- **Frontend Delivery:** Static assets are built (`npm run build`) and served from `client/dist` via Vercel's global CDN edge network.
- **API & OAuth Routing:** Serverless function adapters in `api/` handle all dynamic requests and delegate them into the Express app exported from `server/index.js`.
- **Edge Rewrites:** `vercel.json` provides edge rewrites for OAuth endpoints, social crawler metadata, and SPA navigation.
- **Separate Backend Required?** **No.** The live production site does not depend on Render, AWS, or any external backend server.

### 2. Optional Alternative Deployment: Standalone Express / Docker
- **Local & VM Execution:** The application can run as a traditional long-running Node/Express server via `npm start`, listening on port `5000` (or the configured `PORT`).
- **Docker Containerization:** A multi-stage [`Dockerfile`](Dockerfile) is provided in the repository. It builds the Vite frontend in stage 1 (`node:22-alpine`) and packages the Express server with production dependencies and static assets in stage 2.
- **Render Web Service Blueprint:** An optional [`render.yaml`](render.yaml) blueprint is included for deploying Arsenic as a persistent container service with health checks at `/api/health`.

### 3. Vercel Production Environment Variables
Configure the following environment variables in your Vercel Dashboard under **Project Settings → Environment Variables** (target: **Production**):

| Variable | Required? | Production Value / Description |
|:---|:---:|:---|
| `SESSION_SECRET` | **Required** | 32+ character cryptographically random string for `iron-session` AES-256-GCM cookie encryption.<br>Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GITHUB_TOKEN` | **Strongly Recommended** | GitHub Personal Access Token (classic with `read:user` or fine-grained public repo access). Unlocks 5,000 req/hr rate limit pool and GraphQL contribution calendars. If omitted, unauthenticated serverless functions share outbound IPs with a 60 req/hr limit. |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth App Client ID (enables "Sign in with GitHub"). |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth App Client Secret. |
| `GITHUB_CALLBACK_URL` | Optional | `https://arsenic-rho.vercel.app/auth/github/callback` (Must match registered GitHub OAuth App callback URL). |
| `GOOGLE_CLIENT_ID` | Optional | Google Cloud OAuth 2.0 Client ID (enables "Sign in with Google"). |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Cloud OAuth 2.0 Client Secret. |
| `GOOGLE_CALLBACK_URL` | Optional | `https://arsenic-rho.vercel.app/auth/google/callback` (Must match registered Google Cloud authorized redirect URI). |
| `CLIENT_ORIGIN` | Optional | `https://arsenic-rho.vercel.app` (CORS and post-login redirect origin). |
| `TRUST_PROXY` | Optional | `1` (Ensures secure cookie handling and client IP rate limiting behind reverse proxies). |

### 4. OAuth Application Setup Guide

#### GitHub OAuth App Setup
In **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**:
- **Application name:** `Arsenic`
- **Homepage URL:** `https://arsenic-rho.vercel.app/` (or local `http://127.0.0.1:5173`)
- **Authorization callback URL:** `https://arsenic-rho.vercel.app/auth/github/callback` (or local `http://127.0.0.1:5000/auth/github/callback`)
- Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` in Vercel.

#### Google Cloud OAuth 2.0 Setup
In **Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID** (Web application):
- **Name:** `Arsenic`
- **Authorised JavaScript origins:** `https://arsenic-rho.vercel.app` (or local `http://127.0.0.1:5173`, `http://localhost:5173`)
- **Authorised redirect URIs:** `https://arsenic-rho.vercel.app/auth/google/callback` (or local `http://127.0.0.1:5000/auth/google/callback`)
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in Vercel.

---

## Security

- **Credential Hygiene & Secret Isolation:**
  - Keep `.env` and all files containing real credentials out of version control. The repository ignores `.env` and `.env.*` in `.gitignore`. Commit only safe placeholders in `.env.example`.
  - Never expose GitHub Personal Access Tokens or OAuth client secrets in browser code. All upstream GitHub API and Google OAuth communications are proxied strictly through server-side functions.
- **Encrypted Stateless Sessions (`iron-session`):**
  - Authentication sessions and guest quota tracking are sealed using AES-256-GCM encryption with HMAC-SHA256 authentication via `iron-session` and stored in client-side HTTP-only cookies (`cookieName: 'session'`, `SameSite=Lax`, `secure: true` in production, 7-day TTL).
  - **Serverless Multi-Region Compatibility:** Server-side session storage (such as Redis or database tables) is **not required**. Because session state is encrypted on the client and decrypted on demand, any Vercel serverless function or container instance sharing the same `SESSION_SECRET` validates sessions identically across cold starts, auto-scaling events, and differing edge regions.
  - **Cookie Size & Payload Footprint:** The encrypted session payload contains only essential identity metadata (`user: { id, login, name, avatar, provider }`) and guest search history (`searchedProfiles: string[]`), totaling ~250–350 bytes. This is well below the standard 4,096-byte browser cookie limit.
  - **Secret Hygiene & Rotation:** Set a strong, random `SESSION_SECRET` of at least 32 characters in production. Rotating or changing `SESSION_SECRET` immediately invalidates existing user sessions, requiring re-authentication.
- **OAuth CSRF State Dual Persistence:**
  - The OAuth initiation handler generates a 48-character cryptographically random `state` nonce, signs it with an HMAC-SHA256 signature using `SESSION_SECRET`, and sets it in an HTTP-only `oauth_state` cookie (`SameSite=Lax`, `Max-Age=600`, `Secure` in production).
  - As a defensive fallback for browsers or proxy configurations that restrict transient cookies during cross-site OAuth redirects, the state is also sealed into `req.session.oauthState`.
  - The callback handler verifies the HMAC signature or session state before exchanging the authorization code, preventing CSRF attacks while ensuring reliable login completion across all serverless invocations. Both tokens are cleared immediately upon validation.
- **In-Memory Caching vs. Distributed Store Trade-offs:**
  - Arsenic uses in-memory JavaScript `Map` data structures (`cache`, `inflight`, `summaryCache`) with a 10-minute TTL.
  - **Serverless Instance Realities:** On Vercel, in-memory caches and rate limiters (`express-rate-limit`) are scoped to individual warm container instances. They are not shared across parallel serverless functions, different geographical edge regions, or across cold starts.
  - **Why Sessions & Features Do Not Break:** Unlike session state (which is sealed client-side in `iron-session`), cache misses simply trigger a fresh upstream fetch from GitHub. In-memory caching serves purely as a best-effort performance optimization to reduce upstream GitHub API traffic on warm containers.
  - **Evaluation of Upstash Redis / Vercel KV:** Upstash Redis or Vercel KV could provide globally synchronized cross-container caching and distributed rate limiting. However, requiring managed Redis introduces external cloud dependencies, billing overhead, and operational complexity. Arsenic intentionally avoids mandatory database infrastructure to keep the application self-contained, zero-cost, and effortless to deploy.
- **Comprehensive Content Security Policy (CSP) Audit:**
  - Arsenic enforces a strict, restrictive CSP at both the Vercel edge (`vercel.json`) and Express application layer (`server/index.js` via Helmet):
    - `default-src 'self'`: Restricts resource loading to the application origin by default.
    - `script-src 'self'`: All frontend components, charts, and export utilities are bundled locally into `client/dist` by Vite. Zero external CDN scripts (such as unpkg, cdnjs, or jsdelivr) are loaded.
    - `style-src 'self' 'unsafe-inline'`: Permits locally bundled CSS styles and dynamic inline styles injected by Recharts components.
    - `font-src 'self' data:`: Arsenic utilizes modern native system font stacks (`ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif` and `ui-monospace, SFMono-Regular, monospace`). No remote requests to Google Fonts or third-party font CDNs are executed.
    - `img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com`: Whitelists local images, base64 data URIs, canvas object blobs generated during card exports, GitHub avatars (`avatars.githubusercontent.com`), and Google user profile pictures (`lh3.googleusercontent.com`).
    - `connect-src 'self'`: All client-side `fetch()` calls target local API routes (`/api/*`, `/auth/*`). Upstream GitHub REST/GraphQL and Google OAuth APIs are called exclusively on the server.
    - `form-action 'self' https://github.com https://accounts.google.com`: Restricts form submissions and OAuth login redirects to authenticated identity providers.
    - `frame-ancestors 'self'`: Protects against clickjacking by preventing external iframe embedding.
    - `object-src 'none'`: Disables legacy browser plugins (Flash, Java).
    - `base-uri 'self'`: Enforces base URL integrity.
- **How to Verify CSP in Browser DevTools:**
  1. Open the live deployment at [https://arsenic-rho.vercel.app](https://arsenic-rho.vercel.app/) in Chrome, Edge, or Firefox.
  2. Press `F12` (or right-click and select **Inspect**) to open Developer Tools.
  3. Navigate to the **Console** tab: confirm that zero CSP violation warnings (e.g., `Refused to load... because it violates the following Content Security Policy directive`) appear during initial load, search, or comparison.
  4. Navigate to the **Network** tab, reload the page, select the root document request (`arsenic-rho.vercel.app`), and inspect **Response Headers** to confirm the `content-security-policy` header is active.
  5. Search any profile (e.g. `@cgupta21`), open the developer card, and click **PNG Export** and **PDF Export**. Confirm that client-side rasterization completes and downloads cleanly without triggering CSP blocks on `blob:` or `data:` image generation.
- **Input Sanitization & Username Validation:**
  - Strict regex validation with pattern `/^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/` is enforced across all API routes (`/api/dashboard/:username`, `/api/summary/:username`, `/api/compare/:left/:right`, `/api/meta/:username`) before querying upstream GitHub services. Invalid usernames immediately return HTTP 400 and do not consume guest search quota.

---

## Technology Stack

| Category | Technologies Used | Purpose |
|:---|:---|:---|
| **Frontend Core** | React 18, TypeScript, Vite 6 | Fast, type-safe single page application |
| **Data Visualization** | Recharts, Custom CSS/SVG | Heatmaps, trend curves, and timing patterns |
| **Icons & Styling** | Lucide React, Vanilla CSS | Lightweight UI without Tailwind overhead |
| **Export Engines** | html2canvas, jsPDF | Client-side PNG and vector PDF report generation |
| **Backend Runtime** | Node.js, Express | API orchestration, caching, and rate limiting (used by Vercel serverless functions and local dev) |
| **Session & Auth** | iron-session, jose | Sealed encrypted cookies for authentication, Google ID token verification, and guest quota tracking without Redis |
| **Security Headers** | Helmet, CORS | Secure HTTP headers (CSP, HSTS, X-Frame-Options) and origin enforcement |
| **External APIs** | GitHub REST API, GitHub GraphQL | Raw developer telemetry and contribution calendars |
| **Testing Suite** | Vitest 5, TypeScript compiler | Unit, integration, and accessibility test suite |
| **Hosting & CI** | Vercel, GitHub Actions | Automated lint/test/build pipeline and edge hosting |

---

## Getting Started

### Prerequisites
- Node.js 20 or higher
- npm 10 or higher
- A GitHub Personal Access Token (for local authenticated rate limits)

### 1. Clone the repository
```bash
git clone https://github.com/cgupta21/Arsenic.git
cd Arsenic
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure local environment variables
Create a `.env` file in the root directory by copying the example template:
```bash
cp .env.example .env
```
> **Security Notice:** `.env` is ignored by Git in `.gitignore` and must **never** be committed to the repository. The template `.env.example` contains only safe placeholder values.

#### Environment Variables Reference

| Variable | Required? | Default / Example | Purpose & Behavior if Absent |
|:---|:---:|:---|:---|
| `SESSION_SECRET` | **Required in Prod**<br>*(Optional in Dev)* | `change-this-secret` | 32+ character random string used by `iron-session` to encrypt session cookies.<br>• **If absent in production (`NODE_ENV=production`) or <32 chars:** Application logs an error and uses an unsafe fallback.<br>• **Safe generation:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GITHUB_TOKEN` | **Recommended in Prod**<br>*(Optional in Dev)* | *(Empty)* | GitHub Personal Access Token (classic with `read:user` or fine-grained public repository access).<br>• **Local Development:** Optional. If omitted, Arsenic operates in **Public API Mode**, gracefully estimating recent activity (~90 days / up to 300 events) via public REST endpoints subject to GitHub's unauthenticated 60 req/hr per-IP limit.<br>• **Production Demo (Vercel):** Strongly recommended / required. Unauthenticated serverless requests share outbound IP pools and rapidly trigger GitHub's 60 req/hr rate limit (HTTP 403/429). Setting `GITHUB_TOKEN` unlocks a 5,000 req/hr rate limit pool and enables GitHub GraphQL queries for full 1-year contribution heatmaps and exact repository byte breakdowns.<br>• **Vercel Setup:** Add `GITHUB_TOKEN` under **Project Settings → Environment Variables** for the **Production** environment. |
| `GITHUB_CLIENT_ID` | Optional | *(Empty)* | GitHub OAuth App Client ID.<br>• **If absent:** "Sign in with GitHub" is disabled. Visiting `/auth/github` returns HTTP 503 (`GitHub sign-in is not configured on this server.`). Public profile analytics, comparisons, deterministic summaries, and card exports remain fully accessible without sign-in. |
| `GITHUB_CLIENT_SECRET` | Optional | *(Empty)* | GitHub OAuth App Client Secret.<br>• Must be paired with `GITHUB_CLIENT_ID`. If either is missing, OAuth sign-in is disabled. |
| `GITHUB_CALLBACK_URL` | Optional | `http://127.0.0.1:5000/auth/github/callback` | OAuth redirect URI registered in your GitHub OAuth App settings.<br>• In production on Vercel, set to `https://arsenic-rho.vercel.app/auth/github/callback` (or your custom domain equivalent). Must match the Authorization Callback URL in GitHub Developer Settings. |
| `GOOGLE_CLIENT_ID` | Optional | *(Empty)* | Google Cloud OAuth 2.0 Client ID.<br>• **If absent:** "Sign in with Google" is disabled on the registration page. Public profile analytics and guest mode remain fully functional. |
| `GOOGLE_CLIENT_SECRET` | Optional | *(Empty)* | Google Cloud OAuth 2.0 Client Secret.<br>• Must be paired with `GOOGLE_CLIENT_ID`. |
| `GOOGLE_CALLBACK_URL` | Optional | `http://127.0.0.1:5000/auth/google/callback` | OAuth redirect URI registered in Google Cloud Console Credentials.<br>• In production on Vercel, set to `https://arsenic-rho.vercel.app/auth/google/callback` (or your custom domain equivalent). |
| `CLIENT_ORIGIN` | Optional | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated list of allowed CORS origins for the Express server. |
| `PORT` | Optional | `5000` | Port for the standalone Node/Express server in local development or container deployments (ignored by Vercel serverless execution). |
| `CACHE_TTL_SECONDS` | Optional | `600` | In-memory RAM cache duration in seconds (10 minutes, enforced minimum 60s) for profile data. |
| `SUMMARY_LIMIT_PER_10_MIN` | Optional | `5` | Rate limit ceiling for deterministic developer summary generations per IP within a 10-minute window. |
| `SUMMARY_DAILY_CAP` | Optional | `200` | Maximum number of developer summaries generated server-wide per day. |
| `TRUST_PROXY` | Optional | `1` *(in prod)* | Express `trust proxy` setting for deployments behind reverse proxies (Vercel, Render, Railway, Fly), ensuring secure cookies and client IP rate limiting function properly. |
| `NODE_ENV` | Optional | `development` | Setting to `production` enables secure cookies (`secure: true`), strict HSTS headers, and enforces `SESSION_SECRET` randomness validation. |

### 4. Start the development server
```bash
npm run dev
```
This concurrently boots the Express backend on port `5000` and the Vite development server on `http://127.0.0.1:5173`.

---

## Testing & Quality Assurance

Arsenic maintains a test suite executed via [Vitest](https://vitest.dev/). Tests run in Node.js and validate end-to-end API logic, scoring formulas, authentication state machines, accessibility standards, and responsive layout rules.

### Running Tests and Verification Checks

```bash
# Run the complete test suite once
npm test

# Run tests in watch mode during development
npm run test:watch

# Run TypeScript type-checking without emitting files
npm run typecheck

# Run ESLint across all source and test files
npm run lint

# Run all checks sequentially (typecheck -> lint -> test)
npm run check

# Verify production bundle compilation
npm run build
```

### What the Existing Tests Cover

The project contains **14 automated test files with 228 passing tests**:

| Test Suite | File | Tests | Key Behaviors Verified |
|:---|:---|:---:|:---|
| **Landing & Registration** | [`tests/landingAndRegistration.test.ts`](tests/landingAndRegistration.test.ts) | 28 | Landing page feature showcases, guest search flow, register page OAuth buttons, error handling, and responsive navigation. |
| **Google Authentication** | [`tests/googleAuth.test.ts`](tests/googleAuth.test.ts) | 27 | Google OAuth 2.0 PKCE flow, Google ID token verification, session persistence, non-destructive coexistence with GitHub sessions, and error handling. |
| **OAuth State & Session Flow** | [`tests/oauthStateFlow.test.ts`](tests/oauthStateFlow.test.ts) | 26 | Dual state persistence (`oauth_state` cookie + session), HMAC signature validation, post-login dashboard redirect, and host resolution. |
| **Security Hardening** | [`tests/securityHardening.test.ts`](tests/securityHardening.test.ts) | 26 | Helmet security headers, tailored Content Security Policy (CSP), Vercel edge configuration, strict GitHub username regex validation, crawler 400 security headers, and direct canvas-to-jsPDF embedding. |
| **Mobile Nav & Header** | [`tests/mobileNav.test.ts`](tests/mobileNav.test.ts) | 25 | Semantic `<nav>`, `aria-expanded` and `aria-controls` bindings, mobile touch targets ($\ge 44\text{px}$), body scroll lock, Escape key dismiss, and responsive layout rules. |
| **Website Improvements** | [`tests/websiteImprovements.test.ts`](tests/websiteImprovements.test.ts) | 21 | Open Graph / Twitter Card tags, exact 1200 × 630 px preview image binary dimensions, crawler edge rewrites, read-only OAuth scopes, privacy disclosures, and Scenarios A–E error UI. |
| **Developer Intelligence Overview** | [`tests/developerIntelligenceOverview.test.ts`](tests/developerIntelligenceOverview.test.ts) | 19 | Live overview card rendering, health grade thresholds (Excellent/Strong/Moderate/Developing/Low), 4-week commit trend calculation, PR velocity, 64-day density matrix formatting, language bar, and section navigation anchors. |
| **Streak Algorithms** | [`tests/streaks.test.ts`](tests/streaks.test.ts) | 18 | Daily contribution streak algorithms, leap year calculations, timezone offsets, weekend gaps, and active day counting. |
| **Loading, Timeouts & Resilience** | [`tests/loadingAndTimeout.test.ts`](tests/loadingAndTimeout.test.ts) | 9 | Request timeouts, AbortController cancellation on input change/unmount, duplicate-submission lock, HTTP 504 timeout error mapping, retry handlers, and parallel API bundle fetching. |
| **Guest Search Limits** | [`tests/searchLimit.test.ts`](tests/searchLimit.test.ts) | 8 | Guest quota enforcement (3 free distinct profile searches), cookie-based tracking, and verification that 400/404 errors do not consume credits. |
| **Session & Logout** | [`tests/logout.test.ts`](tests/logout.test.ts) | 7 | Session termination on `POST /auth/logout`, cookie invalidation (`Max-Age=0`), cache-control headers, and session destruction. |
| **Analytics & Scoring** | [`tests/analytics.test.ts`](tests/analytics.test.ts) | 6 | Score calculation weighting (Consistency, Collaboration, Impact), normalization to 100, and repository health status rules. |
| **Developer Comparison** | [`tests/compare.test.ts`](tests/compare.test.ts) | 6 | Side-by-side comparison API endpoint, parallel developer fetching, delta calculations, and 400 validation for invalid names. |
| **Authentication Errors** | [`tests/authError.test.tsx`](tests/authError.test.tsx) | 2 | Client request wrapper capturing 401 token expiration and attaching `authError: true` to trigger appropriate re-authentication UI. |

> **Note on Quality Assurance:** Arsenic executes 228 unit and integration tests across 14 suites on every commit and pull request via GitHub Actions (`npm run check`).

---

## API Reference

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/health` | Service health status check. |
| `GET` | `/api/dashboard/:username` | Returns aggregated developer telemetry, repositories, contribution calendar, and score. |
| `GET` | `/api/compare/:left/:right` | Returns side-by-side comparison metrics and delta benchmarks for two developers. |
| `POST` | `/api/summary/:username` | Generates a deterministic developer summary narrative without third-party AI APIs. |
| `GET` | `/api/meta/:username` | Returns crawler-optimized HTML with Open Graph and Twitter Cards for social bots. |
| `GET` | `/api/me` | Returns the currently authenticated user session (GitHub or Google), or guest state. |
| `GET` | `/auth/github` | Initiates GitHub OAuth authentication with read-only scopes. |
| `GET` | `/auth/github/callback` | GitHub OAuth redirect callback handler; sets sealed encrypted session cookie. |
| `GET` | `/auth/google` | Initiates Google Cloud OAuth 2.0 authentication. |
| `GET` | `/auth/google/callback` | Google OAuth redirect callback handler; verifies Google ID token and sets session cookie. |
| `POST` | `/auth/logout` | Destroys current session and expires cookie with `Max-Age=0`. |

---

## GitHub Data, Limitations & Privacy

- **Public Event Estimation:** When queried without an authenticated session, activity statistics are estimated from GitHub's public events API (~last 90 days or up to 300 events). Private contributions, older activity, and web-only edits may be omitted.
- **Deterministic Summaries:** The developer summary engine runs deterministic rule-based algorithms directly on gathered data. It does not send user data to third-party generative AI models.
- **Rate Limit Transparency:** Unauthenticated guest queries share IP pools limited to 60 requests/hour by GitHub. Authenticating via GitHub increases this limit to 5,000 requests/hour.
- **Zero Persistent Storage:** Arsenic does not maintain a database. User profiles, tokens, and telemetry are never written to disk or shared with external analytics services.

### Rate Limiting and Caching

- **General API Limiter (`/api/`):**
  - Configured with `express-rate-limit`. Defaults to **90 requests per minute** (60,000 ms window) per IP address (`standardHeaders: 'draft-8'`, `legacyHeaders: false`).
- **Developer Summary Endpoint Limiter (`/api/summary/:username`):**
  - Summary generations are limited to **5 requests per 10 minutes** per IP by default (`windowMs: 10 * 60,000`).
  - Configurable via the `SUMMARY_LIMIT_PER_10_MIN` environment variable.
- **Deterministic Summary Daily Cap:**
  - Overall server-wide daily summary generations default to a cap of **200 per day** (`SUMMARY_DAILY_CAP`).
  - Tracked via in-memory state (`summaryDay`, `summaryCount`).
  - **Cached Responses Bypass Daily Cap:** When a summary is requested, `summaryCache` (1-hour TTL) is checked *first*. If a valid cached summary exists, it is returned immediately with `{ cached: true }` *before* the daily summary cap is evaluated. Consequently, cached hits do not increment the daily generation counter (`summaryCount`) and are never blocked when the cap is reached.
- **In-Memory State & Serverless Execution:**
  - Arsenic's daily summary counter and caches (`summaryCache`, `cache`, `inflight`) utilize in-memory JavaScript state.
  - The default `express-rate-limit` store is instance-local (`MemoryStore`).
  - On Vercel serverless, memory is scoped strictly to an individual warm container instance. State is **not shared globally** between parallel serverless function invocations, differing edge regions, or across cold starts. Counters and in-memory caches may reset whenever an instance restarts or scales to zero.
  - In a standalone Node/Express container (`npm start`), memory persists across requests for the lifetime of that single process.
- **Guest Search Allowance & Cookie-Based Tracking:**
  - Anonymous visitors receive 3 free distinct profile searches, tracked directly within the client's encrypted session cookie (`req.session.searchedProfiles` and `req.session.guestSearches`).
  - **Limitations of Cookie-Based Tracking:** Because this allowance is held within the sealed browser session cookie rather than a centralized server-side database, the allowance is tied to the client's current browser session. A visitor using private/incognito browsing, switching to another browser, accessing from another device, or clearing browser cookies receives a fresh session cookie with a renewed 3-search allowance. The allowance is an onboarding UX guardrail to encourage GitHub OAuth sign-in, not an adversarial anti-scraping boundary. Upstream GitHub rate limits (60 req/hr unauthenticated IP pool) and local IP rate limits protect backend resources.
- **Distinction Between Best-Effort Limits & Globally Enforced Quotas:**
  - All rate limiting, daily summary caps, in-memory caches, and guest search limits in Arsenic operate as **per-instance, best-effort guardrails**.
  - Enforcing globally synchronized rate limits, persistent multi-region caching, or tamper-proof global guest quotas would require shared distributed infrastructure (such as a managed Redis cluster or external database). Arsenic intentionally avoids introducing Redis or third-party databases to keep the project completely lightweight, self-contained, zero-cost, and effortless to deploy.

---

## Roadmap

The following enhancements are planned or currently under consideration:

- [ ] **Advanced Pull Request & Review Analytics** *(Planned)*: Detailed PR turnaround times, review participation ratios, and code review cadence signals.
- [ ] **Organization & Team-Level Dashboards** *(Under Consideration)*: Aggregating developer intelligence across multi-repository GitHub organizations to visualize collective engineering velocity.
- [ ] **Optional Persistent Storage** *(Planned)*: Opt-in persistent database storage allowing users to save historical trend snapshots and monitor changes over time.
- [ ] **Multi-Developer Comparisons (3+ Profiles)** *(Under Consideration)*: Benchmarking entire teams or candidate cohorts simultaneously.
- [ ] **Automated CI/CD Reporting Webhooks** *(Under Consideration)*: Generating periodic summary cards sent directly to Slack or email.

---

## Author & Project Links

- **Developer:** [Chandan Kumar Gupta](https://github.com/cgupta21)
- **GitHub Profile:** [https://github.com/cgupta21](https://github.com/cgupta21)
- **Project Repository:** [https://github.com/cgupta21/Arsenic](https://github.com/cgupta21/Arsenic)
- **Live Application:** [https://arsenic-rho.vercel.app](https://arsenic-rho.vercel.app/)

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
