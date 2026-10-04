# Black Hat Agent — Independent Audit

**Scope:** the static, browser-only Black Hat Agent application shipped from
`black-hat-agent/` and served at `https://azjester.github.io/work/black-hat-agent/`
(`index.html`, `app.js`, `engine.js`, `import-engine.js`, `import-wizard.js`,
`visualizations.js`, `spreadsheet-worker.js`, `styles.css`, `vendor/xlsx.full.min.js`,
and the repository-root `sw.js` that controls the deployment path). Documentation
under `black-hat-agent/docs/` and the READMEs were treated as claims to verify.

**Date:** 2026-09-01

**Method:** whole-source static review across eight dimensions (HTML/SVG injection,
spreadsheet + ZIP import safety, JSON-workspace import & prototype pollution,
persistence/service-worker/recovery, CSP/privacy/supply-chain, analysis-engine
correctness, accessibility, and general robustness vs. documented claims), with an
adversarial verification pass over every candidate finding, plus live-browser probes
(clean-load network capture, a stored-XSS injection across 262 workspace fields and
every view, and WCAG contrast measurement).

## Overall assessment

The application is well engineered for its stated threat model. There are **no
critical or high-severity issues**, no code-execution paths, and no cross-user
data-exfiltration paths. The privacy and injection posture in particular is strong
and holds up under both static tracing and live testing.

The findings below are **2 medium, 6 low, and 3 informational**. The two medium
items are the only ones with material user impact: an attachment-read failure that
can, in an uncommon sequence, cause loss of the local workspace; and a focus-ring
contrast failure affecting keyboard accessibility. Everything else is robustness,
offline-correctness, or hardening polish.

### Severity summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| F1 | Medium | Robustness / data loss | Attachment-read failure leaves a dangling evidence link that can discard the whole workspace on reload |
| F2 | Medium | Accessibility | Global focus indicator (`--sky`) is below the 3:1 non-text contrast minimum on light surfaces |
| F3 | Low | Offline / architecture | The root `/work/` service worker (registered by sibling apps) silently controls this app’s path |
| F4 | Low | Import safety | ZIP “expanded size” preflight trusts attacker-declared sizes rather than measuring inflation |
| F5 | Low | Engine correctness | Non-numeric `priorEstimate` in an imported workspace renders a `NaN%` scenario estimate |
| F6 | Low | Clickjacking | Page is framable (no `frame-ancestors` possible via meta CSP; host sends no framing header) |
| F7 | Low | UX robustness | Search / list-filter caret is forced to end of field on every keystroke |
| F8 | Info | Concurrency | Cross-tab concurrent edits are last-writer-wins, warned only by a transient toast |
| F9 | Info | Accessibility | The persistent “Unsaved changes” indicator is not an ARIA live region |

## Findings

### F1 — Attachment-read failure can discard the entire local workspace (Medium)

**Where:** `app.js` `handleRecordSubmit()` (~2049–2152), reciprocal-link mutation
~2079–2082, awaited reads at ~2102 (`readDataUrl`) and ~2112 (`file.text()`); submit
dispatcher ~2516; `loadWorkspace()` ~457–476; `engine.js` reciprocity check ~311–314.

**What/why:** For an evidence record, the reciprocal link is written into
`data.criteria[*].evidenceIds` **synchronously, before** the awaited file reads, and
neither the awaited reads nor the dispatcher (`await handleRecordSubmit(form)`) is
wrapped in `try/catch`. The early-return validation guards (size/type/unsafe data URL)
correctly restore `data = previous`, but the throw path does not. If `readDataUrl` or
`file.text()` rejects (FileReader error, file moved/locked/unreadable), the function
throws before the evidence record is pushed, leaving `data.criteria` referencing an
evidence id that does not exist in `data.evidence`. That dangling reference is not
saved on its own, but the next `save()` (e.g. saving the Opportunity form) persists it.
On the next load, `loadWorkspace()` runs `validateWorkspaceImport` with
`enforceReciprocity=true`, validation fails on “references missing evidence,” and the
workspace is replaced by the demo seed — losing the user’s work **and** their recovery
snapshots.

