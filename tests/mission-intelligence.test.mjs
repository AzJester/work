import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = resolve(root, "mission-intelligence");
const page = readFileSync(resolve(dir, "index.html"), "utf8");
const css = readFileSync(resolve(dir, "styles.css"), "utf8");
const js = readFileSync(resolve(dir, "app.js"), "utf8");
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");
const all = page + "\n" + css + "\n" + js;
const text = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ");

test("the page publishes at its own route, noindexed, and is wired into the deploy, the library and the README", () => {
  assert.match(page, /<title>Astrion · Agentic AI for the mission<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/mission-intelligence\/">/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\smission-intelligence\s[^\n]*_site\//);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/mission-intelligence\/"/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/mission-intelligence\//);
  assert.match(readme, /\| `mission-intelligence\/` \|/);
});

test("the page is short and simple: six bands, one visual, short copy", () => {
  const main = page.slice(page.indexOf('<main id="main">'), page.indexOf("</main>"));
  const sections = [...main.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]);
  assert.equal(sections.length, 6, "six bands");
  assert.deepEqual(sections.map(c => c.split(" ")[0]), ["light", "dark", "light", "dark", "light", "dark"], "light and dark bands alternate");
  assert.match(page, /<h1 id="hero-title" class="display">Agentic AI for the mission\.<\/h1>/);
  for (const heading of ["Agents that retrieve, reason, verify and hand off.", "Four kinds of agents.", "Agents recommend. People decide.", "Fielded where it counts.", "Bring one question. We bring the agents."]) assert.ok(page.includes(heading), `heading: ${heading}`);
  assert.equal((page.match(/<canvas/g) || []).length, 1, "one visual");
  assert.equal((page.match(/<img\b/g) || []).length, 2, "only the two wordmarks");
  assert.doesNotMatch(page, /<video|<dialog|<details|<form|<select|<textarea/, "no demos, forms or disclosures");
  assert.ok(text.split(" ").length < 520, `page copy stays short (${text.split(" ").length} words)`);
  assert.equal((page.match(/<li\b/g) || []).length, 7, "four agents and three human-in-the-loop lines");
});

test("the copy names no competitor, avoids the banned vocabulary and has no em dashes", () => {
  assert.doesNotMatch(all, /noda/i);
  for (const word of ["delve", "intricate", "tapestry", "interplay", "foster", "garner", "underscore", "pivotal", "showcase", "multifaceted", "nuanced", "landscape", "comprehensive"]) assert.doesNotMatch(text, new RegExp(`\\b${word}`, "i"), `banned word: ${word}`);
  assert.doesNotMatch(all, /—|&mdash;|&#(?:8212|x2014);/i);
  assert.doesNotMatch(all, /Verdana|Obvia|442c81/i);
});

test("the brand kit fonts, outlined wordmarks and website palette are used and self-hosted", () => {
  for (const face of ["archivo-web-01", "archivo-web-02", "archivo-web-03", "space-grotesk-web-01", "space-grotesk-web-02", "space-grotesk-web-03", "jetbrains-mono-web-01", "jetbrains-mono-web-02", "jetbrains-mono-web-03", "jetbrains-mono-web-04", "jetbrains-mono-web-05", "jetbrains-mono-latin"]) {
    assert.ok(css.includes(`assets/fonts/${face}.woff2`), `font face: ${face}`);
    assert.ok(existsSync(resolve(dir, "assets/fonts", `${face}.woff2`)), `font file: ${face}`);
  }
  assert.equal((css.match(/@font-face/g) || []).length, 12);
  for (const token of ["--void: oklch(12.1% .0039 245.47)", "--carbon: oklch(15.82% .0072 258.37)", "--gunmetal: oklch(22.12% .015 261.62)", "--bone: oklch(94.52% .0081 98.88)", "--steel: oklch(64.91% .016 264.46)", "--ion: oklch(78.56% .1345 216.5)", "--flare: oklch(97.57% .0288 205.5)"]) assert.ok(css.includes(token), `palette token: ${token}`);
  assert.match(page, /<header class="site-header">[\s\S]*?assets\/media\/wordmark-dark\.svg/, "dark wordmark on the light header");
  assert.match(page, /<footer class="site-footer">[\s\S]*?assets\/media\/wordmark-light\.svg/, "light wordmark on the dark footer");
  assert.match(css, /\.wordmark-text \{ font-family: var\(--grotesk\); font-weight: 400; text-transform: uppercase; letter-spacing: \.32em; \}/);
  assert.doesNotMatch(all, /@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  assert.doesNotMatch(page, /<script[^>]+src="(?!app\.js")/);
});

test("every local asset exists, remote links stay on Astrion, and in-page anchors resolve", () => {
  const refs = new Set();
  for (const match of all.matchAll(/(?:src|href)="(assets\/[^"]+|styles\.css|app\.js)"/g)) refs.add(match[1]);
  for (const match of css.matchAll(/url\("?(assets\/[^")]+)"?\)/g)) refs.add(match[1]);
  assert.ok(refs.size >= 16, `expected the fonts, wordmarks, icon, stylesheet and script (${refs.size})`);
  for (const ref of refs) assert.ok(existsSync(resolve(dir, ref)), `missing asset ${ref}`);
  for (const [url] of all.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(/^https:\/\/(?:azjester\.github\.io\/work\/mission-intelligence\/|astrion\.us(?:\/|$))/.test(url), `remote reference ${url}`);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|gtag|dataLayer/);
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `dangling anchor #${target}`);
  assert.match(page, /mailto:communications@astrion\.us/);
});

test("the script parses and only draws the globe and reveals sections", () => {
  assert.doesNotThrow(() => new Script(js, { filename: "app.js" }));
  assert.match(js, /getElementById\("orb"\)/);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /IntersectionObserver/);
  assert.ok(js.split("\n").length < 140, "the script stays small");
  assert.match(page, /<script src="app\.js" defer><\/script>/);
  for (const query of ["@media (max-width: 62em)", "@media (max-width: 40em)", "@media (prefers-reduced-motion: reduce)"]) assert.ok(css.includes(query), query);
  assert.match(page, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  for (const image of page.match(/<img\b[^>]*>/g)) assert.match(image, /\balt="/);
});
