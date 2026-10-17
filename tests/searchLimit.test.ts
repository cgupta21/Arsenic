import { describe, expect, it, vi, afterEach } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sealData } from 'iron-session'

const SESSION_PASSWORD = process.env.SESSION_SECRET || 'arsenic-local-secret-change-me-32-chars!!'

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; json: () => Record<string, unknown>; headers: Record<string, string> }> {
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
      })
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key] = value
          })
          resolve({
            status: r.status,
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

function extractCookie(headers: Record<string, string>): string {
  const setCookie = headers['set-cookie']
  if (!setCookie) return ''
  const cookieStr = Array.isArray(setCookie) ? (setCookie as string[]).join('; ') : String(setCookie)
  const match = cookieStr.match(/(?:^|;\s*)(session=[^;]+)/)
  return match ? match[1] : ''
}

describe('Unauthenticated Guest Search Limit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows fresh anonymous sessions searches 1 to 3, and blocks search 4 with 401', async () => {
    // Calling generic POST /api/search/consume consumes credits
    const res1 = await inProcessFetch('/api/search/consume', { method: 'POST' })
    expect(res1.status).toBe(200)
    expect(res1.json().allowed).toBe(true)
    expect(res1.json().authenticated).toBe(false)
    expect(res1.json().searchesRemaining).toBe(2)

    const cookie1 = extractCookie(res1.headers)
    expect(cookie1).toContain('session=')

    // 2nd search
    const res2 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { Cookie: cookie1 }
    })
    expect(res2.status).toBe(200)
    expect(res2.json().allowed).toBe(true)
    expect(res2.json().searchesRemaining).toBe(1)

    const cookie2 = extractCookie(res2.headers) || cookie1

    // 3rd search
    const res3 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { Cookie: cookie2 }
    })
    expect(res3.status).toBe(200)
    expect(res3.json().allowed).toBe(true)
    expect(res3.json().searchesRemaining).toBe(0)

    const cookie3 = extractCookie(res3.headers) || cookie2

    // 4th distinct search – MUST BE BLOCKED
    const res4 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { Cookie: cookie3 }
    })
    expect(res4.status).toBe(401)
    expect(res4.json().allowed).toBe(false)
    expect(res4.json().authenticated).toBe(false)
    expect(res4.json().loginRequired).toBe(true)
    expect(res4.json().searchesRemaining).toBe(0)
    expect(res4.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")
  })

  it('calling /api/search/consume with username does not prematurely consume credit if dashboard is not loaded', async () => {
    // Client verifies permission for 'tentativeUser', but user disconnects before dashboard is fetched
    const resCheck = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tentativeUser' })
    })
    expect(resCheck.status).toBe(200)
    expect(resCheck.json().allowed).toBe(true)
    expect(resCheck.json().searchesRemaining).toBe(3)

    // A subsequent check still sees 3 searches remaining because the dashboard was never loaded
    const resCheck2 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anotherTentativeUser' })
    })
    expect(resCheck2.status).toBe(200)
    expect(resCheck2.json().searchesRemaining).toBe(3)
  })

  it('repeated usernames do not consume additional searches', async () => {
    // Session with 'octocat' already searched
    const sealedCookie = await sealData(
      { searchedProfiles: ['octocat'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Repeated search: user 'octocat' again
    const resRepeat1 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'octocat' })
    })
    expect(resRepeat1.status).toBe(200)
    expect(resRepeat1.json().allowed).toBe(true)
    expect(resRepeat1.json().searchesRemaining).toBe(2)

    // Repeated search with uppercase/spaces: '  OCTOCAT  '
    const resRepeat2 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: '  OCTOCAT  ' })
    })
    expect(resRepeat2.status).toBe(200)
    expect(resRepeat2.json().allowed).toBe(true)
    expect(resRepeat2.json().searchesRemaining).toBe(2)

    // Showcase/fallback profile 'cgupta21' does not consume searches
    const resFallback = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'cgupta21' })
    })
    expect(resFallback.status).toBe(200)
    expect(resFallback.json().allowed).toBe(true)
    expect(resFallback.json().searchesRemaining).toBe(2)
  })

  it('previously searched usernames remain accessible even after reaching 3 searches', async () => {
    // Session with 3 already searched profiles
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2', 'u3'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Re-searching u1 is still allowed
    const reU1 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'u1' })
    })
    expect(reU1.status).toBe(200)
    expect(reU1.json().allowed).toBe(true)

    // Re-searching u2 is still allowed
    const reU2 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'u2' })
    })
    expect(reU2.status).toBe(200)
    expect(reU2.json().allowed).toBe(true)

    // 4th distinct search 'u4' is blocked
    const r4 = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'u4' })
    })
    expect(r4.status).toBe(401)
    expect(r4.json().allowed).toBe(false)
  })

  it('backend dashboard API enforces the search limit directly', async () => {
    // Create a session cookie with 3 already searched profiles
    const sealedCookie = await sealData(
      { searchedProfiles: ['dev1', 'dev2', 'dev3'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Direct dashboard request for 4th distinct user 'dev4' must be blocked
    const res = await inProcessFetch('/api/dashboard/dev4', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(401)
    expect(res.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")
    expect(res.json().loginRequired).toBe(true)
    expect(res.json().authError).toBe(true)

    // Fallback profile 'cgupta21' is exempt
    const resFallback = await inProcessFetch('/api/dashboard/cgupta21', {
      headers: { Cookie: cookieHeader }
    })
    expect(resFallback.status).not.toBe(401)
  })

  it('failed requests (404 user not found) do not consume a free search', async () => {
    // Session starting with 1 search used
    const sealedCookie = await sealData(
      { searchedProfiles: ['validuser'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Dashboard request fails with 404 (nonexistent user)
    const resDash = await inProcessFetch('/api/dashboard/nonexistent-user-xyz-404-shouldnotexist', {
      headers: { Cookie: cookieHeader }
    })
    expect(resDash.status).toBe(404)

    // Check searches remaining: still 2 remaining (not 1)
    const resCheck = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'newprofile' })
    })
    expect(resCheck.status).toBe(200)
    expect(resCheck.json().searchesRemaining).toBe(2)
  })

  it('failed requests (400 invalid username) do not consume a free search', async () => {
    const sealedCookie = await sealData(
      { searchedProfiles: ['validuser'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Invalid username with forbidden characters
    const resDash = await inProcessFetch('/api/dashboard/invalid$$$name', {
      headers: { Cookie: cookieHeader }
    })
    expect(resDash.status).toBe(502) // or error from invalid username validation

    // Searches remaining remains 2
    const resCheck = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'newprofile' })
    })
    expect(resCheck.status).toBe(200)
    expect(resCheck.json().searchesRemaining).toBe(2)
  })

  it('allows authenticated users unlimited searches', async () => {
    const sealedCookie = await sealData(
      {
        githubUser: { login: 'authedDeveloper', name: 'Authed Dev', avatar_url: 'https://example.com/avatar.png' },
        searchedProfiles: ['dev1', 'dev2', 'dev3'],
        guestSearches: 3
      },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const resConsume = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'dev4' })
    })
    expect(resConsume.status).toBe(200)
    expect(resConsume.json().allowed).toBe(true)
    expect(resConsume.json().authenticated).toBe(true)
    expect(resConsume.json().searchesRemaining).toBeNull()
  })
})
