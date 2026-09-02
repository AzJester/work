import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");

const requiredLiveUrls = [
  "https://azjester.github.io/work/",
  "https://azjester.github.io/work/astrion-division/ldawif/",
  "https://azjester.github.io/work/astrion/",
  "https://azjester.github.io/work/astrion-site/",
  "https://azjester.github.io/work/black-hat-agent/",
  "https://azjester.github.io/work/solutions-architect/",
  "https://azjester.github.io/work/dashboard.html",
  "https://azjester.github.io/work/geopresence/",
  "https://azjester.github.io/work/radar-signal-chain.html",
  "https://azjester.github.io/work/roadmap.html",
  "https://azjester.github.io/work/status.html",
  "https://azjester.github.io/work/tracker.html",
  "https://azjester.github.io/work/weekly-task-tracker.html",
  "https://shaine-weekly-status.onrender.com/",
  "https://azjester.github.io/J-C_Replace/",
  "https://ai-training.st-dba.com/",
  "https://compliance.insightfuldefense.com/",
  "https://vault.st-dba.com/",
  "https://azjester.github.io/usn-ai-tac-sim/",
  "https://cuas.insightfuldefense.com/",
  "https://insightfuldefense.com/",
  "https://infostyles.onrender.com/",
  "https://resume.st-dba.com/",
  "https://azjester.github.io/SEG-SCHEDULE/",
  "https://azjester.github.io/lotus/",
  "https://azjester.github.io/gun-laws/",
  "https://azjester.github.io/SIGMA-155/",
  "https://azjester.github.io/asteroids-/",
  "https://azjester.github.io/agile-pricer/",
  "https://azjester.github.io/WarGames-/",
];

const sourceOnlyRepos = [
  "https://github.com/AzJester/roadmap-lite/blob/main/RoadmapBuilder.html",
  "https://github.com/AzJester/legal-app/blob/main/legal-ai-value-tracker.html",
  "https://github.com/AzJester/ai-metrics",
];

const exactWorkSourceUrls = [
  "https://github.com/AzJester/work/blob/main/roadmap.html",
  "https://github.com/AzJester/work/blob/main/index.html",
  "https://github.com/AzJester/work/blob/main/tracker.html",
  "https://github.com/AzJester/work/blob/main/weekly-task-tracker.html",
  "https://github.com/AzJester/work/blob/main/status.html",
  "https://github.com/AzJester/work/blob/main/dashboard.html",
  "https://github.com/AzJester/work/blob/main/radar-signal-chain.html",
  "https://github.com/AzJester/work/tree/main/astrion-division/ldawif",
  "https://github.com/AzJester/work/tree/main/astrion",
  "https://github.com/AzJester/work/tree/main/astrion-site",
];

test("application hub publishes at a stable root HTML route", () => {
  assert.match(hub, /<link rel="canonical" href="https:\/\/azjester\.github\.io\/work\/apps\.html">/);
  assert.match(readme, /https:\/\/azjester\.github\.io\/work\/apps\.html/);
  assert.match(pagesWorkflow, /cp -- \*\.html/,
    "The existing Pages artifact must continue to include root HTML files without a workflow change");
});

test("social metadata uses the dedicated published application-library card", () => {
  const socialCardPath = resolve(root, "apps-og.png");
  assert.ok(existsSync(socialCardPath));
  const socialCard = readFileSync(socialCardPath);
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
  assert.match(hub, /property="og:image" content="https:\/\/azjester\.github\.io\/work\/apps-og\.png"/);
  assert.match(hub, /property="og:image:width" content="1200"/);
  assert.match(hub, /property="og:image:height" content="630"/);
  assert.match(hub, /name="twitter:image" content="https:\/\/azjester\.github\.io\/work\/apps-og\.png"/);
});

