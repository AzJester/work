import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const capturePath = resolve(rootDir, "solutions-architect", "capture.js");
const enginePath = resolve(rootDir, "solutions-architect", "engine.js");
const capture = await import(pathToFileURL(capturePath));
const engine = await import(pathToFileURL(enginePath));

function fixture() {
  const workspace = engine.createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const inbox = capture.createCaptureInbox(solutionId, { createdAt: "2026-08-31T12:00:00.000Z" });
  const provenance = capture.createCaptureProvenance(solutionId, {
    id: "capture_source_customer_brief",
    sourceFileName: "synthetic-customer-brief.pdf",
    sourceTitle: "Synthetic customer brief",
    locator: "page 4, mission priorities",
    sourceUrl: "https://example.test/customer-brief",
    sha256: "a".repeat(64),
    capturedAt: "2026-08-31T12:01:00.000Z"
  });
  inbox.provenance.push(provenance);
  return { workspace, solutionId, inbox, provenance };
}

function makeItem(solutionId, provenanceId, target, proposalId, fields, options = {}) {
  return capture.createCaptureItem(solutionId, {
    id: options.id || `capture_item_${target}_${proposalId}`,
    proposalId,
    evidenceProposalId: options.evidenceProposalId || "",
    provenanceId,
    target,
    excerpt: options.excerpt || "Selected and bounded source excerpt.",
    fields
  });
}

test("capture inbox is a strict, separate, versioned solution-scoped envelope", () => {
  const { workspace, solutionId, inbox } = fixture();
  assert.equal(inbox.schema, "solution-capture-inbox-v1");
  assert.equal(inbox.schemaVersion, 1);
  assert.equal(capture.CAPTURE_STORAGE_KEY, "solution_architect_capture_inbox_v1");
  assert.equal(capture.captureStorageKey(solutionId), `solution_architect_capture_inbox_v1:${solutionId}`);
  assert.throws(() => capture.captureStorageKey("../other-solution"), /valid solution ID/i);
  assert.deepEqual(capture.CAPTURE_TARGETS, ["hotButton", "evidence", "requirement", "winTheme", "assumption", "risk", "decision", "ignore"]);
  assert.equal(capture.validateCaptureInbox(inbox, { workspace }).valid, true);
  assert.equal(Object.hasOwn(workspace, "capture"), false);
  assert.equal(Object.hasOwn(workspace, "captureInbox"), false);
  assert.equal(inbox.solutionId, solutionId);

  for (const mutation of [
    candidate => { candidate.schema = "solution-workspace-v1"; },
    candidate => { candidate.schemaVersion = 2; },
    candidate => { candidate.unexpected = []; },
    candidate => { delete candidate.updatedAt; }
  ]) {
    const malformed = structuredClone(inbox);
    mutation(malformed);
    const result = capture.validateCaptureInbox(malformed, { workspace });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  }
});

test("malformed capture records, binary objects, unsafe URLs, and unsupported mappings fail closed", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_captured_1", {
    title: "Selected evidence",
    source: "",
    url: "",
    notes: "",
    confidence: "Low"
  });
  inbox.items.push(evidence);

  const unsafeUrl = structuredClone(inbox);
  unsafeUrl.provenance[0].sourceUrl = "javascript:alert(document.domain)";
  assert.match(capture.validateCaptureInbox(unsafeUrl, { workspace }).errors.join("\n"), /HTTP\(S\) URL/i);

  const credentialUrl = structuredClone(inbox);
  credentialUrl.provenance[0].sourceUrl = "https://user:secret@example.test/file";
  assert.match(capture.validateCaptureInbox(credentialUrl, { workspace }).errors.join("\n"), /embedded credentials/i);

  const binary = structuredClone(inbox);
  binary.provenance[0].binary = new Uint8Array([1, 2, 3]);
  const binaryResult = capture.validateCaptureInbox(binary, { workspace });
  assert.equal(binaryResult.valid, false);
  assert.match(binaryResult.errors.join("\n"), /binary|not supported/i);

  const unsupportedField = structuredClone(inbox);
  unsupportedField.items[0].fields.modelConfidence = 0.99;
  assert.match(capture.validateCaptureInbox(unsupportedField, { workspace }).errors.join("\n"), /modelConfidence is not supported/i);

  const missingField = structuredClone(inbox);
  delete missingField.items[0].fields.notes;
  assert.match(capture.validateCaptureInbox(missingField, { workspace }).errors.join("\n"), /fields\.notes is required/i);

  const invalidHash = structuredClone(inbox);
  invalidHash.provenance[0].sha256 = "not-a-digest";
  assert.match(capture.validateCaptureInbox(invalidHash, { workspace }).errors.join("\n"), /64-character hexadecimal/i);
});

