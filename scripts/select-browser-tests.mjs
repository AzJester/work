// Chooses the browser specs the deploy gate runs for a change.
//
// Running every Playwright spec takes about ten minutes and most pushes change one page. The map below says which specs
// a path can affect. A push that stays inside mapped pages runs those pages' specs plus the specs in ALWAYS. Anything
// else runs the whole suite: a shared file, a path no rule covers, or a comparison this script cannot make.
// tests/browser-test-selection.test.mjs holds the map to the repository: every tracked file needs a rule, every spec
// needs an owner, and no spec may open a page that does not run it.
//
// Usage: node scripts/select-browser-tests.mjs [--base <ref> | --files <path>... | --github]
//   (no option)  the work on this branch, committed or not, compared with origin/main
//   --base       the same, compared with another commit
//   --files      what a change to these paths needs
//   --github     the deploy gate: compares the push with the last deploy that passed and writes the answer for the workflow
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_DIR = "tests/browser/";
/** The workflow that runs every spec each night. The gate takes the short path only while its last run is green. */
export const FULL_SUITE_WORKFLOW = "browser-suite.yml";
/** How long the gate trusts the nightly run to be alive without seeing a new one. */
export const FULL_SUITE_MAX_AGE_DAYS = 3;

/** Pages and applications with browser specs of their own. A change under `paths` runs `specs`. A path ending in "/" is a folder. */
export const AREAS = {
  astrion: { paths: ["astrion/"], specs: ["astrion-landing.spec.mjs"] },
  "astrion-site": { paths: ["astrion-site/"], specs: ["astrion-site.spec.mjs"] },
  "black-hat-agent": { paths: ["black-hat-agent/"], specs: ["black-hat-agent-redirect.spec.mjs"] },
  "budget-planner": { paths: ["budget-planner.html", "hours-planner.html"], specs: ["budget-planner.spec.mjs"] },
  geopresence: {
    paths: ["geopresence/"],
    specs: [
      "brand-typography.spec.mjs", "dense-metro.spec.mjs", "exports.spec.mjs", "location-import.spec.mjs", "pins-on-points.spec.mjs",
      "project-history.spec.mjs", "responsive-accessibility.spec.mjs", "sidebar-pins.spec.mjs", "workspace.spec.mjs",
    ],
  },
  "mission-intelligence": { paths: ["mission-intelligence/"], specs: ["mission-intelligence.spec.mjs"] },
  "relief-map": { paths: ["relief-map.html", "relief-map/"], specs: ["relief-map.spec.mjs"] },
  roadmap: {
    paths: ["roadmap.html"],
    specs: [
      "roadmap-backup.spec.mjs", "roadmap-collaboration.spec.mjs", "roadmap-editor-layout.spec.mjs", "roadmap-html-export.spec.mjs",
      "roadmap-redesign.spec.mjs", "roadmap-template.spec.mjs", "roadmap-undo-toast.spec.mjs", "roadmap-xlsx-export.spec.mjs",
    ],
  },
  // The Workbench loads the SheetJS library vendored in black-hat-agent/, so that folder runs these specs too.
  "solutions-architect": {
    paths: ["solutions-architect/", "black-hat-agent/"],
    specs: [
      "solutions-architect.spec.mjs", "solutions-architect-capture-ingestion.spec.mjs", "solutions-architect-edge-cases.spec.mjs",
      "solutions-architect-knowledge-base.spec.mjs", "solutions-architect-meeting-capture.spec.mjs",
      "solutions-architect-mission-segments.spec.mjs", "solutions-architect-readability.spec.mjs", "solutions-architect-theme.spec.mjs",
    ],
  },
  topo: { paths: ["topo/"], specs: ["topo.spec.mjs"] },
};

/**
 * Specs that run on every push, because their subject is not one page. The Application Library lists every
 * application. The root service worker precaches the tracker, the roadmap, the dashboard and the Map Builder, so
 * every Map Builder and roadmap spec fetches those pages through it. offline-routing.spec.mjs is the spec that fails
 * when that shell is broken: the others pass with any of those pages changed or missing.
 */
export const ALWAYS = ["app-hub-responsive.spec.mjs", "offline-routing.spec.mjs"];

/** Specs whose tests all run against the deployed site, in the production-smoke job. Only a whole-suite run loads them before a deploy. */
export const PRODUCTION_ONLY = ["production-smoke.spec.mjs", "topo-production-smoke.spec.mjs"];

/** Files that many pages or the test run itself depend on. A change to any of them runs every spec. */
export const SHARED = [
  ".gitattributes", ".github/", ".gitignore",
  "apps.html", "apps-og.png", "assets/", "manifest.webmanifest", "sw.js",
  "package.json", "package-lock.json", "pnpm-lock.yaml", "playwright.config.mjs", "scripts/",
  // The tracker, the roadmap, the dashboard and the Workbench call this backend.
  "supabase/",
  // Helpers and fixtures. The spec files in this folder have longer rules of their own.
  SPEC_DIR,
];

