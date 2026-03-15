const {
  badRequest,
  forbidden,
  isSameOrigin,
  methodNotAllowed,
  parseJsonBody,
  sendJson,
  serverError,
  unauthorized,
} = require('../_lib/http');
const { query } = require('../_lib/db');
const { getAdminSession, getSession } = require('../_lib/session');

function requireAdmin(req, res) {
  const session = getSession(req);
  const adminSession = getAdminSession(req);
  const ok = Boolean(session && session.role === 'styret' && adminSession && adminSession.scope === 'admin');

  if (!ok) {
    unauthorized(res, 'Admin-innlogging kreves');
    return null;
  }

  return session;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST']);
  }

  const admin = requireAdmin(req, res);
  if (!admin) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const result = await query(
        `SELECT headline,
                published,
                details,
                updated_at AS "updatedAt"
         FROM site_settings
         WHERE id = 1`
      );

      return sendJson(res, 200, { item: result.rows[0] || { headline: '', published: true, details: {} } });
    } catch (error) {
      console.error('admin settings get error', error);
      return serverError(res);
    }
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  try {
    const body = await parseJsonBody(req);
    const headline = String(body.headline || '').trim();
    const published = Boolean(body.published);
    const details = typeof body.details === 'object' && body.details ? body.details : {};

    if (headline.length > 300) {
      return badRequest(res, 'Overskriften er for lang');
    }

    await query(
      `UPDATE site_settings
       SET headline = $1,
           published = $2,
           details = $3::jsonb,
           updated_at = NOW()
       WHERE id = 1`,
      [headline, published, JSON.stringify(details)]
    );

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('admin settings post error', error);
    return serverError(res);
  }
};
