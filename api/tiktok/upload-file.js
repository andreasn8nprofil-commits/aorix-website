const { getFreshSession, json, requireConfig } = require('../../lib/tiktok-demo');

const DEFAULT_LIMIT = 4200000;

function isAllowedUploadUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && /tiktokapis\.com$/i.test(url.hostname);
    } catch (error) {
        return false;
    }
}

async function readRawBody(req, limit) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > limit) {
            const error = new Error('request_too_large');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'PUT') {
        res.setHeader('Allow', 'PUT');
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

    const uploadUrl = req.headers['x-tiktok-upload-url'];
    if (!uploadUrl || !isAllowedUploadUrl(uploadUrl)) {
        return json(res, 400, { error: 'invalid_upload_url' });
    }

    const limit = Number(process.env.TIKTOK_DEMO_PROXY_MAX_BYTES || DEFAULT_LIMIT);
    const contentType = req.headers['content-type'] || 'video/mp4';
    const contentRange = req.headers['content-range'];

    if (!contentRange) {
        return json(res, 400, { error: 'missing_content_range' });
    }

    try {
        const body = await readRawBody(req, limit);
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType,
                'Content-Range': contentRange,
            },
            body,
        });

        const text = await response.text().catch(() => '');
        return json(res, response.ok ? 200 : response.status, {
            ok: response.ok,
            upload_status: response.status,
            upload_response: text,
        });
    } catch (error) {
        return json(res, error.statusCode || 500, {
            error: error.message || 'upload_proxy_failed',
            limit,
        });
    }
};
