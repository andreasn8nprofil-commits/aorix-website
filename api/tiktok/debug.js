const {
    SESSION_COOKIE,
    getSession,
    json,
    parseCookies,
    requireConfig,
} = require('../../lib/tiktok-demo');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { error: 'method_not_allowed' });
    }

    const config = requireConfig();
    const cookies = parseCookies(req);
    const cookieValue = cookies[SESSION_COOKIE] || '';
    const session = config.ok && cookieValue
        ? getSession(req, config.cookieSecret)
        : null;

    return json(res, 200, {
        config_ok: config.ok,
        missing: config.missing,
        has_session_cookie: Boolean(cookieValue),
        session_cookie_length: cookieValue.length,
        session_decrypts: Boolean(session),
        has_access_token: Boolean(session && session.access_token),
        has_open_id: Boolean(session && session.open_id),
        scope: session && session.scope ? session.scope : null,
        expires_at: session && session.expires_at ? session.expires_at : null,
        now: Date.now(),
    });
};
