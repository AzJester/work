#!/usr/bin/env python3
"""Bakes the data that relief-map/index.html embeds.

Sources (all open, fetched once and cached in the raw directory):
  - Elevation and bathymetry: Terrarium terrain tiles (Mapzen, hosted by AWS Open Data).
  - Land cover: NLCD 2021 (USGS / MRLC), read from the public map service in EPSG:5070.
  - Countries, lakes, rivers, state lines: Natural Earth 1:10m (public domain).

Everything is resampled onto one grid in Albers Equal Area Conic (EPSG:5070).

Usage: python3 -I relief-map/tools/build_data.py <raw-cache-dir> <output-dir> [preview-dir]
The raw directory needs the Natural Earth GeoJSON files (see NE_FILES); tiles and NLCD are fetched on demand.
"""
import concurrent.futures as cf
import gzip
import io
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
RAW, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None

# ---- grid ---------------------------------------------------------------------------------------------------
W, H = 2048, 1344            # base grid (elevation)
PX = 2500.0                  # metres per base pixel
XC, YC = -50000.0, 1722000.0  # grid centre, EPSG:5070 metres
X0, Y1 = XC - W * PX / 2, YC + H * PX / 2   # west edge, north edge
HI = 2                       # vector masks are stored at HI x the base grid
LO = 0.5                     # land cover, slab and state rasters are stored at LO x the base grid
FRINGE_KM = 200.0            # width of the ocean kept around the coast
RIM_KM = 55.0                # Canadian shore kept around the Great Lakes
GREAT_LAKES = {"Lake Superior", "Lake Michigan", "Lake Huron", "Lake Erie", "Lake Ontario", "Lake Saint Clair"}
NE_FILES = ["ne_10m_admin_0_countries", "ne_10m_lakes", "ne_10m_lakes_north_america", "ne_10m_rivers_lake_centerlines",
            "ne_10m_rivers_north_america", "ne_10m_admin_1_states_provinces_lines", "ne_10m_admin_1_states_provinces"]

# ---- Albers Equal Area Conic, EPSG:5070 (GRS80) -------------------------------------------------------------
A = 6378137.0
F = 1 / 298.257222101
E2 = F * (2 - F)
E = math.sqrt(E2)
LAT1, LAT2, LAT0, LON0 = (math.radians(v) for v in (29.5, 45.5, 23.0, -96.0))


def _m(phi):
    return np.cos(phi) / np.sqrt(1 - E2 * np.sin(phi) ** 2)


def _q(phi):
    s = np.sin(phi)
    return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * np.log((1 - E * s) / (1 + E * s)))


N = float((_m(LAT1) ** 2 - _m(LAT2) ** 2) / (_q(LAT2) - _q(LAT1)))
C = float(_m(LAT1) ** 2 + N * _q(LAT1))
RHO0 = float(A * np.sqrt(C - N * _q(LAT0)) / N)


def fwd(lon, lat):
    lam, phi = np.radians(lon), np.radians(lat)
    rho = A * np.sqrt(np.maximum(C - N * _q(phi), 0)) / N
    th = N * (lam - LON0)
    return rho * np.sin(th), RHO0 - rho * np.cos(th)


def inv(x, y):
    rho = np.hypot(x, RHO0 - y)
    th = np.arctan2(x, RHO0 - y)
    q = (C - (rho * N / A) ** 2) / N
    phi = np.arcsin(np.clip(q / 2, -1, 1))
    for _ in range(6):
        s = np.sin(phi)
        phi = phi + (1 - E2 * s * s) ** 2 / (2 * np.cos(phi)) * (
            q / (1 - E2) - s / (1 - E2 * s * s) + (1 / (2 * E)) * np.log((1 - E * s) / (1 + E * s)))
    return np.degrees(LON0 + th / N), np.degrees(phi)


def to_px(lon, lat, scale):
    x, y = fwd(np.asarray(lon, float), np.asarray(lat, float))
    return (x - X0) / PX * scale, (Y1 - y) / PX * scale


# ---- vector helpers -----------------------------------------------------------------------------------------
def load(name):
    with open(os.path.join(RAW, name + ".geojson"), encoding="utf8") as fh:
        return json.load(fh)["features"]


def prop(f, key):
    p = f["properties"]
    return p.get(key, p.get(key.upper(), p.get(key.lower())))