**Trigger:** Add an evidence record linked to a criterion with a local attachment whose
read fails; then perform any later save before reloading.

**Impact:** Real, unrecoverable loss of local data. Likelihood is low (requires a
genuine file-read failure plus a subsequent save), which is why it is medium rather
than high; it is not downgraded to info because it causes actual data loss.

**Fix:** Wrap the awaited attachment reads (ideally the whole handler body) in
`try/catch`; on failure restore `data = previous`, surface an error toast, and return
without leaving a reciprocal link pointing at an unsaved record. Alternatively, read
the file **before** mutating any reciprocal collection.

### F2 — Focus indicator fails 3:1 non-text contrast on light surfaces (Medium)

**Where:** `styles.css:62` — the sole global rule
`…:focus-visible{outline:3px solid var(--sky);outline-offset:3px}`, with
`--sky:#29aae1`, `--panel:#fff`, `--paper:#f5f6f8`.

**What/why:** With a 3px offset the ring is drawn on the surrounding light surface.
Measured contrast of `#29aae1` is **2.65:1 against `#fff`** and **2.44:1 against
`#f5f6f8`**, both below the WCAG 2.1 SC 1.4.11 minimum of **3:1** for focus indicators.
Nearly the entire interactive surface (buttons, inputs, selects, textareas, links, the
`#content` skip target) lives on these light backgrounds. The sidebar’s own focus rule
uses the same colour on the dark `--ink #171327` background at ~6.8:1, which passes —
the failure is specific to the light content area.

**Impact:** Low-vision keyboard users cannot reliably see which control is focused. This
contradicts the documented “keyboard-accessible native controls” claim.

**Fix:** Use a darker focus colour on light surfaces (e.g. `--purple #442c81` ≈ 11:1),
keeping the light `--sky` ring only for the dark sidebar; or add a double (outer/inner)
outline so at least one edge clears 3:1.

### F3 — Sibling-app service worker silently controls this app’s path (Low)

**Where:** repository-root `sw.js` (`navigationFallback` ~21–35, default tracker
fallback at line 34; network-first navigate handler ~55–72; stale-while-revalidate
asset branch ~74–82; `CACHE_NAME = "work-app-shell-v10"` line 1; `install` `skipWaiting`
~37–39; `activate` `clients.claim` ~45). Registered by `tracker.html:4211` and
`roadmap.html:4727` via `register("sw.js")` with **no explicit scope**.

**What/why:** Black Hat Agent deliberately registers no service worker and ships a
strict CSP (`connect-src 'none'`). But because sibling apps register the root `sw.js`
with default scope `/work/`, that worker controls `/work/black-hat-agent/` for any user
who previously opened the tracker or roadmap on the same origin. Three consequences:

1. **Wrong shell offline.** `navigationFallback` has branches for GeoPresence, roadmap,
   and dashboard, but none for black-hat-agent, so its default returns the **Tracker**
   HTML. If the user is offline and never loaded Black Hat Agent online (so no exact
   cache entry exists), a navigation to the Black Hat Agent URL renders the Tracker
   shell at the wrong URL.
2. **One-load-stale assets.** `app.js`/`engine.js`/`vendor` are not in `APP_SHELL`;
   they are cached opportunistically via stale-while-revalidate. A deploy that changes
   only Black Hat Agent assets does not bump `CACHE_NAME`, so a corrected asset is
   served stale for exactly one load (self-healing on the next). This affects
   patch-delivery latency, including for a hypothetical future security fix.
3. **Undeclared coupling.** The app’s documented “self-contained / no network” posture
   is, in practice, mediated by a worker it neither declares nor controls.

**Impact:** Cosmetic/correctness and patch-latency only; single-origin, no data loss,
no cross-user exposure. Reachable only in the narrow window described (sibling app
visited first; offline; never loaded online).

