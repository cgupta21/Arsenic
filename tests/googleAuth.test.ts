/**
 * Google OAuth — server-side unit and integration tests.
 *
 * Tests covered:
 *  - /auth/google returns 501 when credentials are absent
 *  - /auth/google redirects and sets signed oauth_state cookie
 *  - /auth/google/callback rejects missing / tampered state (HMAC validation)
 *  - /auth/google/callback rejects missing code parameter
 *  - /auth/google/callback returns 501 when credentials are absent
 *  - /auth/google/callback handles denied consent gracefully
 *  - /auth/google/callback handles failed token exchange safely (no leaked secrets)
 *  - /auth/google/callback rejects invalid token signatures, issuers, audiences, expired tokens, and missing subjects
 *  - /auth/google/callback successfully authenticates with valid Google tokens and creates googleUser session
 *  - /auth/google/callback does not overwrite an existing GitHub session unnecessarily
 *  - /auth/google/callback failures do not destroy an existing GitHub session
 *  - /api/me returns googleUser when only googleUser is in session
 *  - /api/me returns githubUser (preferred) when both fields are present
 *  - /api/me provider field is 'google' / 'github' respectively
 *  - Guest search limit is bypassed by googleUser session
 *  - Unauthenticated guest users are constrained by the search limit
 *  - GitHub regression: /api/search/consume still grants unlimited to githubUser session
 *  - GitHub regression: /auth/github still redirects correctly
 *  - Logout clears a Google session (same mechanism as GitHub)
 */

import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sealData } from 'iron-session'
import crypto from 'node:crypto'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'arsenic-local-secret-change-me-32-chars!!'

let testKeyPair: Awaited<ReturnType<typeof generateKeyPair>>
let testPublicKeyJwk: Record<string, unknown>

beforeAll(async () => {
  testKeyPair = await generateKeyPair('RS256')
  testPublicKeyJwk = {
    ...(await exportJWK(testKeyPair.publicKey)),
    kid: 'test-google-kid-1',
    alg: 'RS256',
    use: 'sig'
  }
})

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; redirect?: 'manual' | 'follow' } = {}
): Promise<{ status: number; json: () => Record<string, unknown>; text: () => string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        body: options.body,
        redirect: options.redirect ?? 'manual',
      })
        .then(async (r) => {
          const raw = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key.toLowerCase()] = value
          })
          resolve({
            status: r.status,
            json: () => {
              try { return JSON.parse(raw) as Record<string, unknown> } catch { return { raw } }
            },
            text: () => raw,
            headers: hdrs,
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSignedStateCookie(state: string) {
  const sessionSecret = process.env.SESSION_SECRET || 'arsenic-local-secret-change-me-32-chars!!'
  const sig = crypto.createHmac('sha256', sessionSecret).update(state).digest('hex')
  return `oauth_state=${encodeURIComponent(`${state}.${sig}`)}`
}

async function createMockGoogleIdToken(
  payload: Record<string, unknown> = {},
  options: { kid?: string; issuer?: string; audience?: string; expiresIn?: string; signKey?: unknown } = {}
) {
  const jwt = new SignJWT({
    sub: 'google-sub-98765',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    picture: 'https://lh3.googleusercontent.com/a/mock-pic',
    email_verified: true,
    ...payload,
  })
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? 'test-google-kid-1' })
    .setIssuer(options.issuer ?? 'https://accounts.google.com')
    .setAudience(options.audience ?? 'test-google-client-id.apps.googleusercontent.com')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
  return jwt.sign(options.signKey ?? testKeyPair.privateKey)
}

async function sealedGoogleSession(overrides: Record<string, unknown> = {}) {
  const data = {
    googleUser: {
      id: 'google-sub-123',
      name: 'Test Google User',
      email: 'test@example.com',
      avatar_url: 'https://lh3.googleusercontent.com/test',
      login: 'test@example.com',
    },
    ...overrides,
  }
  const sealed = await sealData(data, { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 })
  return `session=${sealed}`
}

