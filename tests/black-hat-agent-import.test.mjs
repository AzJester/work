import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPORT_LIMITS,
  IMPORT_TARGETS,
  buildImportPlan,
  buildTableFromMatrix,
  normalizeHeader,
  parseCsv,
  suggestColumnMapping
} from "../black-hat-agent/import-engine.js";

function workspaceFixture() {
  return {
    schemaVersion: 2,
    appVersion: "2.0.0",
    createdAt: "2026-07-26T12:00:00.000Z",
    updatedAt: "2026-07-26T12:00:00.000Z",
    active: "p1",
    pursuits: [
      {
        id: "p1",
        name: "Alpha",
        customer: "Agency One",
        stage: "Capture",
        status: "Active",
        owner: "",
        review: "",
        decisionDate: "",
        contractValue: "",
        playbook: "",
        summary: "",
        ourPosition: "",
        procurementContext: "",
        priorEstimate: 50,
        archived: false
      },
      {
        id: "p2",
        name: "Bravo",
        customer: "Agency Two",
        stage: "Shape",
        status: "Active",
        owner: "",
        review: "",
        decisionDate: "",
        contractValue: "",
        playbook: "",
        summary: "",
        ourPosition: "",
        procurementContext: "",
        priorEstimate: 50,
        archived: false
      }
    ],
    criteria: [
      {
        id: "cr1",
        pursuitId: "p1",
        name: "Technical merit",
        category: "Technical",
        description: "Existing criterion",
        weight: 60,
        ourScore: 4,
        classification: "Confirmed",
        rationale: "",
        evidenceIds: ["e1"],
        isGate: true
      },
      {
        id: "cr2",
        pursuitId: "p2",
        name: "Transition",
        category: "Management",
        description: "Other pursuit criterion",
        weight: 100,
        ourScore: 3,
        classification: "Hypothesis",
        rationale: "",
        evidenceIds: ["e2"],
        isGate: false
      }
    ],
    evidence: [
      {
        id: "e1",
        pursuitId: "p1",
        citation: "E-001",
        title: "Customer priority",
        source: "Customer meeting",
        url: "https://example.com/source",
        type: "Customer",
        publishedAt: "2026-07-01",
        confidence: "High",
        classification: "Confirmed",
        stance: "Support",
        note: "",
        criterionIds: ["cr1"],
        attachmentName: "",
        attachmentType: "",
        attachmentData: ""
      },
      {
        id: "e2",
        pursuitId: "p2",
        citation: "E-001",
        title: "Other evidence",
        source: "Other source",
        url: "",
        type: "Customer",
        publishedAt: "",
        confidence: "Medium",
        classification: "Hypothesis",
        stance: "Neutral",
        note: "",
        criterionIds: ["cr2"],
        attachmentName: "",
        attachmentType: "",
        attachmentData: ""
      }
    ],
    competitors: [
      {
        id: "co1",
        pursuitId: "p1",
        name: "Northstar",
        position: "Challenger",
        incumbent: false,
        bidLikelihood: "Likely",
        strengths: "",
        weaknesses: "",
        strategy: "",
        ghosting: "",
        counterMoves: "",
        classification: "Hypothesis",
        evidenceIds: ["e1"],
        scores: { cr1: 3 }
      },
      {
        id: "co2",
        pursuitId: "p2",
        name: "Northstar",
        position: "Challenger",
        incumbent: false,
        bidLikelihood: "Likely",
        strengths: "",
        weaknesses: "",
        strategy: "",
        ghosting: "",
        counterMoves: "",
        classification: "Hypothesis",
        evidenceIds: ["e2"],
        scores: { cr2: 4 }
      }
    ],
    actions: [
      {
        id: "a1",
        pursuitId: "p1",
        title: "Validate scoring",
        owner: "Lead",
        due: "2026-08-01",
        status: "Open",
        priority: "High",
        finding: ""
      },
      {
        id: "a2",
        pursuitId: "p2",
        title: "Protect other pursuit",
        owner: "Lead",
        due: "",
        status: "Open",
        priority: "Medium",
        finding: ""
      }
    ],
    playbooks: [
      {
        id: "pb1",
        name: "Competitive assessment",
        description: "",
        sections: "",
        builtIn: true
      }
    ],
    runs: [],
    snapshots: []
  };
}

function deterministicIds() {
  let number = 0;
  return target => `new-${target}-${++number}`;
}

