import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALWAYS, AREAS, FULL_SUITE_MAX_AGE_DAYS, FULL_SUITE_WORKFLOW, NO_SPECS, PRODUCTION_ONLY, SHARED, SPEC_DIR,
  describe, fullSuiteVerdict, gateDecision, localSpecs, pickBase, ruleFor, selectBrowserSpecs,
} from "../scripts/select-browser-tests.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const pagesWorkflow = read(".github/workflows/pages.yml");
const suiteWorkflow = read(`.github/workflows/${FULL_SUITE_WORKFLOW}`);
const packageJson = JSON.parse(read("package.json"));
const readme = read("README.md");
const specFiles = readdirSync(resolve(root, SPEC_DIR)).filter(name => name.endsWith(".spec.mjs")).sort();
const always = [...ALWAYS].sort();
const select = (...files) => selectBrowserSpecs(files);
/** The body of one job in a workflow file, as text. */
const job = (workflow, name) => workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1] ?? "";

test("a change inside one page runs that page's specs and the specs that always run", () => {
  const decision = select("mission-intelligence/index.html", "mission-intelligence/assets/app.js");
  assert.equal(decision.all, false);
  assert.deepEqual(decision.specs, ["app-hub-responsive.spec.mjs", "mission-intelligence.spec.mjs", "offline-routing.spec.mjs"]);

  for (const [name, area] of Object.entries(AREAS)) {
    for (const path of area.paths) {
      const inside = select(path.endsWith("/") ? `${path}nested/file.js` : path);
      assert.equal(inside.all, false, `${path} must not run the whole suite`);
      for (const spec of [...area.specs, ...ALWAYS]) assert.ok(inside.specs.includes(spec), `a change to ${path} must run ${spec} (${name})`);
    }
  }
  assert.ok(decision.specs.length < localSpecs().length / 4, "one page must run a small part of the suite");
});

test("a page's own specs and source tests count as part of the page", () => {
  const page = select("mission-intelligence/index.html").specs;
  assert.deepEqual(select("mission-intelligence/index.html", "tests/browser/mission-intelligence.spec.mjs", "tests/mission-intelligence.test.mjs").specs, page);
  assert.deepEqual(select("tests/browser/mission-intelligence.spec.mjs").specs, page, "a changed spec runs with the rest of its page");
  assert.deepEqual(select("tests/mission-intelligence.test.mjs").specs, always, "source tests run in full on every push and need no browser spec");
  assert.deepEqual(select("tests/browser/app-hub-responsive.spec.mjs").specs, always, "a spec that always runs needs nothing more");
});

test("a shared file runs the whole suite, alone or beside a page", () => {
  const shared = [
    "assets/vendor/supabase-js-2.110.2.umd.js", "assets/fonts/public-sans/new.woff2", "scripts/app-updated.mjs", "scripts/select-browser-tests.mjs",
    "package.json", "package-lock.json", "playwright.config.mjs", ".github/workflows/pages.yml", `.github/workflows/${FULL_SUITE_WORKFLOW}`,
    "apps.html", "apps-og.png", "sw.js", "manifest.webmanifest", "supabase/functions/adsb-relay/index.ts",
    "tests/browser/helpers.mjs", "tests/browser/topo-fixtures.mjs",
  ];
  for (const file of shared) {
    assert.equal(select(file).all, true, `${file} is shared and must run every spec`);
    const beside = select("mission-intelligence/index.html", file);
    assert.equal(beside.all, true, `${file} must run every spec when a page changes in the same push`);
    assert.deepEqual(beside.specs, [], "a whole-suite run names no files, so Playwright loads them all");
    assert.ok(beside.reasons.some(reason => reason.startsWith(`${ruleFor(file).path} `)), `the reason must name the rule for ${file}`);
  }
  for (const listed of ["assets/", "scripts/", "package.json", "playwright.config.mjs", ".github/", "apps.html"]) assert.ok(SHARED.includes(listed), `${listed} must stay in SHARED`);
});

