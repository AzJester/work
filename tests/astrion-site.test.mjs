import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

import { MISSION_SEGMENTS } from "../solutions-architect/engine.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const page = readFileSync(resolve(root, "astrion-site/index.html"), "utf8");
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");
const landing = readFileSync(resolve(root, "astrion/index.html"), "utf8");
const decode = value => value.replace(/&amp;/g, "&").replace(/<br>/g, " ").replace(/\s+/g, " ").trim();

test("the review site publishes at its own route without replacing the earlier Astrion page", () => {
  assert.match(page, /<title>Astrion · Missions are won at the seams<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion-site\/">/);
  assert.match(page, /property="og:url" content="https:\/\/azjester\.github\.io\/work\/astrion-site\/"/);
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion-site\s[^\n]*_site\//);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion\s[^\n]*_site\//);
  assert.match(landing, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion\/">/);
});

test("the hero uses one coherent, lightweight looping scene", () => {
  assert.match(page, /<section id="top" class="hero">/);
  assert.match(page, /<video id="hero-video" class="hero-motion" poster="assets\/hero-poster\.webp" autoplay muted loop playsinline preload="none"/);
  assert.equal((page.match(/<source data-src="assets\/hero-loop\.mp4" type="video\/mp4">/g) || []).length, 1);
  assert.doesNotMatch(page, /hero-video-buffer|hero-rock-island|hero-beacon|beacon-pulse|transitionHeroVideo/);
  assert.match(page, /<h1 class="display">Missions are won<br>at the seams\.<\/h1>/);
  assert.match(page, /Astrion turns field intelligence into tested, integrated, and trusted capability from Orchestration to Edge/);
  assert.match(page, /\.hero-in \{[^}]*justify-content: flex-end/);
});

test("the desktop navigation uses the reference-style disclosure panels", () => {
  for (const [label, id] of [["Missions", "missions-panel"], ["Orchestration", "orchestration-panel"], ["Edge", "edge-panel"], ["Company", "company-panel"]]) {
    assert.match(page, new RegExp(`<button[^>]+data-panel="${id}"[^>]+aria-expanded="false"[^>]+>${label}<\\/button>`));
    assert.match(page, new RegExp(`<section class="nav-panel" id="${id}" hidden>`));
  }
  assert.match(page, /<a href="#field-intelligence">Tech<\/a>/);
  assert.match(page, /class="header" id="header"/);
  assert.match(page, /\.header\.scrolled, \.header\.panel-open \{[^}]*backdrop-filter: blur/);
});

test("the six mission pillars use the canonical names and supplied descriptions", () => {
  const names = [...page.matchAll(/class="mission-tab"[\s\S]*?<span class="n">\d{2}<\/span><span class="name">([\s\S]*?)<\/span>/g)].map(match => decode(match[1]));
  assert.deepEqual(names, MISSION_SEGMENTS.map(segment => segment.name));
  for (const id of ["iamd", "lifecycle-cyber", "ldawif", "space", "cip", "lunar"]) assert.match(page, new RegExp(`<li id="${id}">`));
  for (const phrase of [
    "including ballistic missiles, cruise missiles, hypersonic weapons, and unmanned aircraft systems",
    "offensive and defensive cyberspace operations, and cryptologic capabilities",
    "Integrated employment of multi-domain autonomous systems",
    "while denying the same to adversaries",
    "recover from threats and hazards to the U.S. Homeland",
    "enduring human and robotic presence on and around the Moon",
  ]) assert.ok(page.includes(phrase), `mission description drifted: ${phrase}`);
  assert.match(page, /<a class="textlink" href="\.\.\/astrion-division\/ldawif\/">Explore the division<\/a>/);
});

test("every mission pillar includes the requested capability tags", () => {
  for (const tag of [
    "Ballistic", "Cruise", "Hypersonic", "Unmanned aircraft",
    "Weapon system testing", "Lifecycle", "Cyberspace operations", "Cryptologic",
    "Detect", "Identify", "Track", "Defeat", "Autonomy",
    "Space superiority", "In, from, and to space", "Freedom of action",
    "Prevent", "Respond", "Recover",
    "Transport", "Power", "Communications", "Habitation", "In-situ resources",
  ]) assert.match(page, new RegExp(`<li>${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/li>`, "i"), `missing capability tag: ${tag}`);
});

test("the page mirrors the reference's image-led section architecture", () => {
  const main = page.slice(page.indexOf('<main id="main">'), page.indexOf("</main>"));
  const ids = [...main.matchAll(/<section id="([a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["top", "problem", "missions", "field-intelligence", "orchestration", "edge", "proof", "intelligence", "careers"]);
  for (const asset of ["space-mission.png", "artemis-lunar-v2.webp", "field-intelligence.png", "edge-system.png", "hero-poster.webp", "system-sensor-v2.webp", "system-command-v2.webp", "system-platform-v2.webp", "system-effector-v2.webp", "mission-orchestration-v2.webp"]) assert.ok(page.includes(`assets/${asset}`), `${asset} is used`);
  for (const heading of ["The systems exist.", "Already inside", "The field", "Change the", "Intelligence,", "What the field", "The mission is", "From the field.", "Live the mission."]) assert.ok(page.includes(heading), `reference section retained: ${heading}`);
});

test("all fonts, motion media, and imagery are self-contained", () => {
  const refs = [...new Set([
    ...[...page.matchAll(/(?:src|href|poster|data-src)="(assets\/[^"]+)"/g)].map(match => match[1]),
    ...[...page.matchAll(/url\("(assets\/[^"]+)"\)/g)].map(match => match[1]),
  ])];
  assert.ok(refs.length >= 12, "expected the local fonts, motion media, images, icons, and logo");
  for (const ref of refs) assert.ok(existsSync(resolve(root, "astrion-site", ref)), `missing asset ${ref}`);
  for (const face of ["Archivo-Variable", "JetBrainsMono-400", "JetBrainsMono-500", "JetBrainsMono-600"]) assert.ok(page.includes(`assets/fonts/${face}.woff2`));
  assert.doesNotMatch(page, /<script[^>]+src=/);
  assert.doesNotMatch(page, /@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  const allowedUrl = url => url.startsWith("https://azjester.github.io/work/astrion-site/") || /^https:\/\/(?:careers\.)?astrion\.us(?:\/(?:contact-us\/?)?)?$/.test(url);
  for (const [url] of page.matchAll(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(allowedUrl(url), `remote reference ${url}`);
});

test("the hero ships one compressed scene and no discarded composite layers", () => {
  const heroLoop = resolve(root, "astrion-site/assets/hero-loop.mp4");
  assert.ok(statSync(heroLoop).size < 2_500_000, "hero loop stays below 2.5 MB");
  for (const discarded of ["hero-video.mp4", "hero-rock-island-overlay-v4.webp", "hero-coastal-defense-v2.webp", "edge-hero.png"]) {
    assert.equal(existsSync(resolve(root, "astrion-site/assets", discarded)), false, `${discarded} was removed`);
  }
});

test("the design keeps the reference palette, typography, and responsive safeguards", () => {
  for (const token of [
    "--void: oklch(12.1% .0039 245.47)", "--carbon: oklch(15.82% .0072 258.37)", "--secondary: oklch(22.12% .015 261.62)",
    "--fg: oklch(94.52% .0081 98.88)", "--muted-fg: oklch(64.91% .016 264.46)", "--primary: oklch(78.56% .1345 216.5)",
    "--container: 1400px", '--font-sans: "Archivo", system-ui, sans-serif', '--font-mono: "JetBrains Mono", ui-monospace, monospace',
  ]) assert.ok(page.includes(token), `missing design token: ${token}`);
  assert.match(page, /@media \(max-width: 720px\)/);
  assert.match(page, /@media \(max-width: 430px\)/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(page, /Verdana|Obvia|442c81/i);
  assert.doesNotMatch(page, /—|&mdash;|&#(?:8212|x2014);/i);
});

test("interaction and accessibility contracts are present", () => {
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /<nav class="nav" aria-label="Primary">/);
  assert.match(page, /<nav class="footer-nav" aria-label="Footer">/);
  assert.equal((page.match(/role="tab"/g) || []).length, 6);
  assert.equal((page.match(/role="tabpanel"/g) || []).length, 6);
  assert.match(page, /event\.key==='ArrowDown'\|\|event\.key==='ArrowRight'/);
  assert.match(page, /event\.key==='Tab'&&menu\.classList\.contains\('open'\)/);
  assert.match(page, /event\.key==='Escape'/);
  assert.match(page, /main\.setAttribute\('inert',''\)/);
  assert.match(page, /html\.still \.reveal/);
  assert.match(page, /class="scroll-progress"/);
  assert.match(page, /requestAnimationFrame\(renderScroll\)/);
  assert.match(page, /\.orchestration-legend/);
  assert.doesNotMatch(page, /class="counter"/);
  assert.match(page, /function placeMissionPanel\(index\)/);
  assert.match(page, /function scrollToTarget\(target\)/);
});

test("the catalog and README retain both Astrion routes", () => {
  assert.match(hub, /title: "Astrion company site",[\s\S]{0,600}liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion-site\/"/);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion\/"/);
  assert.match(readme, /### → https:\/\/azjester\.github\.io\/work\/astrion-site\//);
  assert.match(readme, /### → https:\/\/azjester\.github\.io\/work\/astrion\//);
});

test("inline scripts parse", () => {
  for (const [, body] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(body);
});
