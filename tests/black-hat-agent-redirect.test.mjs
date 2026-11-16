import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const folder = resolve(root, "black-hat-agent");
const page = readFileSync(resolve(folder, "index.html"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");

test("the retired Black Hat Agent address only forwards to the current build", () => {
  assert.match(page, /<script>location\.replace\("\/Black_Hat_Agent\/" \+ location\.search \+ location\.hash\);<\/script>/,
    "Forward on the same origin and keep the route, so saved work and deep links carry over");
  assert.match(page, /<meta http-equiv="refresh" content="0; url=\/Black_Hat_Agent\/">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/Black_Hat_Agent\/">/);
  assert.equal((page.match(/<script/g) || []).length, 1, "The forwarding page must not load the retired app");
  assert.doesNotMatch(page, /<link[^>]+stylesheet|src=/);
});

test("no second copy of the application is published from this repository", () => {
  // Two builds on one origin share one browser storage key. The older build could not
  // read the newer schema, and saving in it would have replaced the newer workspace.
  assert.deepEqual(readdirSync(folder).sort(), ["README.md", "index.html", "vendor"]);
  for (const file of ["app.js", "engine.js", "styles.css", "spreadsheet-worker.js"]) {
    assert.ok(!existsSync(resolve(folder, file)), `Retired file is back: black-hat-agent/${file}`);
  }
});

test("the shared spreadsheet library stays where the Solution Architect Workbench loads it", () => {
  assert.ok(existsSync(resolve(folder, "vendor/xlsx.full.min.js")));
  assert.ok(existsSync(resolve(folder, "vendor/SHEETJS-LICENSE.txt")));
  const workbench = readFileSync(resolve(root, "solutions-architect/index.html"), "utf8");
  assert.match(workbench, /<script src="\.\.\/black-hat-agent\/vendor\/xlsx\.full\.min\.js"><\/script>/);
  assert.match(pagesWorkflow, /cp -R[^\n]*\sblack-hat-agent\s[^\n]*_site\//,
    "The Pages artifact must keep publishing the forwarding page and the shared library");
});
