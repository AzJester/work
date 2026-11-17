#!/usr/bin/env python3
"""Render the Yuma film picture: slow camera moves over stills, crossfades and titles.

Reads film.json (shots, overlays, fonts) and pipes RGB frames to ffmpeg.

  render.py film.json --out out/picture.mp4                 full render
  render.py film.json --scale 0.5 --stills 2,10,20 --sheet out/stills.jpg   preview frames
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("film")
ap.add_argument("--out", default="out/picture.mp4")
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--stills", default="")
ap.add_argument("--sheet", default="out/stills.jpg")
ap.add_argument("--cols", type=int, default=3)
ap.add_argument("--tw", type=int, default=640)
ap.add_argument("--crf", default="18")
ap.add_argument("--preset", default="medium")
ap.add_argument("--t0", type=float, default=0.0)
ap.add_argument("--t1", type=float, default=None)
a = ap.parse_args()

F = json.load(open(a.film))
FPS, XF, DUR = F["fps"], F["xfade"], F["duration"]
W = int(round(1920 * a.scale / 2) * 2)
H = int(round(1080 * a.scale / 2) * 2)
S = W / 1920.0
AR = W / H
GOLD = (245, 186, 78)
WHITE = (255, 255, 255)


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


# ---------- type ----------
_fc = {}


def font(name, size, wght=None):
    key = (name, int(round(size)), wght)
    if key not in _fc:
        f = ImageFont.truetype(F["fonts"][name], max(4, int(round(size))))
        if wght:
            f.set_variation_by_axes([wght])
        _fc[key] = f
    return _fc[key]


def text_w(s, f, tr=0.0):
    if not tr:
        return f.getlength(s)
    return sum(f.getlength(c) for c in s) + tr * (len(s) - 1)


def draw_text(dr, x, y, s, f, fill, tr=0.0, anchor="ls"):
    """Draw on a baseline. With tracking, letters are placed one by one."""
    if not tr:
        dr.text((x, y), s, font=f, fill=fill, anchor=anchor)
        return
    for c in s:
        dr.text((x, y), c, font=f, fill=fill, anchor=anchor)
        x += f.getlength(c) + tr


def centered(dr, y, s, f, fill, tr=0.0):
    draw_text(dr, (W - text_w(s, f, tr)) / 2, y, s, f, fill, tr)


def blank():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def halo(layer, strength=0.95, blur=18):
    """Soft dark halo under type so it reads on bright skies."""
    al = layer.getchannel("A").filter(ImageFilter.GaussianBlur(blur * S))
    al = al.point([min(255, int(v * strength * 1.5)) for v in range(256)])
    out = blank()
    out.putalpha(al)
    return Image.alpha_composite(out, layer)


def plate(layer, pad=44, blur=34, strength=0.55):
    """Soft dark plate sized to a block of type, so labels read over busy or bright pictures."""
    box = layer.getbbox()
    al = Image.new("L", (W, H), 0)
    if box:
        x0, y0, x1, y1 = box
        ImageDraw.Draw(al).rounded_rectangle([x0 - pad * S, y0 - pad * 0.6 * S, x1 + pad * S, y1 + pad * 0.6 * S],
                                             radius=pad * S, fill=int(255 * strength))
        al = al.filter(ImageFilter.GaussianBlur(blur * S))
    out = blank()
    out.putalpha(al)
    return out


def veil(alpha_map):
    im = blank()
    im.putalpha(Image.fromarray((np.clip(alpha_map, 0, 1) * 255).astype(np.uint8), "L"))
    return im


YY = np.linspace(0, 1, H)[:, None]
XX = np.linspace(0, 1, W)[None, :]


def ov_lower(o):
    L = blank()
    dr = ImageDraw.Draw(L)
    x, yb = 118 * S, H - 112 * S
    f1, f2 = font("sans", 38 * S, 600), font("sans", 26 * S, 500)
    sub = o.get("sub")
    y1 = yb - (44 * S if sub else 0)
    dr.rectangle([x, y1 - 62 * S, x + 58 * S, y1 - 62 * S + max(2, round(3 * S))], fill=GOLD + (255,))
    draw_text(dr, x, y1, o["text"].upper(), f1, WHITE + (255,), tr=5.5 * S)
    if sub:
        draw_text(dr, x, yb, sub, f2, WHITE + (232,), tr=1.0 * S)
    sc = veil(np.clip((YY - 0.58) / 0.42, 0, 1) ** 1.5 * (1 - 0.5 * XX) * o.get("scrim", 0.62))
    return Image.alpha_composite(Image.alpha_composite(sc, plate(L)), halo(L))


def ov_stat(o):
    L = blank()
    dr = ImageDraw.Draw(L)
    x, yb = 118 * S, H - 112 * S
    fb, fs = font("display", 168 * S, 700), font("sans", 30 * S, 600)
    lines = o["small"].split("\n")
    lh = 46 * S
    y_big = yb - len(lines) * lh - 14 * S
    dr.rectangle([x, y_big - 168 * S, x + 58 * S, y_big - 168 * S + max(2, round(3 * S))], fill=GOLD + (255,))
    draw_text(dr, x - 6 * S, y_big, o["big"], fb, WHITE + (255,))
    for i, ln in enumerate(lines):
        draw_text(dr, x, yb - (len(lines) - 1 - i) * lh, ln.upper(), fs, WHITE + (240,), tr=4.5 * S)
    sc = veil(np.clip((YY - 0.42) / 0.58, 0, 1) ** 1.4 * (1 - 0.55 * XX) * 0.66)
    return Image.alpha_composite(Image.alpha_composite(sc, plate(L)), halo(L))


def ov_title(o):
    L = blank()
    dr = ImageDraw.Draw(L)
    cy = H * 0.47
    centered(dr, cy + 70 * S, o["big"], font("display", 330 * S, 700), WHITE + (255,))
    centered(dr, cy + 152 * S, o["mid"].upper(), font("sans", 44 * S, 500), WHITE + (255,), tr=34 * S)
    rw = 84 * S
    dr.rectangle([(W - rw) / 2, cy + 196 * S, (W + rw) / 2, cy + 196 * S + max(2, round(3 * S))], fill=GOLD + (255,))
    centered(dr, cy + 272 * S, o["tag"], font("italic", 50 * S, 500), WHITE + (245,))
    r = np.hypot((XX - 0.5) / 0.62, (YY - 0.52) / 0.50)
    return Image.alpha_composite(veil(0.16 + 0.30 * np.clip(1 - r, 0, 1)), halo(L, 0.7, 22))


def ov_end(o):
    """End card. 'parts' picks what this layer draws so the tagline can arrive line by line."""
    L = blank()
    dr = ImageDraw.Draw(L)
    cy = H * o.get("y", 0.46)
    parts = o.get("parts", ["big", 0, 1])
    if "big" in parts:
        centered(dr, cy, o["big"], font("display", 150 * S, 700), WHITE + (255,))
        rw = 84 * S
        dr.rectangle([(W - rw) / 2, cy + 52 * S, (W + rw) / 2, cy + 52 * S + max(2, round(3 * S))], fill=GOLD + (255,))
    for i, ln in enumerate(o.get("lines", [])):
        if i in parts:
            centered(dr, cy + (140 + 72 * i) * S, ln, font("italic", 54 * S, 500), WHITE + (245,))
    L = halo(L, 0.7, 22)
    if "big" in parts:
        r = np.hypot((XX - 0.5) / 0.66, (YY - 0.52) / 0.56)
        L = Image.alpha_composite(veil(0.22 + 0.30 * np.clip(1 - r, 0, 1)), L)
    return L


def ov_credits(o):
    L = blank()
    dr = ImageDraw.Draw(L)
    rows = o["rows"]
    lh = {"h": 60, "n": 54, "t": 40, "s": 24}
    total = sum(lh[k] for k, _ in rows) * S
    y = (H - total) / 2 + 20 * S
    for kind, txt in rows:
        y += lh[kind] * S
        if kind == "h":
            centered(dr, y, txt.upper(), font("sans", 24 * S, 600), GOLD + (255,), tr=6 * S)
        elif kind == "n":
            centered(dr, y, txt, font("sans", 36 * S, 600), WHITE + (255,), tr=0.8 * S)
        elif kind == "t":
            centered(dr, y, txt, font("sans", 25 * S, 500), WHITE + (235,), tr=0.4 * S)
    return Image.alpha_composite(veil(np.full((H, W), o.get("dim", 0.86))), L)


BUILD = {"lower": ov_lower, "stat": ov_stat, "title": ov_title, "end": ov_end, "credits": ov_credits}
OVS = []
for o in F["overlays"]:
    lay = BUILD[o["type"]](o)
    OVS.append(dict(o=o, rgb=lay.convert("RGB"), a=lay.getchannel("A")))


def ov_opacity(o, t):
    fi, fo = o.get("fi", 0.7), o.get("fo", 0.7)
    if t <= o["t0"] or t >= o["t1"]:
        return 0.0
    return smooth((t - o["t0"]) / fi) * smooth((o["t1"] - t) / fo)


# ---------- pictures ----------
def grade(im, g):
    x = np.asarray(im).astype(np.float32) / 255.0
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    if g.get("auto", True):
        lo, hi = np.percentile(lum, [0.4, 99.6])
        lo, hi = min(lo, 0.05) * 0.9, max(hi, 0.93)
        x = np.clip((x - lo) / (hi - lo), 0, 1)
    if g.get("mono"):
        l = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        x = np.stack([l * 1.04, l * 1.0, l * 0.93], -1)
    x = np.clip(x * g.get("gain", 1.0), 0, 1) ** g.get("gamma", 1.0)
    c = g.get("contrast", 0.10)
    x = x - c * np.sin(2 * np.pi * x) / (2 * np.pi)
    lum = (x @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    x = lum + (x - lum) * g.get("sat", 1.06)
    w = g.get("warm", 0.015)
    x[..., 0] *= 1 + w
    x[..., 2] *= 1 - w
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))


class Shot:
    def __init__(s, d, t_in, t_out):
        im = Image.open(d["img"]).convert("RGB")
        sw, sh = im.size
        cw0 = min(sw, sh * AR)
        zmin = min(d["from"][2], d["to"][2])
        ps = min(1.0, (W * 1.08) / (cw0 / zmin))
        if ps < 1:
            im = im.resize((round(sw * ps), round(sh * ps)), Image.LANCZOS)
        s.im = grade(im, d.get("grade", {}))
        s.sw, s.sh = s.im.size
        s.cw0 = min(s.sw, s.sh * AR)
        s.ch0 = s.cw0 / AR
        s.d, s.t_in, s.t_out = d, t_in, t_out
        zmax = max(d["from"][2], d["to"][2])
        if s.cw0 / zmax < W * 0.80:
            print(f"note: {d['id']} is upscaled {W / (s.cw0 / zmax):.2f}x at its tightest", file=sys.stderr)
        for nm in ("from", "to"):
            cx, cy, z = d[nm]
            cw, ch = s.cw0 / z, s.ch0 / z
            if abs(min(max(cx * s.sw, cw / 2), s.sw - cw / 2) - cx * s.sw) > 1 or abs(min(max(cy * s.sh, ch / 2), s.sh - ch / 2) - cy * s.sh) > 1:
                print(f"note: {d['id']} '{nm}' framing is clamped at the picture edge", file=sys.stderr)

    def frame(s, t):
        p = min(1.0, max(0.0, (t - s.t_in) / (s.t_out - s.t_in)))
        (x0, y0, z0), (x1, y1, z1) = s.d["from"], s.d["to"]
        z = math.exp(math.log(z0) + (math.log(z1) - math.log(z0)) * p)
        cw, ch = s.cw0 / z, s.ch0 / z
        cx = min(max((x0 + (x1 - x0) * p) * s.sw, cw / 2), s.sw - cw / 2)
        cy = min(max((y0 + (y1 - y0) * p) * s.sh, ch / 2), s.sh - ch / 2)
        return s.im.transform((W, H), Image.AFFINE, (cw / W, 0, cx - cw / 2, 0, ch / H, cy - ch / 2), resample=Image.BICUBIC)


shots_d = F["shots"]
SHOTS = []
for i, d in enumerate(shots_d):
    t_out = shots_d[i + 1]["t"] + shots_d[i + 1].get("xf", XF) if i + 1 < len(shots_d) else DUR
    SHOTS.append(Shot(d, d["t"], t_out))

r = np.hypot((XX - 0.5) * 2, (YY - 0.5) * 2) / math.sqrt(2)
VIG = Image.fromarray(((1 - 0.26 * np.clip((r - 0.38) / 0.62, 0, 1) ** 2) * 255).astype(np.uint8)).convert("RGB")
BLACK = Image.new("RGB", (W, H), (0, 0, 0))


def frame_at(t):
    i = max(j for j, s in enumerate(SHOTS) if s.t_in <= t + 1e-9)
    fr = SHOTS[i].frame(t)
    xf = SHOTS[i].d.get("xf", XF)
    if i > 0 and t < SHOTS[i].t_in + xf:
        fr = Image.blend(SHOTS[i - 1].frame(t), fr, smooth((t - SHOTS[i].t_in) / xf))
    fr = ImageChops.multiply(fr, VIG)
    for ov in OVS:
        op = ov_opacity(ov["o"], t)
        if op <= 0.003:
            continue
        m = ov["a"] if op >= 0.997 else ov["a"].point([int(v * op) for v in range(256)])
        fr.paste(ov["rgb"], (0, 0), m)
    g = smooth(t / F.get("fade_in", 1.2)) * smooth((DUR - t) / F.get("fade_out", 1.5))
    if g < 0.999:
        fr = Image.blend(BLACK, fr, g)
    return fr


if a.stills:
    ts = [float(v) for v in a.stills.split(",")]
    tw = min(W // a.cols, a.tw)
    th = round(tw / AR)
    rows = math.ceil(len(ts) / a.cols)
    sheet = Image.new("RGB", (a.cols * tw, rows * th), (0, 0, 0))
    fnt = ImageFont.truetype(F["fonts"]["sans"], 15)
    dr = ImageDraw.Draw(sheet)
    for k, t in enumerate(ts):
        im = frame_at(t).resize((tw, th), Image.LANCZOS)
        x, y = (k % a.cols) * tw, (k // a.cols) * th
        sheet.paste(im, (x, y))
        dr.text((x + 6, y + 4), f"{t:.1f}s", font=fnt, fill=(255, 255, 0))
    sheet.save(a.sheet, quality=int(os.environ.get("Q", "60")))
    print(a.sheet, os.path.getsize(a.sheet) // 1024, "KiB")
    sys.exit(0)

t1 = a.t1 if a.t1 is not None else DUR
n0, n1 = int(round(a.t0 * FPS)), int(round(t1 * FPS))
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
       "-c:v", "libx264", "-preset", a.preset, "-crf", a.crf, "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for n in range(n0, n1):
    p.stdin.write(frame_at(n / FPS).tobytes())
    if n % 150 == 0:
        print(f"frame {n}/{n1}", flush=True)
p.stdin.close()
sys.exit(p.wait())
