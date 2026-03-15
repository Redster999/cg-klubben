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
const { getAdminSession, getSession } = require('../_lib/session');

function requireAdmin(req, res) {
  const session = getSession(req);
  const adminSession = getAdminSession(req);
  const ok = Boolean(session && session.role === 'styret' && adminSession && adminSession.scope === 'admin');

  if (!ok) {
    unauthorized(res, 'Admin-innlogging kreves');
    return null;
  }

  return session;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

function normalizeEmployeeNumber(value) {
  return String(value || '').replace(/\s+/g, '');
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  }

  const admin = requireAdmin(req, res);
  if (!admin) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const result = await query(
        `SELECT id,
                name,
                email,
                phone,
                employee_number AS "employeeNumber",
                created_at AS "createdAt"
         FROM members
         ORDER BY name ASC`
      );

      return sendJson(res, 200, { items: result.rows });
    } catch (error) {
      console.error('admin members get error', error);
      return serverError(res);
    }
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const phone = normalizePhone(body.phone);
      const employeeNumber = normalizeEmployeeNumber(body.employeeNumber);

      if (!name || !email || !phone || !employeeNumber) {
        return badRequest(res, 'Alle felter må fylles ut');
      }

      if (!email.includes('@')) {
        return badRequest(res, 'E-postadresse ser ugyldig ut');
      }

      const result = await query(
        `INSERT INTO members (name, email, phone, employee_number)
         VALUES ($1, $2, $3, $4)
         RETURNING id,
                   name,
                   email,
                   phone,
                   employee_number AS "employeeNumber",
                   created_at AS "createdAt"`,
        [name, email, phone, employeeNumber]
      );

      return sendJson(res, 201, { item: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return sendJson(res, 409, { error: 'Telefonnummer eller ansattnummer finnes allerede' });
      }

      console.error('admin members post error', error);
      return serverError(res);
    }
  }

  try {
    const params = getQueryParams(req);
    const id = Number(params.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, 'Gyldig id må sendes med');
    }

    await query('DELETE FROM members WHERE id = $1', [id]);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('admin members delete error', error);
    return serverError(res);
  }
};