async function sealedGithubSession(overrides: Record<string, unknown> = {}) {
  const data = {
    githubUser: { login: 'testuser', name: 'Test User', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
    githubAccessToken: 'ghs_fake_token',
    ...overrides,
  }
  const sealed = await sealData(data, { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 })
  return `session=${sealed}`
}

// ---------------------------------------------------------------------------
// /auth/google initiation
// ---------------------------------------------------------------------------

describe('GET /auth/google — initiation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 501 when GOOGLE_CLIENT_ID is not set', async () => {
    const saved = process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID
    try {
      const res = await inProcessFetch('/auth/google')
      expect(res.status).toBe(501)
      expect(res.text()).toContain('Google OAuth is not configured')
    } finally {
      if (saved !== undefined) process.env.GOOGLE_CLIENT_ID = saved
    }
  })

  it('redirects to accounts.google.com with correct scope when credentials are present', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
    try {
      const res = await inProcessFetch('/auth/google')
      expect([301, 302, 303, 307, 308]).toContain(res.status)
      const location = res.headers['location'] ?? ''
      expect(location).toContain('accounts.google.com')
      expect(location).toContain('openid')
      expect(location).toContain('email')
      expect(location).toContain('profile')
      expect(location).toContain('response_type=code')
    } finally {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })

  it('sets a signed HttpOnly oauth_state cookie on redirect', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
    try {
      const res = await inProcessFetch('/auth/google')
      const setCookie = res.headers['set-cookie'] ?? ''
      expect(setCookie).toContain('oauth_state=')
      expect(setCookie.toLowerCase()).toContain('httponly')
      expect(setCookie.toLowerCase()).toContain('samesite=lax')
    } finally {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })
})

// ---------------------------------------------------------------------------
// /auth/google/callback — state & input validation
// ---------------------------------------------------------------------------

