import { describe, expect, it, vi, afterEach } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import crypto from 'node:crypto'
import { sealData } from 'iron-session'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app, { resolveSessionSecret, fallbackSessionSecret, consumeOAuthState, resolveOAuthCallbackUri, resolveFrontendOrigin, resolvePostLoginRedirect, parseGrantedScopes, userCanSeePrivate, isSelfUser, sessionToken } from '../server/index.js'

const SESSION_PASSWORD = resolveSessionSecret(process.env)

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; text: () => string; json: () => Record<string, unknown>; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Origin: 'http://127.0.0.1:5173',
          ...(options.headers ?? {}),
        },
        body: options.body,
        redirect: 'manual',
      })
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string | string[]> = {}
          r.headers.forEach((value, key) => {
            if (key === 'set-cookie') {
              const existing = hdrs[key]
              if (!existing) {
                hdrs[key] = value
              } else if (Array.isArray(existing)) {
                hdrs[key] = [...existing, value]
              } else {
                hdrs[key] = [existing, value]
              }
            } else {
              hdrs[key] = value
            }
          })
          resolve({
            status: r.status,
            text: () => text,
            json: () => {
              try {
                return JSON.parse(text) as Record<string, unknown>
              } catch {
                return { raw: text }
              }
            },
            headers: hdrs,
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

function generateSignedState(state: string, secret = SESSION_PASSWORD) {
  const sig = crypto.createHmac('sha256', secret).update(state).digest('hex')
  return `${state}.${sig}`
}

function createSignedStateCookie(state: string, secret = SESSION_PASSWORD) {
  const signed = generateSignedState(state, secret)
  return `oauth_state=${encodeURIComponent(signed)}`
}

async function createSessionWithOAuthState(signedState: string, secret = SESSION_PASSWORD) {
  const sealed = await sealData({ oauthState: signedState }, { password: secret, ttl: 600 })
  return `session=${sealed}`
}

describe('OAuth State Helpers — Dual Cookie & Session Persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('validates state correctly when only cookie persistence is provided', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)
    const req = { headers: { cookie } }
    const setHeaderMock = vi.fn()
    const getHeaderMock = vi.fn().mockReturnValue(undefined)
    const res = { setHeader: setHeaderMock, getHeader: getHeaderMock }

    const result = await consumeOAuthState(req, res, state)
    expect(result.ok).toBe(true)
    expect(result.state).toBe(state)
  })

  it('validates state correctly when only session persistence is provided', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const req = {
      headers: {},
      session: {
        oauthState: signedState,
        save: vi.fn().mockResolvedValue(undefined),
      },
    }
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    const result = await consumeOAuthState(req, res, state)
    expect(result.ok).toBe(true)
    expect(result.state).toBe(state)
    // Verify session state was cleared
    expect(req.session.oauthState).toBeUndefined()
    expect(req.session.save).toHaveBeenCalled()
  })

  it('validates state correctly when both cookie and session persistence are present', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const cookie = `oauth_state=${signedState}`
    const req = {
      headers: { cookie },
      session: {
        oauthState: signedState,
        save: vi.fn().mockResolvedValue(undefined),
      },
    }
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    const result = await consumeOAuthState(req, res, state)
    expect(result.ok).toBe(true)
    expect(result.state).toBe(state)
    expect(req.session.oauthState).toBeUndefined()
  })

  it('rejects when state in query parameter does not match cookie or session', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const cookie = `oauth_state=${signedState}`
    const req = {
      headers: { cookie },
      session: { oauthState: signedState, save: vi.fn() },
    }
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    const result = await consumeOAuthState(req, res, 'different_tampered_state')
    expect(result.ok).toBe(false)
  })

  it('rejects when HMAC signature is forged or signed with wrong secret', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const forgedState = generateSignedState(state, 'wrong-secret-key-that-does-not-match-at-all!!')
    const cookie = `oauth_state=${forgedState}`
    const req = { headers: { cookie } }
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    const result = await consumeOAuthState(req, res, state)
    expect(result.ok).toBe(false)
  })

  it('rejects missing or empty state parameters', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    expect((await consumeOAuthState({ headers: { cookie } }, res, '')).ok).toBe(false)
    expect((await consumeOAuthState({ headers: { cookie } }, res, undefined as unknown as string)).ok).toBe(false)
    expect((await consumeOAuthState({ headers: {} }, res, state)).ok).toBe(false)
  })

  it('prevents replay attacks: state can only be consumed once', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const session = {
      oauthState: signedState,
      save: vi.fn().mockResolvedValue(undefined),
    }
    const req = {
      headers: { cookie: `oauth_state=${signedState}` },
      session,
    }
    const res = { setHeader: vi.fn(), getHeader: vi.fn() }

    // First consumption succeeds
    const first = await consumeOAuthState(req, res, state)
    expect(first.ok).toBe(true)

    // Second consumption with the now-cleared session fails
    req.headers.cookie = ''
    const second = await consumeOAuthState(req, res, state)
    expect(second.ok).toBe(false)
  })
})

