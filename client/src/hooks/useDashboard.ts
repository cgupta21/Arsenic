import { useCallback, useEffect, useState } from 'react'
import type { CompareResponse, Dashboard } from '../types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err: Error & { authError?: boolean } = Object.assign(
      new Error(body.error || 'Request failed.'),
      { authError: Boolean(body.authError) }
    )
    throw err
  }
  return body as T
}

export function useDashboard(initialUsername: string) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; authError?: boolean } | null>(null)

  const load = useCallback(async (username: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await request<Dashboard>(`/api/dashboard/${encodeURIComponent(username.replace(/^@/, ''))}`)
      setData(result)
      return result
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load GitHub data.'
      const authError = caught instanceof Error && Boolean((caught as Error & { authError?: boolean }).authError)
      setError({ message, authError })
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

export async function consumeGuestSearch() {
  return request<{ allowed: boolean; authenticated: boolean; searchesRemaining: number | null; loginRequired?: boolean }>(
    '/api/search/consume',
    { method: 'POST' }
  )
}

export async function generateSummary(username: string) {
  return request<{ summary: string; model: string; cached?: boolean }>(`/api/summary/${encodeURIComponent(username)}`, { method: 'POST' })
}

export async function getSessionUser() {
  return request<{ user: { login: string; name: string | null; avatar_url: string } | null }>('/api/me')
}
