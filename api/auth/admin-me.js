const { methodNotAllowed, sendJson } = require('../_lib/http');
const { getAdminSession, getSession } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const session = getSession(req);
  const admin = getAdminSession(req);
  const authenticated = Boolean(session && session.role === 'styret' && admin && admin.scope === 'admin');

  return sendJson(res, 200, {
    authenticated,
    role: authenticated ? 'styret' : null,
  });
};
