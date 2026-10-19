export default function handler(req, res) {
  const rawUser = req.query?.username || (req.url ? req.url.split('?')[0].split('/').pop() : '') || ''
  const username = decodeURIComponent(String(rawUser)).replace(/^@/, '').trim()

  const GITHUB_USER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/
  if (username && !GITHUB_USER_RE.test(username)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(400).send('Invalid username')
  }

  const displayUser = username || 'Developer'
  const title = `Arsenic — @${displayUser}`
  const description = `GitHub developer intelligence, contribution patterns and repository health for @${displayUser} on Arsenic.`
  const url = `https://arsenic-rho.vercel.app/u/${encodeURIComponent(username)}`
  const image = 'https://arsenic-rho.vercel.app/assets/social-preview.png'

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#11110F" />
    <meta name="description" content="${description}" />

    <!-- Favicon & Web App Icons -->
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${title}" />

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${url}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${title}" />

    <!-- Canonical URL -->
    <link rel="canonical" href="${url}" />

    <title>${title}</title>

    <!-- Client redirect for non-crawler browsers -->
    <meta http-equiv="refresh" content="0;url=/u/${encodeURIComponent(username)}" />
  </head>
  <body>
    <p>Viewing <a href="/u/${encodeURIComponent(username)}">${title}</a> on Arsenic.</p>
  </body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return res.status(200).send(html)
}
