import app from '../server/index.js'

export default function handler(req, res) {
  // Only auth routes need /api removed because Vercel
  // rewrites /auth/* to /api/auth/*
  if (req.url?.startsWith('/api/auth/')) {
    req.url = req.url.replace(/^\/api/, '')
  }

  return app(req, res)
}