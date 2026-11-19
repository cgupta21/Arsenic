import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Arsenic Website Improvements — SEO, Social Sharing, UX, Privacy & Footer', () => {
  const rootDir = resolve(__dirname, '..')
  const indexHtml = readFileSync(resolve(rootDir, 'client/index.html'), 'utf-8')
  const appCode = readFileSync(resolve(rootDir, 'client/src/App.tsx'), 'utf-8')
  const stylesCss = readFileSync(resolve(rootDir, 'client/src/styles.css'), 'utf-8')
  const serverCode = readFileSync(resolve(rootDir, 'server/index.js'), 'utf-8')
  const vercelConfig = JSON.parse(readFileSync(resolve(rootDir, 'vercel.json'), 'utf-8'))

  describe('1. Open Graph, Twitter Cards, Social Preview & Favicons', () => {
    it('preserves existing title, description, and theme color in client/index.html', () => {
      expect(indexHtml).toContain('<title>Arsenic — Developer Intelligence</title>')
      expect(indexHtml).toContain('<meta name="description" content="Arsenic — GitHub developer intelligence, contribution patterns and repository health." />')
      expect(indexHtml).toContain('<meta name="theme-color" content="#11110F" />')
    })

    it('includes complete Open Graph metadata in client/index.html', () => {
      expect(indexHtml).toContain('<meta property="og:type" content="website" />')
      expect(indexHtml).toContain('<meta property="og:url" content="https://arsenic-rho.vercel.app/" />')
      expect(indexHtml).toContain('<meta property="og:title" content="Arsenic — Developer Intelligence" />')
      expect(indexHtml).toContain('<meta property="og:description" content="Arsenic — GitHub developer intelligence, contribution patterns and repository health." />')
      expect(indexHtml).toContain('<meta property="og:image" content="https://arsenic-rho.vercel.app/assets/social-preview.png" />')
      expect(indexHtml).toContain('<meta property="og:image:width" content="1200" />')
      expect(indexHtml).toContain('<meta property="og:image:height" content="630" />')
    })

    it('includes Twitter Card summary_large_image metadata in client/index.html', () => {
      expect(indexHtml).toContain('<meta name="twitter:card" content="summary_large_image" />')
      expect(indexHtml).toContain('<meta name="twitter:title" content="Arsenic — Developer Intelligence" />')
      expect(indexHtml).toContain('<meta name="twitter:description" content="Arsenic — GitHub developer intelligence, contribution patterns and repository health." />')
      expect(indexHtml).toContain('<meta name="twitter:image" content="https://arsenic-rho.vercel.app/assets/social-preview.png" />')
    })

    it('includes canonical URL and standard favicon links in client/index.html', () => {
      expect(indexHtml).toContain('<link rel="canonical" href="https://arsenic-rho.vercel.app/" />')
      expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />')
      expect(indexHtml).toContain('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />')
      expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
      expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    })

    it('all referenced favicon, icon, and preview assets exist with non-zero size', () => {
      const requiredAssets = [
        'public/assets/social-preview.png',
        'public/assets/favicon.svg',
        'public/assets/icon-192.png',
        'public/assets/icon-512.png',
        'public/favicon.ico',
        'public/apple-touch-icon.png',
        'public/manifest.webmanifest',
      ]
      for (const assetRel of requiredAssets) {
        const fullPath = resolve(rootDir, assetRel)
        expect(existsSync(fullPath), `Asset ${assetRel} should exist`).toBe(true)
        const stats = statSync(fullPath)
        expect(stats.size, `Asset ${assetRel} should have non-zero size`).toBeGreaterThan(0)
      }
    })

    it('social-preview.png has exact 1200x630 dimensions (read from PNG IHDR chunk)', () => {
      const imgPath = resolve(rootDir, 'public/assets/social-preview.png')
      const buffer = readFileSync(imgPath)
      // Standard PNG: byte 12-15 = 'IHDR', 16-19 = width (big-endian), 20-23 = height (big-endian)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      expect(width).toBe(1200)
      expect(height).toBe(630)
    })
  })

  describe('2. Profile-Specific Social Sharing & Crawler Delivery', () => {
    it('vercel.json routes social crawler User-Agents for /u/:username to /api/meta/:username', () => {
      const rewrites = vercelConfig.rewrites || []
      const crawlerRewrite = rewrites.find((r: { source?: string; destination?: string; has?: Array<{ type: string; key: string }> }) =>
        r.source === '/u/:username' && r.destination === '/api/meta/:username'
      )
      expect(crawlerRewrite).toBeDefined()
      expect(crawlerRewrite.has).toBeDefined()
      expect(crawlerRewrite.has[0].type).toBe('header')
      expect(crawlerRewrite.has[0].key.toLowerCase()).toBe('user-agent')
      const uaRegex = crawlerRewrite.has[0].value
      expect(uaRegex).toContain('bot')
      expect(uaRegex).toContain('facebookexternalhit')
      expect(uaRegex).toContain('twitterbot')
      expect(uaRegex).toContain('slackbot')
      expect(uaRegex).toContain('whatsapp')
    })

    it('server/index.js supports /api/meta/:username and dynamic meta tag delivery', () => {
      expect(serverCode).toContain('/api/meta/:username')
      expect(serverCode).toContain('og:title')
      expect(serverCode).toContain('og:image')
    })

    it('api/meta/[username].js serves crawler-ready HTML with profile-specific Open Graph tags', async () => {
      // @ts-expect-error – api handler is plain JS without declaration files
      const handlerModule = await import('../api/meta/[username].js')
      const handler = handlerModule.default

      let responseStatus = 200
      const responseHeaders: Record<string, string> = {}
      let responseBody = ''

      const req = {
        query: { username: 'torvalds' },
        headers: { host: 'arsenic-rho.vercel.app' },
      }
      const res = {
        status(code: number) {
          responseStatus = code
          return this
        },
        setHeader(k: string, v: string) {
          responseHeaders[k] = v
          return this
        },
        send(html: string) {
          responseBody = html
          return this
        },
      }

      handler(req, res)

      expect(responseStatus).toBe(200)
      expect(responseHeaders['Content-Type']).toContain('text/html')
      expect(responseBody).toContain('content="Arsenic — @torvalds"')
      expect(responseBody).toContain('content="https://arsenic-rho.vercel.app/u/torvalds"')
      expect(responseBody).toContain('content="https://arsenic-rho.vercel.app/assets/social-preview.png"')
      expect(responseBody).toContain('<link rel="canonical" href="https://arsenic-rho.vercel.app/u/torvalds" />')
      expect(responseBody).toContain('meta http-equiv="refresh"')
    })

    it('api/meta/[username].js rejects invalid username injections with 400', async () => {
      // @ts-expect-error – api handler is plain JS without declaration files
      const handlerModule = await import('../api/meta/[username].js')
      const handler = handlerModule.default

      let responseStatus = 200
      let responseBody = ''

      const req = {
        query: { username: 'invalid/user/path' },
        headers: { host: 'arsenic-rho.vercel.app' },
      }
      const res = {
        status(code: number) {
          responseStatus = code
          return this
        },
        setHeader() {
          return this
        },
        send(html: string) {
          responseBody = html
          return this
        },
      }

      handler(req, res)

      expect(responseStatus).toBe(400)
      expect(responseBody).toContain('Invalid username')
    })
  })

  describe('3. Accurate GitHub OAuth Privacy Note', () => {
    it('verifies server/index.js OAuth scopes are strictly least-privilege read-only', () => {
      // Confirm the requested scope is strictly read:user
      expect(serverCode).toMatch(/scope:\s*['"]read:user['"]/)
      // Ensure no repo, write, or private email scopes are configured
      expect(serverCode).not.toMatch(/scope:\s*['"][^'"]*\brepo\b[^'"]*['"]/)
      expect(serverCode).not.toMatch(/scope:\s*['"][^'"]*\buser:email\b[^'"]*['"]/)
      expect(serverCode).not.toContain('repo:status')
      expect(serverCode).not.toContain('write:org')
      expect(serverCode).not.toContain('delete_repo')
    })

    it('verifies session mechanism uses encrypted iron-session cookies without database persistence', () => {
      expect(serverCode).toContain('iron-session')
      expect(serverCode).toContain('sessionOptions')
      // No database imports or connection strings in server
      expect(serverCode).not.toContain('mongoose')
      expect(serverCode).not.toMatch(/['"]pg['"]/)
      expect(serverCode).not.toContain('prisma')
    })

    it('presents verified privacy claims in App.tsx Privacy Modal and Login Prompt', () => {
      // Explains scopes requested
      expect(appCode).toContain('read:user')
      expect(appCode).not.toContain('<code>read:user, user:email')
      // Explains read-only nature and zero write permissions
      expect(appCode).toContain('Zero write operations')
      expect(appCode).toContain('read-only scopes')
      // Explains session storage and zero database persistence
      expect(appCode).toContain('No persistent database')
      expect(appCode).toContain('Encrypted session cookie')
      expect(appCode).toContain('Third-Party Sharing')
      // Trigger accessible via privacy buttons in header and footer
      expect(appCode).toContain('className="privacyBtn"')
      expect(appCode).toContain('setPrivacyOpen(true)')
    })
  })

  describe('4. Empty, Loading, and Error States (A through E)', () => {
    it('implements Scenario A: GitHub user not found (404) with preserved search and retry', () => {
      expect(appCode).toContain('Developer "@{username}" not found')
      expect(appCode).toContain('Try again')
      expect(appCode).toContain('query')
    })

    it('implements Scenario B: No public repositories handled gracefully as non-error informative state', () => {
      expect(appCode).toContain('emptyRepoCard')
      expect(appCode).toContain('No public repositories to analyze')
      expect(appCode).toContain('does not have any accessible public repositories')
    })

    it('implements Scenario C: GitHub API rate limit reached with reset time and sign-in prompt', () => {
      expect(appCode).toContain('GitHub API rate limit reached')
      expect(appCode).toContain('Rate limit window resets at')
      expect(appCode).toContain('Sign in with GitHub')
      expect(appCode).toContain('Unauthenticated requests are limited to 60 requests/hour')
    })

    it('implements Scenario D: GitHub API unavailable or network failure with retry action', () => {
      expect(appCode).toContain('GitHub service temporarily unavailable')
      expect(appCode).toContain('Retry connection')
    })

    it('implements Scenario E: Estimated activity badge and limitations disclosure note', () => {
      expect(appCode).toContain('estimateNotice')
      expect(appCode).toContain('estimateBadge')
      expect(appCode).toContain('Estimated from public events')
      expect(appCode).toContain('Sign in with GitHub for higher rate limits')
    })
  })

  describe('5. Consistent Website Footer', () => {
    it('renders responsive footer with developer name, project link, and description in App.tsx', () => {
      expect(appCode).toContain('className="siteFooter"')
      expect(appCode).toContain('Chandan Kumar Gupta')
      expect(appCode).toContain('https://github.com/cgupta21')
      expect(appCode).toContain('https://github.com/cgupta21/Arsenic')
      expect(appCode).toContain('GitHub developer intelligence, contribution analytics and repository health scoring.')
      expect(appCode).toContain('new Date().getFullYear()')
    })

    it('opens external developer and repository links safely with target="_blank" and rel="noopener noreferrer"', () => {
      expect(appCode).toMatch(/href="https:\/\/github\.com\/cgupta21"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/)
      expect(appCode).toMatch(/href="https:\/\/github\.com\/cgupta21\/Arsenic"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/)
    })

    it('includes responsive styling for .siteFooter and error cards in styles.css', () => {
      expect(stylesCss).toContain('.siteFooter')
      expect(stylesCss).toContain('.stateCard')
      expect(stylesCss).toContain('.emptyRepoCard')
      expect(stylesCss).toContain('.estimateBadge')
      expect(stylesCss).toContain('.privacyModal')
    })
  })

  describe('6. Dashboard Contribution Signal Card Layout Sizing', () => {
    it('applies contributionCard class and non-stretching sizing to One-year contribution signal card', () => {
      expect(appCode).toMatch(/<Card\s+className="contributionCard"[\s\S]*?One-year contribution signal/)
      expect(stylesCss).toMatch(/\.contributionCard[\s\S]*?align-self:\s*start/)
      expect(stylesCss).toMatch(/\.contributionCard[\s\S]*?min-height:\s*auto/)
      expect(stylesCss).toMatch(/\.contributionCard[\s\S]*?height:\s*fit-content/)
    })
  })

  describe('7. Dashboard Analytics Rearrangement & Landscape Layout', () => {
    it('structures analytics cards in the exact circular rearrangement with landscape contribution signal', () => {
      expect(appCode).toContain('dashboardColumns')
      expect(appCode).toContain('dashboardColLeft')
      expect(appCode).toContain('dashboardColRight')
      expect(appCode).toContain('dashboardFullWidth')
      expect(stylesCss).toContain('.dashboardColumns')
      expect(stylesCss).toContain('.dashboardCol')
      expect(stylesCss).toContain('.dashboardFullWidth')

      // Left column contains: Intelligence dimensions (L1) and 8-week contribution trend (L2)
      expect(appCode).toMatch(/dashboardColLeft[\s\S]*?dimensionsCard[\s\S]*?trendCard/)

      // Right column contains: Language mix (R1), Developer insights (R2), Commit timing patterns (R3)
      expect(appCode).toMatch(/dashboardColRight[\s\S]*?languagesCard[\s\S]*?insightsCard[\s\S]*?timingCard/)

      // Full-width landscape card contains: One-year contribution signal (365 days)
      expect(appCode).toMatch(/dashboardFullWidth[\s\S]*?contributionCard/)

      // Verifies that CSS order is NOT used to establish semantic order:
      expect(stylesCss).not.toMatch(/\.cardDimensions\s*\{\s*order:/)
      expect(stylesCss).not.toMatch(/\.cardWeeklyTrend\s*\{\s*order:/)
      expect(stylesCss).not.toMatch(/display:\s*contents/)
    })

    it('uses responsive cell sizing for heatmap across screen widths without forced horizontal scroll', () => {
      expect(stylesCss).toMatch(/\.heatmap\s*\{[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/)
      expect(stylesCss).not.toMatch(/\.heatmap\s*\{[^}]*overflow-x:\s*auto/)
    })
  })

  describe('8. One-Year Contribution Signal Observation Window (365 Days)', () => {
    it('uses One-year contribution signal (365 days) heading and 365-day observation window', async () => {
      expect(appCode).toContain("One-year contribution signal (365 days)")

      // @ts-expect-error – server/index.js is plain JS without declaration files
      const serverModule = await import('../server/index.js')
      const result = serverModule.contributionsFromEvents([])
      expect(result.dataQuality.observationWindowDays).toBe(365)

      const days = result.contributionCalendar.weeks[0].contributionDays
      expect(days.length).toBe(365)

      // Timezone boundary check: starts 364 days ago UTC and ends today UTC
      const today = new Date()
      const expectedEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)
      const expectedStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 364)).toISOString().slice(0, 10)

      expect(days[days.length - 1].date).toBe(expectedEnd)
      expect(days[0].date).toBe(expectedStart)
    })
  })
})
