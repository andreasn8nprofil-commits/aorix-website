const {
    STATE_COOKIE,
    appendSetCookie,
    getRedirectUri,
    json,
    randomToken,
    redirect,
    requireConfig,
    serializeCookie,
} = require('../../lib/tiktok-demo');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { error: 'method_not_allowed' });
    }

    const config = requireConfig();
    if (!config.ok) {
        return json(res, 500, {
            error: 'missing_tiktok_configuration',
            missing: config.missing,
        });
    }

    const state = randomToken(24);
    const redirectUri = getRedirectUri(req);
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', config.clientKey);
    url.searchParams.set('scope', config.scopes);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('disable_auto_auth', '1');

    appendSetCookie(
        res,
        serializeCookie(STATE_COOKIE, state, {
            maxAge: 10 * 60,
        }),
    );

    return redirect(res, url.toString());
};
