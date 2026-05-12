const {
    STATE_COOKIE,
    clearCookie,
    exchangeCodeForToken,
    getRedirectUri,
    parseCookies,
    redirect,
    requireConfig,
    setSessionCookie,
    tokenResponseToSession,
} = require('../../lib/tiktok-demo');

function demoRedirect(params = {}) {
    const url = new URL('/tiktok-demo.html', 'https://www.aorix.de');
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    return `${url.pathname}${url.search}`;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        return res.end('Method not allowed');
    }

    const config = requireConfig();
    if (!config.ok) {
        return redirect(res, demoRedirect({ tiktok_error: 'missing_configuration' }));
    }

    const callbackUrl = new URL(req.url, 'https://www.aorix.de');
    const error = callbackUrl.searchParams.get('error');
    const errorDescription = callbackUrl.searchParams.get('error_description');
    if (error) {
        return redirect(res, demoRedirect({
            tiktok_error: error,
            tiktok_error_description: errorDescription,
        }));
    }

    const code = callbackUrl.searchParams.get('code');
    const state = callbackUrl.searchParams.get('state');
    const cookies = parseCookies(req);

    if (!code || !state || !cookies[STATE_COOKIE] || cookies[STATE_COOKIE] !== state) {
        return redirect(res, demoRedirect({ tiktok_error: 'invalid_state' }));
    }

    try {
        const { response, data } = await exchangeCodeForToken({
            code,
            redirectUri: getRedirectUri(req),
            clientKey: config.clientKey,
            clientSecret: config.clientSecret,
        });

        if (!response.ok || data.error) {
            return redirect(res, demoRedirect({
                tiktok_error: data.error || 'token_exchange_failed',
                tiktok_error_description: data.error_description,
                tiktok_log_id: data.log_id,
            }));
        }

        setSessionCookie(res, tokenResponseToSession(data), config.cookieSecret);
        clearCookie(res, STATE_COOKIE);
        return redirect(res, demoRedirect({ connected: '1' }));
    } catch (error) {
        return redirect(res, demoRedirect({ tiktok_error: 'callback_failed' }));
    }
};
