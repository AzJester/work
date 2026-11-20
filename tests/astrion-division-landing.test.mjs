import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const page = readFileSync(resolve(root, "LDAWIF/astrion-division-landing.html"), "utf8");
const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];
const footer = page.match(/<footer>([\s\S]*?)<\/footer>/)[1];
// What a reader sees: styles, scripts, tags and the embedded headshot data are left out.
const text = page.replace(/<(style|script)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();

test("the division prototype footer sets the Astrion slogan as two lines with no periods", () => {
  assert.match(footer, /<p class="tagline"><span>Defend this world<\/span> <span>Build the next<sup>&trade;<\/sup><\/span><\/p>/);
  assert.match(style, /\.tagline span \{ display: block; \}/, "each half of the slogan sits on its own line");
  assert.match(footer, /&copy; <span id="yr"><\/span> ASTRION<br>/, "the copyright line names the company and nothing else");
});

test("the retired Astrion EDGE tagline is gone from the division prototype", () => {
  assert.doesNotMatch(page, /Guaranteed Excellence|Engineering Delivered/i);
  // Only the wordmark is retired. The lowercase word stays in the copy (the tactical edge) and in the panel edge colours.
  assert.doesNotMatch(text, /Astrion\W{0,3}EDGE\b/i, "no Astrion EDGE wordmark is left in the copy");
});
