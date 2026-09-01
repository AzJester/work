import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_BASE_SCHEMA,
  KNOWLEDGE_BASE_SCHEMA_VERSION,
  KNOWLEDGE_BASE_STORAGE_KEY,
  KNOWLEDGE_LIFECYCLE_STATUSES,
  KNOWLEDGE_OFFERING_TYPES,
  MAX_KNOWLEDGE_IMPORT_BYTES,
  createKnowledgeBase,
  createKnowledgeItem,
  materializeKnowledgeItem,
  refreshCandidateFromKnowledge,
  updateKnowledgeItem,
  validateKnowledgeBase
} from "../solutions-architect/knowledge-base.js";
import {
  MISSION_SEGMENTS,
  createWorkspace,
  validateWorkspace
} from "../solutions-architect/engine.js";

const createdAt = new Date("2026-08-31T19:30:00.000Z");
const updatedAt = new Date("2026-09-01T16:45:00.000Z");

function validationErrors(candidate) {
  return validateKnowledgeBase(candidate).errors.join("\n");
}

test("the Knowledge Base uses a separate, versioned, browser-local contract", () => {
  const empty = createKnowledgeBase({ seed: false, generatedAt: createdAt });
  assert.deepEqual(empty, {
    schema: KNOWLEDGE_BASE_SCHEMA,
    schemaVersion: KNOWLEDGE_BASE_SCHEMA_VERSION,
    savedAt: createdAt.toISOString(),
    items: []
  });
  assert.equal(KNOWLEDGE_BASE_SCHEMA, "solution-knowledge-base-v1");
  assert.equal(KNOWLEDGE_BASE_SCHEMA_VERSION, 1);
  assert.equal(KNOWLEDGE_BASE_STORAGE_KEY, "solution_architect_knowledge_base_v1");
  assert.equal(MAX_KNOWLEDGE_IMPORT_BYTES, 5_000_000);
  assert.deepEqual(KNOWLEDGE_OFFERING_TYPES, ["Product", "Application", "Software", "Service", "Platform", "Integrated solution", "Other offering"]);
  assert.deepEqual(KNOWLEDGE_LIFECYCLE_STATUSES, ["Current", "Emerging", "Legacy", "Retired"]);
  assert.equal(validateKnowledgeBase(empty).valid, true);

  const seeded = createKnowledgeBase({ generatedAt: createdAt });
  assert.equal(seeded.items.length, 1);
  assert.equal(seeded.items[0].name, "Synthetic modular mission integration kit");
  assert.equal(seeded.items[0].readinessAsOf, "2026-08-31");
  assert.equal(validateKnowledgeBase(seeded).valid, true);

  const workspace = createWorkspace();
  assert.equal(Object.hasOwn(workspace, "knowledgeBase"), false, "shared catalog content must not silently enter a solution backup");
  const mixedContract = structuredClone(workspace);
  mixedContract.knowledgeBase = seeded;
  assert.match(validateWorkspace(mixedContract).errors.join("\n"), /Workspace\.knowledgeBase is not supported/i);
});

test("knowledge items clone list values and preserve the complete offering record", () => {
  const capabilities = ["Mission planning", "Interface verification"];
  const missionSegments = [MISSION_SEGMENTS[0].name];
  const tags = ["planning", "MOSA"];
  const item = createKnowledgeItem({
    id: "offering_reference_planner",
    name: "Reference mission planner",
    offeringType: "Application",
    provider: "Synthetic provider",
    version: "2.4",
    lifecycleStatus: "Emerging",
    summary: "Reusable planning capability.",
    capabilities,
    missionSegments,
    deploymentAndEnvironment: "Disconnected and connected planning environments.",
    interfaces: "Versioned mission-planning API.",
    integrationConsiderations: "Confirm host and identity boundaries.",
    cyberSafetyConsiderations: "Confirm authorization evidence.",
    mosaDataRights: "Interface and software data rights require review.",
    trl: 7,
    mrl: 5,
    irl: 6,
    readinessBasis: "Representative environment demonstration.",
    readinessAsOf: "2026-08-30",
    sourceTitle: "Approved synthetic product sheet",
    sourceUrl: "https://example.test/reference-planner",
    sourceNotes: "Synthetic source only.",
    tags,
    reviewedAt: "2026-08-30",
    changeSummary: "Added the versioned interface."
  }, createdAt);

  capabilities.push("MUTATION-SENTINEL");
  missionSegments.length = 0;
  tags.push("MUTATION-SENTINEL");
  assert.deepEqual(item.capabilities, ["Mission planning", "Interface verification"]);
  assert.deepEqual(item.missionSegments, [MISSION_SEGMENTS[0].name]);
  assert.deepEqual(item.tags, ["planning", "MOSA"]);
  assert.equal(item.revision, 1);
  assert.equal(item.createdAt, createdAt.toISOString());
  assert.equal(item.updatedAt, createdAt.toISOString());
  assert.equal(validateKnowledgeBase({ ...createKnowledgeBase({ seed: false, generatedAt: createdAt }), items: [item] }).valid, true);
});

