#!/usr/bin/env python3
"""Light acoustic background bed for the Yuma film, synthesized from scratch (numpy only).

Fingerpicked plucked-string guitar (additive synthesis), a soft pad, a quiet bass and a
sparse glassy melody, in D major. The tempo is derived from --dur so the piece always
ends on its final chord exactly at the end of the film.

usage: music.py out.wav --dur 92
"""
import argparse, wave
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--dur", type=float, default=92.0)
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()

SR = 48000
TAU = 2 * np.pi
rng = np.random.default_rng(a.seed)
PC = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(name):
    return 440.0 * 2 ** ((12 * (int(name[-1]) + 1) + PC[name[:-1]] - 69) / 12)


def up(name, octs=1):
    return name[:-1] + str(int(name[-1]) + octs)


# chord -> (bass string, three upper strings), voiced like open guitar shapes
CH = {
    "D": ("D3", ["A3", "D4", "F#4"]),
    "A/C#": ("C#3", ["A3", "C#4", "E4"]),
    "Bm": ("B2", ["B3", "D4", "F#4"]),
    "G": ("G2", ["B3", "D4", "G4"]),
    "D/F#": ("F#2", ["A3", "D4", "F#4"]),
    "Em7": ("E2", ["B3", "D4", "G4"]),
    "Asus": ("A2", ["A3", "D4", "E4"]),
    "A": ("A2", ["A3", "C#4", "E4"]),
}
SEC_A = ["D", "A/C#", "Bm", "G"]
SEC_B = ["G", "D/F#", "Em7", "Asus>A"]
# melody per bar: (beat, note, length in beats)
MEL_A = [[(0, "F#5", 2), (2, "A5", 2)], [(0, "E5", 3), (3, "C#5", 1)],
         [(0, "D5", 2), (2, "F#5", 2)], [(0, "B4", 2), (2, "D5", 1), (3, "E5", 1)]]
MEL_B = [[(0, "D5", 2), (2, "G5", 2)], [(0, "F#5", 3), (3, "E5", 1)],
         [(0, "G5", 2), (2, "E5", 2)], [(0, "D5", 2), (2, "C#5", 2)]]

bars = []


def add(sec, mel, **kw):
    for i, c in enumerate(sec):
        bars.append(dict(ch=c, mel=mel[i] if mel else [], **kw))


bars.append(dict(ch="D", mel=[], g="sparse", pad=1, bass=0, lvl=0.70))
bars.append(dict(ch="D", mel=[], g="PA", pad=1, bass=0, lvl=0.74))
add(SEC_A, None, g="PA", pad=1, bass=0, lvl=0.84)
add(SEC_A, MEL_A, g="PB", pad=1, bass=1, lvl=0.90)
add(SEC_B, MEL_B, g="PA", pad=1, bass=1, lvl=0.95)
add(SEC_A, MEL_A, g="PB", pad=1, bass=1, lvl=1.00)
add(SEC_B, MEL_B, g="PA", pad=1, bass=1, lvl=1.00)
add(SEC_A, MEL_A, g="PB", pad=2, bass=1, lvl=1.00)
bars.append(dict(ch="D", mel=[(0, "F#5", 4)], g="strum", pad=1, bass=1, lvl=0.92))
bars.append(dict(ch="D", mel=[], g="none", pad=1, bass=0, lvl=0.80))

NB = len(bars)
BAR = a.dur / NB
BEAT = BAR / 4
N = int((a.dur + 8) * SR)
G, P, B, M = (np.zeros((2, N)) for _ in range(4))


def place(bus, sig, t0, pan=0.0, gain=1.0):
    i0 = max(0, int(t0 * SR))
    n = min(len(sig), N - i0)
    th = (pan + 1) * np.pi / 4
    bus[0, i0:i0 + n] += sig[:n] * np.cos(th) * gain
    bus[1, i0:i0 + n] += sig[:n] * np.sin(th) * gain


