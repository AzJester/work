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
const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];
const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

const decode = value => value
  .replace(/&amp;/g, "&")
  .replace(/&middot;/g, "·")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

// the Astrion Brand Guide 2026 palette: ten values, nothing tinted, shaded, or interpolated out of them
const PALETTE = {
  "--marine-blue": "#102A47", "--ion-cyan": "#33C7EB", "--flare": "#DEFBFD",
  "--carbon": "#090A0B", "--gunmetal": "#0E0F11", "--graphite": "#1C1E22", "--slate": "#3E3F41",
  "--steel": "#7F848E", "--muted-gray": "#8E8E8D", "--bone": "#E7E5DF",
};

const segmentBlock = page.match(/<ol class="segments">([\s\S]*?)<\/ol>\s*<\/div>\s*<\/section>/)[1];
const segmentCards = segmentBlock.split(/<li class="segment reveal" /).slice(1).map(chunk => ({
  id: chunk.match(/^id="([^"]+)"/)[1],
  name: decode(chunk.match(/<h3>([\s\S]*?)<\/h3>/)[1]),
  body: chunk,
  links: [...chunk.matchAll(/<a href="#(sol-[^"]+)">([^<]+)</g)].map(([, id, label]) => ({ id, label: decode(label) })),
}));

const groups = page.split(/<div class="pf-group" /).slice(1).map(chunk => {
  const body = chunk.split(/<\/ol>\s*<\/div>/)[0];
  return {
    id: chunk.match(/^id="([^"]+)"/)[1],
    seg: chunk.match(/data-seg="([^"]+)"/)[1],
    name: decode(chunk.match(/<h3>([\s\S]*?)<\/h3>/)[1]),
    count: chunk.match(/<span class="k pf-count">(\d\d) solution areas<\/span>/)[1],
    rows: body.split(/<li class="sol reveal" /).slice(1).map(row => ({
      id: row.match(/^id="([^"]+)"/)[1],
      title: decode(row.match(/<h4>([\s\S]*?)<\/h4>/)[1]),
      body: row,
    })),
  };
});

test("the company page publishes at a stable directory route", () => {
  assert.match(page, /<title>Astrion · Mission Solutions Portfolio<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion\/">/);
  assert.match(page, /property="og:url" content="https:\/\/azjester\.github\.io\/work\/astrion\/"/);
  assert.match(page, /property="og:image" content="https:\/\/azjester\.github\.io\/work\/astrion\/assets\/og-card\.png"/);
  assert.match(page, /<meta name="robots" content="noindex">/, "review build stays out of search indexes");
  assert.match(page, /<meta name="theme-color" content="#090A0B">/, "theme color is Carbon");
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion\s[^\n]*_site\//,
    "the Pages artifact must copy the astrion/ directory");
});

test("the six company mission segments appear in canonical order with their descriptions", () => {
  assert.deepEqual(segmentCards.map(card => card.name), MISSION_SEGMENTS.map(segment => segment.name));
  assert.deepEqual(segmentCards.map(card => card.id), ["iamd", "lifecycle-cyber", "ldawif", "space", "cip", "lunar"]);

  const descriptions = [
    "against the full spectrum of air and missile threats, including ballistic missiles, cruise missiles, hypersonic weapons, and unmanned aircraft systems",
    "weapon system testing and lifecycle management. The integrated employment of offensive and defensive cyberspace operations, and cryptologic capabilities",
    "synchronized detection, identification, tracking, and defeat capabilities. Integrated employment of multi-domain autonomous systems",
    "freedom of movement and action in, from, and to space for the United States and its allies while denying the same to adversaries",
    "identify, assess, prevent, detect, respond to, mitigate, and recover from threats and hazards to the U.S. Homeland",
    "enduring human and robotic presence on and around the Moon, creating the foundation for expansion deeper into the solar system"
  ];
  const icons = ["air-defense", "cyber-shield", "counter-drone", "satellite", "secure-facility", "lunar"];
  segmentCards.forEach((card, index) => {
    assert.ok(card.body.includes(descriptions[index]), `${card.name} description drifted`);
    assert.match(card.body, new RegExp(`<span class="snum">SEGMENT 0${index + 1}</span>`));
    assert.match(card.body, new RegExp(`<svg class="icon icon-24" aria-hidden="true"><use href="#ast-${icons[index]}"/></svg>`));
    assert.match(card.body, new RegExp(`<span class="k">0${card.links.length} solution areas</span>`), `${card.name} counts its solution areas`);
  });

  const ldawif = segmentCards.find(card => card.id === "ldawif");
  assert.match(ldawif.body, /<a class="btn seglink" href="\.\.\/astrion-division\/ldawif\/">Explore the division/);
  assert.match(page, /<h2 class="display">Six mission segments\. One engineering discipline behind all of them\.<\/h2>/);
  assert.match(page, /<a class="link" href="#segments">Segments<\/a>/);
});