test("Knowledge Base validation rejects malformed, ambiguous, and unsafe imports before persistence", () => {
  const base = createKnowledgeBase({ generatedAt: createdAt });
  const cases = [
    [candidate => { candidate.schemaVersion = 2; }, /Unsupported Knowledge Base schema version/i],
    [candidate => { candidate.injected = true; }, /Knowledge Base\.injected is not supported/i],
    [candidate => { delete candidate.items[0].summary; }, /items\[0\]\.summary is required/i],
    [candidate => { candidate.items[0].solutionId = "solution_forbidden"; }, /solutionId is not supported/i],
    [candidate => { candidate.items.push(structuredClone(candidate.items[0])); }, /Duplicate Knowledge Base item ID/i],
    [candidate => { candidate.items[0].offeringType = "Weapon system"; }, /offeringType is unsupported/i],
    [candidate => { candidate.items[0].lifecycleStatus = "Unreviewed"; }, /lifecycleStatus is unsupported/i],
    [candidate => { candidate.items[0].missionSegments = ["Invented mission segment"]; }, /missionSegments\[0\] is unsupported/i],
    [candidate => { candidate.items[0].capabilities = ["Duplicate", "Duplicate"]; }, /capabilities\[1\] is duplicated/i],
    [candidate => { candidate.items[0].trl = 0; }, /trl must be 1-9 or null/i],
    [candidate => { candidate.items[0].mrl = 11; }, /mrl must be 1-10 or null/i],
    [candidate => { candidate.items[0].irl = -1; }, /irl must be 0-9 or null/i],
    [candidate => { candidate.items[0].revision = Number.MAX_SAFE_INTEGER + 1; }, /revision must be a positive integer within the safe range/i],
    [candidate => { candidate.items[0].reviewedAt = "2026-02-31"; }, /reviewedAt must use a valid YYYY-MM-DD/i],
    [candidate => { candidate.items[0].sourceUrl = "javascript:alert(1)"; }, /sourceUrl must use HTTP or HTTPS/i],
    [candidate => { candidate.items[0].sourceUrl = "https://user:secret@example.test/reference"; }, /sourceUrl must not contain credentials/i]
  ];

  for (const [mutate, pattern] of cases) {
    const candidate = structuredClone(base);
    mutate(candidate);
    assert.match(validationErrors(candidate), pattern);
  }

  const oversized = createKnowledgeBase({ seed: false, generatedAt: createdAt });
  oversized.items = Array.from({ length: 1_001 }, (_, index) => ({ id: `offering_${index}` }));
  assert.match(validationErrors(oversized), /items exceeds 1,000 records/i);
});

