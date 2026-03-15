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
  if (!['GET', 'POST'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST']);
  }

  if (req.method === 'GET') {
    const session = requireAuthenticated(req, res);
    if (!session) {
      return;
    }

    try {
      const result = await query(
        `SELECT id,
                title,
                body,
                author_name AS "authorName",
                author_role AS "authorRole",
                created_at AS "createdAt"
         FROM wall_posts
         ORDER BY created_at DESC
         LIMIT 200`
      );

      return sendJson(res, 200, { items: result.rows });
    } catch (error) {
      console.error('wall get error', error);
      return serverError(res);
    }
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  const session = requireAuthenticated(req, res);
  if (!session) {
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();

    if (!title || !message) {
      return badRequest(res, 'Tittel og melding er påkrevd');
    }

    if (title.length > 120 || message.length > 4000) {
      return badRequest(res, 'Innholdet er for langt');
    }

    const result = await query(
      `INSERT INTO wall_posts (title, body, author_name, author_role)
       VALUES ($1, $2, $3, $4)
       RETURNING id,
                 title,
                 body,
                 author_name AS "authorName",
                 author_role AS "authorRole",
                 created_at AS "createdAt"`,
      [title, message, session.name || 'Medlem', session.role]
    );

    return sendJson(res, 201, { item: result.rows[0] });
  } catch (error) {
    console.error('wall post error', error);
    return serverError(res);
  }
};
