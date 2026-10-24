# Configuration & Environment Variables

This document provides a comprehensive reference for configuring Arsenic in local development, containerized environments, and serverless hosting platforms.

---

## 1. Environment Variables Reference

| Variable | Environment | Default / Example | Purpose & Fallback Behavior |
|:---|:---:|:---|:---|
| `SESSION_SECRET` | **Required in Prod**<br>*(Optional in Dev)* | `your-32-character-session-secret-here` | 32+ character random string used by `iron-session` to seal session cookies via AES-256-GCM.<br>• **Production:** If absent or shorter than 32 characters, an error is logged and an insecure fallback is used.<br>• **Generation:** Generate using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `GITHUB_TOKEN` | **Recommended in Prod**<br>*(Optional in Dev)* | `ghp_yourPersonalAccessTokenPlaceholder` | Personal Access Token (classic with `read:user` or fine-grained public repository access).<br>• **Unset:** Operates in Public API Mode (estimated activity, 60 req/hr per outbound IP).<br>• **Configured:** Unlocks 5,000 req/hr rate limits and full 1-year contribution heatmaps via GitHub GraphQL API. |
| `GITHUB_CLIENT_ID` | Optional | `your_github_client_id_placeholder` | Client ID from your registered GitHub OAuth App.<br>• **Unset:** "Sign in with GitHub" is disabled. All public analytics and comparisons remain available. |
| `GITHUB_CLIENT_SECRET` | Optional | `your_github_client_secret_placeholder` | Client Secret from your registered GitHub OAuth App.<br>• Must be configured together with `GITHUB_CLIENT_ID`. |
| `GITHUB_CALLBACK_URL` | Optional | `http://127.0.0.1:5000/auth/github/callback` | OAuth callback redirect URL matching your registered GitHub OAuth App.<br>• In production: `https://<your-domain>/auth/github/callback`. |
| `GOOGLE_CLIENT_ID` | Optional | `your-google-client-id.apps.googleusercontent.com` | Client ID from Google Cloud Console Credentials.<br>• **Unset:** "Sign in with Google" is disabled on registration. |
| `GOOGLE_CLIENT_SECRET` | Optional | `your_google_client_secret_placeholder` | Client Secret from Google Cloud Console Credentials.<br>• Must be configured together with `GOOGLE_CLIENT_ID`. |
| `GOOGLE_CALLBACK_URL` | Optional | `http://127.0.0.1:5000/auth/google/callback` | OAuth redirect URI registered in Google Cloud Console.<br>• In production: `https://<your-domain>/auth/google/callback`. |
| `CLIENT_ORIGIN` | Optional | `http://127.0.0.1:5173,http://localhost:5173` | Comma-delimited list of permitted CORS origins for Express routes. |
| `PORT` | Optional | `5000` | HTTP listening port for standalone Node/Express server (ignored by Vercel serverless runtime). |
| `CACHE_TTL_SECONDS` | Optional | `600` | In-memory cache duration in seconds for GitHub profile data (minimum enforced value: 60s). |
| `SUMMARY_LIMIT_PER_10_MIN` | Optional | `5` | Per-IP request limit for `/api/summary/:username` within a 10-minute window. |
| `SUMMARY_DAILY_CAP` | Optional | `200` | Maximum number of non-cached summaries generated server-wide per calendar day. |
| `TRUST_PROXY` | Optional | `1` | Enables Express proxy trusting behind reverse proxies (Vercel, Render, Nginx) for secure cookies and client IP resolution. |
| `NODE_ENV` | Optional | `development` | Setting to `production` enables secure cookies (`secure: true`), strict HSTS headers, and enforces `SESSION_SECRET` validation. |

---

## 2. Generating Safe Secrets

Never commit real keys or production secrets to Git. When generating a production `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The resulting 64-character hexadecimal string meets the entropy requirements for `iron-session` AES-256-GCM encryption.

---

## 3. Local Setup (`.env`)

1. Copy the template file:
   ```bash
   cp .env.example .env
   ```
2. For basic local exploration, default placeholder values in `.env` are sufficient. The application will start in unauthenticated Public API Mode.
3. To enable authenticated rate limits locally, add your personal GitHub token to `GITHUB_TOKEN`.
4. Ensure `.env` is listed in `.gitignore` before committing any repository changes.

---

## 4. Production Hosting Configuration

When hosting on platforms such as Vercel or container hosts (Render, Railway, Fly.io):

1. Set `NODE_ENV=production`.
2. Provide a unique, random `SESSION_SECRET`.
3. Provide a `GITHUB_TOKEN` to prevent shared outbound IP rate-limit exhaustion.
4. Set `TRUST_PROXY=1` so reverse-proxy headers (`x-forwarded-for`, `x-forwarded-proto`) are properly interpreted for IP rate limiting and HTTPS cookie delivery.
