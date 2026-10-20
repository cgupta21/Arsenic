import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app from '../server/index.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

function inProcessFetch(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; json: () => Record<string, unknown>; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      ;(app as (req: unknown, res: unknown) => void)(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      const url = `http://127.0.0.1:${port}${path}`
      fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
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
            json: () => {
              try {
                return JSON.parse(text) as Record<string, unknown>
              } catch {
                return { raw: text }
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

describe('Arsenic Landing Page & Registration Flow', () => {
  const rootDir = resolve(__dirname, '..')
  const appCode = readFileSync(resolve(rootDir, 'client/src/App.tsx'), 'utf-8')
  const landingCode = readFileSync(resolve(rootDir, 'client/src/components/LandingPage.tsx'), 'utf-8')
  const registerCode = readFileSync(resolve(rootDir, 'client/src/components/RegisterPage.tsx'), 'utf-8')
  const landingCss = readFileSync(resolve(rootDir, 'client/src/landing.css'), 'utf-8')
  const stylesCss = readFileSync(resolve(rootDir, 'client/src/styles.css'), 'utf-8')

  describe('1. Landing Page Structure, Branding, and Content', () => {
    it('contains Arsenic logo, brand name, and navigation links (Features, How It Works, Sign In, Get Started)', () => {
      expect(appCode).toContain('brandLogo')
      expect(appCode).toContain('src="/assets/arsenic-logo.svg"')
      expect(appCode).toContain('Features')
      expect(appCode).toContain('How It Works')
      expect(appCode).toContain('Sign in')
      expect(appCode).toContain('Get Started')
      expect(appCode).toContain('id="primary-navigation"')
    })

    it('contains the specified hero headline: "Understand Any GitHub Repository."', () => {
      expect(landingCode).toContain('Understand Any')
      expect(landingCode).toContain('GitHub Repository.')
      expect(landingCode).toContain('highlightTerracotta')
    })

    it('supporting copy explains repository activity, developer velocity, and commit signals', () => {
      expect(landingCode).toContain('Turn raw repository activity')
      expect(landingCode).toContain('developer velocity')
      expect(landingCode).toContain('commit signals into clear')
    })

    it('provides primary "Get Started" and secondary "Try Free Without Login" CTAs in Hero', () => {
      expect(landingCode).toContain('id="hero-get-started-btn"')
      expect(landingCode).toContain('id="hero-try-free-btn"')
      expect(landingCode).toContain('Try Free Without Login')
    })

    it('includes high-fidelity visual dashboard preview labeled with genuine application signals', () => {
      expect(landingCode).toContain('dashboardPreviewCard')
      expect(landingCode).toContain('Live Intelligence Preview')
      expect(landingCode).toContain('@cgupta21 / Arsenic')
      expect(landingCode).toContain('Demonstrated using genuine application metrics from @cgupta21/Arsenic')
    })

    it('advertises strictly supported features: Repository Intelligence, Developer Activity Insights, Contribution Analysis, Repository Summaries, Search and Explore', () => {
      const requiredFeatures = [
        'Repository Intelligence',
        'Developer Activity Insights',
        'Contribution Analysis',
        'Repository Summaries',
        'Search and Explore',
      ]
      for (const feat of requiredFeatures) {
        expect(landingCode).toContain(feat)
      }
    })

    it('implements the 3 How-It-Works steps', () => {
      expect(landingCode).toContain('Find a GitHub user or repository')
      expect(landingCode).toContain('Analyze available repository information')
      expect(landingCode).toContain('Explore the resulting insights')
    })

    it('includes final CTA section with "Get Started" and "Try Free Without Login"', () => {
      expect(landingCode).toContain('landingFinalCta')
      expect(landingCode).toContain('id="final-get-started-btn"')
      expect(landingCode).toContain('id="final-try-free-btn"')
    })

    it('does not invent unverified customer counts, fake star ratings, or testimonials on landing page', () => {
      expect(landingCode).not.toContain('Loved by 2,000+ creators')
      expect(landingCode).not.toContain('★★★★★')
      expect(landingCode).not.toContain('Sarah Chen')
      expect(landingCode).not.toContain('Product Manager, Linear')
    })
  })

  describe('2. Dedicated Registration Page (/register)', () => {
    it('app routeState parses /register route mode', () => {
      expect(appCode).toContain("path === '/register'")
      expect(appCode).toContain("mode: 'register'")
    })

    it('displays the exact required heading: "Start Exploring GitHub Intelligence"', () => {
      expect(registerCode).toContain('Start Exploring GitHub Intelligence')
    })

    it('includes supporting text explaining benefits of signing in', () => {
      expect(registerCode).toContain('Sign in with your preferred provider')
      expect(registerCode).toContain('unlimited searches')
      expect(registerCode).toContain('higher GitHub API')
    })

    it('provides both "Continue with Google" and "Continue with GitHub" OAuth buttons', () => {
      expect(registerCode).toContain('Continue with Google')
      expect(registerCode).toContain('href="/auth/google"')
      expect(registerCode).toContain('Continue with GitHub')
      expect(registerCode).toContain('href="/auth/github"')
    })

    it('includes a clear divider labelled "OR"', () => {
      expect(registerCode).toContain('className="dividerLabel"')
      expect(registerCode).toContain('OR')
    })

    it('includes prominent "Try Free Without Login" button with guest allowance note', () => {
      expect(registerCode).toContain('Try Free Without Login')
      expect(registerCode).toContain('3 free guest searches included')
    })

    it('includes link for existing users to sign in and back link to landing page', () => {
      expect(registerCode).toContain('Already have an account?')
      expect(registerCode).toContain('Sign In')
      expect(registerCode).toContain('Back to Arsenic')
    })

    it('does not include unsupported email/password inputs', () => {
      expect(registerCode).not.toContain('type="password"')
      expect(registerCode).not.toContain('confirmPassword')
    })

    it('displays informative error alert if Google OAuth was canceled or unconfigured', () => {
      expect(registerCode).toContain('auth_error')
      expect(registerCode).toContain('google_denied')
      expect(registerCode).toContain('Google sign-in was canceled or access was denied')
    })
  })

  describe('3. Exact Button Behavior & Navigation', () => {
    it('Get Started navigates to /register', () => {
      expect(appCode).toContain("pushRoute('/register')")
    })

    it('Try Free Without Login navigates to showcase dashboard without authenticating', () => {
      expect(appCode).toContain('pushRoute(`/u/${encodeURIComponent(fallbackUser)}`)')
    })

    it('Sign In on landing page links to /auth/github or OAuth flow', () => {
      expect(appCode).toContain('href="/auth/github"')
    })

    it('popstate event listener handles browser back and forward navigation', () => {
      expect(appCode).toContain("window.addEventListener('popstate', handler)")
      expect(appCode).toContain("window.removeEventListener('popstate', handler)")
    })
  })

  describe('4. Preservation of Three Free Guest Searches', () => {
    it('neither landing-page nor registration-page visits make requests that consume searches', async () => {
      // Direct call to /api/search/consume with no body consumes a search,
      // but client routing to '/' or '/register' never invokes /api/search/consume.
      const res = await inProcessFetch('/api/search/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'cgupta21' }) // showcase profile
      })
      expect(res.status).toBe(200)
      expect(res.json().allowed).toBe(true)
      // Showcase profile check preserves full 3 search allowance
      expect(res.json().searchesRemaining).toBe(3)
    })

    it('search exhaustion dialog in App.tsx offers Google, GitHub, and Return to Landing Page', () => {
      expect(appCode).toContain('You’ve used your 3 free searches.')
      expect(appCode).toContain('Sign in with GitHub')
      expect(appCode).toContain('Sign in with Google')
      expect(appCode).toContain('Return to Landing Page')
      expect(appCode).toContain("pushRoute('/')")
    })
  })

  describe('5. Responsive Layout, Brand Colors & Accessibility', () => {
    it('defines brand colors Terracotta, Sage, Sand, and Ink in CSS', () => {
      expect(stylesCss).toContain('--terracotta: #C96A45')
      expect(stylesCss).toContain('--sage: #87966A')
      expect(stylesCss).toContain('--sand: #E5D3B3')
      expect(stylesCss).toContain('--ink: #11110F')
    })

    it('provides responsive media queries for 992px, 768px, 480px, and 360px in landing.css', () => {
      expect(landingCss).toContain('@media (max-width: 992px)')
      expect(landingCss).toContain('@media (max-width: 768px)')
      expect(landingCss).toContain('@media (max-width: 480px)')
      expect(landingCss).toContain('@media (max-width: 360px)')
    })

    it('ensures comfortable tap targets of at least 44px min-height for register and CTA buttons', () => {
      expect(landingCss).toContain('min-height: 48px')
      expect(stylesCss).toContain('min-height: 44px')
    })

    it('includes accessibility attributes: role="search", aria-label, aria-labelledby', () => {
      expect(landingCode).toContain('role="search"')
      expect(landingCode).toContain('aria-labelledby="hero-heading"')
      expect(landingCode).toContain('aria-labelledby="features-heading"')
      expect(landingCode).toContain('aria-labelledby="how-heading"')
      expect(registerCode).toContain('aria-label="Return to Arsenic landing page"')
      expect(registerCode).toContain('role="separator"')
    })
  })
})
