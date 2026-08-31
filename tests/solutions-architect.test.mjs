import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const appDir = resolve(rootDir, "solutions-architect");
const enginePath = resolve(appDir, "engine.js");
const appPath = resolve(appDir, "app.js");
const indexPath = resolve(appDir, "index.html");
const cardPath = resolve(appDir, "og-card.png");
const engine = await import(pathToFileURL(enginePath));
const appSource = readFileSync(appPath, "utf8");
const indexSource = readFileSync(indexPath, "utf8");

const scopedCollections = [
  "stakeholders",
  "hotButtons",
  "winThemes",
  "outcomes",
  "measures",
  "requirements",
  "evidence",
  "criteria",
  "candidates",
  "architectureViews",
  "elements",
  "connections",
  "trades",
  "decisions",
  "risks",
  "dependencies",
  "assumptions",
  "roadmapItems",
  "reviews",
  "transitionActions",
  "aiDrafts"
];

function resultShape(citationId) {
  return {
    summary: "A concise synthetic summary.",
    drafts: [],
    findings: [{
      severity: "medium",
      category: "traceability",
      title: "Synthetic traceability gap",
      detail: "A cited synthetic finding.",
      recommendation: "Close the trace before the review.",
      citation_ids: [citationId]
    }],
    review_questions: [],
    architecture_views: [],
    assumptions: [],
    warnings: [],
    citation_ids: [citationId]
  };
}

test("the static entry point, modules, and social card are deployment-ready without a build step", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", enginePath]));
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", appPath]));
  assert.match(indexSource, /<title>Solution Architect Workbench<\/title>/);
  assert.match(indexSource, /<script\b[^>]*src="app\.js"[^>]*type="module"/);
  assert.match(appSource, /class="development-banner"[\s\S]{0,160}<strong>Under development<\/strong>/);
  assert.match(appSource, /Approved unclassified, non-CUI information only/);

  const card = readFileSync(cardPath);
  assert.equal(card.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const width = card.readUInt32BE(16);
  const height = card.readUInt32BE(20);
  assert.ok(width >= 1200 && height >= 600, `unexpected social-card dimensions: ${width}x${height}`);
  assert.ok(width / height > 1.85 && width / height < 2, `unexpected social-card aspect ratio: ${width / height}`);
});

test("the seeded workspace is a valid, solution-scoped schema and blank solutions stay independent", () => {
  const workspace = engine.createWorkspace();
  assert.equal(workspace.schema, engine.WORKSPACE_SCHEMA);
  assert.equal(workspace.schemaVersion, engine.SCHEMA_VERSION);
  assert.equal(engine.validateWorkspace(workspace).valid, true);
  assert.equal(workspace.solutions.length, 1);
  assert.ok(workspace.solutions.some(solution => solution.id === workspace.activeSolutionId));

  const added = engine.addBlankSolution(workspace, "Independent test solution");
  assert.equal(added.workspace.solutions.length, 2);
  assert.equal(added.workspace.activeSolutionId, added.solution.id);
  assert.equal(engine.validateWorkspace(added.workspace).valid, true);
  for (const name of scopedCollections) {
    const records = added.workspace[name].filter(record => record.solutionId === added.solution.id);
    if (["criteria", "architectureViews"].includes(name)) assert.ok(records.length > 0, `${name} should be seeded`);
    assert.ok(records.every(record => record.solutionId === added.solution.id));
  }
});

test("schema validation fails closed on unsafe IDs, invalid scores, and cross-solution references", () => {
  const original = engine.createWorkspace();

  const unsafeId = structuredClone(original);
  unsafeId.requirements[0].id = "req_<script>";
  assert.match(engine.validateWorkspace(unsafeId).errors.join("\n"), /id is invalid/i);

  const invalidScore = structuredClone(original);
  invalidScore.candidates[0].scores[0].value = 6;
  assert.match(engine.validateWorkspace(invalidScore).errors.join("\n"), /must be 0-5 or null/i);

  const added = engine.addBlankSolution(original, "Boundary test");
  added.workspace.evidence.push({
    id: "evidence_other_solution",
    solutionId: added.solution.id,
    title: "Other solution evidence",
    source: "Synthetic source",
    url: "",
    notes: "",
    confidence: "High"
  });
  const firstRequirement = added.workspace.requirements.find(
    record => record.solutionId !== added.solution.id
  );
  firstRequirement.sourceEvidenceId = "evidence_other_solution";
  const result = engine.validateWorkspace(added.workspace);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /crosses solution boundaries/i);

  const wrongVersion = structuredClone(original);
  wrongVersion.schemaVersion += 1;
  assert.match(engine.validateWorkspaceImport(wrongVersion).errors.join("\n"), /unsupported workspace/i);
});

