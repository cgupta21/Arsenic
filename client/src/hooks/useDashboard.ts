import { useCallback, useEffect, useState } from 'react'
import type { CompareResponse, Dashboard } from '../types'

export interface DashboardError {
  message: string
  status?: number
  authError?: boolean
  rateLimit?: boolean
  reset?: string | number | null
  retryAfter?: string | number | null
  secondary?: boolean
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err: Error & DashboardError = Object.assign(
      new Error(body.error || (response.status === 404 ? 'User not found.' : 'Request failed.')),
      {
        authError: Boolean(body.authError),
        status: response.status,
        rateLimit: Boolean(body.rateLimit),
        reset: body.reset ?? null,
        retryAfter: body.retryAfter ?? null,
        secondary: Boolean(body.secondary)
      }
    )
    throw err
  }
  return body as T
}

export function useDashboard(initialUsername: string) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<DashboardError | null>(null)

  const load = useCallback(async (username: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await request<Dashboard>(`/api/dashboard/${encodeURIComponent(username.replace(/^@/, ''))}`)
      setData(result)
      return result
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load GitHub data.'
      const custom = caught as Partial<DashboardError>
      const status = typeof custom?.status === 'number' ? custom.status : undefined
      const authError = Boolean(custom?.authError)
      const rateLimit = Boolean(custom?.rateLimit) || status === 429
      const reset = custom?.reset ?? null
      const retryAfter = custom?.retryAfter ?? null
      const secondary = Boolean(custom?.secondary)

      const errObj: DashboardError = { message, status, authError, rateLimit, reset, retryAfter, secondary }
      setError(errObj)
      throw caught
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(initialUsername)
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
  return request<{ user: { login: string; name: string | null; avatar_url: string } | null }>('/api/me')
}
