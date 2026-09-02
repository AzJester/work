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
  assert.ok(assetRefs.length >= 7, "expected the logo, icons, and web fonts to be referenced");
  for (const ref of assetRefs) assert.ok(existsSync(resolve(root, "astrion", ref)), `missing asset ${ref}`);
  for (const weight of ["Regular", "Medium", "SemiBold", "Bold"]) {
    assert.ok(page.includes(`assets/fonts/Archivo-${weight}.woff2`), `Archivo ${weight} is self-hosted`);
  }
  assert.doesNotMatch(page, /<script[^>]+src=/, "no external scripts");
  assert.doesNotMatch(page, /<link[^>]+href="https?:\/\/(?!azjester\.github\.io\/work\/astrion\/")/, "no external stylesheets or fonts");
  assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic|cdn\./i);

  const external = [...new Set([...page.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(match => match[1]))]
    .filter(url => !url.startsWith("https://azjester.github.io/work/astrion/"));
  assert.ok(external.length > 0);
  for (const url of external) assert.match(url, /^https:\/\/astrion\.us\/?$/, `unexpected external link ${url}`);

  const socialCard = readFileSync(resolve(root, "astrion/assets/og-card.png"));
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
  assert.match(page, /property="og:image:width" content="1200"/);
  assert.match(page, /property="og:image:height" content="630"/);
});

test("the page follows the 2026 brand standards", () => {
  assert.match(page, /<p class="eyebrow">Defend This World\. Build the Next\.<\/p>/, "slogan used verbatim");
  assert.match(page, /<h1>Built for the <span class="hl">outcome\.<\/span><\/h1>/, "approved campaign headline");
  assert.equal((page.match(/@font-face \{ font-family: "Archivo"/g) || []).length, 4);
  assert.match(page, /--font: "Archivo", Arial, Helvetica, sans-serif;/);
  assert.doesNotMatch(page, /Verdana|Obvia/i, "retired typefaces");
  assert.doesNotMatch(page, /442c81/i, "Astrion Force is logo-only under the 2026 standards");
  assert.doesNotMatch(page, /—/, "no em dashes in brand copy");
  assert.doesNotMatch(page, /Be the Difference|Results with Impact|Always On/, "retired taglines");
  for (const hex of ["#101820", "#222230", "#1E2436", "#F1E9DB", "#DDDDDD", "#BDBDBD", "#FC5442", "#FFAF2E", "#29AAE1", "#1ED872", "#4DD3F7", "#9382F9"]) {
    assert.ok(page.includes(hex), `palette color ${hex} is defined`);
  }
  assert.match(page, /--gradient: linear-gradient\(90deg, var\(--refraction\) 0%, var\(--daylight\) 50%, var\(--zenith\) 100%\);/);
  assert.match(page, /<img src="assets\/astrion-logo-white\.png" alt="Astrion" width="176" height="30"/, "white logo is the default on dark");
});

test("accessibility and motion affordances match the division page", () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(page, /html\.js \.reveal \{ opacity: 0; transform: translateY\(18px\); \}/,
    "reveal hiding is gated on JavaScript so content stays visible without it");
  assert.match(page, /<div class="hero-terrain" aria-hidden="true">/);
  assert.match(page, /<div class="eval hud" role="img" aria-label="/);
  const anchors = [...new Set([...page.matchAll(/href="#([^"]+)"/g)].map(match => match[1]))];
  assert.ok(anchors.includes("segments") && anchors.includes("contact"));
  for (const id of anchors) assert.ok(page.includes(`id="${id}"`), `in-page link target #${id} exists`);
  assert.equal((page.match(/<h1>/g) || []).length, 1);
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
