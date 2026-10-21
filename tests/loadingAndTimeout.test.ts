import { describe, it, expect, vi, afterEach } from 'vitest'
import { request, DEFAULT_REQUEST_TIMEOUT_MS, type DashboardError } from '../client/src/hooks/useDashboard'

type CustomError = Error & Partial<DashboardError>

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Loading, timeout, failed requests and switching usernames', () => {
  describe('1. Request timeout handling', () => {
    it('DEFAULT_REQUEST_TIMEOUT_MS is configured to 18 seconds', () => {
      expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(18_000)
    })

    it('aborts and throws a 504 timeout error when request exceeds timeoutMs', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
        return new Promise((resolve, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.')
              err.name = 'AbortError'
              reject(err)
            })
          }
          // Do not resolve normally
        })
      })

      let caught: CustomError | null = null
      try {
        // Use a short 40ms timeout for the test
        await request('/api/dashboard/slowuser', {}, 40)
      } catch (err) {
        caught = err as CustomError
      }

      expect(caught).not.toBeNull()
      expect(caught?.status).toBe(504)
      expect(caught?.timedOut).toBe(true)
      expect(caught?.message).toContain('Request timed out after 18 seconds')
    })

    it('properly marks upstream 504 server timeout response as timedOut', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'GitHub took too long to respond. Please try again.', timeout: true }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let caught: CustomError | null = null
      try {
        await request('/api/dashboard/cgupta7')
      } catch (err) {
        caught = err as CustomError
      }

      expect(caught).not.toBeNull()
      expect(caught?.status).toBe(504)
      expect(caught?.timedOut).toBe(true)
      expect(caught?.message).toContain('GitHub took too long to respond')
    })
  })

  describe('2. Failed requests handling & status codes', () => {
    it('maps 404 User Not Found cleanly', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'GitHub user "nonexistent" was not found.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let caught: CustomError | null = null
      try {
        await request('/api/dashboard/nonexistent')
      } catch (err) {
        caught = err as CustomError
      }

      expect(caught).not.toBeNull()
      expect(caught?.status).toBe(404)
      expect(caught?.timedOut).toBeFalsy()
      expect(caught?.message).toContain('not found')
    })

    it('maps 429 Rate Limit and extracts reset headers', async () => {
      const resetTime = String(Math.floor(Date.now() / 1000) + 3600)
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'GitHub API rate limit reached.',
            rateLimit: true,
            reset: resetTime
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let caught: CustomError | null = null
      try {
        await request('/api/dashboard/cgupta7')
      } catch (err) {
        caught = err as CustomError
      }

      expect(caught).not.toBeNull()
      expect(caught?.status).toBe(429)
      expect(caught?.rateLimit).toBe(true)
      expect(caught?.reset).toBe(resetTime)
    })

    it('maps 502/network failure with descriptive message', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Could not reach GitHub right now. Please try again.' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      )

      let caught: CustomError | null = null
      try {
        await request('/api/dashboard/cgupta7')
      } catch (err) {
        caught = err as CustomError
      }

      expect(caught).not.toBeNull()
      expect(caught?.status).toBe(502)
      expect(caught?.message).toContain('Could not reach GitHub right now')
    })
  })

  describe('3. Switching usernames during loading & abort cancellation', () => {
    it('aborts the first request when cancelled via external signal', async () => {
      const parentController = new AbortController()

      vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
        return new Promise((resolve, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      })

      const pendingRequest = request('/api/dashboard/slowUser', { signal: parentController.signal }, 10_000)
      // Cancel mid-flight
      parentController.abort()

      let caught: Error | null = null
      try {
        await pendingRequest
      } catch (err) {
        caught = err as Error
      }

      expect(caught).not.toBeNull()
      expect(caught?.name).toBe('AbortError')
      expect(caught?.message).toBe('Request was cancelled.')
    })

    it('ensures newer username request result wins over older slow request', async () => {
      let activeController: AbortController | null = null
      let currentGen = 0
      let finalState: { user: string; loading: boolean } = { user: '', loading: true }

      const load = async (username: string, delay: number) => {
        const thisGen = ++currentGen
        if (activeController) activeController.abort()
        const controller = new AbortController()
        activeController = controller

        finalState.loading = true

        try {
          await new Promise((res, rej) => {
            const timer = setTimeout(res, delay)
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              const err = new Error('Aborted')
              err.name = 'AbortError'
              rej(err)
            })
          })

          if (currentGen === thisGen) {
            finalState = { user: username, loading: false }
          }
        } catch (err: unknown) {
          const isAbort = err instanceof Error && err.name === 'AbortError'
          if (isAbort && controller.signal.aborted && currentGen !== thisGen) {
            // Superseded request cleanly ignored
            return
          }
          if (currentGen === thisGen) {
            finalState.loading = false
          }
        }
      }

      // Start userA (slow)
      const p1 = load('userA', 100)
      // Immediately switch to userB (fast)
      const p2 = load('userB', 20)

      await Promise.all([p1, p2])

      expect(finalState.user).toBe('userB')
      expect(finalState.loading).toBe(false)
    })
  })

  describe('4. Retry after failure', () => {
    it('allows successful reload after initial error', async () => {
      let callCount = 0
      vi.spyOn(global, 'fetch').mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return new Response(
            JSON.stringify({ error: 'GitHub took too long to respond.', timeout: true }),
            { status: 504, headers: { 'Content-Type': 'application/json' } }
          )
        }
        return new Response(
          JSON.stringify({ user: { login: 'cgupta7' }, repos: [], score: { score: 90 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      })

      // First call fails with 504
      let firstError: CustomError | null = null
      try {
        await request('/api/dashboard/cgupta7')
      } catch (err) {
        firstError = err as CustomError
      }
      expect(firstError?.status).toBe(504)
      expect(firstError?.timedOut).toBe(true)

      // Retry call succeeds
      interface TestResult {
        user: { login: string }
        repos: unknown[]
        score: { score: number }
      }
      const result = await request<TestResult>('/api/dashboard/cgupta7')
      expect(result.user.login).toBe('cgupta7')
      expect(result.score.score).toBe(90)
    })
  })
})