test("capture envelope and selected excerpts are bounded and full source text is segmented deterministically", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const oversizedExcerpt = makeItem(solutionId, provenance.id, "hotButton", "hot_button_oversized", {
    title: "Delivery urgency",
    detail: "",
    source: ""
  }, { excerpt: "x".repeat(capture.MAX_CAPTURE_EXCERPT_CHARS + 1) });
  inbox.items.push(oversizedExcerpt);
  assert.match(capture.validateCaptureInbox(inbox, { workspace }).errors.join("\n"), /excerpt exceeds/i);

  const tooMany = capture.createCaptureInbox(solutionId, { createdAt: "2026-08-31T12:00:00.000Z" });
  tooMany.provenance.push(provenance);
  tooMany.items = Array.from({ length: capture.MAX_CAPTURE_ITEMS + 1 }, (_, index) => ({ ...oversizedExcerpt, id: `capture_item_bound_${index}`, proposalId: `hot_button_bound_${index}`, excerpt: "bounded" }));
  assert.match(capture.validateCaptureInbox(tooMany, { workspace }).errors.join("\n"), /items exceeds 500/i);

  const sourceText = `${"alpha ".repeat(90)}\n\n${"bravo ".repeat(90)}\n\nfinal paragraph`;
  const segments = capture.segmentCaptureText(sourceText, { maxChars: 300, maxSegments: 10 });
  assert.ok(segments.length > 2);
  assert.ok(segments.every((segment, index) => segment.index === index && segment.text.length <= 300));
  assert.equal(segments.at(-1).text, "final paragraph");
  assert.throws(() => capture.segmentCaptureText("x".repeat(capture.MAX_CAPTURE_SOURCE_TEXT_CHARS + 1)), /exceeds/i);
  assert.throws(() => capture.segmentCaptureText(sourceText, { maxChars: 300, maxSegments: 1 }), /segment limit/i);
});

test("capture records and all explicit links cannot cross solution boundaries", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const added = engine.addBlankSolution(workspace, "Other solution");
  const otherId = added.solution.id;
  added.workspace.evidence.push({
    id: "evidence_other_solution",
    solutionId: otherId,
    title: "Other evidence",
    source: "Synthetic",
    url: "",
    notes: "",
    confidence: "Low"
  });

  const requirement = makeItem(solutionId, provenance.id, "requirement", "requirement_capture_boundary", {
    title: "Bounded requirement",
    type: "Functional",
    priority: "Must",
    acceptanceMethod: "Demonstration",
    linkedHotButtonIds: []
  }, { evidenceProposalId: "evidence_other_solution" });
  inbox.items.push(requirement);
  assert.match(capture.validateCaptureInbox(inbox, { workspace: added.workspace }).errors.join("\n"), /crosses solution boundaries/i);

  const wrongItemScope = structuredClone(inbox);
  wrongItemScope.items[0].solutionId = otherId;
  assert.match(capture.validateCaptureInbox(wrongItemScope, { workspace: added.workspace }).errors.join("\n"), /solutionId crosses solution boundaries/i);

  const wrongProvenanceScope = structuredClone(inbox);
  wrongProvenanceScope.provenance[0].solutionId = otherId;
  assert.match(capture.validateCaptureInbox(wrongProvenanceScope, { workspace: added.workspace }).errors.join("\n"), /provenance\[0\]\.solutionId crosses solution boundaries/i);
});

