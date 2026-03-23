const BASE_URL = 'https://www.fellesforbundet.no';
const NEWS_ENDPOINT = `${BASE_URL}/api/news?lang=no&page=1`;
const EVENTS_ENDPOINT = `${BASE_URL}/api/events?lang=no&page=1&type=Kurs`;
const FRIFAG_NEWS_FEED_URL = 'https://frifagbevegelse.no/nyheter-6.295.164.0.11fb3b69c7';
const FRIFAG_SECTION_URL = 'https://frifagbevegelse.no/magasinet-for-fagorganiserte-6.222.1167.4e909464d4';
const FEED_TIME_ZONE = 'Europe/Oslo';
const FETCH_TIMEOUT_MS = 15000;
const MAX_NEWS_ITEMS = 40;
const MAX_EVENT_ITEMS = 20;

const HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'cg-klubben-feed-updater/1.0',
};

const FEED_CONFIG = {
  news: {
    cacheControl: 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
    maxAgeMs: 6 * 60 * 60 * 1000,
  },
  events: {
    cacheControl: 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400',
    maxAgeMs: 6 * 60 * 60 * 1000,
  },
};

const inflightRefreshes = new Map();

function assertFeedKey(feedKey) {
  if (!Object.prototype.hasOwnProperty.call(FEED_CONFIG, feedKey)) {
    throw new Error(`Unknown feed key: ${feedKey}`);
  }
}

function getFetchOptions(headers) {
  const options = { headers };

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    options.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }

  return options;
}

async function fetchJson(url, headers = HEADERS) {
  const response = await fetch(url, getFetchOptions(headers));

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.status} from ${url}`);
  }

  return response.json();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, getFetchOptions(headers));

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.status} from ${url}`);
  }

  return response.text();
}

