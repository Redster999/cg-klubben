#!/usr/bin/env python3
"""Fetch and store Fellesforbundet news and course feeds as local JSON files."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://www.fellesforbundet.no"
NEWS_ENDPOINT = "/api/news"
EVENTS_ENDPOINT = "/api/events"
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


def make_absolute(url: str) -> str:
    if not url:
        return BASE_URL
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return f"{BASE_URL}{url}"
    return f"{BASE_URL}/{url}"


def normalize_news(payload: dict[str, Any]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []

    for item in payload.get("list", []):
        items.append(
            {
                "title": item.get("name", ""),
                "url": make_absolute(item.get("url", "")),
                "published": item.get("published", ""),
                "summary": item.get("text", ""),
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": make_absolute("/aktuelt/nyheter/"),
        "totalHits": payload.get("totalHits", 0),
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


def main() -> None:
    news_payload = fetch_json(NEWS_ENDPOINT, {"lang": "no", "page": 1})
    events_payload = fetch_json(EVENTS_ENDPOINT, {"lang": "no", "page": 1, "type": "Kurs"})

    write_json(NEWS_OUTPUT, normalize_news(news_payload))
    write_json(EVENTS_OUTPUT, normalize_events(events_payload))

    print(f"Updated {NEWS_OUTPUT}")
    print(f"Updated {EVENTS_OUTPUT}")


if __name__ == "__main__":
    main()