test("target metadata and header suggestions cover every supported destination", () => {
  assert.deepEqual(Object.keys(IMPORT_TARGETS), [
    "pursuits",
    "criteria",
    "evidence",
    "competitors",
    "competitorScores",
    "actions"
  ]);
  assert.equal(normalizeHeader(" Our_Score (%) "), "our score");
  const suggestion = suggestColumnMapping("criteria", [
    "Evaluation Criterion",
    "Weight %",
    "Team Score",
    "Supporting Evidence"
  ]);
  assert.deepEqual(suggestion.mapping, {
    name: 0,
    weight: 1,
    ourScore: 2,
    evidenceRefs: 3
  });
  assert.deepEqual(suggestion.missingRequired, []);
});

test("CSV and matrix parsing preserve hostile text as inert data", () => {
  const table = parseCsv(
    '\ufeffTitle,Source,Note\r\n"Claim, one",Analyst,"<img src=x onerror=alert(1)>"\r\n"=2+2",Sheet,"line 1\nline 2"\r\n"+SUM(A1:A2)",Sheet,"-1+2"\r\n"@command",Sheet,plain'
  );
  assert.deepEqual(table.headers, ["Title", "Source", "Note"]);
  assert.equal(table.rows.length, 4);
  assert.equal(table.rows[0][0], "Claim, one");
  assert.equal(table.rows[0][2], "<img src=x onerror=alert(1)>");
  assert.equal(table.rows[1][0], "=2+2");
  assert.equal(table.rows[1][2], "line 1\nline 2");
  assert.equal(table.rows[2][0], "+SUM(A1:A2)");
  assert.equal(table.rows[2][2], "-1+2");
  assert.equal(table.rows[3][0], "@command");

  const offsetHeader = parseCsv("metadata\nignored\nName\nImported value", {
    headerRow: 2
  });
  assert.deepEqual(offsetHeader.headers, ["Name"]);
  assert.deepEqual(offsetHeader.rows, [["Imported value"]]);

  const duplicate = buildTableFromMatrix([
    ["Name", "name"],
    ["One", "Two"]
  ]);
  assert.deepEqual(duplicate.duplicateHeaders, ["name"]);
  assert.throws(
    () =>
      buildTableFromMatrix([
        Array.from({ length: IMPORT_LIMITS.maxColumns + 1 }, (_, index) => `C${index}`)
      ]),
    /column limit/i
  );
});

