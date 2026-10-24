# Authentication & Session Management

This document details Arsenic's authentication workflows, session handling architecture, guest search quotas, and OAuth configuration.

---

## 1. Session Architecture (`iron-session`)

Arsenic uses [iron-session](https://github.com/vvo/iron-session) for stateless, encrypted session storage:

- **Client-Side Encrypted Cookie:** Session state is stored inside an HTTP-only browser cookie (`session`) encrypted with AES-256-GCM and signed with HMAC-SHA256 using `SESSION_SECRET`.
- **Multi-Instance Ready:** Because session data is sealed client-side, requests can be routed to any serverless container or instance sharing the same `SESSION_SECRET` without requiring a centralized session store or database.
- **Cookie Security Attributes:**
  - `httpOnly: true` (inaccessible to client JavaScript, mitigating XSS token theft)
  - `sameSite: 'lax'` (protects against CSRF while permitting top-level navigation redirects)
  - `secure: true` in production (enforced over HTTPS)
  - `maxAge: 7 * 24 * 60 * 60` (7-day session validity)
- **Minimal Cookie Footprint:** The encrypted session payload stores only essential identity fields and guest search state:
  ```json
  {
    "user": {
      "id": 1234567,
      "login": "octocat",
      "name": "Mona Lisa Octocat",
      "avatar": "https://avatars.githubusercontent.com/u/1234567",
      "provider": "github"
    },
    "searchedProfiles": ["cgupta21", "torvalds"]
  }
  ```
  The resulting encrypted cookie is ~250–350 bytes, well within standard 4,096-byte browser limits.

---

## 2. GitHub OAuth Authentication

Arsenic supports optional GitHub authentication to enable higher API rate limits and access authenticated GraphQL calendar telemetry.

### Read-Only Scopes
Arsenic requests only:
- `read:user`
- `user:email`

Zero write scopes, repository administration, or workflow permissions are requested.

### Flow Overview
1. **Initiation (`GET /auth/github`):**
   - Generates a cryptographically random 48-character state nonce.
   - Signs the nonce with HMAC-SHA256 and sets it in an `oauth_state` cookie and `req.session.oauthState`.
   - Redirects the browser to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope`, and `state`.
2. **Callback (`GET /auth/github/callback`):**
   - Validates the returned `state` against the stored cookie or session state.
   - Exchanges the temporary `code` for an access token via GitHub's OAuth endpoint.
   - Retrieves the user profile and stores identity metadata and the access token in the encrypted session.
   - Redirects to the dashboard or intended destination.
3. **Graceful Degradation When Not Configured:**
   - If `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is unset, navigating to `/auth/github` returns HTTP 503 (`GitHub sign-in is not configured on this server.`). All public search and comparison features remain fully functional.

> **Callback URL Distinction:** The public callback URL is `https://arsenic-rho.vercel.app/auth/github/callback` (or `http://127.0.0.1:5000/auth/github/callback` in local development). On Vercel, requests to this public path are routed to the serverless handler `api/auth/github/callback.js` via an edge rewrite in `vercel.json`. The GitHub OAuth application and `GITHUB_CALLBACK_URL` environment variable should always specify the public path (`/auth/github/callback`).

---

## 3. Google Cloud OAuth 2.0 Authentication

Arsenic also supports optional Google sign-in for quick user registration and profile identification.

### Flow Overview
1. **Initiation (`GET /auth/google`):**
   - Generates a PKCE code verifier and code challenge along with a signed state parameter.
   - Stores the state and verifier in session and cookie.
   - Redirects to Google's OAuth 2.0 authorization endpoint (`https://accounts.google.com/o/oauth2/v2/auth`).
2. **Callback (`GET /auth/google/callback`):**
   - Validates the returned `state` parameter.
   - Exchanges the authorization `code` with Google for tokens, including an OpenID Connect `id_token`.
   - Verifies the `id_token` cryptographically using `jose` against Google's public JSON Web Key Sets (JWKS).
   - Extracts `sub`, `email`, `name`, and `picture` and seals the user into the encrypted session.
   - Redirects to `/register?auth=google_success`.
3. **Session Coexistence:**
   - Signing in with Google does not overwrite or destroy an existing GitHub token if the user has connected both.

---

## 4. Session Termination (Sign-Out)

- **Endpoint:** `POST /auth/logout`
- **Behavior:**
  - Invokes `req.session.destroy()` on the server side.
  - Sets the `session` cookie expiration to `Max-Age=0` (`expires: new Date(0)`).
  - Emits `Cache-Control: no-store, no-cache, must-revalidate, private` headers to ensure browsers do not serve cached authenticated views.
  - Returns `{ ok: true }` so client-side state is reset immediately.

---

## 5. Guest Search Allowance & Cookie-Based Tracking

Anonymous visitors receive an onboarding allowance to explore the platform before being prompted to sign in.

### Allowance Rules
- **Quota:** 3 distinct successful profile analyses per guest session.
- **Quota Preservation:**
  - **Repeated Searches:** Re-visiting a profile already analyzed in the current session (`searchedProfiles`) does not consume additional credits.
  - **Failed Requests:** HTTP 400 (invalid username), 404 (user not found), 429 (rate-limited), and 500 (upstream outage) errors never consume guest search attempts.
  - **Showcase Exemption:** Viewing the showcase account (`cgupta21`) is exempt from quota consumption.
  - **Authenticated Users:** Users signed in via GitHub or Google are exempt from guest search limits.

### Architectural Limitations
- **Cookie-Based State:** Guest search history is tracked directly inside the encrypted session cookie (`req.session.searchedProfiles`).
- **Not a Centralized Anti-Scraping Boundary:** Because this counter lives in client cookies rather than a shared database, visitors can reset their quota by clearing browser cookies, using private/incognito browsing, switching browsers, or accessing from a different device.
- **Design Purpose:** The guest allowance is an onboarding UX guardrail to encourage OAuth sign-in. Backend abuse prevention is handled by upstream GitHub IP rate limits and local rate limiting middleware.
