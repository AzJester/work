import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const engine = await import(
  pathToFileURL(resolve(testDir, "..", "black-hat-agent", "engine.js"))
);

function workspaceFixture() {
  return {
    schemaVersion: engine.SCHEMA_VERSION,
    appVersion: "3.0.0",
    active: "p1",
    pursuits: [{ id: "p1", name: "Pursuit", customer: "Customer", priorEstimate: 50 }],
    criteria: [
      {
        id: "cr1",
        pursuitId: "p1",
        name: "Technical merit",
        weight: 100,
        ourScore: 4,
        classification: "Confirmed",
        evidenceIds: ["e1"]
      }
    ],
    evidence: [
      {
        id: "e1",
        pursuitId: "p1",
        citation: "E-001",
        title: "Technical proof",
        source: "Synthetic source",
        url: "",
        attachmentType: "",
        attachmentData: "",
        criterionIds: ["cr1"]
      }
    ],
    competitors: [
      {
        id: "co1",
        pursuitId: "p1",
        name: "Competitor",
        classification: "Hypothesis",
        evidenceIds: ["e1"],
        scores: { cr1: 3 }
      }
    ],
    actions: [],
    playbooks: [{ id: "pb1", name: "Assessment" }],
    runs: [],
    snapshots: []
  };
}

function snapshotFrom(workspace, id = "snapshot-1") {
  return {
    id,
    active: workspace.active,
    createdAt: "2026-07-26T12:00:00.000Z",
    label: "Recovery point",
    workspace: Object.fromEntries(
      [
        "pursuits",
        "criteria",
        "evidence",
        "competitors",
        "actions",
        "playbooks",
        "runs"
      ].map(name => [name, structuredClone(workspace[name])])
    )
  };
}

function compactVisualSnapshot() {
  const base = (type, title) => ({
    type,
    title,
    description: `${title} description`
  });
  return {
    schemaVersion: 1,
    snapshotVersion: 2,
    pursuitId: "p1",
    metrics: {
      ourCpi: 75,
      strongestRivalCpi: 50,
      scenario: 60,
      coverage: 80,
      confidence: 70
    },
    visuals: {
      rankedCpi: {
        ...base("ranked-cpi", "CPI comparison"),
        entities: [
          {
            id: "entity-0",
            name: "Our team",
            cpi: 75,
            coverage: 80,
            confidence: 70,
            isUs: true
          },
          {
            id: "entity-1",
            name: "Competitor",
            cpi: 50,
            coverage: 60,
            confidence: 50,
            isUs: false
          }
        ],
        totalEntities: 2
      },
      scoreHeatmap: {
        ...base("score-heatmap", "Score heatmap"),
        columns: [
          { id: "entity-0", name: "Our team" },
          { id: "entity-1", name: "Competitor" }
        ],
        rows: [
          {
            id: "criterion-0",
            name: "Technical merit",
            weight: 100,
            values: { "entity-0": 4, "entity-1": 3 }
          }
        ],
        totalColumns: 2,
        totalRows: 1
      },
      criterionDeltas: {
        ...base("criterion-deltas", "Criterion deltas"),
        competitorName: "Competitor",
        rows: [
          {
            id: "criterion-0",
            name: "Technical merit",
            weight: 100,
            ourEffective: 4,
            rivalEffective: 3,
            delta: 1
          }
        ],
        totalRows: 1
      },
      scenarioRange: {
        ...base("scenario-range", "Scenario range"),
        estimate: { value: 60, prior: 50, trust: 70, low: 45, high: 75 }
      },
      evidenceGrid: {
        ...base("evidence-grid", "Evidence grid"),
        rows: [
          {
            id: "criterion-0",
            name: "Technical merit",
            weight: 100,
            score: 4,
            classification: "Confirmed",
            linked: 1,
            support: 1,
            challenge: 0,
            conflict: false
          }
        ],
        totalRows: 1
      },
      evidenceRelationships: {
        ...base("evidence-relationships", "Evidence relationships"),
        evidence: [
          {
            id: "evidence-0",
            label: "[E-001] Technical proof",
            classification: "Confirmed",
            stance: "Support"
          }
        ],
        criteria: [{ id: "criterion-0", label: "Technical merit", weight: 100 }],
        links: [
          {
            evidenceId: "evidence-0",
            criterionId: "criterion-0",
            stance: "Support"
          }
        ],
        totalEvidence: 1,
        totalCriteria: 1,
        totalLinks: 1
      },
      actionSummary: {
        ...base("action-summary", "Action summary"),
        actions: [],
        counts: [{ priority: "High", status: "Open", count: 2 }],
        totalActions: 2
      }
    }
  };
}