test("same-batch evidence and hot-button links require explicit selection", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_same_batch", {
    title: "Customer brief excerpt",
    source: "",
    url: "https://example.test/customer-brief#page=4",
    notes: "Selected mission-priority excerpt.",
    confidence: "Low"
  }, { id: "capture_item_evidence_same_batch" });
  const hotButton = makeItem(solutionId, provenance.id, "hotButton", "hot_button_same_batch", {
    title: "Demonstrate before source selection",
    detail: "The customer needs representative proof early.",
    source: ""
  }, { id: "capture_item_hot_button_same_batch" });
  const requirement = makeItem(solutionId, provenance.id, "requirement", "requirement_same_batch", {
    title: "Complete a representative demonstration before source selection",
    type: "Performance",
    priority: "Must",
    acceptanceMethod: "Witnessed mission-thread demonstration",
    linkedHotButtonIds: [hotButton.proposalId]
  }, { id: "capture_item_requirement_same_batch", evidenceProposalId: evidence.proposalId });
  inbox.items.push(evidence, hotButton, requirement);
  assert.equal(capture.validateCaptureInbox(inbox, { workspace }).valid, true);

  const partial = capture.materializeCaptureItems(workspace, inbox, { itemIds: [requirement.id], nowIso: () => "2026-08-31T12:05:00.000Z" });
  assert.equal(partial.valid, false);
  assert.match(partial.errors.join("\n"), /same batch or already present/i);
  assert.deepEqual(partial.nextWorkspace, workspace);
  assert.deepEqual(partial.nextInbox, inbox);

  const complete = capture.materializeCaptureItems(workspace, inbox, { itemIds: [requirement.id, evidence.id, hotButton.id], nowIso: () => "2026-08-31T12:05:00.000Z" });
  assert.equal(complete.valid, true, complete.errors.join("\n"));
  const created = complete.nextWorkspace.requirements.find(record => record.id === requirement.proposalId);
  assert.equal(created.sourceEvidenceId, evidence.proposalId);
  assert.deepEqual(created.linkedHotButtonIds, [hotButton.proposalId]);
});

test("explicit materialization maps every supported target conservatively, including win themes", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_materialized", {
    title: "Approved customer brief excerpt",
    source: "",
    url: "https://example.test/customer-brief",
    notes: "",
    confidence: "Low"
  }, { id: "capture_item_evidence_materialized", excerpt: "The selected evidence excerpt." });
  const hotButton = makeItem(solutionId, provenance.id, "hotButton", "hot_button_materialized", {
    title: "Avoid platform redesign",
    detail: "Preserve the host-platform boundary.",
    source: ""
  }, { id: "capture_item_hot_button_materialized" });
  const requirement = makeItem(solutionId, provenance.id, "requirement", "requirement_materialized", {
    title: "Use a documented modular interface",
    type: "Interface",
    priority: "Must",
    acceptanceMethod: "Interface conformance test",
    linkedHotButtonIds: [hotButton.proposalId]
  }, { id: "capture_item_requirement_materialized", evidenceProposalId: evidence.proposalId });
  const winTheme = makeItem(solutionId, provenance.id, "winTheme", "win_theme_materialized", {
    title: "Mission flexibility without platform redesign",
    customerValue: "Replace mission components while preserving the platform boundary.",
    linkedHotButtonIds: [hotButton.proposalId],
    sourceEvidenceIds: [evidence.proposalId]
  }, { id: "capture_item_win_theme_materialized", evidenceProposalId: evidence.proposalId });
  const assumption = makeItem(solutionId, provenance.id, "assumption", "assumption_materialized", {
    statement: "The platform interface remains available for the demonstration.",
    owner: "",
    validationPlan: "Confirm at the integration-readiness review."
  }, { id: "capture_item_assumption_materialized" });
  const risk = makeItem(solutionId, provenance.id, "risk", "risk_materialized", {
    title: "Platform access may arrive late",
    likelihood: "Unknown",
    impact: "Unknown",
    owner: "",
    mitigation: "Use a representative interface harness."
  }, { id: "capture_item_risk_materialized" });
  const decision = makeItem(solutionId, provenance.id, "decision", "decision_materialized", {
    title: "Adopt the modular mission-package boundary",
    rationale: "Preserves competition and upgrade paths.",
    evidenceIds: [evidence.proposalId],
    owner: "Solution architect",
    date: ""
  }, { id: "capture_item_decision_materialized", evidenceProposalId: evidence.proposalId });
  const ignored = makeItem(solutionId, provenance.id, "ignore", "ignored_capture_materialized", {
    reason: "Document boilerplate, not solution information."
  }, { id: "capture_item_ignored" });
  inbox.items.push(evidence, hotButton, requirement, winTheme, assumption, risk, decision, ignored);

  const result = capture.materializeCaptureItems(workspace, inbox, {
    itemIds: inbox.items.map(item => item.id),
    nowIso: () => "2026-08-31T12:10:00.000Z"
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(engine.validateWorkspace(result.nextWorkspace).valid, true);
  assert.equal(result.nextWorkspace.hotButtons.find(record => record.id === hotButton.proposalId).status, "Captured");
  assert.equal(result.nextWorkspace.hotButtons.find(record => record.id === hotButton.proposalId).confidence, "Unverified");
  assert.equal(result.nextWorkspace.requirements.find(record => record.id === requirement.proposalId).status, "Draft");
  assert.equal(result.nextWorkspace.assumptions.find(record => record.id === assumption.proposalId).status, "Unverified");
  assert.deepEqual(
    Object.fromEntries(["likelihood", "impact", "status"].map(field => [field, result.nextWorkspace.risks.find(record => record.id === risk.proposalId)[field]])),
    { likelihood: "Unknown", impact: "Unknown", status: "Open" }
  );
  assert.equal(result.nextWorkspace.decisions.find(record => record.id === decision.proposalId).status, "Proposed");
  assert.deepEqual(result.nextWorkspace.decisions.find(record => record.id === decision.proposalId).evidenceIds, [evidence.proposalId]);
  const theme = result.nextWorkspace.winThemes.find(record => record.id === winTheme.proposalId);
  assert.equal(theme.status, "Draft");
  assert.equal(theme.discriminator, "");
  assert.equal(theme.proof, "");
  assert.deepEqual(theme.linkedHotButtonIds, [hotButton.proposalId]);
  assert.deepEqual(theme.sourceEvidenceIds, [evidence.proposalId]);
  assert.equal(result.nextWorkspace.evidence.find(record => record.id === evidence.proposalId).notes, "The selected evidence excerpt.");
  assert.equal(result.nextInbox.items.find(item => item.id === ignored.id).status, "ignored");
  assert.equal(findRecord(result.nextWorkspace, ignored.proposalId), null);
});

