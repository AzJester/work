# work
My Work Repository

## LDAWIF — All-Domain Kill Web

A standalone, self-contained web app for the LDAWIF concept (Layered Defense ·
Autonomous Warfare · Integrated Fires), **deployed straight from this repo via GitHub
Pages**. It's a destination page — open or share the link, nothing to embed:

### → https://azjester.github.io/work/

## What it shows

A tactical **layered-defense scope** drawn as a warfighter would picture it: concentric
engagement rings (surveillance 120 km → area defense 80 km → point 40 km) around a
defended asset, all-domain sensor/shooter nodes (space, air, maritime, ground, cyber)
meshed by an **AI / CJADC2 core** — *any sensor, best shooter*.

Run the engagement and a **multi-axis raid** (AIR, UAS, ASCM, AIR) comes inbound. Each
track is carried through **F2T2EA** (Find · Fix · Track · Target · Engage · Assess) at
machine speed:

- AI fuses all-domain sensors into one track picture and runs combat ID
- AI pairs the **best shooter per threat** across domains (Air SAM, Ground SAM, Maritime
  SM) and checks ROE/CDE; a **human grants release authority**
- effectors engage in depth; a **leaker** (the ASCM) is re-engaged by point-defense HEL
- battle-damage assessment confirms the raid defeated and feeds the learning loop

A live **track table**, a command & authority panel, and the six-step F2T2EA rail update
as the engagement runs. A friendly CAP track is held but never engaged — combat-ID
discrimination in action.

## How it's deployed

- `.github/workflows/pages.yml` publishes the repo to GitHub Pages on every push to
  `main`. The repo is public and Pages is enabled, so the live URL above stays current.
- **To update it:** edit `index.html`, commit, and push to `main` — the workflow
  redeploys automatically (about a minute). Check **Actions → Deploy to GitHub Pages**
  for the green run.

## Build notes

One file, **zero external dependencies** (no CDNs, no web fonts, no network calls).
System fonts only; the scope is canvas-rendered. Responsive — the side panels and
F2T2EA rail stack below the scope on narrow screens, and sensor labels are placed so
nothing clips at any width. Respects `prefers-reduced-motion` (resolves to a static
"raid defeated" picture instead of animating).

The track IDs, classes, Pk values, and timings are illustrative for the demo — not real
system performance. By doctrine, AI assists and accelerates the kill chain; a human
retains release authority over the use of force.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The standalone LDAWIF site (the whole app). |
| `poster.png` / `poster.html` | A static 1200×630 banner image and its source. Used for link previews / social cards (those don't animate). |
| `poster.gif` / `poster-anim.html` | An **animated** 1000×525 banner (looping radar sweep, an intercept, and the F2T2EA chain lighting) and its source scene. Live at `https://azjester.github.io/work/poster.gif`. |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on push to `main`. |
| `embed-snippet.html` | Optional `<a><img></a>` if you ever want to link to the site from elsewhere. |

> **Animated banner:** use `poster.gif` as a regular `<img>` wherever you want motion
> (it loops on its own). Note that social/link-preview cards (Open Graph / Twitter) show a
> *static* image, so those still point at `poster.png`. To re-render the GIF after editing
> `poster-anim.html`, capture its frames and encode with a GIF encoder (e.g. `gifenc`).
