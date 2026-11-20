import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// mission-intelligence/ and mission-engineering/ are the same kind of site. They ship the same script and the same
// stylesheet, so a fix to one is a fix to both. This test fails when the two copies drift apart.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PAGES = ["mission-intelligence", "mission-engineering"];
const read = (page, file) => readFileSync(resolve(root, page, file), "utf8");
const BLOCK = /\/\* page:fit start[\s\S]*?\/\* page:fit end \*\//;
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");

test("both pages ship the same script", () => {
  const [first, second] = PAGES.map(page => read(page, "app.js"));
  assert.equal(second, first, "mission-engineering/app.js must be a copy of mission-intelligence/app.js: change both together");
  assert.match(first, /tests\/astrion-scroll-engine\.test\.mjs keeps the two copies identical/);
  // The script finds its sections by class, so each page is free to name its own chapters.
  assert.doesNotMatch(first, /\$\("#(?:domains|proof|contact|build|loop|agents|rule)"\)/);
  assert.match(first, /const statement = \$\("\.statement"\), statementId = statement \? statement\.id : "";/);
});

test("both pages ship the same stylesheet apart from the fallback sizes of their own headlines", () => {
  const [first, second] = PAGES.map(page => read(page, "styles.css"));
  for (const [page, css] of [[PAGES[0], first], [PAGES[1], second]]) {
    const block = css.match(BLOCK);
    assert.ok(block, `${page}/styles.css needs its page:fit block`);
    assert.ok(css.trimEnd().endsWith("/* page:fit end */"), `${page}/styles.css ends with its page:fit block`);
    const rules = block[0].split("\n").filter(line => /\{/.test(line) && !line.startsWith("@media"));
    assert.ok(rules.length >= 13, `${page} sets a fallback size for every fitted line and stacked word (${rules.length})`);
    for (const rule of rules) assert.match(rule, /^\s*\.(?:lockup|rule-title|closer) [^{]*\{ --fs0: [^;]+; \}$/, `${page}: only fallback sizes belong in the block: ${rule.trim()}`);
    assert.doesNotMatch(css.replace(BLOCK, "").replace(/var\(--fs0/g, ""), /--fs0/, `${page}: a fallback size sits outside the block`);
  }
  assert.equal(second.replace(BLOCK, ""), first.replace(BLOCK, ""), "the stylesheets must match outside the page:fit block: change both together");
});

test("both pages ship the same brand fonts and the same copies of the media they share", () => {
  const fonts = PAGES.map(page => readdirSync(resolve(root, page, "assets/fonts")).sort());
  assert.deepEqual(fonts[1], fonts[0]);
  for (const font of fonts[0]) assert.equal(digest(resolve(root, PAGES[1], "assets/fonts", font)), digest(resolve(root, PAGES[0], "assets/fonts", font)), font);
  const media = PAGES.map(page => readdirSync(resolve(root, page, "assets/media")));
  const shared = media[1].filter(file => media[0].includes(file));
  assert.ok(shared.length >= 15, `the second page reuses the brand media (${shared.length})`);
  for (const file of shared) assert.equal(digest(resolve(root, PAGES[1], "assets/media", file)), digest(resolve(root, PAGES[0], "assets/media", file)), file);
});

test("each page loads the engine the same way and keeps the hooks the script needs", () => {
  for (const page of PAGES) {
    const html = read(page, "index.html");
    assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
    assert.match(html, /<script src="app\.js" defer><\/script>/);
    for (const hook of ['id="stage"', 'id="stage-pin"', 'id="hero"', 'id="orb"', 'id="orb-end"', 'id="stars"', 'id="index"', 'id="moves"', 'id="rows"', 'id="preview-img"', 'id="domains-track"', 'id="domain-n"', 'id="domain-bar"', 'id="film"', 'id="marquee-track"', 'id="loader-count"']) {
      assert.ok(html.includes(hook), `${page} needs ${hook}`);
    }
    for (const part of ['class="statement"', 'class="band loop"', 'class="band agents"', 'class="domains"', 'class="band rule light"', 'class="proof"', 'class="contact"']) {
      assert.ok(html.includes(part), `${page} needs a section with ${part}`);
    }
  }
});