/** Pages that no browser spec opens, apart from the specs in ALWAYS. A change to one adds nothing to the run. */
export const NO_SPECS = [
  "LDAWIF/", "astrion-division/", "astrion-film/", "phx-digital-twin/",
  "dashboard.html", "embed-snippet.html", "index.html", "poster-anim.html", "poster.gif", "poster.html", "poster.png",
  "radar-signal-chain.html", "status.html", "tracker.html", "weekly-task-tracker.html",
];

/** Kinds of file that cannot change a browser spec's result. */
const UNAFFECTING = [
  { test: /^tests\/[^/]+\.test\.mjs$/, label: "source tests", note: "the source tests always run in full before the browser specs" },
  { test: /^[^/]+\.md$/, label: "documentation", note: "no page or spec reads it" },
];

const RULES = buildRules();

function buildRules() {
  const rules = new Map();
  const claim = (path, rule) => {
    const held = rules.get(path);
    if (held && (held.full || rule.full || held.note || rule.note)) throw new Error(`${path} has two conflicting rules in the browser spec map`);
    rules.set(path, held ? { areas: [...held.areas, ...rule.areas] } : rule);
  };
  for (const path of SHARED) claim(path, { full: "is shared" });
  for (const path of NO_SPECS) claim(path, { areas: [], note: "no browser spec opens it" });
  for (const spec of ALWAYS) claim(SPEC_DIR + spec, { areas: [], note: "it runs on every push" });
  for (const spec of PRODUCTION_ONLY) claim(SPEC_DIR + spec, { full: "runs against the deployed site, and only a whole-suite run loads it first" });
  for (const [name, area] of Object.entries(AREAS)) for (const path of [...area.paths, ...area.specs.map(spec => SPEC_DIR + spec)]) claim(path, { areas: [name] });
  return rules;
}

/** The rule for one path: the longest listed path that contains it, then the kinds of file that affect nothing. Null when no rule covers it. */
export function ruleFor(file) {
  let best = null;
  for (const [path, rule] of RULES) {
    if ((path.endsWith("/") ? file.startsWith(path) : file === path) && (!best || path.length > best.path.length)) best = { path, ...rule };
  }
  if (best) return best;
  const kind = UNAFFECTING.find(entry => entry.test.test(file));
  return kind ? { path: kind.label, areas: [], note: kind.note } : null;
}

/** Every spec the gate can run before a deploy, as file names. */
export function localSpecs(dir = resolve(root, SPEC_DIR)) {
  return readdirSync(dir).filter(name => name.endsWith(".spec.mjs") && !PRODUCTION_ONLY.includes(name)).sort();
}

/**
 * What a set of changed paths needs: `all` for the whole suite, otherwise the `specs` to run. `reasons` says why,
 * one line per rule the change touched.
 */
export function selectBrowserSpecs(changed) {
  const touched = new Map();
  for (const file of new Set(changed)) {
    const rule = ruleFor(file) ?? { path: file.includes("/") ? `${file.split("/")[0]}/` : file, full: "has no rule in the map" };
    const entry = touched.get(rule.path) ?? { ...rule, count: 0 };
    entry.count += 1;
    touched.set(rule.path, entry);
  }
  const entries = [...touched.values()];
  const whole = entries.filter(entry => entry.full);
  const files = entry => (entry.count === 1 ? "1 file" : `${entry.count} files`);
  if (whole.length) return { all: true, specs: [], reasons: whole.map(entry => `${entry.path} ${entry.full} (${files(entry)} changed)`) };
  const areas = new Set(entries.flatMap(entry => entry.areas));
  const specs = [...new Set([...ALWAYS, ...[...areas].flatMap(name => AREAS[name].specs)])].sort();
  const reasons = entries.map(entry => `${entry.path}: ${files(entry)} changed, ${entry.areas.length ? `runs the ${entry.areas.join(" and ")} specs` : entry.note}`);
  return { all: false, specs, reasons: reasons.length ? reasons : ["nothing changed"] };
}

/** The newest deploy that passed and is part of this history. The push is compared with it. Null when there is none. */
export function pickBase(deploys, isAncestor) {
  return deploys.find(run => /^[0-9a-f]{40}$/.test(run.head_sha ?? "") && isAncestor(run.head_sha)) ?? null;
}

/**
 * Whether the nightly whole-suite run backs the short path right now. `suiteRuns` are its completed runs and
 * `deploys` the deploys that passed, both newest first. A failed nightly run stops the short path until a deploy
 * started after it has passed: that deploy ran every spec, because of this rule.
 */