test("a path the map does not cover runs the whole suite", () => {
  for (const file of ["new-page/index.html", "new-page.html", "tests/browser/new-page.spec.mjs", "tests/browser/support/fixture.mjs", "tests/fixtures/data.json", "Makefile"]) {
    assert.equal(select(file).all, true, `${file} has no rule of its own and must run every spec`);
  }
  assert.equal(ruleFor("new-page/index.html"), null);
  assert.match(select("new-page/index.html", "new-page/app.js").reasons.join("\n"), /^new-page\/ has no rule in the map \(2 files changed\)$/);
  for (const spec of PRODUCTION_ONLY) assert.equal(select(SPEC_DIR + spec).all, true, `${spec} is only loaded before a deploy by a whole-suite run`);
});

test("two pages in one push run both pages' specs", () => {
  const both = select("astrion-site/index.html", "topo/app.mjs", "README.md");
  assert.equal(both.all, false);
  assert.deepEqual(both.specs, [...new Set([...ALWAYS, ...AREAS["astrion-site"].specs, ...AREAS.topo.specs])].sort());
});

test("the Workbench specs run when the spreadsheet library it borrows changes", () => {
  assert.match(read("solutions-architect/index.html"), /src="\.\.\/black-hat-agent\/vendor\/xlsx\.full\.min\.js"/, "the Workbench loads SheetJS from black-hat-agent/");
  const decision = select("black-hat-agent/vendor/xlsx.full.min.js");
  for (const spec of [...AREAS["solutions-architect"].specs, ...AREAS["black-hat-agent"].specs]) assert.ok(decision.specs.includes(spec), `black-hat-agent/ must run ${spec}`);
});

test("pages no spec opens, documentation and source tests add nothing to the run", () => {
  for (const file of ["index.html", "status.html", "tracker.html", "LDAWIF/astrion-division-landing.html", "astrion-film/astrion-capabilities-film.html", "README.md", "CLAUDE.md", "tests/app-hub.test.mjs"]) {
    const decision = select(file);
    assert.equal(decision.all, false, file);
    assert.deepEqual(decision.specs, always, `${file} needs only the specs that always run`);
  }
  assert.deepEqual(select().specs, always, "a push that changes nothing still runs the specs that always run");
  assert.equal(ruleFor("geopresence/README.md").path, "geopresence/", "documentation inside a page folder is published with the page and belongs to it");
});

test("the root service worker's shell is covered by a spec that always runs", () => {
  // Every Map Builder and roadmap spec fetches these pages through the worker's precache, so a change to one of
  // them reaches specs outside its own entry. The offline spec is the one that fails when the shell is broken.
  const shell = [...read("sw.js").match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"\.\/([^"]+)"/g)].map(match => match[1]);
  assert.ok(shell.includes("tracker.html") && shell.includes("roadmap.html") && shell.includes("dashboard.html") && shell.includes("geopresence/index.html"));
  assert.ok(ALWAYS.includes("offline-routing.spec.mjs"));
  assert.match(read(`${SPEC_DIR}offline-routing.spec.mjs`), /navigator\.serviceWorker\.ready/, "it waits for the worker to install the whole shell");
  assert.equal(ruleFor("sw.js").full, "is shared");
  for (const file of shell) assert.ok(ruleFor(file), `${file} is precached by sw.js and needs a rule`);
});

test("every tracked file has a rule", t => {
  let tracked;
  try { tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean); }
  catch { return t.skip("this copy has no git index to list"); }
  for (const known of ["apps.html", "sw.js", ".github/workflows/pages.yml", "tests/browser/helpers.mjs"]) assert.ok(tracked.includes(known), `the listing must cover the repository, and it lacks ${known}`);
  const unruled = [...new Set(tracked.filter(file => ruleFor(file) === null).map(file => (file.includes("/") ? `${file.split("/")[0]}/` : file)))];
  assert.deepEqual(unruled, [], "add these to AREAS, SHARED or NO_SPECS in scripts/select-browser-tests.mjs; until then a change to them runs every spec");
});

