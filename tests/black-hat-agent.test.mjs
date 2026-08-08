import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const appDir = resolve(rootDir, "black-hat-agent");
const appPath = resolve(appDir, "app.js");
const enginePath = resolve(appDir, "engine.js");
const importEnginePath = resolve(appDir, "import-engine.js");
const importWizardPath = resolve(appDir, "import-wizard.js");
const spreadsheetWorkerPath = resolve(appDir, "spreadsheet-worker.js");
const app = readFileSync(appPath, "utf8");
const engineSource = readFileSync(enginePath, "utf8");
const index = readFileSync(resolve(appDir, "index.html"), "utf8");
const styles = readFileSync(resolve(appDir, "styles.css"), "utf8");
const engine = await import(pathToFileURL(enginePath));

function workspaceFixture() {
  return {
    schemaVersion: 2,
    appVersion: "2.0.0",
    active: "p1",
    pursuits: [
      {
        id: "p1",
        name: "Test pursuit",
        customer: "Test customer",
        summary: "Synthetic opportunity.",
        playbook: "Competitive assessment",
        priorEstimate: 50,
        archived: false
      }
    ],
    criteria: [
      {
        id: "cr1",
        pursuitId: "p1",
        name: "Technical merit",
        weight: 60,
        ourScore: 5,
        classification: "Confirmed",
        rationale: "Proven.",
        evidenceIds: ["e1"],
        isGate: true
      },
      {
        id: "cr2",
        pursuitId: "p1",
        name: "Price",
        weight: 40,
        ourScore: 1,
        classification: "Hypothesis",
        rationale: "Uncertain.",
        evidenceIds: ["e2"],
        isGate: false
      }
    ],
    evidence: [
      {
        id: "e1",
        pursuitId: "p1",
        citation: "E-001",
        title: "Technical proof",
        source: "Synthetic source",
        url: "https://example.com/proof",
        confidence: "High",
        classification: "Confirmed",
        stance: "Support",
        note: "Supports technical score.",
        criterionIds: ["cr1"]
      },
      {
        id: "e2",
        pursuitId: "p1",
        citation: "E-002",
        title: "Price assumption",
        source: "Synthetic estimate",
        url: "",
        confidence: "Low",
        classification: "Hypothesis",
        stance: "Support",
        note: "Price remains uncertain.",
        criterionIds: ["cr2"]
      }
    ],
    competitors: [
      {
        id: "co1",
        pursuitId: "p1",
        name: "Competitor One",
        position: "Challenger",
        bidLikelihood: "Likely",
        strengths: "Scale",
        weaknesses: "Generic approach",
        strategy: "Lead with scale.",
        ghosting: "Question delivery capacity.",
        counterMoves: "Provide named proof.",
        classification: "Hypothesis",
        evidenceIds: ["e1"],
        scores: { cr1: 3, cr2: 5 }
      }
    ],
    actions: [
      {
        id: "a1",
        pursuitId: "p1",
        title: "Validate price",
        owner: "Pricing lead",
        due: "2026-08-01",
        priority: "High",
        status: "Open",
        finding: "Close price gap."
      }
    ],
    playbooks: [
      {
        id: "pb1",
        name: "Competitive assessment",
        description: "Test playbook",
        sections: "Full report",
        builtIn: true
      }
    ],
    runs: [],
    snapshots: []
  };
}

test("the public entry point uses only the Black Hat Agent product name", () => {
  assert.match(index, /<title>Black Hat Agent<\/title>/);
  assert.match(app, /<strong>Black Hat Agent<\/strong>/);
  assert.doesNotMatch(index + app, />\s*ASTRION\s*</i);
  assert.match(index, /<script\b[^>]*src="app\.js"[^>]*type="module"/);
  assert.match(index, /<script\b[^>]*src="vendor\/xlsx\.full\.min\.js"/);
  assert.doesNotMatch(index, /https?:\/\/|api[_-]?key|signin|sign-in/i);
});

