import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RepoCard } from '../client/src/components/RepoCard'
import type { Repo } from '../client/src/types'

function makeTestRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    name: 'test-repo',
    html_url: 'https://github.com/cgupta21/test-repo',
    description: 'Test repository description',
    language: 'TypeScript',
    stargazers_count: 5,
    forks_count: 2,
    open_issues_count: 1,
    updated_at: '2026-11-10T13:29:26Z',
    pushed_at: '2026-11-15T10:47:50Z',
    fork: false,
    archived: false,
    status: 'active',
    daysSince: 0,
    issueRatio: 12.5,
    ...overrides,
  }
}

describe('Repository Portfolio Card — Timestamp & Sorting Integrity', () => {
  describe('1. RepoCard display and label', () => {
    it('displays "Last push 0d ago" for a repository pushed today even if metadata updated_at is older', () => {
      const todayIso = new Date().toISOString()
      const fiveDaysAgoIso = new Date(Date.now() - 5 * 86400000).toISOString()

      const repo = makeTestRepo({
        pushed_at: todayIso,
        updated_at: fiveDaysAgoIso,
        issueRatio: 0,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      // Must display Last push label with 0d ago
      expect(html).toContain('Last push 0d ago')
      // Must NOT use old "Updated" label
      expect(html).not.toMatch(/Updated \d+d ago/)
      // Preserves issue ratio
      expect(html).toContain('issue ratio 0%')
    })

    it('does not display recent activity for an old repository that only had metadata modified recently', () => {
      const ninetyDaysAgoIso = new Date(Date.now() - 90 * 86400000).toISOString()
      const twoDaysAgoIso = new Date(Date.now() - 2 * 86400000).toISOString()

      const repo = makeTestRepo({
        pushed_at: ninetyDaysAgoIso,
        updated_at: twoDaysAgoIso, // e.g. someone starred it or edited description 2 days ago
        issueRatio: 5.5,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      // Must reflect the 90d old push, not the 2d old metadata update
      expect(html).toContain('Last push 90d ago')
      expect(html).not.toContain('Last push 2d ago')
      expect(html).toContain('issue ratio 5.5%')
    })

    it('displays "Repository metadata updated Xd ago" when pushed_at is missing or null but updated_at is valid', () => {
      const fourteenDaysAgoIso = new Date(Date.now() - 14 * 86400000).toISOString()

      const repo = makeTestRepo({
        pushed_at: null,
        updated_at: fourteenDaysAgoIso,
        issueRatio: 3.2,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      expect(html).toContain('Repository metadata updated 14d ago')
      expect(html).not.toContain('Last push')
      expect(html).toContain('issue ratio 3.2%')
    })

    it('displays "Repository metadata updated Xd ago" when pushed_at is undefined but updated_at is valid', () => {
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()

      const repo = makeTestRepo({
        pushed_at: undefined,
        updated_at: sevenDaysAgoIso,
        issueRatio: 0,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      expect(html).toContain('Repository metadata updated 7d ago')
      expect(html).not.toContain('Last push')
      expect(html).toContain('issue ratio 0%')
    })

    it('displays "Push date unavailable" when neither pushed_at nor updated_at is valid', () => {
      const repo = makeTestRepo({
        pushed_at: null,
        updated_at: '',
        issueRatio: 10,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      expect(html).toContain('Push date unavailable · issue ratio 10%')
      expect(html).not.toContain('Last push')
      expect(html).not.toContain('Repository metadata updated')
    })

    it('displays "Push date unavailable" when both dates are invalid strings', () => {
      const repo = makeTestRepo({
        pushed_at: 'invalid-date',
        updated_at: 'not-a-date',
        issueRatio: 0,
      })

      const html = renderToStaticMarkup(React.createElement(RepoCard, { repo }))

      expect(html).toContain('Push date unavailable · issue ratio 0%')
    })
  })

  describe('2. Sorting by "Recently updated" (pushed_at || updated_at descending)', () => {
    it('prioritizes latest code push over metadata update timestamps', () => {
      const repoA: Repo = makeTestRepo({
        id: 1,
        name: 'repo-A-recent-push',
        pushed_at: '2026-11-15T12:00:00Z', // Push today
        updated_at: '2026-11-01T00:00:00Z', // Old metadata
      })

      const repoB: Repo = makeTestRepo({
        id: 2,
        name: 'repo-B-recent-meta-only',
        pushed_at: '2026-11-05T00:00:00Z', // Push 10 days ago
        updated_at: '2026-11-14T00:00:00Z', // Metadata updated yesterday
      })

      const repoC: Repo = makeTestRepo({
        id: 3,
        name: 'repo-C-no-push-fallback',
        pushed_at: null,
        updated_at: '2026-11-12T00:00:00Z', // Fallback
      })

      const repoD: Repo = makeTestRepo({
        id: 4,
        name: 'repo-D-oldest',
        pushed_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      })

      const repos = [repoB, repoD, repoA, repoC]

      // Sort implementation matching client/src/App.tsx line 850
      const sorted = [...repos].sort((a, b) => {
        const timeA = a.pushed_at || a.updated_at ? new Date(a.pushed_at || a.updated_at).getTime() : 0
        const timeB = b.pushed_at || b.updated_at ? new Date(b.pushed_at || b.updated_at).getTime() : 0
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA)
      })

      const names = sorted.map((r) => r.name)

      // Repo A (pushed Nov 15) must be #1, followed by Repo C (Nov 12 fallback), then Repo B (Nov 5 push), then Repo D (Oct 1)
      expect(names).toEqual([
        'repo-A-recent-push',
        'repo-C-no-push-fallback',
        'repo-B-recent-meta-only',
        'repo-D-oldest',
      ])
    })
  })
})