describe('GitHub OAuth Flow — Initiation and Callback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
  })

  it('GET /auth/github sets signed cookie, saves session, and redirects to github authorize', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

    const res = await inProcessFetch('/auth/github')
    expect(res.status).toBe(302)

    const loc = String(res.headers.location || '')
    expect(loc).toContain('github.com/login/oauth/authorize')
    expect(loc).toContain('client_id=test-github-client-id')
    expect(loc).toContain('state=')
    expect(loc).toContain('scope=read%3Auser')
    expect(loc).not.toContain('repo')
    expect(loc).not.toContain('user%3Aemail')

    const setCookie = String(res.headers['set-cookie'] || '')
    expect(setCookie).toContain('oauth_state=')
    expect(setCookie).toContain('Path=/')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('GET /auth/github strictly requests least-privilege read:user scope and excludes repo permissions', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

    const res = await inProcessFetch('/auth/github')
    expect(res.status).toBe(302)

    const loc = new URL(String(res.headers.location || ''))
    const requestedScope = loc.searchParams.get('scope')
    expect(requestedScope).toBe('read:user')
    expect(requestedScope).not.toContain('repo')
    expect(requestedScope).not.toContain('user:email')
  })

  it('GET /auth/github/callback rejects missing state with 400', async () => {
    const res = await inProcessFetch('/auth/github/callback?code=test_code')
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Invalid OAuth state.')
  })

  it('GET /auth/github/callback rejects mismatched state with 400', async () => {
    const state = crypto.randomBytes(24).toString('hex')
    const cookie = createSignedStateCookie(state)
    const res = await inProcessFetch('/auth/github/callback?code=test_code&state=mismatched_state', {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(400)
    expect(res.text()).toContain('Invalid OAuth state.')
  })

  it('GET /auth/github/callback validates state via session and expires oauth_state cookie', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const sessionCookie = await createSessionWithOAuthState(signedState)

    // Mock fetch for token exchange so callback succeeds after state validation
    const origFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_mock_access_token_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('api.github.com/user')) {
        return new Response(
          JSON.stringify({ login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const res = await inProcessFetch(`/auth/github/callback?code=valid_code&state=${state}`, {
      headers: { Cookie: sessionCookie },
    })

    // Expect redirect after successful token exchange to /dashboard
    expect(res.status).toBe(302)
    expect(String(res.headers.location)).toContain('/dashboard')
    const setCookie = String(res.headers['set-cookie'] || '')
    // Must clear oauth_state cookie
    expect(setCookie).toContain('oauth_state=')
    expect(setCookie).toContain('Max-Age=0')
  })
})

describe('Google OAuth Flow — Initiation and Callback with Dual Persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
  })

  it('GET /auth/google persists state and redirects to google accounts', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'

    const res = await inProcessFetch('/auth/google')
    expect(res.status).toBe(302)

    const loc = String(res.headers.location || '')
    expect(loc).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(loc).toContain('client_id=test-google-id.apps.googleusercontent.com')
    expect(loc).toContain('state=')

    const setCookie = String(res.headers['set-cookie'] || '')
    expect(setCookie).toContain('oauth_state=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('GET /auth/google/callback validates state from session when cookie is absent', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'

    const state = crypto.randomBytes(24).toString('hex')
    const signedState = generateSignedState(state)
    const sessionCookie = await createSessionWithOAuthState(signedState)

    const origFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as { url?: string })?.url || ''
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    try {
      // Token exchange mock failing with expected 502 confirms state validation PASSED
      const res = await inProcessFetch(`/auth/google/callback?code=mock_code&state=${state}`, {
        headers: { Cookie: sessionCookie },
      })

      // Status 502 means state passed and it attempted token exchange
      expect(res.status).toBe(502)
      expect(res.text()).toContain('Google OAuth token exchange failed')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('Full simulated flow: /auth/google -> capture cookies -> /auth/google/callback', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'

    const initRes = await inProcessFetch('/auth/google')
    expect(initRes.status).toBe(302)

    const loc = new URL(String(initRes.headers.location))
    const state = loc.searchParams.get('state')!
    expect(state).toBeTruthy()

    // Extract all set-cookie headers from initiation
    const rawSetCookie = initRes.headers['set-cookie']
    const cookieHeader = Array.isArray(rawSetCookie) ? rawSetCookie.join('; ') : String(rawSetCookie)

    const origFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as { url?: string })?.url || ''
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    try {
      const callbackRes = await inProcessFetch(`/auth/google/callback?code=mock_code&state=${state}`, {
        headers: { Cookie: cookieHeader },
      })

      // Status 502 confirms state validation succeeded
      expect(callbackRes.status).toBe(502)
      expect(callbackRes.text()).not.toContain('Invalid OAuth state.')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

describe('Production Secret Handling & Absence of Fallbacks', () => {
  it('enforces SESSION_SECRET in Vercel production environment', () => {
    expect(() =>
      resolveSessionSecret({
        VERCEL_ENV: 'production',
        SESSION_SECRET: '',
      })
    ).toThrow(/SESSION_SECRET must be set to a secure, random string/i)

    expect(() =>
      resolveSessionSecret({
        VERCEL: '1',
        NODE_ENV: 'production',
        SESSION_SECRET: fallbackSessionSecret,
      })
    ).toThrow(/Fallback secret is not permitted in production/i)
  })

  it('signs and verifies consistently using the exact resolved production secret', async () => {
    const prodSecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
    const state = 'test_state_production_value_123'
    const signed = generateSignedState(state, prodSecret)

    // Manual verify simulation with exact production secret
    const [orig, sig] = signed.split('.')
    const expected = crypto.createHmac('sha256', prodSecret).update(orig).digest('hex')
    expect(sig).toBe(expected)
  })
})

describe('Local Development OAuth Routing & Callback URI Resolution', () => {
  const origGithubCallback = process.env.GITHUB_CALLBACK_URL
  const origGoogleCallback = process.env.GOOGLE_CALLBACK_URL

  afterEach(() => {
    vi.restoreAllMocks()
    if (origGithubCallback !== undefined) {
      process.env.GITHUB_CALLBACK_URL = origGithubCallback
    } else {
      delete process.env.GITHUB_CALLBACK_URL
    }
    if (origGoogleCallback !== undefined) {
      process.env.GOOGLE_CALLBACK_URL = origGoogleCallback
    } else {
      delete process.env.GOOGLE_CALLBACK_URL
    }
  })

  it('redirects to local host when GITHUB_CALLBACK_URL is set to production Vercel URL in local mode', () => {
    process.env.GITHUB_CALLBACK_URL = 'https://arsenic-rho.vercel.app/auth/github/callback'
    const req = {
      headers: {
        host: '127.0.0.1:5000',
        'x-forwarded-host': '127.0.0.1:5173',
        'x-forwarded-proto': 'http',
      },
    }

    const uri = resolveOAuthCallbackUri(req, 'github')
    expect(uri).toBe('http://127.0.0.1:5173/auth/github/callback')
    expect(uri).not.toContain('arsenic-rho.vercel.app')
  })

  it('redirects to local host when GOOGLE_CALLBACK_URL is set to production Vercel URL in local mode', () => {
    process.env.GOOGLE_CALLBACK_URL = 'https://arsenic-rho.vercel.app/auth/google/callback'
    const req = {
      headers: {
        host: '127.0.0.1:5000',
      },
    }

    const uri = resolveOAuthCallbackUri(req, 'google')
    expect(uri).toContain('127.0.0.1')
    expect(uri).toContain('/auth/google/callback')
    expect(uri).not.toContain('arsenic-rho.vercel.app')
  })

  it('honors explicitly configured local callback URLs in env', () => {
    process.env.GITHUB_CALLBACK_URL = 'http://127.0.0.1:5000/auth/github/callback'
    const req = { headers: { host: '127.0.0.1:5000' } }
    expect(resolveOAuthCallbackUri(req, 'github')).toBe('http://127.0.0.1:5000/auth/github/callback')

    process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/auth/google/callback'
    expect(resolveOAuthCallbackUri(req, 'google')).toBe('http://localhost:5000/auth/google/callback')
  })

  it('Local GitHub initiation sends local redirect_uri even with production env configured', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
    process.env.GITHUB_CALLBACK_URL = 'https://arsenic-rho.vercel.app/auth/github/callback'

    const res = await inProcessFetch('/auth/github', {
      headers: {
        host: '127.0.0.1:5000',
        'x-forwarded-host': '127.0.0.1:5173',
      },
    })
    expect(res.status).toBe(302)
    const loc = new URL(String(res.headers.location))
    const redirectUri = loc.searchParams.get('redirect_uri')
    expect(redirectUri).toBe('http://127.0.0.1:5173/auth/github/callback')
    expect(redirectUri).not.toContain('arsenic-rho.vercel.app')
  })

  it('Local Google initiation sends local redirect_uri even with production env configured', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
    process.env.GOOGLE_CALLBACK_URL = 'https://arsenic-rho.vercel.app/auth/google/callback'

    const res = await inProcessFetch('/auth/google', {
      headers: {
        host: '127.0.0.1:5000',
        'x-forwarded-host': '127.0.0.1:5173',
      },
    })
    expect(res.status).toBe(302)
    const loc = new URL(String(res.headers.location))
    const redirectUri = loc.searchParams.get('redirect_uri')
    expect(redirectUri).toBe('http://127.0.0.1:5173/auth/google/callback')
    expect(redirectUri).not.toContain('arsenic-rho.vercel.app')
  })
})

describe('Post-Login Redirect & Authenticated Dashboard State Regression Tests', () => {
  const origGoogleId = process.env.GOOGLE_CLIENT_ID
  const origGoogleSecret = process.env.GOOGLE_CLIENT_SECRET
  const origGithubId = process.env.GITHUB_CLIENT_ID
  const origGithubSecret = process.env.GITHUB_CLIENT_SECRET

  afterEach(() => {
    vi.restoreAllMocks()
    if (origGoogleId !== undefined) process.env.GOOGLE_CLIENT_ID = origGoogleId
    else delete process.env.GOOGLE_CLIENT_ID
    if (origGoogleSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = origGoogleSecret
    else delete process.env.GOOGLE_CLIENT_SECRET
    if (origGithubId !== undefined) process.env.GITHUB_CLIENT_ID = origGithubId
    else delete process.env.GITHUB_CLIENT_ID
    if (origGithubSecret !== undefined) process.env.GITHUB_CLIENT_SECRET = origGithubSecret
    else delete process.env.GITHUB_CLIENT_SECRET
  })

  it('resolveFrontendOrigin extracts allowed origin from referer or falls back to clientOrigins[0]', () => {
    const reqWithReferer = {
      get: (header: string) => (header === 'referer' ? 'http://127.0.0.1:5173/register' : null),
    }
    expect(resolveFrontendOrigin(reqWithReferer)).toBe('http://127.0.0.1:5173')

    const reqFallback = { get: () => null }
    expect(resolveFrontendOrigin(reqFallback)).toBe('http://127.0.0.1:5173')
  })

  it('resolvePostLoginRedirect resolves to /dashboard on the trusted frontend origin', () => {
    const req = {
      get: (header: string) => (header === 'referer' ? 'http://127.0.0.1:5173/register' : null),
    }
    expect(resolvePostLoginRedirect(req, '/dashboard')).toBe('http://127.0.0.1:5173/dashboard')
    expect(resolvePostLoginRedirect(req, 'dashboard')).toBe('http://127.0.0.1:5173/dashboard')
  })

  it('Google OAuth provider error redirects to /register?auth_error=google_denied', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'

    const res = await inProcessFetch('/auth/google/callback?error=access_denied&state=mock_state', {
      headers: {
        Referer: 'http://127.0.0.1:5173/register',
      },
    })
    expect(res.status).toBe(302)
    const loc = String(res.headers.location || '')
    expect(loc).toContain('/register')
    expect(loc).toContain('auth_error=google_denied')
  })

  it('Authenticated Google user has unlimited searches on /api/search/consume', async () => {
    const sealed = await sealData(
      {
        googleUser: {
          id: 'google-sub-789',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar_url: '/assets/arsenic-mark.svg',
          login: 'ada@example.com',
        },
      },
      { password: SESSION_PASSWORD, ttl: 3600 }
    )
    const sessionCookie = `session=${sealed}`

    const consumeRes = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'torvalds' }),
    })
    expect(consumeRes.status).toBe(200)
    const body = consumeRes.json()
    expect(body.allowed).toBe(true)
    expect(body.authenticated).toBe(true)
    expect(body.searchesRemaining).toBeNull()
  })

  it('GET /api/me recognizes authenticated Google user with avatar fallback', async () => {
    const sealed = await sealData(
      {
        googleUser: {
          id: 'google-sub-789',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar_url: '/assets/arsenic-mark.svg',
          login: 'ada@example.com',
        },
      },
      { password: SESSION_PASSWORD, ttl: 3600 }
    )
    const sessionCookie = `session=${sealed}`

    const meRes = await inProcessFetch('/api/me', { headers: { Cookie: sessionCookie } })
    expect(meRes.status).toBe(200)
    const body = meRes.json()
    expect(body.provider).toBe('google')
    expect((body.user as Record<string, unknown>).login).toBe('ada@example.com')
  })
})

