const {
    clearCookie,
    getFreshSession,
    json,
    publicSession,
    requireConfig,
} = require('../../lib/tiktok-demo');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { error: 'method_not_allowed' });
    }

    const config = requireConfig();
    if (!config.ok) {
        return json(res, 500, {
            connected: false,
            error: 'missing_tiktok_configuration',
            missing: config.missing,
        });
    }

    const session = await getFreshSession(req, res, config).catch((error) => {
        clearCookie(res, 'aorix_tiktok_demo_session');
        return null;
    });

    if (!session) {
        return json(res, 200, { connected: false });
    }

    const fields = 'open_id,union_id,avatar_url,display_name';
    const response = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
        return json(res, response.status || 502, {
            connected: false,
            error: 'tiktok_user_info_failed',
            details: data,
        });
    }

    return json(res, 200, {
        connected: true,
        session: publicSession(session),
        user: data.data && data.data.user ? data.data.user : data.data,
    });
};
