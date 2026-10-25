import { describe, expect, it, vi, afterEach } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
// @ts-expect-error – server/index.js is plain JS
import app from '../server/index.js'
import { request, type DashboardError } from '../client/src/hooks/useDashboard'

afterEach(() => {
  vi.restoreAllMocks()
})

const nativeFetch = global.fetch

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
      nativeFetch(url, {
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
            json: () => {
              try {
                return JSON.parse(text) as Record<string, unknown>
              } catch {
                return { rawText: text }
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

describe('Error States & Reliability', () => {
  describe('1. Server-side Error Categorization & Friendly Responses', () => {
    it('categorizes invalid input with 400 and invalidInput flag', async () => {
      const res = await inProcessFetch('/api/dashboard/invalid--user')
      expect(res.status).toBe(400)
      const body = res.json()
      expect(body.invalidInput).toBe(true)
      expect(body.error).toContain('Invalid GitHub username')
    })

    it('categorizes user-not-found with 404 and notFound flag', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const res = await inProcessFetch('/api/dashboard/missingghost')
      expect(res.status).toBe(404)
      const body = res.json()
      expect(body.notFound).toBe(true)
      expect(body.error).toContain('was not found')
    })

    it('categorizes rate limit with 429, rateLimit flag, and reset metadata', async () => {
      const resetTimestamp = String(Math.floor(Date.now() / 1000) + 1200)
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': resetTimestamp,
          },
        })
      })

      const res = await inProcessFetch('/api/dashboard/ratecapped')
      expect(res.status).toBe(429)
      const body = res.json()
      expect(body.rateLimit).toBe(true)
      expect(body.reset).toBe(resetTimestamp)
      expect(body.error).toContain('rate limit')
    })

    it('categorizes network errors with 502 and networkError flag', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        const netErr = new TypeError('fetch failed')
        throw netErr
      })

      const res = await inProcessFetch('/api/dashboard/netdownuser')
      expect(res.status).toBe(502)
      const body = res.json()
      expect(body.networkError).toBe(true)
      expect(body.error).toContain('network connection')
    })

    it('categorizes temporary upstream 5xx errors with 502 and upstreamError flag', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const res = await inProcessFetch('/api/dashboard/outageuser')
      expect(res.status).toBe(502)
      const body = res.json()
      expect(body.upstreamError).toBe(true)
      expect(body.error).toContain('Could not reach GitHub right now')
    })

    it('redacts tokens and sensitive details from error messages', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(
          JSON.stringify({ message: 'Failed using token ghp_superSecretToken1234567890abcdef with Bearer secretToken999' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      })

      const res = await inProcessFetch('/api/dashboard/secretuser')
      expect(res.status).toBe(502)
      const rawText = JSON.stringify(res.json())
      expect(rawText).not.toContain('ghp_superSecretToken1234567890abcdef')
      expect(rawText).not.toContain('secretToken999')
    })
  })

  describe('2. Client request() Error Mapping', () => {
    it('maps client network failure (e.g. offline) to status 0 and networkError', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      let error: (Error & DashboardError) | null = null
      try {
        await request('/api/dashboard/cgupta21')
      } catch (err) {
        error = err as Error & DashboardError
      }

      expect(error).not.toBeNull()
      expect(error?.status).toBe(0)
      expect(error?.networkError).toBe(true)
      expect(error?.message).toContain('internet connection')
    })

    it('maps upstream 400 response with invalidInput flag', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Invalid GitHub username.', invalidInput: true }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let error: (Error & DashboardError) | null = null
      try {
        await request('/api/dashboard/bad--name')
      } catch (err) {
        error = err as Error & DashboardError
      }

      expect(error).not.toBeNull()
      expect(error?.status).toBe(400)
      expect(error?.invalidInput).toBe(true)
    })

    it('maps upstream 502 response with upstreamError flag', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'GitHub service is temporarily unavailable.', upstreamError: true }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let error: (Error & DashboardError) | null = null
      try {
        await request('/api/dashboard/someuser')
      } catch (err) {
        error = err as Error & DashboardError
      }

      expect(error).not.toBeNull()
      expect(error?.status).toBe(502)
      expect(error?.upstreamError).toBe(true)
    })
  })
})
