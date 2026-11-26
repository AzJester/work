import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { SOURCE_ROOTS, sourceHash } from "../proposal-war-room/scripts/stamp-build.mjs";
import { STATUS_WORDS, statusStyle } from "../proposal-war-room/src/lib/status.ts";

// The Proposal War Room is an Astrion tool. Its brand authority is the astrion-brand-2026 skill (Astrion Brand
// Kit v1.0) and its only icon source is the astrion-icons sprite. These tests hold what can be checked in the
// sources: the palette, square corners, the two typefaces, the sprite, titles without periods, and that the build
// committed in dist/ was made from the sources beside it. tests/browser/proposal-war-room.spec.mjs checks the same
// rules on the rendered pages.

const base = new URL("../proposal-war-room/", import.meta.url);
const read = path => readFileSync(new URL(path, base), "utf8");
const walk = dir => readdirSync(new URL(dir, base), { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
const sources = walk("src");
const code = sources.filter(path => /\.(ts|tsx|css)$/.test(path));
const views = sources.filter(path => path.endsWith(".tsx"));
const css = read("src/styles/app.css");
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const sprite = read("src/assets/icons-sprite.svg");
const symbols = new Set([...sprite.matchAll(/<symbol id="ast-([a-z0-9-]+)"/g)].map(match => match[1]));
const dist = walk("dist");
const builtCss = dist.filter(path => path.endsWith(".css") && path.startsWith("dist/assets/")).map(read).join("\n");

const PALETTE = {
  void: ["oklch(0.121 0.0039 245.47)", "#050607"], carbon: ["oklch(0.1582 0.0072 258.37)", "#0B0D10"], gunmetal: ["oklch(0.2212 0.015 261.62)", "#171B22"],
  bone: ["oklch(0.9452 0.0081 98.88)", "#EEEDE7"], steel: ["oklch(0.6491 0.016 264.46)", "#8A8F99"], ion: ["oklch(0.7856 0.1345 216.5)", "#23CEF0"], flare: ["oklch(0.9757 0.0288 205.5)", "#E2FDFF"],
};
const RETIRED = ["#102A47", "#33C7EB", "#38DBF0", "#DEFBFD", "#090A0B", "#0E0F11", "#1C1E22", "#3E3F41", "#8E8E8D", "#7F848E", "#E7E5DF"];

test("the stylesheet starts from the kit's token file and builds every color from it", () => {
  const tokens = read("src/assets/astrion-web-tokens.css");
  for (const [name, [oklch, hex]] of Object.entries(PALETTE)) assert.ok(tokens.includes(`--astrion-${name}: ${oklch}; /* ${hex};`), `the kit token for ${name} is unchanged`);
  assert.equal([...tokens.matchAll(/--astrion-[a-z]+:/g)].length, 7, "the token file holds the seven kit colors and nothing else");
  assert.match(css, /^\/\*[\s\S]*?\*\/\s*@import "\.\.\/assets\/astrion-web-tokens\.css";/, "the stylesheet starts from the token file");

  // Paper is the one value the kit leaves to convention. Every other color is a token.
  assert.deepEqual([...new Set(rules.match(/#[0-9a-fA-F]{3,8}\b/g))], ["#FFFFFF"]);
  assert.doesNotMatch(rules, /\b(rgba?|hsla?|hwb|lab|lch)\(/, "no color is written out by hand");
  assert.doesNotMatch(rules, /oklch\(/, "the OKLCH values live in the token file only");
  const values = [...rules.matchAll(/(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-[a-z]+)*-color|outline-color|fill|stroke|text-decoration-color|scrollbar-color)\s*:\s*([^;}]+)/g)].map(match => match[1].trim());
  assert.ok(values.length > 60);
  for (const value of values) assert.match(value, /^(var\(--[a-z-]+\)( var\(--[a-z-]+\))?|transparent|none|currentColor|inherit)$/, `color value: ${value}`);
  // Opacity appears on hairlines only: two tokens, one per theme.
  assert.deepEqual([...rules.matchAll(/color-mix\([^)]*\)[^;]*/g)].map(match => match[0]), [
    "color-mix(in srgb, var(--astrion-bone) 18%, transparent)", "color-mix(in srgb, var(--astrion-steel) 45%, transparent)",
  ]);
  assert.deepEqual([...rules.matchAll(/--hairline:\s*([^;]+);/g)].length, 2);
  for (const value of [...rules.matchAll(/[^-]opacity:\s*([^;}]+)/g)].map(match => match[1].trim())) assert.match(value, /^[01]$/, "opacity only hides a native control. It never tints a color");
});

test("light and dark follow the role mapping", () => {
  const dark = rules.slice(rules.indexOf(":root {"), rules.indexOf(':root[data-theme="light"] {'));
  const light = rules.slice(rules.indexOf(':root[data-theme="light"] {'), rules.indexOf("@media (pointer: coarse)"));
  const role = (block, name) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  assert.deepEqual([role(dark, "ground"), role(dark, "panel"), role(dark, "ink"), role(dark, "ink-muted"), role(dark, "focus")],
    ["var(--astrion-carbon)", "var(--astrion-gunmetal)", "var(--astrion-bone)", "var(--astrion-steel)", "var(--astrion-ion)"]);
  assert.deepEqual([role(light, "ground"), role(light, "panel"), role(light, "ink"), role(light, "ink-muted"), role(light, "focus"), role(light, "row-selected")],
    ["var(--astrion-paper)", "var(--astrion-bone)", "var(--astrion-carbon)", "var(--astrion-gunmetal)", "var(--astrion-carbon)", "var(--astrion-flare)"]);
  assert.equal(role(dark, "on-signal"), "var(--astrion-carbon)", "text on an Ion fill is Carbon, never white");
  assert.match(rules, /:focus-visible \{ outline: 2px solid var\(--focus\); outline-offset: 2px; \}/);
  // On light grounds there is no Ion text: the countdown and the today label fall back to ink.
  assert.match(rules, /:root\[data-theme="light"\] \.count-number\.is-signal \{ color: var\(--ink\);/);
  assert.match(rules, /:root\[data-theme="light"\] \.gantt-today-label \{ color: var\(--ink\); \}/);
  assert.match(rules, /:root\[data-theme="light"\] a \{ color: var\(--ink\); text-decoration-color: var\(--link-rule\); text-decoration-thickness: 2px; \}/);
  // Status styles route through tokens, so an approved status palette is one change.
  for (const name of ["complete", "progress", "attention", "blocked"]) {
    assert.match(dark, new RegExp(`--status-${name}-ink: var\\(--ink\\);`));
    assert.match(rules, new RegExp(`\\.status\\[data-status="${name}"\\] \\{ color: var\\(--status-${name}-ink\\); \\}`));
  }
});

test("no retired color, no status color, no radius, no shadow, no gradient", () => {
  const checked = [...code, "index.html", ...dist.filter(path => /\.(css|html)$/.test(path))];
  for (const file of checked) {
    const text = read(file);
    for (const hex of RETIRED) assert.equal(text.toUpperCase().includes(hex), false, `${file} carries the retired value ${hex}`);
  }
  for (const sheet of [rules, builtCss]) {
    assert.doesNotMatch(sheet, /gradient\(/);
    assert.doesNotMatch(sheet, /text-shadow|drop-shadow|backdrop-filter/);
    for (const value of [...sheet.matchAll(/box-shadow:\s*([^;}]+)/g)].map(match => match[1].trim())) assert.equal(value, "none");
    for (const value of [...sheet.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}]+)/g)].map(match => match[1].trim())) assert.equal(value, "0");
    assert.doesNotMatch(sheet, /:\s*(red|green|orange|yellow|amber|pink|gold|crimson|tomato|lime|limegreen|orangered|goldenrod|firebrick|salmon|hotpink)\b/i, "no named red, amber, green, pink or gold");
  }
  assert.match(rules, /\*, \*::before, \*::after \{ box-sizing: border-box; border-radius: 0; box-shadow: none; \}/, "every element starts square and flat");
  assert.match(builtCss, /#fff\b|#ffffff\b/i, "Paper survives the build");
  assert.deepEqual([...new Set((builtCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map(hex => hex.toLowerCase()))].filter(hex => !["#fff", "#ffffff", "#0000"].includes(hex)), [],
    "the built stylesheet holds no other hex color: the build must not add its own fallbacks for the kit's OKLCH tokens");
  for (const [name, [oklch]] of Object.entries(PALETTE)) {
    // The minifier writes lightness as a percentage. The numbers have to be the kit's.
    const built = builtCss.match(new RegExp(`--astrion-${name}:oklch\\(([0-9.]+)(%?) ([0-9.]+) ([0-9.]+)\\)`));
    assert.ok(built, `the built stylesheet carries an OKLCH value for ${name}`);
    const [l, c, h] = oklch.match(/[0-9.]+/g).map(Number);
    assert.deepEqual([Number((Number(built[1]) / (built[2] ? 100 : 1)).toFixed(4)), Number(built[3]), Number(built[4])], [l, c, h], `the built value for ${name} is the kit's`);
  }
  // Pink, Red and Gold team are names. Nothing is styled after them.
  assert.doesNotMatch(rules, /\.(pink|red|gold|green|amber)\b|data-team/);
});

test("two typefaces: Archivo and JetBrains Mono, served from the kit's own files", () => {
  assert.match(rules, /--font-sans: "Archivo", Arial, sans-serif;/);
  assert.match(rules, /--font-mono: "JetBrains Mono", Consolas, monospace;/);
  const families = [...rules.replace(/@font-face \{[^}]*\}/g, "").matchAll(/font(?:-family)?:\s*([^;}]+)/g)].map(match => match[1]).filter(value => /var\(--font|"/.test(value));
  assert.equal((rules.match(/@font-face \{/g) ?? []).length, 1, "one added face: the 800 weight of Archivo, from the kit's own file");
  assert.match(rules, /@font-face \{\s*font-family: "Archivo";[\s\S]*?font-weight: 701 900;[\s\S]*?src: url\("\/fonts\/Archivo\/archivo-web-03\.woff2"\) format\("woff2"\);/);
  for (const value of families) assert.match(value, /var\(--font-(sans|mono)\)|^inherit$/, `font: ${value}`);
  assert.equal(/\b(Inter|Roboto|Calibri|Helvetica|Space Grotesk|Archivo Narrow|Archivo Black|system-ui|-apple-system|Segoe UI)\b/.test(rules), false, "no third face and no system font");
  assert.match(rules, /body \{[^}]*font: 400 14px\/1\.5 var\(--font-sans\);/);
  assert.match(rules, /\.page-title \{ font: 700 24px\/1\.15 var\(--font-sans\); text-transform: uppercase;/);
  assert.match(rules, /\.panel-title \{ font: 700 16px\/1\.3 var\(--font-sans\); \}/);
  assert.match(rules, /\.mono, \.label \{\s*font: 500 11px\/1\.4 var\(--font-mono\);\s*text-transform: uppercase;\s*letter-spacing: 0\.18em;/);
  assert.match(rules, /\.count-number \{ font: 800 56px\/1 var\(--font-sans\); \}/);
  assert.match(rules, /\.btn \{[^}]*font: 500 11px\/1 var\(--font-mono\); text-transform: uppercase;/);

  const html = read("index.html");
  assert.match(html, /<link rel="stylesheet" href="\.\/fonts\/Archivo\/font-face\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/fonts\/JetBrains-Mono\/font-face\.css" \/>/);
  assert.doesNotMatch(html + css, /fonts\.googleapis|fonts\.gstatic|https?:\/\/[^"']*\.woff/, "the fonts are the copies in this folder");
  for (const folder of ["public/fonts", "dist/fonts"]) {
    const files = walk(folder).map(path => path.slice(folder.length + 1)).sort();
    assert.deepEqual(files.filter(path => !path.endsWith(".woff2")), ["Archivo/font-face.css", "JetBrains-Mono/font-face.css", "licenses/Archivo-OFL.txt", "licenses/JetBrains-Mono-OFL.txt"], `${folder} carries each font's CSS and its license`);
    assert.equal(files.filter(path => path.endsWith(".woff2")).length, 9);
  }
  assert.match(read("public/fonts/Archivo/font-face.css"), /font-family: 'Archivo';[\s\S]*?font-weight: 300 700;/, "the kit's font-face file is unchanged");
});

test("table text is set in points, from 8 to 10", () => {
  assert.match(rules, /\ntable \{ width: 100%; border-collapse: collapse; font: 400 10pt\/1\.45 var\(--font-sans\); text-align: left; \}/);
  assert.match(rules, /\nth \{\s*font: 500 9pt\/1\.3 var\(--font-mono\); text-transform: uppercase;/);
  assert.match(rules, /background: var\(--table-head\); color: var\(--table-head-ink\);/);
  assert.match(rules, /\.panel th \{ background: var\(--table-head-on-panel\); \}/, "a table on a Gunmetal panel gets a Carbon header");
  assert.match(rules, /\.table-wrap \{ overflow-x: auto; \}/, "narrow screens scroll the table. The text does not shrink");
  const tableRules = [...rules.matchAll(/(?<=^|\}|\{)(\s*)([^{}@]*(?<![.\w-])(?:table|th|td|tfoot|tr)(?![\w-])[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(tableRules.length > 20);
  let sized = 0;
  for (const [, , selector, body] of tableRules) {
    for (const size of [...body.matchAll(/font(?:-size)?:\s*(?:[0-9]{3}\s+)?([0-9.]+)(pt|px|rem|em)/g)]) {
      assert.equal(size[2], "pt", `${selector.trim()} sets table text in ${size[2]}`);
      assert.ok(Number(size[1]) >= 8 && Number(size[1]) <= 10, `${selector.trim()} sets table text at ${size[1]} pt`);
      sized += 1;
    }
  }
  assert.ok(sized >= 10);
  assert.doesNotMatch(rules, /nth-child\((odd|even|2n)/, "no zebra striping");
});

test("every icon is a symbol from the astrion-icons sprite", () => {
  assert.equal(symbols.size, 294, "the sprite is the whole provisional set, copied unchanged");
  assert.doesNotMatch(sprite, /(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/, "the sprite draws in currentColor, so it takes the 2026 ink from the page");
  const kit = read("src/ui/kit.tsx");
  const union = [...kit.slice(kit.indexOf("export type IconName ="), kit.indexOf("const SPRITE")).matchAll(/"([a-z0-9-]+)"/g)].map(match => match[1]);
  assert.ok(union.length > 50);
  for (const name of union) assert.ok(symbols.has(name), `${name} is not in the sprite`);
  for (const word of STATUS_WORDS) { const icon = statusStyle(word).icon; if (icon) assert.ok(union.includes(icon), `${word} uses ${icon}, which the app does not load`); }
  // The icon map of the build specification.
  for (const name of ["opportunity", "rfp", "schedule", "calendar", "deadline", "submit", "milestone", "color-review", "gate-review", "lock", "amendment", "outline", "volume", "section", "owner", "team", "writer", "page-limit", "format-check", "compliance-matrix", "cross-reference", "agent", "question", "issue", "action-item", "email", "download", "upload", "search", "filter", "sort", "add", "edit", "delete", "check", "status-complete", "status-in-progress", "status-attention", "status-blocked", "arrow-up", "arrow-down"]) {
    assert.ok(union.includes(name), `${name} is in the icon map`);
  }
  assert.match(kit, /<svg className="icon" width=\{px\} height=\{px\} viewBox="0 0 24 24"[^>]*>\s*<use href=\{`#ast-\$\{name\}`\} \/>/);
  assert.match(rules, /\.icon \{ flex: none; fill: none; stroke: currentColor; stroke-width: 1\.5; stroke-linecap: square; stroke-linejoin: miter;/);
  assert.match(kit, /const px = iconSize\(name, size\);/, "a glyph that does not hold at 16 px is drawn at 20");
  // One place draws an icon and one place shows an image: nothing else brings its own artwork.
  for (const file of views) {
    const text = read(file);
    if (!file.endsWith("ui/kit.tsx")) assert.doesNotMatch(text, /<svg|<img|<path|<circle|<rect|<polyline|background-image|url\(/, `${file} draws its own artwork`);
    assert.doesNotMatch(text, /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}•×]/u, `${file} uses an emoji or a symbol where an icon or a word belongs`);
  }
  assert.equal((kit.match(/<svg /g) ?? []).length, 1);
  assert.equal((kit.match(/<img/g) ?? []).length, 1);
  const packages = JSON.parse(read("package.json"));
  assert.deepEqual(Object.keys(packages.dependencies).sort(), ["@supabase/supabase-js", "pdfjs-dist", "react", "react-dom"], "no component library and no second icon set");
  assert.match(read("src/views/Settings.tsx"), /<dd data-value="icons">Icons: provisional Astrion set<\/dd>/);
  // Icons stay inside the app: the exports and the email are text.
  for (const file of ["src/lib/exports.ts", "src/lib/xlsx.ts", "src/lib/compliance.ts", "src/lib/dashboard.ts"]) assert.doesNotMatch(read(file), /ast-|icons-sprite|<svg/, `${file} puts an icon in an export`);
});

test("the wordmark is the supplied artwork, never live text", () => {
  const light = read("src/assets/astrion-wordmark-light.svg"), dark = read("src/assets/astrion-wordmark-dark.svg");
  assert.match(light, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-100 -800 6159 900" role="img" aria-label="Astrion"><title>Astrion<\/title><g fill="#EDECE4">/);
  assert.match(dark, /<g fill="#0B0D0F">/);
  assert.equal(light.replace("#EDECE4", "#0B0D0F"), dark, "the two files are the same outlines in the kit's two inks");
  for (const file of [light, dark]) assert.doesNotMatch(file, /<text|font-family/);
  const kit = read("src/ui/kit.tsx");
  assert.match(kit, /<img className="wordmark" src=\{theme === "dark" \? wordmarkLight : wordmarkDark\} alt="Astrion"/, "light wordmark on dark, dark wordmark on light");
  const built = dist.filter(path => /astrion-wordmark-(light|dark)-[\w-]+\.svg$/.test(path));
  assert.equal(built.length, 2, "the build ships both files as files");
  for (const path of built) assert.equal(read(path), path.includes("light") ? light : dark, "byte for byte");
  for (const file of views) assert.doesNotMatch(read(file), />\s*A\s?S\s?T\s?R\s?I\s?O\s?N\s*</, `${file} sets the name in live text`);
  assert.match(rules, /\.nav-brand \{ padding: 20px 20px 16px; \}/, "clear space around the wordmark is more than its cap height");
  assert.match(rules, /\.wordmark \{ display: block; height: 12px; width: auto; \}/);
});

test("titles and headers carry no closing period, and copy carries no dash or exclamation point", () => {
  let titles = 0;
  for (const file of views) {
    const text = read(file);
    assert.doesNotMatch(text, /[—–]/, `${file} holds an em or en dash`);
    assert.doesNotMatch(text, /[A-Za-z]![\s"'`<]/, `${file} holds an exclamation point in its copy`);
    const found = [
      ...[...text.matchAll(/<th\b[^>]*>([^<{]+)<\/th>/g)].map(match => match[1]),
      ...[...text.matchAll(/<h[1-6]\b[^>]*>(?:<Icon [^>]*\/>)?(?:<span>)?([^<{]+)</g)].map(match => match[1]),
      ...[...text.matchAll(/\btitle="([^"]+)"/g)].map(match => match[1]),
      ...[...text.matchAll(/\b(?:head|toast)\((?:"[a-z_]+", )?"([^"]+)"/g)].map(match => match[1]),
      ...[...text.matchAll(/className="(?:table-caption|notice-head|alert-title|option-title)"[^>]*>(?:<Icon [^>]*\/>)?(?:<span>)?([^<{]+)</g)].map(match => match[1]),
      ...[...text.matchAll(/label: "([^"]+)"/g)].map(match => match[1]),
    ];
    for (const title of found) {
      assert.doesNotMatch(title.trim(), /\.$/, `${file}: "${title}" ends in a period`);
      titles += 1;
    }
  }
  assert.ok(titles > 150, `only ${titles} titles were found, so the patterns have drifted from the code`);
  assert.match(read("index.html"), /<title>Proposal War Room<\/title>/);
  for (const file of code) assert.doesNotMatch(read(file), /\b(world-class|cutting-edge|game-chang|best-in-class|state-of-the-art|seamless(ly)?|supercharg)\b(?![^\n]*No hype)/i, `${file} uses a hype word`);
  for (const file of sources.filter(path => /\.(ts|tsx)$/.test(path))) assert.doesNotMatch(read(file).replace(/never "ASTRION"|\\bASTRION\\b|ASTRION in capitals/g, ""), /ASTRION/, `${file} writes ASTRION in running copy`);
});

test("the build in dist/ was made from the sources beside it", () => {
  const manifest = JSON.parse(read("dist/build-manifest.json"));
  const current = sourceHash();
  assert.deepEqual(SOURCE_ROOTS, ["src", "public", "index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"]);
  assert.equal(manifest.source_sha256, current.hash, "the sources changed after the last build: run `npm run build` in proposal-war-room/ and commit dist/");
  assert.equal(manifest.source_files, current.files);

  const html = read("dist/index.html");
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(path => /^assets\/index-[\w-]+\.js$/.test(path)) && assets.some(path => /^assets\/index-[\w-]+\.css$/.test(path)));
  for (const path of assets) assert.ok(existsSync(new URL(`dist/${path}`, base)), `dist/index.html points at ${path}, which is not in the build`);
  assert.doesNotMatch(html, /(?:src|href)="\//, "every address is relative, so the page works from its folder on GitHub Pages");
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self';/, "no inline or remote script");
  assert.match(policy, /connect-src 'self' https:\/\/hqqwlkmggwgaoiyzgrhy\.supabase\.co wss:\/\/hqqwlkmggwgaoiyzgrhy\.supabase\.co;/, "the page talks to this repository's Supabase project and nothing else");
  assert.doesNotMatch(policy, /unsafe-eval|\*/);
  assert.ok(builtCss.includes("url(../fonts/Archivo/archivo-web-03.woff2)"), "the built stylesheet finds the fonts from its own folder");

  const workflow = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.ok(/mkdir -p _site\/proposal-war-room\n\s+cp -R proposal-war-room\/dist\/\. _site\/proposal-war-room\//.test(workflow), "the deploy publishes dist/, not the sources");
});