test("append skips matches while upsert updates without replacing identifiers", () => {
  const original = workspaceFixture();
  const untouched = structuredClone(original);
  const headers = ["Criterion", "Weight", "Our Score"];
  const mapping = { name: 0, weight: 1, ourScore: 2 };

  const append = buildImportPlan({
    workspace: original,
    target: "criteria",
    headers,
    rows: [
      ["Technical merit", 80, 5],
      ["Staffing depth", 40, 3],
      ["Staffing depth", 50, 4]
    ],
    mapping,
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(append.valid, true);
  assert.equal(append.summary.created, 1);
  assert.equal(append.summary.skipped, 2);
  assert.equal(
    append.nextWorkspace.criteria.find(item => item.id === "cr1").weight,
    60,
    "append must not overwrite an existing match"
  );
  assert.equal(
    append.nextWorkspace.criteria.find(item => item.name === "Staffing depth").id,
    "new-criteria-1"
  );
  assert.deepEqual(original, untouched, "planning must not mutate the current workspace");

  const upsert = buildImportPlan({
    workspace: original,
    target: "criteria",
    headers,
    rows: [["Technical merit", 80, 5]],
    mapping,
    pursuitId: "p1",
    mode: "upsert",
    idFactory: deterministicIds()
  });
  assert.equal(upsert.valid, true);
  assert.equal(upsert.summary.updated, 1);
  const updated = upsert.nextWorkspace.criteria.find(item => item.id === "cr1");
  assert.equal(updated.weight, 80);
  assert.equal(updated.ourScore, 5);
  assert.equal(updated.description, "Existing criterion", "unmapped fields must be preserved");
});

test("large plans validate every row while bounding the visual preview", () => {
  const rowCount = IMPORT_LIMITS.maxPreviewRows + 5;
  const plan = buildImportPlan({
    workspace: workspaceFixture(),
    target: "actions",
    headers: ["Action"],
    rows: Array.from({ length: rowCount }, (_, index) => [`Imported action ${index + 1}`]),
    mapping: { title: 0 },
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.summary.processedRows, rowCount);
  assert.equal(plan.summary.created, rowCount);
  assert.equal(plan.preview.length, IMPORT_LIMITS.maxPreviewRows);
  assert.ok(plan.nextWorkspace.actions.some(item => item.title === `Imported action ${rowCount}`));
});

test("criterion and evidence references resolve by citation/name and stay reciprocal", () => {
  const workspace = workspaceFixture();
  const criterionPlan = buildImportPlan({
    workspace,
    target: "criteria",
    headers: ["Criterion", "Weight", "Evidence"],
    rows: [["Delivery confidence", 40, "E-001"]],
    mapping: { name: 0, weight: 1, evidenceRefs: 2 },
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(criterionPlan.valid, true);
  const criterion = criterionPlan.nextWorkspace.criteria.find(
    item => item.name === "Delivery confidence"
  );
  assert.deepEqual(criterion.evidenceIds, ["e1"]);
  assert.ok(
    criterionPlan.nextWorkspace.evidence.find(item => item.id === "e1").criterionIds.includes(
      criterion.id
    )
  );

  const evidencePlan = buildImportPlan({
    workspace: criterionPlan.nextWorkspace,
    target: "evidence",
    headers: ["Title", "Source", "Criteria", "Classification"],
    rows: [
      [
        "Transition proof",
        "Program review",
        "Delivery confidence",
        "Inference"
      ]
    ],
    mapping: { title: 0, source: 1, criterionRefs: 2, classification: 3 },
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(evidencePlan.valid, true);
  const importedEvidence = evidencePlan.nextWorkspace.evidence.find(
    item => item.title === "Transition proof"
  );
  assert.equal(importedEvidence.citation, "E-002");
  assert.deepEqual(importedEvidence.criterionIds, [criterion.id]);
  assert.ok(
    evidencePlan.nextWorkspace.criteria
      .find(item => item.id === criterion.id)
      .evidenceIds.includes(importedEvidence.id)
  );
});

test("competitors link evidence and score rows resolve within the selected pursuit", () => {
  const competitorPlan = buildImportPlan({
    workspace: workspaceFixture(),
    target: "competitors",
    headers: ["Competitor", "Likelihood", "Evidence"],
    rows: [["Vector Systems", "Very likely", "Customer priority"]],
    mapping: { name: 0, bidLikelihood: 1, evidenceRefs: 2 },
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(competitorPlan.valid, true);
  const competitor = competitorPlan.nextWorkspace.competitors.find(
    item => item.name === "Vector Systems"
  );
  assert.deepEqual(competitor.evidenceIds, ["e1"]);

  const scorePlan = buildImportPlan({
    workspace: competitorPlan.nextWorkspace,
    target: "competitorScores",
    headers: ["Competitor", "Criterion", "Score"],
    rows: [
      ["Vector Systems", "Technical merit", 5],
      ["Northstar", "Technical merit", 1]
    ],
    mapping: { competitor: 0, criterion: 1, score: 2 },
    pursuitId: "p1",
    mode: "upsert",
    idFactory: deterministicIds()
  });
  assert.equal(scorePlan.valid, true);
  assert.equal(scorePlan.summary.created, 1);
  assert.equal(scorePlan.summary.updated, 1);
  assert.equal(
    scorePlan.nextWorkspace.competitors.find(item => item.id === competitor.id).scores.cr1,
    5
  );
  assert.equal(
    scorePlan.nextWorkspace.competitors.find(item => item.id === "co1").scores.cr1,
    1
  );
  assert.equal(
    scorePlan.nextWorkspace.competitors.find(item => item.id === "co2").scores.cr2,
    4,
    "same-name competitor in another pursuit must remain untouched"
  );
});

test("invalid rows make a plan atomic and report actionable diagnostics", () => {
  const workspace = workspaceFixture();
  const snapshot = structuredClone(workspace);
  const plan = buildImportPlan({
    workspace,
    target: "evidence",
    headers: ["Title", "Source", "URL", "Date", "Confidence"],
    rows: [
      ["Bad URL", "Unknown", "javascript:alert(1)", "2026-02-30", "Certain"],
      ["<script>alert(1)</script>", "Analyst", "https://example.com", "2026-08-01", "High"]
    ],
    mapping: { title: 0, source: 1, url: 2, publishedAt: 3, confidence: 4 },
    pursuitId: "p1",
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(plan.valid, false);
  assert.equal(plan.nextWorkspace, null);
  assert.match(plan.diagnostics.map(item => item.code).join(" "), /invalid_url/);
  assert.match(plan.diagnostics.map(item => item.code).join(" "), /invalid_date/);
  assert.match(plan.diagnostics.map(item => item.code).join(" "), /invalid_enum/);
  assert.deepEqual(workspace, snapshot);
});

test("diagnostics use worksheet row numbers and pursuit estimates match the UI range", () => {
  const criterion = buildImportPlan({
    workspace: workspaceFixture(),
    target: "criteria",
    headers: ["Criterion", "Weight", "Our Score"],
    rows: [["Invalid score", 10, 9]],
    mapping: { name: 0, weight: 1, ourScore: 2 },
    pursuitId: "p1",
    mode: "append",
    rowNumberOffset: 5,
    idFactory: deterministicIds()
  });
  assert.equal(criterion.valid, false);
  assert.equal(
    criterion.diagnostics.find(item => item.code === "invalid_score").row,
    6
  );

  const pursuit = buildImportPlan({
    workspace: workspaceFixture(),
    target: "pursuits",
    headers: ["Opportunity", "Customer", "PWin"],
    rows: [["Out of range", "Agency", 100]],
    mapping: { name: 0, customer: 1, priorEstimate: 2 },
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(pursuit.valid, false);
  assert.match(
    pursuit.diagnostics.map(item => item.message).join("\n"),
    /between 5 and 95/i
  );
});

test("replace is pursuit-scoped and cleans removed criterion dependencies", () => {
  const workspace = workspaceFixture();
  const plan = buildImportPlan({
    workspace,
    target: "criteria",
    headers: ["Criterion", "Weight"],
    rows: [["Management approach", 100]],
    mapping: { name: 0, weight: 1 },
    pursuitId: "p1",
    mode: "replace",
    idFactory: deterministicIds()
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.summary.replaced, 1);
  assert.equal(plan.nextWorkspace.criteria.some(item => item.id === "cr1"), false);
  assert.equal(plan.nextWorkspace.criteria.some(item => item.id === "cr2"), true);
  assert.equal(plan.nextWorkspace.evidence.find(item => item.id === "e1").criterionIds.length, 0);
  assert.equal("cr1" in plan.nextWorkspace.competitors.find(item => item.id === "co1").scores, false);
  assert.equal(plan.nextWorkspace.competitors.find(item => item.id === "co2").scores.cr2, 4);
  assert.equal(plan.nextWorkspace.actions.length, workspace.actions.length);
});

test("replace is rejected for pursuits and competitor scores", () => {
  const pursuits = buildImportPlan({
    workspace: workspaceFixture(),
    target: "pursuits",
    headers: ["Opportunity", "Customer"],
    rows: [["New pursuit", "New agency"]],
    mapping: { name: 0, customer: 1 },
    mode: "replace",
    idFactory: deterministicIds()
  });
  assert.equal(pursuits.valid, false);
  assert.match(pursuits.diagnostics.map(item => item.code).join(" "), /replace_not_allowed/);

  const scores = buildImportPlan({
    workspace: workspaceFixture(),
    target: "competitorScores",
    headers: ["Competitor", "Criterion", "Score"],
    rows: [["Northstar", "Technical merit", 4]],
    mapping: { competitor: 0, criterion: 1, score: 2 },
    pursuitId: "p1",
    mode: "replace",
    idFactory: deterministicIds()
  });
  assert.equal(scores.valid, false);
  assert.match(scores.diagnostics.map(item => item.code).join(" "), /replace_not_allowed/);
});

test("new pursuits receive fresh IDs and normalized scalar values", () => {
  const workspace = workspaceFixture();
  const plan = buildImportPlan({
    workspace,
    target: "pursuits",
    headers: ["Opportunity", "Customer", "Review Date", "PWin", "Archived"],
    rows: [["Charlie", "Agency Three", "8/15/2026", "62%", "no"]],
    mapping: {
      name: 0,
      customer: 1,
      review: 2,
      priorEstimate: 3,
      archived: 4
    },
    mode: "append",
    idFactory: deterministicIds()
  });
  assert.equal(plan.valid, true);
  const pursuit = plan.nextWorkspace.pursuits.find(item => item.name === "Charlie");
  assert.equal(pursuit.id, "new-pursuits-1");
  assert.equal(pursuit.review, "2026-08-15");
  assert.equal(pursuit.priorEstimate, 62);
  assert.equal(pursuit.archived, false);
});
