const { readFile } = require('fs/promises');
const path = require('path');

const { query } = require('./db');

const FALLBACK_FILES = {
  news: path.resolve(__dirname, '..', '..', 'data', 'news.json'),
  events: path.resolve(__dirname, '..', '..', 'data', 'events.json'),
};

function assertFeedKey(feedKey) {
  if (!Object.prototype.hasOwnProperty.call(FALLBACK_FILES, feedKey)) {
    throw new Error(`Unknown feed key: ${feedKey}`);
  }
}

async function readFallback(feedKey) {
  const filePath = FALLBACK_FILES[feedKey];

  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function getFeedSnapshot(feedKey) {
  assertFeedKey(feedKey);

  const result = await query(
    `SELECT payload,
            updated_at AS "updatedAt"
     FROM feed_snapshots
     WHERE feed_key = $1`,
    [feedKey]
  );

  if (result.rows[0] && result.rows[0].payload) {
    return result.rows[0].payload;
  }

  return readFallback(feedKey);
}

function isValidFeedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  if (!Array.isArray(payload.items)) {
    return false;
  }

  return true;
}

async function saveFeedSnapshot(feedKey, payload) {
  assertFeedKey(feedKey);

  await query(
    `INSERT INTO feed_snapshots (feed_key, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (feed_key)
     DO UPDATE SET payload = EXCLUDED.payload,
                   updated_at = NOW()`,
    [feedKey, JSON.stringify(payload)]
  );
}

module.exports = {
  getFeedSnapshot,
  isValidFeedPayload,
  saveFeedSnapshot,
};
