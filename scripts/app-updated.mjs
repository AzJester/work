// Stamps each Application Library entry in apps.html with the date its application last changed.
//
// Applications in this repository take the date of the last commit that touched what they publish.
// Applications in other repositories take the date of the last commit on that repository's default branch (--remote).
// The deploy runs this on the published copy, so the dates on the site are current at every deploy without anyone
// maintaining them. The dates committed in apps.html are the fallback when a lookup fails.
//
// Usage: node scripts/app-updated.mjs [--file apps.html] [--remote] [--seed dates.json]
//   --remote  ask the GitHub API about other repositories (uses GITHUB_TOKEN when set)
//   --seed    a JSON object of "owner/repo" -> ISO date, used instead of the API
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "AzJester", HERE = "work", SITE = `https://azjester.github.io/${HERE}/`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The catalog entries in the page source, each with the span of text it occupies. */
export function readCatalog(html) {
  const block = html.match(/const catalog = \[([\s\S]*?)\n\s*\];/);
  if (!block) throw new Error("apps.html has no catalog");
  const offset = block.index + block[0].indexOf(block[1]), starts = [...block[1].matchAll(/\n\s*title: "([^"]+)"/g)];
  return starts.map((m, i) => {
    const start = offset + m.index, end = offset + (i + 1 < starts.length ? starts[i + 1].index : block[1].length), text = html.slice(start, end);
    const field = (name) => text.match(new RegExp(`\\n\\s*${name}: "([^"]*)"`))?.[1] ?? "";
    return { title: m[1], repo: field("repo"), liveUrl: field("liveUrl"), repoUrl: field("repoUrl"), updated: field("updated"), start, end };
  });
}

/** What an application in this repository publishes, as a path from the repository root. */
export function publishedPath(app) {
  if (app.repo !== HERE) return null;
  if (app.liveUrl.startsWith(SITE)) return app.liveUrl.slice(SITE.length).replace(/[?#].*$/, "").replace(/\/$/, "") || "index.html";
  return app.repoUrl.match(/\/(?:blob|tree)\/[^/]+\/(.+)$/)?.[1] ?? null;
}

/** Date of the last commit that touched a path, or null when history does not reach it. */
export function commitDate(path, cwd = root) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", path], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return DAY.test(out) ? out : null;
  } catch { return null; }
}

/** Whether history here is complete. In a shallow clone the oldest commit looks like it changed every file. */
export function hasFullHistory(cwd = root) {
  try { return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "false"; } catch { return false; }
}

/** Date of the last commit on a repository's default branch, or null. Never throws. */
export async function remoteDate(fullName, fetchImpl = fetch, token = process.env.GITHUB_TOKEN) {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${fullName}/commits?per_page=1`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "app-library-dates", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const day = String((await response.json())?.[0]?.commit?.committer?.date ?? "").slice(0, 10);
    return DAY.test(day) ? day : null;
  } catch { return null; }
}

/** The page source with each named entry's date replaced. Entries without a date field are left alone. */
export function stamp(html, dates) {
  let out = "", at = 0;
  for (const app of readCatalog(html)) {
    const day = dates.get(app.title);
    out += html.slice(at, app.start);
    out += day && DAY.test(day) ? html.slice(app.start, app.end).replace(/(\n\s*updated: ")[^"]*(")/, `$1${day}$2`) : html.slice(app.start, app.end);
    at = app.end;
  }
  return out + html.slice(at);
}

/** Works out the date for every entry. Anything that cannot be looked up keeps the date it had. */
export async function collect(html, { remote = false, seed = {}, fetchImpl = fetch, cwd = root } = {}) {
  const dates = new Map(), full = hasFullHistory(cwd), notes = [];
  for (const app of readCatalog(html)) {
    if (app.repo === HERE) {
      const path = publishedPath(app);
      const day = full && path && existsSync(resolve(cwd, path)) ? commitDate(path, cwd) : null;
      if (day) dates.set(app.title, day); else notes.push(`${app.title}: kept ${app.updated || "no date"} (${full ? "no history for " + path : "shallow clone"})`);
    } else if (app.repo) {
      const name = `${OWNER}/${app.repo}`;
      const day = seed[name] ? String(seed[name]).slice(0, 10) : remote ? await remoteDate(name, fetchImpl) : null;
      if (day) dates.set(app.title, day); else if (remote) notes.push(`${app.title}: kept ${app.updated || "no date"} (no answer for ${name})`);
    }
  }
  return { dates, notes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const file = resolve(process.cwd(), arg("--file") ?? resolve(root, "apps.html")), html = readFileSync(file, "utf8");
  const seed = arg("--seed") ? JSON.parse(readFileSync(resolve(process.cwd(), arg("--seed")), "utf8")) : {};
  const { dates, notes } = await collect(html, { remote: process.argv.includes("--remote"), seed });
  const next = stamp(html, dates), before = new Map(readCatalog(html).map((a) => [a.title, a.updated]));
  if (next !== html) writeFileSync(file, next);
  for (const [title, day] of dates) if (before.get(title) !== day) console.log(`${title}: ${before.get(title) || "none"} -> ${day}`);
  for (const note of notes) console.log(note);
  console.log(`${dates.size} of ${before.size} dates looked up, ${[...dates].filter(([t, d]) => before.get(t) !== d).length} changed`);
}
