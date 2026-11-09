<p align="center">
  <a href="https://arsenic-rho.vercel.app">
    <img src="public/assets/arsenic-logo.svg" alt="Arsenic Logo" width="220" />
  </a>
</p>

<h3 align="center">GitHub Developer Intelligence Dashboard</h3>

<p align="center">
  <strong>Transform raw GitHub activity into transparent developer insights, repository signals, and side-by-side engineering benchmarks.</strong>
</p>

<p align="center">
  <a href="https://arsenic-rho.vercel.app">
    <img src="https://img.shields.io/badge/Live%20App-arsenic--rho.vercel.app-C96A45?style=flat-square&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License" />
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/Node.js-24.x-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node Version" />
  </a>
  <a href="https://www.typescriptlang.org">
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
</p>

---

> **Live Application:** [https://arsenic-rho.vercel.app](https://arsenic-rho.vercel.app)<br />
> Search `@cgupta21` or any public GitHub username to inspect live activity telemetry, repository health ratings, and developer signals.

---

## Overview

Standard GitHub profiles show pinned repositories and green contribution squares, but leave engineering cadence, collaboration habits, and repository maintenance fragmented across disparate commits and pull requests.

**Arsenic** provides an intelligence-driven perspective on public GitHub activity:
- **Developer Signals:** Translates raw event telemetry and GraphQL metrics into objective indicators for consistency, collaboration, and code volume.
- **Repository Health:** Evaluates maintenance freshness, issue backlog ratios, and language distributions beyond star counts.
- **Side-by-Side Comparisons:** Benchmarks any two developers across commit streaks, review participation, and repository velocity.
- **Deterministic & Privacy-Focused:** Computes all scores locally without external AI APIs, databases, or repository write permissions.

---

## Screenshots

Genuine captures from Arsenic's deployed production interface (1440 × 900 desktop viewport):

### Landing Page
<p align="center">
  <img src="docs/screenshots/landing-page.png" alt="Arsenic Desktop Landing Page" width="100%" />
</p>

### Developer Intelligence Dashboard & Profile Analysis
<p align="center">
  <img src="docs/screenshots/dashboard-overview.png" alt="Developer Intelligence Dashboard Overview" width="100%" />
</p>

### Side-by-Side Developer Comparison
<p align="center">
  <img src="docs/screenshots/developer-comparison.png" alt="Side-by-Side Developer Comparison" width="100%" />
</p>

---

## Key Features

- **Developer Intelligence Synthesis:** Real-time health scoring (0–100) based on weighted pillars in [`shared/score.js`](shared/score.js)—Consistency (45%), Collaboration (30%), and Impact (25%)—paired with dynamic behavioral badges and a 64-day contribution density matrix.
- **Repository Health & Volume:** Categorizes non-fork repositories into maintenance statuses (`Active`, `Watch`, `Stale`, `Archived`) with issue backlog ratios and byte-level language distributions.
- **Side-by-Side Comparison:** Head-to-head benchmarking at `/compare` between any two developers with delta indicators, comparative metric bars, and category leader tags.
- **Deterministic Summaries:** Locally generated profile narratives via [`shared/summary.js`](shared/summary.js) analyzing language concentration, maintenance cadence, and review activity—no third-party AI keys required.
- **High-DPI Exports & Social Previews:** Browser-based export to PNG and vector PDF via `html2canvas` and `jsPDF`, with pre-rendered Open Graph / Twitter metadata for social previews.
- **Flexible Authentication:** Unauthenticated guest exploration with a 3-profile allowance, plus optional GitHub and Google OAuth for authenticated rate limits and full 1-year GraphQL contribution calendars.

For full architectural details, see the [Deployment Guide](docs/deployment.md).

---

## Technology Stack

| Layer | Technologies |
|:---|:---|
| **Frontend** | React 18, TypeScript, Vite, Recharts, Lucide React, Vanilla CSS |
| **Backend** | Node.js (24.x), Express, Helmet, iron-session, jose |
| **APIs** | GitHub REST & GraphQL API (2022-11-28), Google Cloud OAuth 2.0 |
| **Export Engines** | html2canvas, jsPDF |
| **Testing** | Vitest (15 test suites, 291 automated tests) |
| **Deployment** | Vercel Serverless (Primary), Standalone Node.js, Docker |

---

## Quick Start

### Prerequisites
- **Node.js:** `24.x` (specified in `package.json` engines)
- **npm:** `10.x` or higher

### Local Setup

1. **Clone & install:**
   ```bash
   git clone https://github.com/cgupta21/Arsenic.git
   cd Arsenic
   npm ci
   ```

2. **Configure environment:**
   ```bash
   # Linux / macOS
   cp .env.example .env

   # Windows (PowerShell)
   Copy-Item .env.example .env
   ```
   *Default placeholders permit immediate local development in unauthenticated mode. Add `GITHUB_TOKEN` to unlock 5,000 req/hr rate limits. See the [Configuration Reference](docs/configuration.md).*

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   - Client: `http://127.0.0.1:5173`
   - API: `http://127.0.0.1:5000`

---

## Testing & Quality

```bash
# Run all quality checks (Typecheck -> Lint -> Tests)
npm run check

# Run Vitest test suite (15 test files, 291 tests)
npm test

# Build client production bundle
npm run build
```

---

## Security & Privacy

- **Stateless Encrypted Sessions:** Authentication state is sealed inside HTTP-only, `SameSite=Lax` cookies using `iron-session` and `SESSION_SECRET`.
- **Zero Persistent Storage:** Arsenic operates without a database and never persists user profiles, credentials, or source code.
- **Read-Only Least Privilege:** GitHub OAuth requests only the `read:user` scope—never repository write permissions (`repo`), email access, or private source code.
- **Strict Headers & Validation:** Enforces strict Content Security Policy (CSP), HSTS, and canonical username regex validation in [`shared/validation.js`](shared/validation.js).

For threat models and CSP verification, see [Security Architecture](docs/security.md) and [Authentication & Sessions](docs/authentication.md). Legal policies are available at [`/privacy`](https://arsenic-rho.vercel.app/privacy), [`/terms`](https://arsenic-rho.vercel.app/terms), and [`/cookies`](https://arsenic-rho.vercel.app/cookies).

---

## Documentation Index

| Guide | Description |
|:---|:---|
| [Security Architecture](docs/security.md) | Content Security Policy, DevTools verification steps, CSRF protection, and input sanitization. |
| [Authentication & Sessions](docs/authentication.md) | `iron-session` encryption, OAuth workflows (GitHub & Google), and guest search allowances. |
| [Configuration Reference](docs/configuration.md) | Complete environment variables reference, safe secret generation, and server configuration. |
| [Rate Limiting & Caching](docs/rate-limits-and-caching.md) | Upstream GitHub limits, application throttling tiers, in-memory caching, and multi-instance behavior. |
| [Deployment Guide](docs/deployment.md) | Vercel serverless deployment, system architecture diagram, Docker, and standalone Node setup. |

---

## Author & License

- **Author:** [Chandan Kumar Gupta](https://github.com/cgupta21) ([`@cgupta21`](https://github.com/cgupta21))
- **Repository:** [https://github.com/cgupta21/Arsenic](https://github.com/cgupta21/Arsenic)
- **Live Application:** [https://arsenic-rho.vercel.app](https://arsenic-rho.vercel.app)

Licensed under the [MIT License](LICENSE).<br />
*Independent GitHub analytics tool. Not affiliated with, sponsored by, or endorsed by GitHub, Inc. or Google LLC.*
