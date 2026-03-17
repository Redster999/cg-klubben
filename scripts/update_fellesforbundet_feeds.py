#!/usr/bin/env python3
"""Fetch and store news/course feeds as local JSON files."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

BASE_URL = "https://www.fellesforbundet.no"
NEWS_ENDPOINT = "/api/news"
EVENTS_ENDPOINT = "/api/events"
FRIFAG_NEWS_FEED_URL = "https://frifagbevegelse.no/nyheter-6.295.164.0.11fb3b69c7"
FRIFAG_SECTION_URL = "https://frifagbevegelse.no/magasinet-for-fagorganiserte-6.222.1167.4e909464d4"
HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "cg-klubben-feed-updater/1.0",
}

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
NEWS_OUTPUT = DATA_DIR / "news.json"
EVENTS_OUTPUT = DATA_DIR / "events.json"


def fetch_json(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urlencode(params)
    request = Request(f"{BASE_URL}{endpoint}?{query}", headers=HEADERS)

    with urlopen(request, timeout=30) as response:
        payload = response.read().decode("utf-8")

    return json.loads(payload)


def fetch_text(url: str, headers: dict[str, str] | None = None) -> str:
    request = Request(url, headers=headers or {})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def make_absolute(url: str) -> str:
    if not url:
        return BASE_URL
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return f"{BASE_URL}{url}"
    return f"{BASE_URL}/{url}"


def parse_felles_published(raw_value: str) -> datetime | None:
    if not raw_value:
        return None

    try:
        parsed = datetime.strptime(raw_value, "%d.%m.%Y")
        return parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def normalize_to_utc_day(value: datetime) -> datetime:
    utc_value = value.astimezone(timezone.utc)
    return datetime(utc_value.year, utc_value.month, utc_value.day, tzinfo=timezone.utc)


def normalize_felles_news(payload: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for item in payload.get("list", []):
        published = item.get("published", "")
        published_dt = parse_felles_published(published)
        published_day = normalize_to_utc_day(published_dt) if published_dt else None
        items.append(
            {
                "title": item.get("name", ""),
                "url": make_absolute(item.get("url", "")),
                "published": published,
                "publishedAt": published_day.isoformat() if published_day else "",
                "summary": item.get("text", ""),
                "sourceName": "Fellesforbundet",
                "sourceUrl": make_absolute("/aktuelt/nyheter/"),
            }
        )

    return items


def normalize_frifag_news(rss_xml: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    root = ET.fromstring(rss_xml)
    channel = root.find("channel")

    if channel is None:
        return items

    for item in channel.findall("item"):
        link = (item.findtext("link") or "").strip()
        title = (item.findtext("title") or "").strip()
        description = (item.findtext("description") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()

        try:
            published_dt = parsedate_to_datetime(pub_date)
            if published_dt.tzinfo is None:
                published_dt = published_dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            published_dt = None

        published_day = normalize_to_utc_day(published_dt) if published_dt else None
        display_date = (
            published_day.strftime("%d.%m.%Y")
            if published_day
            else ""
        )

        items.append(
            {
                "title": title,
                "url": link,
                "published": display_date,
                "publishedAt": published_day.isoformat() if published_day else "",
                "summary": description,
                "sourceName": "FriFagbevegelse",
                "sourceUrl": FRIFAG_SECTION_URL,
            }
        )

    return items


def parse_iso_datetime(value: str) -> datetime:
    if value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.fromtimestamp(0, tz=timezone.utc)


def merge_news_items(*collections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}

    for collection in collections:
        for item in collection:
            url = item.get("url", "")
            if not url:
                continue

            existing = merged.get(url)
            if existing is None:
                merged[url] = item
                continue

            if parse_iso_datetime(item.get("publishedAt", "")) > parse_iso_datetime(
                existing.get("publishedAt", "")
            ):
                merged[url] = item

    ordered = sorted(
        merged.values(),
        key=lambda item: parse_iso_datetime(item.get("publishedAt", "")),
        reverse=True,
    )
    return ordered


def build_news_payload(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {"name": "Fellesforbundet", "url": make_absolute("/aktuelt/nyheter/")},
            {"name": "FriFagbevegelse", "url": FRIFAG_SECTION_URL},
        ],
        "totalHits": len(items),
        "items": items,
    }


def normalize_events(payload: dict[str, Any]) -> dict[str, Any]:
    events: list[dict[str, Any]] = []

    for month_section in payload.get("list", []):
        month_name = month_section.get("heading", "")
        for item in month_section.get("items", []):
            events.append(
                {
                    "title": item.get("heading", ""),
                    "url": make_absolute(item.get("url", "")),
                    "startDate": item.get("startDate", ""),
                    "location": item.get("location", ""),
                    "type": item.get("type", ""),
                    "monthSection": month_name,
                }
            )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": make_absolute("/aktuelt/kurs-og-arrangementer/"),
        "totalHits": payload.get("totalHits", 0),
        "items": events,
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Fellesforbundet news/course feeds and store them as local JSON files."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--news-only",
        action="store_true",
        help="Only update data/news.json.",
    )
    group.add_argument(
        "--events-only",
        action="store_true",
        help="Only update data/events.json.",
    )
    return parser.parse_args()


def update_news() -> None:
    news_payload = fetch_json(NEWS_ENDPOINT, {"lang": "no", "page": 1})
    frifag_rss = fetch_text(FRIFAG_NEWS_FEED_URL, {"User-Agent": HEADERS["User-Agent"]})

    merged_news = merge_news_items(
        normalize_felles_news(news_payload),
        normalize_frifag_news(frifag_rss),
    )

    write_json(NEWS_OUTPUT, build_news_payload(merged_news))
    print(f"Updated {NEWS_OUTPUT}")


def update_events() -> None:
    events_payload = fetch_json(EVENTS_ENDPOINT, {"lang": "no", "page": 1, "type": "Kurs"})
    write_json(EVENTS_OUTPUT, normalize_events(events_payload))
    print(f"Updated {EVENTS_OUTPUT}")


def main() -> None:
    args = parse_args()

    if not args.events_only:
        update_news()

    if not args.news_only:
        update_events()


if __name__ == "__main__":
    main()
