const crypto = require('crypto');
const { appendSetCookie, parseCookies } = require('./http');

const SESSION_COOKIE_NAME = 'cg_session';
const ADMIN_COOKIE_NAME = 'cg_admin';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ADMIN_TTL_SECONDS = 60 * 60;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function boardCredentials() {
  return {
    username: process.env.BOARD_USERNAME || 'styret',
    password: requiredEnv('BOARD_PASSWORD'),
  };
}

function sessionSecret() {
  return requiredEnv('SESSION_SECRET');
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf-8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf-8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(data) {
  return crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url');
}

function issueToken(payload, ttlSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const encoded = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function isSecureRequest(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) {
    return proto === 'https';
  }

  return process.env.NODE_ENV === 'production';
}

function buildCookie(name, value, req, maxAgeSeconds) {
  const pieces = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isSecureRequest(req)) {
    pieces.push('Secure');
  }

  return pieces.join('; ');
}

function buildExpiredCookie(name, req) {
  const pieces = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];

  if (isSecureRequest(req)) {
    pieces.push('Secure');
  }

  return pieces.join('; ');
}

function setSession(res, req, payload) {
  const token = issueToken(payload, SESSION_TTL_SECONDS);
  appendSetCookie(res, buildCookie(SESSION_COOKIE_NAME, token, req, SESSION_TTL_SECONDS));
}

function setAdminSession(res, req) {
  const token = issueToken({ scope: 'admin' }, ADMIN_TTL_SECONDS);
  appendSetCookie(res, buildCookie(ADMIN_COOKIE_NAME, token, req, ADMIN_TTL_SECONDS));
}

function clearAuthSessions(res, req) {
  appendSetCookie(res, buildExpiredCookie(SESSION_COOKIE_NAME, req));
  appendSetCookie(res, buildExpiredCookie(ADMIN_COOKIE_NAME, req));
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[SESSION_COOKIE_NAME]);
}

function getAdminSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[ADMIN_COOKIE_NAME]);
}

module.exports = {
  boardCredentials,
  clearAuthSessions,
  getAdminSession,
  getSession,
  safeEqual,
  setAdminSession,
  setSession,
};
