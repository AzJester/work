import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
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
  assert.match(page, /<title>Astrion · Agentic AI for the mission<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/mission-intelligence\/">/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\smission-intelligence\s[^\n]*_site\//);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/mission-intelligence\/"/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/mission-intelligence\//);
  assert.match(readme, /\| `mission-intelligence\/` \|/);
});

test("the page is one hero and seven numbered chapters, in order", () => {
  const main = page.slice(page.indexOf('<main id="main">'), page.indexOf("</main>"));
  const sections = [...main.matchAll(/<section class="[^"]+" id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(sections, ["stage", "loop", "agents", "domains", "rule", "proof", "contact"]);
  const index = [...page.matchAll(/<li><a href="#([a-z]+)"><span class="i-n">(\d\d)<\/span><span class="i-t">[^<]+<\/span><\/a><\/li>/g)].map(match => `${match[2]} ${match[1]}`);
  assert.deepEqual(index, ["01 build", "02 loop", "03 agents", "04 domains", "05 rule", "06 proof", "07 contact"], "the side index lists every chapter");
  for (const label of ["01 / What we build", "02 / How every agent works", "03 / The agents", "04 / Where they work", "05 / The rule", "06 / Proof", "07 / Contact"]) assert.ok(page.includes(`>${label}</p>`), `chapter label: ${label}`);
  assert.equal(count(/<h1\b/g), 1, "one h1");
  assert.match(page, /<h1 id="hero-title" class="lockup">\s*<span class="sr-only">Agentic AI for the mission<\/span>/);
  for (const heading of ["Every agent works the same way.", "Four agents at work.", "From seabed to orbit.", "Agents recommend. People decide.", "Field-proven.", "Bring one question."]) assert.ok(page.includes(heading), `heading: ${heading}`);
  // The giant fitted lines are decoration for sighted readers; each one has a plain-text twin for everyone else.
  const fitted = count(/<span class="lk(?: [^"]*)?" aria-hidden="true">/g);
  assert.equal(fitted, 5, "five fitted display lines");
  assert.equal(count(/<span class="lk(?: [^"]*)?"[^>]*>/g), fitted, "every fitted line is hidden from assistive technology");
  assert.equal(count(/<span class="sr-only">/g), 3, "each fitted heading has a plain-text twin");
});

test("the copy stays short and is about agentic AI", () => {
  assert.ok(text.split(" ").length < 640, `page copy stays short (${text.split(" ").length} words)`);
  assert.equal(count(/<li class="move">/g), 3, "three moves: retrieve, reason, review");
  for (const move of ["Retrieve", "Reason", "Review"]) assert.ok(page.includes(`<span class="word-f">${move}</span>`), `move: ${move}`);
  assert.equal(count(/<li class="row reveal">/g), 4, "four agents");
  assert.equal(count(/<figure class="domain">/g), 6, "six domains");
  assert.equal(count(/<li class="reveal"><span>0\d<\/span><p>/g), 3, "three rules");
  assert.equal(count(/<div class="reveal"><dt>/g), 4, "four proof numbers");
  assert.match(text, /agentic AI/i);
  assert.doesNotMatch(page, /<dialog|<details|<form|<select|<textarea|<iframe|<input/, "no demos, forms or embeds");
  assert.match(page, /<p class="domains-end"><span>Illustrative applications<\/span><\/p>/, "the domain examples are labelled as illustrative");
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
  assert.ok(refs.size >= 36, `expected the fonts, artwork, film, wordmarks, icon, stylesheet and script (${refs.size})`);
  for (const ref of refs) assert.ok(existsSync(resolve(dir, ref)), `missing asset ${ref}`);
  const shipped = readdirSync(resolve(dir, "assets/media"));
  for (const file of shipped) assert.ok(refs.has(`assets/media/${file}`), `assets/media/${file} is shipped but never used`);
  for (const [url] of all.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(/^https:\/\/(?:azjester\.github\.io\/work\/mission-intelligence\/|astrion\.us(?:\/|$))/.test(url), `remote reference ${url}`);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|gtag|dataLayer|localStorage|document\.cookie/);
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  assert.equal(ids.size, count(/\sid="[^"]+"/g), "ids are unique");
  for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `dangling anchor #${target}`);
  for (const [, target] of page.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.has(target), `dangling label ${target}`);
  assert.match(page, /mailto:communications@astrion\.us/);
});

test("the domain artwork is shown whole and never larger than it was supplied", () => {
  const names = ["terrain", "atmosphere", "maritime", "subsea", "orbit", "cyber"];
  const figures = [...page.matchAll(/<div class="domain-art"><img src="assets\/media\/([a-z]+)-480\.webp" srcset="assets\/media\/\1-480\.webp 480w, assets\/media\/\1\.webp 1122w" sizes="[^"]+" alt="[^"]{12,}" loading="lazy" decoding="async" width="1122" height="1402"><\/div>/g)].map(match => match[1]);
  assert.deepEqual(figures, names, "six domain figures, each with both sizes of its artwork");
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

test("the proof film is muted, loads late and only plays when the script starts it", () => {
  const video = page.match(/<video\b[^>]*>/)[0];
  for (const attribute of ["muted", "loop", "playsinline", 'preload="none"', 'poster="assets/media/field-poster.webp"']) assert.ok(video.includes(attribute), `video attribute: ${attribute}`);
  assert.doesNotMatch(video, /autoplay|controls/);
  assert.equal(count(/<video\b/g), 1);
  assert.deepEqual([...page.matchAll(/<source data-src="(assets\/media\/[^"]+)" type="(video\/[a-z0-9]+)">/g)].map(match => match[2]), ["video/webm", "video/mp4"]);
  assert.doesNotMatch(page, /<source src=/, "no film bytes are requested until the band is near");
  for (const file of ["field-loop.webm", "field-loop.mp4"]) assert.ok(statSync(resolve(dir, "assets/media", file)).size < 2_000_000, `${file} stays under 2 MB`);
  assert.match(js, /navigator\.connection && navigator\.connection\.saveData/, "data saver keeps the poster");
  assert.match(js, /const want = filmNear && !RM && !state\.paused/, "reduced motion and the pause switch keep the poster");
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
  assert.match(page, /<div class="marquee" id="marquee" aria-hidden="true">[\s\S]*?<\/div>\s*<\/div>\s*<p class="sr-only">Innovation fuels it\. Engineering proves it\. Astrion makes it mission-ready\.<\/p>/, "the marquee line is read once");
});

test("the page stays light", () => {
  assert.ok(Buffer.byteLength(page) < 32_000, `index.html ${Buffer.byteLength(page)}`);
  assert.ok(Buffer.byteLength(css) < 60_000, `styles.css ${Buffer.byteLength(css)}`);
  assert.ok(Buffer.byteLength(js) < 64_000, `app.js ${Buffer.byteLength(js)}`);
  assert.ok(folderBytes(dir) < 6_600_000, `the folder is ${folderBytes(dir)} bytes`);
  assert.deepEqual([...page.matchAll(/<link rel="preload" href="assets\/fonts\/([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(match => match[1]), ["archivo-web-03.woff2", "jetbrains-mono-latin.woff2"], "only the two Latin faces are preloaded");
  const eager = page.match(/<img\b[^>]*>/g).filter(image => !/loading="lazy"/.test(image));
  assert.ok(eager.every(image => /wordmark-(?:light|dark)\.svg/.test(image) || /id="preview-img"/.test(image)), "only the wordmarks load eagerly");
});
