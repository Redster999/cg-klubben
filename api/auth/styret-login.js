const { badRequest, forbidden, isSameOrigin, methodNotAllowed, parseJsonBody, sendJson, serverError, unauthorized } = require('../_lib/http');
const { boardCredentials, safeEqual, setSession } = require('../_lib/session');

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

    const board = boardCredentials();
    const usernameOk = safeEqual(username, board.username);
    const passwordOk = safeEqual(password, board.password);

    if (!usernameOk || !passwordOk) {
      return unauthorized(res, 'Ugyldig innlogging');
    }

    setSession(res, req, { role: 'styret', name: 'Styret' });
    return sendJson(res, 200, { ok: true, role: 'styret' });
  } catch (error) {
    console.error('styret-login error', error);
    if (error && typeof error.message === 'string' && error.message.startsWith('Missing required environment variable:')) {
      const missingName = error.message.split(':').slice(1).join(':').trim();
      return serverError(res, `Serverkonfigurasjon mangler: ${missingName}`);
    }
    return serverError(res);
  }
};
