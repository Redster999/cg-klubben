const { forbidden, isSameOrigin, methodNotAllowed, sendJson } = require('../_lib/http');
const { query } = require('../_lib/db');
const { clearAuthSessions, getSession } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  const session = getSession(req);
  if (session && session.nonce) {
    try {
      await query('DELETE FROM online_presence WHERE session_nonce = $1', [String(session.nonce)]);
    } catch (error) {
      console.error('logout presence cleanup error', error);
    }
  }

  clearAuthSessions(res, req);
  return sendJson(res, 200, { ok: true });
};