**Fix:** Give Black Hat Agent its own scoped worker (or none), or add an explicit
`navigationFallback` branch returning the cached `./black-hat-agent/index.html` for its
paths (mirroring the existing GeoPresence guard) so the Tracker shell is never
substituted; bump `CACHE_NAME` on any in-scope asset change; document the SW scope.

### F4 — ZIP bomb preflight trusts declared sizes, not real inflation (Low)

**Where:** `spreadsheet-worker.js` `preflightZip()` — per-entry check at line 83 and
total at 88, both derived from the central-directory `uncompressedSize` read at line 75;
the same bytes then go to `XLSX.read()` at line 15.

**What/why:** The “expanded data ≤ 50 MB total / 20 MB per entry” guarantee is computed
from the ZIP central directory’s **declared** uncompressed sizes — attacker-controlled
metadata — not from measured decompression. The structural checks in the same function
(ZIP64 sentinels, encryption flag, entry count, directory bounds) are sound; only the
size-bomb defense is header-trusting.

Verification refined the exploitability: the bundled SheetJS raw-inflater only grows its
output buffer when the size hint is falsy, so an entry that **declares a non-zero size**
has its buffer pinned and a high-ratio stream is effectively truncated (the naive bomb
does not reproduce). The bypass is narrower: a **streaming/data-descriptor entry whose
declared uncompressed size is 0** lets the inflater grow unbounded while the preflight
still passes. Even then, parsing runs in an isolated worker wrapped in `try/catch`, the
5 MB input cap (`import-wizard.js:313`) bounds the compressed input, and the 20 s
worker-terminate (`import-wizard.js:396`) bounds runtime; the usual outcome is a caught
`RangeError` reported as a failed import, with a hard tab crash only on low-memory
devices. Hence **low**, not medium, but it does transiently violate the documented bound
and is reachable via a shared workbook.

**Fix:** Treat declared sizes as untrusted hints; enforce the total/per-entry ceiling on
**bytes actually produced** during inflation (a size-capped inflater that aborts past the
limit), keeping the structural checks as a cheap fast-reject.

### F5 — Non-numeric `priorEstimate` yields a `NaN%` scenario estimate (Low)

**Where:** `engine.js` `calculateScenarioEstimate()` line 1758
(`Number(priorValue || 50)`); reached from `calculateCompetitiveScores` ~1204–1206;
`normalizeWorkspace` ~979 spreads the raw field without numeric coercion;
`validateWorkspaceCandidate` validates only pursuit id/name/customer, never numeric
fields.

**What/why:** `priorEstimate` flows in from an imported workspace unvalidated. A
non-empty non-numeric string (e.g. `"high"`) makes `Number("high")` → `NaN`, which
propagates through the logit/clamp chain so `value`, `low`, and `high` are all `NaN`;
the report then prints literal `Scenario win estimate: NaN% (NaN–NaN% …)`, violating the
documented “bounded [5,95]” guarantee. The scenario line renders only when the user’s
team and at least one competitor are scored — a state a shared workspace easily carries.
A secondary logic slip on the same line: `priorValue || 50` maps a legitimately-entered
`0` to `50` instead of clamping it to the `0.05` floor.

**Impact:** Misleading/broken **text** output (no XSS — it is interpolated as text — and
no stored-data corruption). Reachable cross-user via a shared workspace file.

**Fix:** Coerce `priorEstimate` to a finite number in `[5,95]` at normalization, and in
`calculateScenarioEstimate` replace `Number(priorValue || 50)` with a finite-check
(`const n = Number(priorValue); const base = Number.isFinite(n) ? n : 50;`) before the
existing clamp.

### F6 — Page is framable / clickjacking (Low)

**Where:** `index.html:9` — CSP delivered only via `<meta http-equiv>`.

**What/why:** `frame-ancestors` is ignored in a meta-delivered CSP and
`X-Frame-Options` cannot be expressed via meta; GitHub Pages sends no framing header
(no header control on the host). The policy’s `frame-src 'none'` restricts only what
this page may embed, not who may embed it, so the app can be loaded in a cross-origin
iframe (UI-redress).