test("workspace navigation is grouped, text-only, and free of icon shorthand", () => {
  for (const label of ["Workspace", "Analysis", "Workflow", "Results", "Help"]) {
    assert.match(app, new RegExp(`label:\\s*"${label}"`));
  }
  assert.match(app, /aria-current="page"/);
  assert.match(app, /\["guide",\s*"User Guide"\]/);
  assert.match(app, /guide:\s*guideView/);
  assert.doesNotMatch(app, /class="mark"/);
  assert.doesNotMatch(app, /\["portfolio",\s*"PF"/);
  assert.doesNotMatch(app, /<b>\s*\$\{/);
});

test("the engine and browser module parse without a build step", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", enginePath]));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", importEnginePath]));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", importWizardPath]));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", spreadsheetWorkerPath]));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", appPath]));
});

test("workspace validation rejects malformed data and broken relationships", () => {
  assert.equal(engine.validateWorkspace(workspaceFixture()).valid, true);
  const malformed = workspaceFixture();
  malformed.criteria[0].weight = -1;
  malformed.evidence[0].criterionIds = ["missing"];
  malformed.competitors[0].scores.missing = 4;
  const result = engine.validateWorkspace(malformed);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /invalid weight/i);
  assert.match(result.errors.join("\n"), /missing criterion/i);
});

test("workspace validation rejects unsafe IDs, score coercion, and pursuit boundary violations", () => {
  const hostile = workspaceFixture();
  hostile.criteria[0].id = `cr1"><script>`;
  assert.match(
    engine.validateWorkspace(hostile).errors.join("\n"),
    /safe record ID/i
  );

  const nonnumeric = workspaceFixture();
  nonnumeric.competitors[0].scores.cr1 = "not-a-score";
  assert.match(
    engine.validateWorkspace(nonnumeric).errors.join("\n"),
    /nonnumeric score|outside 1-5/i
  );

  const crossPursuit = workspaceFixture();
  crossPursuit.pursuits.push({
    id: "p2",
    name: "Other pursuit",
    customer: "Other customer",
    archived: false
  });
  crossPursuit.evidence.push({
    id: "e3",
    pursuitId: "p2",
    citation: "E-001",
    title: "Other evidence",
    source: "Synthetic source",
    criterionIds: []
  });
  crossPursuit.criteria[0].evidenceIds.push("e3");
  assert.match(
    engine.validateWorkspace(crossPursuit).errors.join("\n"),
    /another pursuit/i
  );
});

test("legacy imports repair reciprocal evidence links before strict v3 validation", () => {
  const legacy = workspaceFixture();
  legacy.schemaVersion = 2;
  legacy.evidence[0].criterionIds = [];
  assert.equal(engine.validateWorkspaceImport(legacy).valid, true);
  const migrated = engine.normalizeWorkspace(legacy, workspaceFixture());
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.evidence[0].criterionIds, ["cr1"]);
  assert.equal(engine.validateWorkspace(migrated).valid, true);

  const current = structuredClone(migrated);
  current.evidence[0].criterionIds = [];
  assert.match(
    engine.validateWorkspaceImport(current).errors.join("\n"),
    /nonreciprocal/i
  );
});

test("attachment and recovery snapshot validation fail closed", () => {
  const unsafeAttachment = engine.normalizeWorkspace(workspaceFixture(), workspaceFixture());
  unsafeAttachment.evidence[0].attachmentName = "payload.html";
  unsafeAttachment.evidence[0].attachmentType = "text/html";
  unsafeAttachment.evidence[0].attachmentData =
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
  assert.match(
    engine.validateWorkspace(unsafeAttachment).errors.join("\n"),
    /safe MIME type|allowed MIME type/i
  );

  const base = engine.normalizeWorkspace(workspaceFixture(), workspaceFixture());
  const snapshot = {
    id: "snapshot-1",
    active: "p1",
    createdAt: new Date().toISOString(),
    label: "Test",
    workspace: Object.fromEntries(
      ["pursuits", "criteria", "evidence", "competitors", "actions", "playbooks", "runs"].map(
        name => [name, structuredClone(base[name])]
      )
    )
  };
  assert.equal(engine.validateWorkspaceSnapshot(snapshot).valid, true);
  snapshot.workspace.criteria[0].evidenceIds = ["missing"];
  assert.equal(engine.validateWorkspaceSnapshot(snapshot).valid, false);
});

