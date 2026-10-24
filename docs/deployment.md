# Deployment Guide

This guide covers deployment strategies for Arsenic, including the primary Vercel full-stack serverless deployment, OAuth provider registration, and optional standalone containerization.

---

## 1. Primary Deployment: Vercel Full-Stack Serverless

The production application is hosted on Vercel as a unified full-stack project:
- **Production URL:** [https://arsenic-rho.vercel.app/](https://arsenic-rho.vercel.app/)

### Architecture on Vercel
- **Frontend Delivery:** The Vite React application is compiled (`npm run build`) and served as static assets from `client/dist` across Vercel's global Edge Network.
- **Backend APIs & OAuth:** Dynamic requests (`/api/*`), OAuth endpoints (`/auth/*`), and social bot preview generators (`/u/:username`) run as Vercel Serverless Functions via adapter files in `api/` (such as `api/[...path].js`, `api/dashboard/[username].js`, and `api/meta/[username].js`). These functions execute the core Express application from `server/index.js`.
- **Edge Rewrites (`vercel.json`):** Manages routing between static SPA assets and serverless function handlers without requiring a separate backend VM.

### Deploying to Vercel
1. Import the repository in your [Vercel Dashboard](https://vercel.com/new).
2. Configure project build settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `client/dist`
   - **Install Command:** `npm install`
3. Configure **Environment Variables** for the Production environment:
   - `SESSION_SECRET`: Random 32+ character string.
   - `GITHUB_TOKEN`: GitHub Personal Access Token to avoid unauthenticated rate limits.
   - `TRUST_PROXY`: `1`.
   - `CLIENT_ORIGIN`: `https://<your-project>.vercel.app`.
   - Optional: GitHub and Google OAuth credentials (see below).
4. Deploy the project.

---

## 2. OAuth Provider Configuration

> **Important Note on Callback URLs:**<br>
> The public production callback URL registered with GitHub is `https://arsenic-rho.vercel.app/auth/github/callback`.<br>
> On Vercel, `vercel.json` transparently rewrites incoming requests for `/auth/github/callback` to the internal serverless function `/api/auth/github/callback`. Do **not** register `/api/auth/github/callback` in GitHub OAuth settings or in `GITHUB_CALLBACK_URL`; always configure the public `/auth/github/callback` URL.

### GitHub OAuth App Setup
1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in the application details:
   - **Application name:** `Arsenic`
   - **Homepage URL:** `https://<your-domain>/` (e.g., `https://arsenic-rho.vercel.app/`)
   - **Authorization callback URL:** `https://<your-domain>/auth/github/callback` (or `http://127.0.0.1:5000/auth/github/callback` for local development)
3. Generate a Client Secret.
4. Set the following environment variables in your deployment:
   - `GITHUB_CLIENT_ID=<your-client-id>`
   - `GITHUB_CLIENT_SECRET=<your-client-secret>`
   - `GITHUB_CALLBACK_URL=https://<your-domain>/auth/github/callback`

### Google Cloud OAuth 2.0 Setup
1. In Google Cloud Console, navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Select **Web application** and set:
   - **Name:** `Arsenic`
   - **Authorised JavaScript origins:** `https://<your-domain>` (e.g., `https://arsenic-rho.vercel.app`)
   - **Authorised redirect URIs:** `https://<your-domain>/auth/google/callback` (or `http://127.0.0.1:5000/auth/google/callback` for local development)
3. Set the following environment variables in your deployment:
   - `GOOGLE_CLIENT_ID=<your-google-client-id>`
   - `GOOGLE_CLIENT_SECRET=<your-google-client-secret>`
   - `GOOGLE_CALLBACK_URL=https://<your-domain>/auth/google/callback`

---

## 3. Optional Deployment: Standalone Node.js & Docker

Arsenic can also run outside of Vercel as a persistent Node.js service.

### Standalone Node Server
When `process.env.VERCEL` is not set, `server/index.js` acts as a conventional HTTP server:
```bash
# Build the client bundle
npm run build

# Start the Express server on PORT (default: 5000)
npm start
```

### Docker Container
A multi-stage [`Dockerfile`](../Dockerfile) is included in the repository root:
1. **Stage 1 (Builder):** Uses `node:22-alpine` to install devDependencies and run `npm run build`.
2. **Stage 2 (Runtime):** Copies only production dependencies, the compiled `client/dist` directory, and server code.

To build and run locally:
```bash
docker build -t arsenic:latest .
docker run -p 5000:5000 --env-file .env arsenic:latest
```

### Render Deployment Blueprint
An optional [`render.yaml`](../render.yaml) blueprint is provided for one-click deployment on Render as a persistent Web Service with built-in health checking at `/api/health`.