test("copy-on-use creates solution-scoped candidates with explicit, validated catalog provenance", () => {
  const catalog = createKnowledgeBase({ generatedAt: createdAt });
  const item = structuredClone(catalog.items[0]);
  item.sourceUrl = "https://example.test/catalog/offering";
  item.reviewedAt = "2026-08-30";
  assert.equal(validateKnowledgeBase({ ...catalog, items: [item] }).valid, true);

  const workspace = createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const candidate = materializeKnowledgeItem(item, solutionId, {
    generatedAt: updatedAt,
    idFactory: prefix => `${prefix}_catalog_copy`
  });
  assert.equal(candidate.id, "candidate_catalog_copy");
  assert.equal(candidate.solutionId, solutionId);
  assert.equal(candidate.name, item.name);
  assert.equal(candidate.category, item.offeringType);
  assert.equal(candidate.vendor, item.provider);
  assert.match(candidate.description, /Capabilities: Modular sensor integration/);
  assert.match(candidate.description, /MOSA and data rights:/);
  assert.equal(candidate.status, "Considering");
  assert.deepEqual(candidate.scores, []);
  assert.deepEqual(candidate.catalogSource, {
    itemId: item.id,
    revision: item.revision,
    itemName: item.name,
    importedAt: updatedAt.toISOString(),
    reviewedAt: item.reviewedAt,
    sourceUrl: item.sourceUrl
  });
  assert.equal(Object.hasOwn(item, "solutionId"), false, "the shared item must remain solution-independent");

  const copiedWorkspace = structuredClone(workspace);
  copiedWorkspace.candidates.push(candidate);
  assert.equal(validateWorkspace(copiedWorkspace).valid, true);

  const legacyWorkspace = createWorkspace();
  assert.equal(Object.hasOwn(legacyWorkspace.candidates[0], "catalogSource"), false);
  assert.equal(validateWorkspace(legacyWorkspace).valid, true, "legacy candidates without catalog provenance must remain valid");

  for (const [mutate, pattern] of [
    [source => { source.revision = 0; }, /catalogSource\.revision must be a positive integer/i],
    [source => { source.revision = Number.MAX_SAFE_INTEGER + 1; }, /catalogSource\.revision must be a positive integer within the safe range/i],
    [source => { source.importedAt = "yesterday"; }, /catalogSource\.importedAt must be an ISO timestamp/i],
    [source => { source.reviewedAt = "08\/30\/2026"; }, /catalogSource\.reviewedAt must use a valid YYYY-MM-DD/i],
    [source => { source.sourceUrl = "file:\/\/\/restricted"; }, /catalogSource\.sourceUrl must use HTTP or HTTPS/i],
    [source => { delete source.itemName; }, /catalogSource\.itemName is required/i]
  ]) {
    const malformed = structuredClone(copiedWorkspace);
    mutate(malformed.candidates.at(-1).catalogSource);
    assert.match(validateWorkspace(malformed).errors.join("\n"), pattern);
  }

  const duplicateCopy = structuredClone(copiedWorkspace);
  duplicateCopy.candidates.push({ ...structuredClone(candidate), id: "candidate_duplicate_catalog_copy" });
  assert.match(validateWorkspace(duplicateCopy).errors.join("\n"), /catalogSource\.itemId duplicates another Knowledge Base copy in this solution/i);

  const otherSolutionCopy = structuredClone(copiedWorkspace);
  const otherSolutionId = "solution_other_catalog_copy";
  otherSolutionCopy.solutions.push({ ...structuredClone(otherSolutionCopy.solutions[0]), id: otherSolutionId, name: "Other solution" });
  otherSolutionCopy.candidates.push({ ...structuredClone(candidate), id: "candidate_other_solution_catalog_copy", solutionId: otherSolutionId });
  assert.equal(validateWorkspace(otherSolutionCopy).valid, true, "the same catalog item may be copied once into each solution");
});

test("catalog revisions refresh copied facts without overwriting solution-specific assessment work", () => {
  const catalog = createKnowledgeBase({ generatedAt: createdAt });
  const originalCatalog = structuredClone(catalog);
  const originalItem = catalog.items[0];
  const candidate = materializeKnowledgeItem(originalItem, "solution_test", {
    generatedAt: createdAt,
    idFactory: () => "candidate_test"
  });
  candidate.status = "Preferred";
  candidate.scores = [{ criterionId: "criterion_test", value: 4, rationale: "Solution-specific score.", evidenceIds: ["evidence_test"] }];
  candidate.solutionNote = "Preserve extension fields during an explicit refresh.";

  const nextCatalog = updateKnowledgeItem(catalog, originalItem.id, {
    name: "Updated modular mission integration kit",
    summary: "Updated reusable facts.",
    trl: 7,
    changeSummary: "Refreshed readiness and summary."
  }, { generatedAt: updatedAt });
  assert.deepEqual(catalog, originalCatalog, "catalog updates must not mutate the previous revision");
  assert.equal(nextCatalog.items[0].revision, originalItem.revision + 1);
  assert.equal(nextCatalog.items[0].createdAt, originalItem.createdAt);
  assert.equal(nextCatalog.items[0].updatedAt, updatedAt.toISOString());
  assert.equal(validateKnowledgeBase(nextCatalog).valid, true);

  const refreshed = refreshCandidateFromKnowledge(candidate, nextCatalog.items[0], { generatedAt: updatedAt });
  assert.equal(refreshed.id, candidate.id);
  assert.equal(refreshed.solutionId, candidate.solutionId);
  assert.equal(refreshed.name, "Updated modular mission integration kit");
  assert.equal(refreshed.trl, 7);
  assert.equal(refreshed.catalogSource.revision, 2);
  assert.equal(refreshed.catalogSource.importedAt, updatedAt.toISOString());
  assert.equal(refreshed.status, "Preferred");
  assert.deepEqual(refreshed.scores, candidate.scores);
  assert.equal(refreshed.solutionNote, candidate.solutionNote);
  assert.equal(candidate.name, originalItem.name, "refresh must not mutate the existing solution copy");
  assert.throws(() => updateKnowledgeItem(catalog, "offering_missing", {}, { generatedAt: updatedAt }), /item was not found/i);

  const exhausted = structuredClone(catalog);
  exhausted.items[0].revision = Number.MAX_SAFE_INTEGER;
  assert.throws(() => updateKnowledgeItem(exhausted, exhausted.items[0].id, {}, { generatedAt: updatedAt }), /revision cannot be advanced safely/i);
});
