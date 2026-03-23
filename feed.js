const NEWS_LIST_ID = "aktuelt-list";
const COURSES_LIST_ID = "kurs-list";
const FRONTPAGE_WALL_LIST_ID = "frontpage-wall-list";
const NEWS_JSON_PATHS = ["/api/feeds/news", "data/news.json"];
const COURSES_JSON_PATHS = ["/api/feeds/events", "data/events.json"];
const FRONTPAGE_WALL_PATH = "/api/wall/frontpage";
const MAX_NEWS_ITEMS = 10;
const MAX_COURSE_ITEMS = 6;
const MAX_FRONTPAGE_WALL_ITEMS = 8;

function createStatusItem(message) {
  const li = document.createElement("li");
  li.className = "feed-status";
  li.textContent = message;
  return li;
}

function formatNewsDate(dateString) {
  if (!dateString) {
    return "";
  }

  const parts = dateString.split(".");
  if (parts.length !== 3) {
    return dateString;
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function formatEventDate(dateString) {
  if (!dateString) {
    return "";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("nb-NO");
}

function getTodayKeyInOslo() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function extractEventDayKey(dateString) {
  if (typeof dateString !== "string") {
    return "";
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(dateString);
  return match ? match[1] : "";
}

function isRelevantCourseItem(item) {
  const dayKey = extractEventDayKey(item && item.startDate);
  return Boolean(dayKey) && dayKey >= getTodayKeyInOslo();
}

function setListItems(listElement, items) {
  listElement.textContent = "";
  items.forEach((item) => {
    listElement.appendChild(item);
  });
}

function createFeedItem({ title, url, meta }) {
  const li = document.createElement("li");
  const link = document.createElement("a");
  const metaText = document.createElement("span");

  link.className = "feed-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = title;

  metaText.className = "feed-item-meta";
  metaText.textContent = meta;

  li.appendChild(link);
  li.appendChild(metaText);
  return li;
}

function renderNews(listElement, payload) {
  const items = (payload && payload.items ? payload.items : []).slice(0, MAX_NEWS_ITEMS);

  if (!items.length) {
    setListItems(listElement, [createStatusItem("Ingen nyheter tilgjengelig akkurat na.")]);
    return;
  }

  const rendered = items.map((item) => {
    const published = item.published
      ? formatNewsDate(item.published)
      : item.publishedAt
        ? formatEventDate(item.publishedAt)
        : "";
    const source = item.sourceName ? `${item.sourceName} - ` : "";

    return createFeedItem({
      title: item.title,
      url: item.url,
      meta: published ? `${source}Publisert ${published}` : `${source}Publisert nylig`,
    });
  });

  setListItems(listElement, rendered);
}

function renderCourses(listElement, payload) {
  const items = (payload && payload.items ? payload.items : [])
    .filter(isRelevantCourseItem)
    .slice(0, MAX_COURSE_ITEMS);

  if (!items.length) {
    setListItems(listElement, [createStatusItem("Ingen kurs tilgjengelig akkurat na.")]);
    return;
  }

  const rendered = items.map((item) => {
    const dateLabel = formatEventDate(item.startDate);
    const parts = [dateLabel, item.location].filter(Boolean);

    return createFeedItem({
      title: item.title,
      url: item.url,
      meta: parts.join(" - "),
    });
  });

  setListItems(listElement, rendered);
}

function renderFrontpageWall(listElement, payload) {
  const items = (payload && payload.items ? payload.items : []).slice(0, MAX_FRONTPAGE_WALL_ITEMS);

  if (!items.length) {
    setListItems(listElement, [createStatusItem("Ingen forsideinnlegg enda.")]);
    return;
  }

  const rendered = items.map((item) => {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    const body = document.createElement("p");
    const meta = document.createElement("span");

    title.className = "feed-link";
    title.textContent = item.title;

    body.className = "feed-item-meta";
    body.textContent = item.body;

    const createdAt = item.createdAt ? formatEventDate(item.createdAt) : "";
    meta.className = "feed-item-meta";
    meta.textContent = createdAt ? `Publisert ${createdAt}` : "";

    li.appendChild(title);
    li.appendChild(body);
    if (meta.textContent) {
      li.appendChild(meta);
    }
    return li;
  });

  setListItems(listElement, rendered);
}

async function loadJson(paths) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let lastError = null;

  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Kunne ikke hente ${path} (${response.status})`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Kunne ikke hente feed-data");
}

async function initFeeds() {
  const newsList = document.getElementById(NEWS_LIST_ID);
  const courseList = document.getElementById(COURSES_LIST_ID);
  const wallList = document.getElementById(FRONTPAGE_WALL_LIST_ID);

  if (!newsList || !courseList) {
    return;
  }

  try {
    const [newsPayload, coursePayload] = await Promise.all([
      loadJson(NEWS_JSON_PATHS),
      loadJson(COURSES_JSON_PATHS),
    ]);

    renderNews(newsList, newsPayload);
    renderCourses(courseList, coursePayload);
  } catch (error) {
    console.error(error);
    setListItems(newsList, [createStatusItem("Kunne ikke laste nyheter na.")]);
    setListItems(courseList, [createStatusItem("Kunne ikke laste kurs na.")]);
  }

  if (wallList) {
    try {
      const wallPayload = await loadJson(FRONTPAGE_WALL_PATH);
      renderFrontpageWall(wallList, wallPayload);
    } catch (error) {
      console.error(error);
      setListItems(wallList, [createStatusItem("Kunne ikke laste veggen na.")]);
    }
  }
}

document.addEventListener("DOMContentLoaded", initFeeds);