test("fallback source labels remain within destination contracts for long valid provenance", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  provenance.sourceTitle = "S".repeat(300);
  provenance.locator = `L${"o".repeat(498)}r`;
  const hotButton = makeItem(solutionId, provenance.id, "hotButton", "hot_button_long_source", {
    title: "Long-source customer signal",
    detail: "Bounded detail",
    source: ""
  });
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_long_source", {
    title: "Long-source evidence",
    source: "",
    url: "",
    notes: "Bounded note",
    confidence: "Low"
  });
  inbox.items.push(hotButton, evidence);
  assert.equal(capture.validateCaptureInbox(inbox, { workspace }).valid, true);

  const result = capture.materializeCaptureItems(workspace, inbox, { itemIds: [hotButton.id, evidence.id] });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.nextWorkspace.hotButtons.find(item => item.id === hotButton.proposalId).source.length, 300);
  assert.equal(result.nextWorkspace.evidence.find(item => item.id === evidence.proposalId).source.length, 500);
});

function findRecord(workspace, id) {
  for (const value of Object.values(workspace)) {
    if (!Array.isArray(value)) continue;
    const record = value.find(candidate => candidate?.id === id);
    if (record) return record;
  }
  return null;
}

test("preallocated proposal IDs make retries idempotent without overwriting records", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_idempotent", {
    title: "Idempotent evidence",
    source: "",
    url: "",
    notes: "One record only.",
    confidence: "Low"
  }, { id: "capture_item_evidence_idempotent" });
  inbox.items.push(evidence);
  const options = { itemIds: [evidence.id], nowIso: () => "2026-08-31T12:15:00.000Z" };
  const first = capture.materializeCaptureItems(workspace, inbox, options);
  assert.equal(first.valid, true);
  assert.equal(first.nextWorkspace.evidence.filter(record => record.id === evidence.proposalId).length, 1);

  const persistedWorkspaceOnly = capture.materializeCaptureItems(first.nextWorkspace, inbox, options);
  assert.equal(persistedWorkspaceOnly.valid, true, persistedWorkspaceOnly.errors.join("\n"));
  assert.deepEqual(persistedWorkspaceOnly.nextWorkspace, first.nextWorkspace);
  assert.equal(persistedWorkspaceOnly.nextInbox.items[0].status, "materialized");
  assert.deepEqual(persistedWorkspaceOnly.skippedItemIds, [evidence.id]);

  const repeated = capture.materializeCaptureItems(first.nextWorkspace, first.nextInbox, options);
  assert.equal(repeated.valid, true);
  assert.deepEqual(repeated.nextWorkspace, first.nextWorkspace);
  assert.deepEqual(repeated.nextInbox, first.nextInbox);
  assert.equal(repeated.nextWorkspace.evidence.filter(record => record.id === evidence.proposalId).length, 1);
});

