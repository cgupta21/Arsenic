import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Origin: 'http://127.0.0.1:5173',
          ...(options.headers ?? {}),
        },
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

describe('Arsenic — Legal Compliance, Privacy, Security & Accessibility Suite', () => {
  const rootDir = resolve(__dirname, '..')
  const appCode = readFileSync(resolve(rootDir, 'client/src/App.tsx'), 'utf-8')
  const landingCode = readFileSync(resolve(rootDir, 'client/src/components/LandingPage.tsx'), 'utf-8')
  const stylesCss = readFileSync(resolve(rootDir, 'client/src/styles.css'), 'utf-8')
  const landingCss = readFileSync(resolve(rootDir, 'client/src/landing.css'), 'utf-8')
  const privacyCode = readFileSync(resolve(rootDir, 'client/src/components/legal/PrivacyPolicy.tsx'), 'utf-8')
  const termsCode = readFileSync(resolve(rootDir, 'client/src/components/legal/TermsOfService.tsx'), 'utf-8')
  const cookiesCode = readFileSync(resolve(rootDir, 'client/src/components/legal/CookiePolicy.tsx'), 'utf-8')

  describe('1. Standalone Legal Components & Routing', () => {
    it('verifies that all dedicated legal components exist on disk', () => {
      expect(existsSync(resolve(rootDir, 'client/src/components/legal/PrivacyPolicy.tsx'))).toBe(true)
      expect(existsSync(resolve(rootDir, 'client/src/components/legal/TermsOfService.tsx'))).toBe(true)
      expect(existsSync(resolve(rootDir, 'client/src/components/legal/CookiePolicy.tsx'))).toBe(true)
      expect(existsSync(resolve(rootDir, 'client/src/components/legal/index.ts'))).toBe(true)
    })

    it('verifies routeState() supports /privacy, /terms, and /cookies', () => {
      expect(appCode).toContain("path === '/privacy'")
      expect(appCode).toContain("path === '/terms'")
      expect(appCode).toContain("path === '/cookies'")
      expect(appCode).toContain("mode: 'privacy'")
      expect(appCode).toContain("mode: 'terms'")
      expect(appCode).toContain("mode: 'cookies'")
    })

    it('sets appropriate page document titles for each legal route', () => {
      expect(appCode).toContain("'Privacy Policy — Arsenic'")
      expect(appCode).toContain("'Terms of Service — Arsenic'")
      expect(appCode).toContain("'Cookie Policy — Arsenic'")
    })

    it('renders dedicated legal views with accessible main landmark container', () => {
      expect(appCode).toContain('<PrivacyPolicy')
      expect(appCode).toContain('<TermsOfService')
      expect(appCode).toContain('<CookiePolicy')
    })
  })

  describe('2. Footer Legal Navigation & Brand Integrity', () => {
    it('contains a dedicated Legal column in Footer with navigation triggers', () => {
      expect(appCode).toContain('Legal')
      expect(appCode).toContain("pushRoute('/privacy')")
      expect(appCode).toContain("pushRoute('/terms')")
      expect(appCode).toContain("pushRoute('/cookies')")
    })

    it('retains in-context OAuth Transparency popup trigger in Footer', () => {
      expect(appCode).toContain('OAuth Transparency')
      expect(appCode).toContain('onOpenPrivacy')
    })

    it('displays official non-affiliation disclaimers covering GitHub and Google', () => {
      expect(appCode).toContain('Not affiliated with GitHub, Inc. or Google LLC.')
      expect(termsCode).toContain('not affiliated with, endorsed by, sponsored by, or operated by GitHub, Inc., Microsoft Corporation, or Google LLC')
    })

    it('displays the official contact email across legal pages and footer', () => {
      const email = 'arsenic.helpdesk@gmail.com'
      expect(appCode).toContain(email)
      expect(privacyCode).toContain(email)
      expect(termsCode).toContain(email)
      expect(cookiesCode).toContain(email)
    })
  })

  describe('3. Privacy Policy & Cookie Disclosures Accuracy', () => {
    it('accurately identifies operator as an individual developer in India without fabricated corporate entities', () => {
      expect(privacyCode).toContain('Individual developer based in India')
      expect(privacyCode).toContain('Arsenic is not a registered corporate entity or business')
      expect(termsCode).toContain('individual software developer based in India')
    })

    it('transparently confirms no application database is used', () => {
      expect(privacyCode).toContain('No Application Database')
      expect(privacyCode).toContain('Arsenic operates without a database')
    })

    it('documents the 2 strictly essential first-party cookies (session and oauth_state) and discloses guest quota tracking', () => {
      expect(cookiesCode).toContain('session')
      expect(cookiesCode).toContain('oauth_state')
      expect(cookiesCode).toContain('7 days')
      expect(cookiesCode).toContain('10 minutes')
      expect(cookiesCode).toContain('Strictly Essential')
      expect(cookiesCode).toContain('guestSearches')
      expect(cookiesCode).toContain('searchedProfiles')
      expect(privacyCode).toContain('guestSearches')
      expect(privacyCode).toContain('searchedProfiles')
    })

    it('accurately distinguishes public dashboard cache (10 min) from summary text cache (1 hour)', () => {
      expect(privacyCode).toContain('cached in server RAM for up to 10 minutes')
      expect(privacyCode).toContain('generated summary text is cached for up to 1 hour')
    })

    it('does not claim that a GitHub numeric user ID is persisted', () => {
      expect(privacyCode).toContain('do not persist a numeric user ID')
    })

    it('separately documents browser localStorage as local device storage, not a cookie', () => {
      expect(cookiesCode).toContain('arsenic-recent-searches')
      expect(cookiesCode).toContain('window.localStorage')
      expect(cookiesCode).toContain('localStorage is client-side storage, NOT an HTTP cookie')
    })

    it('explains the legal basis for strictly necessary cookies under ePrivacy/PECR and distinguishes DPDP', () => {
      expect(cookiesCode).toContain('Legal Basis for Strictly Necessary Cookies')
      expect(cookiesCode).toContain('strictly necessary')
      expect(cookiesCode).toContain('Directive 2002/58/EC')
      expect(cookiesCode).toContain('Distinction from India')
    })

    it('accurately articulates the DPDP Act 2023 phased commencement schedule without premature enforcement claims', () => {
      expect(privacyCode).toContain('Digital Personal Data Protection Act, 2023')
      expect(privacyCode).toContain('13 November 2025')
      expect(privacyCode).toContain('13 November 2026')
      expect(privacyCode).toContain('13 May 2027')
      expect(privacyCode).toContain('Section 6(9)')
      expect(privacyCode).toContain('Section 27(1)(d)')
      expect(privacyCode).toContain('Sections 3 through 17')
    })

    it('accurately specifies user-facing encryption and integrity protection without unverified AES-256-GCM claims', () => {
      expect(privacyCode).toContain('authenticated encryption and cryptographic integrity protection')
      expect(privacyCode).not.toContain('AES-256-GCM')
      expect(cookiesCode).toContain('encrypted, integrity-protected session payload')
      expect(cookiesCode).not.toContain('AES-256-GCM')
    })

    it('clearly distinguishes application-controlled deletion from third-party and hosting-provider retention', () => {
      expect(privacyCode).toContain('Stateless Session Cookie Expiration')
      expect(privacyCode).toContain('Scope of Logout')
      expect(privacyCode).toContain('Local Search History (Client-Side Storage)')
      expect(privacyCode).toContain('Third-Party Platform Retention')
      expect(privacyCode).toContain('Hosting Infrastructure Logs')
    })

    it('accurately discloses least-privilege read:user GitHub OAuth scope without requesting repo or user:email', () => {
      expect(privacyCode).toContain('<code>read:user</code>')
      expect(privacyCode).not.toContain('<code>read:user, user:email</code>')
      expect(privacyCode).toContain('no <code>repo</code> scope')
      expect(privacyCode).toContain('no <code>user:email</code> scope')
      expect(privacyCode).toContain('never accesses private repository names, source code, commits, issues, pull requests')
      expect(privacyCode).toContain('Private contribution counts are not guaranteed')
    })

    it('verifies App.tsx does not falsely or unconditionally claim private contributions are enabled', () => {
      expect(appCode).not.toContain('{privateForSelf && <span>Private contribution counts enabled</span>}')
      expect(appCode).toContain('Private contribution data included')
      expect(appCode).toContain('Private contribution data unavailable')
      expect(appCode).toContain('No private contribution aggregates returned.')
      expect(appCode).not.toContain('(0 detected — verify GitHub profile settings)')
    })

    it('verifies UI does not claim to determine user GitHub visibility settings from a zero count', () => {
      expect(appCode).toContain('Arsenic cannot determine which is the case.')
    })
  })

  describe('4. Business Model & Refund Transparency', () => {
    it('accurately discloses completely free business model and zero payment transactions', () => {
      expect(termsCode).toContain('100% Free Application — No Payment Transactions')
      expect(termsCode).toContain('Arsenic is currently provided completely free of charge')
      expect(termsCode).toContain('subscriptions, paid feature tiers, enterprise licenses, or digital products')
    })

    it('features transparent Refund Policy confirming no refunds apply because no purchases exist', () => {
      expect(termsCode).toContain('Refund Policy:')
      expect(termsCode).toContain('no refund, payment reversal, or billing cancellation process applies')
    })

    it('includes non-excludable statutory rights reservation in Terms of Service', () => {
      expect(termsCode).toContain('Statutory Consumer Rights:')
      expect(termsCode).toContain('Consumer Protection Act, 2019')
      expect(termsCode).toContain('Non-Excludable Statutory Rights:')
    })

    it('describes Data Fiduciary role conditionally and notes absence of Significant Data Fiduciary designation', () => {
      expect(privacyCode).toContain('operator may be characterized as a Data Fiduciary')
      expect(privacyCode).toContain('has not received any formal designation as a Significant Data Fiduciary')
    })
  })

  describe('5. Marketing & Algorithmic Integrity', () => {
    it('has replaced unsupported "AI summaries" with accurate "automated summaries"', () => {
      expect(landingCode).not.toContain('AI summaries')
      expect(landingCode).toContain('automated summaries')
    })

    it('accurately explains deterministic summary generation in legal documentation', () => {
      expect(privacyCode).toContain('deterministic algorithmic rules')
      expect(privacyCode).toContain('do not transmit profile data to external artificial intelligence')
      expect(termsCode).toContain('deterministic algorithmic heuristics')
    })
  })

  describe('6. Accessibility (WCAG 2.2 AA Compliance)', () => {
    it('provides a "Skip to main content" link at the top of App.tsx', () => {
      expect(appCode).toContain('Skip to main content')
      expect(appCode).toContain('href="#main-content"')
      expect(appCode).toContain('className="skipToContent"')
    })

    it('includes skipToContent and srOnly accessibility classes in CSS', () => {
      expect(stylesCss).toContain('.skipToContent')
      expect(stylesCss).toContain('.srOnly')
      expect(stylesCss).toContain('clip: rect(0, 0, 0, 0)')
    })

    it('associates an accessible label with the LandingPage search input', () => {
      expect(landingCode).toContain('<label htmlFor="landing-search-input" className="srOnly">')
      expect(landingCode).toContain('id="landing-search-input"')
    })

    it('provides high contrast text colors for footer text exceeding 4.5:1 ratio', () => {
      // Replaced #70736a with #A8ABA0 which yields >4.5:1 on #11110F
      expect(stylesCss).toContain('#A8ABA0')
      expect(stylesCss).not.toMatch(/\.footerBottom\s*\{[^}]*color:\s*#70736a/)
    })

    it('ensures primary CTA buttons satisfy WCAG AA contrast (>= 4.5:1) in all interactive states (M-04)', () => {
      function srgbToLinear(c: number): number {
        const v = c / 255
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      function relativeLuminance(hex: string): number {
        let clean = hex.replace('#', '')
        if (clean.length === 3) clean = clean.split('').map((x) => x + x).join('')
        const r = parseInt(clean.substring(0, 2), 16)
        const g = parseInt(clean.substring(2, 4), 16)
        const b = parseInt(clean.substring(4, 6), 16)
        return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
      }
      function contrastRatio(hex1: string, hex2: string): number {
        const l1 = relativeLuminance(hex1)
        const l2 = relativeLuminance(hex2)
        const lighter = Math.max(l1, l2)
        const darker = Math.min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
      }

      const terracotta = '#C96A45'
      const hoverTerracotta = '#d47651'
      const activeTerracotta = '#c4643f'
      const darkText = '#11110F'
      const appDarkText = '#17120f'
      const pageBg = '#11110F'

      // Default state contrast: must meet or exceed WCAG AA 4.5:1 for normal text
      const defaultContrast = contrastRatio(darkText, terracotta)
      expect(defaultContrast).toBeGreaterThanOrEqual(4.5)
      expect(defaultContrast).toBeCloseTo(5.07, 1)

      // Hover state contrast: must meet or exceed 4.5:1
      const hoverContrast = contrastRatio(darkText, hoverTerracotta)
      expect(hoverContrast).toBeGreaterThanOrEqual(4.5)
      expect(hoverContrast).toBeCloseTo(5.86, 1)

      // Active state contrast: must meet or exceed 4.5:1
      const activeContrast = contrastRatio(darkText, activeTerracotta)
      expect(activeContrast).toBeGreaterThanOrEqual(4.5)
      expect(activeContrast).toBeCloseTo(4.72, 1)

      // Application styles.css primaryBtn contrast
      const appBtnContrast = contrastRatio(appDarkText, terracotta)
      expect(appBtnContrast).toBeGreaterThanOrEqual(4.5)

      // Focus indicator contrast against dark page background: must meet or exceed WCAG 3:1 non-text requirement
      const focusRingContrast = contrastRatio(terracotta, pageBg)
      expect(focusRingContrast).toBeGreaterThanOrEqual(3.0)

      // Verify landing.css does not use #fff on terracotta for primary CTA buttons
      expect(landingCss).not.toMatch(/\.landingCtaPrimary\s*\{[^}]*color:\s*#fff/)
      expect(landingCss).not.toMatch(/\.finalCtaPrimary\s*\{[^}]*color:\s*#fff/)
      expect(landingCss).not.toMatch(/\.navGetStartedBtn\s*\{[^}]*color:\s*#fff/)
      expect(landingCss).not.toMatch(/\.landingSearchSubmitBtn:hover\s*\{[^}]*color:\s*#fff/)

      // Verify landing.css defines dark text #11110F on primary buttons
      expect(landingCss).toMatch(/\.landingCtaPrimary\s*\{[^}]*color:\s*#11110F/)
      expect(landingCss).toMatch(/\.finalCtaPrimary\s*\{[^}]*color:\s*#11110F/)
      expect(landingCss).toMatch(/\.navGetStartedBtn\s*\{[^}]*color:\s*#11110F/)
      expect(landingCss).toMatch(/\.landingSearchSubmitBtn:hover\s*\{[^}]*color:\s*#11110F/)
    })

    it('ensures all views contain a main landmark container with id="main-content"', () => {
      expect(appCode).toContain('<main id="main-content">')
    })
  })

  describe('7. Server-Side SPA Routing for Legal Paths', () => {
    it('serves SPA HTML (status 200) for /privacy route', async () => {
      const res = await inProcessFetch('/privacy')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
    })

    it('serves SPA HTML (status 200) for /terms route', async () => {
      const res = await inProcessFetch('/terms')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
    })

    it('serves SPA HTML (status 200) for /cookies route', async () => {
      const res = await inProcessFetch('/cookies')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
    })
  })
})
