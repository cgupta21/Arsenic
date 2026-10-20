import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawnSync } from 'node:child_process'
// @ts-expect-error – server/index.js is plain JS without declaration files
import app, { fallbackSessionSecret, isPlaceholderSecret, resolveSessionSecret } from '../server/index.js'
import { isValidGitHubUsername, validateGitHubUsername } from '../shared/validation.js'
import { normalizeGithubInput } from '../client/src/lib/normalizeGithubInput.js'

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
            hdrs[key.toLowerCase()] = value
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

describe('Security Hardening & Helmet Middleware', () => {
  const rootDir = resolve(__dirname, '..')
  const vercelConfig = JSON.parse(readFileSync(resolve(rootDir, 'vercel.json'), 'utf-8'))

  it('express app sets standard Helmet security headers on API responses', async () => {
    const res = await inProcessFetch('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(res.headers['content-security-policy']).toBeDefined()
  })

  it('content security policy allows GitHub avatars, data and blob URIs, and unsafe-inline styles', async () => {
    const res = await inProcessFetch('/api/health')
    const csp = res.headers['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('https://avatars.githubusercontent.com')
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("form-action 'self' https://github.com")
  })

  it('vercel.json includes edge security headers for deployed responses', () => {
    expect(vercelConfig.headers).toBeDefined()
    const globalHeaderRule = vercelConfig.headers.find((h: { source: string }) => h.source === '/(.*)')
    expect(globalHeaderRule).toBeDefined()
    const headerMap = Object.fromEntries(
      globalHeaderRule.headers.map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value])
    )
    expect(headerMap['x-content-type-options']).toBe('nosniff')
    expect(headerMap['x-frame-options']).toBe('SAMEORIGIN')
    expect(headerMap['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headerMap['content-security-policy']).toContain('https://avatars.githubusercontent.com')
    expect(headerMap['strict-transport-security']).toContain('max-age=31536000')
  })

  it('crawler metadata endpoint /api/meta/:username sets security headers and handles valid/invalid input', async () => {
    const validRes = await inProcessFetch('/api/meta/torvalds')
    expect(validRes.status).toBe(200)
    expect(validRes.headers['x-content-type-options']).toBe('nosniff')
    expect(validRes.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(validRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')

    const invalidRes = await inProcessFetch('/api/meta/-invalid-user')
    expect(invalidRes.status).toBe(400)
    expect(invalidRes.headers['x-content-type-options']).toBe('nosniff')
    expect(invalidRes.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(invalidRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')

    // Test Vercel Serverless Function api/meta/[username].js handler directly
    // @ts-expect-error – Vercel function is plain JS
    const { default: vercelMetaHandler } = await import('../api/meta/[username].js')
    const headersSet: Record<string, string> = {}
    let returnedStatus = 0
    let returnedBody = ''
    const mockRes = {
      setHeader(name: string, value: string) {
        headersSet[name.toLowerCase()] = value
      },
      status(code: number) {
        returnedStatus = code
        return {
          send(body: string) {
            returnedBody = body
          },
        }
      },
    }
    vercelMetaHandler({ query: { username: '-bad-user' } }, mockRes)
    expect(returnedStatus).toBe(400)
    expect(returnedBody).toBe('Invalid username')
    expect(headersSet['x-content-type-options']).toBe('nosniff')
    expect(headersSet['x-frame-options']).toBe('SAMEORIGIN')
    expect(headersSet['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })
})

describe('GitHub Username Validation (Regex & Server Boundaries)', () => {
  it('validates compliant GitHub usernames using the official specification', () => {
    // 1-character
    expect(isValidGitHubUsername('a')).toBe(true)
    expect(isValidGitHubUsername('1')).toBe(true)
    // standard usernames
    expect(isValidGitHubUsername('octocat')).toBe(true)
    expect(isValidGitHubUsername('cgupta21')).toBe(true)
    expect(isValidGitHubUsername('john-doe')).toBe(true)
    expect(isValidGitHubUsername('a-b-c-1-2-3')).toBe(true)
    // maximum length of 39 characters
    const maxLen = 'a'.repeat(39)
    expect(isValidGitHubUsername(maxLen)).toBe(true)
    expect(isValidGitHubUsername('@octocat')).toBe(true) // leading @ is stripped
  })

  it('rejects invalid GitHub username forms', () => {
    // empty / whitespace
    expect(isValidGitHubUsername('')).toBe(false)
    expect(isValidGitHubUsername('   ')).toBe(false)
    // overlong (40+ characters)
    expect(isValidGitHubUsername('a'.repeat(40))).toBe(false)
    // leading hyphen
    expect(isValidGitHubUsername('-octocat')).toBe(false)
    // trailing hyphen
    expect(isValidGitHubUsername('octocat-')).toBe(false)
    // consecutive hyphens
    expect(isValidGitHubUsername('octo--cat')).toBe(false)
    // special characters & symbols
    expect(isValidGitHubUsername('user@name')).toBe(false)
    expect(isValidGitHubUsername('user.name')).toBe(false)
    expect(isValidGitHubUsername('user/name')).toBe(false)
    expect(isValidGitHubUsername('user$name')).toBe(false)
    expect(isValidGitHubUsername('user name')).toBe(false)
    expect(isValidGitHubUsername('../../hack')).toBe(false)
  })

  it('validateGitHubUsername returns descriptive errors for each violation type', () => {
    expect(validateGitHubUsername('').error).toContain('cannot be empty')
    expect(validateGitHubUsername('a'.repeat(40)).error).toContain('cannot exceed 39 characters')
    expect(validateGitHubUsername('-user').error).toContain('cannot start with a hyphen')
    expect(validateGitHubUsername('user-').error).toContain('cannot end with a hyphen')
    expect(validateGitHubUsername('user--name').error).toContain('cannot contain consecutive hyphens')
    expect(validateGitHubUsername('user.name').error).toContain('may only contain alphanumeric characters and single hyphens')
  })

  it('/api/dashboard/:username returns 400 for invalid usernames without consuming guest quota', async () => {
    const invalidInputs = ['-invalid', 'invalid-', 'in--valid', 'invalid$$name', 'a'.repeat(40)]
    for (const input of invalidInputs) {
      const res = await inProcessFetch(`/api/dashboard/${input}`)
      expect(res.status).toBe(400)
      expect(res.json().error).toContain('Invalid GitHub username')
    }
  })

  it('/api/compare/:left/:right returns 400 when either developer username is invalid', async () => {
    const res1 = await inProcessFetch('/api/compare/-invalidLeft/torvalds')
    expect(res1.status).toBe(400)
    expect(res1.json().error).toContain('Invalid GitHub username')

    const res2 = await inProcessFetch('/api/compare/torvalds/invalid--right')
    expect(res2.status).toBe(400)
    expect(res2.json().error).toContain('Invalid GitHub username')

    const res3 = await inProcessFetch('/api/compare/inv@lid/also$invalid')
    expect(res3.status).toBe(400)
    expect(res3.json().error).toContain('Invalid GitHub username')
  })

  it('/api/summary/:username returns 400 for invalid usernames', async () => {
    const res = await inProcessFetch('/api/summary/invalid--summary-user', {
      method: 'POST',
    })
    expect(res.status).toBe(400)
    expect(res.json().error).toContain('Invalid GitHub username')
  })

  it('client-side normalizeGithubInput validates usernames and URLs with friendly messages', () => {
    // Valid inputs
    expect(normalizeGithubInput('cgupta21').username).toBe('cgupta21')
    expect(normalizeGithubInput('@cgupta21').username).toBe('cgupta21')
    expect(normalizeGithubInput('https://github.com/cgupta21').username).toBe('cgupta21')

    // Invalid formats caught on the client
    expect(normalizeGithubInput('-cgupta').error).toContain('cannot start with a hyphen')
    expect(normalizeGithubInput('cgupta-').error).toContain('cannot end with a hyphen')
    expect(normalizeGithubInput('c--gupta').error).toContain('cannot contain consecutive hyphens')
    expect(normalizeGithubInput('a'.repeat(40)).error).toContain('cannot exceed 39 characters')
    expect(normalizeGithubInput('https://github.com/cgupta21/Arsenic').error).toContain('profile URL, not a repository URL')
  })
})

describe('Mobile Export Hardening & Asset Integrity', () => {
  const rootDir = resolve(__dirname, '..')
  const appCode = readFileSync(resolve(rootDir, 'client/src/App.tsx'), 'utf-8')
  const exportButtonsCode = readFileSync(resolve(rootDir, 'client/src/components/ExportButtons.tsx'), 'utf-8')

  it('share card avatar image in App.tsx includes crossOrigin="anonymous" to prevent canvas tainting', () => {
    expect(appCode).toMatch(/<img[^>]*src=\{user\.avatar_url\}[^>]*crossOrigin="anonymous"/)
  })

  it('ExportButtons waits for web fonts and image assets before rendering canvas', () => {
    expect(exportButtonsCode).toContain('document.fonts.ready')
    expect(exportButtonsCode).toContain('img.complete')
    expect(exportButtonsCode).toContain("scale: 2")
    expect(exportButtonsCode).toContain("useCORS: true")
    expect(exportButtonsCode).toContain("allowTaint: false")
  })

  it('ExportButtons handles mobile Web Share API with file fallback and blob URLs', () => {
    expect(exportButtonsCode).toContain('navigator.canShare')
    expect(exportButtonsCode).toContain('canvas.toBlob')
    expect(exportButtonsCode).toContain('URL.createObjectURL')
    expect(exportButtonsCode).toContain('URL.revokeObjectURL')
  })

  it('ExportButtons manages loading states and disables buttons during active export', () => {
    expect(exportButtonsCode).toContain('setExporting')
    expect(exportButtonsCode).toContain('disabled={exporting !== null}')
    expect(exportButtonsCode).toContain('Exporting…')
  })

  it('ExportButtons passes canvas directly to jsPDF without allocating an intermediate dataURL', async () => {
    expect(exportButtonsCode).toContain("pdf.addImage(canvas, 'PNG', 0, 0, width, height)")
    expect(exportButtonsCode).not.toContain("canvas.toDataURL('image/png')")

    // Verify jsPDF accepts a canvas object directly and generates a valid PDF
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ format: [200, 150] })
    const mockCanvas = {
      nodeType: 1,
      nodeName: 'CANVAS',
      width: 400,
      height: 300,
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    } as unknown as HTMLCanvasElement

    doc.addImage(mockCanvas, 'PNG', 0, 0, 200, 150)
    expect(doc.getNumberOfPages()).toBe(1)
    const output = doc.output('blob')
    expect(output.size).toBeGreaterThan(0)
  })
})

describe('Production SESSION_SECRET security enforcement', () => {
  it('identifies missing, short, or placeholder secrets', () => {
    expect(isPlaceholderSecret('')).toBe(true)
    expect(isPlaceholderSecret(undefined)).toBe(true)
    expect(isPlaceholderSecret('short')).toBe(true)
    expect(isPlaceholderSecret('change-this-secret')).toBe(true)
    expect(isPlaceholderSecret('change-this-dummy-secret-longer-than-32-chars')).toBe(true)
    expect(isPlaceholderSecret('change-me-please-secret-longer-than-32-chars')).toBe(true)
    expect(isPlaceholderSecret(fallbackSessionSecret)).toBe(true)
    expect(isPlaceholderSecret('placeholder-secret-that-has-over-32-characters')).toBe(true)
  })

  it('accepts high-entropy random secrets of 32+ characters', () => {
    expect(isPlaceholderSecret('5cc5652f2115ccaafaa2ffb38095f62e7b90049ecae734e55bf3ee1c8581f893')).toBe(false)
    expect(isPlaceholderSecret('super-secret-random-key-with-plenty-of-bytes-12345')).toBe(false)
  })

  it('rejects missing or empty SESSION_SECRET in production', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production' })).toThrow(
      /SESSION_SECRET must be set to a secure, random string/i
    )
    expect(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: '' })).toThrow(
      /SESSION_SECRET must be set to a secure, random string/i
    )
  })

  it('rejects secrets shorter than 32 characters in production', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'short-secret' })).toThrow(
      /SESSION_SECRET must be set to a secure, random string/i
    )
  })

  it('rejects placeholder secrets in production', () => {
    expect(() =>
      resolveSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: 'change-this-production-placeholder-secret-32',
      })
    ).toThrow(/SESSION_SECRET must be set to a secure, random string/i)
    expect(() =>
      resolveSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: 'change-me-production-secret-longer-than-32',
      })
    ).toThrow(/SESSION_SECRET must be set to a secure, random string/i)
  })

  it('NEVER permits the hardcoded fallback secret in production', () => {
    expect(() =>
      resolveSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: fallbackSessionSecret,
      })
    ).toThrow(/Fallback secret is not permitted in production/i)
  })

  it('accepts valid 32+ character secrets in production', () => {
    const validSecret = '5cc5652f2115ccaafaa2ffb38095f62e7b90049ecae734e55bf3ee1c8581f893'
    expect(resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: validSecret })).toBe(validSecret)
  })

  it('uses development/test fallback secret when NODE_ENV is not production', () => {
    expect(resolveSessionSecret({ NODE_ENV: 'development' })).toBe(fallbackSessionSecret)
    expect(resolveSessionSecret({ NODE_ENV: 'test' })).toBe(fallbackSessionSecret)
    expect(resolveSessionSecret({})).toBe(fallbackSessionSecret)
  })

  it('fails process startup when NODE_ENV=production and SESSION_SECRET is missing or invalid', () => {
    const result = spawnSync(process.execPath, ['-e', 'import("./server/index.js")'], {
      env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '' },
      encoding: 'utf-8',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('SESSION_SECRET must be set to a secure, random string')
  })

  it('succeeds process startup when NODE_ENV=production and a valid SESSION_SECRET is provided', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', 'import("./server/index.js").then(() => { console.log("BOOT_OK"); process.exit(0) })'],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          SESSION_SECRET: '5cc5652f2115ccaafaa2ffb38095f62e7b90049ecae734e55bf3ee1c8581f893',
          PORT: '0',
        },
        encoding: 'utf-8',
      }
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('BOOT_OK')
  })
})
