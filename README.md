# Arsenic — GitHub Developer Intelligence Dashboard

**Turning GitHub activity into transparent developer insights, repository signals, and side-by-side engineering benchmarks.**

Arsenic is a developer intelligence dashboard that analyzes GitHub profiles, repository health, contribution velocity, coding consistency, collaboration habits, and code volume. It translates raw GitHub API telemetry into actionable visualizations, helping developers and engineering teams understand their real-world development patterns.

<p align="center">
  <a href="https://github.com/cgupta21/Arsenic/actions/workflows/ci.yml">
    <img src="https://github.com/cgupta21/Arsenic/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://arsenic-rho.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-arsenic--rho.vercel.app-C96A45?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo">
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

## Why I Built This

Standard GitHub profile pages do a great job highlighting pinned repositories and basic contribution green-squares. However, they leave much of an engineer's day-to-day story fragmented across disparate commits, pull requests, issue threads, and release histories. Furthermore, standard contribution graphs treat a one-line typo fix identically to a complex multi-file pull request.

I built Arsenic to explore GitHub developer activity through a unified, intelligence-driven perspective. My goal was to create a focused dashboard that accomplishes four things:

1. **Synthesize Meaningful Developer Signals:** Translate raw public events and GraphQL metrics into transparent indicators for consistency, collaboration, and code volume.
2. **Evaluate Repository Health Beyond Stars:** Surface actionable repository indicators—such as active vs. stale maintenance cycles, issue-to-PR closure ratios, and language code-volume breakdowns—rather than relying solely on star counts.
3. **Enable Objective Developer Comparisons:** Provide side-by-side benchmarking between developers to compare contribution cadence, language diversity, and repository velocity across projects.
4. **Produce Clean, Shareable Portfolio Artifacts:** Generate exportable developer summary cards and crawler-optimized profile links suitable for resumes, portfolios, and technical interviews.

Above all, I wanted the dashboard to remain fast, privacy-focused, and deterministic—delivering valuable insights without calling expensive third-party AI APIs or requesting intrusive OAuth write permissions.

---

## Showcase

### Main Dashboard Overview
Comprehensive developer analytics displaying core profile metadata, annual contribution volume, current contribution streak, star totals, and transparent Arsenic scoring.

![Arsenic Dashboard Overview](docs/screenshots/dashboard-overview.png)

### Contribution Signal & Code Distribution
Interactive contribution heatmap, 8-week activity trend curve, commit timing patterns (by day and hour), and detected programming language mix.

![Contribution Heatmap and Activity Signals](docs/screenshots/contribution-heatmap.png)

### Side-by-Side Developer Comparison
Real-time comparison contrasting two developers across repository velocity, contribution volume, consistency, collaboration, and impact scores.

![Side-by-Side Developer Comparison](docs/screenshots/developer-comparison.png)

### Exportable Profile Share Card
Clean, branded summary card designed for portfolio integration, technical interviews, and PDF/PNG exports.

![Arsenic Share Card](docs/screenshots/share-card.png)

---

## Features

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
- Serverless crawler edge rewrites delivering profile-specific meta tags (`/u/:username`) to bots without client JS execution.
- Single-click export of developer share cards to high-resolution PNG and PDF formats.

### Security & Privacy Transparency
- Strictly read-only GitHub OAuth permissions (`read:user user:email`).
- Zero repository write scopes, administrative privileges, or organization access requested.
- Sealed, encrypted HTTP-only cookies (`iron-session`) with 7-day TTL; destroyed immediately on sign-out.
- No persistent database storing tokens or personal information; zero third-party telemetry or ad tracking.

---

## Challenges and What I Learned

### 1. Dual REST & GraphQL GitHub Integration with Resilient Rate Limiting
- **Challenge:** GitHub's unauthenticated REST API limits clients to only 60 requests per hour per IP address, while the GraphQL API requires authentication but provides rich one-year contribution calendars. When users browse unauthenticated, relying strictly on GraphQL would cause immediate failures.
- **Implementation & Learning:** Implemented a resilient hybrid data-fetching pipeline in `server/index.js`. When a server-side `GITHUB_TOKEN` or user OAuth session is present, Arsenic queries the GraphQL API for complete one-year contribution calendars and byte-level language statistics. When unauthenticated, the engine gracefully falls back to the public events feed (`/users/:username/events/public`), estimating recent activity signals (~90 days). I paired this with in-memory RAM caching (10-minute TTL) and in-flight request deduplication to prevent redundant calls and protect rate-limit quotas.

