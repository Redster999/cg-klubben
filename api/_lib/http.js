const { URL } = require('url');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { error: 'Method not allowed' });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message || 'Invalid request' });
}

function unauthorized(res, message) {
  sendJson(res, 401, { error: message || 'Unauthorized' });
}

function forbidden(res, message) {
  sendJson(res, 403, { error: message || 'Forbidden' });
}

function serverError(res, message) {
  sendJson(res, 500, { error: message || 'Internal server error' });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const pairs = cookieHeader.split(';').map((part) => part.trim()).filter(Boolean);
  const cookies = {};

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie');

  if (!current) {
    res.setHeader('Set-Cookie', [cookieValue]);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [current, cookieValue]);
}

function toAbsoluteUrl(req) {
  const host = req.headers.host || 'localhost';
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = typeof protoHeader === 'string' && protoHeader.length > 0 ? protoHeader.split(',')[0] : 'https';
  return `${proto}://${host}${req.url}`;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(toAbsoluteUrl(req));
    return originUrl.host === requestUrl.host && originUrl.protocol === requestUrl.protocol;
  } catch (error) {
    return false;
  }
}

function getQueryParams(req) {
  const requestUrl = new URL(toAbsoluteUrl(req));
  return requestUrl.searchParams;
}

module.exports = {
  appendSetCookie,
  badRequest,
  forbidden,
  getQueryParams,
  isSameOrigin,
  methodNotAllowed,
  parseCookies,
  parseJsonBody,
  sendJson,
  serverError,
  unauthorized,
};
