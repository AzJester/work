import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { collect, publishedPath, readCatalog, remoteDate, stamp } from "../scripts/app-updated.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hub = readFileSync(resolve(root, "apps.html"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");

const requiredLiveUrls = [
  "https://azjester.github.io/work/",
  "https://azjester.github.io/work/astrion-division/ldawif/",
  "https://azjester.github.io/work/astrion/",
  "https://azjester.github.io/work/phx-digital-twin/",
  "https://azjester.github.io/work/relief-map.html",
  "https://azjester.github.io/Black_Hat_Agent/",
  "https://azjester.github.io/work/solutions-architect/",
  "https://azjester.github.io/work/dashboard.html",
  "https://azjester.github.io/work/geopresence/",
  "https://azjester.github.io/work/radar-signal-chain.html",
  "https://azjester.github.io/work/roadmap.html",
  "https://azjester.github.io/work/status.html",
  "https://azjester.github.io/work/tracker.html",
  "https://azjester.github.io/work/weekly-task-tracker.html",
  "https://azjester.github.io/J-C_Replace/",
  "https://ai-training.st-dba.com/",
  "https://compliance.insightfuldefense.com/",
  "https://azjester.github.io/usn-ai-tac-sim/",
  "https://cuas.insightfuldefense.com/",
  "https://insightfuldefense.com/",
  "https://infostyles.onrender.com/",
  "https://azjester.github.io/SEG-SCHEDULE/",
  "https://azjester.github.io/lotus/",
  "https://azjester.github.io/agile-pricer/",
  "https://intel.insightfuldefense.com/",
  "https://linkbudget.st-dba.com/",
  "https://azjester.github.io/passive_sensor_demo_F5.2/",
  "https://azjester.github.io/Talent-Acquisition-Agent/",
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
  "https://github.com/AzJester/work/tree/main/phx-digital-twin",
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

const workApplications = [
  "AI Metrics Dashboard",
  "AI Practice Lab",
  "Astrion · Mission Segments",
  "Astrion Agile Pricing Studio",
  "Astrion Division · LDAWIF",
  "Astrion · Mission Intelligence",
  "Black Hat Agent",
  "DefenseIntel",
  "DoD RFP Compliance Workspace",
  "Insightful Defense",
  "JIATF C-UAS C2 COP",
  "LDAWIF",
  "Legal AI Value Tracker",
  "Link Budget",
  "Lotus Notes",
  "Map Builder",
  "PHX Sky Harbor Twin",
  "Passive Acoustic UAS Sensor",
  "Radar Signal Chain",
  "Roadmap Builder",
  "Roadmap Builder Lite",
  "SEG Flexible Staff Scheduling",
  "Shared Leadership Dashboard",
  "Solution Architect Workbench",
  "Talent Acquisition Agent",
  "The AI Compendium",
  "USN Tactical AI Backbone",
  "Unified Project Management Suite",
  "United States in Relief",
  "Weekly Status Tracker · Cloud",
  "Weekly Status Tracker · Lite",
  "Weekly Task Tracker",
];

test("curated catalog lists exactly the 32 work applications", () => {
  const catalogBlock = hub.match(/const catalog = \[([\s\S]*?)\n\s*\];/)?.[1] || "";
  const titles = [...catalogBlock.matchAll(/\n\s{10}title: "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...titles].sort(), [...workApplications].sort(),
    "The library is work-only: add an application here only when it belongs in front of a work audience");
  assert.match(hub, /One launch point for the work applications built across AzJester repositories/);
  assert.match(
    hub,
    /const categoryOrder = \["All", "Pinned", "Operations", "Defense", "Research", "Design & Graphics", "AI & Learning", "Source only"\];/,
  );
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

test("the Astrion Capabilities Film is published as the index of its own route", () => {
  assert.ok(existsSync(resolve(root, "astrion-film/astrion-capabilities-film.html")));
  assert.match(pagesWorkflow, /mkdir -p _site\/astrion-film\n\s+cp astrion-film\/astrion-capabilities-film\.html _site\/astrion-film\/index\.html/);
});

test("the Astrion company site and Capabilities Film stay published but off the library", () => {
  for (const pattern of [/Astrion company site/, /Astrion Capabilities Film/, /\/astrion-site\//, /\/astrion-film\//, /tree\/main\/astrion-(site|film)/]) {
    assert.doesNotMatch(hub, pattern, "These two pages were removed from the library on request; they are reached by direct link only");
  }
  assert.match(pagesWorkflow, /cp -R[^\n]*\bastrion-site\b[^\n]*_site\//);
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

test("card links are skipped when an application has no URL for them", () => {
  assert.match(hub, /if \(typeof url !== "string" \|\| !url\.trim\(\)\) return null/);
});

test("Thought Circuit is the only entry in the separate resources section", () => {
  assert.match(hub, /<section class="resources" id="resources" aria-labelledby="resources-title">/);
  assert.equal((hub.match(/<article class="resource-card"/g) || []).length, 1);

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

test("the library is fully curated and never reaches outside its own page", () => {
  for (const pattern of [/api\.github\.com/, /\bfetch\(/, /XMLHttpRequest/, /discoverableRepos/, /excludedRepos/]) {
    assert.doesNotMatch(hub, pattern, "Every card is curated: the page must not load or discover anything at run time");
  }
  assert.doesNotMatch(hub, /github\.com\/AzJester(?![\w/-])/,
    "Link to repositories, not to the account profile, which lists more than the work library does");
});

test("every catalog entry is complete, unique, and safely linked", () => {
  const source = hub.match(/const catalog = (\[[\s\S]*?\n\s*\]);/)?.[1];
  assert.ok(source, "The catalog must stay an inline array literal");
  const catalog = new Script(`(${source})`).runInNewContext();
  const categories = new Set(["Operations", "Defense", "Research", "Design & Graphics", "AI & Learning"]);
  const seenTitles = new Set();
  const seenLiveUrls = new Set();
  for (const app of catalog) {
    assert.ok(app.title && app.description && app.repo, `Incomplete entry: ${JSON.stringify(app.title)}`);
    assert.ok(categories.has(app.category), `${app.title}: unknown category ${app.category}`);
    assert.ok(["Public", "Account", "Source"].includes(app.access), `${app.title}: unknown access ${app.access}`);
    assert.ok(Array.isArray(app.tags) && app.tags.length >= 1 && app.tags.length <= 3, `${app.title}: expected one to three tags`);
    assert.ok(app.description.length <= 220, `${app.title}: description is too long for a card`);
    assert.match(app.repoUrl, /^https:\/\/github\.com\/AzJester\/[^/]+/, `${app.title}: source must be a repository URL`);
    assert.equal(Boolean(app.liveUrl), app.access !== "Source", `${app.title}: only source-only entries may lack a live URL`);
    if (app.liveUrl) {
      assert.match(app.liveUrl, /^https:\/\/[^\s]+\/$|^https:\/\/[^\s]+\.html$/, `${app.title}: live URL must be https`);
      assert.ok(!seenLiveUrls.has(app.liveUrl), `${app.title}: duplicate live URL`);
      seenLiveUrls.add(app.liveUrl);
    }
    assert.ok(!seenTitles.has(app.title), `Duplicate title: ${app.title}`);
    seenTitles.add(app.title);
  }
});

test("pins, layout, and theme are remembered through guarded browser storage", () => {
  assert.match(hub, /try \{\s+return localStorage\.getItem\(`app-library:\$\{key\}`\);\s+\} catch \{\s+return null;/);
  assert.match(hub, /try \{\s+localStorage\.setItem\(`app-library:\$\{key\}`, value\);\s+\} catch \{/);
  assert.match(hub, /:root\[data-theme="light"\] \{/);
  assert.match(hub, /\.app-grid\[data-view="list"\]/);
});

test("every application carries the date it was last updated", () => {
  const apps = readCatalog(hub), tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.equal(apps.length, workApplications.length);
  for (const app of apps) {
    assert.match(app.updated, /^\d{4}-\d{2}-\d{2}$/, `${app.title} has no last-updated date`);
    assert.ok(!Number.isNaN(Date.parse(app.updated)) && app.updated <= tomorrow && app.updated >= "2025-01-01", `${app.title} has an implausible date ${app.updated}`);
  }
  assert.match(hub, /<p class="updated" hidden>Updated <time><\/time><\/p>/);
  assert.match(hub, /time\.dateTime = app\.updated;/);
  assert.match(hub, /timeZone: "UTC"/, "dates are days in UTC and must not shift with the reader's zone");
});

test("dates for applications in this repository come from what each one publishes", () => {
  const apps = new Map(readCatalog(hub).map((app) => [app.title, app]));
  const expected = {
    "LDAWIF": "index.html", "Roadmap Builder": "roadmap.html", "Map Builder": "geopresence", "Solution Architect Workbench": "solutions-architect",
    "Astrion Division · LDAWIF": "astrion-division/ldawif", "PHX Sky Harbor Twin": "phx-digital-twin", "United States in Relief": "relief-map.html",
  };
  for (const [title, path] of Object.entries(expected)) assert.equal(publishedPath(apps.get(title)), path);
  for (const app of apps.values()) {
    const path = publishedPath(app);
    if (app.repo === "work") assert.ok(path && existsSync(resolve(root, path)), `${app.title} publishes ${path}, which is not in the repository`);
    else assert.equal(path, null, `${app.title} lives in another repository`);
  }
});

test("stamping rewrites only the entries it has a date for, and a failed lookup keeps the old date", async () => {
  const before = new Map(readCatalog(hub).map((app) => [app.title, app.updated]));
  const stamped = stamp(hub, new Map([["Lotus Notes", "2031-02-03"], ["Not in the library", "2031-01-01"], ["LDAWIF", "last week"]]));
  for (const app of readCatalog(stamped)) assert.equal(app.updated, app.title === "Lotus Notes" ? "2031-02-03" : before.get(app.title));
  assert.equal(stamped.length, hub.length);
  assert.equal(stamp(hub, new Map()), hub);

  const answer = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.equal(await remoteDate("AzJester/lotus", answer([{ commit: { committer: { date: "2031-04-05T06:07:08Z" } } }]), ""), "2031-04-05");
  assert.equal(await remoteDate("AzJester/lotus", answer({ message: "Not Found" }, false), ""), null);
  assert.equal(await remoteDate("AzJester/lotus", answer([]), ""), null);
  assert.equal(await remoteDate("AzJester/lotus", async () => { throw new Error("offline"); }, ""), null);

  const elsewhere = [...before.keys()].filter((title) => readCatalog(hub).find((app) => app.title === title).repo !== "work");
  const offline = await collect(hub, { remote: true, fetchImpl: async () => { throw new Error("offline"); } });
  for (const title of elsewhere) assert.ok(!offline.dates.has(title), `${title} must keep its committed date when GitHub does not answer`);
  assert.equal(offline.notes.filter((note) => note.includes("no answer")).length, elsewhere.length);
  const online = await collect(hub, { remote: true, fetchImpl: answer([{ commit: { committer: { date: "2031-04-05T06:07:08Z" } } }]) });
  for (const title of elsewhere) assert.equal(online.dates.get(title), "2031-04-05");
});

test("the deploy stamps the published library from full history and cannot fail on it", () => {
  assert.match(pagesWorkflow, /uses: actions\/checkout@v4\n\s+with:\n\s+#[^\n]*\n\s+fetch-depth: 0\n\n\s+- name: Configure Pages/);
  assert.match(pagesWorkflow, /continue-on-error: true\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/app-updated\.mjs --file _site\/apps\.html --remote/);
  assert.ok(pagesWorkflow.indexOf("touch _site/.nojekyll") < pagesWorkflow.indexOf("app-updated.mjs"), "the copy must exist before it is stamped");
  assert.ok(pagesWorkflow.indexOf("app-updated.mjs") < pagesWorkflow.indexOf("upload-pages-artifact"), "the stamp must land before the artifact is uploaded");
});