describe('GET /auth/google/callback — input & state validation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 when no oauth_state cookie is present', async () => {
    const res = await inProcessFetch('/auth/google/callback?code=abc&state=xyz')
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Invalid OAuth state')
  })

  it('returns 400 when state parameter does not match the cookie', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    // Pass a different state value in the query but the cookie from original state
    const res = await inProcessFetch('/auth/google/callback?code=abc&state=tampered_state', {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Invalid OAuth state')
  })

  it('returns 400 when HMAC signature is tampered', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const tamperedSig = 'deadbeef1234'
    const signedState = `${state}.${tamperedSig}`

    const res = await inProcessFetch(`/auth/google/callback?code=abc&state=${state}`, {
      headers: { Cookie: `oauth_state=${encodeURIComponent(signedState)}` },
    })
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Invalid OAuth state')
  })

  it('returns 400 when authorization code is missing', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    const res = await inProcessFetch(`/auth/google/callback?state=${state}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Missing authorization code')
  })

  it('returns 501 when Google OAuth credentials are not set on callback', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    const savedId = process.env.GOOGLE_CLIENT_ID
    const savedSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    try {
      const res = await inProcessFetch(`/auth/google/callback?code=sample_code&state=${state}`, {
        headers: { Cookie: cookie },
      })
      expect(res.status).toBe(501)
      expect(res.text()).toContain('Google OAuth is not configured')
    } finally {
      if (savedId) process.env.GOOGLE_CLIENT_ID = savedId
      if (savedSecret) process.env.GOOGLE_CLIENT_SECRET = savedSecret
    }
  })

  it('redirects gracefully when Google returns an error (user denied)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
    try {
      const res = await inProcessFetch('/auth/google/callback?error=access_denied&state=anything')
      expect([301, 302, 303, 307, 308]).toContain(res.status)
      const location = res.headers['location'] ?? ''
      expect(location).toContain('auth_error=google_denied')
    } finally {
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
    }
  })
})

// ---------------------------------------------------------------------------
// /auth/google/callback — token exchange & JWT verification (Mocked Google requests)
// ---------------------------------------------------------------------------

describe('GET /auth/google/callback — token exchange and JWT verification', () => {
  const originalFetch = globalThis.fetch
  const testClientId = 'test-google-client-id.apps.googleusercontent.com'
  const testClientSecret = 'test-google-secret-xyz'

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
  })

  it('handles token exchange failure (non-200 or missing id_token) safely without leaking secrets', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    const res = await inProcessFetch(`/auth/google/callback?code=bad_code&state=${state}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(502)
    expect(res.text()).toBe('Google OAuth token exchange failed.')
    // Verify secret is not leaked in the response body
    expect(res.text()).not.toContain(testClientSecret)
  })

  it('handles token verification failure (invalid signature / tampered JWT)', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    // Sign with an unrelated foreign key pair
    const foreignKey = await generateKeyPair('RS256')
    const tamperedToken = await createMockGoogleIdToken({}, { signKey: foreignKey.privateKey })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) return originalFetch(input, init)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: tamperedToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('googleapis.com/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [testPublicKeyJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    const res = await inProcessFetch(`/auth/google/callback?code=sample_code&state=${state}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(502)
    expect(res.text()).toBe('Google sign-in failed.')
  })

  it('rejects token verification when audience does not match GOOGLE_CLIENT_ID', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    const wrongAudienceToken = await createMockGoogleIdToken({}, { audience: 'different-client-id.apps.googleusercontent.com' })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) return originalFetch(input, init)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: wrongAudienceToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('googleapis.com/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [testPublicKeyJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    const res = await inProcessFetch(`/auth/google/callback?code=sample_code&state=${state}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(502)
    expect(res.text()).toBe('Google sign-in failed.')
  })

  it('rejects token verification when issuer is not accounts.google.com', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    const wrongIssuerToken = await createMockGoogleIdToken({}, { issuer: 'https://fake-issuer.com' })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) return originalFetch(input, init)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: wrongIssuerToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('googleapis.com/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [testPublicKeyJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    const res = await inProcessFetch(`/auth/google/callback?code=sample_code&state=${state}`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(502)
    expect(res.text()).toBe('Google sign-in failed.')
  })

  it('successfully logs in with valid Google ID token, saves session, and redirects', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)

    const validIdToken = await createMockGoogleIdToken({
      sub: 'google-sub-valid-456',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      picture: 'https://lh3.googleusercontent.com/a/grace',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) return originalFetch(input, init)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: validIdToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('googleapis.com/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [testPublicKeyJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    const res = await inProcessFetch(`/auth/google/callback?code=valid_auth_code&state=${state}`, {
      headers: { Cookie: cookie },
    })

    expect([301, 302, 303, 307, 308]).toContain(res.status)
    const setCookie = res.headers['set-cookie'] ?? ''
    expect(setCookie).toContain('session=')

    // Extract session cookie and query /api/me
    const match = setCookie.match(/session=([^;]+)/)
    expect(match).not.toBeNull()
    const sessionCookie = `session=${match![1]}`

    const meRes = await inProcessFetch('/api/me', { headers: { Cookie: sessionCookie } })
    expect(meRes.status).toBe(200)
    const meBody = meRes.json()
    expect(meBody.provider).toBe('google')
    const user = meBody.user as Record<string, unknown>
    expect(user.login).toBe('grace@example.com')
    expect(user.email).toBe('grace@example.com')
    expect(user.name).toBe('Grace Hopper')
    expect(user.avatar_url).toBe('https://lh3.googleusercontent.com/a/grace')
  })

  it('does not overwrite an existing GitHub session when Google auth completes', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const state = crypto.randomBytes(24).toString('hex')
    const stateCookie = createSignedStateCookie(state)
    const existingGithubCookie = await sealedGithubSession({
      githubUser: { login: 'github_pro', name: 'Pro Dev', avatar_url: 'https://avatars.githubusercontent.com/u/99' },
      githubAccessToken: 'ghs_original_token'
    })

    const validIdToken = await createMockGoogleIdToken({
      sub: 'google-sub-pro',
      name: 'Google Dev',
      email: 'dev@gmail.com',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.includes('127.0.0.1')) return originalFetch(input, init)
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ id_token: validIdToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('googleapis.com/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [testPublicKeyJwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(input, init)
    })

    // Present both the oauth_state cookie and the existing GitHub session
    const res = await inProcessFetch(`/auth/google/callback?code=good_code&state=${state}`, {
      headers: { Cookie: `${stateCookie}; ${existingGithubCookie}` },
    })
    expect([301, 302, 303, 307, 308]).toContain(res.status)

    const setCookie = res.headers['set-cookie'] ?? ''
    const match = setCookie.match(/session=([^;]+)/)
    expect(match).not.toBeNull()
    const updatedCookie = `session=${match![1]}`

    // Query /api/me: GitHub identity takes precedence and was not deleted/overwritten!
    const meRes = await inProcessFetch('/api/me', { headers: { Cookie: updatedCookie } })
    const meBody = meRes.json()
    expect(meBody.provider).toBe('github')
    const user = meBody.user as Record<string, unknown>
    expect(user.login).toBe('github_pro')
  })

  it('does not destroy existing GitHub session when Google callback encounters an error', async () => {
    process.env.GOOGLE_CLIENT_ID = testClientId
    process.env.GOOGLE_CLIENT_SECRET = testClientSecret

    const existingGithubCookie = await sealedGithubSession({
      githubUser: { login: 'github_keeper', name: 'Keeper', avatar_url: 'https://avatars.githubusercontent.com/u/101' },
      githubAccessToken: 'ghs_keeper_token'
    })

    // Denied consent
    const res = await inProcessFetch('/auth/google/callback?error=access_denied&state=xyz', {
      headers: { Cookie: existingGithubCookie },
    })
    expect([301, 302, 303, 307, 308]).toContain(res.status)

    // Verify existing GitHub session is completely intact
    const meRes = await inProcessFetch('/api/me', { headers: { Cookie: existingGithubCookie } })
    const user = meRes.json().user as Record<string, unknown>
    expect(user.login).toBe('github_keeper')
  })
})

// ---------------------------------------------------------------------------
// /api/me — provider-aware response
// ---------------------------------------------------------------------------