test("hostile authored excerpts stay inert and URLs are normalized only at materialization", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const hostile = `<script>globalThis.compromised=true</script><img src=x onerror=alert(1)>`;
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_hostile_capture", {
    title: `Customer evidence ${hostile}`,
    source: "",
    url: "https://example.test/reference",
    notes: "",
    confidence: "Low"
  }, { id: "capture_item_evidence_hostile", excerpt: hostile });
  inbox.items.push(evidence);
  const result = capture.materializeCaptureItems(workspace, inbox, { itemIds: [evidence.id], nowIso: () => "2026-08-31T12:20:00.000Z" });
  assert.equal(result.valid, true, result.errors.join("\n"));
  const record = result.nextWorkspace.evidence.find(item => item.id === evidence.proposalId);
  assert.equal(record.notes, hostile);
  assert.equal(record.url, "https://example.test/reference");
  const html = engine.buildDecisionPackageHtml(result.nextWorkspace, solutionId);
  assert.doesNotMatch(html, /<script>|<img src=x/i);
  assert.match(html, /&lt;script&gt;|&lt;img/);
  assert.equal(globalThis.compromised, undefined);
});

test("capture staging never mutates, persists, commits, or leaks into workspace AI and exports", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const originalWorkspace = structuredClone(workspace);
  const originalAi = engine.buildAiPayload(workspace, solutionId, "find_gaps", "Shape");
  const originalPackage = engine.buildDecisionPackageMarkdown(workspace, solutionId);
  const item = makeItem(solutionId, provenance.id, "requirement", "requirement_not_committed", {
    title: "This must remain staged",
    type: "Functional",
    priority: "Must",
    acceptanceMethod: "",
    linkedHotButtonIds: []
  }, { id: "capture_item_not_committed" });
  inbox.items.push(item);

  assert.deepEqual(workspace, originalWorkspace);
  assert.deepEqual(engine.buildAiPayload(workspace, solutionId, "find_gaps", "Shape"), originalAi);
  assert.equal(engine.buildDecisionPackageMarkdown(workspace, solutionId), originalPackage);
  assert.doesNotMatch(JSON.stringify(workspace), /This must remain staged|solution-capture-inbox-v1/);

  const noSelection = capture.materializeCaptureItems(workspace, inbox);
  assert.equal(noSelection.valid, false);
  assert.match(noSelection.errors.join("\n"), /explicitly selected/i);
  assert.deepEqual(noSelection.nextWorkspace, workspace);
  assert.deepEqual(noSelection.nextInbox, inbox);

  const source = readFileSync(capturePath, "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|\bfetch\s*\(|buildAiPayload|buildDecisionPackage|download\s*\(/);
});

test("materialization invokes the supplied workspace validator and returns clones", () => {
  const { workspace, solutionId, inbox, provenance } = fixture();
  const evidence = makeItem(solutionId, provenance.id, "evidence", "evidence_helper_validation", {
    title: "Helper validation evidence",
    source: "",
    url: "",
    notes: "",
    confidence: "Low"
  }, { id: "capture_item_helper_validation" });
  inbox.items.push(evidence);
  let calls = 0;
  const validateWorkspace = candidate => {
    calls += 1;
    return engine.validateWorkspace(candidate);
  };
  const result = capture.materializeCaptureItems(workspace, inbox, {
    itemIds: [evidence.id],
    validateWorkspace,
    nowIso: () => "2026-08-31T12:25:00.000Z"
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(calls >= 4);
  assert.notEqual(result.nextWorkspace, workspace);
  assert.notEqual(result.nextInbox, inbox);
  assert.equal(workspace.evidence.some(record => record.id === evidence.proposalId), false);
  assert.equal(inbox.items[0].status, "pending");
});
