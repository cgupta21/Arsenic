import app from '../../server/index.js'

export default function handler(req, res) {
  req.url = '/auth/logout' + (req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')
  return app(req, res)
}
