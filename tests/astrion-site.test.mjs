import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const decode = value => value.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const SECTION_ORDER = ["top", "problem", "missions", "field-intelligence", "orchestration", "edge", "proof", "intelligence", "careers"];

test("the company site publishes at its own route and leaves the landing page alone", () => {
  assert.match(page, /<title>Astrion · Missions are won at the seams<\/title>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion-site\/">/);
  assert.match(page, /property="og:url" content="https:\/\/azjester\.github\.io\/work\/astrion-site\/"/);
  assert.match(page, /property="og:image" content="https:\/\/azjester\.github\.io\/work\/astrion-site\/assets\/og-card\.png"/);
  assert.match(page, /<meta name="robots" content="noindex">/, "review build stays out of search indexes");
  assert.match(page, /<meta name="theme-color" content="#050607">/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion-site\s[^\n]*_site\//, "the Pages artifact must copy the astrion-site/ directory");
  assert.match(pagesWorkflow, /cp -R[^\n]*\sastrion\s[^\n]*_site\//, "the earlier landing page still deploys");
  assert.match(landing, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/astrion\/">/, "the earlier landing page is untouched");
});

test("the hero carries the reference copy and layout", () => {
  assert.match(page, /<section id="top" class="hero">/);
  assert.match(page, /<h1 class="display">Missions are won at the seams\.<\/h1>/);
  assert.match(page, /Astrion turns field intelligence into tested, integrated, and trusted capability from Orchestration to Edge, making complex National Security systems work as one\./);
  assert.match(page, /<a class="btn" href="#contact">Request a brief<\/a>/);
  assert.match(page, /<a class="textlink" href="#careers">Join the mission /);
  assert.match(page, /\.hero-in \{[^}]*justify-content: flex-end/, "copy sits at the bottom of the viewport like the reference");
  assert.match(page, /\.hero-media img \{[^}]*height: 112%;[^}]*object-position: 62% center/, "the media keeps the reference's 112% height and 62% focal point");
  assert.match(page, /<img src="assets\/hero\.jpg" alt=""/);
});

test("the header and menu follow the reference structure", () => {
  for (const [label, target] of [["Missions", "#missions"], ["Tech", "#field-intelligence"], ["Orchestration", "#orchestration"], ["Edge", "#edge"]]) {
    assert.match(page, new RegExp(`<nav class="nav" aria-label="Primary">[\\s\\S]*?<a href="${target}">${label}</a>`), `${label} link in the primary nav`);
  }
  assert.match(page, /<a class="company" href="#proof">Company<\/a>/);
  assert.match(page, /<button class="menu-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="site-menu" aria-label="Open menu">/);
  assert.match(page, /<div class="site-menu" id="site-menu" aria-hidden="true" inert>/, "the menu starts hidden and inert");
  assert.match(page, /\.header\.scrolled \{[^}]*backdrop-filter: blur/, "the header solidifies on scroll");
  assert.match(page, /transition: background-color \.7s ease/, "the reference's 700ms header transition");
});

test("sections appear in the reference order with alternating grounds", () => {
  const ids = [...page.matchAll(/<(?:section|footer) id="([a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, [...SECTION_ORDER, "contact"]);
  const grounds = [...page.matchAll(/<section id="([a-z-]+)" class="section (carbon|void)">/g)].map(match => match[2]);
  assert.deepEqual(grounds, ["carbon", "void", "void", "carbon", "void", "void", "carbon", "void"], "problem, missions, tech, orchestration, edge, proof, intelligence, careers");
  assert.match(page, /<section class="section carbon" aria-labelledby="promise-heading">/, "the unnamed carbon band between edge and proof");
  assert.match(page, /<footer id="contact" class="footer">/);
  assert.match(page, /\.section \{[^}]*scroll-margin-top: 80px/);
});

test("the six mission segments appear in canonical order with their descriptions", () => {
  const rows = [...page.matchAll(/<li id="([a-z-]+)"><span class="n">0(\d)<\/span><h3>([\s\S]*?)<\/h3>/g)]
    .map(([, id, n, name]) => ({ id, n: Number(n), name: decode(name) }));
  assert.deepEqual(rows.map(row => row.name), MISSION_SEGMENTS.map(segment => segment.name));
  assert.deepEqual(rows.map(row => row.id), ["iamd", "lifecycle-cyber", "ldawif", "space", "cip", "lunar"]);
  assert.deepEqual(rows.map(row => row.n), [1, 2, 3, 4, 5, 6]);
  for (const phrase of [
    "including ballistic missiles, cruise missiles, hypersonic weapons, and unmanned aircraft systems",
    "offensive and defensive cyberspace operations, and cryptologic capabilities",
    "Integrated employment of multi-domain autonomous systems",
    "while denying the same to adversaries",
    "recover from threats and hazards to the U.S. Homeland",
    "enduring human and robotic presence on and around the Moon",
  ]) assert.ok(page.includes(phrase), `segment description drifted: ${phrase}`);
  assert.match(page, /<a class="textlink more" href="\.\.\/astrion-division\/ldawif\/">Explore the division/);
});

test("the page is self-contained: local fonts and assets, nothing remote", () => {
  const refs = [...new Set([
    ...[...page.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]),
    ...[...page.matchAll(/url\("(assets\/[^"]+)"\)/g)].map(match => match[1]),
  ])];
  assert.ok(refs.length >= 8, "expected fonts, hero, icons, and the logo to be referenced");
  for (const ref of refs) assert.ok(existsSync(resolve(root, "astrion-site", ref)), `missing asset ${ref}`);
  assert.match(page, /@font-face \{ font-family: "Archivo"; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%;/, "Archivo variable with width and weight axes");
  assert.equal((page.match(/@font-face \{ font-family: "JetBrains Mono"/g) || []).length, 3);
  for (const face of ["Archivo-Variable", "JetBrainsMono-400", "JetBrainsMono-500", "JetBrainsMono-600"]) assert.ok(page.includes(`assets/fonts/${face}.woff2`), `${face} is self-hosted`);
  for (const licence of ["ARCHIVO-LICENSE.txt", "JETBRAINS-MONO-LICENSE.txt"]) assert.ok(existsSync(resolve(root, "astrion-site/assets/fonts", licence)), `${licence} ships with the fonts`);
  assert.doesNotMatch(page, /<script[^>]+src=/, "no external scripts");
  assert.doesNotMatch(page, /@import|fonts\.googleapis|fonts\.gstatic|cdn\./i);
  const allowedUrl = url => url.startsWith("https://azjester.github.io/work/astrion-site/") || /^https:\/\/astrion\.us\/?$/.test(url);
  for (const [url] of page.matchAll(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[:/][^"'\s)]*)?/gi)) assert.ok(allowedUrl(url), `remote reference ${url}`);
  const socialCard = readFileSync(resolve(root, "astrion-site/assets/og-card.png"));
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
});

test("the design tokens are the reference's", () => {
  for (const token of [
    "--void: oklch(12.1% .0039 245.47)", "--carbon: oklch(15.82% .0072 258.37)", "--secondary: oklch(22.12% .015 261.62)",
    "--fg: oklch(94.52% .0081 98.88)", "--muted-fg: oklch(64.91% .016 264.46)", "--primary: oklch(78.56% .1345 216.5)",
    "--border: rgba(255,255,255,.1)", "--input: rgba(255,255,255,.14)", "--radius: .625rem", "--container: 1400px",
    '--font-sans: "Archivo", system-ui, sans-serif', '--font-mono: "JetBrains Mono", ui-monospace, monospace',
  ]) assert.ok(page.includes(token), `token present: ${token}`);
  for (const fallback of ["--void: #050607", "--carbon: #0b0d10", "--fg: #eeede7", "--primary: #23cef0"]) assert.ok(page.includes(fallback), `hex fallback before the oklch value: ${fallback}`);
  assert.doesNotMatch(page, /Verdana|Obvia|442c81/i, "the reference design carries neither the older faces nor Astrion Force");
  assert.doesNotMatch(page, /—|&mdash;|&#(?:8212|x2014);/i, "no em dashes");
});

test("brand copy follows the standards: no Astrion EDGE tagline, approved statements verbatim, sourced facts", () => {
  assert.doesNotMatch(page, /Astrion EDGE|EDGE&trade;|Engineering Delivered, Guaranteed Excellence/, "the EDGE tagline is not used on this page");
  assert.match(page, /<h2 class="display">Capability that holds at the edge\.<\/h2>/);
  for (const statement of [
    "We deliver <em>proof</em>, not promises.",
    "Innovation fuels it. Engineering proves it. Astrion makes it mission-ready.",
    "Engineered for mission advantage. Proven at scale.",
  ]) assert.ok(page.includes(statement), `approved statement present: ${statement}`);
  assert.match(page, /Headquartered in Huntsville, Alabama, with Centers of Excellence there, in Washington, DC, and in Burlington, Massachusetts\./);
  assert.doesNotMatch(page, /Headquartered in Washington/);
  assert.match(page, /<div class="v">6,000<small>\+<\/small><\/div>/);
  assert.match(page, /<div class="v">71<small>%<\/small><\/div>/);
  assert.match(page, /<!-- Sources: astrion\.us\/our-story/);
});

test("accessibility affordances and stillness", () => {
  assert.match(page, /<a class="skip" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main">/);
  assert.match(page, /<nav aria-label="Site">/);
  assert.match(page, /<nav aria-label="Footer">/);
  assert.doesNotMatch(page, /<span class="arr">/, "decorative arrows are aria-hidden");
  assert.match(page, /html\.js \.reveal \{ opacity: 0; translate: 0 22px; \}/, "reveals are gated on the js class");
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{\s*html \{ scroll-behavior: auto; \}\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(page, /html\.still \*, html\.still \*::before, html\.still \*::after \{ animation: none !important; transition: none !important; \}/);
  assert.match(page, /if \(e\.key === 'Escape' && menu\.classList\.contains\('open'\)\) setMenu\(false\);/, "Escape closes the menu");
  assert.match(page, /scroll-padding-top: calc\(var\(--header-h\) \+ 8px\)/, "anchors clear the fixed header");
});

test("the catalog and README point at the new route without dropping the earlier page", () => {
  assert.match(hub, /title: "Astrion company site",[\s\S]{0,600}liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion-site\/",\s*repoUrl: "https:\/\/github\.com\/AzJester\/work\/tree\/main\/astrion-site"/);
  assert.match(hub, /liveUrl: "https:\/\/azjester\.github\.io\/work\/astrion\/",/, "the earlier landing page keeps its catalog entry");
  assert.match(readme, /### → https:\/\/azjester\.github\.io\/work\/astrion-site\//);
  assert.match(readme, /### → https:\/\/azjester\.github\.io\/work\/astrion\//);
  assert.match(readme, /\| `astrion-site\/` \|/);
});

test("inline scripts parse", () => {
  for (const [, body] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(body);
});
