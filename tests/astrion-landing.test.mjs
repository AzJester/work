import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

import { MISSION_SEGMENTS } from "../solutions-architect/engine.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const page = readFileSync(resolve(root, "astrion/index.html"), "utf8");
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");
const division = readFileSync(resolve(root, "astrion-division/ldawif/index.html"), "utf8");

const decode = value => value
  .replace(/&amp;/g, "&")
  .replace(/&middot;/g, "·")
  .replace(/&rarr;/g, "→")
  .replace(/\s+/g, " ")
  .trim();

// each card ends with its glyph, so match through the closing SVG rather than the first nested </li>
const segmentCards = [...page.matchAll(/<li class="segment (s\d) hud reveal" id="([^"]+)">([\s\S]*?<\/svg>\s*<\/div>)\s*<\/li>/g)]
  .map(([, accent, id, body]) => ({ accent, id, body, name: decode(body.match(/<h3>([\s\S]*?)<\/h3>/)[1]) }));

test("the company landing page publishes at a stable directory route", () => {
  assert.match(page, /<title>Astrion · Defend This World\. Build the Next\.<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion\/">/);
  assert.match(page, /property="og:url" content="https:\/\/azjester\.github\.io\/work\/astrion\/"/);
  assert.match(page, /property="og:image" content="https:\/\/azjester\.github\.io\/work\/astrion\/assets\/og-card\.png"/);
  assert.match(page, /<meta name="robots" content="noindex">/, "review build stays out of search indexes");
  assert.match(page, /<meta name="theme-color" content="#101820">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion\s[^\n]*_site\//,
    "the Pages artifact must copy the astrion/ directory");
});

test("the six company mission segments appear in canonical order with their descriptions", () => {
  assert.deepEqual(segmentCards.map(card => card.name), MISSION_SEGMENTS.map(segment => segment.name));
  assert.deepEqual(segmentCards.map(card => card.accent), ["s1", "s2", "s3", "s4", "s5", "s6"]);
  assert.deepEqual(segmentCards.map(card => card.id), ["iamd", "lifecycle-cyber", "ldawif", "space", "cip", "lunar"]);

  const descriptions = [
    "against the full spectrum of air and missile threats, including ballistic missiles, cruise missiles, hypersonic weapons, and unmanned aircraft systems",
    "weapon system testing and lifecycle management. The integrated employment of offensive and defensive cyberspace operations, and cryptologic capabilities",
    "synchronized detection, identification, tracking, and defeat capabilities. Integrated employment of multi-domain autonomous systems",
    "freedom of movement and action in, from, and to space for the United States and its allies while denying the same to adversaries",
    "identify, assess, prevent, detect, respond to, mitigate, and recover from threats and hazards to the U.S. Homeland",
    "enduring human and robotic presence on and around the Moon, creating the foundation for expansion deeper into the solar system"
  ];
  segmentCards.forEach((card, index) => {
    assert.ok(card.body.includes(descriptions[index]), `${card.name} description drifted`);
    assert.match(card.body, new RegExp(`<span class="snum">SEGMENT 0${index + 1}</span>`));
    assert.match(card.body, /<div class="glyph" aria-hidden="true">\s*<svg viewBox="0 0 120 120">/);
    assert.match(card.body, /<ul class="foci">(<li>[^<]+<\/li>){3,}<\/ul>/, `${card.name} lists its focus areas`);
  });

  const division = segmentCards.find(card => card.id === "ldawif");
  assert.match(division.body, /<a class="seglink" href="\.\.\/astrion-division\/ldawif\/">Explore the division/);
  assert.match(page, /<h2>Six mission segments\. One engineering discipline behind all of them\.<\/h2>/);
  assert.match(page, /<a class="link" href="#segments">Mission segments<\/a>/);
});

test("the page is self-contained: local assets exist and nothing loads from a CDN", () => {
  const assetRefs = [...new Set([
    ...[...page.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]),
    ...[...page.matchAll(/url\("(assets\/[^"]+)"\)/g)].map(match => match[1]),
  ])];
  assert.ok(assetRefs.length >= 6, "expected the logo, icons, and web fonts to be referenced");
  for (const ref of assetRefs) assert.ok(existsSync(resolve(root, "astrion", ref)), `missing asset ${ref}`);
  for (const weight of ["Regular", "SemiBold", "Bold"]) {
    assert.ok(page.includes(`assets/fonts/Archivo-${weight}.woff2`), `Archivo ${weight} is self-hosted`);
    assert.match(page, new RegExp(`<link rel="preload" href="assets/fonts/Archivo-${weight}\\.woff2" as="font" type="font/woff2" crossorigin>`),
      `Archivo ${weight} is preloaded: every weight the first screen uses`);
  }
  assert.doesNotMatch(page, /Archivo-Medium|font-weight: 500/, "only the weights the page uses ship");
  assert.doesNotMatch(page, /<script[^>]+src=/, "no external scripts");
  assert.doesNotMatch(page, /<link[^>]+href="https?:\/\/(?!azjester\.github\.io\/work\/astrion\/")/, "no external stylesheets or fonts");
  assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic|cdn\./i);
  // every absolute or protocol-relative URL anywhere in the document (attributes, CSS url(), imports)
  const allowedUrl = url => url.startsWith("https://azjester.github.io/work/astrion/") || /^https:\/\/astrion\.us\/?$/.test(url);
  const withoutDataUris = page.replace(/url\("data:[^"]*"\)/g, "");
  for (const [url] of withoutDataUris.matchAll(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(allowedUrl(url), `remote reference ${url}`);
  assert.doesNotMatch(page, /@import/, "no CSS imports");

  const external = [...new Set([...page.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(match => match[1]))]
    .filter(url => !url.startsWith("https://azjester.github.io/work/astrion/"));
  assert.ok(external.length > 0);
  for (const url of external) assert.match(url, /^https:\/\/astrion\.us\/?$/, `unexpected external link ${url}`);

  const socialCard = readFileSync(resolve(root, "astrion/assets/og-card.png"));
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
  assert.match(page, /property="og:image:width" content="1200"/);
  assert.match(page, /property="og:image:height" content="630"/);
  assert.match(page, /property="og:image:alt" content="Astrion\. Defend This World\. Build the Next\./, "social card carries alt text");
});

test("the page follows the 2026 brand standards", () => {
  const favicon = readFileSync(resolve(root, "astrion/assets/favicon.svg"), "utf8");
  assert.equal((favicon.match(/<path /g) || []).length, 7, "favicon embeds the seven wordmark paths of the stacked logo");
  assert.equal((favicon.match(/<polygon /g) || []).length, 3, "favicon embeds the three mark polygons of the stacked logo");
  assert.match(favicon, /fill="#101820"/);
  const touchIcon = readFileSync(resolve(root, "astrion/assets/apple-touch-icon.png"));
  assert.equal(touchIcon.readUInt32BE(16), 180);
  assert.equal(touchIcon.readUInt32BE(20), 180);
  assert.match(page, /<p class="eyebrow">Defend This World\. Build the Next\.<\/p>/, "slogan used verbatim");
  assert.match(page, /<h1>Built for the <span class="hl">outcome\.<\/span><\/h1>/, "approved campaign headline");
  assert.equal((page.match(/@font-face \{ font-family: "Archivo"/g) || []).length, 3);
  assert.match(page, /--font: "Archivo", Arial, Helvetica, sans-serif;/);
  assert.doesNotMatch(page, /Verdana|Obvia/i, "retired typefaces");
  assert.doesNotMatch(page, /442c81/i, "Astrion Force is logo-only under the 2026 standards");
  assert.doesNotMatch(page, /—|&mdash;|&#(?:8212|x2014);/i, "no em dashes in brand copy");
  assert.doesNotMatch(page, /Be the Difference|Results with Impact|Always On/, "retired taglines");
  const palette = [["--black", "#101820"], ["--midnight", "#222230"], ["--deep", "#1E2436"], ["--alabaster", "#F1E9DB"], ["--platinum", "#DDDDDD"], ["--silver", "#BDBDBD"],
    ["--twilight", "#FC5442"], ["--supernova", "#FFAF2E"], ["--sky", "#29AAE1"], ["--refraction", "#1ED872"], ["--daylight", "#4DD3F7"], ["--zenith", "#9382F9"]];
  for (const [token, hex] of palette) assert.ok(page.includes(`${token}: ${hex};`), `palette token ${token} is bound to ${hex}`);
  const paletteHexes = new Set(palette.map(([, hex]) => hex.toUpperCase()));
  const literals = [...new Set([...page.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(match => match[0].toUpperCase()))];
  for (const hex of literals) assert.ok(paletteHexes.has(hex), `${hex} is not a 2026 palette color`);
  assert.doesNotMatch(page, /\.contact \.panel \.mark \{[^}]*filter:/, "no effects on the logo");
  assert.match(page, /<p class="mono-note">\/\/ Innovation fuels it\. Engineering proves it\. Astrion makes it mission-ready\.<\/p>/, "approach note is an approved statement");
  assert.match(page, /Astrion stands at the intersection of innovation and operational reality\. We turn breakthrough ideas into field-ready capability: fast, proven, and mission-informed\./, "positioning statement verbatim");
  assert.match(page, /--gradient: linear-gradient\(90deg, var\(--refraction\) 0%, var\(--daylight\) 50%, var\(--zenith\) 100%\);/);
  assert.match(page, /<img src="assets\/astrion-logo-white\.png" alt="Astrion" width="1000" height="170"/, "white logo is the default on dark");
});

test("accessibility and motion affordances match the division page", () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /html\.js \.reveal \{ opacity: 0; translate: 0 18px; \}/,
    "reveal hiding is gated on JavaScript so content stays visible without it");
  assert.match(page, /html \{ scroll-behavior: smooth; scroll-padding-top: 84px; \}/, "focus and anchor targets clear the sticky nav");
  assert.match(page, /\.sr-only \{ position: absolute; width: 1px; height: 1px;/);
  assert.doesNotMatch(page, /<span class="arr">/, "decorative arrows are hidden from assistive technology");
  assert.match(page, /<a class="card linkcard hud reveal" href="\.\.\/astrion-division\/ldawif\/" aria-labelledby="ldawif-card-title ldawif-card-cta">/);
  for (const part of ["eval-bar", "eval-scope", "eval-foot"]) assert.match(page, new RegExp(`<div class="${part}" aria-hidden="true">`), `${part} is presentational inside the role=img console`);
  assert.equal((page.match(/<span class="lc" aria-hidden="true">/g) || []).length, 5, "lifecycle chips are presentational inside the role=img loop");
  assert.doesNotMatch(page, /target="_blank"/, "every astrion.us link behaves the same: same tab, like the division page");
  assert.match(page, /<div class="hero-terrain" aria-hidden="true">/);
  assert.match(page, /<div class="eval hud" role="img" aria-label="/);
  const anchors = [...new Set([...page.matchAll(/href="#([^"]+)"/g)].map(match => match[1]))];
  assert.ok(anchors.includes("segments") && anchors.includes("contact"));
  for (const id of anchors) assert.ok(page.includes(`id="${id}"`), `in-page link target #${id} exists`);
  assert.equal((page.match(/<h1>/g) || []).length, 1);
  for (const [, body] of page.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/g)) {
    assert.match(body, /<h[12][ >]/, "every section owns a heading");
  }
  assert.match(page, /<h2 class="proof-label reveal">Track record<\/h2>/);
});

test("the inline scripts parse without a build step", () => {
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2);
  for (const [, body] of scripts) assert.doesNotThrow(() => new Script(body));
});

test("the landing page is cataloged in the application library and README", () => {
  assert.match(hub, /title: "Astrion · Mission Segments",[\s\S]{0,600}liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion\/"/);
  assert.match(hub, /title: "Astrion · Mission Segments",[\s\S]{0,800}repoUrl: "https:\/\/github\.com\/AzJester\/work\/tree\/main\/astrion"/);
  assert.match(readme, /## Astrion Company Landing Page/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/astrion\//);
});

test("motion can be paused on the page, not only through the OS setting", () => {
  assert.match(page, /<button type="button" class="btn btn-ghost" id="motion-toggle">Pause motion<\/button>/, "a plain action button whose label carries the state");
  assert.doesNotMatch(page, /aria-pressed/, "no second state channel that could contradict the label");
  assert.match(page, /html\.still \{ scroll-behavior: auto; \}/);
  assert.match(page, /classList\.add\('still'\)/, "a stored pause lands before first paint");
  assert.match(page, /if\(!armed\)\{ if\(residual>0\.05 \|\| runT>N\*DT\) armed=true; \}/, "every run arms on time as well as on level");
  assert.match(page, /html\.still \*, html\.still \*::before, html\.still \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{\s*html:not\(\.motion\) \*, html:not\(\.motion\) \*::before, html:not\(\.motion\) \*::after \{ animation: none !important; transition: none !important; \}/,
    "the OS setting silences every animation and transition unless the visitor explicitly resumes");
  assert.match(page, /html\.still \.hero-terrain canvas \{ pointer-events: none; cursor: default; \}/);
  assert.match(page, /@media \(min-width: 941px\) and \(hover: hover\) and \(pointer: fine\) \{/, "the survey field is only interactive for a fine pointer that can hover");
  assert.match(page, /if\(motion\.still\(\) \|\| !fine\(e\) \|\| e\.button!==0\) return;/, "touch pans and secondary buttons never drop a survey fix");
});

test("company facts match Astrion's own published wording", () => {
  assert.match(page, /Headquartered in Huntsville, Alabama, with Centers of Excellence there, in Washington, DC, and in Burlington, Massachusetts/);
  assert.match(page, /<div class="num">6,000\+<\/div>/, "headcount follows the source: more than 6,000");
  assert.doesNotMatch(page, /Headquartered in Washington/);
  assert.doesNotMatch(page, /One of two Centers of Excellence/);
  assert.match(page, /<span class="ctag">\/\/ HEADQUARTERS<\/span>\s*<h3>Huntsville, AL<\/h3>/);
  assert.match(page, /Formed from ERC and Oasis Systems, joined by Axient in 2024\./);
  assert.match(page, /<!-- Company facts: astrion\.us\/our-story/, "sources are recorded next to the copy");
  assert.match(division, /<a href="\.\.\/\.\.\/astrion\/">Company<\/a>/, "the division page routes back to the company page");
});
