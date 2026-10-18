import app from '../../../server/index.js'

export default function handler(req, res) {
  // Ensure req.url matches Express's route expectation if Vercel alters the path
  if (req.query?.left && req.query?.right && (!req.url || !req.url.startsWith('/api/compare/'))) {
    const queryIdx = req.url ? req.url.indexOf('?') : -1
    const queryPart = queryIdx !== -1 ? req.url.substring(queryIdx) : ''
    req.url = `/api/compare/${encodeURIComponent(req.query.left)}/${encodeURIComponent(req.query.right)}${queryPart}`
  }

  return app(req, res)
}