test("readiness bounds permit IRL 0-9 while retaining the published TRL and MRL ranges", () => {
  const workspace = engine.createWorkspace();

  const validMinimum = structuredClone(workspace);
  validMinimum.candidates[0].trl = 1;
  validMinimum.candidates[0].mrl = 1;
  validMinimum.candidates[0].irl = 0;
  assert.equal(engine.validateWorkspace(validMinimum).valid, true);

  for (const [field, value, expected] of [
    ["trl", 0, /trl must be 1-9 or null/i],
    ["trl", 10, /trl must be 1-9 or null/i],
    ["mrl", 0, /mrl must be 1-10 or null/i],
    ["mrl", 11, /mrl must be 1-10 or null/i],
    ["irl", -1, /irl must be 0-9 or null/i],
    ["irl", 10, /irl must be 0-9 or null/i],
  ]) {
    const invalid = structuredClone(workspace);
    invalid.candidates[0][field] = value;
    assert.match(engine.validateWorkspace(invalid).errors.join("\n"), expected);
  }
});

test("default assessments separate cybersecurity from system safety without changing total weight", () => {
  const workspace = engine.createWorkspace();
  const criteria = workspace.criteria.filter(record => record.solutionId === workspace.activeSolutionId);
  const byName = new Map(criteria.map(record => [record.name, record]));

  assert.ok(byName.has("Cybersecurity and authorization"), "Cybersecurity and authorization should be independently assessed");
  assert.ok(byName.has("System safety"), "System safety should be independently assessed");
  assert.equal(byName.has("Cyber and safety"), false, "the combined criterion should no longer be seeded");
  assert.equal(criteria.reduce((total, criterion) => total + criterion.weight, 0), 100);

  for (const candidate of workspace.candidates.filter(record => record.solutionId === workspace.activeSolutionId)) {
    const scoredCriterionIds = new Set(candidate.scores.map(score => score.criterionId));
    assert.ok(scoredCriterionIds.has(byName.get("Cybersecurity and authorization").id));
    assert.ok(scoredCriterionIds.has(byName.get("System safety").id));
  }
});

