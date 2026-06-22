# work
My Work Repository

## LDAWIF — AI-Enabled Fire-Control (`index.html`)

A single, self-contained **compact widget** for the LDAWIF concept (Layered Defense ·
Autonomous Warfare · Integrated Fires), sized to drop into a SharePoint web part — not a
long scrolling page. Header, capability inputs, the animated kill chain
(**Sense → Decide → Act → Assess**), an AI decision-support panel that ranks
weapon–target pairings by probability of kill, a human-on-the-loop gate, and the two
outcomes all sit in one ~600px view.

- **One file, zero external dependencies.** No CDNs, no web fonts, no network calls — so
  it loads in locked-down tenants and works offline.
- **System fonts only.** At web-part / desktop widths it's a single ~600px-tall tile; in
  a narrow column the chain wraps to a 2×2 grid. Respects `prefers-reduced-motion`.
- The engagement plays once on load and replays from the **Run engagement** button.

## Put it in a SharePoint web part (recommended)

Use the **Embed** web part and point it at the hosted page:

```html
<iframe src="https://azjester.github.io/work/" width="100%" height="640" style="border:0"></iframe>
```

At a full-width or one-column section that fills the web part at ~600px tall. In a
narrower (two-column) section the chain wraps and gets taller — bump `height` to ~900.

If the Embed web part says the domain isn't allowed, ask your SharePoint admin to add
`azjester.github.io` to the embed allow-list (*Site Settings → HTML Field Security*, or
the tenant embed setting).

> Prefer to keep it fully inside your tenant? Upload `index.html` to a document library
> and embed that file's URL instead — same iframe, no GitHub hosting needed.

## Hosting it on GitHub Pages

`.github/workflows/pages.yml` publishes the repo to GitHub Pages on every push to `main`.
The live URL is:

```
https://azjester.github.io/work/
```

**This repo is currently private**, and GitHub Pages can't serve a private repo to
SharePoint viewers (they'd hit a GitHub login wall). To go live:

1. **Make the repo public** — *Settings → General → Danger Zone → Change visibility →
   Make public*. (This can't be done from the API; it's an owner-only setting.)
2. **Enable Pages** — *Settings → Pages → Build and deployment → Source: GitHub Actions.*
3. **Re-run the deploy** — *Actions → Deploy to GitHub Pages → Re-run jobs* (or just push
   any commit). Confirm it finishes green; the page is then live at the URL above.

> Making the repo public exposes all of its contents. This is a generic concept page with
> no sensitive data; if anything here shouldn't be public, host it on Azure Static Web
> Apps / an internal static host (or inside SharePoint) instead, and swap the URLs.

## Optional: a clickable image that opens the page

If you'd rather show a banner that opens the widget in a new tab:

- **No-code — Image web part:** **+ → Image**, upload `poster.png`, then set its **Link**
  to `https://azjester.github.io/work/`.
- **HTML — Embed web part:** paste `embed-snippet.html` (a ready-made `<a><img></a>`).

## What's in this folder

| File | Purpose |
|------|---------|
| `index.html` | The compact, self-contained LDAWIF widget. Fills a web part; no external deps; respects `prefers-reduced-motion`. |
| `poster.png` | 1200×630 banner image, for the optional clickable-image setup. |
| `poster.html` | Source used to render `poster.png`. |
| `embed-snippet.html` | Ready-to-paste clickable `<a><img></a>` for the Embed web part. |
| `.github/workflows/pages.yml` | Publishes the page to GitHub Pages on push to `main`. |