**Impact:** Bounded. All state is local (no server actions), so the worst outcome is a
user damaging their own local workspace — and every destructive action (delete,
replace-with-demo, restore, discard) is gated by a native `confirm()` dialog that
renders in browser chrome and cannot be clickjacked, while workspace import requires the
native OS file picker. A single clickjacked click therefore cannot silently reach a
destructive path; practical exploitability is close to informational.

**Fix:** Not fully fixable via meta CSP on this host. Add a JS frame-buster
(`if (self !== top) top.location = self.location`) as defense-in-depth and note in
`SECURITY.md` that host-level framing protection is unavailable.

### F7 — Search/list-filter caret forced to end on every keystroke (Low)

**Where:** `app.js` global input handler ~2437–2457; forced
`setSelectionRange(query.length, query.length)` at 2447 (list filters) and 2455
(`#search`); `render()` replaces `#app.innerHTML` wholesale at 1490.

**What/why:** Each keystroke re-renders the whole app, recreating the input, then
re-focuses it and hard-sets the caret to the end of the string. Because the `input`
event fires after the character is inserted, a single mid-string keystroke lands
correctly, but the caret is then yanked to the end — so continued mid-string
insertion/deletion requires re-clicking after every character.

**Impact:** Local UX only; the stored value is always correct; no data or security
impact.

**Fix:** Preserve and restore the input’s real `selectionStart`/`selectionEnd` across
re-render instead of hard-coding to `query.length`, or update the filtered list in place
rather than re-rendering on each keystroke.

### F8 — Cross-tab concurrent edits are last-writer-wins (Info)

**Where:** `app.js` storage listener ~2538–2542 (toast only); `save()` ~479–500
(wholesale `setItem(JSON.stringify(data))` at 483); `toast()` auto-dismiss ~2600 ms.

**What/why:** Two tabs open on the same workspace each hold independent in-memory state;
the storage event only shows a non-blocking toast (“Reload before making more edits”)
with no re-read, merge, or lock. A stale tab’s later `save()` overwrites a fresher tab’s
committed workspace in full; the clobbered tab saw only a transient toast that may have
auto-dismissed.

**Impact:** Silent local data loss, but same-origin/same-user only (no attacker or
shared-file vector). Note: this window is not currently documented.

**Fix:** On the storage event, re-read/merge (or block saving until reload) in the stale
tab; at minimum make the warning a persistent banner rather than a ~2.6 s toast.

### F9 — Dirty-state indicator is not a live region (Info)

**Where:** `app.js:723` (`<span class="save-state …">` with no `aria-live`/`role`);
`markDirty()` ~508–518 mutates `textContent` silently.

**What/why:** The persistent “Unsaved changes” indicator is not an ARIA live region, so
a screen-reader user is not notified when the workspace becomes dirty (WCAG 2.1 SC 4.1.3
gap). Verification refuted the more serious framing of this: a **save failure** already
fires a `role="alert"` toast (`save()` ~488–498 → `toast(…, "error")`) and rolls the
in-memory data back to `previous`, so the “silent save failure → data loss” scenario
does not occur. Only the benign dirty transition is unannounced — hence info.

**Fix:** Add `role="status" aria-live="polite"` (`assertive` for the error case) and
`aria-atomic="true"` to the `.save-state` span.

## What is done well (verified)

These documented claims were checked against the code (and, where noted, at runtime) and
**hold**:

**Injection / XSS**
- Every user-controlled value is escaped via a central `escapeHtml`/`escapeSvgText`
  before reaching `innerHTML`/`insertAdjacentHTML` sinks, across all views, the import
  wizard (file name, sheet names, headers, preview cells, diagnostics), the modal, and
  form-field helpers. A live probe injecting `<img onerror>`/`<svg onload>`/`<script>`/
  `javascript:` payloads into **262** workspace fields and rendering every view plus a
  generated report produced **zero** live elements and **zero** handler executions —
  payloads appeared only as escaped text.
