const { badRequest, forbidden, isSameOrigin, methodNotAllowed, parseJsonBody, sendJson, serverError, unauthorized } = require('../_lib/http');
const { query } = require('../_lib/db');
const { sendMail } = require('../_lib/mail');
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
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  const session = requireAuthenticated(req, res);
  if (!session) {
    return;
  }

  const sessionMemberId = Number(session.memberId);
  if (!Number.isInteger(sessionMemberId) || sessionMemberId <= 0) {
    return forbidden(res, 'Innloggingen mangler medlems-id');
  }

  try {
    const body = await parseJsonBody(req);
    const postId = Number(body.postId);
    if (!Number.isInteger(postId) || postId <= 0) {
      return badRequest(res, 'Gyldig innlegg-id må sendes med');
    }

    const postResult = await query(
      `SELECT posts.id,
              posts.title,
              posts.target_member_id AS "targetMemberId",
              posts.responded_at AS "respondedAt",
              posts.author_member_id AS "authorMemberId",
              author.email AS "authorEmail"
       FROM wall_posts posts
       LEFT JOIN members author ON author.id = posts.author_member_id
       WHERE posts.id = $1
       LIMIT 1`,
      [postId]
    );

    const post = postResult.rows[0];
    if (!post) {
      return badRequest(res, 'Fant ikke innlegget');
    }

    if (!post.targetMemberId) {
      return badRequest(res, 'Dette innlegget kan ikke besvares');
    }

    if (Number(post.targetMemberId) !== sessionMemberId) {
      return forbidden(res, 'Kun medlemmet som er tagget kan svare');
    }

    if (post.respondedAt) {
      return badRequest(res, 'Innlegget er allerede besvart');
    }

    const updateResult = await query(
      `UPDATE wall_posts
       SET responded_at = NOW(),
           responded_by_member_id = $2,
           responded_by_name = $3
       WHERE id = $1
         AND responded_at IS NULL
       RETURNING responded_at AS "respondedAt",
                 responded_by_name AS "respondedByName"`,
      [postId, sessionMemberId, session.name || 'Medlem']
    );

    const updated = updateResult.rows[0];
    if (!updated) {
      return badRequest(res, 'Innlegget er allerede besvart');
    }

    const recipient = post.authorEmail || String(process.env.BOARD_NOTIFICATION_EMAIL || '').trim();
    let notificationSent = false;
    let warning = '';

    if (recipient) {
      try {
        await sendMail({
          to: recipient,
          subject: 'Svar på melding på Veggen',
          text: `${session.name || 'Et medlem'} har svart på meldingen "${post.title}" på Veggen på klubben.topsoft.no. Logg på for å se detaljene.`,
        });
        notificationSent = true;
      } catch (error) {
        console.error('wall reply notification error', error);
        warning = 'Svar ble registrert, men e-postvarsel kunne ikke sendes.';
      }
    } else {
      warning = 'Svar ble registrert, men ingen mottaker-e-post er satt for varsling.';
    }

    return sendJson(res, 200, {
      notificationSent,
      respondedAt: updated.respondedAt,
      respondedByName: updated.respondedByName,
      warning: warning || undefined,
    });
  } catch (error) {
    console.error('wall reply error', error);
    return serverError(res);
  }
};
