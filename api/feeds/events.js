const {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  sendJson,
  serverError,
  unauthorized,
} = require('../_lib/http');
const {
  getFeedCacheControl,
  resolveFeedPayload,
  sanitizeFeedPayload,
} = require('../_lib/fellesforbundet-feeds');
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
      const snapshot = await getFeedSnapshot(FEED_KEY);
      const { payload, refreshed } = await resolveFeedPayload(FEED_KEY, snapshot);

      if (!payload) {
        return sendJson(res, 404, { error: 'Feed not found' });
      }

      if (refreshed && process.env.DATABASE_URL) {
        try {
          await saveFeedSnapshot(FEED_KEY, payload);
        } catch (error) {
          console.error('events feed snapshot save error', error);
        }
      }

      res.setHeader('Cache-Control', getFeedCacheControl(FEED_KEY));
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

    await saveFeedSnapshot(FEED_KEY, sanitizeFeedPayload(FEED_KEY, payload));
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('events feed sync error', error);
    return serverError(res);
  }
};