function makeAbsolute(url) {
  if (!url) {
    return BASE_URL;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${BASE_URL}${url}`;
  }

  return `${BASE_URL}/${url}`;
}

function parseFellesPublished(rawValue) {
  if (!rawValue) {
    return null;
  }

  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(rawValue);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function normalizeToUtcDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());
  return `${day}.${month}.${year}`;
}

function stripCdata(value) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
    return trimmed.slice(9, -3);
  }

  return trimmed;
}

function decodeHtmlEntities(value) {
  if (!value) {
    return '';
  }

  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
    .replace(/&([a-z]+);/gi, (match, entity) => namedEntities[entity] || match);
}

function extractRssTag(block, tagName) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(block);
  return decodeHtmlEntities(stripCdata(match ? match[1] : ''));
}

function parseComparableDate(value) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeNewsItems(...collections) {
  const merged = new Map();

  for (const collection of collections) {
    for (const item of collection) {
      if (!item || !item.url) {
        continue;
      }

      const existing = merged.get(item.url);
      if (!existing || parseComparableDate(item.publishedAt) > parseComparableDate(existing.publishedAt)) {
        merged.set(item.url, item);
      }
    }
  }

  return Array.from(merged.values()).sort(
    (left, right) => parseComparableDate(right.publishedAt) - parseComparableDate(left.publishedAt)
  );
}

function sanitizeNewsItems(items) {
  return items
    .filter((item) => item && item.url && item.title)
    .sort((left, right) => parseComparableDate(right.publishedAt) - parseComparableDate(left.publishedAt))
    .slice(0, MAX_NEWS_ITEMS);
}

function buildNewsPayload(items) {
  const sanitizedItems = sanitizeNewsItems(items);

  return {
    generatedAt: new Date().toISOString(),
    sources: [
      { name: 'Fellesforbundet', url: makeAbsolute('/aktuelt/nyheter/') },
      { name: 'FriFagbevegelse', url: FRIFAG_SECTION_URL },
    ],
    totalHits: sanitizedItems.length,
    items: sanitizedItems,
  };
}

function normalizeFellesNews(payload) {
  return (payload.list || []).map((item) => {
    const publishedDay = normalizeToUtcDay(parseFellesPublished(item.published || ''));

    return {
      title: item.name || '',
      url: makeAbsolute(item.url || ''),
      published: item.published || '',
      publishedAt: publishedDay ? publishedDay.toISOString() : '',
      summary: item.text || '',
      sourceName: 'Fellesforbundet',
      sourceUrl: makeAbsolute('/aktuelt/nyheter/'),
    };
  });
}

function normalizeFrifagNews(rssXml) {
  const items = [];

  for (const match of rssXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const link = extractRssTag(block, 'link');
    const title = extractRssTag(block, 'title');
    const description = extractRssTag(block, 'description');
    const pubDate = extractRssTag(block, 'pubDate');
    const publishedDate = normalizeToUtcDay(new Date(pubDate));

    items.push({
      title,
      url: link,
      published: formatUtcDay(publishedDate),
      publishedAt: publishedDate ? publishedDate.toISOString() : '',
      summary: description,
      sourceName: 'FriFagbevegelse',
      sourceUrl: FRIFAG_SECTION_URL,
    });
  }

  return items;
}

function getTodayKey(now = new Date(), timeZone = FEED_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const values = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function extractEventDayKey(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}

function sanitizeEventItems(items, now = new Date()) {
  const todayKey = getTodayKey(now);

  return items
    .filter((item) => {
      const dayKey = extractEventDayKey(item && item.startDate);
      return Boolean(dayKey) && dayKey >= todayKey;
    })
    .sort((left, right) => {
      const dateComparison = extractEventDayKey(left.startDate).localeCompare(extractEventDayKey(right.startDate));
      if (dateComparison !== 0) {
        return dateComparison;
      }

      return (left.title || '').localeCompare(right.title || '', 'nb');
    })
    .slice(0, MAX_EVENT_ITEMS);
}

function buildEventsPayload(items) {
  const sanitizedItems = sanitizeEventItems(items);

  return {
    generatedAt: new Date().toISOString(),
    source: makeAbsolute('/aktuelt/kurs-og-arrangementer/'),
    totalHits: sanitizedItems.length,
    items: sanitizedItems,
  };
}

function normalizeEvents(payload) {
  const items = [];

  for (const monthSection of payload.list || []) {
    const monthName = monthSection.heading || '';

    for (const item of monthSection.items || []) {
      items.push({
        title: item.heading || '',
        url: makeAbsolute(item.url || ''),
        startDate: item.startDate || '',
        location: item.location || '',
        type: item.type || '',
        monthSection: monthName,
      });
    }
  }

  return buildEventsPayload(items);
}

function sanitizeFeedPayload(feedKey, payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    return payload;
  }

  if (feedKey === 'news') {
    const items = sanitizeNewsItems(payload.items);
    return { ...payload, totalHits: items.length, items };
  }

  if (feedKey === 'events') {
    const items = sanitizeEventItems(payload.items);
    return { ...payload, totalHits: items.length, items };
  }

  return payload;
}

function isFeedFresh(feedKey, payload) {
  assertFeedKey(feedKey);

  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const generatedAt = Date.parse(payload.generatedAt || '');
  if (Number.isNaN(generatedAt)) {
    return false;
  }

  return Date.now() - generatedAt < FEED_CONFIG[feedKey].maxAgeMs;
}

async function fetchFreshFeed(feedKey) {
  if (feedKey === 'news') {
    const [fellesPayload, frifagRss] = await Promise.all([
      fetchJson(NEWS_ENDPOINT),
      fetchText(FRIFAG_NEWS_FEED_URL, { 'User-Agent': HEADERS['User-Agent'] }),
    ]);

    return buildNewsPayload(
      mergeNewsItems(normalizeFellesNews(fellesPayload), normalizeFrifagNews(frifagRss))
    );
  }

  if (feedKey === 'events') {
    const payload = await fetchJson(EVENTS_ENDPOINT);
    return normalizeEvents(payload);
  }

  throw new Error(`Unknown feed key: ${feedKey}`);
}

async function refreshFeedWithLock(feedKey) {
  const existingRefresh = inflightRefreshes.get(feedKey);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = fetchFreshFeed(feedKey).finally(() => {
    inflightRefreshes.delete(feedKey);
  });

  inflightRefreshes.set(feedKey, refreshPromise);
  return refreshPromise;
}

async function resolveFeedPayload(feedKey, currentPayload) {
  assertFeedKey(feedKey);

  const sanitizedPayload = sanitizeFeedPayload(feedKey, currentPayload);
  if (isFeedFresh(feedKey, sanitizedPayload)) {
    return { payload: sanitizedPayload, refreshed: false };
  }

  try {
    const payload = sanitizeFeedPayload(feedKey, await refreshFeedWithLock(feedKey));
    return { payload, refreshed: true };
  } catch (error) {
    if (sanitizedPayload) {
      console.error(`${feedKey} refresh failed, serving last snapshot`, error);
      return { payload: sanitizedPayload, refreshed: false };
    }

    throw error;
  }
}

function getFeedCacheControl(feedKey) {
  assertFeedKey(feedKey);
  return FEED_CONFIG[feedKey].cacheControl;
}

module.exports = {
  getFeedCacheControl,
  resolveFeedPayload,
  sanitizeFeedPayload,
};