def polys(geom):
    if geom is None:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def lines(geom):
    if geom is None:
        return []
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def in_view(a):
    """Cheap lon/lat reject so far-away geometry never reaches the projection."""
    return a[:, 0].max() > -140 and a[:, 0].min() < -50 and a[:, 1].max() > 14 and a[:, 1].min() < 62


def fill(geoms, scale, ss=2, value=None):
    """Rasterises polygons. Returns coverage 0..1 (float32), or an index image when `value` gives one id per geometry."""
    w, h = int(W * scale * ss), int(H * scale * ss)
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    holes = []
    for gi, g in enumerate(geoms):
        v = 255 if value is None else value[gi]
        for poly in polys(g):
            for k, ring in enumerate(poly):
                a = np.asarray(ring, float)[:, :2]
                if len(a) < 3 or not in_view(a):
                    continue
                px, py = to_px(a[:, 0], a[:, 1], scale * ss)
                if px.max() < 0 or px.min() > w or py.max() < 0 or py.min() > h:
                    continue
                pts = list(zip(px.tolist(), py.tolist()))
                if k == 0:
                    d.polygon(pts, fill=v)
                elif value is None:
                    holes.append(pts)
    for pts in holes:
        d.polygon(pts, fill=0)
    if value is not None:
        return np.asarray(im)
    if ss > 1:
        im = im.resize((w // ss, h // ss), Image.BOX)
    return np.asarray(im, np.float32) / 255.0


def stroke(items, scale, ss=2):
    """Rasterises (coords, width_px, value) polylines with antialiasing. Width is in output pixels."""
    w, h = int(W * scale * ss), int(H * scale * ss)
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for coords, width, value in sorted(items, key=lambda it: it[2]):
        a = np.asarray(coords, float)[:, :2]
        if len(a) < 2 or not in_view(a):
            continue
        px, py = to_px(a[:, 0], a[:, 1], scale * ss)
        if px.max() < 0 or px.min() > w or py.max() < 0 or py.min() > h:
            continue
        d.line(list(zip(px.tolist(), py.tolist())), fill=int(value), width=max(1, round(width * ss)), joint="curve")
    im = im.resize((w // ss, h // ss), Image.BOX)
    return np.asarray(im, np.float32) / 255.0


# ---- elevation ----------------------------------------------------------------------------------------------
Z = 7


def fetch(url, path, tries=5):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    err = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "relief-map-bake"}), timeout=120) as r:
                data = r.read()
            with open(path + ".part", "wb") as fh:
                fh.write(data)
            os.replace(path + ".part", path)
            return
        except Exception as exc:  # noqa: BLE001 - retried, then raised
            err = exc
    raise err


def elevation():
    cache = os.path.join(RAW, "elev_%dx%d.npy" % (W, H))
    if os.path.exists(cache):
        return np.load(cache)
    jj, ii = np.mgrid[0:H, 0:W]
    lon, lat = inv(X0 + (ii + 0.5) * PX, Y1 - (jj + 0.5) * PX)
    n = 2 ** Z
    fx = (lon + 180) / 360 * n
    fy = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    tx0, tx1, ty0, ty1 = int(fx.min()) - 1, int(fx.max()) + 1, int(fy.min()) - 1, int(fy.max()) + 1
    tiles = [(x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
    print("terrain tiles:", len(tiles), file=sys.stderr)

    def get(t):
        p = os.path.join(RAW, "terrarium", str(Z), str(t[0]), "%d.png" % t[1])
        fetch("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (Z, t[0], t[1]), p)
        a = np.asarray(Image.open(p).convert("RGB"), np.float32)
        return t, a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

    mos = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    with cf.ThreadPoolExecutor(16) as ex:
        for (x, y), a in ex.map(get, tiles):
            mos[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = a
    # Tile pixels are about 0.95 km here and the grid is 2.5 km, so soften before sampling.
    mos = ndi.gaussian_filter(mos, 0.9)
    out = ndi.map_coordinates(mos, [(fy - ty0) * 256 - 0.5, (fx - tx0) * 256 - 0.5], order=1, mode="nearest").astype(np.float32)
    np.save(cache, out)
    return out


# ---- land cover ---------------------------------------------------------------------------------------------
NLCD = {  # legend colour -> class
    (71, 107, 160): 11, (209, 221, 249): 12, (221, 201, 201): 21, (216, 147, 130): 22, (237, 0, 0): 23, (170, 0, 0): 24,
    (178, 173, 163): 31, (104, 170, 99): 41, (28, 99, 48): 42, (181, 201, 142): 43, (204, 186, 124): 52,
    (226, 226, 193): 71, (219, 216, 61): 81, (170, 112, 40): 82, (186, 216, 234): 90, (112, 163, 186): 95,
    (255, 255, 255): 0,
}


def landcover():
    """Class image at HI x the base grid, straight from the map service in the grid's own projection."""
    cache = os.path.join(RAW, "nlcd_%dx%d.npy" % (W * HI, H * HI))
    if os.path.exists(cache):
        return np.load(cache)
    out = np.zeros((H * HI, W * HI), np.uint8)
    tw, th = W * HI // 2, H * HI // 2
    codes = np.array(list(NLCD.keys()), np.int32)
    classes = np.array(list(NLCD.values()), np.uint8)
    for ty in range(2):
        for tx in range(2):
            x0 = X0 + tx * W * PX / 2
            y1 = Y1 - ty * H * PX / 2
            url = ("https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms?service=WMS&version=1.1.1"
                   "&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&srs=EPSG:5070&format=image/png"
                   "&bbox=%f,%f,%f,%f&width=%d&height=%d" % (x0, y1 - H * PX / 2, x0 + W * PX / 2, y1, tw, th))
            p = os.path.join(RAW, "nlcd_%d_%d.png" % (tx, ty))
            fetch(url, p)
            rgb = np.asarray(Image.open(p).convert("RGB"), np.int32)
            d = ((rgb[:, :, None, :] - codes[None, None, :, :]) ** 2).sum(-1)
            out[ty * th:(ty + 1) * th, tx * tw:(tx + 1) * tw] = classes[d.argmin(-1)]
    np.save(cache, out)
    return out


# ---- output helpers -----------------------------------------------------------------------------------------
def gz(data):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as fh:
        fh.write(data)
    return buf.getvalue()


def write(name, data):
    with open(os.path.join(OUT, name), "wb") as fh:
        fh.write(data)
    print("%-14s %8.1f KB" % (name, len(data) / 1024), file=sys.stderr)


def u8(a):
    return np.clip(np.rint(a * 255), 0, 255).astype(np.uint8)


def box(a, k):
    h, w = a.shape
    return a.reshape(h // k, k, w // k, k).mean((1, 3))


def encode_height(v):
    """int16 grid -> gzip of two byte planes holding zig-zag residuals of the predictor left + up - upleft."""
    v = v.astype(np.int32)
    pred = np.zeros_like(v)
    pred[1:, 1:] = v[1:, :-1] + v[:-1, 1:] - v[:-1, :-1]
    pred[0, 1:] = v[0, :-1]
    pred[1:, 0] = v[:-1, 0]
    r = ((v - pred + 32768) & 0xFFFF) - 32768        # wrap to int16, the decoder wraps the same way
    z = ((r << 1) ^ (r >> 15)) & 0xFFFF
    return gz((z & 255).astype(np.uint8).tobytes() + (z >> 8).astype(np.uint8).tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    km = 1000.0 / PX   # base pixels per km

    countries = {prop(f, "ADM0_A3"): f["geometry"] for f in load("ne_10m_admin_0_countries") if prop(f, "ADM0_A3") in ("USA", "CAN", "MEX")}
    lakes = [f for f in load("ne_10m_lakes") + load("ne_10m_lakes_north_america") if f["geometry"]]

    # ---- masks on the base grid, used to shape the slab ----
    us = fill([countries["USA"]], 1) > 0.5
    can = fill([countries["CAN"]], 1) > 0.5
    mex = fill([countries["MEX"]], 1) > 0.5
    great = fill([f["geometry"] for f in lakes if prop(f, "name") in GREAT_LAKES], 1) > 0.5
    land = us | can | mex
    foreign = (can | mex) & ~us & ~great
    # Small foreign islands would punch notches into the coast; treat them as part of the scene instead.
    lab, n = ndi.label(foreign)
    sizes = ndi.sum(foreign, lab, np.arange(1, n + 1))
    foreign_main = np.isin(lab, 1 + np.flatnonzero(sizes > 6000 * km * km))
    rim = (ndi.distance_transform_edt(~great) < RIM_KM * km) & foreign
    core = us | great | rim
    d_core = ndi.distance_transform_edt(~core)
    d_foreign = ndi.distance_transform_edt(~(foreign_main & ~rim))
    # Ocean is kept where it is nearer to the United States than to its neighbours: an equidistance line.
    fringe = ~land & ~great & (d_core < FRINGE_KM * km) & (d_core < d_foreign)
    slab = core | fringe | (~foreign_main & foreign & (d_core < d_foreign) & (d_core < 30 * km))
    slab = core | (ndi.gaussian_filter(slab.astype(np.float32), 4.0) > 0.5)
    slab = ndi.binary_fill_holes(slab)
    lab, n = ndi.label(slab)
    slab = lab == 1 + int(np.argmax(ndi.sum(slab, lab, np.arange(1, n + 1))))
    slab[:4, :] = slab[-4:, :] = False
    slab[:, :4] = slab[:, -4:] = False
    ys, xs = np.nonzero(us)
    print("US bbox px: x %d..%d of %d, y %d..%d of %d" % (xs.min(), xs.max(), W, ys.min(), ys.max(), H), file=sys.stderr)
    ys, xs = np.nonzero(slab)
    print("slab bbox px: x %d..%d, y %d..%d" % (xs.min(), xs.max(), ys.min(), ys.max()), file=sys.stderr)

    sdf = np.where(slab, ndi.distance_transform_edt(slab) - 0.5, 0.5 - ndi.distance_transform_edt(~slab))
    sdf_lo = box(np.clip(sdf / 16.0, -1, 1), 2)
    write("slab.bin", gz(np.clip(np.rint(127.5 + sdf_lo * 127.5), 0, 255).astype(np.uint8).tobytes()))

    # ---- elevation ----
    elev = elevation()
    d_sea = ndi.distance_transform_edt(land | great)          # distance from land pixels to the sea
    e = elev.copy()
    e[land & (d_sea < 15 * km)] = np.maximum(e[land & (d_sea < 15 * km)], 1.0)   # no coastal land below the waterline
    sea = ~land & ~great
    deep = np.minimum(ndi.gaussian_filter(elev, 1.2), -3.0)
    deep = np.where(deep < -200, np.rint(deep / 10) * 10, deep)
    e[sea] = np.maximum(deep[sea], -3000.0) - 500.0             # sea floor is stored as -(depth + 500); land never goes that low
    keep = sdf > -10                                           # real values a little past the edge, for interpolation
    e[~keep] = np.where(sea, -3500.0, 0.0)[~keep]              # constant past the edge so it compresses away
    h16 = np.clip(np.rint(e), -32000, 32000).astype(np.int16)
    write("height.bin", encode_height(h16))

    # ---- vector masks at HI ----
    land_hi = fill(list(countries.values()), HI)
    lakes_hi = fill([f["geometry"] for f in lakes], HI)
    rivers = []
    for f in load("ne_10m_rivers_lake_centerlines") + load("ne_10m_rivers_north_america"):
        rank = prop(f, "scalerank")
        rank = 9 if rank is None else float(rank)
        width = 2.4 if rank <= 3 else 1.8 if rank <= 5 else 1.3 if rank <= 7 else 0.9 if rank <= 9 else 0.6
        value = 255 if rank <= 7 else 215 if rank <= 9 else 150
        for ln in lines(f["geometry"]):
            rivers.append((ln, width, value))
    rivers_hi = stroke(rivers, HI)
    borders = [(ln, 1.3, 255) for f in load("ne_10m_admin_1_states_provinces_lines")
               if prop(f, "ADM0_A3") == "USA" and "indicator" not in prop(f, "FEATURECLA") for ln in lines(f["geometry"])]
    borders_hi = stroke(borders, HI)
    write("masks.bin", gz(b"".join(u8(a).tobytes() for a in (land_hi, lakes_hi, rivers_hi, borders_hi))))

    # ---- states ----
    states = sorted((f for f in load("ne_10m_admin_1_states_provinces") if prop(f, "iso_a2") == "US"), key=lambda f: prop(f, "name"))
    names = [prop(f, "name") for f in states]
    sid = fill([f["geometry"] for f in states], LO, ss=1, value=list(range(1, len(states) + 1)))
    # Close the hairline gaps the polygons leave along rivers and shores.
    idx = ndi.distance_transform_edt(sid == 0, return_distances=True, return_indices=True)
    near = sid[idx[1][0], idx[1][1]]
    sid = np.where((sid == 0) & (idx[0] < 3), near, sid).astype(np.uint8)
    write("states.bin", gz(sid.tobytes()))

    # ---- land cover fractions at LO ----
    cls = landcover()
    k = int(HI / LO)

    def frac(*weights):
        acc = np.zeros(cls.shape, np.float32)
        for c, wgt in weights:
            acc += (cls == c) * wgt
        return box(acc, k)

    planes = [
        (frac((42, 1), (43, 0.5)), frac((41, 1), (43, 0.5)), frac((82, 1))),            # conifer, hardwood, crops
        (frac((52, 1)), frac((71, 1)), frac((81, 1))),                                    # shrub, grass, pasture
        (frac((90, 1), (95, 1)), frac((21, 0.3), (22, 0.55), (23, 0.85), (24, 1)), frac((31, 1))),   # wetland, urban, barren
        (frac((11, 1)), frac((0, 1)), frac((12, 1))),                                     # open water, no data, ice
    ]
    for i, rgb in enumerate(planes):
        buf = io.BytesIO()
        Image.fromarray(np.dstack([u8(c) for c in rgb]), "RGB").save(buf, "WEBP", quality=88, method=6)
        write("lc%d.webp" % i, buf.getvalue())

    meta = {
        "w": W, "h": H, "px": PX, "xc": XC, "yc": YC, "hi": HI, "lo": LO,
        "albers": {"a": A, "f": F, "lat1": 29.5, "lat2": 45.5, "lat0": 23.0, "lon0": -96.0},
        "states": names,
        "sources": ["Terrarium terrain tiles (Mapzen, AWS Open Data)", "NLCD 2021 (USGS, MRLC)", "Natural Earth 1:10m"],
    }
    write("meta.json", json.dumps(meta, separators=(",", ":")).encode())

    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        gy, gx = np.gradient(np.where(sea, 0, e) * 12 / PX)
        shade = np.clip(0.55 + 0.9 * (-gx * 0.6 - gy * 0.6) / np.sqrt(1 + gx * gx + gy * gy), 0, 1)
        rgb = np.dstack([shade * 255] * 3)
        rgb[sea] = np.dstack([40 + 0 * e, 110 + (e + 500) / 30, 160 + (e + 500) / 30])[sea]
        rgb[great] = (60, 120, 200)
        rgb[~slab] = rgb[~slab] * 0.35
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BOX).save(os.path.join(PREVIEW, "relief.png"))
        m = np.dstack([u8(rivers_hi), u8(borders_hi), u8(np.maximum(lakes_hi, land_hi * 0.3))])
        Image.fromarray(m).resize((W, H), Image.BOX).save(os.path.join(PREVIEW, "masks.png"))
        Image.fromarray(np.dstack([u8(c) for c in planes[0]])).save(os.path.join(PREVIEW, "lc0.png"))
        Image.fromarray(np.dstack([u8(c) for c in planes[1]])).save(os.path.join(PREVIEW, "lc1.png"))
        Image.fromarray(np.dstack([u8(c) for c in planes[2]])).save(os.path.join(PREVIEW, "lc2.png"))
        Image.fromarray((sid * 5).astype(np.uint8)).save(os.path.join(PREVIEW, "states.png"))
        for name, lon, lat in (("Denver", -104.99, 39.74), ("Mt Whitney", -118.292, 36.578), ("Badwater", -116.83, 36.24),
                               ("Lake Superior", -87.5, 47.7), ("New Orleans", -90.07, 29.95), ("Mt Rainier", -121.76, 46.85)):
            px, py = to_px(lon, lat, 1)
            j, i = int(py), int(px)
            print("%-14s px (%d,%d) elev %7.1f  window max %7.1f min %7.1f  state %s" % (
                name, i, j, e[j, i], e[j - 2:j + 3, i - 2:i + 3].max(), e[j - 2:j + 3, i - 2:i + 3].min(),
                names[sid[int(py * LO), int(px * LO)] - 1] if sid[int(py * LO), int(px * LO)] else "-"), file=sys.stderr)


if __name__ == "__main__":
    main()