test("legacy workspaces migrate without mixing in unrelated sample records", () => {
  const legacy = {
    pursuits: [{ id: "legacy", name: "Legacy pursuit", customer: "Legacy customer" }],
    evidence: [],
    competitors: [],
    actions: [],
    playbooks: [],
    runs: [],
    active: "legacy"
  };
  const normalized = engine.normalizeWorkspace(legacy, workspaceFixture());
  assert.equal(normalized.schemaVersion, engine.SCHEMA_VERSION);
  assert.deepEqual(normalized.criteria, []);
  assert.equal(normalized.pursuits.length, 1);
  assert.equal(normalized.pursuits[0].id, "legacy");
});

test("competitive scoring normalizes weights and shrinks uncertain scores toward neutral", () => {
  const result = engine.calculateCompetitiveScores(workspaceFixture(), "p1");
  assert.equal(result.totalWeight, 100);
  assert.equal(result.us.cpi, 70);
  assert.equal(result.competitors[0].cpi, 60);
  assert.equal(result.margin, 10);
  assert.equal(result.us.coverage, 100);
  assert.ok(result.scenarioEstimate.value >= 5 && result.scenarioEstimate.value <= 95);
  assert.match(JSON.stringify(result.scenarioEstimate), /trust/);
});

test("conflicting evidence reduces confidence and is disclosed in the report", () => {
  const workspace = workspaceFixture();
  workspace.evidence.push({
    id: "e3",
    pursuitId: "p1",
    citation: "E-003",
    title: "Contrary technical observation",
    source: "Synthetic contrary source",
    url: "",
    confidence: "Medium",
    classification: "Inference",
    stance: "Challenge",
    note: "Challenges technical proof.",
    criterionIds: ["cr1"]
  });
  workspace.criteria[0].evidenceIds.push("e3");
  const result = engine.calculateCompetitiveScores(workspace, "p1");
  assert.equal(result.us.details[0].classification, "Conflicting");
  assert.ok(result.us.confidence < 75);
  const report = engine.buildCompetitiveReport(workspace, "p1", {
    playbook: "Competitive assessment",
    facilitator: "Facilitator",
    participants: "Capture team",
    question: "What changes the outcome?",
    notes: "Challenge assumptions."
  });
  assert.match(report.output, /Conflicting evidence exists for Technical merit/i);
  assert.match(report.output, /\[E-001\]/);
  assert.match(report.output, /\[E-003\]/);
});

test("reports contain the complete decision-oriented competitive analysis", () => {
  const report = engine.buildCompetitiveReport(workspaceFixture(), "p1", {
    playbook: "Competitive assessment",
    facilitator: "Facilitator",
    participants: "Capture team",
    question: "Where are we vulnerable?",
    notes: "Test note."
  });
  for (const heading of [
    "Executive summary",
    "Opportunity and customer priorities",
    "Intelligence quality",
    "Competitive landscape",
    "Weighted scoring matrix",
    "Relative strengths and vulnerabilities",
    "Customer evaluator simulation",
    "Win themes and discriminator credibility",
    "Counter-positioning and mitigation",
    "Prioritized action plan",
    "Evidence register",
    "Methodology"
  ]) {
    assert.match(report.output, new RegExp(heading, "i"));
  }
  assert.match(report.output, /ghosting themes/i);
  assert.match(report.output, /Scenario win estimate/i);
  assert.match(report.output, /not a forecast/i);
  assert.equal(report.version, 1);
  assert.equal(report.status, "Draft");
  assert.ok(report.sections.length >= 10);
});

