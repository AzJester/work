import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
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

const text = page
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/g, " ")
  .replace(/\s+/g, " ");

test("the page publishes at its own route, noindexed, without replacing the other Astrion pages", () => {
  assert.match(page, /<title>Astrion Mission Intelligence · AI from intent to effect<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/mission-intelligence\/">/);
  assert.match(page, /property="og:url" content="https:\/\/azjester\.github\.io\/work\/mission-intelligence\/"/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\smission-intelligence\s[^\n]*_site\//, "the Pages artifact copies the folder");
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion-site\s[^\n]*_site\//);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion\s[^\n]*_site\//);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/mission-intelligence\/"/);
  assert.match(hub, /repoUrl: "https:\/\/github\.com\/AzJester\/work\/tree\/main\/mission-intelligence"/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/mission-intelligence\//);
  assert.match(readme, /\| `mission-intelligence\/` \|/);
});

test("the single scrolling page carries every section of the earlier six-page site plus the orchestration layer", () => {
  const main = page.slice(page.indexOf('<main id="main">'), page.indexOf("</main>"));
  const ids = [...main.matchAll(/<section class="section[^"]*" id="([a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["products", "orchestration", "fleet", "architecture", "evidence", "capabilities", "domains", "programs", "evaluation", "pilot"]);
  for (const id of ["sea-hunter", "pami-1", "brainstack", "hero-trace", "ops", "domain-dialog", "pilot-editor"]) assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  for (const heading of [
    "AI that carries <span>intent to effect</span>", "Four places AI already does the work", "Intent in. Effects out. Evidence throughout.",
    "Watch one intent task a mixed fleet", "Inside the AI workflow", "Try an evidence review", "What we build with your team",
    "AI across every domain the force operates in", "Field-proven, on the record", "When the evidence is incomplete", "Scope an <span>AI pilot</span>",
  ]) assert.ok(page.includes(heading), `missing heading: ${heading}`);
  // the stack above the autonomy layer and the human gate
  for (const phrase of ["Adaptive re-planning", "Synchronized effects", "One cross-domain picture", "Vendor-neutral command", "Human-in-the-loop by design", "Integration without modification"]) assert.ok(page.includes(phrase), `missing: ${phrase}`);
  // program evidence figures and sources survive the merge
  for (const phrase of ["42,000", "38,000", "Unmanned Surface Vessel Squadron One", "Netherlands Defense Space Security Centre", "TechEdSat-13", "ntrs.nasa.gov/citations/20230011460"]) assert.ok(page.includes(phrase), `missing: ${phrase}`);
  // the evaluation metrics and the four-step protocol
  for (const phrase of ["6/6", "2/2", "10/10", "Define the review decision.", "Establish reference answers.", "Compare with the current workflow.", "Decide together."]) assert.ok(page.includes(phrase), `missing: ${phrase}`);
});

test("the competitor is never named and the copy avoids the banned vocabulary", () => {
  assert.doesNotMatch(all, /noda/i);
  for (const word of ["delve", "intricate", "tapestry", "interplay", "foster", "garner", "underscore", "pivotal", "showcase", "multifaceted", "nuanced", "landscape", "comprehensive"]) {
    assert.doesNotMatch(text, new RegExp(`\\b${word}`, "i"), `banned word in page copy: ${word}`);
  }
  assert.doesNotMatch(all, /—|&mdash;|&#(?:8212|x2014);/i, "no em dashes");
  assert.doesNotMatch(all, /Verdana|Obvia|442c81/i, "the web build uses the website palette, not the print kit");
});

test("the brand kit fonts, outlined wordmarks and website palette are used and self-hosted", () => {
  for (const face of ["archivo-web-01", "archivo-web-02", "archivo-web-03", "space-grotesk-web-01", "space-grotesk-web-02", "space-grotesk-web-03", "jetbrains-mono-web-01", "jetbrains-mono-web-02", "jetbrains-mono-web-03", "jetbrains-mono-web-04", "jetbrains-mono-web-05", "jetbrains-mono-latin"]) {
    assert.ok(css.includes(`assets/fonts/${face}.woff2`), `font face declared: ${face}`);
    assert.ok(existsSync(resolve(dir, "assets/fonts", `${face}.woff2`)), `font file present: ${face}`);
  }
  assert.equal((css.match(/@font-face/g) || []).length, 12);
  assert.match(css, /font-family: "JetBrains Mono";[\s\S]*?unicode-range: U\+0000-00FF/, "JetBrains Mono has a Latin subset");
  assert.match(css, /\.wordmark-text \{ font-family: "Space Grotesk"[^}]*letter-spacing: \.32em/, "the Space Grotesk wordmark style follows the typography guide");
  for (const token of ["--void: oklch(12.1% .0039 245.47)", "--carbon: oklch(15.82% .0072 258.37)", "--gunmetal: oklch(22.12% .015 261.62)", "--bone: oklch(94.52% .0081 98.88)", "--steel: oklch(64.91% .016 264.46)", "--ion: oklch(78.56% .1345 216.5)", "--flare: oklch(97.57% .0288 205.5)"]) assert.ok(css.includes(token), `palette token: ${token}`);
  assert.match(page, /assets\/media\/wordmark-light\.svg/);
  assert.ok(existsSync(resolve(dir, "assets/media/wordmark-light.svg")));
  assert.ok(existsSync(resolve(dir, "assets/media/wordmark-dark.svg")));
  assert.doesNotMatch(all, /@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  assert.doesNotMatch(page, /<script[^>]+src="(?!app\.js")/, "the only script is the local app.js");
});

test("every local asset the page, stylesheet and script reference exists", () => {
  const refs = new Set();
  for (const match of all.matchAll(/(?:src|href|poster|data-src|srcset)="([^"]+)"/g)) {
    for (const part of match[1].split(",")) {
      const candidate = part.trim().split(/\s+/)[0];
      if (/^(assets\/|styles\.css|app\.js)/.test(candidate)) refs.add(candidate.replace(/[?#].*$/, ""));
    }
  }
  for (const match of css.matchAll(/url\("?(assets\/[^")]+)"?\)/g)) refs.add(match[1]);
  for (const match of js.matchAll(/"assets\/([^"]+)"/g)) if (!match[1].includes("+")) refs.add("assets/" + match[1]);
  assert.ok(refs.size >= 40, `expected the fonts, media, data, brief, stylesheet and script (${refs.size} found)`);
  for (const ref of refs) assert.ok(existsSync(resolve(dir, ref)), `missing asset ${ref}`);
  // images and briefs that the script composes by name
  for (const name of ["terrain", "atmosphere", "maritime", "subsea", "orbit", "cyber", "coastal-trial", "integration-lab", "coastal-unit", "field-test", "engineering-hangar"]) assert.ok(existsSync(resolve(dir, `assets/media/${name}.webp`)), `${name}.webp`);
  for (const [file, limit] of [["assets/media/hero-loop.mp4", 2_500_000], ["assets/media/hero-loop.webm", 2_500_000], ["assets/media/hero.jpg", 600_000]]) assert.ok(statSync(resolve(dir, file)).size < limit, `${file} stays below ${limit} bytes`);
});

test("remote references stay on Astrion and the cited public sources", () => {
  const allowed = url => /^https:\/\/(?:azjester\.github\.io\/work\/mission-intelligence\/|astrion\.us(?:\/|$)|www\.globenewswire\.com\/|www\.defensie\.nl\/|ntrs\.nasa\.gov\/)/.test(url);
  for (const [url] of all.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(allowed(url), `remote reference ${url}`);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|gtag|dataLayer/, "no network calls or analytics");
});

test("in-page links resolve and pilot deep links name a real use case", () => {
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `dangling anchor #${target}`);
  const options = new Set([...page.matchAll(/<option value="([^"]+)">/g)].map(match => match[1]));
  const scenarios = new Set([...all.matchAll(/data-scenario="([a-z-]+)"|(?:scenario|pilot): "([a-z-]+)"/g)].map(match => match[1] || match[2]));
  assert.ok(scenarios.size >= 12, `expected the deep links to cover the use cases (${scenarios.size})`);
  for (const scenario of scenarios) assert.ok(options.has(scenario), `pilot select lacks the "${scenario}" use case`);
  assert.match(page, /<select id="pilot-scenario">\s*<option value="orchestration">/);
  assert.match(page, /mailto:communications@astrion\.us/);
});

test("the script parses and defines the interactive pieces", () => {
  assert.doesNotThrow(() => new Script(js, { filename: "app.js" }));
  for (const name of ["mission-architecture", "evidence-demo", "#ops", "#domain-dialog", "#pilot-scenario", "#menu-button", "IntersectionObserver", "prefers-reduced-motion"]) assert.ok(js.includes(name), `script handles ${name}`);
  for (const key of ["strait", "route", "comms"]) assert.match(js, new RegExp(`${key}: \\{\\s*intent:`), `fleet mission ${key}`);
  assert.match(js, /approve\.addEventListener\("click"/);
  assert.match(js, /disrupt\.addEventListener\("click"/);
  assert.match(page, /<script src="app\.js" defer><\/script>/);
  assert.match(page, /<link rel="stylesheet" href="styles\.css">/);
});

test("responsive and accessibility contracts are present", () => {
  assert.match(page, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /<nav class="site-nav" aria-label="Primary">/);
  assert.match(page, /<button class="menu-button" id="menu-button" type="button" aria-expanded="false" aria-controls="site-menu">/);
  assert.match(page, /<dialog class="domain-dialog" id="domain-dialog" aria-labelledby="dialog-title">/);
  assert.match(page, /<video id="hero-film" class="hero-motion" muted loop playsinline preload="none" poster="assets\/media\/hero-1280\.webp">/);
  assert.match(page, /<source data-src="assets\/media\/hero-loop\.mp4" type="video\/mp4">/);
  for (const query of ["@media (max-width: 75em)", "@media (max-width: 62em)", "@media (max-width: 47.5em)", "@media (prefers-reduced-motion: reduce)"]) assert.ok(css.includes(query), `stylesheet has ${query}`);
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--ion\)/);
  const images = [...page.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
  for (const image of images) assert.match(image, /\balt="/, `image without alt: ${image.slice(0, 80)}`);
});
