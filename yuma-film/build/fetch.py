#!/usr/bin/env python3
"""Download the stills listed in photos.json from Wikimedia Commons and record their credits.

photos.json maps a shot name to a Commons file title. Each file is fetched as a JPEG no wider
than 3840 px into src/<shot>.jpg, and credits_commons.json records author, license and source page.
"""
import html, io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
UA = "yuma-promo-builder/1.0 (video assembly script)"
API = "https://commons.wikimedia.org/w/api.php"


def get(url, timeout=120):
    for attempt in range(5):
        try:
            time.sleep(float(os.environ.get("DELAY", "1.5")) + attempt * 20)
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            err = e
    raise err


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


photos = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "photos.json"))
credits = json.load(open("credits_commons.json")) if os.path.exists("credits_commons.json") else {}
os.makedirs("src", exist_ok=True)
for name, title in photos.items():
    out = f"src/{name}.jpg"
    if os.path.exists(out) and credits.get(name, {}).get("title") == title:
        continue
    # Commons serves originals sparingly; ask for one of its standard thumbnail widths instead.
    for width in (3840, 1920):
        p = {"action": "query", "format": "json", "titles": title, "prop": "imageinfo",
             "iiprop": "url|size|extmetadata", "iiurlwidth": width}
        pg = next(iter(json.loads(get(API + "?" + urllib.parse.urlencode(p)))["query"]["pages"].values()))
        ii = pg["imageinfo"][0]
        if ii["width"] >= width:
            break
    md = ii["extmetadata"]
    im = Image.open(io.BytesIO(get(ii.get("thumburl") or ii["url"]))).convert("RGB")
    im.save(out, quality=94)
    credits[name] = {
        "title": title,
        "author": strip(md.get("Artist", {}).get("value", "")),
        "credit": strip(md.get("Credit", {}).get("value", "")),
        "license": strip(md.get("LicenseShortName", {}).get("value", "")),
        "license_url": md.get("LicenseUrl", {}).get("value", ""),
        "description": strip(md.get("ImageDescription", {}).get("value", ""))[:400],
        "date": strip(md.get("DateTimeOriginal", {}).get("value", ""))[:40],
        "source": ii["descriptionurl"],
        "original_size": [ii["width"], ii["height"]],
        "fetched_size": list(im.size),
    }
    json.dump(credits, open("credits_commons.json", "w"), indent=1)
    print(f"{name:10s} {im.size[0]}x{im.size[1]}  {credits[name]['license']:16s} {credits[name]['author'][:50]}", flush=True)
