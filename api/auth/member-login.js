const { badRequest, forbidden, isSameOrigin, methodNotAllowed, parseJsonBody, sendJson, serverError, unauthorized } = require('../_lib/http');
const { query } = require('../_lib/db');
const { setSession } = require('../_lib/session');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
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
    const username = typeof body.username === 'string' ? body.username : body.phone;
    const password = typeof body.password === 'string' ? body.password : body.employeeNumber;
    const phone = normalizePhone(username);
    const employeeNumber = normalizeEmployeeNumber(password);

    if (!phone || !employeeNumber) {
      return badRequest(res, 'Brukernavn og passord er påkrevd');
    }

    const result = await query(
      `SELECT id, name
       FROM members
       WHERE phone = $1 AND employee_number = $2
       LIMIT 1`,
      [phone, employeeNumber]
    );

    const member = result.rows[0];
    if (!member) {
      return unauthorized(res, 'Ugyldig innlogging');
    }

    setSession(res, req, { role: 'member', memberId: member.id, name: member.name });
    return sendJson(res, 200, { ok: true, role: 'member', name: member.name });
  } catch (error) {
    console.error('member-login error', error);
    return serverError(res);
  }
};