test("the portfolio carries all 21 solution areas from the Mission Solutions Portfolio", () => {
  const expected = {
    "Integrated Air and Missile Defense": ["BMC2", "Sensors & Sensor Fusion", "Effector Solutions"],
    "Lifecycle Management and Cyber Warfare": ["Cyber Warfare", "Test, Evaluation & Training", "Sustainment & Modernization", "Next Generation Weapon Systems"],
    "Layered Defense, Autonomous Warfare & Integrated Fires": ["Layered Defense", "Autonomous Warfare", "Integrated Fires"],
    "Space Warfighting": ["Global Mission Operations", "Space Control", "Space Access", "Space Energy & Wargaming"],
    "Critical Infrastructure Protection": ["Transportation Infrastructure", "Energy Infrastructure", "Defense Industrial Base Infrastructure"],
    "Exploration and Lunar Presence": ["Launch, Landing & Mission Readiness", "Lunar Construction & Surface Infrastructure", "Lunar Autonomy & Surface Operations", "Testing, Modeling, Simulation & Mission Assurance"],
  };
  assert.deepEqual(groups.map(group => group.name), MISSION_SEGMENTS.map(segment => segment.name), "groups follow the canonical segment order");
  assert.deepEqual(Object.fromEntries(groups.map(group => [group.name, group.rows.map(row => row.title)])), expected);
  assert.equal(groups.flatMap(group => group.rows).length, 21);

  groups.forEach((group, index) => {
    assert.equal(Number(group.count), group.rows.length, `${group.name} header count matches its rows`);
    const chip = page.match(new RegExp(`<button type="button" class="chip" data-filter="${group.seg}" aria-pressed="false">[^<]+<span class="n">(\\d\\d)</span></button>`));
    assert.ok(chip, `${group.name} has a filter chip`);
    assert.equal(Number(chip[1]), group.rows.length, `${group.name} chip count matches its rows`);
    // the segment overview links every solution area, in order, to its row in this group
    assert.deepEqual(segmentCards[index].links.map(link => link.id), group.rows.map(row => row.id));
    assert.deepEqual(segmentCards[index].links.map(link => link.label), group.rows.map(row => row.title));
    for (const row of group.rows) {
      assert.match(row.body, /<span class="k">Strategic promise<\/span>\s*<p class="promise">[^<]{20,}<\/p>/, `${row.title} states its promise`);
      assert.match(row.body, /<div class="purpose"><span class="k">Purpose<\/span><p>[^<]{60,}<\/p><\/div>/, `${row.title} states its purpose`);
      assert.match(row.body, /<span class="k">Ways to play<\/span><ul class="plays">(<li>[^<]+<\/li>)+<\/ul>/, `${row.title} lists ways to play`);
    }
  });
  assert.match(page, /<button type="button" class="chip" data-filter="all" aria-pressed="true">All <span class="n">21<\/span><\/button>/);
  assert.match(page, /<p class="mono-meta pf-status" id="pf-status" aria-live="polite">Showing all 21 solution areas<\/p>/);
  // the one-pagers' internal objectives (capture strategy) stay off the public review page
  assert.doesNotMatch(page, /<span class="k">Objective<\/span>|pull through|labor-based support|Capitalize on the/i);
});