test("Word rendering escapes imported content before producing HTML", () => {
  const html = engine.markdownToWordHtml(
    "# Report\n\n<script>alert('x')</script>\n\n- **Safe**\n\n| Item | Score |\n| --- | --- |\n| <img src=x onerror=alert(1)> | 4 |",
    "Test"
  );
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/i);
  assert.match(html, /<strong>Safe<\/strong>/);
  assert.match(html, /<table><thead>/);
  assert.match(html, /<th scope="col">Item<\/th>/);
  assert.doesNotMatch(html, /<img\b/i);
});

test("the application exposes complete editing, recovery, and export workflows", () => {
  for (const helper of [
    "updateRecord",
    "restorePursuit",
    "saveReportVersion",
    "exportMarkdown",
    "exportVisuals",
    "exportWord",
    "exportPDF"
  ]) {
    assert.match(app, new RegExp(`function\\s+${helper}\\s*\\(`));
  }
  assert.match(app, /function\s+rowActions\s*\(/);
  assert.match(app, /data-edit="\$\{esc\(/);
  assert.match(app, /data-delete="\$\{esc\(/);
  assert.match(app, /data-restore-pursuit/);
  assert.match(app, /data-restore-snapshot/);
  assert.match(app, /data-edit-report/);
  assert.match(app, /data-restore-report/);
  assert.match(app, /application\/msword/);
  assert.match(app, /\.print\s*\(/);
  assert.match(app, /MAX_ATTACHMENT_BYTES/);
  assert.match(app, /data-clone-playbook/);
  assert.match(app, /openLocalImportWizard/);
  assert.match(app, /data-action="tabular-import"/);
  assert.match(app, /function\s+guideView\s*\(/);
});

test("legacy reports never hybridize saved text with current visuals and missing CPI stays unknown", () => {
  const visualResolver = app.match(
    /function\s+reportVisualSpecs\s*\([^)]*\)\s*\{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(visualResolver);
  assert.match(visualResolver, /visualSnapshot\?\.visuals/);
  assert.match(visualResolver, /:\s*null/);
  assert.doesNotMatch(visualResolver, /buildRunVisualizationSnapshot/);
  assert.match(
    app,
    /Analysis visuals are unavailable because this legacy report has no report-time visual snapshot/
  );
  assert.match(app, /class="export-visual legacy-visual-notice"/);
  assert.match(app, /function\s+formatCpi\s*\(/);
  assert.match(app, /value === null \|\| value === undefined \|\| value === ""/);
  assert.doesNotMatch(app, /\?\?\s*50[^;]*CPI\s*\/\s*100/);
  assert.doesNotMatch(app, /\$\{scores\.us\.cpi\}\/100/);
});

test("the interface provides accessibility and responsive layout contracts", () => {
  assert.match(app, /aria-label="Workspace navigation"/);
  assert.match(app, /class="skip-link"/);
  assert.match(app, /role="status"/);
  assert.match(index, /<meta name="viewport"/);
  assert.match(styles, /@media\(max-width:/);
  assert.match(styles, /\.skip-link:focus/);
  assert.match(styles, /@media|max-width/);
});

test("documentation states the no-AI and browser-only security boundary", () => {
  const docs = [
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/DEPLOYMENT.md",
    "docs/PRODUCT_SPEC.md",
    "docs/SECURITY.md",
    "docs/USER_GUIDE.md"
  ]
    .map(path => readFileSync(resolve(appDir, path), "utf8"))
    .join("\n");
  assert.match(docs, /Black Hat Agent/);
  assert.match(docs, /no AI|does not use an AI|not an AI/i);
  assert.match(docs, /localStorage|browser storage/i);
  assert.match(docs, /Save as PDF/i);
  assert.match(docs, /\.doc/i);
  assert.doesNotMatch(docs, /Astrion Black Hat Agent/i);
});

test("engine source documents confidence factors and evidence-bounded scoring", () => {
  for (const factor of ["Confirmed", "Inference", "Hypothesis", "Conflicting", "Missing"]) {
    assert.match(engineSource, new RegExp(`${factor}\\s*:\\s*[0-9.]`));
  }
  assert.match(engineSource, /effectiveScore/);
  assert.match(engineSource, /Competitive Position Index/);
  assert.match(engineSource, /workspaceInputHash/);
});
