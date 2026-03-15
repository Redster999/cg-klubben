const { badRequest, forbidden, isSameOrigin, methodNotAllowed, parseJsonBody, sendJson, serverError, unauthorized } = require('../_lib/http');
const { query } = require('../_lib/db');
const { boardCredentials, safeEqual, setAdminSession, setSession } = require('../_lib/session');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function normalizeEmployeeNumber(value) {
  return String(value || '').replace(/\s+/g, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  try {
    const body = await parseJsonBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      return badRequest(res, 'Brukernavn og passord er påkrevd');
    }

    const phone = normalizePhone(username);
    const employeeNumber = normalizeEmployeeNumber(password);

    if (phone && employeeNumber) {
      const memberResult = await query(
        `SELECT id, name
         FROM members
         WHERE is_board = TRUE
           AND phone = $1
           AND employee_number = $2
         LIMIT 1`,
        [phone, employeeNumber]
      );

      const member = memberResult.rows[0];
      if (member) {
        setSession(res, req, { role: 'styret', memberId: member.id, name: member.name });
        setAdminSession(res, req);
        return sendJson(res, 200, { ok: true, role: 'styret', source: 'member' });
      }
    }

    const board = boardCredentials();
    const envLoginOk = board.configured && safeEqual(username, board.username) && safeEqual(password, board.password);
    if (!envLoginOk) {
      return unauthorized(res, 'Ugyldig innlogging');
    }

    setSession(res, req, { role: 'styret', name: 'Styret' });
    setAdminSession(res, req);
    return sendJson(res, 200, { ok: true, role: 'styret', source: 'env' });
  } catch (error) {
    console.error('styret-login error', error);
    return serverError(res);
  }
};
