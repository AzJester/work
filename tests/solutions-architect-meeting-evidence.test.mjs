import assert from "node:assert/strict";
import test from "node:test";

import * as capture from "../solutions-architect/capture.js";
import {
  EVIDENCE_SOURCE_TYPES,
  MISSION_SEGMENTS,
  buildDecisionPackageMarkdown,
  createWorkspace,
  validateWorkspace
} from "../solutions-architect/engine.js";

const meetingMetadata = Object.freeze({
  sourceType: "Meeting transcript",
  meetingDate: "2026-08-29",
  participants: ["Avery Chen", "Morgan Ellis"],
  missionSegments: [MISSION_SEGMENTS[0].name, MISSION_SEGMENTS[2].name]
});

test("evidence meeting metadata is optional for legacy workspaces and strictly validated when present", () => {
  assert.deepEqual(EVIDENCE_SOURCE_TYPES, [
    "Meeting transcript",
    "Meeting summary",
    "Document",
    "Observation",
    "Other"
  ]);

  const legacy = createWorkspace();
  assert.equal(Object.hasOwn(legacy.evidence[0], "sourceType"), false);
  assert.equal(validateWorkspace(legacy).valid, true);

  const current = structuredClone(legacy);
  Object.assign(current.evidence[0], meetingMetadata);
  assert.equal(validateWorkspace(current).valid, true);

  for (const [mutation, pattern] of [
    [record => { record.sourceType = "Email"; }, /sourceType is unsupported/i],
    [record => { record.meetingDate = "2026-02-31"; }, /meetingDate must use a valid YYYY-MM-DD/i],
    [record => { record.participants = ["Avery Chen", ""]; }, /participants\[1\] must not be empty/i],
    [record => { record.missionSegments = ["Invented segment"]; }, /missionSegments\[0\] is unsupported/i],
    [record => { record.missionSegments = [MISSION_SEGMENTS[0].name, MISSION_SEGMENTS[0].name]; }, /missionSegments\[1\] is duplicated/i]
  ]) {
    const invalid = structuredClone(current);
    mutation(invalid.evidence[0]);
    assert.match(validateWorkspace(invalid).errors.join("\n"), pattern);
  }
});

test("decision packages include meeting evidence provenance without changing legacy records", () => {
  const workspace = createWorkspace();
  Object.assign(workspace.evidence[0], meetingMetadata);

  const markdown = buildDecisionPackageMarkdown(workspace);
  assert.match(markdown, /\| Evidence \| Type \| Source date \| Participants \| Mission segments \|/);
  assert.match(markdown, /Meeting transcript/);
  assert.match(markdown, /2026-08-29/);
  assert.match(markdown, /Avery Chen; Morgan Ellis/);
  assert.match(markdown, /Integrated Air and Missile Defense/);
  assert.match(markdown, /Layered Defense, Autonomous Warfare & Integrated Fires/);
});

test("capture inboxes accept optional meeting metadata and materialize it onto evidence", () => {
  const workspace = createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const inbox = capture.createCaptureInbox(solutionId, { createdAt: "2026-08-31T12:00:00.000Z" });
  const provenance = capture.createCaptureProvenance(solutionId, {
    id: "capture_source_meeting",
    sourceTitle: "Synthetic integration review",
    locator: "discussion of mission priorities",
    capturedAt: "2026-08-31T12:01:00.000Z"
  });
  inbox.provenance.push(provenance);

  const legacyItem = capture.createCaptureItem(solutionId, {
    id: "capture_item_legacy_evidence",
    proposalId: "evidence_legacy_capture",
    provenanceId: provenance.id,
    target: "evidence",
    excerpt: "Legacy selected excerpt.",
    fields: { title: "Legacy evidence", source: "", url: "", notes: "", confidence: "Low" }
  });
  assert.equal(Object.hasOwn(legacyItem.fields, "sourceType"), false);
  inbox.items.push(legacyItem);
  assert.equal(capture.validateCaptureInbox(inbox, { workspace }).valid, true);

  const meetingItem = capture.createCaptureItem(solutionId, {
    id: "capture_item_meeting_evidence",
    proposalId: "evidence_meeting_capture",
    provenanceId: provenance.id,
    target: "evidence",
    excerpt: "The customer prioritized layered defense integration.",
    fields: {
      title: "Integration review transcript excerpt",
      source: "",
      url: "",
      notes: "",
      confidence: "Medium",
      ...meetingMetadata
    }
  });
  inbox.items.push(meetingItem);
  assert.equal(capture.validateCaptureInbox(inbox, { workspace }).valid, true);

  const result = capture.materializeCaptureItems(workspace, inbox, {
    itemIds: [meetingItem.id],
    nowIso: () => "2026-08-31T12:05:00.000Z"
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  const record = result.nextWorkspace.evidence.find(item => item.id === meetingItem.proposalId);
  assert.deepEqual(
    Object.fromEntries(Object.keys(meetingMetadata).map(field => [field, record[field]])),
    meetingMetadata
  );
  assert.equal(validateWorkspace(result.nextWorkspace).valid, true);
});

test("capture validation rejects malformed meeting metadata before materialization", () => {
  const workspace = createWorkspace();
  const solutionId = workspace.activeSolutionId;
  const inbox = capture.createCaptureInbox(solutionId, { createdAt: "2026-08-31T12:00:00.000Z" });
  const provenance = capture.createCaptureProvenance(solutionId, {
    id: "capture_source_invalid_meeting",
    capturedAt: "2026-08-31T12:01:00.000Z"
  });
  inbox.provenance.push(provenance);
  const item = capture.createCaptureItem(solutionId, {
    id: "capture_item_invalid_meeting",
    proposalId: "evidence_invalid_meeting",
    provenanceId: provenance.id,
    target: "evidence",
    fields: {
      title: "Invalid meeting evidence",
      source: "",
      url: "",
      notes: "",
      confidence: "Low",
      ...meetingMetadata
    }
  });
  inbox.items.push(item);

  for (const [mutation, pattern] of [
    [fields => { fields.sourceType = "Email"; }, /sourceType is unsupported/i],
    [fields => { fields.meetingDate = "08\/29\/2026"; }, /meetingDate must use a valid YYYY-MM-DD/i],
    [fields => { fields.participants = "Avery Chen"; }, /participants must be an array/i],
    [fields => { fields.missionSegments = ["Invented segment"]; }, /missionSegments\[0\] is unsupported/i],
    [fields => { fields.missionSegments = [MISSION_SEGMENTS[0].name, MISSION_SEGMENTS[0].name]; }, /missionSegments\[1\] is duplicated/i]
  ]) {
    const invalid = structuredClone(inbox);
    mutation(invalid.items[0].fields);
    assert.match(capture.validateCaptureInbox(invalid, { workspace }).errors.join("\n"), pattern);
  }
});
