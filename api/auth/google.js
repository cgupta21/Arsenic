import app from '../../server/index.js'

export default function handler(req, res) {
  req.url = '/auth/google'
  return app(req, res)
}
