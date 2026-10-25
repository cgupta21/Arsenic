import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompareResponse, Dashboard } from '../types'

export interface DashboardError {
  message: string
  status?: number
  authError?: boolean
  rateLimit?: boolean
  reset?: string | number | null
  retryAfter?: string | number | null
  secondary?: boolean
  timedOut?: boolean
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 18_000

export async function request<T>(url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  let timerId: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs > 0) {
    timerId = setTimeout(() => controller.abort(), timeoutMs)
  }

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort()
    } else {
      init.signal.addEventListener('abort', () => controller.abort())
    }
  }

  try {
    const response = await fetch(url, { credentials: 'include', ...init, signal: controller.signal })
    if (timerId) clearTimeout(timerId)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const isTimeout = response.status === 504 || Boolean(body.timeout)
      const err: Error & DashboardError = Object.assign(
        new Error(
          body.error ||
          (isTimeout
            ? 'GitHub took too long to respond (request timed out). Please try again.'
            : response.status === 404
            ? 'User not found.'
            : 'Request failed.')
        ),
        {
          authError: Boolean(body.authError),
          status: response.status,
          rateLimit: Boolean(body.rateLimit) || response.status === 429,
          reset: body.reset ?? null,
          retryAfter: body.retryAfter ?? null,
          secondary: Boolean(body.secondary),
          timedOut: isTimeout
        }
      )
      throw err
    }
    return body as T
  } catch (caught: unknown) {
    if (timerId) clearTimeout(timerId)
    const errObj = caught instanceof Error ? caught : null
    if (errObj?.name === 'AbortError') {
      if (init?.signal?.aborted) {
        const cancelErr = new Error('Request was cancelled.')
        cancelErr.name = 'AbortError'
        throw cancelErr
      }
      const timeoutErr: Error & DashboardError = Object.assign(
        new Error('Request timed out after 18 seconds. GitHub or the server took too long to respond.'),
        {
          status: 504,
          timedOut: true
        }
      )
      throw timeoutErr
    }
    throw caught
  }
}

export function useDashboard(initialUsername: string) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<DashboardError | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const genRef = useRef(0)

  const load = useCallback(async (username: string) => {
    const currentGen = ++genRef.current

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const cleanUser = username.replace(/^@/, '').trim()
      const result = await request<Dashboard>(
        `/api/dashboard/${encodeURIComponent(cleanUser)}`,
        { signal: controller.signal }
      )
      if (genRef.current === currentGen) {
        setData(result)
        setLoading(false)
      }
      return result
    } catch (caught: unknown) {
      const isAbort = caught instanceof Error && caught.name === 'AbortError'
      if (isAbort && controller.signal.aborted && genRef.current !== currentGen) {
        return
      }

      if (genRef.current === currentGen) {
        const message = caught instanceof Error ? caught.message : 'Unable to load GitHub data.'
        const custom = caught as Partial<DashboardError>
        const status = typeof custom?.status === 'number' ? custom.status : undefined
        const authError = Boolean(custom?.authError)
        const rateLimit = Boolean(custom?.rateLimit) || status === 429
        const reset = custom?.reset ?? null
        const retryAfter = custom?.retryAfter ?? null
        const secondary = Boolean(custom?.secondary)
        const timedOut = Boolean(custom?.timedOut) || status === 504

        const errObj: DashboardError = { message, status, authError, rateLimit, reset, retryAfter, secondary, timedOut }
        setError(errObj)
        setLoading(false)
      }
      throw caught
    }
  }, [])

  useEffect(() => {
    void load(initialUsername).catch(() => {})
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [initialUsername, load])

  return { data, loading, error, load }
}

export async function compareDashboards(left: string, right: string) {
  return request<CompareResponse>(`/api/compare/${encodeURIComponent(left.replace(/^@/, ''))}/${encodeURIComponent(right.replace(/^@/, ''))}`)
}

export async function consumeGuestSearch(username?: string) {
  return request<{ allowed: boolean; authenticated: boolean; searchesRemaining: number | null; loginRequired?: boolean }>(
    '/api/search/consume',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(username ? { username } : {})
    }
  )
}

export async function generateSummary(username: string) {
  return request<{ summary: string; model: string; cached?: boolean }>(`/api/summary/${encodeURIComponent(username)}`, { method: 'POST' })
}

export async function getSessionUser() {
  return request<{ user: { login: string; name: string | null; avatar_url: string } | null; provider?: 'github' | 'google' | null }>('/api/me')
}
