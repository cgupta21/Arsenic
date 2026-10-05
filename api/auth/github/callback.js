import app from '../../../server/index.js'

export default function handler(req, res) {
    req.url = '/auth/github/callback' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')
    return app(req, res)
}