export function fullSuiteVerdict(suiteRuns, deploys, now = Date.now()) {
  // A cancelled or skipped run proves nothing either way. Any other ending but success counts as a failure.
  const last = suiteRuns.find(run => run.conclusion && !["cancelled", "skipped"].includes(run.conclusion));
  if (!last) return { ok: false, why: "the nightly Full browser suite run has not finished on this branch yet" };
  const ended = Date.parse(last.updated_at), days = (now - ended) / 86_400_000;
  if (!Number.isFinite(days)) return { ok: false, why: "the last nightly Full browser suite run has no finish time" };
  if (days > FULL_SUITE_MAX_AGE_DAYS) return { ok: false, why: `the nightly Full browser suite run last finished ${Math.floor(days)} days ago` };
  if (last.conclusion === "success") return { ok: true };
  if (deploys.some(run => Date.parse(run.run_started_at) > ended)) return { ok: true };
  return { ok: false, why: `the last nightly Full browser suite run failed (${last.html_url})` };
}

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
const names = (output) => output.split("\0").filter(Boolean);
const everything = (why) => ({ all: true, specs: [], reasons: [why] });

function isAncestor(sha) {
  try { git(["merge-base", "--is-ancestor", sha, "HEAD"]); return true; } catch { return false; }
}

/** Paths that differ between a commit and HEAD. A renamed file counts at both its old and its new path. */
function changedSince(sha) {
  return names(git(["diff", "--name-only", "--no-renames", "-z", sha, "HEAD"]));
}

/** Paths this branch changes compared with where it left `base`, including work that is not committed yet. */
function localChanges(base) {
  const fork = git(["merge-base", base, "HEAD"]).trim();
  return [...names(git(["diff", "--name-only", "--no-renames", "-z", fork])), ...names(git(["ls-files", "--others", "--exclude-standard", "-z"]))];
}

async function workflowRuns(env, workflow, status) {
  const url = `${env.GITHUB_API_URL || "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs`
    + `?branch=${encodeURIComponent(env.GITHUB_REF_NAME)}&status=${status}&per_page=20`;
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "browser-spec-selection", authorization: `Bearer ${env.GITHUB_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the ${workflow} runs`);
  return (await response.json()).workflow_runs ?? [];
}

/**
 * The deploy gate's answer for the run described by the GitHub Actions environment. Any doubt means the whole suite:
 * a run that is not a push, no earlier deploy to compare with, a nightly run that is failing or missing, or an error.
 */
export async function gateDecision(env = process.env, { runs = workflowRuns, ancestor = isAncestor, changed = changedSince, now = Date.now() } = {}) {
  try {
    if (env.GITHUB_EVENT_NAME !== "push") return everything("this run was not started by a push");
    const workflow = env.GITHUB_WORKFLOW_REF?.match(/\/\.github\/workflows\/([^@/]+)@/)?.[1];
    if (!workflow || !env.GITHUB_TOKEN) return everything("the run does not say which workflow it is, or has no token to ask GitHub with");
    const deploys = await runs(env, workflow, "success");
    const base = pickBase(deploys, ancestor);
    if (!base) return everything("no deploy that passed is part of this push's history");
    const decision = { ...selectBrowserSpecs(changed(base.head_sha)), comparedWith: `${base.head_sha.slice(0, 7)}, the last deploy that passed (run ${base.run_number})` };
    if (decision.all) return decision;
    const verdict = fullSuiteVerdict(await runs(env, FULL_SUITE_WORKFLOW, "completed"), deploys, now);
    return verdict.ok ? decision : { ...everything(verdict.why), comparedWith: decision.comparedWith };
  } catch (error) {
    return everything(`the comparison failed: ${error.message}${error.cause?.message ? ` (${error.cause.message})` : ""}`);
  }
}

/** The decision as plain lines, for the log and the run summary. */
export function describe(decision, total = localSpecs().length) {
  const head = decision.all ? `Browser specs: all ${total} files` : `Browser specs: ${decision.specs.length} of ${total} files`;
  const lines = [head, ...(decision.comparedWith ? [`Compared with ${decision.comparedWith}`] : []), ...decision.reasons.map(reason => `  ${reason}`)];
  if (!decision.all) lines.push("Runs:", ...decision.specs.map(spec => `  ${spec}${ALWAYS.includes(spec) ? " (always)" : ""}`));
  return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  let decision;
  if (args.includes("--github")) decision = await gateDecision();
  else if (args.includes("--files")) decision = selectBrowserSpecs(args.slice(args.indexOf("--files") + 1));
  else {
    const base = option("--base") ?? "origin/main";
    try { decision = { ...selectBrowserSpecs(localChanges(base)), comparedWith: `where this branch left ${base}` }; }
    catch { decision = everything(`this checkout cannot be compared with ${base}`); }
  }
  const lines = describe(decision), files = decision.specs.map(spec => SPEC_DIR + spec).join(" ");
  if (!args.includes("--github")) lines.push(`Run them: npm run test:browser${files ? ` -- ${files}` : ""}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${decision.all ? "all" : "selected"}\nfiles=${files}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      `### ${lines[0]}`, "",
      ...(decision.comparedWith ? [`Compared with ${decision.comparedWith}.`, ""] : []),
      ...decision.reasons.map(reason => `- ${reason}`),
      ...(decision.all ? [] : ["", `Runs: ${decision.specs.map(spec => `\`${spec}\``).join(", ")}`]),
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
  }
}
