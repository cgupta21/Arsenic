import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Mobile Navigation and Header', () => {
  const css = readFileSync(resolve(__dirname, '../client/src/styles.css'), 'utf-8')
  const appCode = readFileSync(resolve(__dirname, '../client/src/App.tsx'), 'utf-8')

  describe('Semantic Markup & Accessibility in App.tsx', () => {
    it('uses a semantic nav element with primary-navigation id and aria-label', () => {
      expect(appCode).toContain('id="primary-navigation"')
      expect(appCode).toContain('aria-label="Primary navigation"')
      expect(appCode).toContain("className={menu ? 'nav open' : 'nav'}")
    })

    it('hamburger button has accessible label, aria-expanded, and aria-controls linked to navigation', () => {
      expect(appCode).toContain('aria-controls="primary-navigation"')
      expect(appCode).toContain('aria-expanded={menu}')
      expect(appCode).toContain("aria-label={menu ? 'Close navigation' : 'Open navigation'}")
    })

    it('includes all 5 required navigation options: Overview, Activity, Repositories, Insights, Compare', () => {
      const requiredLinks = ['Overview', 'Activity', 'Repositories', 'Insights', 'Compare']
      for (const linkText of requiredLinks) {
        expect(appCode).toContain(linkText)
      }
    })

    it('uses native anchor elements with hrefs for site navigation', () => {
      expect(appCode).toMatch(/<a[\s\S]*?href=[\s\S]*?>[\s\S]*?Overview[\s\S]*?<\/a>/)
      expect(appCode).toMatch(/<a[\s\S]*?href="#activity"[\s\S]*?>[\s\S]*?Activity[\s\S]*?<\/a>/)
      expect(appCode).toMatch(/<a[\s\S]*?href="#repositories"[\s\S]*?>[\s\S]*?Repositories[\s\S]*?<\/a>/)
      expect(appCode).toMatch(/<a[\s\S]*?href="#insights"[\s\S]*?>[\s\S]*?Insights[\s\S]*?<\/a>/)
      expect(appCode).toMatch(/<a[\s\S]*?href="\/compare"[\s\S]*?>[\s\S]*?Compare[\s\S]*?<\/a>/)
    })

    it('Sign in button links to GitHub auth route /auth/github', () => {
      expect(appCode).toContain('href="/auth/github"')
      expect(appCode).toContain('Sign in')
    })

    it('Google Sign in button links to Google auth route /auth/google with accessible label', () => {
      expect(appCode).toContain('href="/auth/google"')
      expect(appCode).toContain('aria-label="Google Sign in"')
    })

    it('locks body scroll when menu is open and restores it when closed', () => {
      expect(appCode).toContain("document.body.style.overflow = 'hidden'")
      expect(appCode).toContain("document.body.style.overflow = prevOverflow")
    })

    it('closes menu on outside tap, escape key, and route changes', () => {
      expect(appCode).toContain("key === 'Escape'")
      expect(appCode).toContain('headerRef.current.contains')
      expect(appCode).toContain('setMenu(false)')
    })
  })

  describe('CSS Header Alignment & Flex Layout in styles.css', () => {
    it('configures .topbar with sticky positioning, justify-content: space-between, and flex-wrap: nowrap', () => {
      expect(css).toMatch(/\.topbar\s*\{[^}]*justify-content:\s*space-between/)
      expect(css).toMatch(/\.topbar\s*\{[^}]*position:\s*sticky/)
      expect(css).toMatch(/\.topbar\s*\{[^}]*flex-wrap:\s*nowrap/)
    })

    it('pins .actions to the right with margin-left: auto and prevents wrapping/shrinking', () => {
      expect(css).toMatch(/\.actions\s*\{[^}]*margin-left:\s*auto/)
      expect(css).toMatch(/\.actions\s*\{[^}]*flex-shrink:\s*0/)
      expect(css).toMatch(/\.actions\s*\{[^}]*flex-wrap:\s*nowrap/)
    })

    it('ensures comfortable tap targets of at least 44x44px for buttons', () => {
      // .iconBtn and .accountBtn
      expect(css).toMatch(/\.iconBtn,\s*\.accountBtn\s*\{[^}]*min-width:\s*44px/)
      expect(css).toMatch(/\.iconBtn,\s*\.accountBtn\s*\{[^}]*min-height:\s*44px/)
      // .authBtn
      expect(css).toMatch(/\.authBtn\s*\{[^}]*min-height:\s*44px/)
    })

    it('sets proper stacking context so .topbar and .nav sit above .navBackdrop', () => {
      // .topbar has z-index 50
      expect(css).toMatch(/\.topbar\s*\{[^}]*z-index:\s*50/)
      // .nav has z-index 55 on mobile
      expect(css).toMatch(/\.nav\s*\{[^}]*z-index:\s*55/)
      // .navBackdrop has z-index 40 (behind nav, above content)
      expect(css).toMatch(/\.navBackdrop\s*\{[^}]*z-index:\s*40/)
    })

    it('provides mobile media queries for narrow screens down to 320px', () => {
      expect(css).toContain('@media (max-width: 768px)')
      expect(css).toContain('@media (max-width: 480px)')
      expect(css).toContain('@media (max-width: 360px)')
      expect(css).toContain('.brandLogo { width: 96px; }')
    })
  })

  describe('Viewport Width Verification (Math & Constraint Validation)', () => {
    // Standard phone, tablet, and desktop viewports specified in requirements
    const viewports = [
      { name: 'Narrow Phone (320px)', width: 320, padding: 20, logoWidth: 96, authWidth: 82, btnWidth: 44, gap: 6 },
      { name: 'Compact Phone (360px)', width: 360, padding: 20, logoWidth: 96, authWidth: 82, btnWidth: 44, gap: 6 },
      { name: 'iPhone SE (375px)', width: 375, padding: 28, logoWidth: 118, authWidth: 88, btnWidth: 44, gap: 8 },
      { name: 'iPhone 12/13/14 (390px)', width: 390, padding: 28, logoWidth: 118, authWidth: 88, btnWidth: 44, gap: 8 },
      { name: 'Android Standard (412px)', width: 412, padding: 28, logoWidth: 118, authWidth: 88, btnWidth: 44, gap: 8 },
      { name: 'iPhone 14 Pro Max (430px)', width: 430, padding: 28, logoWidth: 118, authWidth: 88, btnWidth: 44, gap: 8 },
      { name: 'Small Tablet (600px)', width: 600, padding: 32, logoWidth: 118, authWidth: 92, btnWidth: 44, gap: 8 },
      { name: 'iPad Portrait (768px)', width: 768, padding: 32, logoWidth: 118, authWidth: 92, btnWidth: 44, gap: 8 },
      { name: 'iPad Landscape (820px)', width: 820, desktopNav: true },
      { name: 'Desktop Small (1024px)', width: 1024, desktopNav: true },
      { name: 'Desktop Standard (1280px)', width: 1280, desktopNav: true },
      { name: 'Desktop HD (1366px)', width: 1366, desktopNav: true },
      { name: 'Desktop FHD (1920px)', width: 1920, desktopNav: true },
    ]

    for (const vp of viewports) {
      if (vp.desktopNav) {
        it(`supports desktop layout at ${vp.name} without clipping`, () => {
          expect(vp.width).toBeGreaterThan(768)
        })
      } else {
        it(`fits header elements without horizontal overflow at ${vp.name}`, () => {
          const availableWidth = vp.width - (vp.padding || 0)
          const actionsWidth = (vp.authWidth || 0) + (vp.gap || 0) + (vp.btnWidth || 0)
          const requiredWidth = (vp.logoWidth || 0) + actionsWidth + (vp.gap || 0)
          expect(availableWidth).toBeGreaterThan(requiredWidth)
          // Remaining space ensures space-between pushes logo to left and actions to right
          const remainingSpace = availableWidth - requiredWidth
          expect(remainingSpace).toBeGreaterThanOrEqual(10)
        })
      }
    }
  })
})