test("curated catalog contains all 33 identified applications", () => {
  const catalogBlock = hub.match(/const catalog = \[([\s\S]*?)\n\s*\];/)?.[1] || "";
  const appCount = [...catalogBlock.matchAll(/\n\s{10}title: "/g)].length;
  assert.equal(appCount, 33);
  assert.match(hub, /One launch point for every public AzJester application/);
});

test("Solution Architect Workbench is linked and stamped as under development", () => {
  assert.match(
    hub,
    /title: "Solution Architect Workbench",[\s\S]{0,500}category: "Defense",[\s\S]{0,500}access: "Public"/,
  );
  assert.match(
    hub,
    /title: "Solution Architect Workbench",[\s\S]{0,500}status: "Under development"/,
  );
  assert.match(
    hub,
    /title: "Solution Architect Workbench",[\s\S]{0,700}liveUrl: "https:\/\/azjester\.github\.io\/work\/solutions-architect\/"/,
  );
  assert.match(
    hub,
    /title: "Solution Architect Workbench",[\s\S]{0,800}repoUrl: "https:\/\/github\.com\/AzJester\/work\/tree\/main\/solutions-architect"/,
  );
  assert.match(hub, /<p class="development-stamp" hidden><\/p>/);
  assert.match(hub, /developmentStamp\.textContent = app\.status\.toLocaleUpperCase\(\)/);
  assert.match(hub, /app\.access, app\.status, app\.repo/);
  assert.match(pagesWorkflow, /cp -R[^\n]*solutions-architect[^\n]*_site\//);
});

test("all verified live applications use their working primary URLs", () => {
  for (const url of requiredLiveUrls) {
    assert.ok(hub.includes(`liveUrl: "${url}"`), `Missing verified live URL: ${url}`);
  }
  assert.doesNotMatch(hub, /https:\/\/info-styles\.vercel\.app/,
    "Do not restore the stale InfoStyles Vercel homepage");
});

test("unpublished applications are represented honestly as source-only", () => {
  for (const url of sourceOnlyRepos) assert.ok(hub.includes(`repoUrl: "${url}"`), `Missing source-only app: ${url}`);
  assert.equal((hub.match(/access: "Source"/g) || []).length, 3);
});

test("application cards link directly to their exact source and use a clear action label", () => {
  for (const url of exactWorkSourceUrls) {
    assert.ok(hub.includes(`repoUrl: "${url}"`), `Missing exact source URL: ${url}`);
  }
  assert.equal(
    (hub.match(/repoUrl: "https:\/\/github\.com\/AzJester\/work",/g) || []).length,
    0,
    "Monorepo cards must not send users to the generic repository root",
  );
  assert.match(hub, /const sourceLink = makeLink\("View source", app\.repoUrl/);
});

test("The AI Compendium is classified as a graphics application", () => {
  assert.match(hub, /title: "The AI Compendium",[\s\S]{0,260}category: "Design & Graphics"/);
  assert.match(hub, /title: "The AI Compendium",[\s\S]{0,500}tags: \["Prompt library", "Visual styles", "Infographics"\]/);
  assert.doesNotMatch(hub, /title: "The AI Compendium",[\s\S]{0,500}(AI skills hub|"Skills")/);
});

test("Weekly Status links to its live app and real source repository", () => {
  assert.match(hub, /title: "shAIne Weekly Status",[\s\S]{0,500}liveUrl: "https:\/\/shaine-weekly-status\.onrender\.com\/"/);
  assert.match(hub, /title: "shAIne Weekly Status",[\s\S]{0,500}repoUrl: "https:\/\/github\.com\/AzJester\/shAIne_Weekly_Status"/);
  assert.match(hub, /if \(typeof url !== "string" \|\| !url\.trim\(\)\) return null/);
});

test("Claude Skills and Thought Circuit live in a separate resources section", () => {
  assert.match(hub, /<section class="resources" id="resources" aria-labelledby="resources-title">/);
  assert.equal((hub.match(/<article class="resource-card"/g) || []).length, 2);

  const skillsCard = hub.match(/<article class="resource-card" data-resource="claude-skills">([\s\S]*?)<\/article>/)?.[1] || "";
  assert.match(skillsCard, /<h3>Claude &amp; AI Agent Skills<\/h3>/);
  assert.match(skillsCard, /href="https:\/\/github\.com\/AzJester\/skills"/);

  const thoughtCircuitCard = hub.match(/<article class="resource-card" data-resource="thought-circuit">([\s\S]*?)<\/article>/)?.[1] || "";
  assert.match(thoughtCircuitCard, /<h3>Thought Circuit<\/h3>/);
  assert.match(thoughtCircuitCard, /href="https:\/\/st-dba\.com\/"/);
  assert.doesNotMatch(thoughtCircuitCard, /\bsource\b|github\.com/i,
    "Thought Circuit must link only to the public site and never show a source link");
});

test("search, category filters, and accessible link behavior are present", () => {
  assert.match(hub, /id="app-search"[^>]*type="search"/);
  assert.match(hub, /id="filters" role="group" aria-label="Filter applications"/);
  assert.match(hub, /aria-live="polite"/);
  assert.match(hub, /rel = "noopener noreferrer"/);
  assert.match(hub, /prefers-reduced-motion/);
});

test("the inline application module parses without a build step", () => {
  const scripts = [...hub.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  assert.doesNotThrow(() => new Script(scripts.at(-1)[1]));
});

test("GitHub refresh has a curated fallback and discovers future public deployments", () => {
  assert.match(hub, /api\.github\.com\/users\/\$\{GITHUB_USER\}\/repos/);
  assert.match(hub, /repo\.has_pages/);
  assert.match(hub, /The curated catalog remains complete/);
});
