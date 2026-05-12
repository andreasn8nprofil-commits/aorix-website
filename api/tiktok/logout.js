const { SESSION_COOKIE, clearCookie, json } = require('../../lib/tiktok-demo');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { error: 'method_not_allowed' });
    }

    clearCookie(res, SESSION_COOKIE);
    return json(res, 200, { disconnected: true });
};