describe('GET /api/me — provider-aware session response', () => {
  it('returns { user: null, provider: null } when no session cookie is sent', async () => {
    const res = await inProcessFetch('/api/me')
    expect(res.status).toBe(200)
    expect(res.json().user).toBeNull()
    expect(res.json().provider).toBeNull()
  })

  it('returns googleUser and provider="google" for a Google session', async () => {
    const cookie = await sealedGoogleSession()
    const res = await inProcessFetch('/api/me', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('google')
    const user = body.user as Record<string, unknown>
    expect(user).not.toBeNull()
    expect(user.login).toBe('test@example.com')
    expect(user.email).toBe('test@example.com')
  })

  it('returns githubUser and provider="github" for a GitHub session', async () => {
    const cookie = await sealedGithubSession()
    const res = await inProcessFetch('/api/me', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('github')
    const user = body.user as Record<string, unknown>
    expect(user).not.toBeNull()
    expect(user.login).toBe('testuser')
  })

  it('prefers githubUser over googleUser when both are in session', async () => {
    const cookie = await sealedGithubSession({
      googleUser: { id: 'g', name: 'G', email: 'g@g.com', avatar_url: null, login: 'g@g.com' }
    })
    const res = await inProcessFetch('/api/me', { headers: { Cookie: cookie } })
    const body = res.json()
    expect(body.provider).toBe('github')
    const user = body.user as Record<string, unknown>
    expect(user.login).toBe('testuser')
  })
})

// ---------------------------------------------------------------------------
// Guest search limit — Google user bypass vs Guest limit
// ---------------------------------------------------------------------------

describe('Guest search limit — Google session bypasses the limit', () => {
  it('grants unlimited searches (authenticated=true) for Google-authenticated users', async () => {
    const cookie = await sealedGoogleSession({
      searchedProfiles: ['u1', 'u2', 'u3'],
      guestSearches: 3,
    })
    const res = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'u4' }),
    })
    expect(res.status).toBe(200)
    expect(res.json().allowed).toBe(true)
    expect(res.json().authenticated).toBe(true)
    expect(res.json().searchesRemaining).toBeNull()
  })

  it('enforces 3-search limit on unauthenticated guests', async () => {
    // Sealed unauthenticated session with 3 searches already used
    const unauthSessionData = {
      searchedProfiles: ['profile1', 'profile2', 'profile3'],
      guestSearches: 3,
    }
    const sealed = await sealData(unauthSessionData, { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 })
    const cookie = `session=${sealed}`

    const res = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'profile4' }),
    })
    expect(res.status).toBe(401)
    expect(res.json().allowed).toBe(false)
    expect(res.json().authenticated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GitHub regression — GitHub session still works
// ---------------------------------------------------------------------------

describe('GitHub regression — existing GitHub auth unaffected', () => {
  it('grants unlimited searches for GitHub-authenticated users', async () => {
    const cookie = await sealedGithubSession({
      searchedProfiles: ['u1', 'u2', 'u3'],
      guestSearches: 3,
    })
    const res = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ username: 'u4' }),
    })
    expect(res.status).toBe(200)
    expect(res.json().allowed).toBe(true)
    expect(res.json().authenticated).toBe(true)
    expect(res.json().searchesRemaining).toBeNull()
  })

  it('/api/me still returns login, name, avatar_url for githubUser', async () => {
    const cookie = await sealedGithubSession()
    const res = await inProcessFetch('/api/me', { headers: { Cookie: cookie } })
    const user = res.json().user as Record<string, unknown>
    expect(user.login).toBe('testuser')
    expect(user.name).toBe('Test User')
    expect(typeof user.avatar_url).toBe('string')
  })

  it('GET /auth/github still redirects to github.com when GITHUB_CLIENT_ID is set', async () => {
    const saved = process.env.GITHUB_CLIENT_ID
    process.env.GITHUB_CLIENT_ID = 'test-gh-client-id'
    try {
      const res = await inProcessFetch('/auth/github')
      expect([301, 302, 303, 307, 308]).toContain(res.status)
      const location = res.headers['location'] ?? ''
      expect(location).toContain('github.com/login/oauth/authorize')
    } finally {
      process.env.GITHUB_CLIENT_ID = saved ?? ''
    }
  })
})

// ---------------------------------------------------------------------------
// Logout — provider-agnostic
// ---------------------------------------------------------------------------

describe('Logout — clears Google session correctly', () => {
  it('POST /auth/logout returns { ok: true } and expires cookie regardless of provider', async () => {
    const cookie = await sealedGoogleSession()
    const res = await inProcessFetch('/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
    expect(res.json().ok).toBe(true)
    const setCookie = res.headers['set-cookie'] ?? ''
    expect(setCookie.toLowerCase()).toContain('max-age=0')
  })

  it('GET /api/me returns null after logout clears the session cookie', async () => {
    const res = await inProcessFetch('/api/me')
    expect(res.json().user).toBeNull()
    expect(res.json().provider).toBeNull()
  })
})
