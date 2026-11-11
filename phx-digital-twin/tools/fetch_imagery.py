"""Bake public-domain aerial photography for the PHX twin.

Runs on a machine with open internet (GitHub Actions: .github/workflows/phx-twin-data.yml).
Pulls NAIP orthoimagery from US federal ArcGIS image services, reprojects it onto the twin's
local grid (transverse Mercator on the KPHX datum, same as tools/parse_apt.py), color-matches it
to the Sentinel-2 base so the seams do not show, and writes:

  data/photo_tiles/r_c.jpg    airfield at full detail, 0.32 m/px, 8 x 5 tiles of 2048 px (loaded near the view)
  data/photo_tiles/index.json tile grid description
  data/photo_airfield.jpg     whole airfield plane, 0.65 m/px (8192 px wide)
  data/photo_airfield_4k.jpg  same area at 1.3 m/px for phones
  data/photo_metro.jpg        12.3 km square around the airport, 3 m/px
  tools/imagery_report.json   which source was used and what each source answered

Usage: python phx-digital-twin/tools/fetch_imagery.py   (from the repo root)
"""
import io, json, math, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np, requests, cv2
from PIL import Image
from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
TILES = os.path.join(DATA, "photo_tiles")
LAT0, LON0 = 33.434277778, -112.011583333
TMERC = f"+proj=tmerc +lat_0={LAT0} +lon_0={LON0} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
to_merc = Transformer.from_crs(TMERC, "EPSG:3857", always_xy=True)
to_ll = Transformer.from_crs(TMERC, "EPSG:4326", always_xy=True)
PLANE = (-2650.0, 2650.0, -1550.0, 1450.0)   # x0, x1, n0, n1 of the airfield plane (airport.json meta.plane)
METRO_HALF = 6144.0
S2_HALF = 15360.0
UA = {"User-Agent": "airport-twin-imagery/1.0"}