### 2. Designing Intuitive Developer Visualizations & Deterministic Scoring
- **Challenge:** Presenting multidimensional developer telemetry (streaks, commit timing distributions, language volumes, and repository health) without overwhelming the user or producing misleading scores on sparse accounts.
- **Implementation & Learning:** Built custom SVG and Recharts visualizations that gracefully handle sparse data without layout shifting. Instead of generating arbitrary or subjective "AI scores", I designed an open, deterministic mathematical formula in `shared/score.js` that weights Consistency, Collaboration, and Impact out of 100. I learned how to normalize metrics using logarithmic dampening so that high-activity outliers do not break the visual scale for typical developers.

### 3. Implementing Unauthenticated Guest Quotas with Secure Stateless Auth
- **Challenge:** Preventing automated scraping and API abuse on the public web app while maintaining a frictionless onboarding experience for visitors who do not want to sign in immediately.
- **Implementation & Learning:** Implemented an IP-aware guest search counter in `server/index.js` backed by an in-memory session store (`memorystore`). Guests receive 5 free in-depth analyses before being prompted to sign in. Crucially, I engineered the middleware so that failed queries (e.g., 404 user not found or 400 invalid usernames) do not consume a guest's search credit. For authenticated users, I used `iron-session` to encrypt sessions inside a tamper-proof cookie, avoiding database connection latency and security risks associated with storing access tokens on a server.

### 4. Responsive Mobile Navigation & Accessibility Engineering
- **Challenge:** On real mobile devices, navigation controls were overlapping, hamburger click handlers were failing to toggle menus properly, background content scrolled while menus were open, and touch targets were difficult to tap accurately.
- **Implementation & Learning:** Refactored `client/src/App.tsx` and `client/src/styles.css` to use semantic `<nav>` elements with complete ARIA attributes (`aria-expanded`, `aria-controls`, `aria-label`). Added body scroll locking (`overflow: hidden`) during menu expansion, escape-key dismiss listeners, and backdrop click handlers. Styled all interactive headers, close buttons, and form inputs to satisfy the minimum 44 × 44 px touch target standard and validated responsive layouts across widths from 320 px to 1920 px without horizontal overflow.

### 5. Hybrid Vercel Serverless Architecture & Social Crawler Edge Prerendering
- **Challenge:** Single Page Applications built with Vite render client-side HTML, meaning social media crawlers (Twitterbot, Discordbot, LinkedIn, Facebook) scraping shareable profile links (`/u/:username`) receive a generic `index.html` file lacking profile-specific titles, bios, or preview images.
- **Implementation & Learning:** Configured a specialized edge rewrite rule in `vercel.json` that uses regex header inspection to identify crawler User-Agents. When a social bot requests `/u/:username`, Vercel proxies the request directly to a lightweight serverless handler (`api/meta/[username].js`) that dynamically serves an HTML document containing profile-specific Open Graph and Twitter Card tags. Human visitors continue directly to the static client bundle cached on the global CDN.

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
|            Express Backend           |       |        Vercel Edge Rewrite            |
|       (or Vercel Serverless)         |       |      (has User-Agent: *bot*)          |
+------------------+-------------------+       +-------------------+-------------------+
                   |                                               |
                   |                                               v
                   |                               +-----------------------------------+
                   |                               |      api/meta/[username].js       |
                   |                               |  (Pre-rendered OG/Twitter HTML)   |
                   |                               +-----------------------------------+
                   |
   +---------------+---------------+-------------------------------+
   |                               |                               |
   v                               v                               v
+--------------------+   +--------------------+          +--------------------+
|  GitHub REST API   |   | GitHub GraphQL API |          | In-Memory RAM Cache|
| (Events, Repos,    |   | (1-Yr Calendar,    |          | (10-min TTL,       |
|  Languages, Users) |   |  Private Counts)   |          |  Deduplication)    |
+--------------------+   +--------------------+          +--------------------+
```

---

## Technology Stack

| Category | Technologies Used | Purpose |
|:---|:---|:---|
| **Frontend Core** | React 18, TypeScript, Vite | Fast, type-safe single page application |
| **Data Visualization** | Recharts, Custom CSS/SVG | Heatmaps, trend curves, and timing patterns |
| **Icons & Styling** | Lucide React, Vanilla CSS | Lightweight UI without Tailwind overhead |
| **Export Engines** | html2canvas, jsPDF | Client-side PNG and vector PDF report generation |
| **Backend Runtime** | Node.js, Express | API orchestration, caching, and rate limiting |
| **Session & Auth** | iron-session, memorystore | Sealed encrypted cookies and guest quota tracking |
| **Security Headers** | Helmet, CORS | Secure HTTP headers and origin enforcement |
| **External APIs** | GitHub REST API, GitHub GraphQL | Raw developer telemetry and contribution calendars |
| **Testing Suite** | Vitest, TypeScript compiler | Unit, integration, and accessibility test suite |
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
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Populate the following variables:
```env
# GitHub Personal Access Token (increases local API limit from 60 to 5,000 req/hr)
GITHUB_TOKEN=your_github_personal_access_token