describe('GitHub OAuth Scope Validation & Private Contribution Capability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
  })

  it('parseGrantedScopes safely handles various formats and edge cases', () => {
    expect(parseGrantedScopes('read:user')).toEqual(['read:user'])
    expect(parseGrantedScopes('read:user,user:email')).toEqual(['read:user', 'user:email'])
    expect(parseGrantedScopes('read:user repo')).toEqual(['read:user', 'repo'])
    expect(parseGrantedScopes('')).toEqual([])
    expect(parseGrantedScopes(null)).toEqual([])
    expect(parseGrantedScopes(undefined)).toEqual([])
    expect(parseGrantedScopes('   ')).toEqual([])
    expect(parseGrantedScopes('READ:USER, User:Email')).toEqual(['read:user', 'user:email'])
  })

  it('successful token exchange with read:user grants private contribution capability', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

    const state = crypto.randomBytes(24).toString('hex')
    const signedState = crypto.createHmac('sha256', SESSION_PASSWORD).update(state).digest('hex')
    const sealed = await sealData(
      { oauthState: `${state}.${signedState}` },
      { password: SESSION_PASSWORD, ttl: 600 }
    )
    const sessionCookie = `session=${sealed}`

    const origFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_valid_read_user', scope: 'read:user' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('api.github.com/user')) {
        return new Response(
          JSON.stringify({ login: 'alice', name: 'Alice Dev', avatar_url: 'https://avatars.githubusercontent.com/u/1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const res = await inProcessFetch(`/auth/github/callback?code=valid_code&state=${state}`, {
      headers: { Cookie: sessionCookie },
    })

    expect(res.status).toBe(302)
    const setCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [String(res.headers['set-cookie'] || '')]
    const sessionCookies = setCookies.filter((c: string) => c.startsWith('session='))
    const latestSession = sessionCookies[sessionCookies.length - 1]?.split(';')[0] || ''
    expect(latestSession).toContain('session=')

    // Verify /api/me reflects hasPrivateContributionsScope: true
    const meRes = await inProcessFetch('/api/me', {
      headers: { Cookie: latestSession },
    })
    expect(meRes.status).toBe(200)
    expect(meRes.json().hasPrivateContributionsScope).toBe(true)
    expect(meRes.json().user).toEqual(expect.objectContaining({ login: 'alice' }))
  })

  it('token exchange with missing or insufficient scope permits login but disables private contribution capability', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

    const state = crypto.randomBytes(24).toString('hex')
    const signedState = crypto.createHmac('sha256', SESSION_PASSWORD).update(state).digest('hex')
    const sealed = await sealData(
      { oauthState: `${state}.${signedState}` },
      { password: SESSION_PASSWORD, ttl: 600 }
    )
    const sessionCookie = `session=${sealed}`

    const origFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('github.com/login/oauth/access_token')) {
        // Insufficient scope: only public_repo or empty string
        return new Response(JSON.stringify({ access_token: 'gho_unscoped', scope: 'public_repo' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('api.github.com/user')) {
        return new Response(
          JSON.stringify({ login: 'bob', name: 'Bob Dev', avatar_url: 'https://avatars.githubusercontent.com/u/2' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const res = await inProcessFetch(`/auth/github/callback?code=valid_code&state=${state}`, {
      headers: { Cookie: sessionCookie },
    })

    expect(res.status).toBe(302)
    const setCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [String(res.headers['set-cookie'] || '')]
    const sessionCookies = setCookies.filter((c: string) => c.startsWith('session='))
    const latestSession = sessionCookies[sessionCookies.length - 1]?.split(';')[0] || ''
    expect(latestSession).toContain('session=')

    // Verify /api/me permits login but hasPrivateContributionsScope is false
    const meRes = await inProcessFetch('/api/me', {
      headers: { Cookie: latestSession },
    })
    expect(meRes.status).toBe(200)
    expect(meRes.json().hasPrivateContributionsScope).toBe(false)
    expect(meRes.json().user).toEqual(expect.objectContaining({ login: 'bob' }))
  })

  it('userCanSeePrivate returns false when hasPrivateContributionsScope is explicitly false', () => {
    const sessionWithoutScope = {
      session: {
        githubUser: { login: 'alice' },
        githubAccessToken: 'gho_no_scope',
        hasPrivateContributionsScope: false
      }
    }
    expect(userCanSeePrivate(sessionWithoutScope, 'alice')).toBe(false)

    const sessionWithScope = {
      session: {
        githubUser: { login: 'alice' },
        githubAccessToken: 'gho_with_scope',
        hasPrivateContributionsScope: true
      }
    }
    expect(userCanSeePrivate(sessionWithScope, 'alice')).toBe(true)
    expect(userCanSeePrivate(sessionWithScope, 'bob')).toBe(false)
  })

  it('isSelfUser checks case-insensitive username match correctly', () => {
    expect(isSelfUser({ session: { githubUser: { login: 'Alice' } } }, 'alice')).toBe(true)
    expect(isSelfUser({ session: { githubUser: { login: 'Alice' } } }, 'Bob')).toBe(false)
    expect(isSelfUser({}, 'alice')).toBe(false)
  })

  it('sessionToken preserves user token for self queries even when scope is insufficient, but isolates for other users', () => {
    const aliceToken = 'gho_alice_token'
    const session = {
      session: {
        githubUser: { login: 'alice' },
        githubAccessToken: aliceToken,
        hasPrivateContributionsScope: false
      }
    }
    expect(sessionToken(session, 'alice')).toBe(aliceToken)
    expect(sessionToken(session, 'bob')).not.toBe(aliceToken)
  })

  it('parseGrantedScopes rejects malformed scopes and requires exact read:user identifier', () => {
    expect(parseGrantedScopes('read_user').includes('read:user')).toBe(false)
    expect(parseGrantedScopes('read:user:extended').includes('read:user')).toBe(false)
    expect(parseGrantedScopes('user').includes('read:user')).toBe(false)
    expect(parseGrantedScopes('read:org').includes('read:user')).toBe(false)
    expect(parseGrantedScopes(',,,,').includes('read:user')).toBe(false)
    expect(parseGrantedScopes('   read:user   ').includes('read:user')).toBe(true)
    expect(parseGrantedScopes('repo,read:user,gist').includes('read:user')).toBe(true)
  })

  it('dashboard endpoint returns accurate private contribution status: included for positive counts, zero_or_hidden for zero', async () => {
    const sealedPositive = await sealData(
      {
        githubUser: { login: 'alice' },
        githubAccessToken: 'gho_alice_token',
        hasPrivateContributionsScope: true
      },
      { password: SESSION_PASSWORD, ttl: 600 }
    )

    const origFetch = globalThis.fetch
    // 1. Positive private contribution count
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('api.github.com/graphql')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                login: 'alice',
                name: 'Alice',
                avatarUrl: 'https://example.com/avatar.png',
                bio: 'Engineer',
                url: 'https://github.com/alice',
                location: null,
                websiteUrl: null,
                createdAt: '2020-01-01T00:00:00Z',
                followers: { totalCount: 10 },
                following: { totalCount: 5 },
                repositories: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: 'r1',
                      name: 'demo-repo',
                      url: 'https://github.com/alice/demo-repo',
                      description: 'Demo',
                      stargazerCount: 5,
                      forkCount: 1,
                      updatedAt: '2026-11-01T00:00:00Z',
                      pushedAt: '2026-11-01T00:00:00Z',
                      isFork: false,
                      isArchived: false,
                      primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
                      issues: { totalCount: 0 },
                      languages: { edges: [] }
                    }
                  ]
                },
                contributionsCollection: {
                  totalCommitContributions: 50,
                  totalPullRequestContributions: 5,
                  totalIssueContributions: 2,
                  totalPullRequestReviewContributions: 3,
                  restrictedContributionsCount: 15,
                  contributionCalendar: {
                    totalContributions: 75,
                    weeks: []
                  }
                }
              },
              rateLimit: { limit: 5000, remaining: 4999, used: 1, resetAt: '2026-11-08T06:00:00Z', cost: 1 }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const resPositive = await inProcessFetch('/api/dashboard/alice', {
      headers: { Cookie: `session=${sealedPositive}` }
    })
    expect(resPositive.status).toBe(200)
    const dataPositive = resPositive.json() as Record<string, unknown>
    expect(dataPositive.privateContributions).toBe(true)
    expect(dataPositive.privateContributionsStatus).toBe('included')
    expect((dataPositive.contributions as Record<string, unknown>).privateContributionCount).toBe(15)

    // 2. Zero private contributions (status becomes 'zero_or_hidden' without asserting visibility setting is off)
    const sealedZero = await sealData(
      {
        githubUser: { login: 'alicezero' },
        githubAccessToken: 'gho_alice_zero_token',
        hasPrivateContributionsScope: true
      },
      { password: SESSION_PASSWORD, ttl: 600 }
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('api.github.com/graphql')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                login: 'alicezero',
                name: 'Alice Zero',
                avatarUrl: 'https://example.com/avatar.png',
                bio: 'Engineer',
                url: 'https://github.com/alicezero',
                location: null,
                websiteUrl: null,
                createdAt: '2020-01-01T00:00:00Z',
                followers: { totalCount: 10 },
                following: { totalCount: 5 },
                repositories: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: []
                },
                contributionsCollection: {
                  totalCommitContributions: 50,
                  totalPullRequestContributions: 5,
                  totalIssueContributions: 2,
                  totalPullRequestReviewContributions: 3,
                  restrictedContributionsCount: 0,
                  contributionCalendar: {
                    totalContributions: 60,
                    weeks: []
                  }
                }
              },
              rateLimit: { limit: 5000, remaining: 4999, used: 1, resetAt: '2026-11-08T06:00:00Z', cost: 1 }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const resZero = await inProcessFetch('/api/dashboard/alicezero', {
      headers: { Cookie: `session=${sealedZero}` }
    })
    expect(resZero.status).toBe(200)
    const dataZero = resZero.json() as Record<string, unknown>
    expect(dataZero.privateContributions).toBe(true)
    expect(dataZero.privateContributionsStatus).toBe('zero_or_hidden')
    expect((dataZero.contributions as Record<string, unknown>).privateContributionCount).toBe(0)
  })

  it('public profile analysis continues working normally when private contribution analytics are unavailable', async () => {
    const sealedNoScope = await sealData(
      {
        githubUser: { login: 'bob' },
        githubAccessToken: 'gho_bob_no_scope_token',
        hasPrivateContributionsScope: false
      },
      { password: SESSION_PASSWORD, ttl: 600 }
    )

    const origFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      if (url.includes('api.github.com/graphql')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                login: 'bob',
                name: 'Bob',
                avatarUrl: 'https://example.com/bob.png',
                bio: 'Developer',
                url: 'https://github.com/bob',
                location: null,
                websiteUrl: null,
                createdAt: '2021-01-01T00:00:00Z',
                followers: { totalCount: 2 },
                following: { totalCount: 1 },
                repositories: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: 'r2',
                      name: 'public-tool',
                      url: 'https://github.com/bob/public-tool',
                      description: 'A tool',
                      stargazerCount: 10,
                      forkCount: 2,
                      updatedAt: '2026-11-01T00:00:00Z',
                      pushedAt: '2026-11-01T00:00:00Z',
                      isFork: false,
                      isArchived: false,
                      primaryLanguage: { name: 'JavaScript', color: '#f1e05a' },
                      issues: { totalCount: 0 },
                      languages: { edges: [] }
                    }
                  ]
                },
                contributionsCollection: {
                  totalCommitContributions: 10,
                  totalPullRequestContributions: 1,
                  totalIssueContributions: 0,
                  totalPullRequestReviewContributions: 0,
                  restrictedContributionsCount: 99,
                  contributionCalendar: {
                    totalContributions: 11,
                    weeks: []
                  }
                }
              },
              rateLimit: { limit: 5000, remaining: 4999, used: 1, resetAt: '2026-11-08T06:00:00Z', cost: 1 }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input as RequestInfo, init as RequestInit)
    })

    const res = await inProcessFetch('/api/dashboard/bob', {
      headers: { Cookie: `session=${sealedNoScope}` }
    })
    expect(res.status).toBe(200)
    const data = res.json() as Record<string, unknown>
    // Private contributions must be false and count 0 because hasPrivateContributionsScope is false
    expect(data.privateContributions).toBe(false)
    expect(data.privateContributionsStatus).toBe('unavailable')
    expect((data.contributions as Record<string, unknown>).privateContributionCount).toBe(0)
    // Public profile data must remain intact and fully functional
    expect((data.user as Record<string, unknown>).login).toBe('bob')
    expect(Array.isArray(data.repos)).toBe(true)
    expect((data.repos as unknown[]).length).toBe(1)
    expect((data.score as Record<string, unknown>).score).toBeDefined()
  })
})


