const { methodNotAllowed, sendJson } = require('../_lib/http');
const { getAdminSession, getSession } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const session = getSession(req);
  const adminSession = getAdminSession(req);
  const isAdmin = Boolean(session && session.role === 'styret' && adminSession && adminSession.scope === 'admin');

  if (!session) {
    return sendJson(res, 200, { authenticated: false, isAdmin: false });
  }

  return sendJson(res, 200, {
    authenticated: true,
    role: session.role,
    name: session.name || '',
    isAdmin,
  });
};
