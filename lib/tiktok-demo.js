const crypto = require('crypto');

const STATE_COOKIE = 'aorix_tiktok_oauth_state';
const SESSION_COOKIE = 'aorix_tiktok_demo_session';
const DEFAULT_SCOPES = 'user.info.basic,video.upload';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

function getEnv(name) {
    return process.env[name] || '';
}

function getBaseUrl(req) {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.aorix.de';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
}

function getRedirectUri(req) {
    return getEnv('TIKTOK_REDIRECT_URI') || `${getBaseUrl(req)}/api/tiktok/callback`;
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    return header.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index === -1) return cookies;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options.path || '/'}`);
    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    parts.push('Secure');
    parts.push(`SameSite=${options.sameSite || 'Lax'}`);
    return parts.join('; ');
}

function appendSetCookie(res, cookie) {
    const current = res.getHeader('Set-Cookie');
    if (!current) {
        res.setHeader('Set-Cookie', cookie);
    } else if (Array.isArray(current)) {
        res.setHeader('Set-Cookie', current.concat(cookie));
    } else {
        res.setHeader('Set-Cookie', [current, cookie]);
    }
}

function clearCookie(res, name) {
    appendSetCookie(res, serializeCookie(name, '', { maxAge: 0 }));
}

function json(res, statusCode, body) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

function redirect(res, location) {
    res.statusCode = 302;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
}

function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function requireConfig() {
    const clientKey = getEnv('TIKTOK_CLIENT_KEY');
    const clientSecret = getEnv('TIKTOK_CLIENT_SECRET');
    const cookieSecret = getEnv('TIKTOK_COOKIE_SECRET');

    const missing = [];
    if (!clientKey) missing.push('TIKTOK_CLIENT_KEY');
    if (!clientSecret) missing.push('TIKTOK_CLIENT_SECRET');
    if (!cookieSecret) missing.push('TIKTOK_COOKIE_SECRET');

    return {
        ok: missing.length === 0,
        missing,
        clientKey,
        clientSecret,
        cookieSecret,
        scopes: getEnv('TIKTOK_SCOPES') || DEFAULT_SCOPES,
    };
}

function encryptionKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptSession(session, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(session), 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptSession(value, secret) {
    try {
        const buffer = Buffer.from(value, 'base64url');
        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        return null;
    }
}

function setSessionCookie(res, session, secret) {
    appendSetCookie(
        res,
        serializeCookie(SESSION_COOKIE, encryptSession(session, secret), {
            maxAge: COOKIE_MAX_AGE_SECONDS,
        }),
    );
}

function getSession(req, secret) {
    const cookies = parseCookies(req);
    if (!cookies[SESSION_COOKIE]) return null;
    return decryptSession(cookies[SESSION_COOKIE], secret);
}

async function parseJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function exchangeCodeForToken({ code, redirectUri, clientKey, clientSecret }) {
    const body = new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
    });

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache',
        },
        body,
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
}

async function refreshAccessToken(session, config) {
    if (!session.refresh_token) return session;

    const body = new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: session.refresh_token,
    });

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache',
        },
        body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        const message = data.error_description || data.error || 'TikTok token refresh failed.';
        const error = new Error(message);
        error.details = data;
        throw error;
    }

    return tokenResponseToSession(data);
}

async function getFreshSession(req, res, config) {
    const session = getSession(req, config.cookieSecret);
    if (!session) return null;

    const shouldRefresh = session.expires_at && session.expires_at < Date.now() + 5 * 60 * 1000;
    if (!shouldRefresh) return session;

    const fresh = await refreshAccessToken(session, config);
    setSessionCookie(res, fresh, config.cookieSecret);
    return fresh;
}

function tokenResponseToSession(data) {
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        open_id: data.open_id,
        scope: data.scope,
        token_type: data.token_type || 'Bearer',
        expires_at: Date.now() + Number(data.expires_in || 0) * 1000,
        refresh_expires_at: Date.now() + Number(data.refresh_expires_in || 0) * 1000,
    };
}

function computeUploadPlan(videoSize) {
    const minChunk = 5 * 1024 * 1024;
    const maxChunk = 64 * 1024 * 1024;

    if (videoSize <= minChunk) {
        return {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
        };
    }

    const chunkSize = Math.min(maxChunk, Math.max(minChunk, 10 * 1024 * 1024));
    let totalChunkCount = Math.ceil(videoSize / chunkSize);
    const remainder = videoSize % chunkSize;
    if (remainder > 0 && remainder < minChunk && totalChunkCount > 1) {
        totalChunkCount -= 1;
    }

    return {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
    };
}

function publicSession(session) {
    return {
        open_id: session.open_id,
        scope: session.scope,
        token_type: session.token_type,
        expires_at: session.expires_at,
    };
}

module.exports = {
    STATE_COOKIE,
    SESSION_COOKIE,
    appendSetCookie,
    clearCookie,
    computeUploadPlan,
    exchangeCodeForToken,
    getFreshSession,
    getRedirectUri,
    json,
    parseCookies,
    parseJsonBody,
    publicSession,
    randomToken,
    redirect,
    requireConfig,
    serializeCookie,
    setSessionCookie,
    tokenResponseToSession,
};
