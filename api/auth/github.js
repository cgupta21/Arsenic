import app from '../../server/index.js'

export default function handler(req, res) {
    req.url = '/auth/github'
    return app(req, res)
}