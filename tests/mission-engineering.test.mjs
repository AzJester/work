import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = resolve(root, "mission-engineering");
const page = readFileSync(resolve(dir, "index.html"), "utf8");
const credits = readFileSync(resolve(dir, "credits.html"), "utf8");
const css = readFileSync(resolve(dir, "styles.css"), "utf8");
const js = readFileSync(resolve(dir, "app.js"), "utf8");
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");
const all = page + "\n" + css + "\n" + js;
const text = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();
const count = pattern => (page.match(pattern) || []).length;

/** Pixel size of a WebP file, read from its header. */
function webpSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 0, 4) + bytes.toString("ascii", 8, 12), "RIFFWEBP", `${file} is not a WebP file`);
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (kind === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") { const packed = bytes.readUInt32LE(21); return [1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff)]; }
  throw new Error(`${file} has an unknown WebP chunk ${kind}`);
}
function folderBytes(folder) {
  let total = 0;
  for (const entry of readdirSync(folder, { withFileTypes: true })) total += entry.isDirectory() ? folderBytes(join(folder, entry.name)) : statSync(join(folder, entry.name)).size;
  return total;
}

test("the page publishes at its own route, noindexed, and is wired into the deploy, the library and the README", () => {
  assert.match(page, /<title>Astrion · Twin · AI-assisted mission engineering<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/mission-engineering\/">/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\smission-engineering\s[^\n]*_site\//);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/mission-engineering\/"/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/mission-engineering\//);
  assert.match(readme, /\| `mission-engineering\/` \|/);
});

test("the page is one hero and nine numbered chapters, in order", () => {
  const main = page.slice(page.indexOf('<main id="main">'), page.indexOf("</main>"));
  const sections = [...main.matchAll(/<section class="[^"]+" id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(sections, ["stage", "method", "provenance", "gate", "rule", "data", "world", "status", "contact"]);
  const index = [...page.matchAll(/<li><a href="#([a-z]+)"><span class="i-n">(\d\d)<\/span><span class="i-t">[^<]+<\/span><\/a><\/li>/g)].map(match => `${match[2]} ${match[1]}`);
  assert.deepEqual(index, ["01 idea", "02 method", "03 provenance", "04 gate", "05 rule", "06 data", "07 world", "08 status", "09 contact"], "the side index lists every chapter");
  for (const label of ["01 / The idea", "02 / How a study runs", "03 / Provenance", "04 / The gate", "05 / The rule", "06 / Mission data", "07 / The real world", "08 / Where Twin stands", "09 / Contact"]) assert.ok(page.includes(`>${label}</p>`), `chapter label: ${label}`);
  assert.equal(count(/<h1\b/g), 1, "one h1");
  assert.match(page, /<h1 id="hero-title" class="lockup">\s*<span class="sr-only">From tool mastery to domain judgment<\/span>/);
  for (const heading of ["Every study takes the same path</h2>", "What a run ledger makes possible</h2>", "Five checks before a run</h2>", "The AI proposes, physics disposes</span>", "Certified runs become training data</h2>", "A data set is only as good as its scenarios</h2>", "The foundation already exists</h2>", "One thin slice, end to end</span>"]) assert.ok(page.includes(heading), `heading: ${heading}`);
  // The giant fitted lines are decoration for sighted readers; each one has a plain-text twin for everyone else.
  const fitted = count(/<span class="lk(?: [^"]*)?" aria-hidden="true">/g);
  assert.equal(fitted, 5, "five fitted display lines");
  assert.equal(count(/<span class="lk(?: [^"]*)?"[^>]*>/g), fitted, "every fitted line is hidden from assistive technology");
  assert.equal(count(/<span class="sr-only">/g), 3, "each fitted heading has a plain-text twin");
});

test("the copy stays short and is about mission engineering", () => {
  assert.ok(text.split(" ").length < 1000, `page copy stays short (${text.split(" ").length} words)`);
  assert.equal(count(/<li class="move">/g), 3, "three moves: describe, certify, replay");
  for (const move of ["Describe", "Certify", "Replay"]) assert.ok(page.includes(`<span class="word-f">${move}</span>`), `move: ${move}`);
  assert.equal(count(/<li class="row reveal">/g), 4, "four things a run ledger makes possible");
  assert.equal(count(/<figure class="domain">/g), 5, "five checks in the gate");
  assert.equal(count(/<li class="reveal"><span>0\d<\/span><p>/g), 3, "three rules");
  assert.equal(count(/<div class="reveal"><dt>/g), 4, "four status numbers");
  assert.equal(count(/<li class="reveal"><span>0\d<\/span><h3>/g), 6, "six points on mission data");
  assert.equal(count(/<figure class="scene(?: scene-wide)? reveal">/g), 4, "four reference scenes");
  assert.match(text, /mission engineering/i);
  assert.doesNotMatch(page, /<dialog|<details|<form|<select|<textarea|<iframe|<input/, "no demos, forms or embeds");
  assert.match(page, /<p class="domains-end"><span>The only path into execution<\/span><\/p>/, "the gate is the only path into execution");
});

test("titles and subtitles carry no closing period", () => {
  const strip = html => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  const grab = pattern => [...page.matchAll(pattern)].map(match => strip(match[1]));
  const titles = [
    ...grab(/<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/g),
    ...grab(/<p class="(?:hero-sub|statement-text|statement-note|lede|lede reveal|label|label reveal|d-a|tagline|domains-end|scene-d|scenes-note reveal)"[^>]*>([\s\S]*?)<\/p>/g),
    ...grab(/<li class="reveal"><span>\d\d<\/span><p>([\s\S]*?)<\/p><\/li>/g),
    ...grab(/<span class="(?:seg|word-f|sr-only|i-t|row-m|brand-sub wordmark-text)"[^>]*>([^<]*)<\/span>/g),
    ...grab(/<dt>([^<]*)<\/dt>/g),
    ...page.match(/<div class="marquee-track" id="marquee-track">([\s\S]*?)<\/div>/)[1].split("<i></i>").map(strip).filter(Boolean),
  ];
  assert.ok(titles.length >= 60, `expected every title and subtitle on the page (${titles.length})`);
  for (const title of titles) assert.doesNotMatch(title, /[.]$/, `a title or subtitle ends with a period: ${title}`);
  // Section subtitles are one phrase each. Item descriptions are sentences and keep their periods.
  assert.match(page, /<p class="hero-sub">AI-assisted mission engineering that a new analyst can use on day one, and that a program office can brief with confidence<\/p>/);
  assert.match(page, /<p class="lede">Cheapest first, and the first failure stops the run<\/p>/);
  // The slogan is two lines with no periods, and the retired tagline is gone.
  assert.match(page, /<p class="tagline"><span>Defend this world<\/span> <span>Build the next<sup>&trade;<\/sup><\/span><\/p>/);
  assert.match(css, /\.tagline span \{ display: block; \}/);
  assert.doesNotMatch(all, /Guaranteed Excellence|Astrion EDGE|Engineering Delivered/i);
  assert.match(page, /<p class="row-d">[^<]+\.<\/p>/);
});

test("the page says what the white paper says, with the Astrion calls to action", () => {
  // Source: the Twin white paper of October 2026. See CLAUDE.md, "Astrion pages follow astrion.us", for the calls to action.
  assert.match(page, /<h2 class="statement-text" id="statement-text" data-words>Make new analysts productive <em>without making them wrong<\/em><\/h2>/);
  assert.match(page, /<p class="statement-text" data-words>Speed alone is a liability<\/p>/);
  assert.match(page, /<p class="statement-note">A wrong number in a decision brief costs more than a slow one<\/p>/);
  // The paper's own answers to "how do you know the AI did not make it up".
  for (const line of ["every number in a run explanation is computed, not recalled", "Retrieval tells an AI what is plausible. The catalog tells the gate what is allowed.", "Fast models report their own uncertainty.", "false rejects, which measure friction, and escapes, which measure lost credibility"]) assert.ok(page.includes(line), `the page carries: ${line}`);
  // Mission data: the owner's direction of 2026-11-20, said with the mechanisms the paper describes.
  assert.deepEqual([...page.matchAll(/<li class="reveal"><span>0\d<\/span><h3>([^<]+)<\/h3>/g)].map(match => match[1]), ["Relevant by construction", "Labels written by physics", "Runs where they add the most", "Every classification level", "Real records beside simulated ones", "Current as models change"]);
  assert.deepEqual([...page.matchAll(/<span class="scene-n">0\d<\/span><h3>([^<]+)<\/h3>/g)].map(match => match[1]), ["Land", "Sea", "Seafloor", "Space"]);
  // astrion.us wording, read again on 2026-11-20: "intelligence-based, government-validated threat models and simulations".
  assert.match(page, /<p class="lede reveal">Astrion threat models are intelligence-based and government-validated<\/p>/);
  // What is built and what comes next stay apart, in plain words.
  assert.match(page, /<p class="proof-note reveal">Built today: [^<]+ Next come the gate, the run ledger and fast surrogate models, then the mission data sets they make possible\./);
  assert.match(page, /<span class="sr-only">The AI proposes, physics disposes<\/span>/, "the rule");
  assert.deepEqual([...page.matchAll(/<a class="btn[^"]*"[^>]*><span>([^<]+)<\/span>/g)].map(match => match[1]), ["Contact Us", "Build The Mission", "Contact Us"], "calls to action");
  assert.deepEqual([...page.matchAll(/<span class="d-n">0\d<\/span><h3>([^<]+)<\/h3>/g)].map(match => match[1]), ["Structural", "Semantic", "Physical", "Doctrinal", "Expert review"], "the five checks, cheapest first");
  const figures = [...page.matchAll(/<div class="reveal"><dt>([^<]+)<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)].map(match => `${match[2].replace(/<[^>]+>/g, "")} ${match[1]}`);
  assert.deepEqual(figures, ["~1,090 Platforms in the validated catalog today", "6 Domains in one synchronized run today", "5 Checks in the gate design", "3 Pieces left to build: the gate, a run ledger and fast surrogate models"]);
  assert.deepEqual([...page.matchAll(/<li class="reveal"><span>0\d<\/span><p>([^<]+)<\/p><\/li>/g)].map(match => match[1]), ["A language model never decides whether an engagement succeeds", "Rules are data the AI cannot edit", "Provenance is an output"], "the three rules");
  assert.deepEqual([...page.matchAll(/<h3 class="row-t">([^<]+)<\/h3>/g)].map(match => match[1]), ["Living analyses", "Brief to evidence", "Guided mission engineering", "Experts that cite their sources"]);
  for (const retired of ["bridge between innovation", "field-ready", "mission-informed", "Field-proven", "Scope a pilot"]) assert.ok(!page.includes(retired), `older wording is not used: ${retired}`);
});

test("the white paper's leadership-only details are not published", () => {
  // The paper was prepared for Astrion leadership and this site is public. Cost, rate, staffing and hardware asks, named programs,
  // named competitors, the author, the schedule and the internal wiki pointer stay out unless the owner says otherwise.
  const published = page + "\n" + credits + "\n" + readFileSync(resolve(root, "README.md"), "utf8").split("## Astrion Twin mission engineering page")[1].split("\n## ")[0];
  for (const held of ["$", "engineer-day", "747", "180K", "360K", "135K", "270K", "AURORA", "GENESIS", "MDA", "Code Metal", "Johns Hopkins", "APL", "Pierru", "Product Owner", "Confluence", "GPU", "workstation", "sprint", "six months", "data rights", "self-hosted"]) {
    assert.ok(!published.includes(held), `leadership-only detail is published: ${held}`);
  }
});

test("the copy names no competitor, avoids the banned vocabulary and has no em dashes", () => {
  assert.doesNotMatch(all, /noda/i);
  for (const word of ["delve", "intricate", "tapestry", "interplay", "foster", "garner", "underscore", "pivotal", "showcase", "multifaceted", "nuanced", "landscape", "comprehensive"]) assert.doesNotMatch(text, new RegExp(`\\b${word}`, "i"), `banned word: ${word}`);
  assert.doesNotMatch(all, /—|&mdash;|&#(?:8212|x2014);/i);
  assert.doesNotMatch(all, /Verdana|Obvia|442c81/i);
});

test("the brand kit fonts and outlined wordmarks are used and self-hosted", () => {
  for (const face of ["archivo-web-01", "archivo-web-02", "archivo-web-03", "space-grotesk-web-01", "space-grotesk-web-02", "space-grotesk-web-03", "jetbrains-mono-web-01", "jetbrains-mono-web-02", "jetbrains-mono-web-03", "jetbrains-mono-web-04", "jetbrains-mono-web-05", "jetbrains-mono-latin"]) {
    assert.ok(css.includes(`assets/fonts/${face}.woff2`), `font face: ${face}`);
    assert.ok(existsSync(resolve(dir, "assets/fonts", `${face}.woff2`)), `font file: ${face}`);
  }
  assert.equal((css.match(/@font-face/g) || []).length, 12);
  assert.match(css, /--sans: Archivo, Arial, sans-serif;/);
  assert.match(css, /--mono: "JetBrains Mono", ui-monospace, monospace;/);
  assert.match(css, /\.wordmark-text \{ font-family: var\(--grotesk\); font-weight: 400; text-transform: uppercase; letter-spacing: \.32em; \}/);
  for (const weight of css.replace(/@font-face \{[^}]*\}/g, "").matchAll(/font(?:-weight)?: (\d{3})\b/g)) assert.ok(Number(weight[1]) >= 300 && Number(weight[1]) <= 700, `display weight ${weight[1]} stays within the kit's 300 to 700`);
  assert.match(page, /<header class="site-header"[^>]*>[\s\S]*?assets\/media\/wordmark-light\.svg[\s\S]*?assets\/media\/wordmark-dark\.svg[\s\S]*?<\/header>/, "the header carries both wordmarks");
  assert.match(css, /body\[data-chrome="light"\] \.wm-light \{ display: none; \}/, "the dark wordmark takes over on the Bone band");
  assert.match(page, /<footer class="site-footer">[\s\S]*?<img class="foot-mark" src="assets\/media\/wordmark-light\.svg" alt="Astrion"/, "the footer ends on the wordmark");
  assert.doesNotMatch(all, /@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  assert.doesNotMatch(page, /<script[^>]+src="(?!app\.js")/);
  assert.equal(count(/<script\b/g), 2, "one inline class switch and the page script");
  assert.doesNotMatch(page, /\sstyle="/, "no inline styles");
});

test("every colour is one of the seven website palette colours", () => {
  for (const token of ["--void: oklch(12.1% .0039 245.47)", "--carbon: oklch(15.82% .0072 258.37)", "--gunmetal: oklch(22.12% .015 261.62)", "--bone: oklch(94.52% .0081 98.88)", "--steel: oklch(64.91% .016 264.46)", "--ion: oklch(78.56% .1345 216.5)", "--flare: oklch(97.57% .0288 205.5)"]) assert.ok(css.includes(token), `palette token: ${token}`);
  const palette = { "#050607": "5,6,7", "#0b0d10": "11,13,16", "#171b22": "23,27,34", "#eeede7": "238,237,231", "#8a8f99": "138,143,153", "#23cef0": "35,206,240", "#e4fbfe": "228,251,254" };
  const hexes = [...(css + js).matchAll(/#[0-9a-f]{3,8}\b/gi)].map(match => match[0].toLowerCase());
  assert.ok(hexes.length >= 7);
  for (const hex of hexes) assert.ok(hex in palette, `hex colour ${hex} is not in the palette`);
  const triples = [...(css + js).matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map(match => `${match[1]},${match[2]},${match[3]}`);
  triples.push(...[...js.matchAll(/"(\d+,\d+,\d+)"/g)].map(match => match[1]));
  assert.ok(triples.length >= 20);
  for (const triple of triples) assert.ok(Object.values(palette).includes(triple), `rgb colour ${triple} is not in the palette`);
  assert.equal((css.match(/oklch\(/g) || []).length, 7, "the palette is declared once");
  assert.match(page, /<meta name="theme-color" content="#050607">/);
});

test("every local asset exists, remote links stay on Astrion, and in-page anchors resolve", () => {
  const refs = new Set();
  for (const match of all.matchAll(/(?:src|href|poster|data-src)="(assets\/[^"]+|styles\.css|app\.js)"/g)) refs.add(match[1]);
  for (const match of page.matchAll(/srcset="([^"]+)"/g)) for (const part of match[1].split(",")) refs.add(part.trim().split(/\s+/)[0]);
  for (const match of css.matchAll(/url\("?(assets\/[^")]+)"?\)/g)) refs.add(match[1]);
  assert.ok(refs.size >= 32, `expected the fonts, artwork, film, wordmarks, icon, stylesheet and script (${refs.size})`);
  for (const ref of refs) assert.ok(existsSync(resolve(dir, ref)), `missing asset ${ref}`);
  const shipped = readdirSync(resolve(dir, "assets/media"));
  for (const file of shipped) assert.ok(refs.has(`assets/media/${file}`), `assets/media/${file} is shipped but never used`);
  for (const [url] of all.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(/^https:\/\/(?:azjester\.github\.io\/work\/mission-engineering\/|astrion\.us(?:\/|$))/.test(url), `remote reference ${url}`);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|gtag|dataLayer|localStorage|document\.cookie/);
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  assert.equal(ids.size, count(/\sid="[^"]+"/g), "ids are unique");
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `dangling anchor #${target}`);
  for (const [, target] of page.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.has(target), `dangling label ${target}`);
  assert.match(page, /mailto:communications@astrion\.us/);
});

test("the domain artwork is shown whole and never larger than it was supplied", () => {
  const names = ["cyber", "atmosphere", "orbit", "maritime", "terrain"];
  const figures = [...page.matchAll(/<div class="domain-art"><img src="assets\/media\/([a-z]+)-480\.webp" srcset="assets\/media\/\1-480\.webp 480w, assets\/media\/\1\.webp 1122w" sizes="[^"]+" alt="[^"]{12,}" loading="lazy" decoding="async" width="1122" height="1402"><\/div>/g)].map(match => match[1]);
  assert.deepEqual(figures, names, "five figures, each with both sizes of its artwork");
  for (const name of names) {
    assert.deepEqual(webpSize(resolve(dir, `assets/media/${name}.webp`)), [1122, 1402], `${name} keeps its supplied size`);
    const [width, height] = webpSize(resolve(dir, `assets/media/${name}-480.webp`));
    assert.equal(width, 480);
    assert.ok(Math.abs(width / height - 1122 / 1402) < 0.002, `${name}-480 keeps the supplied proportions`);
  }
  assert.match(css, /\.domain-art img \{ width: 100%; aspect-ratio: 1122 \/ 1402; \}/);
  for (const rule of css.matchAll(/\.domain[^{}]*\{[^}]*\}/g)) assert.doesNotMatch(rule[0], /object-fit|background-size|clip-path|scale\(/, "nothing crops or stretches the artwork");
  assert.match(css, /\.domain \{ flex: none; width: min\(72vw, 22rem\);/, "the scrolling gallery stays under the supplied width");
  assert.match(css, /\.domains\.pinned \.domain \{ width: calc\(min\(60vh, 1402px\) \* \.8003\);/, "the pinned gallery never draws the artwork above its supplied height");
});

test("the films are muted, load late and only play when the script starts them", () => {
  const videos = page.match(/<video\b[^>]*>/g);
  assert.equal(videos.length, 5, "four reference scenes and the proof film");
  for (const video of videos) {
    for (const attribute of ["muted", "loop", "playsinline", 'preload="none"', 'poster="assets/media/']) assert.ok(video.includes(attribute), `video attribute: ${attribute}`);
    assert.doesNotMatch(video, /autoplay|controls/);
  }
  assert.match(page, /<video id="film" muted loop playsinline preload="none" poster="assets\/media\/field-poster\.webp">/);
  assert.deepEqual([...page.matchAll(/<source data-src="(assets\/media\/[^"]+)" type="(video\/[a-z0-9]+)">/g)].map(match => match[2]), Array(5).fill(["video/webm", "video/mp4"]).flat());
  assert.doesNotMatch(page, /<source src=/, "no film bytes are requested until a band is near");
  for (const file of ["field-loop.webm", "field-loop.mp4"]) assert.ok(statSync(resolve(dir, "assets/media", file)).size < 2_000_000, `${file} stays under 2 MB`);
  for (const scene of ["land", "sea", "seafloor", "space"]) {
    for (const kind of ["webm", "mp4"]) assert.ok(statSync(resolve(dir, "assets/media", `scene-${scene}.${kind}`)).size < 1_600_000, `scene-${scene}.${kind} stays under 1.6 MB`);
    // Each scene shows its poster until its film plays, at the size the film was cut to.
    const [width, height] = webpSize(resolve(dir, `assets/media/scene-${scene}.webp`));
    assert.ok(page.includes(`<img src="assets/media/scene-${scene}.webp" alt=`) && page.includes(`width="${width}" height="${height}"`), `scene-${scene} poster is declared at ${width} by ${height}`);
  }
  assert.match(js, /navigator\.connection && navigator\.connection\.saveData/, "data saver keeps the posters");
  assert.match(js, /const want = filmNear && !RM && !state\.paused/, "reduced motion and the pause switch keep the posters");
  assert.match(js, /const films = \$\$\("video"\)\.filter\(film => \$\("source\[data-src\]", film\)\)/, "every video with waiting sources is a film");
});

test("the script parses, steps aside for reduced motion and works as an enhancement", () => {
  assert.doesNotThrow(() => new Script(js, { filename: "app.js" }));
  assert.match(page, /<html lang="en" class="no-js">/);
  assert.match(page, /<script>\(function\(\)\{var h=document\.documentElement[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?h\.classList\.add\(rm\?'rm':'fx'\);\}\)\(\);<\/script>/, "the class switch runs before first paint");
  assert.match(page, /<script src="app\.js" defer><\/script>/);
  assert.match(js, /const RM = root\.classList\.contains\("rm"\);/);
  assert.match(js, /IntersectionObserver/);
  assert.match(css, /\.rm \*, \.rm \*::before, \.rm \*::after \{ transition: none !important; animation: none !important; \}/, "reduced motion switches transitions off outright, so the script never measures mid-transition");
  // Pinning, the intro and every scroll effect hang off .fx, so the page reads straight down without it.
  for (const rule of [".fx .stage {", ".fx .stage-pin {", ".fx .loop {", ".fx .loader {", ".fx .reveal {", ".fx .word-f {"]) assert.ok(css.includes(rule), `effect is gated: ${rule}`);
  assert.doesNotMatch(css, /^\.(?:stage|stage-pin) \{[^}]*position: sticky/m, "nothing pins without the script");
  assert.match(css, /\.no-js \.word-f \{ --fill: 100%; \}/);
  assert.match(css, /\.lk \{[^}]*container-type: inline-size;/, "fitted lines size themselves from their own width before the script runs");
  for (const query of ["@media not ((min-width: 56.25em) and (min-aspect-ratio: 5/4))", "@media (max-width: 56.25em)", "@media (max-width: 37.5em)", "@media (max-height: 31em)", "@media (hover: hover) and (pointer: fine)"]) assert.ok(css.includes(query), query);
});

test("the page keeps its accessibility basics", () => {
  assert.match(page, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  for (const image of page.match(/<img\b[^>]*>/g)) {
    assert.match(image, /\balt="/, `image needs alt: ${image.slice(0, 60)}`);
    assert.match(image, /\bwidth="\d+" height="\d+"/, `image needs its size: ${image.slice(0, 60)}`);
  }
  for (const canvas of page.match(/<canvas\b[^>]*>/g)) assert.match(canvas, /aria-hidden="true"/);
  assert.equal(count(/<canvas\b/g), 3, "stars, the hero globe and the closing horizon");
  assert.equal(count(/data-motion-toggle/g), 2, "a pause switch in the header and the footer");
  assert.match(page, /<button class="motion" id="motion" type="button" aria-pressed="false" aria-label="Pause motion" data-motion-toggle>/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /:focus-visible \{ outline: 2px solid var\(--ion\); outline-offset: 4px; \}/);
  for (const [, label] of page.matchAll(/<nav class="[^"]*"[^>]*aria-label="([^"]+)"/g)) assert.ok(label.length > 3);
  assert.equal(count(/<nav\b/g), count(/<nav\b[^>]*aria-label="/g), "every nav is named");
  // The marquee is decoration and carries only the slogan. Assistive technology reads the slogan once, in the footer.
  const marquee = page.match(/<div class="marquee" id="marquee" aria-hidden="true">\s*<div class="marquee-track" id="marquee-track">([\s\S]*?)<\/div>\s*<\/div>/)[1];
  const phrases = marquee.split("<i></i>").map(part => part.replace(/<[^>]+>/g, "").replace(/&trade;/g, "").trim()).filter(Boolean);
  assert.deepEqual(phrases, Array(4).fill(["Defend this world", "Build the next"]).flat(), "the marquee carries the slogan, four times over");
  assert.equal((marquee.match(/<span|<i>/g) || []).length % 2, 0, "the marquee has two equal halves to loop on");
  assert.doesNotMatch(all, /Innovation fuels it|Engineering proves it|makes it mission-ready/i);
  assert.equal(count(/Defend this world/g), 5, "four times in the marquee and once in the footer");
});

test("the page stays light", () => {
  assert.ok(Buffer.byteLength(page) < 32_000, `index.html ${Buffer.byteLength(page)}`);
  assert.ok(Buffer.byteLength(css) < 60_000, `styles.css ${Buffer.byteLength(css)}`);
  assert.ok(Buffer.byteLength(js) < 64_000, `app.js ${Buffer.byteLength(js)}`);
  assert.ok(folderBytes(dir) < 13_500_000, `the folder is ${folderBytes(dir)} bytes`);
  assert.deepEqual([...page.matchAll(/<link rel="preload" href="assets\/fonts\/([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(match => match[1]), ["archivo-web-03.woff2", "jetbrains-mono-latin.woff2"], "only the two Latin faces are preloaded");
  const eager = page.match(/<img\b[^>]*>/g).filter(image => !/loading="lazy"/.test(image));
  assert.ok(eager.every(image => /wordmark-(?:light|dark)\.svg/.test(image) || /id="preview-img"/.test(image)), "only the wordmarks load eagerly");
});


test("the page names Astrion alone and never calls the work a concept", () => {
  // Standing instructions from the owner, 2026-11-20. See CLAUDE.md, "The Mission Engineering page names Astrion alone".
  assert.doesNotMatch(page + credits, /concept/i);
  // The two agencies that supplied the reference scenes ask for credit. They are named on credits.html and nowhere on the page.
  for (const name of ["NASA", "USGS", "Geological Survey", "Goddard", "ASTER"]) assert.ok(!page.includes(name), `the page names ${name}`);
  // Every proper name the page prints in a heading, a label or a caption is Astrion's own.
  assert.match(page, /<meta property="og:site_name" content="Astrion">/);
  assert.match(text, /Astrion threat models/);
  assert.doesNotMatch(text, /\b(?:Inc|LLC|Corp|Ltd)\b\.?/, "no company suffix appears in the copy");
});

test("the credits page names the source of every scene and loads nothing but the stylesheet", () => {
  assert.match(credits, /<title>Astrion · Twin · Footage credits<\/title>/);
  assert.match(credits, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(credits, /<script|<video|<iframe|\sstyle="/);
  assert.match(credits, /<link rel="stylesheet" href="styles\.css">/);
  assert.equal(count(/href="credits\.html"/g), 2, "linked from the scenes and from the footer");
  assert.match(page, /<p class="scenes-note reveal">Reference scenes built from measured data <a class="link" href="credits\.html">Footage credits<\/a><\/p>/);
  assert.deepEqual([...credits.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]), ["Land", "Sea", "Seafloor", "Space"], "one entry per scene, in the page's order");
  assert.deepEqual([...credits.matchAll(/<a class="link" href="(https:[^"]+)"/g)].map(match => match[1]), [
    "https://svs.gsfc.nasa.gov/30010/", "https://svs.gsfc.nasa.gov/3827/", "https://www.usgs.gov/media/videos/fly-over-seafloor-san-francisco-bay", "https://svs.gsfc.nasa.gov/30878/",
  ]);
  for (const [url] of credits.matchAll(/https?:\/\/[^"'\s)<]+/g)) assert.ok(/^https:\/\/(?:svs\.gsfc\.nasa\.gov|www\.usgs\.gov)\//.test(url), `remote reference ${url}`);
  // The credit lines are the ones each source page asks for.
  for (const credit of ["NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team", "NASA/Goddard Space Flight Center Scientific Visualization Studio", "U.S. Geological Survey", "NASA's Goddard Space Flight Center"]) assert.ok(credits.includes(`Credit: ${credit}.`), `credit line: ${credit}`);
  assert.match(credits, /does not imply endorsement by NASA or the U\.S\. Geological Survey\./);
  for (const [, ref] of credits.matchAll(/(?:src|href)="(assets\/[^"]+|styles\.css)"/g)) assert.ok(existsSync(resolve(dir, ref)), `missing asset ${ref}`);
  assert.match(credits, /<a class="brand" href="\.\/" aria-label="Back to Twin mission engineering">/);
  assert.match(credits, /<a class="btn btn-line" href="\.\/#world"><span>Back to the page<\/span><\/a>/);
  // Titles and subtitles take no closing period here either.
  const strip = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  for (const [, title] of credits.matchAll(/<(?:h1|h2|p class="label"|p class="lede")[^>]*>([\s\S]*?)<\/(?:h1|h2|p)>/g)) assert.doesNotMatch(strip(title), /[.]$/, `a title ends with a period: ${strip(title)}`);
});
