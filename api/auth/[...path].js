import app from '../../server/index.js'

export default function handler(req, res) {
    if (req.url?.startsWith('/api/auth/')) {
        req.url = req.url.replace(/^\/api/, '')
    }

    return app(req, res)
}