function multibyteVisualSnapshot() {
  const snapshot = compactVisualSnapshot();
  const compactText = "界".repeat(60);
  const specText = "界".repeat(333);
  for (const spec of Object.values(snapshot.visuals)) {
    spec.title = specText;
    spec.description = specText;
  }

  snapshot.visuals.rankedCpi.entities = Array.from({ length: 14 }, (_, index) => ({
    id: `entity-${index}`,
    name: compactText,
    cpi: 50,
    coverage: 50,
    confidence: 50,
    isUs: index === 0
  }));
  snapshot.visuals.rankedCpi.totalEntities = 14;

  snapshot.visuals.scoreHeatmap.columns = Array.from({ length: 7 }, (_, index) => ({
    id: `entity-${index}`,
    name: compactText
  }));
  snapshot.visuals.scoreHeatmap.rows = Array.from({ length: 14 }, (_, index) => ({
    id: `criterion-${index}`,
    name: compactText,
    weight: 100,
    values: Object.fromEntries(
      Array.from({ length: 7 }, (unused, columnIndex) => [`entity-${columnIndex}`, 3])
    )
  }));
  snapshot.visuals.scoreHeatmap.totalColumns = 7;
  snapshot.visuals.scoreHeatmap.totalRows = 14;

  snapshot.visuals.criterionDeltas.competitorName = compactText;
  snapshot.visuals.criterionDeltas.rows = Array.from({ length: 14 }, (_, index) => ({
    id: `criterion-${index}`,
    name: compactText,
    weight: 100,
    ourEffective: 4,
    rivalEffective: 3,
    delta: 1
  }));
  snapshot.visuals.criterionDeltas.totalRows = 14;

  snapshot.visuals.evidenceGrid.rows = Array.from({ length: 14 }, (_, index) => ({
    id: `criterion-${index}`,
    name: compactText,
    weight: 100,
    score: 4,
    classification: compactText,
    linked: 1,
    support: 1,
    challenge: 0,
    conflict: false
  }));
  snapshot.visuals.evidenceGrid.totalRows = 14;

  const relationships = snapshot.visuals.evidenceRelationships;
  relationships.evidence = Array.from({ length: 9 }, (_, index) => ({
    id: `evidence-${index}`,
    label: compactText,
    classification: compactText,
    stance: compactText
  }));
  relationships.criteria = Array.from({ length: 9 }, (_, index) => ({
    id: `criterion-${index}`,
    label: compactText,
    weight: 100
  }));
  relationships.links = relationships.evidence.flatMap(evidence =>
    relationships.criteria.map(criterion => ({
      evidenceId: evidence.id,
      criterionId: criterion.id,
      stance: compactText
    }))
  );
  relationships.totalEvidence = 9;
  relationships.totalCriteria = 9;
  relationships.totalLinks = 81;

  const priorities = ["Critical", "High", "Medium", "Low", "Other"];
  const statuses = ["Open", "In progress", "Blocked", "Complete", "Other"];
  snapshot.visuals.actionSummary.counts = priorities.flatMap(priority =>
    statuses.map(status => ({ priority, status, count: 1 }))
  );
  snapshot.visuals.actionSummary.totalActions = 25;

  return snapshot;
}

