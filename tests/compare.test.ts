import { describe, expect, it, vi, afterEach } from 'vitest'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
// @ts-expect-error – api handler is plain JS without declaration files
import compareHandler from '../api/compare/[left]/[right].js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
})

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
      originalFetch(url, {
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

describe('Developer Comparison API (/api/compare/:left/:right)', () => {
  it('rejects invalid developer usernames with 502/400 error', async () => {
    const res = await inProcessFetch('/api/compare/invalid$$user/validUser')
    expect([400, 502]).toContain(res.status)
    expect(res.json().error).toContain('Invalid GitHub username')
  })

  it('returns 404 when one of the compared developers is not found', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString()
      if (url.includes('api.github.com/users/')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({}), { status: 404 })
    })

    const res = await inProcessFetch('/api/compare/nonexistent-user-left/nonexistent-user-right')
    expect(res.status).toBe(404)
    expect(res.json().error).toBeDefined()
  })

  it('successfully returns both left and right dashboard payloads on successful comparison', async () => {
    // Mock global fetch for GitHub REST API endpoints
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL | Request).toString()
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
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    const res = await inProcessFetch('/api/compare/devA/devB')
    expect(res.status).toBe(200)
    const data = res.json()
    expect(data.left).toBeDefined()
    expect(data.right).toBeDefined()
    expect((data.left as Record<string, unknown>).user).toBeDefined()
    expect((data.right as Record<string, unknown>).user).toBeDefined()
    expect(((data.left as Record<string, unknown>).user as Record<string, unknown>).login).toBe('devA')
    expect(((data.right as Record<string, unknown>).user as Record<string, unknown>).login).toBe('devB')
  })
})

describe('Vercel Serverless Function Handler (api/compare/[left]/[right].js)', () => {
  it('exports a valid default handler function', () => {
    expect(typeof compareHandler).toBe('function')
  })

  it('normalizes req.url when query parameters are supplied without full path', async () => {
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        // Simulate Vercel providing req.query when req.url was truncated
        const vercelReq = req as unknown as { url: string; query?: Record<string, string> }
        vercelReq.query = { left: 'userA', right: 'userB' }
        vercelReq.url = '/api/compare?a=1'
        ;(compareHandler as (r: unknown, s: unknown) => void)(vercelReq, res)
        expect(vercelReq.url).toBe('/api/compare/userA/userB?a=1')
        resolve()
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo
        originalFetch(`http://127.0.0.1:${port}/`)
          .catch(() => {})
          .finally(() => server.close())
      })
      server.on('error', reject)
    })
  })

  it('delegates to the underlying Express app and completes the response', async () => {
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        ;(compareHandler as (req: unknown, res: unknown) => void)(req, res)
      })
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo
        originalFetch(`http://127.0.0.1:${port}/api/compare/invalid$$left/invalid$$right`)
          .then(async (r) => {
            expect([400, 502]).toContain(r.status)
            const json = await r.json()
            expect(json.error).toContain('Invalid GitHub username')
            resolve()
          })
          .catch(reject)
          .finally(() => server.close())
      })
      server.on('error', reject)
    })
  })
})
