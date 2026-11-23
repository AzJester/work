#!/usr/bin/env python3
"""Fetch Carol M. Highsmith photographs from the Library of Congress (no known restrictions).

loc_photos.json maps a shot name to [highsm id, LCCN, title]. The 8-bit master TIFF is
downloaded, reduced to a JPEG no wider than 3840 px in src/<shot>.jpg and then discarded.
"""
import json, os, sys, time, urllib.request
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
UA = "yuma-promo-builder/1.0 (video assembly script)"
photos = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "loc_photos.json"))
credits = json.load(open("credits_loc.json")) if os.path.exists("credits_loc.json") else {}
os.makedirs("src", exist_ok=True)
for name, (hid, lccn, title) in photos.items():
    out = f"src/{name}.jpg"
    if os.path.exists(out) and credits.get(name, {}).get("lccn") == lccn:
        continue
    url = f"https://tile.loc.gov/storage-services/master/pnp/highsm/{hid // 100 * 100}/{hid}u.tif"
    tmp = f"/tmp/{hid}.tif"
    pre = f"/tmp/tif/{hid}u.tif"
    for attempt in range(4):
        if os.path.exists(pre):
            tmp = pre
            break
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                while True:
                    b = r.read(1 << 22)
                    if not b:
                        break
                    f.write(b)
            break
        except Exception as e:
            print("retry", name, e, flush=True)
            time.sleep(4 + 6 * attempt)
    im = Image.open(tmp)
    full = im.size
    im = im.convert("RGB")
    if im.size[0] > 3840:
        im = im.resize((3840, round(im.size[1] * 3840 / im.size[0])), Image.LANCZOS)
    im.save(out, quality=94)
    os.remove(tmp)
    credits[name] = {
        "title": title, "author": "Carol M. Highsmith", "license": "No known restrictions on publication",
        "credit": "Carol M. Highsmith's America Project, Library of Congress, Prints and Photographs Division",
        "lccn": lccn, "reproduction_number": f"LC-DIG-highsm-{hid}", "date": "2018-11",
        "source": f"https://www.loc.gov/pictures/item/{lccn}/",
        "original_size": list(full), "fetched_size": list(im.size),
    }
    json.dump(credits, open("credits_loc.json", "w"), indent=1)
    print(f"{name:10s} {full[0]}x{full[1]} -> {im.size[0]}x{im.size[1]}", flush=True)