test("schema validation fails closed on malformed nested fields and every required relationship array", () => {
  const workspace = engine.createWorkspace();
  const malformedMission = structuredClone(workspace);
  malformedMission.solutions[0].mission.problem = ["not", "text"];
  assert.doesNotThrow(() => engine.validateWorkspaceImport(malformedMission));
  assert.match(engine.validateWorkspaceImport(malformedMission).errors.join("\n"), /mission\.problem must be a string/i);

  const incompleteProposal = structuredClone(workspace);
  delete incompleteProposal.solutions[0].proposal.technicalApproach;
  assert.match(engine.validateWorkspaceImport(incompleteProposal).errors.join("\n"), /proposal\.technicalApproach is required/i);

  const unexpectedNestedField = structuredClone(workspace);
  unexpectedNestedField.solutions[0].mission.injected = "unsupported";
  assert.match(engine.validateWorkspaceImport(unexpectedNestedField).errors.join("\n"), /mission\.injected is not supported/i);

  const requiredArrays = [
    ["outcomes", 0, "linkedRequirementIds"],
    ["requirements", 0, "linkedElementIds"],
    ["requirements", 0, "linkedHotButtonIds"],
    ["candidates", 0, "scores"],
    ["winThemes", 0, "linkedHotButtonIds"],
    ["winThemes", 0, "sourceEvidenceIds"],
    ["trades", 0, "optionIds"],
    ["decisions", 0, "evidenceIds"]
  ];
  for (const [collection, index, field] of requiredArrays) {
    const malformed = structuredClone(workspace);
    delete malformed[collection][index][field];
    const validation = engine.validateWorkspaceImport(malformed);
    assert.equal(validation.valid, false, `${collection}.${field} should be required`);
    assert.match(validation.errors.join("\n"), new RegExp(`${collection}\\[${index}\\]\\.${field} is required`, "i"));
  }

  const malformedScore = structuredClone(workspace);
  malformedScore.candidates[0].scores[0] = null;
  assert.doesNotThrow(() => engine.validateWorkspaceImport(malformedScore));
  assert.match(engine.validateWorkspaceImport(malformedScore).errors.join("\n"), /scores\[0\] must be an object/i);

  const missingScoreEvidence = structuredClone(workspace);
  delete missingScoreEvidence.candidates[0].scores[0].evidenceIds;
  assert.match(engine.validateWorkspaceImport(missingScoreEvidence).errors.join("\n"), /evidenceIds is required/i);

  const malformedRelationshipId = structuredClone(workspace);
  malformedRelationshipId.connections[0].sourceElementId = { id: "element_operator" };
  assert.match(engine.validateWorkspaceImport(malformedRelationshipId).errors.join("\n"), /sourceElementId must be a valid record ID/i);

  const malformedRecordField = structuredClone(workspace);
  malformedRecordField.dependencies[0].provider = ["not", "text"];
  assert.match(engine.validateWorkspaceImport(malformedRecordField).errors.join("\n"), /dependencies\[0\]\.provider must be a string/i);
});

test("assessment and readiness models preserve unknowns instead of treating them as zero", () => {
  const workspace = engine.createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const result = engine.assessmentResult(workspace, solutionId, "candidate_alpha");
  const dataRights = result.rows.find(row => row.criterion.id === "criterion_data-rights");

  assert.equal(dataRights.value, null);
  assert.ok(result.score > 3 && result.score < 4);
  assert.ok(result.coverage > 0 && result.coverage < 1);
  assert.ok(result.evidenceCoverage > 0 && result.evidenceCoverage < result.coverage);

  const noScores = structuredClone(workspace);
  noScores.candidates[0].scores = [];
  assert.deepEqual(
    engine.assessmentResult(noScores, solutionId, "candidate_alpha").score,
    null
  );

  const readiness = engine.buildReadiness(workspace, solutionId);
  for (const value of Object.values(readiness)) {
    assert.equal(Number.isInteger(value), true);
    assert.ok(value >= 0 && value <= 100);
  }
  assert.equal(
    readiness.overall,
    Math.round((readiness.traceability + readiness.evidence + readiness.interfaces + readiness.transition) / 4)
  );

  const obligations = engine.collectObligations(workspace, solutionId);
  assert.ok(obligations.some(item => item.kind === "unknown-score" && item.recordId === "candidate_alpha"));
  const severityRank = { high: 0, medium: 1, low: 2 };
  assert.ok(obligations.every((item, index) => index === 0 || severityRank[obligations[index - 1].severity] <= severityRank[item.severity]));
});

