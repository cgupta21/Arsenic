import { describe, expect, it, vi, afterEach } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
// @ts-expect-error – server/index.js is plain JS
import app from '../server/index.js'
import {
  escapeXml,
  renderBadgeSvg,
  estimateTextWidth,
  resolveBadgeColor,
  APPROVED_BADGE_COLORS,
  DEFAULT_BADGE_COLOR,
} from '../shared/badge.js'
import { getHealthGrade, getHealthGradeColor } from '../shared/score.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const nativeFetch = global.fetch

function inProcessBadgeFetch(
  path: string
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      nativeFetch(url)
        .then(async (r) => {
          const text = await r.text()
          const hdrs: Record<string, string> = {}
          r.headers.forEach((value, key) => {
            hdrs[key] = value
          })
          resolve({
            status: r.status,
            text,
            headers: hdrs,
          })
        })
        .catch(reject)
        .finally(() => server.close())
    })
    server.on('error', reject)
  })
}

describe('SVG Badge Generation & Endpoint', () => {
  describe('1. XML escaping and text measurement', () => {
    it('escapes XML special characters safely (quotes, ampersands, angle brackets)', () => {
      const dangerous = '<script>alert("xss")&\'test\'</script>'
      const escaped = escapeXml(dangerous)
      expect(escaped).not.toContain('<')
      expect(escaped).not.toContain('>')
      expect(escaped).not.toContain('"')
      expect(escaped).not.toContain("'")
      expect(escaped).toContain('&lt;script&gt;')
      expect(escaped).toContain('&quot;xss&quot;')
      expect(escaped).toContain('&apos;test&apos;')
      expect(escaped).toContain('&amp;')
    })

    it('escapes quotes, ampersands, and angle brackets in isolated strings', () => {
      expect(escapeXml('a & b')).toBe('a &amp; b')
      expect(escapeXml('<tag>')).toBe('&lt;tag&gt;')
      expect(escapeXml('"double"')).toBe('&quot;double&quot;')
      expect(escapeXml("'single'")).toBe('&apos;single&apos;')
      expect(escapeXml('foo && "bar" <baz> \'qux\'')).toBe(
        'foo &amp;&amp; &quot;bar&quot; &lt;baz&gt; &apos;qux&apos;'
      )
    })

    it('handles null/undefined gracefully in escapeXml', () => {
      expect(escapeXml(null)).toBe('')
      expect(escapeXml(undefined)).toBe('')
      expect(escapeXml(123)).toBe('123')
    })

    it('measures text widths reasonably', () => {
      const shortWidth = estimateTextWidth('a')
      const longWidth = estimateTextWidth('arsenic-developer-intelligence')
      expect(longWidth).toBeGreaterThan(shortWidth * 5)
    })
  })

  describe('2. Badge Color Validation and Fallback', () => {
    it('approves all valid health-grade colors', () => {
      expect(APPROVED_BADGE_COLORS.has('#58A65C')).toBe(true)
      expect(APPROVED_BADGE_COLORS.has('#87966A')).toBe(true)
      expect(APPROVED_BADGE_COLORS.has('#D4A373')).toBe(true)
      expect(APPROVED_BADGE_COLORS.has('#C96A45')).toBe(true)
      expect(APPROVED_BADGE_COLORS.has('#7A7870')).toBe(true)
    })

    it('resolves valid colors and normalizes lowercase hex', () => {
      expect(resolveBadgeColor('#58A65C')).toBe('#58A65C')
      expect(resolveBadgeColor('#58a65c')).toBe('#58A65C')
      expect(resolveBadgeColor('#87966A')).toBe('#87966A')
      expect(resolveBadgeColor('#d4a373')).toBe('#D4A373')
      expect(resolveBadgeColor('#c96a45')).toBe('#C96A45')
      expect(resolveBadgeColor('#7a7870')).toBe('#7A7870')
    })

    it('falls back to #87966A for invalid colors and injection attempts', () => {
      expect(resolveBadgeColor('red')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('#000000')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('#ffffff')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('#123456')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('"><script>alert(1)</script>')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('#58A65C" onload="alert(1)"')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor('url(#gradient)')).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor(null)).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor(undefined)).toBe(DEFAULT_BADGE_COLOR)
      expect(resolveBadgeColor(123)).toBe(DEFAULT_BADGE_COLOR)
    })
  })

  describe('3. SVG Badge Markup Generation & Injection Prevention', () => {
    it('generates well-formed SVG with title, aria-label, and clips', () => {
      const svg = renderBadgeSvg({
        label: 'arsenic',
        value: '94/100 • Excellent Health',
        statusColor: '#58A65C',
      })

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
      expect(svg).toContain('</svg>')
      expect(svg).toContain('role="img"')
      expect(svg).toContain('aria-label="arsenic: 94/100 • Excellent Health"')
      expect(svg).toContain('<title>arsenic: 94/100 • Excellent Health</title>')
      expect(svg).toContain('fill="#58A65C"')
      expect(svg).toContain('94/100 • Excellent Health')
    })

    it('safely escapes special characters and neutralizes injection attempts in badge parameters', () => {
      const svg = renderBadgeSvg({
        label: 'evil<tag>&"quotes"\'',
        value: 'malicious"&\'payload<script>',
        statusColor: '#123456"><script>alert(1)</script>',
        title: 'Title with <markup> & "quotes" \'apostrophe\'',
      })

      // Script tags and raw angle brackets must not exist
      expect(svg).not.toContain('<script>')
      expect(svg).not.toContain('</script>')
      expect(svg).not.toContain('<tag>')
      expect(svg).not.toContain('<markup>')

      // Escaped entities must be present
      expect(svg).toContain('&lt;tag&gt;&amp;&quot;quotes&quot;&apos;')
      expect(svg).toContain('malicious&quot;&amp;&apos;payload&lt;script&gt;')
      expect(svg).toContain('aria-label="Title with &lt;markup&gt; &amp; &quot;quotes&quot; &apos;apostrophe&apos;"')
      expect(svg).toContain('<title>Title with &lt;markup&gt; &amp; &quot;quotes&quot; &apos;apostrophe&apos;</title>')

      // Malicious color must be replaced with the safe fallback color
      expect(svg).toContain('fill="#87966A"')
      expect(svg).not.toContain('#123456')
    })
  })

  describe('3. Unified Health Grade & Color Logic', () => {
    it('assigns grades across all thresholds identically', () => {
      expect(getHealthGrade(95)).toBe('Excellent Health')
      expect(getHealthGrade(85)).toBe('Excellent Health')
      expect(getHealthGrade(84)).toBe('Strong Health')
      expect(getHealthGrade(70)).toBe('Strong Health')
      expect(getHealthGrade(69)).toBe('Moderate Health')
      expect(getHealthGrade(50)).toBe('Moderate Health')
      expect(getHealthGrade(49)).toBe('Developing Health')
      expect(getHealthGrade(30)).toBe('Developing Health')
      expect(getHealthGrade(29)).toBe('Low Activity')
      expect(getHealthGrade(0)).toBe('Low Activity')
    })

    it('returns brand-aligned colors for health grades', () => {
      expect(getHealthGradeColor(90)).toBe('#58A65C')
      expect(getHealthGradeColor(75)).toBe('#87966A')
      expect(getHealthGradeColor(55)).toBe('#D4A373')
      expect(getHealthGradeColor(35)).toBe('#C96A45')
      expect(getHealthGradeColor(15)).toBe('#7A7870')
    })
  })

  describe('4. GET /badge/:username Endpoint', () => {
    it('rejects invalid GitHub usernames with 400 and returns valid error SVG', async () => {
      const res = await inProcessBadgeFetch('/badge/invalid--username')
      expect(res.status).toBe(400)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.text).toContain('<svg')
      expect(res.text).toContain('invalid user')
    })

    it('returns 404 and valid error SVG for non-existent user', async () => {
      // Mock global fetch to return 404 from GitHub
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const res = await inProcessBadgeFetch('/badge/nonexistentuser404')
      expect(res.status).toBe(404)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.text).toContain('<svg')
      expect(res.text).toContain('user not found')
    })

    it('returns 429 and valid error SVG when upstream is rate limited', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800),
          },
        })
      })

      const res = await inProcessBadgeFetch('/badge/ratelimiteduser')
      expect(res.status).toBe(429)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.text).toContain('<svg')
      expect(res.text).toContain('rate limited')
    })

    it('returns 504 and valid error SVG when GitHub times out', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        throw abortErr
      })

      const res = await inProcessBadgeFetch('/badge/timeoutuser')
      expect(res.status).toBe(504)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.text).toContain('<svg')
      expect(res.text).toContain('timeout')
    })

    it('returns 200 and SVG score badge for a successfully resolved user', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = String(input)
        if (urlStr.includes('127.0.0.1')) return nativeFetch(input, init)
        if (urlStr.includes('/users/badgehero/repos')) {
          return new Response(JSON.stringify([
            {
              id: 1,
              name: 'test-repo',
              stargazers_count: 50,
              forks_count: 5,
              open_issues_count: 1,
              updated_at: '2026-10-20T00:00:00Z',
              pushed_at: '2026-10-20T00:00:00Z',
              fork: false,
            }
          ]), { headers: { 'Content-Type': 'application/json' } })
        }
        if (urlStr.includes('/users/badgehero/events/public')) {
          return new Response(JSON.stringify([
            {
              type: 'PushEvent',
              created_at: '2026-10-20T12:00:00Z',
              payload: { commits: [{}, {}] },
            }
          ]), { headers: { 'Content-Type': 'application/json' } })
        }
        if (urlStr.includes('/users/badgehero')) {
          return new Response(JSON.stringify({
            login: 'badgehero',
            name: 'Badge Hero',
            avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
            public_repos: 1,
            followers: 10,
            following: 5,
          }), { headers: { 'Content-Type': 'application/json' } })
        }
        return nativeFetch(input, init)
      })

      const res = await inProcessBadgeFetch('/badge/badgehero')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.headers['cache-control']).toContain('public, max-age=3600')
      expect(res.text).toContain('<svg')
      expect(res.text).toContain('arsenic')
      expect(res.text).toMatch(/\d+\/100 • (Excellent|Strong|Moderate|Developing|Low)/)
    })

    it('also responds via /api/badge/:username endpoint', async () => {
      const res = await inProcessBadgeFetch('/api/badge/invalid--user')
      expect(res.status).toBe(400)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.text).toContain('invalid user')
    })
  })
})
