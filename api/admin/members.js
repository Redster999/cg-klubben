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
  return String(phone || '').replace(/[^0-9]/g, '');
}

function normalizeEmployeeNumber(value) {
  return String(value || '').replace(/\s+/g, '');
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  return ['1', 'true', 'ja', 'yes', 'y', 'on'].includes(normalized);
}

function toMemberPayload(body) {
  return {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim(),
    phone: normalizePhone(body.phone),
    employeeNumber: normalizeEmployeeNumber(body.employeeNumber),
    isBoard: parseBoolean(body.isBoard, false),
  };
}

function validateMemberPayload(member) {
  if (!member.name || !member.email || !member.phone || !member.employeeNumber) {
    return 'Alle felter må fylles ut';
  }

  if (!member.email.includes('@')) {
    return 'E-postadresse ser ugyldig ut';
  }

  return '';
}

async function getMembers() {
  const result = await query(
    `SELECT id,
            name,
            email,
            phone,
            employee_number AS "employeeNumber",
            is_board AS "isBoard",
            created_at AS "createdAt"
     FROM members
     ORDER BY name ASC`
  );

  return result.rows;
}

async function createMember(member) {
  const result = await query(
    `INSERT INTO members (name, email, phone, employee_number, is_board)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id,
               name,
               email,
               phone,
               employee_number AS "employeeNumber",
               is_board AS "isBoard",
               created_at AS "createdAt"`,
    [member.name, member.email, member.phone, member.employeeNumber, member.isBoard]
  );

  return result.rows[0];
}

async function findExistingMember(member) {
  const result = await query(
    `SELECT id,
            name,
            email,
            phone,
            employee_number AS "employeeNumber",
            is_board AS "isBoard",
            created_at AS "createdAt"
     FROM members
     WHERE employee_number = $1
        OR phone = $2
        OR lower(email) = lower($3)
     ORDER BY CASE
       WHEN employee_number = $1 THEN 1
       WHEN phone = $2 THEN 2
       WHEN lower(email) = lower($3) THEN 3
       ELSE 4
     END
     LIMIT 1`,
    [member.employeeNumber, member.phone, member.email]
  );

  return result.rows[0] || null;
}

async function updateMemberById(id, member) {
  const result = await query(
    `UPDATE members
     SET name = $2,
         email = $3,
         phone = $4,
         employee_number = $5,
         is_board = $6
     WHERE id = $1
     RETURNING id,
               name,
               email,
               phone,
               employee_number AS "employeeNumber",
               is_board AS "isBoard",
               created_at AS "createdAt"`,
    [id, member.name, member.email, member.phone, member.employeeNumber, member.isBoard]
  );

  return result.rows[0] || null;
}

function memberChanged(existing, incoming) {
  return (
    existing.name !== incoming.name ||
    existing.email !== incoming.email ||
    existing.phone !== incoming.phone ||
    existing.employeeNumber !== incoming.employeeNumber ||
    Boolean(existing.isBoard) !== Boolean(incoming.isBoard)
  );
}

async function handleCreate(req, res, body) {
  const member = toMemberPayload(body);
  const validationError = validateMemberPayload(member);

  if (validationError) {
    return badRequest(res, validationError);
  }

  try {
    const created = await createMember(member);
    return sendJson(res, 201, { item: created, action: 'created' });
  } catch (error) {
    if (error.code === '23505') {
      return sendJson(res, 409, { error: 'Telefonnummer eller ansattnummer finnes allerede' });
    }

    console.error('admin members post error', error);
    return serverError(res);
  }
}

async function handleSync(req, res, body) {
  const member = toMemberPayload(body);
  const validationError = validateMemberPayload(member);

  if (validationError) {
    return badRequest(res, validationError);
  }

  try {
    const existing = await findExistingMember(member);

    if (!existing) {
      const created = await createMember(member);
      return sendJson(res, 201, { item: created, action: 'created' });
    }

    const nextMember = {
      ...member,
      isBoard: body.isBoard === undefined ? Boolean(existing.isBoard) : member.isBoard,
    };

    if (!memberChanged(existing, nextMember)) {
      return sendJson(res, 200, { item: existing, action: 'unchanged' });
    }

    const updated = await updateMemberById(existing.id, nextMember);
    return sendJson(res, 200, { item: updated, action: 'updated' });
  } catch (error) {
    if (error.code === '23505') {
      return sendJson(res, 409, { error: 'Kunne ikke oppdatere: telefonnummer eller ansattnummer er i bruk av en annen.' });
    }

    console.error('admin members sync error', error);
    return serverError(res);
  }
}

async function handlePatch(req, res, body) {
  const params = getQueryParams(req);
  const id = Number(params.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return badRequest(res, 'Gyldig id må sendes med');
  }

  try {
    const existingResult = await query(
      `SELECT id,
              name,
              email,
              phone,
              employee_number AS "employeeNumber",
              is_board AS "isBoard",
              created_at AS "createdAt"
       FROM members
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      return badRequest(res, 'Fant ikke medlemmet');
    }

    const nextMember = {
      name: typeof body.name === 'undefined' ? existing.name : String(body.name || '').trim(),
      email: typeof body.email === 'undefined' ? existing.email : String(body.email || '').trim(),
      phone: typeof body.phone === 'undefined' ? existing.phone : normalizePhone(body.phone),
      employeeNumber:
        typeof body.employeeNumber === 'undefined'
          ? existing.employeeNumber
          : normalizeEmployeeNumber(body.employeeNumber),
      isBoard: typeof body.isBoard === 'undefined' ? Boolean(existing.isBoard) : parseBoolean(body.isBoard, false),
    };

    const validationError = validateMemberPayload(nextMember);
    if (validationError) {
      return badRequest(res, validationError);
    }

    if (!memberChanged(existing, nextMember)) {
      return sendJson(res, 200, { item: existing, action: 'unchanged' });
    }

    const result = await query(
      `UPDATE members
       SET name = $2,
           email = $3,
           phone = $4,
           employee_number = $5,
           is_board = $6
       WHERE id = $1
       RETURNING id,
                 name,
                 email,
                 phone,
                 employee_number AS "employeeNumber",
                 is_board AS "isBoard",
                 created_at AS "createdAt"`,
      [id, nextMember.name, nextMember.email, nextMember.phone, nextMember.employeeNumber, nextMember.isBoard]
    );

    if (result.rows[0]) {
      return sendJson(res, 200, { item: result.rows[0], action: 'updated' });
    }

    return badRequest(res, 'Fant ikke medlemmet');
  } catch (error) {
    if (error.code === '23505') {
      return sendJson(res, 409, { error: 'Telefonnummer, epost eller ansattnummer er i bruk av en annen.' });
    }

    console.error('admin members patch error', error);
    return serverError(res);
  }
}

async function handleDelete(req, res) {
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
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  }

  const admin = requireAdmin(req, res);
  if (!admin) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const items = await getMembers();
      return sendJson(res, 200, { items });
    } catch (error) {
      console.error('admin members get error', error);
      return serverError(res);
    }
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  let body = {};
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return badRequest(res, 'Kunne ikke lese JSON-data');
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, body);
  }

  if (String(body.mode || '').trim().toLowerCase() === 'sync') {
    return handleSync(req, res, body);
  }

  return handleCreate(req, res, body);
};