def pluck(f, dur, vel):
    """Plucked string: decaying harmonics, higher partials die faster, softer plucks are darker."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    tau1 = 1.9 * (110.0 / f) ** 0.45
    for k in range(1, max(4, int(min(40, 0.42 * SR / f))) + 1):
        fk = f * k * np.sqrt(1 + 8e-5 * k * k)
        amp = abs(np.sin(np.pi * k * 0.19)) / k ** 1.25 * np.exp(-k / (9.0 + 9.0 * vel))
        tau = tau1 / (1 + 0.045 * k * k)
        m = min(n, int(tau * 7.5 * SR))
        if m < 64 or amp < 1e-4:
            continue
        out[:m] += amp * np.exp(-t[:m] / tau) * np.sin(TAU * fk * t[:m])
    pn = int(0.010 * SR)
    pick = np.convolve(rng.standard_normal(pn + 11), np.ones(12) / 12, "valid")[:pn] * np.hanning(pn)
    out[:pn] += 0.10 * pick
    fade = int(0.05 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out * vel * 0.5


def pad_note(f, dur, att=1.5, rel=3.0):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    L, R = np.zeros(n), np.zeros(n)
    for k, amp in ((1, 1.0), (2, 0.28), (3, 0.11), (4, 0.04)):
        ph = rng.uniform(0, TAU, 3)
        c = amp * np.sin(TAU * f * k * t + ph[0])
        L += c + 0.7 * amp * np.sin(TAU * f * 0.9962 * k * t + ph[1])
        R += c + 0.7 * amp * np.sin(TAU * f * 1.0041 * k * t + ph[2])
    env = np.clip(t / att, 0, 1) ** 1.4
    env = env * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 3.5)))
    env *= np.clip((n - np.arange(n)) / (0.08 * SR), 0, 1)
    env *= 1 + 0.05 * np.sin(TAU * 0.17 * t + rng.uniform(0, TAU))
    return L * env, R * env


def bass_note(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(TAU * f * t) + 0.22 * np.sin(TAU * 2 * f * t) + 0.06 * np.sin(TAU * 3 * f * t)
    env = np.clip(t / 0.035, 0, 1) * np.exp(-t / 2.4) * np.clip((dur - t) / 0.30, 0, 1)
    return s * env


def bell(f, dur, vel):
    n = int((dur + 2.2) * SR)
    t = np.arange(n) / SR
    s = (np.exp(-t / 1.25) * np.sin(TAU * f * t) + 0.20 * np.exp(-t / 0.6) * np.sin(TAU * 2 * f * t)
         + 0.06 * np.exp(-t / 0.3) * np.sin(TAU * 3 * f * t + 0.3))
    s *= np.clip(t / 0.010, 0, 1) * np.clip((n - np.arange(n)) / (0.1 * SR), 0, 1)
    return s * vel


PAT = {"PA": [0, 1, 2, 3, 2, 1, 2, 3], "PB": [0, 2, 3, 2, 1, 2, 3, 2]}
PAN = [0.0, -0.24, 0.20, -0.06]
pad_spans = {}

for bi, b in enumerate(bars):
    t0 = bi * BAR
    names = b["ch"].split(">")
    halves = [CH[names[0]], CH[names[-1]]]
    bass, ups = halves[0]
    lvl = b["lvl"]
    if b["g"] in PAT:
        for i, idx in enumerate(PAT[b["g"]]):
            hb, hu = halves[0 if i < 4 else 1]
            note = hb if idx == 0 else hu[idx - 1]
            acc = 1.0 if i == 0 else (0.78 if i == 4 else 0.60)
            vel = float(np.clip(acc * lvl * (1 + rng.normal(0, 0.05)), 0.2, 1.1))
            t = t0 + i * BEAT / 2 + (0 if i == 0 else rng.normal(0, 0.006))
            place(G, pluck(hz(note), 3.4 if idx == 0 else 2.6, vel), t, PAN[idx])
            if i == 4 and b["bass"] and idx != 0:
                place(G, pluck(hz(hb), 2.8, 0.50 * lvl), t - 0.004, 0.0)
    elif b["g"] == "sparse":
        for beat, note, vel in ((0, bass, 0.75), (1, ups[0], 0.5), (2, ups[1], 0.55), (3, ups[2], 0.5)):
            place(G, pluck(hz(note), 3.6, vel * lvl), t0 + beat * BEAT, 0.0 if beat == 0 else PAN[beat])
    elif b["g"] == "strum":
        for j, note in enumerate([bass] + ups + [up(ups[0]), up(ups[1])]):
            place(G, pluck(hz(note), 7.0, (0.85 - 0.05 * j) * lvl), t0 + j * 0.055, [-0.1, -0.25, 0.2, -0.05, 0.25, 0.1][j])
    if b["bass"]:
        place(B, bass_note(hz(bass), BAR * (2.0 if b["g"] == "strum" else 0.98)), t0)
    for beat, note, length in b["mel"]:
        place(M, bell(hz(note), length * BEAT, 0.9 * lvl * (1 + rng.normal(0, 0.04))), t0 + beat * BEAT + rng.normal(0, 0.008), 0.18)
    if b["pad"]:
        notes = [(up(bass), 1.0)] + [(u, 0.9) for u in ups]
        if b["pad"] == 2:
            notes.append((up(ups[2]), 0.35))
        for nm, g in notes:
            pad_spans.setdefault((nm, g), []).append(bi)

# merge consecutive bars of the same pad pitch into one sustained note (no re-attack on common tones)
for (nm, g), idxs in pad_spans.items():
    start = prev = idxs[0]
    for i in idxs[1:] + [None]:
        if i is not None and i == prev + 1:
            prev = i
            continue
        L, R = pad_note(hz(nm), (prev - start + 1) * BAR)
        i0 = int(start * BAR * SR)
        n = min(len(L), N - i0)
        P[0, i0:i0 + n] += L[:n] * g
        P[1, i0:i0 + n] += R[:n] * g
        if i is not None:
            start = prev = i


def rms(x):
    s = x[:, int(6 * BAR * SR):int(26 * BAR * SR)]
    return float(np.sqrt(np.mean(s ** 2)) + 1e-12)


ref = rms(G)
P *= ref / rms(P) * 10 ** (-9.0 / 20)
B *= ref / rms(B) * 10 ** (-8.0 / 20)
M *= ref / rms(M) * 10 ** (-7.5 / 20)

# synthetic hall: decaying stereo noise, band-limited
rt = 2.6
m = int(rt * 1.25 * SR)
tt = np.arange(m) / SR
ir = rng.standard_normal((2, m)) * np.exp(-6.91 * tt / rt)
fr = np.fft.rfftfreq(m, 1 / SR)
shape = (1 / (1 + (fr / 4200.0) ** 2)) * ((fr / 260.0) ** 2 / (1 + (fr / 260.0) ** 2))
ir = np.fft.irfft(np.fft.rfft(ir, axis=1) * shape, m, axis=1)
ir = np.concatenate([np.zeros((2, int(0.018 * SR))), ir], axis=1)
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))

send = 0.55 * G + 1.0 * P + 1.3 * M
nfft = 1 << (N + ir.shape[1] - 2).bit_length()
wet = np.stack([np.fft.irfft(np.fft.rfft(send[c], nfft) * np.fft.rfft(ir[c], nfft), nfft)[:N] for c in (0, 1)])
mix = G + P + B + M + 0.26 * wet * (rms(G) / rms(wet)) * 2.0

n_out = int(a.dur * SR)
mix = mix[:, :n_out]
t = np.arange(n_out) / SR
mix *= np.clip(t / 0.4, 0, 1)
fo = 3.2
mix *= np.where(t > a.dur - fo, 0.5 * (1 + np.cos(np.pi * (t - (a.dur - fo)) / fo)), 1.0)
mix = mix / np.abs(mix).max() * 0.85
mix = np.tanh(mix * 1.15) / np.tanh(1.15) * 0.80
pcm = (mix.T * 32767).astype("<i2")
with wave.open(a.out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"bars={NB} bpm={240 / BAR:.2f} bar={BAR:.3f}s dur={a.dur}s peak={np.abs(mix).max():.2f}")
