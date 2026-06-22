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

### Add it to a SharePoint page

**Option A — host inside SharePoint (keeps it internal)**

1. Upload `index.html` to a document library on your site (Site Assets works well).
2. Open the file in the library and copy its direct link.
3. On your page, choose **+ → Embed** and paste:
   ```html
   <iframe src="PASTE_FILE_URL_HERE" width="100%" height="2700" style="border:0"></iframe>
   ```
4. If the Embed web part says the domain isn't allowed, ask your SharePoint admin to
   add your tenant domain to the embed allow-list
   (*Site Settings → HTML Field Security*, or the tenant embed setting).

> Some tenants serve uploaded `.html` as a download instead of rendering it. If the
> embed shows a download prompt rather than the page, use Option B.

**Option B — host as a static page, embed the URL**

Publish `index.html` to any static host — GitHub Pages (public), or Azure Static Web
Apps / Azure Blob static website for an internal URL — then use the **Embed** web part
with that URL.

Adjust the iframe `height` to taste; ~2700px fits the full page without inner scroll on
a standard column.
