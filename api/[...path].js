import app from '../server/index.js'

export default function handler(req, res) {
  // Vercel rewrites /auth/* through this function so Express can keep its
  // existing /auth/* routes while /api/* routes remain unchanged.
  if (req.url?.startsWith('/api/auth/')) {
    req.url = req.url.replace(/^\/api/, '')
  }
  return app(req, res)
}
