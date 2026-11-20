import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The deploy workflow builds the site in one job and publishes it in another. Deploy run 44766481574 showed why:
// the publish step asked GitHub for the upload a moment after the same job had made it, was told there was none,
// and failed. The re-run uploaded again under the same name, and the publish step refused to choose between the two.
// These tests hold the layout that survives both: one upload per attempt under a name of its own, published by a job
// that can run again alone.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const workflow = read(".github/workflows/pages.yml");
const readme = read("README.md");
const jobNames = [...workflow.slice(workflow.indexOf("\njobs:")).matchAll(/^ {2}([\w-]+):$/gm)].map(match => match[1]);
/** The body of one job, as text, without the lines that are only a comment. */
const job = name => (workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1] ?? "").replace(/^ *#.*\n/gm, "");
const count = (text, pattern) => text.match(pattern)?.length ?? 0;

test("the site is built and uploaded by a job that publishes nothing", () => {
  const build = job("build");
  assert.match(workflow, /\n {2}build:\n\s+needs: quality\n/, "nothing is built before the tests pass, and the build does not hold up the backend");
  assert.doesNotMatch(build, /deploy-pages|environment:/, "the build job cannot publish");
  for (const step of ["actions/checkout@v4", "actions/configure-pages@v5", "touch _site/.nojekyll", "scripts/app-updated.mjs", "actions/upload-pages-artifact@v3"]) {
    assert.ok(build.includes(step), `the build job holds ${step}`);
  }
  assert.ok(build.indexOf("scripts/app-updated.mjs") < build.indexOf("actions/upload-pages-artifact@v3"), "the upload is the finished site");
  assert.ok(build.trimEnd().endsWith("path: '_site'"), "the upload is the last thing the build job does");
});

test("each attempt uploads the site under a name of its own", () => {
  const build = job("build");
  assert.match(build, /id: artifact\n\s+run: echo "name=github-pages-\$\{\{ github\.run_attempt \}\}" >> "\$GITHUB_OUTPUT"\n/,
    "a run keeps the uploads of every attempt, so the name carries the attempt number");
  assert.match(build, /uses: actions\/upload-pages-artifact@v3\n\s+with:\n\s+name: \$\{\{ steps\.artifact\.outputs\.name \}\}\n\s+path: '_site'\n/);
  assert.match(build, /\n\s+outputs:\n\s+artifact_name: \$\{\{ steps\.artifact\.outputs\.name \}\}\n/, "the build job hands the name on");
  assert.ok(build.indexOf("id: artifact") < build.indexOf("actions/upload-pages-artifact@v3"), "the name exists before the upload reads it");
  assert.equal(count(workflow, /uses: actions\/upload-pages-artifact@/g), 1, "one upload per attempt");
  assert.doesNotMatch(build, /retention-days/, "the README says GitHub keeps the upload for one day, which is the action's default");
});

test("the deploy job publishes the upload the build job names, and builds nothing itself", () => {
  const deploy = job("deploy");
  assert.match(workflow, /\n {2}deploy:\n\s+needs: \[backend, build\]\n/, "it waits for the backend and for the upload");
  assert.match(deploy, /id: deployment\n\s+uses: actions\/deploy-pages@v4\n\s+with:\n\s+artifact_name: \$\{\{ needs\.build\.outputs\.artifact_name \}\}\n/);
  assert.doesNotMatch(deploy, /run_attempt/,
    "when this job runs again alone, its attempt number names an upload that does not exist: the name must come from the build job");
  assert.doesNotMatch(deploy, /upload-|actions\/checkout|configure-pages|\brun:/, "a job that uploads and publishes can ask for the upload before GitHub lists it");
  assert.doesNotMatch(deploy, /continue-on-error|\bif:/, "a failed publish fails the job");
  assert.equal(count(workflow, /uses: actions\/deploy-pages@/g), 1, "nothing else publishes");
});

test("the jobs after the deploy still find it", () => {
  const deploy = job("deploy");
  assert.match(deploy, /\n\s+outputs:\n\s+page_url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}\n/);
  assert.match(deploy, /\n\s+environment:\n\s+name: github-pages\n\s+url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}\n/);
  assert.match(workflow, /\n {2}production-smoke:\n\s+needs: deploy\n/);
  assert.match(job("production-smoke"), /PAGES_URL: "\$\{\{ needs\.deploy\.outputs\.page_url \}\}"\n/);
});

test("the README says how to start a failed deploy again", () => {
  const start = readme.indexOf("### Running a failed deploy again");
  // One line, so that the checks below do not depend on where the README wraps.
  const section = readme.slice(start, readme.indexOf("## Build notes")).replace(/\s+/g, " ");
  assert.ok(start > readme.indexOf("## How it's deployed") && section.length > 500, "the deploy section holds the rules");
  for (const name of jobNames) assert.ok(section.includes(`\`${name}\``), `it names the ${name} job`);
  assert.match(section, new RegExp(`A run has ${["zero", "one", "two", "three", "four", "five", "six"][jobNames.length]} jobs\\.`));
  assert.ok(section.includes("`github-pages-1`"), "it shows what an upload is called");
  assert.match(section, /- \*\*Re-run failed jobs\*\* [^-]*publishes the site the earlier attempt built/);
  assert.match(section, /keeps that upload for one day/);
  assert.match(section, /- \*\*Re-run all jobs\*\* tests, builds and publishes again/);
  assert.match(section, /only the newest run/, "an older run publishes an older site");
});