test("raw workspace validation rejects unsupported versions and malformed collections", () => {
  const future = workspaceFixture();
  future.schemaVersion = engine.SCHEMA_VERSION + 1;
  assert.match(engine.validateWorkspaceImport(future).errors.join("\n"), /unsupported schema/i);

  const malformed = workspaceFixture();
  malformed.criteria = {};
  assert.match(engine.validateWorkspaceImport(malformed).errors.join("\n"), /criteria must be an array/i);
});

test("record IDs and every relationship-key shape fail closed", () => {
  const hostileRecord = workspaceFixture();
  hostileRecord.evidence[0].id = `e1" onmouseover="alert(1)`;
  assert.match(engine.validateWorkspace(hostileRecord).errors.join("\n"), /safe record ID/i);

  const hostileScoreKey = workspaceFixture();
  hostileScoreKey.competitors[0].scores = { [`cr1"><script>`]: 4 };
  assert.match(
    engine.validateWorkspace(hostileScoreKey).errors.join("\n"),
    /unsafe relationship ID/i
  );

  const malformedLinks = workspaceFixture();
  malformedLinks.criteria[0].evidenceIds = "e1";
  assert.match(engine.validateWorkspace(malformedLinks).errors.join("\n"), /must be an array/i);
});

test("legacy links migrate reciprocally while current nonreciprocal links are rejected", () => {
  const legacy = workspaceFixture();
  legacy.schemaVersion = 2;
  legacy.evidence[0].criterionIds = [];
  assert.equal(engine.validateWorkspaceImport(legacy).valid, true);

  const migrated = engine.normalizeWorkspace(legacy, workspaceFixture());
  assert.deepEqual(migrated.evidence[0].criterionIds, ["cr1"]);
  assert.equal(engine.validateWorkspace(migrated).valid, true);

  migrated.criteria[0].evidenceIds = [];
  assert.match(engine.validateWorkspace(migrated).errors.join("\n"), /nonreciprocal/i);
});

test("scores and relationships cannot cross pursuit boundaries", () => {
  const workspace = workspaceFixture();
  workspace.pursuits.push({ id: "p2", name: "Other", customer: "Other customer" });
  workspace.criteria.push({
    id: "cr2",
    pursuitId: "p2",
    name: "Price",
    weight: 100,
    ourScore: 3,
    evidenceIds: []
  });
  workspace.competitors[0].scores.cr2 = 4;
  workspace.competitors[0].scores.cr1 = "not-a-number";
  const errors = engine.validateWorkspace(workspace).errors.join("\n");
  assert.match(errors, /criterion from another pursuit/i);
  assert.match(errors, /nonnumeric score/i);
});

test("snapshot validation recursively checks nested workspaces and enforces a depth limit", () => {
  const workspace = workspaceFixture();
  const nested = snapshotFrom(workspace, "snapshot-2");
  const outer = snapshotFrom(workspace, "snapshot-1");
  outer.workspace.snapshots = [nested];
  assert.equal(engine.validateWorkspaceSnapshot(outer).valid, true);

  nested.workspace.criteria[0].evidenceIds = ["missing"];
  assert.match(
    engine.validateWorkspaceSnapshot(outer).errors.join("\n"),
    /missing evidence/i
  );

  let chain = snapshotFrom(workspace, "snapshot-depth-5");
  for (let depth = 4; depth >= 0; depth -= 1) {
    const parent = snapshotFrom(workspace, `snapshot-depth-${depth}`);
    parent.workspace.snapshots = [chain];
    chain = parent;
  }
  assert.match(
    engine.validateWorkspaceSnapshot(chain).errors.join("\n"),
    /nesting depth/i
  );
});

test("attachments accept only bounded base64 data URLs from the safe MIME allowlist", () => {
  assert.equal(engine.safeAttachmentDataUrl(""), true);
  assert.equal(engine.safeAttachmentDataUrl("data:application/pdf;base64,JVBERg=="), true);
  for (const unsafe of [
    "javascript:alert(1)",
    "https://example.com/payload",
    "blob:https://example.com/id",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4="
  ]) {
    assert.equal(engine.safeAttachmentDataUrl(unsafe), false);
  }
  const wrongType = workspaceFixture();
  wrongType.evidence[0].attachmentData = 0;
  assert.match(engine.validateWorkspace(wrongType).errors.join("\n"), /bounded base64 data URL/i);
});