# Express Server Port & Allowed Frontend Origin
PORT=5000
CLIENT_ORIGIN=http://127.0.0.1:5173

# Random 32+ character secret for encrypted iron-session cookies
SESSION_SECRET=your_random_32_character_secret_here

# Optional: GitHub OAuth App Credentials (for Sign-In functionality)
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
GITHUB_CALLBACK_URL=http://127.0.0.1:5000/auth/github/callback

# Cache Duration in Seconds (Default: 600 = 10 minutes)
CACHE_TTL_SECONDS=600
```

> **Tip:** Generate a secure random 32-character session secret using Node:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

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

The project contains **8 automated test files with 93 passing tests**:

| Test Suite | File | Tests | Key Behaviors Verified |
|:---|:---|:---:|:---|
| **Mobile Nav & Header** | [`tests/mobileNav.test.ts`](tests/mobileNav.test.ts) | 25 | Semantic `<nav>`, `aria-expanded` and `aria-controls` bindings, mobile touch targets ($\ge 44\text{px}$), body scroll lock, Escape key dismiss, and responsive layout rules. |
| **Website Improvements** | [`tests/websiteImprovements.test.ts`](tests/websiteImprovements.test.ts) | 21 | Open Graph / Twitter Card tags, exact 1200 × 630 px preview image binary dimensions, crawler edge rewrites, read-only OAuth scopes, privacy disclosures, and Scenarios A–E error UI. |
| **Streak Algorithms** | [`tests/streaks.test.ts`](tests/streaks.test.ts) | 18 | Daily contribution streak algorithms, leap year calculations, timezone offsets, weekend gaps, and active day counting. |
| **Guest Search Limits** | [`tests/searchLimit.test.ts`](tests/searchLimit.test.ts) | 8 | Guest quota enforcement (5 free searches), memory-store tracking, and verification that 404/400 errors do not consume credits. |
| **Session & Logout** | [`tests/logout.test.ts`](tests/logout.test.ts) | 7 | Session termination on `POST /auth/logout`, cookie invalidation (`Max-Age=0`), cache-control headers, and session destruction. |
| **Analytics & Scoring** | [`tests/analytics.test.ts`](tests/analytics.test.ts) | 6 | Score calculation weighting (Consistency, Collaboration, Impact), normalization to 100, and repository health status rules. |
| **Developer Comparison** | [`tests/compare.test.ts`](tests/compare.test.ts) | 6 | Side-by-side comparison API endpoint, parallel developer fetching, delta calculations, and 400 validation for invalid names. |
| **Authentication Errors** | [`tests/authError.test.tsx`](tests/authError.test.tsx) | 2 | Client request wrapper capturing 401 token expiration and attaching `authError: true` to trigger appropriate re-authentication UI. |

> **Note on Code Coverage:** Arsenic executes 93 unit and integration tests across 8 suites on every pull request via GitHub Actions. Code coverage percentage is not currently measured by the test harness, and no unverified coverage metrics are claimed.

---

## API Reference

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/health` | Service health status check. |
| `GET` | `/api/dashboard/:username` | Returns aggregated developer telemetry, repositories, contribution calendar, and score. |
| `GET` | `/api/compare/:left/:right` | Returns side-by-side comparison metrics and delta benchmarks for two developers. |
| `POST` | `/api/summary/:username` | Generates a deterministic developer summary narrative without third-party AI APIs. |
| `GET` | `/api/meta/:username` | Returns crawler-optimized HTML with Open Graph and Twitter Cards for social bots. |
| `GET` | `/api/me` | Returns the currently authenticated GitHub user session, or guest state. |
| `GET` | `/auth/github` | Initiates GitHub OAuth authentication with read-only scopes. |
| `GET` | `/auth/github/callback` | OAuth redirect callback handler; sets sealed encrypted session cookie. |
| `POST` | `/auth/logout` | Destroys current session and expires cookie with `Max-Age=0`. |

---

## Data Handling, Limitations & Privacy

- **Public Event Estimation:** When queried without an authenticated session, activity statistics are estimated from GitHub's public events API (~last 90 days or up to 300 events). Private contributions, older activity, and web-only edits may be omitted.
- **Deterministic Summaries:** The developer summary engine runs deterministic rule-based algorithms directly on gathered data. It does not send user data to third-party generative AI models.
- **Rate Limit Transparency:** Unauthenticated guest queries share IP pools limited to 60 requests/hour by GitHub. Authenticating via GitHub increases this limit to 5,000 requests/hour.
- **Zero Persistent Storage:** Arsenic does not maintain a database. User profiles, tokens, and telemetry are never written to disk or shared with external analytics services.

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
