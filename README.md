# Arsenic

Arsenic is a GitHub developer-intelligence dashboard that turns repository data and contribution signals into a compact view of **consistency, collaboration, impact, language volume, commit timing and repository health**.

## What makes Arsenic portfolio-ready

- GitHub profile and repository analysis with a server-side API proxy.
- 10-minute per-user in-memory caching plus in-flight request deduplication, and a visible cache indicator.
- Authenticated GitHub REST/GraphQL access when `GITHUB_TOKEN` is configured.
- Contribution calendar, current/longest streaks and 8-week trend.
- Language mix based on repository language byte counts when GraphQL is available, rather than repository count alone.
- Transparent Arsenic score with **consistency, collaboration and impact** breakdowns; scores can legitimately be low.
- Commit timing patterns by hour and weekday (UTC) from a sample of recent commits.
- Repository health labels (active/watch/stale/archived), issue ratio, filters and sorting.
- Side-by-side developer comparison at `/compare?a=octocat&b=torvalds`.
- Shareable profile URLs such as `/u/octocat`.
- Recent-search history stored locally in the browser.
- Deterministic developer summary built from Arsenic metrics; no external AI service or paid API key is required.
- PNG/PDF share-card export.
- Optional GitHub OAuth for the signed-in user's own private contribution counts.
- Theme persistence, `prefers-color-scheme`, keyboard focus states and reduced-motion support.
- Helmet, restricted CORS, API rate limiting and `trust proxy` support for hosted deployments.
- PNG/PDF export libraries are lazy-loaded, so they do not slow the first page load.
- Production static serving from Express plus Docker and Render deployment configuration.

## Architecture

```text
Browser (React + Vite)
        |
        | /api, /auth
        v
Express API
  |       |
  |       +-----------> GitHub OAuth (optional)
  +-------------------> GitHub REST + GraphQL
        |
        +--> deterministic summary engine
        |
        +--> in-memory cache (10 min default)
        |
        +--> client/dist in production
```

## Local setup

```bash
npm install
```

Create `.env` from `.env.example` and set at least:

```env
GITHUB_TOKEN=your_github_token
PORT=5000
CLIENT_ORIGIN=http://127.0.0.1:5173
SESSION_SECRET=change-this-secret
```

Developer summary:

The summary engine is deterministic and runs locally in the Arsenic server. It uses the collected score, contribution, repository, language and timing metrics, so there is no AI provider account, API key or paid service required.

Optional GitHub OAuth:

```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://127.0.0.1:5000/auth/github/callback
```

Then:

```bash
npm run dev
```

Quality checks:

```bash
npm run check   # typecheck + lint + tests
```

Open `http://127.0.0.1:5173`.

## Production

In production the server refuses to start unless `SESSION_SECRET` is a random value of at least 32 characters. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Optional limits for the summary endpoint: `SUMMARY_LIMIT_PER_10_MIN` (default 5 per IP) and `SUMMARY_DAILY_CAP` (default 200 total).

Build the client and start Express:

```bash
npm run build
npm start
```

Express serves `client/dist` in production. The health check is:

```text
GET /api/health
```

### Docker

```bash
docker build -t arsenic .
docker run --env-file .env -p 5000:5000 arsenic
```

### Render

The repository includes `render.yaml`. Add the secrets in the Render dashboard and set `CLIENT_ORIGIN` to the deployed site origin.

## API endpoints

- `GET /api/health`
- `GET /api/dashboard/:username`
- `GET /api/compare/:left/:right`
- `POST /api/summary/:username`
- `GET /api/me`
- `GET /auth/github`
- `GET /auth/github/callback`
- `POST /auth/logout`

## Rate-limit strategy

Arsenic caches each analyzed username for 10 minutes by default and shares an in-flight request when the same profile is requested concurrently. The server also handles both GitHub `403` primary-limit responses and `429` secondary throttling responses instead of treating every `403` as a rate-limit error.

GitHub documents 60 unauthenticated REST requests/hour and 5,000 authenticated requests/hour for personal access-token/OAuth-authenticated requests. GitHub also recommends authenticated conditional/cached requests and avoiding unnecessary concurrency when using the REST API.

## Security

- Never commit `.env` or paste API keys into client code.
- `GITHUB_TOKEN` is never exposed through `VITE_*` variables.
- GitHub OAuth access tokens are stored in the server session, not returned to the browser.
- Sessions use an in-memory store with expired-session cleanup, which is fine for a single-instance demo. Use Redis or another persistent store before running several instances.
- `.env` is gitignored. The included `.env` contains only blank placeholders; add real credentials locally and never commit them.

## Notes about GitHub data

GitHub's public events feed is useful for recent activity but is not a complete historical contribution calendar. Arsenic therefore uses GitHub's GraphQL `contributionsCollection` when an authenticated token is available. Without a token it falls back to an **estimate** built from the public events feed (roughly the last 90 days); the UI labels this clearly. Set `GITHUB_TOKEN` for any deployed version.

## Suggested demo flow

1. Analyze `octocat`.
2. Search another developer with `/u/<username>`.
3. Open **Compare** and compare two developers.
4. Review the score breakdown, heatmap, language volume and repository health.
5. Generate the intelligent developer summary.
6. Export the share card as PNG or PDF.

## Live demo

Add the deployment URL here after publishing:

```text
https://your-arsenic-domain.example
```
