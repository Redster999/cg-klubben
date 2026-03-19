const {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  sendJson,
  serverError,
  unauthorized,
} = require('../_lib/http');
const { getFeedSnapshot, isValidFeedPayload, saveFeedSnapshot } = require('../_lib/feed-store');

const FEED_KEY = 'events';

function hasValidSyncToken(req) {
  const configuredToken = process.env.FEED_SYNC_TOKEN;

  if (!configuredToken) {
    return false;
  }

  const authHeader = req.headers.authorization || '';
  const expectedHeader = `Bearer ${configuredToken}`;
  return authHeader === expectedHeader;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST']);
  }

  if (req.method === 'GET') {
    try {
      const payload = await getFeedSnapshot(FEED_KEY);

      if (!payload) {
        return sendJson(res, 404, { error: 'Feed not found' });
      }

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      return sendJson(res, 200, payload);
    } catch (error) {
      console.error('events feed get error', error);
      return serverError(res);
    }
  }

  if (!hasValidSyncToken(req)) {
    return unauthorized(res, 'Invalid sync token');
  }

  try {
    const payload = await parseJsonBody(req);

    if (!isValidFeedPayload(payload)) {
      return badRequest(res, 'Feed payload must include an items array');
    }

    await saveFeedSnapshot(FEED_KEY, payload);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('events feed sync error', error);
    return serverError(res);
  }
};