# In priority order. Measured 2026-11-11: all three that answered serve Arizona NAIP flown September 2023 at 30 cm.
SOURCES = [
    {"name": "DOI GeoPlatform NAIP Plus", "url": "https://imagery.geoplatform.gov/iipp/rest/services/NAIP/NAIP_plus/ImageServer"},
    {"name": "USGS NAIP Plus", "url": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer"},
    {"name": "USGS NAIP Imagery", "url": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer"},
    {"name": "USDA NAIP CONUS Prime", "url": "https://gis.apfo.usda.gov/arcgis/rest/services/NAIP/USDA_CONUS_PRIME/ImageServer"},
]


def log(*a):
    print(*a, flush=True)


def get(url, params, timeout=120, tries=3):
    err = None
    for k in range(tries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            if r.status_code == 200:
                return r
            err = f"HTTP {r.status_code}: {r.text[:200]!r}"
        except Exception as e:  # noqa: BLE001
            err = repr(e)
        time.sleep(2 + 3 * k)
    raise RuntimeError(err)


def meta(src):
    j = get(src["url"], {"f": "pjson"}, timeout=60).json()
    if "error" in j:
        raise RuntimeError(json.dumps(j["error"])[:300])
    keep = {k: j.get(k) for k in ("pixelSizeX", "pixelSizeY", "bandCount", "maxImageWidth", "maxImageHeight", "pixelType", "capabilities", "copyrightText", "name")}
    keep["spatialReference"] = j.get("spatialReference")
    keep["timeInfo"] = (j.get("timeInfo") or {}).get("timeExtent")
    return keep


def catalog(src):
    """Which rasters cover the airport, and when were they flown? Not every service allows this."""
    try:
        j = get(src["url"] + "/query", {"geometry": f"{LON0},{LAT0}", "geometryType": "esriGeometryPoint", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
                                       "outFields": "*", "returnGeometry": "false", "f": "json"}, timeout=60, tries=2).json()
        out = []
        for f in (j.get("features") or [])[:8]:
            a = f.get("attributes") or {}
            out.append({k: a[k] for k in a if any(s in k.lower() for s in ("name", "year", "date", "resol", "gsd", "state", "product", "category")) and a[k] is not None})
        return out
    except Exception as e:  # noqa: BLE001
        return [{"error": repr(e)[:200]}]


def export(src, bbox, w, h, bands):
    """bbox in EPSG:3857 (xmin, ymin, xmax, ymax). Returns an RGB uint8 array (h, w, 3)."""
    p = {"bbox": ",".join(f"{v:.3f}" for v in bbox), "bboxSR": 3857, "imageSR": 3857, "size": f"{w},{h}", "format": "jpg", "compressionQuality": 95,
         "interpolation": "RSP_BilinearInterpolation", "f": "image"}
    if bands and bands >= 3:
        p["bandIds"] = "0,1,2"
    r = get(src["url"] + "/exportImage", p)
    ct = r.headers.get("content-type", "")
    if "image" not in ct:
        raise RuntimeError(f"not an image ({ct}): {r.text[:200]!r}")
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im)


def export_split(src, bb, w, h, bands, depth=0):
    """export(), but a request the server times out on is retried as four smaller ones."""
    try:
        return export(src, bb, w, h, bands)
    except Exception as e:  # noqa: BLE001
        if depth >= 2 or min(w, h) < 256:
            raise
        log(f"    splitting a {w}x{h} request after: {repr(e)[:120]}")
        res_x, res_y = (bb[2] - bb[0]) / w, (bb[3] - bb[1]) / h
        w2, h2 = w // 2, h // 2
        out = np.zeros((h, w, 3), np.uint8)
        for (r0, hh) in ((0, h2), (h2, h - h2)):
            for (c0, ww) in ((0, w2), (w2, w - w2)):
                sub = (bb[0] + c0 * res_x, bb[3] - (r0 + hh) * res_y, bb[0] + (c0 + ww) * res_x, bb[3] - r0 * res_y)
                out[r0:r0 + hh, c0:c0 + ww] = export_split(src, sub, ww, hh, bands, depth + 1)
        return out


def mosaic(src, bbox, res, bands, chunk=2000, workers=3):
    """Fetch bbox at `res` mercator-metres per pixel in chunks; returns (array, x0, y1, res)."""
    x0, y0, x1, y1 = bbox
    W, H = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    out = np.zeros((H, W, 3), np.uint8)
    jobs = []
    for r0 in range(0, H, chunk):
        for c0 in range(0, W, chunk):
            w, h = min(chunk, W - c0), min(chunk, H - r0)
            jobs.append((r0, c0, w, h, (x0 + c0 * res, y1 - (r0 + h) * res, x0 + (c0 + w) * res, y1 - r0 * res)))
    t0 = time.time()
    with ThreadPoolExecutor(workers) as ex:
        for (r0, c0, w, h, _), tile in zip(jobs, ex.map(lambda j: export_split(src, j[4], j[2], j[3], bands), jobs)):
            out[r0:r0 + h, c0:c0 + w] = tile
    log(f"    mosaic {W}x{H} px in {len(jobs)} requests, {time.time() - t0:.0f} s, {(out.sum(2) == 0).mean() * 100:.2f}% empty")
    return out, x0, y1, res


def upsample(a, W, H):
    """Bilinear upsample of a coarse grid whose corner samples sit exactly on the first and last output pixel centers."""
    fx = np.linspace(0, a.shape[1] - 1, W); j0 = np.minimum(fx.astype(int), a.shape[1] - 2); wx = (fx - j0).astype(np.float32)
    b = a[:, j0] * (1 - wx) + a[:, j0 + 1] * wx
    fy = np.linspace(0, a.shape[0] - 1, H); i0 = np.minimum(fy.astype(int), a.shape[0] - 2); wy = (fy - i0).astype(np.float32)[:, None]
    return (b[i0] * (1 - wy) + b[i0 + 1] * wy).astype(np.float32)


def warp(m, x0, x1, n0, n1, W, H):
    """Resample a mercator mosaic onto the twin grid. Row 0 is north. The projection is evaluated on a coarse grid
    of output pixel centers (it is smooth at this scale) and interpolated in between."""
    arr, mx0, my1, res = m
    sx, sn = (x1 - x0) / W, (n1 - n0) / H
    gx = np.linspace(x0 + 0.5 * sx, x1 - 0.5 * sx, W // 48 + 2)
    gn = np.linspace(n1 - 0.5 * sn, n0 + 0.5 * sn, H // 48 + 2)
    GX, GN = np.meshgrid(gx, gn)
    MX, MY = to_merc.transform(GX, GN)
    mapx = upsample(((MX - mx0) / res - 0.5).astype(np.float32), W, H)
    mapy = upsample(((my1 - MY) / res - 0.5).astype(np.float32), W, H)
    return cv2.remap(arr, mapx, mapy, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def merc_bbox(x0, x1, n0, n1, pad=60.0):
    xs, ns = np.meshgrid(np.linspace(x0 - pad, x1 + pad, 9), np.linspace(n0 - pad, n1 + pad, 9))
    MX, MY = to_merc.transform(xs, ns)
    return float(MX.min()), float(MY.min()), float(MX.max()), float(MY.max())


def sharpness(rgb):
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def bake(src, entry, report):
    bands = entry["meta"].get("bandCount")
    k = 1 / math.cos(math.radians(LAT0))  # mercator metres per ground metre
    native = float(entry["meta"].get("pixelSizeX") or 0.3)
    log(f"== baking from {src['name']} (service pixel {native:.2f} m)")

    # metro first: it also gives the color statistics used to match the Sentinel-2 base
    metro = warp(mosaic(src, merc_bbox(-METRO_HALF, METRO_HALF, -METRO_HALF, METRO_HALF), 2.5 * k, bands, chunk=1024), -METRO_HALF, METRO_HALF, -METRO_HALF, METRO_HALF, 4096, 4096)
    s2 = np.asarray(Image.open(os.path.join(DATA, "imagery.jpg")).convert("RGB")).astype(np.float32)
    px = s2.shape[0] / (2 * S2_HALF)
    c0, c1 = int((S2_HALF - METRO_HALF) * px), int((S2_HALF + METRO_HALF) * px)
    ref = s2[c0:c1, c0:c1]
    low = cv2.resize(metro, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32)
    gain = np.clip(ref.reshape(-1, 3).std(0) / np.maximum(low.reshape(-1, 3).std(0), 1e-3), 0.6, 1.6)
    off = ref.reshape(-1, 3).mean(0) - low.reshape(-1, 3).mean(0) * gain
    report["color_match"] = {"gain": [round(float(v), 3) for v in gain], "offset": [round(float(v), 1) for v in off]}
    log("   color match", report["color_match"])
    fix = lambda a: np.clip(a.astype(np.float32) * gain + off, 0, 255).astype(np.uint8)  # noqa: E731
    Image.fromarray(fix(metro)).save(os.path.join(DATA, "photo_metro.jpg"), quality=84, optimize=True)
    del metro, s2, low

    # airfield at full detail: 8 x 5 tiles of 2048 px, 0.32 m/px, from the top-left (north-west) corner of the plane
    x0, x1, n0, n1 = PLANE
    cols, rows, T = 8, 5, 2048
    tile_m = (x1 - x0) / cols
    nb = n1 - rows * tile_m
    m = mosaic(src, merc_bbox(x0, x1, nb, n1), max(native, 0.3), bands)
    os.makedirs(TILES, exist_ok=True)
    base = np.zeros((rows * T // 2, cols * T // 2, 3), np.uint8)
    sharp = []
    for r in range(rows):
        for c in range(cols):
            tx0, tn1 = x0 + c * tile_m, n1 - r * tile_m
            tile = fix(warp(m, tx0, tx0 + tile_m, tn1 - tile_m, tn1, T, T))
            sharp.append(sharpness(tile))
            Image.fromarray(tile).save(os.path.join(TILES, f"{r}_{c}.jpg"), quality=80, optimize=True)
            base[r * T // 2:(r + 1) * T // 2, c * T // 2:(c + 1) * T // 2] = cv2.resize(tile, (T // 2, T // 2), interpolation=cv2.INTER_AREA)
    W = cols * T // 2
    H = int(round(W * (n1 - n0) / (x1 - x0)))
    air = base[:H]
    json.dump({"x0": x0, "n1": n1, "tile_m": tile_m, "cols": cols, "rows": rows, "px": T, "source": src["name"], "flown": report.get("flown")},
              open(os.path.join(TILES, "index.json"), "w"))
    report["airfield"] = {"tiles": [cols, rows], "tile_ground_m_per_px": round(tile_m / T, 3), "tile_sharpness_median": round(float(np.median(sharp)), 1),
                          "base_size": [W, H], "base_ground_m_per_px": round((x1 - x0) / W, 3)}
    Image.fromarray(air).save(os.path.join(DATA, "photo_airfield.jpg"), quality=82, optimize=True)
    Image.fromarray(cv2.resize(air, (W // 2, H // 2), interpolation=cv2.INTER_AREA)).save(os.path.join(DATA, "photo_airfield_4k.jpg"), quality=84, optimize=True)


def main():
    cfg = json.load(open(os.path.join(HERE, "imagery.config.json")))
    k = 1 / math.cos(math.radians(LAT0))
    report = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sources": []}
    usable = []
    sx0, sx1, sn0, sn1 = 850.0, 1550.0, -80.0, 390.0  # sample: 700 x 470 m over Terminal 4
    for src in SOURCES:
        entry = {"name": src["name"], "url": src["url"]}
        log(f"== {src['name']}")
        try:
            entry["meta"] = meta(src)
            log("   meta", json.dumps(entry["meta"])[:400])
            entry["catalog"] = catalog(src)
            log("   catalog", json.dumps(entry["catalog"])[:600])
            crop = warp(mosaic(src, merc_bbox(sx0, sx1, sn0, sn1, 20), 0.3 * k, entry["meta"].get("bandCount")), sx0, sx1, sn0, sn1, 2333, 1567)
            entry["sample"] = {"sharpness": round(sharpness(crop), 1), "mean": [round(float(v), 1) for v in crop.reshape(-1, 3).mean(0)], "empty": round(float((crop.sum(2) == 0).mean()), 4)}
            log("   sample", entry["sample"])
            if entry["sample"]["empty"] < 0.02 and crop.std() > 8:
                usable.append((src, entry))
        except Exception as e:  # noqa: BLE001
            entry["error"] = repr(e)[:400]
            log("   FAILED", entry["error"])
        report["sources"].append(entry)
    out = os.path.join(HERE, "imagery_report.json")
    if not usable:
        json.dump(report, open(out, "w"), indent=1)
        log("No imagery source answered. Nothing baked.")
        return 1
    best = max(e["sample"]["sharpness"] for _, e in usable)
    want = cfg.get("source", "auto")
    order = [p for p in usable if p[0]["name"] == want] + [p for p in usable if p[0]["name"] != want and p[1]["sample"]["sharpness"] >= 0.6 * best]
    # acquisition date, when a source's catalog names the NAIP quarter quad (m_<quad>_<res>_<flown>_<published>)
    for _, e in usable:
        for item in e.get("catalog") or []:
            name = str(item.get("name") or item.get("Name") or "")
            parts = name.split("_")
            if name.startswith("m_") and len(parts) >= 6 and parts[5].isdigit():
                report["flown"] = f"{parts[5][:4]}-{parts[5][4:6]}-{parts[5][6:8]}"
    for src, entry in order:
        try:
            bake(src, entry, report)
            report["chosen"] = src["name"]
            break
        except Exception as e:  # noqa: BLE001
            log(f"   bake from {src['name']} FAILED: {repr(e)[:300]}")
            report.setdefault("bake_failures", []).append({"name": src["name"], "error": repr(e)[:300]})
    json.dump(report, open(out, "w"), indent=1)
    if "chosen" not in report:
        log("Every source failed during the bake.")
        return 1
    total = 0
    for root, _, files in os.walk(DATA):
        for f in files:
            if f.startswith("photo_") or "photo_tiles" in root:
                total += os.path.getsize(os.path.join(root, f))
    for f in ("photo_airfield.jpg", "photo_airfield_4k.jpg", "photo_metro.jpg"):
        log(f"   wrote {f}: {os.path.getsize(os.path.join(DATA, f)) / 1e6:.1f} MB")
    log(f"   aerial photography total: {total / 1e6:.1f} MB, flown {report.get('flown', 'unknown')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