- Word/HTML/print exports escape all content even though those documents run without the
  app CSP; markdown inline formatting emits only `<strong>`/`<code>` after escaping.
- Evidence source URLs are constrained to `http`/`https`; attachment data URLs are
  validated and non-executable.

**CSP / privacy / supply chain**
- `script-src 'self'` with **no** `unsafe-inline`, `connect-src 'none'`, `object-src
  'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`,
  `img-src 'self' data: blob:`. A live clean-load captured **zero** third-party requests
  and **zero** console/page errors — only same-origin assets. Referrer suppression is
  set; no cookies/analytics/fonts/CDNs are used anywhere.
- SheetJS is bundled locally (not from a CDN) and pinned to **0.20.3**, which is *past*
  both headline SheetJS CVEs (prototype pollution fixed in 0.19.3; ReDoS fixed in
  0.20.2), so no published advisory applies.

**Spreadsheet / ZIP import**
- Row (2,000), column (100), total-cell (100,000), and per-cell (10,000-char) caps are
  enforced; the row cap is applied *during* parse via SheetJS `sheetRows`, so a tall
  sheet cannot exceed it after a truncated parse.
- ZIP64 and encrypted workbooks are rejected; entry-count (2,000) and worksheet (50)
  limits enforced; formulas are never evaluated; `bookVBA:false` (and `vbaraw` deleted)
  so macros never run; `cellHTML:false`; a fresh disposable worker per import, terminated
  on a 20 s timeout; 5 MB file cap enforced before parse.
- Hidden/very-hidden worksheets are unavailable and hidden rows/columns in the imported
  range are rejected.
- Imports are atomic and validate-before-replace, with a recovery snapshot created
  immediately before commit; a rejected import leaves the workspace unchanged.

**JSON workspace import**
- No prototype-pollution sink exists (object spread copies `__proto__` as an own data
  property rather than invoking the setter); IDs are bounded to a conservative character
  set and cannot reach HTML/DOM sinks; duplicate IDs, cross-pursuit links, and asymmetric
  evidence/criterion links are rejected; legacy workspaces are migrated before final
  validation without throwing.

**Persistence / recovery**
- `save()` catches `QuotaExceededError`, rolls back in-memory data, and surfaces a
  visible save-error state; `loadWorkspace()` fails safe to the seed on malformed/tampered
  stored JSON rather than crashing; snapshots are bounded (newest 8 retained; report
  visual snapshots capped at 64 KB).

**Engine correctness**
- CPI is a bounded 0–100 index with divide-by-zero protection; `numericScore` accepts
  only 1–5 and turns anything else into `null`; missing values are labeled **Unknown**
  and never silently treated as zero; equal inputs on the same day and version produce an
  identical report body. (The `NaN%` case in F5 is the one place a bound is not enforced,
  and only via an unvalidated imported field.)

**Accessibility (beyond F2/F9)**
- Each of the 8 chart types emits a real semantic `<table>` alternative and the SVG is
  exposed as `role="img"` with an accessible name/description (not silently
  `aria-hidden`); meaning is conveyed with redundant labels/markers, not colour alone;
  the skip link targets a focusable `#content`; modals manage focus and close on Escape;
  form controls are programmatically labelled; document language is declared. Body text
  contrast is 16.8:1 and secondary/muted text is 4.85–5.24:1 (passes AA).

## Notes and limitations

- Findings F3’s three effects and F4’s exploitability were narrowed during adversarial
  verification; severities in this report reflect the verified (corrected) values, not the
  initial finder estimates.
- The live probes ran against a local static server serving the repository at the same
  sub-path as production; results should match GitHub Pages except for host response
  headers (relevant only to F6).
- This audit reviewed the current source on the audit branch; it did not attempt runtime
  fuzzing of the SheetJS binary parser beyond the ZIP preflight and inflate-path analysis.
