# work
My Work Repository

## LDAWIF — AI-Enabled Fire-Control (`index.html`)

A single, self-contained animated page for the LDAWIF concept (Layered Defense ·
Autonomous Warfare · Integrated Fires). It presents one kill chain —
**Sense → Decide → Act → Assess** — with an AI decision core running underneath
every stage, a live decision-support console that ranks weapon–target pairings by
probability of kill, and a human-on-the-loop gate.

Built for SharePoint embedding:

- **One file, zero external dependencies.** No CDNs, no web fonts, no network calls —
  so it loads in locked-down tenants and works offline.
- **System fonts only**, responsive down to a single column, and it respects
  `prefers-reduced-motion` (the animation resolves to a static end-state instead of
  playing).
- The engagement plays once on load and replays from the **Run engagement** button.

## Host it on GitHub Pages

A workflow (`.github/workflows/pages.yml`) publishes the repo to GitHub Pages on every
push to `main`. Once it runs, the page is live at:

```
https://azjester.github.io/work/
```

and the preview image at `https://azjester.github.io/work/poster.png`.

**One-time setup:** in the repo, go to **Settings → Pages → Build and deployment** and
set **Source: GitHub Actions**. (The workflow tries to enable this automatically, but
some accounts require the toggle once.) Then open **Actions** and confirm the *Deploy to
GitHub Pages* run finished green.

> GitHub Pages serves the page **publicly**. The content here is a generic concept page
> with no sensitive data; if you need it private, host it on Azure Static Web Apps or an
> internal static host instead and swap the URLs below.

## Clickable image for a SharePoint page

A branded preview image (`poster.png`, 1200×630) links to the live page.

**No-code (recommended) — SharePoint Image web part**

1. On your page: **+ → Image**, and upload `poster.png` (download it from this repo).
2. In the image properties, set the **Link** to `https://azjester.github.io/work/`.
3. People now click the banner and the live, animated page opens.

**HTML — Embed web part**

Paste the snippet in `embed-snippet.html` (a ready-made `<a><img></a>` that points the
banner at the hosted page). Update the two URLs if your Pages address differs.

## Embed the full live page instead (optional)

If you'd rather show the running page inline rather than a clickable image, use the
**Embed** web part with:

```html
<iframe src="https://azjester.github.io/work/" width="100%" height="2700" style="border:0"></iframe>
```

If the Embed web part says the domain isn't allowed, ask your SharePoint admin to add
`azjester.github.io` to the embed allow-list (*Site Settings → HTML Field Security*, or
the tenant embed setting). Adjust `height` to taste; ~2700px fits the page without inner
scroll on a standard column.

## What's in this folder

| File | Purpose |
|------|---------|
| `index.html` | The full, self-contained animated LDAWIF page. No external dependencies; system fonts only; responsive; respects `prefers-reduced-motion`. |
| `poster.png` | 1200×630 clickable preview image for SharePoint. |
| `poster.html` | Source used to render `poster.png` (re-render if you tweak the design). |
| `embed-snippet.html` | Ready-to-paste clickable `<a><img></a>` for the Embed web part. |
| `.github/workflows/pages.yml` | Publishes the page to GitHub Pages on push to `main`. |
