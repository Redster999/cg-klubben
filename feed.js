const NEWS_LIST_ID = "aktuelt-list";
const COURSES_LIST_ID = "kurs-list";
const NEWS_JSON_PATH = "data/news.json";
const COURSES_JSON_PATH = "data/events.json";
const MAX_NEWS_ITEMS = 10;
const MAX_COURSE_ITEMS = 6;

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
  const items = (payload && payload.items ? payload.items : []).slice(0, MAX_COURSE_ITEMS);

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

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Kunne ikke hente ${path} (${response.status})`);
  }

  return response.json();
}

async function initFeeds() {
  const newsList = document.getElementById(NEWS_LIST_ID);
  const courseList = document.getElementById(COURSES_LIST_ID);

  if (!newsList || !courseList) {
    return;
  }

  try {
    const [newsPayload, coursePayload] = await Promise.all([
      loadJson(NEWS_JSON_PATH),
      loadJson(COURSES_JSON_PATH),
    ]);

    renderNews(newsList, newsPayload);
    renderCourses(courseList, coursePayload);
  } catch (error) {
    console.error(error);
    setListItems(newsList, [createStatusItem("Kunne ikke laste nyheter na.")]);
    setListItems(courseList, [createStatusItem("Kunne ikke laste kurs na.")]);
  }
}

document.addEventListener("DOMContentLoaded", initFeeds);
