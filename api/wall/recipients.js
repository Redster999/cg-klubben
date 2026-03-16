const { methodNotAllowed, sendJson, serverError, unauthorized } = require('../_lib/http');
const { query } = require('../_lib/db');
const { getSession } = require('../_lib/session');

function requireBoard(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'styret') {
    unauthorized(res, 'Kun styret har tilgang');
    return null;
  }

  return session;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const session = requireBoard(req, res);
  if (!session) {
    return;
  }

  try {
    const result = await query(
      `SELECT id,
              name,
              email
       FROM members
       WHERE is_board = FALSE
       ORDER BY name ASC`
    );

    return sendJson(res, 200, { items: result.rows });
  } catch (error) {
    console.error('wall recipients get error', error);
    return serverError(res);
  }
};