test("every spec has an owner, and every path and spec in the map exists", () => {
  const owned = Object.values(AREAS).flatMap(area => area.specs);
  for (const spec of specFiles) {
    const homes = [ALWAYS.includes(spec), PRODUCTION_ONLY.includes(spec), owned.includes(spec)].filter(Boolean).length;
    assert.equal(homes, 1, `${spec} must be listed in exactly one of ALWAYS, PRODUCTION_ONLY or an entry of AREAS in scripts/select-browser-tests.mjs`);
  }
  for (const spec of [...ALWAYS, ...PRODUCTION_ONLY, ...owned]) {
    assert.match(spec, /^[\w-]+\.spec\.mjs$/, `${spec} reaches the shell as part of a command`);
    assert.ok(specFiles.includes(spec), `${spec} is in the map but not in ${SPEC_DIR}`);
  }
  for (const path of [...SHARED, ...NO_SPECS, ...Object.values(AREAS).flatMap(area => area.paths)]) {
    assert.ok(existsSync(resolve(root, path)), `${path} is in the map but not in the repository`);
    assert.equal(statSync(resolve(root, path)).isDirectory(), path.endsWith("/"), `${path}: a folder ends in "/" and a file does not`);
  }
  assert.ok(ALWAYS.length > 0, "a selected run must always have a spec to run");

  // Playwright stops with "No tests found" when every file it is given holds only deployed-site tests.
  const titles = spec => [...read(SPEC_DIR + spec).matchAll(/^\s*test\(\s*(["'`])(.*?)\1/gm)].map(match => match[2]);
  for (const spec of localSpecs()) assert.ok(titles(spec).some(title => !title.includes("@production")), `${spec} must hold a test that runs before a deploy`);
  for (const spec of PRODUCTION_ONLY) assert.ok(titles(spec).length > 0 && titles(spec).every(title => title.includes("@production")), `${spec} must hold only @production tests`);
  assert.deepEqual(localSpecs(), specFiles.filter(spec => !PRODUCTION_ONLY.includes(spec)));
});

test("no spec opens a page that does not run it", () => {
  // astrion-site.spec.mjs checks the address of a link to the division page and never follows it.
  const mentionsOnly = { "astrion-site.spec.mjs": ["astrion-division"] };
  for (const spec of localSpecs()) {
    // "../name" is a page beside the Map Builder, which is the base address. "../../name" is a file read from the repository.
    const named = [...read(SPEC_DIR + spec).matchAll(/["'`](?:\.\.\/){1,2}([\w.-]+)/g)].map(match => match[1]);
    const pages = [...new Set(named)]
      .filter(name => existsSync(resolve(root, name)) && !(mentionsOnly[spec] ?? []).includes(name))
      .map(name => (statSync(resolve(root, name)).isDirectory() ? `${name}/` : name));
    // A spec that names no other page drives the Map Builder.
    for (const page of pages.length ? pages : ["geopresence/"]) {
      const rule = ruleFor(page);
      assert.ok(rule, `${spec} names ${page}, which has no rule`);
      if (rule.full || ALWAYS.includes(spec)) continue;
      const runs = rule.areas.flatMap(name => AREAS[name].specs);
      assert.ok(runs.includes(spec), `${spec} opens ${page}, so a change to ${page} must run it: add it to that entry of AREAS, or to ALWAYS if it spans pages`);
    }
  }
});

test("browser specs and their helpers import nothing from the rest of the repository", () => {
  for (const file of readdirSync(resolve(root, SPEC_DIR)).filter(name => name.endsWith(".mjs"))) {
    const imported = [...read(SPEC_DIR + file).matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1] ?? match[2]);
    for (const specifier of imported.filter(name => name.startsWith("."))) {
      assert.match(specifier, /^\.\/[\w.-]+\.mjs$/, `${file} imports ${specifier}; a module outside ${SPEC_DIR} would need a rule that runs this spec`);
    }
  }
});

test("a push is compared with the newest deploy that passed and is part of its history", () => {
  const sha = letter => letter.repeat(40);
  const deploys = [{ head_sha: sha("c"), run_number: 12 }, { head_sha: sha("b"), run_number: 11 }, { head_sha: sha("a"), run_number: 10 }];
  assert.equal(pickBase(deploys, () => true).run_number, 12);
  assert.equal(pickBase(deploys, candidate => candidate !== sha("c")).run_number, 11, "a deploy from history this push does not contain is skipped");
  assert.equal(pickBase(deploys, () => false), null);
  assert.equal(pickBase([], () => true), null);
  assert.equal(pickBase([{ head_sha: "HEAD; rm -rf ." }, { head_sha: null }], () => true), null, "only a full commit id is handed to git");
});

test("the short path needs a recent nightly run that passed, or a whole-suite deploy since it failed", () => {
  const now = Date.parse("2026-11-20T12:00:00Z"), at = hoursAgo => new Date(now - hoursAgo * 3_600_000).toISOString();
  const nightly = (conclusion, hoursAgo) => ({ conclusion, updated_at: at(hoursAgo), html_url: "https://github.com/AzJester/work/actions/runs/1" });
  const deploy = hoursAgo => ({ conclusion: "success", run_started_at: at(hoursAgo), updated_at: at(hoursAgo - 0.2) });

  assert.deepEqual(fullSuiteVerdict([nightly("success", 3)], [], now), { ok: true });
  assert.match(fullSuiteVerdict([], [deploy(1)], now).why, /has not finished/, "no nightly run yet means no short path");
  assert.match(fullSuiteVerdict([nightly("cancelled", 1), nightly("skipped", 2)], [deploy(1)], now).why, /has not finished/, "a cancelled run proves nothing");
  assert.deepEqual(fullSuiteVerdict([nightly("cancelled", 1), nightly("success", 20)], [], now), { ok: true }, "the newest run with a result decides");

  const failed = fullSuiteVerdict([nightly("failure", 3), nightly("success", 27)], [deploy(5)], now);
  assert.equal(failed.ok, false, "a deploy that started before the failure may have taken the short path and proves nothing");
  assert.match(failed.why, /failed \(https:\/\/github\.com\/AzJester\/work\/actions\/runs\/1\)/);
  for (const ending of ["timed_out", "startup_failure", "action_required"]) assert.equal(fullSuiteVerdict([nightly(ending, 3)], [], now).ok, false, `${ending} is not a pass`);
  assert.deepEqual(fullSuiteVerdict([nightly("failure", 3)], [deploy(1), deploy(5)], now), { ok: true }, "a deploy that started after the failure ran every spec and passed");

  const stale = fullSuiteVerdict([nightly("success", 24 * FULL_SUITE_MAX_AGE_DAYS + 1)], [deploy(1)], now);
  assert.equal(stale.ok, false, "a nightly run that stopped running stops the short path");
  assert.match(stale.why, new RegExp(`last finished ${FULL_SUITE_MAX_AGE_DAYS} days ago`));
  assert.equal(fullSuiteVerdict([nightly("success", 24 * FULL_SUITE_MAX_AGE_DAYS - 1)], [], now).ok, true);
  assert.equal(fullSuiteVerdict([{ conclusion: "success", updated_at: "not a date" }], [], now).ok, false);
});

test("the gate takes the short path only when every check agrees, and runs everything on any doubt", async () => {
  const now = Date.parse("2026-11-20T12:00:00Z"), sha = "a".repeat(40);
  const env = { GITHUB_EVENT_NAME: "push", GITHUB_WORKFLOW_REF: "AzJester/work/.github/workflows/pages.yml@refs/heads/main", GITHUB_TOKEN: "token", GITHUB_REPOSITORY: "AzJester/work", GITHUB_REF_NAME: "main" };
  const deploys = [{ head_sha: sha, run_number: 254, conclusion: "success", run_started_at: "2026-11-20T02:31:20Z" }];
  const green = [{ conclusion: "success", updated_at: "2026-11-20T09:30:00Z" }];
  const red = [{ conclusion: "failure", updated_at: "2026-11-20T09:30:00Z", html_url: "https://example.test/run" }];
  const asked = [];
  const using = (nightly, files, extra = {}) => ({
    runs: async (_env, workflow, status) => { asked.push(`${workflow}:${status}`); return workflow === FULL_SUITE_WORKFLOW ? nightly : deploys; },
    ancestor: () => true, changed: base => { assert.equal(base, sha); return files; }, now, ...extra,
  });

  const short = await gateDecision(env, using(green, ["mission-intelligence/index.html"]));
  assert.equal(short.all, false);
  assert.deepEqual(short.specs, ["app-hub-responsive.spec.mjs", "mission-intelligence.spec.mjs", "offline-routing.spec.mjs"]);
  assert.equal(short.comparedWith, "aaaaaaa, the last deploy that passed (run 254)");
  assert.deepEqual(asked, ["pages.yml:success", `${FULL_SUITE_WORKFLOW}:completed`], "it asks about deploys that passed, then about the nightly run");

  asked.length = 0;
  const shared = await gateDecision(env, using(green, ["mission-intelligence/index.html", "assets/dst-logo-black.png"]));
  assert.equal(shared.all, true);
  assert.match(shared.reasons[0], /^assets\/ is shared/);
  assert.deepEqual(asked, ["pages.yml:success"], "a shared file settles it without asking about the nightly run");

  const afterFailure = await gateDecision(env, using(red, ["mission-intelligence/index.html"]));
  assert.equal(afterFailure.all, true, "a failed nightly run sends the next push through every spec");
  assert.match(afterFailure.reasons[0], /nightly Full browser suite run failed/);

  for (const [why, decision] of [
    ["a run started by hand", await gateDecision({ ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, using(green, ["README.md"]))],
    ["a run without a token", await gateDecision({ ...env, GITHUB_TOKEN: "" }, using(green, ["README.md"]))],
    ["no earlier deploy in this history", await gateDecision(env, using(green, ["README.md"], { ancestor: () => false }))],
    ["no nightly run yet", await gateDecision(env, using([], ["README.md"]))],
    ["GitHub not answering", await gateDecision(env, using(green, ["README.md"], { runs: async () => { throw new Error("GitHub answered 503"); } }))],
    ["git failing", await gateDecision(env, using(green, ["README.md"], { changed: () => { throw new Error("bad object"); } }))],
  ]) {
    assert.equal(decision.all, true, `${why} must run every spec`);
    assert.deepEqual(decision.specs, []);
    assert.equal(decision.reasons.length, 1);
  }
});

test("the decision reads as a short report", () => {
  const selected = describe({ ...select("mission-intelligence/index.html"), comparedWith: "abc1234, the last deploy that passed (run 254)" }, 34).join("\n");
  assert.match(selected, /^Browser specs: 3 of 34 files\nCompared with abc1234, the last deploy that passed \(run 254\)\n {2}mission-intelligence\/: 1 file changed, runs the mission-intelligence specs\nRuns:/);
  assert.match(selected, /\n {2}app-hub-responsive\.spec\.mjs \(always\)\n {2}mission-intelligence\.spec\.mjs\n/);
  assert.equal(describe(select("scripts/app-updated.mjs", "scripts/build-vendor.mjs"), 34).join("\n"), "Browser specs: all 34 files\n  scripts/ is shared (2 files changed)");
  assert.match(describe(select("README.md", "CLAUDE.md"), 34).join("\n"), /\n {2}documentation: 2 files changed, no page or spec reads it\n/);
});

test("the deploy gate asks the script which specs to run and hands Playwright the answer", () => {
  const quality = job(pagesWorkflow, "quality");
  assert.match(quality, /actions\/checkout@v4\n\s+with:\n(?:\s+#[^\n]*\n)+\s+fetch-depth: 0/, "the comparison needs the commit of the last deploy that passed");
  assert.match(quality, /permissions:\n\s+contents: read\n(?:\s+#[^\n]*\n)*\s+actions: read/, "the script reads this repository's workflow runs");
  assert.match(quality, /id: specs\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/select-browser-tests\.mjs --github \|\| echo "::warning::[^"\n]+"\n/,
    "if the script itself breaks, the step passes with no file names and every spec runs");
  assert.match(quality, /env:\n\s+BROWSER_SPECS: \$\{\{ steps\.specs\.outputs\.files \}\}\n\s+run: npm run test:browser -- \$BROWSER_SPECS\n/, "no file names means every spec");
  assert.ok(quality.indexOf("run: npm test") < quality.indexOf("select-browser-tests.mjs --github"), "the source tests, which check the map, run first");
  assert.ok(quality.indexOf("select-browser-tests.mjs --github") < quality.indexOf("npm run test:browser"));
  const browserStep = quality.slice(quality.indexOf("- name: Run browser tests"), quality.indexOf("- name: Upload browser test report"));
  assert.doesNotMatch(browserStep, /continue-on-error|\|\||\bif:/, "a failing spec must stop the deploy");
  assert.doesNotMatch(quality, /continue-on-error|if: always\(\)/);
  assert.equal(packageJson.scripts["test:browser"], "playwright test --grep-invert @production", "the gate appends file names to this command");
  assert.equal(packageJson.scripts["test:browser:select"], "node scripts/select-browser-tests.mjs");
  assert.match(pagesWorkflow, /\n {2}backend:\n\s+needs: quality\n/, "nothing deploys before the gate passes");
  assert.match(pagesWorkflow, /\n {2}production-smoke:\n\s+needs: deploy\n/);
  assert.match(job(pagesWorkflow, "production-smoke"), /PRODUCTION_SMOKE: "1"\n\s+run: \|\n\s+export PLAYWRIGHT_BASE_URL="\$\{PAGES_URL%\/\}\/geopresence\/"\n\s+npm run test:browser:production/);
});

test("the nightly workflow runs every spec against main and publishes nothing", () => {
  const jobs = suiteWorkflow.slice(suiteWorkflow.indexOf("\njobs:"));
  assert.match(suiteWorkflow, /^name: Full browser suite$/m);
  assert.match(suiteWorkflow, /schedule:\n\s+- cron: "\d+ \d+ \* \* \*"/, "it runs once a day");
  assert.match(suiteWorkflow, /workflow_dispatch:/, "it can be started by hand");
  assert.match(suiteWorkflow, new RegExp(`branches: \\[main\\]\\n\\s+paths:\\n(?:\\s+#[^\\n]*\\n)*\\s+- \\.github/workflows/${FULL_SUITE_WORKFLOW.replace(".", "\\.")}\\n`), "it proves itself when it changes");
  assert.match(suiteWorkflow, /^permissions:\n {2}contents: read\n\n/m, "it can change nothing");
  assert.match(jobs, /run: timeout \d+m npm run test:browser\n/, "every spec, with no file names, and a hang ends as a failure");
  assert.doesNotMatch(jobs, /select-browser-tests|BROWSER_SPECS|deploy-pages|upload-pages-artifact|supabase|continue-on-error/);
  assert.match(suiteWorkflow, /^concurrency:\n {2}group: browser-suite-/m, "it must never hold up or cancel a deploy, which waits in the pages group");
});

test("the README says which specs a push runs and how to run them all", () => {
  const section = readme.slice(readme.indexOf("## How it's deployed"), readme.indexOf("## Build notes"));
  assert.ok(section.length > 1_000, "the deploy section holds the rules");
  assert.match(section, /\[`scripts\/select-browser-tests\.mjs`\]\(scripts\/select-browser-tests\.mjs\)/, "it points at the map");
  for (const spec of ALWAYS) assert.ok(section.includes(`\`${spec}\``), `it names ${spec}, which always runs`);
  for (const shared of ["assets/", "scripts/", "package.json", "playwright.config.mjs", ".github/", "apps.html", "sw.js", "manifest.webmanifest", "supabase/"]) {
    assert.ok(SHARED.includes(shared) && section.includes(`\`${shared}\``), `it lists ${shared} as shared`);
  }
  assert.match(section, /A path the map has no rule for \| Every spec \|/);
  assert.match(section, /compared with the last deploy that passed/);
  assert.match(section, /```bash\nnpm run test:browser:select\n```/, "it shows how to ask before pushing");
  assert.ok(section.includes(`\`.github/workflows/${FULL_SUITE_WORKFLOW}\``), "it names the nightly workflow");
  assert.match(section, new RegExp(`has not run for ${["zero", "one", "two", "three", "four", "five"][FULL_SUITE_MAX_AGE_DAYS]} days`), "it gives the age limit the script uses");
  assert.match(section, /Actions → Full browser suite → Run workflow/);
  assert.match(section, /Actions → Deploy to GitHub Pages → Run workflow/);
  assert.match(readme, new RegExp(`\\| \`\\.github/workflows/${FULL_SUITE_WORKFLOW.replace(".", "\\.")}\` \\|`), "the file table lists the nightly workflow");
  assert.match(readme, /\| `scripts\/select-browser-tests\.mjs` \|/, "the file table lists the script");
});
