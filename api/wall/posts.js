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
const { mailDebugContext, sendMail } = require('../_lib/mail');
const { getSession } = require('../_lib/session');

function requireAuthenticated(req, res) {
  const session = getSession(req);
  if (!session || !['styret', 'member'].includes(session.role)) {
    unauthorized(res, 'Du må være logget inn');
    return null;
  }

  return session;
}

function parseOptionalId(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NaN;
  }

  return parsed;
}

async function getTargetMemberById(id) {
  const result = await query(
    `SELECT id,
            name,
            email,
            is_board AS "isBoard"
     FROM members
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
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
      await query(`DELETE FROM wall_posts WHERE is_deleted = TRUE`);

      const result = await query(
        `SELECT posts.id,
                posts.title,
                posts.body,
                posts.author_name AS "authorName",
                posts.author_role AS "authorRole",
                posts.author_member_id AS "authorMemberId",
                posts.show_on_frontpage AS "showOnFrontpage",
                posts.target_member_id AS "targetMemberId",
                target.name AS "targetMemberName",
                posts.responded_at AS "respondedAt",
                posts.responded_by_member_id AS "respondedByMemberId",
                posts.responded_by_name AS "respondedByName",
                posts.created_at AS "createdAt"
         FROM wall_posts posts
         LEFT JOIN members target ON target.id = posts.target_member_id
         ORDER BY posts.created_at DESC
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
        `DELETE FROM wall_posts
         WHERE id = $1
         RETURNING id,
                   title,
                   body,
                   author_name AS "authorName",
                   author_role AS "authorRole",
                   author_member_id AS "authorMemberId",
                   show_on_frontpage AS "showOnFrontpage",
                   target_member_id AS "targetMemberId",
                   responded_at AS "respondedAt",
                   responded_by_member_id AS "respondedByMemberId",
                   responded_by_name AS "respondedByName",
                   created_at AS "createdAt"`,
        [id]
      );

      if (!result.rows[0]) {
        return badRequest(res, 'Fant ikke innlegget');
      }

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
         RETURNING id,
                   title,
                   body,
                   author_name AS "authorName",
                   author_role AS "authorRole",
                   author_member_id AS "authorMemberId",
                   show_on_frontpage AS "showOnFrontpage",
                   target_member_id AS "targetMemberId",
                   responded_at AS "respondedAt",
                   responded_by_member_id AS "respondedByMemberId",
                   responded_by_name AS "respondedByName",
                   created_at AS "createdAt"`,
        [id, showOnFrontpage]
      );

      if (!result.rows[0]) {
        return badRequest(res, 'Fant ikke innlegget');
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
    const parsedTargetMemberId = parseOptionalId(body.targetMemberId);

    if (!title || !message) {
      return badRequest(res, 'Tittel og melding er påkrevd');
    }

    if (Number.isNaN(parsedTargetMemberId)) {
      return badRequest(res, 'Mottaker-id er ugyldig');
    }

    if (parsedTargetMemberId !== null && session.role !== 'styret') {
      return forbidden(res, 'Kun styret kan velge mottaker');
    }

    if (title.length > 120 || message.length > 4000) {
      return badRequest(res, 'Innholdet er for langt');
    }

    let targetMember = null;
    if (parsedTargetMemberId !== null) {
      targetMember = await getTargetMemberById(parsedTargetMemberId);
      if (!targetMember) {
        return badRequest(res, 'Fant ikke valgt mottaker');
      }

      if (targetMember.isBoard) {
        return badRequest(res, 'Varsel kan kun sendes til vanlige medlemmer');
      }
    }

    const parsedAuthorMemberId = Number(session.memberId);
    const authorMemberId = Number.isInteger(parsedAuthorMemberId) && parsedAuthorMemberId > 0 ? parsedAuthorMemberId : null;

    const result = await query(
      `INSERT INTO wall_posts (title, body, author_name, author_role, show_on_frontpage, author_member_id, target_member_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id,
                 title,
                 body,
                 author_name AS "authorName",
                 author_role AS "authorRole",
                 author_member_id AS "authorMemberId",
                 show_on_frontpage AS "showOnFrontpage",
                 target_member_id AS "targetMemberId",
                 responded_at AS "respondedAt",
                 responded_by_member_id AS "respondedByMemberId",
                 responded_by_name AS "respondedByName",
                 created_at AS "createdAt"`,
      [title, message, session.name || 'Medlem', session.role, showOnFrontpage, authorMemberId, parsedTargetMemberId]
    );

    const item = {
      ...result.rows[0],
      targetMemberName: targetMember ? targetMember.name : null,
    };

    let warning = '';
    let notificationSent = false;
    if (targetMember && targetMember.email) {
      try {
        await sendMail({
          to: targetMember.email,
          subject: 'Ny melding på Veggen',
          text: 'Det er kommet en melding til deg på Veggen på klubben.topsoft.no. Logg på for å svare og se meldingen.',
        });

        notificationSent = true;
        await query(
          `UPDATE wall_posts
           SET notification_sent_at = NOW()
           WHERE id = $1`,
          [item.id]
        );
      } catch (error) {
        console.error('wall post notification error', {
          code: error.code || null,
          details: error.details || null,
          message: error.message || null,
          postId: item.id,
          ...mailDebugContext({
            to: targetMember.email,
            subject: 'Ny melding på Veggen',
          }),
        });
        warning = 'Innlegget ble publisert, men e-postvarslet kunne ikke sendes.';
      }
    } else if (targetMember && !targetMember.email) {
      console.warn('wall post notification skipped: target has no e-mail', {
        postId: item.id,
        targetMemberId: targetMember.id,
      });
      warning = 'Innlegget ble publisert, men valgt medlem mangler e-postadresse.';
    }

    return sendJson(res, 201, {
      item,
      notificationSent,
      warning: warning || undefined,
    });
  } catch (error) {
    console.error('wall post error', error);
    if (error && typeof error.message === 'string' && error.message.includes('Missing required environment variable: DATABASE_URL')) {
      return serverError(res, 'DATABASE_URL mangler i Vercel.');
    }
    return serverError(res);
  }
};
