#!/usr/bin/env python3
"""Build the soundtrack and captions for the Yuma film.

Places each narration paragraph at its time in film.json, ducks the music under the voice,
masters the result to about -16 LUFS and writes audio/mix.wav plus an .srt caption file.
"""
import json, re, subprocess, sys, wave
import numpy as np

SR = 48000
F = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "film.json"))
DUR = F["duration"]
NAR = F["narration"]
N = int(DUR * SR)


def load(path, ch):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).T.astype(np.float64)


def save(path, x):
    x = np.atleast_2d(x)
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[0]); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def lufs(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    tail = err[err.rindex("Summary:"):]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))


def quietest(x, a, b):
    """Sample index of the quietest 20 ms window between times a and b."""
    a, b = max(0, int(a * SR)), min(len(x), int(b * SR))
    win = int(0.02 * SR)
    if b - a <= win:
        return (a + b) // 2
    e = np.convolve(x[a:b] ** 2, np.ones(win), "valid")
    return a + int(np.argmin(e)) + win // 2


vo = load(NAR["file"], 1)[0]
paras = NAR["paragraphs"]
track = np.zeros(N)
mask = np.zeros(N)
fade = int(0.02 * SR)
for i, p in enumerate(paras):
    s, e = p["lines"][0][0], p["lines"][-1][1]
    lo = paras[i - 1]["lines"][-1][1] + 0.03 if i else 0.0
    hi = paras[i + 1]["lines"][0][0] - 0.03 if i + 1 < len(paras) else len(vo) / SR
    cs = quietest(vo, max(lo, s - 0.30), s - 0.01) if s > 0.05 else 0
    ce = quietest(vo, e + 0.04, min(hi, e + 0.45)) if hi - e > 0.08 else len(vo)
    seg = vo[cs:ce].copy()
    seg[:fade] *= np.linspace(0, 1, fade)
    seg[-fade:] *= np.linspace(1, 0, fade)
    off = p["at"] - s                       # film time = raw time + off
    i0 = int((cs / SR + off) * SR)
    track[i0:i0 + len(seg)] += seg
    mask[max(0, int((s + off - 0.50) * SR)):int((e + off + 0.30) * SR)] = 1.0
    p["_off"] = off
    print(f"paragraph {i + 1}: film {s + off:6.2f} - {e + off:6.2f}  (raw cut {cs / SR:.2f}-{ce / SR:.2f})")

# voice: clean up the low end, even out the level a little, set loudness
save("audio/_vo_dry.wav", track)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "audio/_vo_dry.wav", "-af",
                "highpass=f=70,acompressor=threshold=-24dB:ratio=2:attack=12:release=160:makeup=1", "audio/_vo_fx.wav"], check=True)
vo_t = load("audio/_vo_fx.wav", 1)[0][:N]
vo_t = np.pad(vo_t, (0, N - len(vo_t)))
save("audio/_vo_fx.wav", vo_t)
vo_t *= 10 ** ((NAR.get("lufs", -17.0) - lufs("audio/_vo_fx.wav")[0]) / 20)

# music: set its open level, then ride it down under the voice
mu = load(F["music"]["file"], 2)[:, :N]
mu = np.pad(mu, ((0, 0), (0, N - mu.shape[1])))
save("audio/_mu.wav", mu)
mu *= 10 ** ((F["music"].get("lufs", -21.5) - lufs("audio/_mu.wav")[0]) / 20)
k = int(0.9 * SR)
ramp = np.convolve(mask, np.hanning(k) / np.hanning(k).sum(), "same")
mu *= 10 ** (-F["music"].get("duck_db", 10.5) * ramp / 20)

mix = mu + vo_t[None, :]
save("audio/_premaster.wav", mix * 0.7)
i_now, _ = lufs("audio/_premaster.wav")
mix *= 0.7 * 10 ** ((F.get("master_lufs", -16.0) - i_now) / 20)
save("audio/_gained.wav", np.clip(mix, -1.5, 1.5) / 1.5)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "audio/_gained.wav", "-af",
                "volume=1.5,alimiter=limit=0.84:attack=4:release=60:level=disabled", "-ar", str(SR), "audio/mix.wav"], check=True)
print("master: %.1f LUFS, true peak %.1f dBFS" % lufs("audio/mix.wav"))


def ts(t):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)) % 1000:03d}"


n, out = 0, []
for p in paras:
    for s, e, text in p["lines"]:
        n += 1
        out.append(f"{n}\n{ts(s + p['_off'])} --> {ts(e + p['_off'] + 0.25)}\n{text}\n")
open(F.get("captions", "out/captions.srt"), "w").write("\n".join(out))
print("captions:", n, "lines")