test("the page is self-contained: local assets exist and nothing loads from a CDN", () => {
  const assetRefs = [...new Set([
    ...[...page.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]),
    ...[...page.matchAll(/url\("(assets\/[^"]+)"\)/g)].map(match => match[1]),
  ])];
  assert.ok(assetRefs.length >= 8, "expected the logo, imagery, icons, and web fonts to be referenced");
  for (const ref of assetRefs) assert.ok(existsSync(resolve(root, "astrion", ref)), `missing asset ${ref}`);
  for (const font of ["Archivo-latin-wght-normal", "JetBrainsMono-latin-wght-normal"]) {
    assert.match(page, new RegExp(`<link rel="preload" href="assets/fonts/${font}\\.woff2" as="font" type="font/woff2" crossorigin>`), `${font} is preloaded`);
  }
  assert.ok(existsSync(resolve(root, "astrion/assets/fonts/ARCHIVO-LICENSE.txt")));
  assert.ok(existsSync(resolve(root, "astrion/assets/fonts/JETBRAINS-MONO-LICENSE.txt")));
  assert.doesNotMatch(page, /<script[^>]+src=/, "no external scripts");
  assert.doesNotMatch(page, /<link[^>]+href="https?:\/\/(?!azjester\.github\.io\/work\/astrion\/")/, "no external stylesheets or fonts");
  assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic|cdn\./i);
  // every absolute or protocol-relative URL anywhere in the document (attributes, CSS url(), imports)
  const allowedUrl = url => url.startsWith("https://azjester.github.io/work/astrion/") || /^https:\/\/astrion\.us\/?$/.test(url);
  for (const [url] of page.matchAll(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(allowedUrl(url), `remote reference ${url}`);
  assert.doesNotMatch(page, /@import/, "no CSS imports");

  const external = [...new Set([...page.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(match => match[1]))]
    .filter(url => !url.startsWith("https://azjester.github.io/work/astrion/"));
  assert.ok(external.length > 0);
  for (const url of external) assert.match(url, /^https:\/\/astrion\.us\/?$/, `unexpected external link ${url}`);

  const socialCard = readFileSync(resolve(root, "astrion/assets/og-card.png"));
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
  const touchIcon = readFileSync(resolve(root, "astrion/assets/apple-touch-icon.png"));
  assert.equal(touchIcon.readUInt32BE(16), 180);
  assert.match(page, /property="og:image:width" content="1200"/);
  assert.match(page, /property="og:image:height" content="630"/);
});

test("the page follows the Astrion Brand Guide 2026", () => {
  for (const [token, hex] of Object.entries(PALETTE)) assert.ok(style.includes(`${token}: ${hex};`), `palette token ${token} is bound to ${hex}`);
  // every color literal in the stylesheet and the console script is one of the ten
  const allowed = new Set(Object.values(PALETTE).map(hex => hex.toUpperCase()));
  for (const source of [style, ...scripts]) {
    for (const [hex] of source.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) assert.ok(allowed.has(hex.toUpperCase()), `off-palette color ${hex}`);
  }
  assert.doesNotMatch(style, /rgba?\(|hsla?\(/, "no tints: colors come from the palette as is");
  // the prior brand colors and gradients are sunset
  assert.doesNotMatch(page, /1ED872|9382F9|4DD3F7|29AAE1|FFAF2E|FC5442|101820|222230|1E2436|F1E9DB|442c81/i, "sunset palette values");
  assert.doesNotMatch(style, /gradient\(/, "no gradients");
  // square, hairline, no shadow
  assert.doesNotMatch(style, /box-shadow|text-shadow|drop-shadow|filter:/, "no shadows, glows, or filter effects");
  assert.doesNotMatch(style, /clip-path/, "corners are square, not notched");
  for (const [, radius] of style.matchAll(/border-radius: ([^;]+);/g)) assert.match(radius, /^(0|2px)$/, `radius ${radius}: 0 by default, 2px on a tag only`);
  assert.doesNotMatch(page, /shadowBlur/, "the console draws without glow");
  // type: Archivo for display and text, JetBrains Mono for labels and data; never Archivo Display
  assert.match(style, /--font-sans: "Archivo", "Helvetica Neue", Helvetica, Arial, sans-serif;/);
  assert.match(style, /--font-mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;/);
  assert.doesNotMatch(page, /Archivo Display|Verdana|Obvia/i);
  assert.match(style, /\.display \{ font-weight: 800; text-transform: uppercase;/, "headlines are Archivo 800, uppercase");
  // the logo is the supplied Bone lockup, placed, never redrawn
  assert.match(page, /<img src="assets\/astrion-logo-bone\.svg" alt="Astrion" width="159" height="24"/);
  const logo = readFileSync(resolve(root, "astrion/assets/astrion-logo-bone.svg"), "utf8");
  assert.match(logo, /fill="#E7E5DF"/);
  // photography from the approved library only, and never both littoral frames on one page
  const photos = [...new Set([...page.matchAll(/src="assets\/img\/([^"]+)"/g)].map(match => match[1]))];
  assert.deepEqual(photos.sort(), ["desert-ground-station.jpg", "flight-line-night.jpg", "littoral-radar-night.jpg"]);
  assert.doesNotMatch(page, /littoral-radar-station/);
  // voice
  assert.match(page, /<h1 class="display" id="hero-title">Missions are won at the seams\.<\/h1>/);
  assert.doesNotMatch(page, /—|–|&mdash;|&ndash;|&#(?:8212|8211|x2014|x2013);/i, "no em or en dashes in brand copy");
  assert.doesNotMatch(page, /Be the Difference|Always On/, "retired taglines");
  assert.match(page, /Astrion stands at the intersection of innovation and operational reality\. We turn breakthrough ideas into field-ready capability: fast, proven, and mission-informed\./, "positioning statement verbatim");
  // the icon set is not part of the guide, so the page says so
  assert.match(page, /Icons on this page are a provisional set pending Astrion approval\./);
});

test("accessibility and motion affordances", () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /html\.js \.reveal \{ opacity: 0; translate: 0 12px; \}/,
    "reveal hiding is gated on JavaScript so content stays visible without it");
  assert.match(page, /html\.js \.filter \{ display: flex; \}/, "the filter only appears when it can work");
  assert.match(page, /html \{ scroll-behavior: smooth; scroll-padding-top: 88px; \}/, "anchor targets clear the fixed nav");
  assert.match(page, /:focus-visible \{ outline: 2px solid var\(--focus-ring\); outline-offset: 2px; \}/, "focus is a solid ring, not a glow");
  assert.match(page, /\.sr-only \{ position: absolute; width: 1px; height: 1px;/);
  for (const [svg] of page.matchAll(/<svg class="icon[^"]*"[^>]*>/g)) assert.match(svg, /aria-hidden="true"/, "decorative icons are hidden from assistive technology");
  assert.match(page, /<a class="card linkcard reveal" href="\.\.\/astrion-division\/ldawif\/" aria-labelledby="ldawif-card-title ldawif-card-cta">/);
  for (const part of ["eval-bar", "eval-scope", "eval-foot"]) assert.match(page, new RegExp(`<div class="${part}" aria-hidden="true">`), `${part} is presentational inside the role=img console`);
  assert.equal((page.match(/<span class="lc" aria-hidden="true">/g) || []).length, 5, "loop chips are presentational inside the role=img loop");
  assert.doesNotMatch(page, /target="_blank"/, "every astrion.us link behaves the same: same tab, like the division page");
  for (const [, alt] of page.matchAll(/<img src="assets\/img\/[^"]+" alt="([^"]*)"/g)) assert.ok(alt.length > 20, "photographs carry a description");
  const anchors = [...new Set([...page.matchAll(/href="#([^"]+)"/g)].map(match => match[1]))];
  assert.ok(anchors.includes("segments") && anchors.includes("contact") && anchors.includes("portfolio"));
  for (const id of anchors) assert.ok(page.includes(`id="${id}"`), `in-page link target #${id} exists`);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test("the inline scripts parse without a build step", () => {
  assert.ok(scripts.length >= 2);
  for (const body of scripts) assert.doesNotThrow(() => new Script(body));
});

test("the landing page is cataloged in the application library and README", () => {
  assert.match(hub, /title: "Astrion · Mission Segments",[\s\S]{0,600}liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion\/"/);
  assert.match(hub, /title: "Astrion · Mission Segments",[\s\S]{0,800}repoUrl: "https:\/\/github\.com\/AzJester\/work\/tree\/main\/astrion"/);
  assert.match(readme, /## Astrion Company Landing Page/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/astrion\//);
});

test("motion can be paused on the page, not only through the OS setting", () => {
  assert.match(page, /<button type="button" class="btn btn-ghost" id="motion-toggle">Pause motion<\/button>/, "a plain action button whose label carries the state");
  assert.doesNotMatch(page, /id="motion-toggle"[^>]*aria-pressed/, "no second state channel that could contradict the label");
  assert.match(page, /html\.still \{ scroll-behavior: auto; \}/);
  assert.match(page, /classList\.add\('still'\)/, "a stored pause lands before first paint");
  assert.match(page, /if\(!armed\)\{ if\(residual>0\.05 \|\| runT>N\*DT\) armed=true; \}/, "every run arms on time as well as on level");
  assert.match(page, /html\.still \*, html\.still \*::before, html\.still \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{\s*html:not\(\.motion\) \*, html:not\(\.motion\) \*::before, html:not\(\.motion\) \*::after \{ animation: none !important; transition: none !important; \}/,
    "the OS setting silences every animation and transition unless the visitor explicitly resumes");
});

test("company facts match Astrion's own published wording", () => {
  assert.match(page, /Headquartered in Huntsville, Alabama, with Centers of Excellence there, in Washington, DC, and in Burlington, Massachusetts/);
  assert.match(page, /<div class="num">6,000\+<\/div>/, "headcount follows the source: more than 6,000");
  assert.doesNotMatch(page, /Headquartered in Washington/);
  assert.doesNotMatch(page, /One of two Centers of Excellence/);
  assert.match(page, /<span class="k">Headquarters<\/span>\s*<h3>Huntsville, AL<\/h3>/);
  assert.match(page, /Formed from ERC and Oasis Systems, joined by Axient in 2024\./);
  assert.match(page, /<!-- Company facts: astrion\.us\/our-story/, "sources are recorded next to the copy");
  assert.match(division, /<a href="\.\.\/\.\.\/astrion\/">Company<\/a>/, "the division page routes back to the company page");
});
