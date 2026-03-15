const {
  badRequest,
  forbidden,
  getQueryParams,
  isSameOrigin,
  methodNotAllowed,
  parseJsonBody,
  sendJson,
  serverError,
  unauthorized,
} = require('../_lib/http');
const { query } = require('../_lib/db');
const { getSession } = require('../_lib/session');
const DELETED_PLACEHOLDER_TEXT = 'Slettet av styret.';

async function cleanupOldDeletedPosts() {
  await query(`DELETE FROM wall_posts WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '24 hours'`);
}

function requireAuthenticated(req, res) {
  const session = getSession(req);
  if (!session || !['styret', 'member'].includes(session.role)) {
    unauthorized(res, 'Du må være logget inn');
    return null;
  }

  return session;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  }

  if (req.method === 'GET') {
    const session = requireAuthenticated(req, res);
    if (!session) {
      return;
    }

    try {
      await cleanupOldDeletedPosts();

      const result = await query(
        `SELECT id,
                title,
                body,
                author_name AS "authorName",
                author_role AS "authorRole",
                show_on_frontpage AS "showOnFrontpage",
                is_deleted AS "isDeleted",
                deleted_at AS "deletedAt",
                created_at AS "createdAt"
         FROM wall_posts
         WHERE is_deleted = FALSE
            OR deleted_at >= NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC
         LIMIT 200`
      );

      return sendJson(res, 200, { items: result.rows });
    } catch (error) {
      console.error('wall get error', error);
      if (error && typeof error.message === 'string' && error.message.includes('Missing required environment variable: DATABASE_URL')) {
        return serverError(res, 'DATABASE_URL mangler i Vercel.');
      }
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

  if (req.method === 'DELETE') {
    if (session.role !== 'styret') {
      return forbidden(res, 'Kun styret kan slette innlegg');
    }

    try {
      const params = getQueryParams(req);
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        return badRequest(res, 'Gyldig innlegg-id må sendes med');
      }

      const result = await query(
        `UPDATE wall_posts
         SET title = $2,
             body = '',
             show_on_frontpage = FALSE,
             is_deleted = TRUE,
             deleted_at = NOW()
         WHERE id = $1
         RETURNING id,
                   title,
                   body,
                   author_name AS "authorName",
                   author_role AS "authorRole",
                   show_on_frontpage AS "showOnFrontpage",
                   is_deleted AS "isDeleted",
                   deleted_at AS "deletedAt",
                   created_at AS "createdAt"`,
        [id, DELETED_PLACEHOLDER_TEXT]
      );

      if (!result.rows[0]) {
        return badRequest(res, 'Fant ikke innlegget');
      }

      await cleanupOldDeletedPosts();
      return sendJson(res, 200, { item: result.rows[0] });
    } catch (error) {
      console.error('wall delete error', error);
      return serverError(res);
    }
  }

  if (req.method === 'PATCH') {
    if (session.role !== 'styret') {
      return forbidden(res, 'Kun styret kan endre forside-visning');
    }

    try {
      const params = getQueryParams(req);
      const id = Number(params.get('id'));
      const body = await parseJsonBody(req);
      const showOnFrontpage = Boolean(body.showOnFrontpage);

      if (!Number.isInteger(id) || id <= 0) {
        return badRequest(res, 'Gyldig innlegg-id må sendes med');
      }

      const result = await query(
        `UPDATE wall_posts
         SET show_on_frontpage = $2
         WHERE id = $1
           AND is_deleted = FALSE
         RETURNING id,
                   title,
                   body,
                   author_name AS "authorName",
                   author_role AS "authorRole",
                   show_on_frontpage AS "showOnFrontpage",
                   is_deleted AS "isDeleted",
                   deleted_at AS "deletedAt",
                   created_at AS "createdAt"`,
        [id, showOnFrontpage]
      );

      if (!result.rows[0]) {
        return badRequest(res, 'Fant ikke innlegget eller innlegget er allerede slettet');
      }

      return sendJson(res, 200, { item: result.rows[0] });
    } catch (error) {
      console.error('wall patch error', error);
      return serverError(res);
    }
  }

  try {
    const body = await parseJsonBody(req);
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    const showOnFrontpage = session.role === 'styret' && Boolean(body.showOnFrontpage);

    if (!title || !message) {
      return badRequest(res, 'Tittel og melding er påkrevd');
    }

    if (title.length > 120 || message.length > 4000) {
      return badRequest(res, 'Innholdet er for langt');
    }

    const result = await query(
      `INSERT INTO wall_posts (title, body, author_name, author_role, show_on_frontpage)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id,
                 title,
                 body,
                 author_name AS "authorName",
                 author_role AS "authorRole",
                 show_on_frontpage AS "showOnFrontpage",
                 is_deleted AS "isDeleted",
                 deleted_at AS "deletedAt",
                 created_at AS "createdAt"`,
      [title, message, session.name || 'Medlem', session.role, showOnFrontpage]
    );

    return sendJson(res, 201, { item: result.rows[0] });
  } catch (error) {
    console.error('wall post error', error);
    if (error && typeof error.message === 'string' && error.message.includes('Missing required environment variable: DATABASE_URL')) {
      return serverError(res, 'DATABASE_URL mangler i Vercel.');
    }
    return serverError(res);
  }
};
