const {
    computeUploadPlan,
    getFreshSession,
    json,
    parseJsonBody,
    requireConfig,
} = require('../../lib/tiktok-demo');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'method_not_allowed' });
    }

    const config = requireConfig();
    if (!config.ok) {
        return json(res, 500, {
            error: 'missing_tiktok_configuration',
            missing: config.missing,
        });
    }

    const session = await getFreshSession(req, res, config);
    if (!session) {
        return json(res, 401, { error: 'not_connected' });
    }

    const body = await parseJsonBody(req).catch(() => ({}));
    const videoSize = Number(body.video_size || body.videoSize || 0);

    if (!Number.isSafeInteger(videoSize) || videoSize <= 0) {
        return json(res, 400, { error: 'invalid_video_size' });
    }

    const sourceInfo = computeUploadPlan(videoSize);
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
            source_info: sourceInfo,
        }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data.error && data.error.code && data.error.code !== 'ok')) {
        return json(res, response.status || 502, {
            error: 'tiktok_upload_init_failed',
            details: data,
        });
    }

    return json(res, 200, {
        ok: true,
        source_info: sourceInfo,
        tiktok: data,
        upload_proxy_limit: Number(process.env.TIKTOK_DEMO_PROXY_MAX_BYTES || 4200000),
    });
};
