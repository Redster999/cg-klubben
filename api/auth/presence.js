const { methodNotAllowed, sendJson, serverError, unauthorized } = require('../_lib/http');
const { query } = require('../_lib/db');
const { getSession } = require('../_lib/session');

function requireAuthenticated(req, res) {
  const session = getSession(req);
  if (!session || !['styret', 'member'].includes(session.role)) {
    unauthorized(res, 'Du må være logget inn');
    return null;
  }

  return session;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const session = requireAuthenticated(req, res);
  if (!session) {
    return;
  }

  try {
    const sessionNonce = String(session.nonce || '');
    if (sessionNonce) {
      await query(
        `INSERT INTO online_presence (session_nonce, user_name, user_role, last_seen)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (session_nonce)
         DO UPDATE SET
           user_name = EXCLUDED.user_name,
           user_role = EXCLUDED.user_role,
           last_seen = NOW()`,
        [sessionNonce, session.name || 'Medlem', session.role]
      );
    }

    await query(`DELETE FROM online_presence WHERE last_seen < NOW() - INTERVAL '20 minutes'`);

    const onlineResult = await query(
      `SELECT user_name AS "name",
              user_role AS "role",
              MAX(last_seen) AS "lastSeen"
       FROM online_presence
       WHERE last_seen >= NOW() - INTERVAL '5 minutes'
       GROUP BY user_name, user_role
       ORDER BY CASE WHEN user_role = 'styret' THEN 0 ELSE 1 END, user_name ASC`
    );

    return sendJson(res, 200, { items: onlineResult.rows });
  } catch (error) {
    console.error('presence error', error);
    return serverError(res);
  }
};
