#!/usr/bin/env python3
"""Refresh the JSON data files the TV system reads.

Runs hourly on GitHub Actions (see .github/workflows/update-data.yml).
Every source is optional: if one fails, the previous file is kept.
Only the Python standard library is used.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = "home-tv-dashboard/1.0 (personal TV dashboard; github.com/huseeinfilming-creator/home-tv)"


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(name, obj):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("wrote", name)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


# ---------------------------------------------------------------- news / sports
def rss_items(url, limit=25):
    root = ET.fromstring(get(url))
    out = []
    for it in root.iter("item"):
        title = strip_tags(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        src_el = it.find("source")
        source = strip_tags(src_el.text) if src_el is not None and src_el.text else ""
        # Google News titles end with " - Source"
        if not source and " - " in title:
            title, source = title.rsplit(" - ", 1)
        elif source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)]
        if title:
            out.append({"title": title.strip(), "source": source.strip(), "link": link})
        if len(out) >= limit:
            break
    return out


def build_feed(name, urls):
    items, seen = [], set()
    for u in urls:
        try:
            for it in rss_items(u):
                k = it["title"][:60]
                if k not in seen:
                    seen.add(k)
                    items.append(it)
        except Exception as e:  # noqa: BLE001
            print("feed failed", u, e, file=sys.stderr)
    if items:
        save(name, {"updated": now_iso(), "items": items[:40]})


NEWS = [
    "https://news.google.com/rss?hl=ar&gl=SA&ceid=SA:ar",
    "https://feeds.bbci.co.uk/arabic/rss.xml",
]
SPORTS = [
    "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ar&gl=SA&ceid=SA:ar",
]

# ---------------------------------------------------------------- Quran radios
TOP_RECITERS = [
    "العفاسي", "عبدالباسط", "عبد الباسط", "المنشاوي", "الحصري", "السديس", "الشريم",
    "المعيقلي", "الدوسري", "الغامدي", "العجمي", "فارس عباد", "القطامي", "البنا",
    "الطبلاوي", "الشاطري", "الحذيفي", "العجمي", "الجهني", "الكلباني",
]


def build_radios():
    try:
        d = json.loads(get("https://mp3quran.net/api/v3/radios?language=ar"))
        radios = [{"name": r["name"].strip(), "url": r["url"].strip()} for r in d.get("radios", []) if r.get("url")]

        def rank(r):
            for i, k in enumerate(TOP_RECITERS):
                if k in r["name"]:
                    return i
            return 999

        radios.sort(key=rank)
        if radios:
            save("radios.json", {"updated": now_iso(), "items": radios[:120]})
    except Exception as e:  # noqa: BLE001
        print("radios failed", e, file=sys.stderr)


# ---------------------------------------------------------------- live channels
WANTED = [
    "Al Jazeera", "Al Jazeera Mubasher", "Al Arabiya", "Al Hadath", "Asharq", "Sky News Arabia",
    "TRT Arabi", "Al Araby", "France 24 Arabic", "DW Arabic", "BBC Arabic", "Syria TV",
    "Saudi Quran", "Saudi Sunnah", "Al Quran", "Quran", "Sunnah", "Iqraa", "Al Majd",
    "Al Resalah", "Spacetoon", "Majid", "Al Kass", "SBC", "Rotana", "Al Aoula",
]


def build_channels():
    try:
        text = get("https://iptv-org.github.io/iptv/languages/ara.m3u").decode("utf-8", "replace")
        lines = text.splitlines()
        found = []
        for i, line in enumerate(lines):
            if not line.startswith("#EXTINF"):
                continue
            name = line.rsplit(",", 1)[-1].strip()
            url = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if not url.startswith("http") or ".m3u8" not in url:
                continue
            logo = re.search(r'tvg-logo="([^"]*)"', line)
            low = name.lower()
            score = None
            for j, w in enumerate(WANTED):
                if w.lower() in low:
                    score = j
                    break
            if score is None:
                continue
            flags = []
            if "geo-blocked" in low:
                flags.append("geo")
            clean = re.sub(r"\s*[\[(].*?[\])]", "", name).strip()
            found.append({"name": clean, "url": url, "logo": logo.group(1) if logo else "", "rank": score, "flags": flags})
        found.sort(key=lambda c: (c["rank"], "geo" in c["flags"]))
        seen, out = set(), []
        for c in found:
            if c["name"] in seen:
                continue
            seen.add(c["name"])
            c.pop("rank")
            out.append(c)
        if out:
            save("channels.json", {"updated": now_iso(), "items": out[:40]})
    except Exception as e:  # noqa: BLE001
        print("channels failed", e, file=sys.stderr)


# ---------------------------------------------------------------- photos (Wikimedia Commons, CC-licensed)
CATEGORIES = ["Category:Masjid al-Haram", "Category:Kaaba", "Category:Al-Masjid an-Nabawi", "Category:Medina", "Category:Mecca"]


def commons(params):
    params.update({"format": "json", "formatversion": "2"})
    return json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))


def build_photos():
    photos, seen = [], set()
    for cat in CATEGORIES:
        try:
            d = commons({
                "action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file",
                "gcmlimit": "60", "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": "1920",
            })
            for p in d.get("query", {}).get("pages", []):
                ii = (p.get("imageinfo") or [{}])[0]
                if ii.get("mime") != "image/jpeg":
                    continue
                w, h = ii.get("width", 0), ii.get("height", 0)
                if w < 1600 or w < h * 1.3:
                    continue
                meta = ii.get("extmetadata", {})
                lic = strip_tags(meta.get("LicenseShortName", {}).get("value", ""))
                if not lic or "fair use" in lic.lower():
                    continue
                url = ii.get("thumburl") or ii.get("url")
                if url in seen:
                    continue
                seen.add(url)
                photos.append({
                    "url": url,
                    "author": strip_tags(meta.get("Artist", {}).get("value", ""))[:60],
                    "license": lic,
                    "page": ii.get("descriptionurl", ""),
                })
        except Exception as e:  # noqa: BLE001
            print("photos failed", cat, e, file=sys.stderr)
    if photos:
        save("photos.json", {"updated": now_iso(), "items": photos[:60]})


# ---------------------------------------------------------------- adhan audio (Wikimedia Commons)
def build_adhan():
    if os.path.exists(os.path.join(DATA, "adhan.json")):
        return
    try:
        d = commons({"action": "query", "list": "search", "srsearch": "adhan filetype:audio", "srnamespace": "6", "srlimit": "20"})
        for r in d.get("query", {}).get("search", []):
            info = commons({"action": "query", "titles": r["title"], "prop": "imageinfo", "iiprop": "url|extmetadata|mime"})
            page = info["query"]["pages"][0]
            ii = (page.get("imageinfo") or [{}])[0]
            url, mime = ii.get("url", ""), ii.get("mime", "")
            if not url:
                continue
            if mime == "audio/mpeg":
                mp3 = url
            elif mime in ("application/ogg", "audio/ogg", "audio/x-wav", "audio/wav", "audio/webm"):
                fname = url.rsplit("/", 1)[-1]
                mp3 = url.replace("/commons/", "/commons/transcoded/", 1) + "/" + fname + ".mp3"
            else:
                continue
            meta = ii.get("extmetadata", {})
            save("adhan.json", {
                "url": mp3, "original": url,
                "author": strip_tags(meta.get("Artist", {}).get("value", ""))[:60],
                "license": strip_tags(meta.get("LicenseShortName", {}).get("value", "")),
                "page": ii.get("descriptionurl", ""),
            })
            return
    except Exception as e:  # noqa: BLE001
        print("adhan failed", e, file=sys.stderr)


if __name__ == "__main__":
    build_feed("news.json", NEWS)
    build_feed("sports.json", SPORTS)
    build_radios()
    build_channels()
    build_photos()
    build_adhan()
