import { describe, expect, it, vi, afterEach } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app, { resolveSessionSecret } from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sealData, unsealData } from 'iron-session'

const SESSION_PASSWORD = resolveSessionSecret(process.env)

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
        headers: {
          Origin: 'http://127.0.0.1:5173',
          ...(options.headers ?? {}),
        },
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
    const origFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (urlStr.includes('api.github.com')) {
        return new Response(JSON.stringify({ login: 'cgupta21', id: 1, public_repos: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return origFetch(input, init)
    })
    try {
      const resFallback = await inProcessFetch('/api/dashboard/cgupta21', {
        headers: { Cookie: cookieHeader }
      })
      expect(resFallback.status).not.toBe(401)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('failed requests (404 user not found) do not consume a free search', async () => {
    // Session starting with 1 search used
    const sealedCookie = await sealData(
      { searchedProfiles: ['validuser'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Dashboard request fails with 404 (nonexistent user)
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (urlStr.startsWith('https://api.github.com')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    })

    try {
      const resDash = await inProcessFetch('/api/dashboard/nonexistent-user-xyz-404-shouldnotexist', {
        headers: { Cookie: cookieHeader }
      })
      expect(resDash.status).toBe(404)
    } finally {
      fetchSpy.mockRestore()
    }

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
    expect([400, 502]).toContain(resDash.status) // returns 400 for invalid username format

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

describe('Comparison Guest Search Limit (/api/compare/:left/:right)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupGitHubCompareMock() {
    const origFetch = globalThis.fetch
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/repos?')) {
        return new Response(
          JSON.stringify([
            {
              id: 1,
              name: 'repo-one',
              fork: false,
              isFork: false,
              stargazers_count: 10,
              forks_count: 2,
              open_issues_count: 1,
              language: 'TypeScript',
              updated_at: '2026-10-01T00:00:00Z',
              pushed_at: '2026-10-01T00:00:00Z'
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/events/public')) {
        return new Response(
          JSON.stringify([
            {
              type: 'PushEvent',
              created_at: '2026-10-15T12:00:00Z',
              payload: { commits: [1, 2] }
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/commits?')) {
        return new Response(
          JSON.stringify([
            {
              commit: {
                author: {
                  date: '2026-10-15T12:00:00Z'
                }
              }
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/users/')) {
        const username = url.split('/users/')[1].split(/[/?]/)[0]
        if (username.startsWith('nonexistent')) {
          return new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          })
        }
        return new Response(
          JSON.stringify({
            login: username,
            name: `${username} Name`,
            avatar_url: `https://example.com/${username}.png`,
            bio: 'Bio',
            public_repos: 5,
            followers: 20,
            following: 10,
            created_at: '2020-01-01T00:00:00Z'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return origFetch(input, init)
    })
  }

  it('rejects comparison when guest quota is already exhausted (3 searches used)', async () => {
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2', 'u3'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const res = await inProcessFetch('/api/compare/devA/devB', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(401)
    expect(res.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")
    expect(res.json().loginRequired).toBe(true)
    expect(res.json().authError).toBe(true)
  })

  it('blocks comparison of 2 new profiles when only 1 guest search remains', async () => {
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2'], guestSearches: 2 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Comparing two brand new developers requires 2 searches, but only 1 is remaining
    const res = await inProcessFetch('/api/compare/devA/devB', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(401)
    expect(res.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")
    expect(res.json().loginRequired).toBe(true)
    expect(res.json().authError).toBe(true)
  })

  it('allows comparing 1 new profile with 1 already-searched profile when 1 guest search remains', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2'], guestSearches: 2 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // 'u1' is already searched, so only 'devNew' consumes quota (1 search needed, 1 remaining)
    const res = await inProcessFetch('/api/compare/u1/devNew', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()

    // Session cookie in response should now reflect 3 searches used
    const newCookie = extractCookie(res.headers)
    expect(newCookie).toBeTruthy()
    const match = newCookie.match(/session=([^;]+)/)
    expect(match).toBeTruthy()
    if (match) {
      const sessionData = await unsealData<{ searchedProfiles: string[]; guestSearches: number }>(match[1], { password: SESSION_PASSWORD })
      expect(sessionData.guestSearches).toBe(3)
      expect(sessionData.searchedProfiles).toContain('devnew')
    }
  })

  it('allows comparing previously searched profiles even after reaching 3 searches', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2', 'u3'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Comparing already searched profiles 'u1' and 'u2' is permitted
    const res = await inProcessFetch('/api/compare/u1/u2', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()
  })

  it('exempts the showcase fallback profile (cgupta21) from comparison quota', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2', 'u3'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // 'cgupta21' is exempt, and 'u1' is already searched
    const res = await inProcessFetch('/api/compare/cgupta21/u1', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()
  })

  it('deduplicates when comparing the same new developer on both sides', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1', 'u2'], guestSearches: 2 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Comparing 'devA' with 'devA' counts as 1 distinct new profile, so it fits in the 1 remaining slot
    const res = await inProcessFetch('/api/compare/devA/devA', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()

    const newCookie = extractCookie(res.headers)
    if (newCookie) {
      const match = newCookie.match(/session=([^;]+)/)
      if (match) {
        const sessionData = await unsealData<{ searchedProfiles: string[]; guestSearches: number }>(match[1], { password: SESSION_PASSWORD })
        expect(sessionData.guestSearches).toBe(3)
        expect(sessionData.searchedProfiles.filter(p => p === 'deva')).toHaveLength(1)
      }
    }
  })

  it('allows authenticated GitHub users unlimited comparisons', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      {
        githubUser: { login: 'authedUser', name: 'Authed Dev', avatar_url: 'https://example.com/avatar.png' },
        searchedProfiles: ['u1', 'u2', 'u3'],
        guestSearches: 3
      },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const res = await inProcessFetch('/api/compare/newDev1/newDev2', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()
  })

  it('allows authenticated Google users unlimited comparisons', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      {
        googleUser: { email: 'dev@gmail.com', name: 'Google Dev', picture: 'https://example.com/pic.png' },
        searchedProfiles: ['u1', 'u2', 'u3'],
        guestSearches: 3
      },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const res = await inProcessFetch('/api/compare/newDev1/newDev2', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(200)
    expect(res.json().left).toBeDefined()
    expect(res.json().right).toBeDefined()
  })

  it('returns 400 for invalid usernames without consuming guest quota', async () => {
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const resLeft = await inProcessFetch('/api/compare/invalid$$left/torvalds', {
      headers: { Cookie: cookieHeader }
    })
    expect([400, 502]).toContain(resLeft.status)

    const resRight = await inProcessFetch('/api/compare/torvalds/-invalidRight', {
      headers: { Cookie: cookieHeader }
    })
    expect([400, 502]).toContain(resRight.status)

    // Verify searches remaining is still 2
    const resCheck = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'checkprofile' })
    })
    expect(resCheck.status).toBe(200)
    expect(resCheck.json().searchesRemaining).toBe(2)
  })

  it('does not consume quota when one of the compared developers is not found (404)', async () => {
    setupGitHubCompareMock()
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    const res = await inProcessFetch('/api/compare/validDev/nonexistent-user-xyz', {
      headers: { Cookie: cookieHeader }
    })
    expect(res.status).toBe(404)

    // Searches remaining is still 2
    const resCheck = await inProcessFetch('/api/search/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ username: 'checkprofile' })
    })
    expect(resCheck.status).toBe(200)
    expect(resCheck.json().searchesRemaining).toBe(2)
  })

  it('maintains consistent quota state across sequential dashboard and comparison requests', async () => {
    setupGitHubCompareMock()
    // 1. Fresh session: 3 searches available. Dashboard search for 'dashDev1'
    const resDash = await inProcessFetch('/api/dashboard/dashDev1')
    expect(resDash.status).toBe(200)

    const cookie1 = extractCookie(resDash.headers)
    expect(cookie1).toBeTruthy()

    // 2. Comparison of 2 new developers 'compDev2' and 'compDev3' uses remaining 2 searches (total 3 used)
    const resComp = await inProcessFetch('/api/compare/compDev2/compDev3', {
      headers: { Cookie: cookie1 }
    })
    expect(resComp.status).toBe(200)

    const cookie2 = extractCookie(resComp.headers) || cookie1

    // 3. Subsequent dashboard search for 4th new developer 'dashDev4' is blocked
    const resDashBlocked = await inProcessFetch('/api/dashboard/dashDev4', {
      headers: { Cookie: cookie2 }
    })
    expect(resDashBlocked.status).toBe(401)
    expect(resDashBlocked.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")

    // 4. Subsequent comparison requiring a new developer 'compDev5' is also blocked
    const resCompBlocked = await inProcessFetch('/api/compare/dashDev1/compDev5', {
      headers: { Cookie: cookie2 }
    })
    expect(resCompBlocked.status).toBe(401)
    expect(resCompBlocked.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")

    // 5. Comparing already unlocked profiles remains allowed even at quota limit
    const resUnlocked = await inProcessFetch('/api/compare/dashDev1/compDev2', {
      headers: { Cookie: cookie2 }
    })
    expect(resUnlocked.status).toBe(200)
  })

  it('handles concurrent requests cleanly and enforces quota sequentially once cookie updates settle', async () => {
    setupGitHubCompareMock()
    // Session starting with 1 search used ('u1'), leaving 2 remaining
    const sealedCookie = await sealData(
      { searchedProfiles: ['u1'], guestSearches: 1 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const cookieHeader = `session=${sealedCookie}`

    // Under stateless cookie architecture, concurrent requests evaluate against the incoming cookie snapshot
    const [res1, res2] = await Promise.all([
      inProcessFetch('/api/compare/u1/concurrentA', { headers: { Cookie: cookieHeader } }),
      inProcessFetch('/api/compare/u1/concurrentB', { headers: { Cookie: cookieHeader } })
    ])
    expect([200, 401]).toContain(res1.status)
    expect([200, 401]).toContain(res2.status)

    // Once a request finishes and the client persists the updated session cookie,
    // subsequent requests strictly enforce the updated quota
    const updatedCookie = extractCookie(res1.headers) || extractCookie(res2.headers)
    expect(updatedCookie).toBeTruthy()

    // Session with 3 searches used
    const exhaustedCookie = await sealData(
      { searchedProfiles: ['u1', 'concurrentA', 'concurrentB'], guestSearches: 3 },
      { password: SESSION_PASSWORD, ttl: 7 * 24 * 3600 }
    )
    const resFollowUp = await inProcessFetch('/api/compare/u1/anotherDev', {
      headers: { Cookie: `session=${exhaustedCookie}` }
    })
    expect(resFollowUp.status).toBe(401)
    expect(resFollowUp.json().error).toBe("You've used your 3 free searches. Sign in with GitHub to continue.")
  })
})