test("architecture layout is non-mutating and diagram markup escapes authored content", () => {
  const workspace = engine.createWorkspace();
  const viewId = "view_interface";
  const original = structuredClone(workspace);
  const laidOut = engine.autoLayoutView(workspace, viewId);
  const view = laidOut.architectureViews.find(item => item.id === viewId);
  const elements = laidOut.elements.filter(item => item.viewId === viewId);

  assert.deepEqual(workspace, original);
  assert.ok(elements.length > 1);
  assert.ok(elements.every(item => item.x >= 0 && item.y >= 0));
  assert.ok(elements.every(item => item.x + item.width <= view.width && item.y + item.height <= view.height));

  const hostile = structuredClone(laidOut);
  hostile.architectureViews.find(item => item.id === viewId).name = "</title><script>alert(1)</script>";
  hostile.elements.find(item => item.viewId === viewId).name = "<img src=x onerror=alert(1)>";
  hostile.connections.find(item => item.viewId === viewId).label = "<script>bad()</script>";
  const svg = engine.buildDiagramSvg(hostile, viewId, { standalone: true });
  assert.match(svg, /^<\?xml version="1\.0"/);
  assert.doesNotMatch(svg, /<script\b|<img\b/i);
  assert.match(svg, /&lt;script&gt;|&lt;img/);

  const packageHtml = engine.buildDecisionPackageHtml(workspace, workspace.activeSolutionId);
  const diagramIds = [...packageHtml.matchAll(/\bid="(diagram-[^"]+-(?:title|description|arrow|shadow))"/g)].map(match => match[1]);
  assert.equal(diagramIds.length, workspace.architectureViews.length * 4);
  assert.equal(new Set(diagramIds).size, diagramIds.length, "embedded SVG fragment IDs must be unique");
  for (const match of packageHtml.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(diagramIds.includes(id), `missing labelled SVG fragment ${id}`);
  }
  for (const match of packageHtml.matchAll(/url\(#([^)]+)\)/g)) assert.ok(diagramIds.includes(match[1]), `missing referenced SVG fragment ${match[1]}`);
});

test("sanitizers reject unsafe URLs and decision packages safely render authored text", () => {
  assert.equal(
    engine.escapeHtml(`<script data-x="1">'&</script>`),
    "&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&lt;/script&gt;"
  );
  assert.equal(engine.safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(engine.safeHttpUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.match(engine.safeHttpUrl("https://example.com/reference"), /^https:\/\/example\.com\/reference/);

  const workspace = engine.createWorkspace();
  const solution = workspace.solutions[0];
  solution.name = "Mission <script>alert(1)</script> [test]";
  solution.classification = `<img src=x onerror="alert(1)">`;
  workspace.evidence[0].url = "javascript:alert(1)";

  const markdown = engine.buildDecisionPackageMarkdown(workspace, solution.id);
  for (const heading of [
    "Decision",
    "Mission brief",
    "Customer hot buttons and decision drivers",
    "Requirements trace",
    "Technology Assessment",
    "Trade studies",
    "Architecture views",
    "Coverage and evidence gaps",
    "Source evidence"
  ]) {
    assert.match(markdown, new RegExp(`## ${heading}`, "i"));
  }
  assert.doesNotMatch(markdown, /javascript:alert/i);
  assert.match(markdown, /Mission package technology selection[^\n]+Candidate Alpha mission package; Candidate Bravo open sensor stack/);
  assert.match(markdown, /Establish the sensor-to-edge boundary[^\n]+Draft interface control description/);

  const html = engine.buildDecisionPackageHtml(workspace, solution.id);
  assert.match(html, /^<!doctype html>/i);
  assert.doesNotMatch(html, /<script\b|<img\b/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /NO CUI \/ CLASSIFIED DATA/);
  assert.match(html, /Trade studies/);
  assert.match(html, /Mission package technology selection[^\n]+Candidate Alpha mission package; Candidate Bravo open sensor stack/);
  assert.match(html, /Establish the sensor-to-edge boundary[^\n]+Draft interface control description/);
});

test("recovery snapshots are bounded, non-nesting, and validated before restore", () => {
  let workspace = engine.createWorkspace();
  for (let index = 0; index < engine.MAX_SNAPSHOTS + 3; index += 1) {
    workspace = engine.pushSnapshot(workspace, `Snapshot ${index}`);
  }
  assert.equal(workspace.snapshots.length, engine.MAX_SNAPSHOTS);
  assert.ok(workspace.snapshots.every(snapshot => snapshot.workspace.snapshots.length === 0));

  const snapshotId = workspace.snapshots[0].id;
  const snapshottedName = workspace.snapshots[0].workspace.solutions[0].name;
  workspace.solutions[0].name = "Changed after snapshot";
  const restored = engine.restoreSnapshot(workspace, snapshotId);
  assert.equal(restored.solutions[0].name, snapshottedName);
  assert.equal(engine.validateWorkspace(restored).valid, true);

  const corrupt = structuredClone(workspace);
  corrupt.snapshots.find(snapshot => snapshot.id === snapshotId).workspace.activeSolutionId = "missing";
  assert.throws(() => engine.restoreSnapshot(corrupt, snapshotId), /snapshot is invalid/i);

  const mismatchedEnvelope = structuredClone(workspace);
  mismatchedEnvelope.snapshots[0].activeSolutionId = "solution_other";
  assert.match(engine.validateWorkspace(mismatchedEnvelope).errors.join("\n"), /activeSolutionId must match the nested workspace/i);
});

test("AI payloads expose only stage-scoped facts for the selected solution", () => {
  const first = engine.createWorkspace();
  const added = engine.addBlankSolution(first, "Other solution");
  const firstId = first.activeSolutionId;
  const payload = engine.buildAiPayload(
    added.workspace,
    firstId,
    "find_gaps",
    "Shape",
    { focus: "x".repeat(1_200) }
  );

  assert.equal(payload.contract_version, "solution-assist-v1");
  assert.equal(payload.workspace_version, engine.WORKSPACE_SCHEMA);
  assert.equal(payload.solution_id, firstId);
  assert.equal(payload.parameters.focus.length, 1_000);
  assert.deepEqual(payload.acknowledgment, {
    reviewed_exact_payload: true,
    approved_unclassified_non_cui_only: true,
    no_restricted_content: true
  });
  assert.ok(payload.facts.length > 1 && payload.facts.length <= 100);
  assert.ok(payload.facts.every(fact => fact.solution_id === firstId));
  assert.ok(payload.facts.every(fact => fact.record_id !== added.solution.id));
  assert.ok(payload.facts.every(fact => fact.content.length <= 12_000));

  const shapeTypes = new Set([
    "mission_context",
    "customer_hot_button",
    "outcome",
    "measure",
    "requirement",
    "evidence",
    "assumption"
  ]);
  assert.deepEqual(new Set(payload.facts.map(fact => fact.record_type)), shapeTypes);

  const proposePayload = engine.buildAiPayload(added.workspace, firstId, "find_gaps", "Propose");
  assert.deepEqual(new Set(proposePayload.facts.map(fact => fact.record_type)), new Set([
    "mission_context",
    "customer_hot_button",
    "win_theme",
    "requirement",
    "decision",
    "risk",
    "dependency",
    "roadmap_item",
    "evidence"
  ]));
  assert.throws(() => engine.buildAiPayload(first, firstId, "delete_workspace", "Shape"), /unsupported AI action/i);
  assert.throws(() => engine.buildAiPayload(first, firstId, "find_gaps", "Retire"), /unsupported lifecycle stage/i);
});

test("AI responses require a matching solution, complete result shape, and valid citations", () => {
  const workspace = engine.createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const response = {
    contract_version: "solution-assist-v1",
    solution_id: solutionId,
    action: "find_gaps",
    request_id: "request_test",
    model: "mock-model",
    result: resultShape(solutionId)
  };
  assert.equal(engine.validateAiResponse(response, workspace, solutionId).valid, true);

  const crossSolution = structuredClone(response);
  crossSolution.result.findings[0].citation_ids = ["solution_other"];
  assert.match(
    engine.validateAiResponse(crossSolution, workspace, solutionId).errors.join("\n"),
    /invalid or cross-solution citation/i
  );

  const malformed = structuredClone(response);
  delete malformed.result.review_questions;
  assert.match(engine.validateAiResponse(malformed, workspace, solutionId).errors.join("\n"), /invalid shape/i);

  const wrongSolution = structuredClone(response);
  wrongSolution.solution_id = "solution_other";
  assert.match(engine.validateAiResponse(wrongSolution, workspace, solutionId).errors.join("\n"), /another solution/i);
});

test("AI response validation enforces every server item contract before browser persistence", () => {
  const workspace = engine.createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const emptyResult = () => ({
    summary: "Grounded synthetic output.",
    drafts: [],
    findings: [],
    review_questions: [],
    architecture_views: [],
    assumptions: [],
    warnings: [],
    citation_ids: []
  });
  const response = (action, result) => ({
    contract_version: "solution-assist-v1",
    solution_id: solutionId,
    action,
    request_id: `request_${action}`,
    model: "mock-model",
    result
  });

  const draftResult = emptyResult();
  draftResult.drafts.push({ artifact_type: "decision_brief", title: "Decision brief", markdown: "# Supported draft", citation_ids: [solutionId] });
  draftResult.citation_ids = [solutionId];

  const critiqueResult = resultShape(solutionId);

  const questionResult = emptyResult();
  questionResult.review_questions.push({ question: "What closes the evidence gap?", rationale: "The decision needs an observable closure condition.", citation_ids: [solutionId] });
  questionResult.citation_ids = [solutionId];

  const architectureResult = emptyResult();
  architectureResult.architecture_views.push({
    view_type: "system_interfaces",
    title: "Proposed interface view",
    purpose: "Expose the governed modular boundary.",
    nodes: [{ node_id: "node_sensor", source_record_id: solutionId, element_type: "hardware", label: "Sensor", description: "Representative sensing element.", citation_ids: [solutionId] }],
    connections: [],
    citation_ids: [solutionId]
  });
  architectureResult.citation_ids = [solutionId];

  const validResponses = [
    response("draft_artifact", draftResult),
    response("critique_artifact", critiqueResult),
    response("find_gaps", critiqueResult),
    response("generate_review_questions", questionResult),
    response("propose_architecture_view", architectureResult)
  ];
  for (const value of validResponses) assert.equal(engine.validateAiResponse(value, workspace, solutionId, value.action).valid, true, value.action);

  const malformedFinding = response("find_gaps", resultShape(solutionId));
  malformedFinding.result.findings[0] = { text: "Legacy loose item", citation_ids: [solutionId] };
  assert.match(engine.validateAiResponse(malformedFinding, workspace, solutionId).errors.join("\n"), /severity is required|text is not supported/i);

  const malformedDraft = response("draft_artifact", structuredClone(draftResult));
  malformedDraft.result.drafts[0].markdown = 42;
  assert.match(engine.validateAiResponse(malformedDraft, workspace, solutionId).errors.join("\n"), /markdown is invalid/i);

  const malformedQuestion = response("generate_review_questions", structuredClone(questionResult));
  malformedQuestion.result.review_questions[0].rationale = "";
  assert.match(engine.validateAiResponse(malformedQuestion, workspace, solutionId).errors.join("\n"), /rationale is invalid/i);

  const malformedAssumption = response("find_gaps", emptyResult());
  malformedAssumption.result.assumptions.push({ text: "An assumption", citation_ids: [solutionId], confidence: "invented" });
  malformedAssumption.result.citation_ids = [solutionId];
  assert.match(engine.validateAiResponse(malformedAssumption, workspace, solutionId).errors.join("\n"), /confidence is not supported/i);

  const malformedView = response("propose_architecture_view", structuredClone(architectureResult));
  delete malformedView.result.architecture_views[0].nodes[0].description;
  assert.match(engine.validateAiResponse(malformedView, workspace, solutionId).errors.join("\n"), /description is required/i);

  const mismatchedUnion = response("find_gaps", resultShape(solutionId));
  mismatchedUnion.result.citation_ids = [];
  assert.match(engine.validateAiResponse(mismatchedUnion, workspace, solutionId).errors.join("\n"), /does not match the cited item union/i);

  const nonArrayView = response("propose_architecture_view", emptyResult());
  nonArrayView.result.architecture_views = {};
  assert.doesNotThrow(() => engine.validateAiResponse(nonArrayView, workspace, solutionId));
  assert.match(engine.validateAiResponse(nonArrayView, workspace, solutionId).errors.join("\n"), /architecture_views has an invalid shape/i);

  const persisted = structuredClone(workspace);
  const persistedResponse = response("find_gaps", resultShape(solutionId));
  persisted.aiDrafts.push({
    id: "ai_draft_strict_contract",
    solutionId,
    action: persistedResponse.action,
    stage: "Shape",
    title: "Strict contract draft",
    status: "Pending review",
    createdAt: new Date().toISOString(),
    citationIds: [solutionId],
    result: persistedResponse.result,
    requestId: persistedResponse.request_id,
    model: persistedResponse.model
  });
  assert.equal(engine.validateWorkspace(persisted).valid, true);
  delete persisted.aiDrafts[0].citationIds;
  assert.match(engine.validateWorkspace(persisted).errors.join("\n"), /citationIds is required/i);
});
