const { methodNotAllowed, sendJson, serverError } = require('../_lib/http');
const { query } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  try {
    const result = await query(
      `SELECT id,
              title,
              body,
              created_at AS "createdAt"
       FROM wall_posts
       WHERE show_on_frontpage = TRUE
       ORDER BY created_at DESC
       LIMIT 40`
    );

    return sendJson(res, 200, { items: result.rows });
  } catch (error) {
    console.error('wall frontpage error', error);
    return serverError(res);
  }
};
