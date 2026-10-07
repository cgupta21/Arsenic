/**
 * Regression test: logout must clear the iron-session cookie so that /api/me
 * returns { user: null } immediately and after a simulated page reload.
 *
 * Flow tested:
 *   Authenticated session
 *     -> POST /auth/logout  -> { ok: true }
 *     -> response contains Set-Cookie that expires the session cookie
 *     -> GET /api/me (without session cookie) -> { user: null }
 */

import { describe, expect, it } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Spin up a one-shot ephemeral HTTP server backed by the Express app so we
 * can make real fetch() calls without needing supertest.
 */
function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
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
      })
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key] = value
          })
          resolve({
            status: r.status,
            json: () => JSON.parse(text) as Record<string, unknown>,
            headers: hdrs,
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

describe('POST /auth/logout', () => {
  it('returns { ok: true } with a 200 status', async () => {
    const res = await inProcessFetch('/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('sets Set-Cookie that expires the session cookie (Max-Age=0)', async () => {
    const res = await inProcessFetch('/auth/logout', { method: 'POST' })
    const setCookie = res.headers['set-cookie']
    const cookieStr = Array.isArray(setCookie)
      ? (setCookie as string[]).join('; ')
      : String(setCookie ?? '')
    expect(cookieStr.toLowerCase()).toContain('session=')
    expect(cookieStr.toLowerCase()).toContain('max-age=0')
  })

  it('sets Cache-Control: no-store on the logout response', async () => {
    const res = await inProcessFetch('/auth/logout', { method: 'POST' })
    const cc = String(res.headers['cache-control'] ?? '')
    expect(cc).toContain('no-store')
  })

  it('also supports POST /api/auth/logout directly', async () => {
    const res = await inProcessFetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.json().ok).toBe(true)
    const setCookie = res.headers['set-cookie']
    const cookieStr = Array.isArray(setCookie)
      ? (setCookie as string[]).join('; ')
      : String(setCookie ?? '')
    expect(cookieStr.toLowerCase()).toContain('session=')
    expect(cookieStr.toLowerCase()).toContain('max-age=0')
  })
})

describe('GET /api/me', () => {
  it('returns { user: null } when no session cookie is sent', async () => {
    const res = await inProcessFetch('/api/me')
    expect(res.status).toBe(200)
    expect(res.json().user).toBeNull()
  })

  it('sets Cache-Control: no-store', async () => {
    const res = await inProcessFetch('/api/me')
    const cc = String(res.headers['cache-control'] ?? '')
    expect(cc).toContain('no-store')
  })

  it('still returns { user: null } after simulated page refresh (no cookie)', async () => {
    // Simulates the browser refreshing after logout: no cookie sent
    const res = await inProcessFetch('/api/me', { headers: {} })
    expect(res.json().user).toBeNull()
  })
})