test("report status and semantic table rendering remain aligned and escaped", () => {
  const report = engine.buildCompetitiveReport(workspaceFixture(), "p1", {
    reportStatus: "In review"
  });
  assert.equal(report.status, "In review");
  assert.match(report.output, /\*\*Status:\*\* In review/);

  const html = engine.markdownToWordHtml(
    "| Name | Value |\n| --- | --- |\n| <script>alert(1)</script> | **Safe** |",
    "Report"
  );
  assert.match(html, /<table>/);
  assert.match(html, /<thead>/);
  assert.match(html, /<tbody>/);
  assert.match(html, /<th scope="col">Name<\/th>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
});

test("unscored entities remain Unknown and cannot create comparative claims", () => {
  const neitherScored = workspaceFixture();
  neitherScored.criteria[0].ourScore = "";
  neitherScored.competitors[0].scores.cr1 = "";
  const emptyScores = engine.calculateCompetitiveScores(neitherScored, "p1");
  assert.equal(emptyScores.us.cpi, null);
  assert.equal(emptyScores.us.includedWeight, 0);
  assert.equal(emptyScores.competitors[0].cpi, null);
  assert.equal(emptyScores.strongestCompetitor, null);
  assert.equal(emptyScores.margin, null);
  assert.equal(emptyScores.scenarioEstimate, null);

  const emptyReport = engine.buildCompetitiveReport(neitherScored, "p1");
  assert.match(emptyReport.output, /Competitive Position Index is not available/i);
  assert.match(emptyReport.output, /\| CPI \| 100 normalized \| Unknown \| Unknown \|/);
  assert.doesNotMatch(emptyReport.output, /strongest scored competitor|producing a margin/i);

  const onlyRivalScored = workspaceFixture();
  onlyRivalScored.criteria[0].ourScore = "";
  const oneSidedScores = engine.calculateCompetitiveScores(onlyRivalScored, "p1");
  assert.equal(oneSidedScores.us.cpi, null);
  assert.equal(oneSidedScores.competitors[0].cpi, 50);
  assert.equal(oneSidedScores.strongestCompetitor, null);
  assert.equal(oneSidedScores.margin, null);
  assert.equal(oneSidedScores.scenarioEstimate, null);

  const onlyUsScored = workspaceFixture();
  onlyUsScored.competitors[0].scores.cr1 = "";
  const inverseOneSidedScores = engine.calculateCompetitiveScores(onlyUsScored, "p1");
  assert.equal(inverseOneSidedScores.us.cpi, 75);
  assert.equal(inverseOneSidedScores.competitors[0].cpi, null);
  assert.equal(inverseOneSidedScores.strongestCompetitor, null);
  assert.equal(inverseOneSidedScores.margin, null);
  assert.equal(inverseOneSidedScores.scenarioEstimate, null);
});

test("current report revisions fail closed while legacy migration filters malformed entries", () => {
  const current = workspaceFixture();
  current.runs.push({
    id: "run-1",
    pursuitId: "p1",
    title: "Report",
    revisions: [null]
  });
  assert.match(
    engine.validateWorkspaceImport(current).errors.join("\n"),
    /revisions\[0\].*valid report revision object/i
  );

  current.runs[0].revisions = [
    {
      version: 1,
      savedAt: "not-a-date",
      status: "Draft",
      output: "# Report"
    }
  ];
  assert.match(
    engine.validateWorkspaceImport(current).errors.join("\n"),
    /valid report revision object/i
  );

  const legacy = workspaceFixture();
  legacy.schemaVersion = 2;
  legacy.runs.push({
    id: "run-legacy",
    pursuitId: "p1",
    title: "Legacy report",
    revisions: [
      null,
      { version: "bad", savedAt: "", status: "Unknown", output: 42 },
      {
        version: "2",
        savedAt: "2026-07-26T12:00:00.000Z",
        status: "In review",
        output: "# Valid legacy revision"
      }
    ]
  });
  assert.equal(engine.validateWorkspaceImport(legacy).valid, true);
  const migrated = engine.normalizeWorkspace(legacy, workspaceFixture());
  assert.equal(migrated.runs[0].revisions.length, 1);
  assert.equal(migrated.runs[0].revisions[0].version, 2);
  assert.equal(migrated.runs[0].revisions[0].output, "# Valid legacy revision");
  assert.equal(engine.validateWorkspace(migrated).valid, true);
});

test("compact visual snapshots validate strictly and legacy migration strips unsafe envelopes", () => {
  const validSnapshot = compactVisualSnapshot();
  const run = visualSnapshot => ({
    id: "run-visual",
    pursuitId: "p1",
    title: "Visual report",
    revisions: [],
    visualSnapshot
  });

  const current = workspaceFixture();
  current.runs = [run(validSnapshot)];
  assert.equal(engine.validateWorkspace(current).valid, true);

  const partialScenario = structuredClone(validSnapshot);
  partialScenario.visuals.scenarioRange.estimate = {
    value: 60,
    prior: null,
    trust: null,
    low: null,
    high: null
  };
  current.runs = [run(partialScenario)];
  assert.equal(engine.validateWorkspace(current).valid, true);

  for (const malformed of [
    [],
    { ...validSnapshot, snapshotVersion: 1 },
    { ...validSnapshot, pursuitId: "another-pursuit" },
    { ...validSnapshot, metrics: [] },
    { ...validSnapshot, visuals: [] }
  ]) {
    current.runs = [run(malformed)];
    assert.match(
      engine.validateWorkspaceImport(current).errors.join("\n"),
      /valid compact visualization snapshot/i
    );
  }

  const malformedContracts = [];
  const forgedEntityTotal = structuredClone(validSnapshot);
  forgedEntityTotal.visuals.rankedCpi.totalEntities = 0;
  malformedContracts.push(forgedEntityTotal);

  const forgedLinkTotal = structuredClone(validSnapshot);
  forgedLinkTotal.visuals.evidenceRelationships.totalLinks = 0;
  malformedContracts.push(forgedLinkTotal);

  const forgedActionTotal = structuredClone(validSnapshot);
  forgedActionTotal.visuals.actionSummary.totalActions = 99;
  malformedContracts.push(forgedActionTotal);

  const contradictoryOurMetric = structuredClone(validSnapshot);
  contradictoryOurMetric.metrics.ourCpi = 74;
  malformedContracts.push(contradictoryOurMetric);

  const contradictoryCoverageMetric = structuredClone(validSnapshot);
  contradictoryCoverageMetric.metrics.coverage = 79;
  malformedContracts.push(contradictoryCoverageMetric);

  const contradictoryConfidenceMetric = structuredClone(validSnapshot);
  contradictoryConfidenceMetric.metrics.confidence = 69;
  malformedContracts.push(contradictoryConfidenceMetric);

  const contradictoryRivalMetric = structuredClone(validSnapshot);
  contradictoryRivalMetric.metrics.strongestRivalCpi = 49;
  malformedContracts.push(contradictoryRivalMetric);

  const contradictoryScenarioMetric = structuredClone(validSnapshot);
  contradictoryScenarioMetric.metrics.scenario = 61;
  malformedContracts.push(contradictoryScenarioMetric);

  const absurdDisclosureTotal = structuredClone(validSnapshot);
  absurdDisclosureTotal.visuals.rankedCpi.totalEntities = 100_001;
  malformedContracts.push(absurdDisclosureTotal);

  const absurdEvidenceCount = structuredClone(validSnapshot);
  absurdEvidenceCount.visuals.evidenceGrid.rows[0].linked = 100_001;
  absurdEvidenceCount.visuals.evidenceGrid.rows[0].support = 100_001;
  malformedContracts.push(absurdEvidenceCount);

  const absurdActionCount = structuredClone(validSnapshot);
  absurdActionCount.visuals.actionSummary.counts[0].count = 100_001;
  absurdActionCount.visuals.actionSummary.totalActions = 100_001;
  malformedContracts.push(absurdActionCount);

  const oversizedRanking = structuredClone(validSnapshot);
  oversizedRanking.visuals.rankedCpi.entities = Array.from({ length: 15 }, (_, index) => ({
    id: `entity-${index}`,
    name: index === 0 ? "Our team" : `Competitor ${index}`,
    cpi: 50,
    coverage: 50,
    confidence: 50,
    isUs: index === 0
  }));
  oversizedRanking.visuals.rankedCpi.totalEntities = 15;
  malformedContracts.push(oversizedRanking);

  const unknownMetric = structuredClone(validSnapshot);
  unknownMetric.metrics.margin = 25;
  malformedContracts.push(unknownMetric);

  const brokenRelationship = structuredClone(validSnapshot);
  brokenRelationship.visuals.evidenceRelationships.links[0].criterionId = "criterion-99";
  malformedContracts.push(brokenRelationship);

  const unknownVisual = structuredClone(validSnapshot);
  unknownVisual.visuals.unrecognized = {};
  malformedContracts.push(unknownVisual);

  const wrongVisualType = structuredClone(validSnapshot);
  wrongVisualType.visuals.evidenceGrid.type = "html";
  malformedContracts.push(wrongVisualType);

  const duplicateActionBucket = structuredClone(validSnapshot);
  duplicateActionBucket.visuals.actionSummary.counts.push({
    priority: "High",
    status: "Open",
    count: 1
  });
  duplicateActionBucket.visuals.actionSummary.totalActions = 3;
  malformedContracts.push(duplicateActionBucket);

  const unknownActionBucket = structuredClone(validSnapshot);
  unknownActionBucket.visuals.actionSummary.counts[0].priority = "Urgent";
  malformedContracts.push(unknownActionBucket);

  for (const malformed of malformedContracts) {
    current.runs = [run(malformed)];
    assert.match(
      engine.validateWorkspaceImport(current).errors.join("\n"),
      /valid compact visualization snapshot/i
    );
  }

  const multibyte = multibyteVisualSnapshot();
  const serializedMultibyte = JSON.stringify(multibyte);
  const multibyteLength = Buffer.byteLength(serializedMultibyte, "utf8");
  assert.ok(serializedMultibyte.length < 64_000);
  assert.ok(
    multibyteLength > 64_000,
    `Expected more than 64,000 UTF-8 bytes, received ${multibyteLength}.`
  );
  current.runs = [run(multibyte)];
  assert.match(engine.validateWorkspace(current).errors.join("\n"), /no larger than 64 KB/i);

  const nestedWorkspace = workspaceFixture();
  nestedWorkspace.runs = [run([])];
  const nestedCurrent = workspaceFixture();
  nestedCurrent.snapshots = [snapshotFrom(nestedWorkspace, "snapshot-visual")];
  assert.match(
    engine.validateWorkspace(nestedCurrent).errors.join("\n"),
    /visualSnapshot.*valid compact visualization snapshot/i
  );

  const legacy = workspaceFixture();
  legacy.schemaVersion = 2;
  legacy.runs = [run([])];
  const legacyNested = workspaceFixture();
  legacyNested.schemaVersion = 2;
  legacyNested.runs = [run(forgedActionTotal)];
  legacy.snapshots = [snapshotFrom(legacyNested, "snapshot-legacy-visual")];
  assert.equal(engine.validateWorkspaceImport(legacy).valid, true);
  const migrated = engine.normalizeWorkspace(legacy, workspaceFixture());
  assert.equal("visualSnapshot" in migrated.runs[0], false);
  assert.equal("visualSnapshot" in migrated.snapshots[0].workspace.runs[0], false);
  assert.equal(engine.validateWorkspace(migrated).valid, true);
});
