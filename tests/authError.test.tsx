/**
 * Regression test: when the GitHub API returns 401, the client-side request()
 * helper must attach authError=true to the thrown Error so that the UI can
 * distinguish an expired-token failure from a generic network error.
 *
 * These tests run in plain Node (no DOM required) by calling the exported
 * async helpers from useDashboard.ts directly and mocking global fetch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { compareDashboards } from '../client/src/hooks/useDashboard'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch401(urlPart: string) {
  const body = JSON.stringify({ error: 'GitHub authentication expired. Please sign in again.', authError: true })
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString()
    if (url.includes(urlPart)) {
      return new Response(body, { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`Unexpected fetch to ${url}`)
  })
}

describe('Auth error handling — request() helper', () => {
  it('attaches authError=true when /api/compare returns 401', async () => {
    mockFetch401('/api/compare/')
    let caughtError: Error & { authError?: boolean } | null = null
    try {
      await compareDashboards('userA', 'userB')
    } catch (err) {
      caughtError = err as Error & { authError?: boolean }
    }
    expect(caughtError).not.toBeNull()
    expect(caughtError?.message).toContain('GitHub authentication expired')
    expect(caughtError?.authError).toBe(true)
  })

  it('does not attach authError when the error body omits authError', async () => {
    const body = JSON.stringify({ error: 'Not found.' })
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(body, { status: 404, headers: { 'Content-Type': 'application/json' } })
    )
    let caughtError: Error & { authError?: boolean } | null = null
    try {
      await compareDashboards('userA', 'userB')
    } catch (err) {
      caughtError = err as Error & { authError?: boolean }
    }
    expect(caughtError).not.toBeNull()
    expect(caughtError?.authError).toBeFalsy()
  })
})

