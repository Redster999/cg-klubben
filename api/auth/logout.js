const { forbidden, isSameOrigin, methodNotAllowed, sendJson } = require('../_lib/http');
const { clearAuthSessions } = require('../_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!isSameOrigin(req)) {
    return forbidden(res, 'Cross-origin request blocked');
  }

  clearAuthSessions(res, req);
  return sendJson(res, 200, { ok: true });
};
