import {
  EVIDENCE_SOURCE_TYPES,
  MISSION_SEGMENTS,
  makeId as engineMakeId,
  nowIso as engineNowIso,
  safeHttpUrl as engineSafeHttpUrl,
  validateWorkspace as engineValidateWorkspace
} from "./engine.js?v=10";

export const CAPTURE_SCHEMA = "solution-capture-inbox-v1";
export const CAPTURE_SCHEMA_VERSION = 1;
export const CAPTURE_STORAGE_KEY = "solution_architect_capture_inbox_v1";

export const CAPTURE_TARGETS = Object.freeze([
  "hotButton",
  "evidence",
  "requirement",
  "winTheme",
  "assumption",
  "risk",
  "decision",
  "ignore"
]);

export const CAPTURE_STATUSES = Object.freeze(["pending", "materialized", "ignored"]);
export const MAX_CAPTURE_PROVENANCE = 100;
export const MAX_CAPTURE_ITEMS = 500;
export const MAX_CAPTURE_EXCERPT_CHARS = 6_000;
export const MAX_CAPTURE_SOURCE_TEXT_CHARS = 500_000;
export const MAX_CAPTURE_ENVELOPE_CHARS = 2_000_000;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;
const REQUIREMENT_TYPES = Object.freeze(["Functional", "Performance", "Interface", "Data", "Cyber", "Safety", "Resilience", "Physical", "Sustainment"]);
const REQUIREMENT_PRIORITIES = Object.freeze(["Must", "Should", "Could"]);
const EVIDENCE_CONFIDENCE = Object.freeze(["Low", "Medium", "High", "Conflicting"]);
const RISK_LEVELS = Object.freeze(["Unknown", "Low", "Medium", "High"]);

const TARGET_COLLECTIONS = Object.freeze({
  hotButton: "hotButtons",
  evidence: "evidence",
  requirement: "requirements",
  winTheme: "winThemes",
  assumption: "assumptions",
  risk: "risks",
  decision: "decisions",
  ignore: ""
});

const TARGET_PREFIXES = Object.freeze({
  hotButton: "hot_button",
  evidence: "evidence",
  requirement: "requirement",
  winTheme: "win_theme",
  assumption: "assumption",
  risk: "risk",
  decision: "decision",
  ignore: "ignored_capture"
});

const WORKSPACE_RECORD_COLLECTIONS = Object.freeze([
  "stakeholders", "hotButtons", "outcomes", "measures", "requirements", "evidence", "criteria",
  "candidates", "winThemes", "architectureViews", "elements", "connections", "trades", "decisions",
  "risks", "dependencies", "assumptions", "roadmapItems", "reviews", "transitionActions", "aiDrafts"
]);

const FIELD_SPECS = Object.freeze({
  hotButton: Object.freeze({
    title: { type: "string", max: 280, required: true },
    detail: { type: "string", max: 2_000 },
    source: { type: "string", max: 300 }
  }),
  evidence: Object.freeze({
    title: { type: "string", max: 280, required: true },
    source: { type: "string", max: 500 },
    url: { type: "url", max: 2_048 },
    notes: { type: "string", max: 6_000 },
    confidence: { type: "enum", values: EVIDENCE_CONFIDENCE },
    sourceType: { type: "enum", values: EVIDENCE_SOURCE_TYPES, optional: true },
    meetingDate: { type: "date", optional: true },
    participants: { type: "string-array", max: 100, itemMax: 300, optional: true },
    missionSegments: { type: "enum-array", values: MISSION_SEGMENTS.map(segment => segment.name), max: MISSION_SEGMENTS.length, optional: true }
  }),
  requirement: Object.freeze({
    title: { type: "string", max: 2_000, required: true },
    type: { type: "enum", values: REQUIREMENT_TYPES },
    priority: { type: "enum", values: REQUIREMENT_PRIORITIES },
    acceptanceMethod: { type: "string", max: 2_000 },
    linkedHotButtonIds: { type: "id-array", max: 50 }
  }),
  winTheme: Object.freeze({
    title: { type: "string", max: 280, required: true },
    customerValue: { type: "string", max: 3_000 },
    linkedHotButtonIds: { type: "id-array", max: 50 },
    sourceEvidenceIds: { type: "id-array", max: 50 }
  }),
  assumption: Object.freeze({
    statement: { type: "string", max: 3_000, required: true },
    owner: { type: "string", max: 300 },
    validationPlan: { type: "string", max: 3_000 }
  }),
  risk: Object.freeze({
    title: { type: "string", max: 2_000, required: true },
    likelihood: { type: "enum", values: RISK_LEVELS },
    impact: { type: "enum", values: RISK_LEVELS },
    owner: { type: "string", max: 300 },
    mitigation: { type: "string", max: 3_000 }
  }),
  decision: Object.freeze({
    title: { type: "string", max: 2_000, required: true },
    rationale: { type: "string", max: 3_000 },
    evidenceIds: { type: "id-array", max: 50 },
    owner: { type: "string", max: 300 },
    date: { type: "date" }
  }),
  ignore: Object.freeze({
    reason: { type: "string", max: 1_000, required: true }
  })
});

const FIELD_DEFAULTS = Object.freeze({
  hotButton: Object.freeze({ title: "", detail: "", source: "" }),
  evidence: Object.freeze({ title: "", source: "", url: "", notes: "", confidence: "Low" }),
  requirement: Object.freeze({ title: "", type: "Functional", priority: "Must", acceptanceMethod: "", linkedHotButtonIds: [] }),
  winTheme: Object.freeze({ title: "", customerValue: "", linkedHotButtonIds: [], sourceEvidenceIds: [] }),
  assumption: Object.freeze({ statement: "", owner: "", validationPlan: "" }),
  risk: Object.freeze({ title: "", likelihood: "Unknown", impact: "Unknown", owner: "", mitigation: "" }),
  decision: Object.freeze({ title: "", rationale: "", evidenceIds: [], owner: "", date: "" }),
  ignore: Object.freeze({ reason: "Not relevant to the solution workspace." })
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function clone(value) {
  return structuredClone(value);
}

function unique(values) {
  return [...new Set(values)];
}

function validTimestamp(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function checkPlainJson(value, path, errors, depth = 0) {
  if (depth > 8) {
    errors.push(`${path} exceeds the supported nesting depth.`);
    return;
  }
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${path} must contain finite JSON values.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CAPTURE_ITEMS) errors.push(`${path} exceeds ${MAX_CAPTURE_ITEMS} items.`);
    value.forEach((item, index) => checkPlainJson(item, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`${path} must contain plain JSON data; binary and executable values are not supported.`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) errors.push(`${path}.${key} is not supported.`);
    else checkPlainJson(child, `${path}.${key}`, errors, depth + 1);
  }
}

function checkKnownKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is not supported.`);
}

function safeUrl(value, safeHttpUrl) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 2_048) return "";
  const normalized = safeHttpUrl(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) return "";
    return normalized;
  } catch {
    return "";
  }
}

function checkIdArray(value, path, errors, maximum = 50) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (value.length > maximum) errors.push(`${path} exceeds ${maximum} links.`);
  const seen = new Set();
  value.forEach((id, index) => {
    if (!validId(id)) errors.push(`${path}[${index}] must be a valid record ID.`);
    else if (seen.has(id)) errors.push(`${path} contains duplicate record ID ${id}.`);
    seen.add(id);
  });
}

function checkStringArray(value, path, errors, { maximum, itemMaximum, values = null } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (maximum && value.length > maximum) errors.push(`${path} exceeds ${maximum} values.`);
  const seen = new Set();
  value.forEach((item, index) => {
    if (typeof item !== "string") errors.push(`${path}[${index}] must be a string.`);
    else if (!item.trim()) errors.push(`${path}[${index}] must not be empty.`);
    else if (itemMaximum && item.length > itemMaximum) errors.push(`${path}[${index}] exceeds ${itemMaximum} characters.`);
    else if (values && !values.includes(item)) errors.push(`${path}[${index}] is unsupported.`);
    if (values && seen.has(item)) errors.push(`${path}[${index}] is duplicated.`);
    seen.add(item);
  });
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function checkFields(fields, target, path, errors, safeHttpUrl) {
  const spec = FIELD_SPECS[target];
  if (!isPlainObject(fields)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  checkKnownKeys(fields, new Set(Object.keys(spec)), path, errors);
  for (const [name, fieldSpec] of Object.entries(spec)) {
    const fieldPath = `${path}.${name}`;
    if (!Object.hasOwn(fields, name)) {
      if (!fieldSpec.optional) errors.push(`${fieldPath} is required.`);
      continue;
    }
    const value = fields[name];
    if (fieldSpec.type === "id-array") {
      checkIdArray(value, fieldPath, errors, fieldSpec.max);
      continue;
    }
    if (["string-array", "enum-array"].includes(fieldSpec.type)) {
      checkStringArray(value, fieldPath, errors, {
        maximum: fieldSpec.max,
        itemMaximum: fieldSpec.itemMax,
        values: fieldSpec.type === "enum-array" ? fieldSpec.values : null
      });
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`${fieldPath} must be a string.`);
      continue;
    }
    if (fieldSpec.max && value.length > fieldSpec.max) errors.push(`${fieldPath} exceeds ${fieldSpec.max} characters.`);
    if (fieldSpec.required && !value.trim()) errors.push(`${fieldPath} is required.`);
    if (fieldSpec.type === "enum" && !fieldSpec.values.includes(value)) errors.push(`${fieldPath} is unsupported.`);
    if (fieldSpec.type === "url" && value && !safeUrl(value, safeHttpUrl)) errors.push(`${fieldPath} must be an HTTP(S) URL without embedded credentials.`);
    if (fieldSpec.type === "date" && value && !validCalendarDate(value)) errors.push(`${fieldPath} must use a valid YYYY-MM-DD date or be empty.`);
  }
}

function workspaceRecords(workspace) {
  const records = [];
  for (const collection of WORKSPACE_RECORD_COLLECTIONS) {
    for (const record of Array.isArray(workspace?.[collection]) ? workspace[collection] : []) records.push({ collection, record });
  }
  return records;
}

function findWorkspaceRecord(workspace, id) {
  return workspaceRecords(workspace).find(item => item.record?.id === id) || null;
}

function validateWorkspaceWith(helper, workspace) {
  try {
    const result = helper(workspace);
    if (!result || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      return { valid: false, errors: ["Workspace validator returned an invalid result."] };
    }
    return result;
  } catch (error) {
    return { valid: false, errors: [`Workspace validator failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function proposalFor(inbox, proposalId, target) {
  return inbox.items.find(item => item.proposalId === proposalId && item.target === target) || null;
}

function referenceTarget(workspace, inbox, id, collection, target, solutionId) {
  const existing = findWorkspaceRecord(workspace, id);
  if (existing) {
    if (existing.collection !== collection) return { valid: false, reason: `references ${existing.collection}, not ${collection}.` };
    if (existing.record.solutionId !== solutionId) return { valid: false, reason: "crosses solution boundaries." };
    return { valid: true, source: "workspace" };
  }
  const proposal = proposalFor(inbox, id, target);
  if (!proposal) return { valid: false, reason: "references a missing workspace record or capture proposal." };
  if (proposal.solutionId !== solutionId) return { valid: false, reason: "crosses solution boundaries." };
  if (proposal.status === "ignored") return { valid: false, reason: "references an ignored capture proposal." };
  return { valid: true, source: "capture", proposal };
}

function validateReferences(candidate, workspace, errors) {
  if (!workspace) return;
  for (const [index, item] of candidate.items.entries()) {
    const path = `Capture.items[${index}]`;
    if (item.evidenceProposalId) {
      const result = referenceTarget(workspace, candidate, item.evidenceProposalId, "evidence", "evidence", item.solutionId);
      if (!result.valid) errors.push(`${path}.evidenceProposalId ${result.reason}`);
    }
    const hotButtonIds = item.fields?.linkedHotButtonIds;
    if (Array.isArray(hotButtonIds)) {
      for (const [linkIndex, id] of hotButtonIds.entries()) {
        const result = referenceTarget(workspace, candidate, id, "hotButtons", "hotButton", item.solutionId);
        if (!result.valid) errors.push(`${path}.fields.linkedHotButtonIds[${linkIndex}] ${result.reason}`);
      }
    }
    const evidenceIds = [
      ...(Array.isArray(item.fields?.evidenceIds) ? item.fields.evidenceIds : []),
      ...(Array.isArray(item.fields?.sourceEvidenceIds) ? item.fields.sourceEvidenceIds : [])
    ];
    for (const id of unique(evidenceIds)) {
      const result = referenceTarget(workspace, candidate, id, "evidence", "evidence", item.solutionId);
      if (!result.valid) errors.push(`${path} evidence link ${id} ${result.reason}`);
    }
  }
}

export function createCaptureInbox(solutionId, { createdAt = engineNowIso() } = {}) {
  if (!validId(solutionId)) throw new TypeError("A valid solution ID is required to create a capture inbox.");
  if (!validTimestamp(createdAt)) throw new TypeError("createdAt must be a valid timestamp.");
  return {
    schema: CAPTURE_SCHEMA,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    solutionId,
    createdAt,
    updatedAt: createdAt,
    provenance: [],
    items: []
  };
}

export function captureStorageKey(solutionId) {
  if (!validId(solutionId)) throw new TypeError("A valid solution ID is required for a capture storage key.");
  return `${CAPTURE_STORAGE_KEY}:${solutionId}`;
}

export function createCaptureProvenance(solutionId, input = {}, helpers = {}) {
  if (!validId(solutionId)) throw new TypeError("A valid solution ID is required for capture provenance.");
  if (!isPlainObject(input)) throw new TypeError("Capture provenance input must be an object.");
  const allowed = new Set(["id", "sourceFileName", "sourceTitle", "locator", "sourceUrl", "sha256", "capturedAt"]);
  const unsupported = Object.keys(input).filter(key => !allowed.has(key));
  if (unsupported.length) throw new TypeError(`Unsupported capture provenance field: ${unsupported[0]}.`);
  const makeId = helpers.makeId || engineMakeId;
  const nowIso = helpers.nowIso || engineNowIso;
  return {
    id: input.id || makeId("capture_source"),
    solutionId,
    sourceFileName: input.sourceFileName || "",
    sourceTitle: input.sourceTitle || "",
    locator: input.locator || "",
    sourceUrl: input.sourceUrl || "",
    sha256: input.sha256 || "",
    capturedAt: input.capturedAt || nowIso()
  };
}

export function createCaptureItem(solutionId, input = {}, helpers = {}) {
  if (!validId(solutionId)) throw new TypeError("A valid solution ID is required for a capture item.");
  if (!isPlainObject(input)) throw new TypeError("Capture item input must be an object.");
  const allowed = new Set(["id", "proposalId", "evidenceProposalId", "provenanceId", "target", "excerpt", "fields"]);
  const unsupported = Object.keys(input).filter(key => !allowed.has(key));
  if (unsupported.length) throw new TypeError(`Unsupported capture item field: ${unsupported[0]}.`);
  if (!CAPTURE_TARGETS.includes(input.target)) throw new TypeError("Capture item target is unsupported.");
  const makeId = helpers.makeId || engineMakeId;
  const defaults = clone(FIELD_DEFAULTS[input.target]);
  const supplied = input.fields ?? {};
  if (!isPlainObject(supplied)) throw new TypeError("Capture item fields must be an object.");
  const supportedFields = new Set(Object.keys(FIELD_SPECS[input.target]));
  const unsupportedField = Object.keys(supplied).find(key => !supportedFields.has(key));
  if (unsupportedField) throw new TypeError(`Unsupported ${input.target} capture field: ${unsupportedField}.`);
  const proposalId = input.proposalId || makeId(TARGET_PREFIXES[input.target]);
  return {
    id: input.id || makeId("capture_item"),
    solutionId,
    provenanceId: input.provenanceId || "",
    target: input.target,
    status: "pending",
    proposalId,
    evidenceProposalId: input.target === "evidence" ? proposalId : (input.evidenceProposalId || ""),
    excerpt: input.excerpt || "",
    fields: { ...defaults, ...clone(supplied) }
  };
}

export function segmentCaptureText(text, { maxChars = 4_000, maxSegments = 100 } = {}) {
  if (typeof text !== "string") throw new TypeError("Capture source text must be a string.");
  if (text.length > MAX_CAPTURE_SOURCE_TEXT_CHARS) throw new RangeError(`Capture source text exceeds ${MAX_CAPTURE_SOURCE_TEXT_CHARS} characters.`);
  if (!Number.isInteger(maxChars) || maxChars < 256 || maxChars > MAX_CAPTURE_EXCERPT_CHARS) throw new RangeError(`maxChars must be an integer from 256 to ${MAX_CAPTURE_EXCERPT_CHARS}.`);
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > MAX_CAPTURE_ITEMS) throw new RangeError(`maxSegments must be an integer from 1 to ${MAX_CAPTURE_ITEMS}.`);

  const normalized = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const pieces = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      const window = remaining.slice(0, maxChars + 1);
      const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
      const end = breakAt >= Math.floor(maxChars * 0.6) ? breakAt : maxChars;
      pieces.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining) pieces.push(remaining.trim());
  }
  if (pieces.length > maxSegments) throw new RangeError(`Capture source text requires ${pieces.length} segments, exceeding the ${maxSegments}-segment limit.`);
  return pieces.map((segmentText, index) => ({ index, text: segmentText }));
}

export function validateCaptureInbox(candidate, options = {}) {
  const errors = [];
  const workspace = options.workspace || null;
  const validateWorkspace = options.validateWorkspace || engineValidateWorkspace;
  const safeHttpUrl = options.safeHttpUrl || engineSafeHttpUrl;

  checkPlainJson(candidate, "Capture", errors);
  if (!isPlainObject(candidate)) return { valid: false, errors: errors.length ? errors : ["Capture inbox must be a JSON object."] };
  try {
    if (JSON.stringify(candidate).length > MAX_CAPTURE_ENVELOPE_CHARS) errors.push(`Capture inbox exceeds ${MAX_CAPTURE_ENVELOPE_CHARS} serialized characters.`);
  } catch {
    errors.push("Capture inbox must be serializable JSON data.");
  }
  checkKnownKeys(candidate, new Set(["schema", "schemaVersion", "solutionId", "createdAt", "updatedAt", "provenance", "items"]), "Capture", errors);
  if (candidate.schema !== CAPTURE_SCHEMA) errors.push(`Capture.schema must equal ${CAPTURE_SCHEMA}.`);
  if (candidate.schemaVersion !== CAPTURE_SCHEMA_VERSION) errors.push(`Unsupported capture schema version. Expected ${CAPTURE_SCHEMA_VERSION}.`);
  if (!validId(candidate.solutionId)) errors.push("Capture.solutionId must be a valid solution ID.");
  if (!validTimestamp(candidate.createdAt)) errors.push("Capture.createdAt must be a valid timestamp.");
  if (!validTimestamp(candidate.updatedAt)) errors.push("Capture.updatedAt must be a valid timestamp.");
  if (!Array.isArray(candidate.provenance)) errors.push("Capture.provenance must be an array.");
  else if (candidate.provenance.length > MAX_CAPTURE_PROVENANCE) errors.push(`Capture.provenance exceeds ${MAX_CAPTURE_PROVENANCE} records.`);
  if (!Array.isArray(candidate.items)) errors.push("Capture.items must be an array.");
  else if (candidate.items.length > MAX_CAPTURE_ITEMS) errors.push(`Capture.items exceeds ${MAX_CAPTURE_ITEMS} records.`);
  if (!Array.isArray(candidate.provenance) || !Array.isArray(candidate.items)) return { valid: false, errors };

  const allIds = new Set();
  const provenanceById = new Map();
  for (const [index, provenance] of candidate.provenance.entries()) {
    const path = `Capture.provenance[${index}]`;
    if (!isPlainObject(provenance)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    checkKnownKeys(provenance, new Set(["id", "solutionId", "sourceFileName", "sourceTitle", "locator", "sourceUrl", "sha256", "capturedAt"]), path, errors);
    for (const field of ["id", "solutionId", "sourceFileName", "sourceTitle", "locator", "sourceUrl", "sha256", "capturedAt"]) {
      if (!Object.hasOwn(provenance, field)) errors.push(`${path}.${field} is required.`);
    }
    if (!validId(provenance.id)) errors.push(`${path}.id is invalid.`);
    else if (allIds.has(provenance.id)) errors.push(`Duplicate capture ID: ${provenance.id}.`);
    else allIds.add(provenance.id);
    if (provenance.solutionId !== candidate.solutionId) errors.push(`${path}.solutionId crosses solution boundaries.`);
    for (const [field, maximum] of [["sourceFileName", 300], ["sourceTitle", 300], ["locator", 500]]) {
      if (typeof provenance[field] !== "string") errors.push(`${path}.${field} must be a string.`);
      else if (provenance[field].length > maximum) errors.push(`${path}.${field} exceeds ${maximum} characters.`);
    }
    if (typeof provenance.sourceUrl !== "string") errors.push(`${path}.sourceUrl must be a string.`);
    else if (provenance.sourceUrl && !safeUrl(provenance.sourceUrl, safeHttpUrl)) errors.push(`${path}.sourceUrl must be an HTTP(S) URL without embedded credentials.`);
    if (typeof provenance.sha256 !== "string" || (provenance.sha256 && !SHA256.test(provenance.sha256))) errors.push(`${path}.sha256 must be empty or a 64-character hexadecimal digest.`);
    if (!validTimestamp(provenance.capturedAt)) errors.push(`${path}.capturedAt must be a valid timestamp.`);
    provenanceById.set(provenance.id, provenance);
  }

  const proposalIds = new Set();
  for (const [index, item] of candidate.items.entries()) {
    const path = `Capture.items[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    checkKnownKeys(item, new Set(["id", "solutionId", "provenanceId", "target", "status", "proposalId", "evidenceProposalId", "excerpt", "fields"]), path, errors);
    for (const field of ["id", "solutionId", "provenanceId", "target", "status", "proposalId", "evidenceProposalId", "excerpt", "fields"]) {
      if (!Object.hasOwn(item, field)) errors.push(`${path}.${field} is required.`);
    }
    if (!validId(item.id)) errors.push(`${path}.id is invalid.`);
    else if (allIds.has(item.id)) errors.push(`Duplicate capture ID: ${item.id}.`);
    else allIds.add(item.id);
    if (item.solutionId !== candidate.solutionId) errors.push(`${path}.solutionId crosses solution boundaries.`);
    if (!validId(item.provenanceId)) errors.push(`${path}.provenanceId must be a valid capture provenance ID.`);
    else {
      const provenance = provenanceById.get(item.provenanceId);
      if (!provenance) errors.push(`${path}.provenanceId references missing provenance.`);
      else if (provenance.solutionId !== item.solutionId) errors.push(`${path}.provenanceId crosses solution boundaries.`);
    }
    if (!CAPTURE_TARGETS.includes(item.target)) errors.push(`${path}.target is unsupported.`);
    if (!CAPTURE_STATUSES.includes(item.status)) errors.push(`${path}.status is unsupported.`);
    if (item.target === "ignore" && !["pending", "ignored"].includes(item.status)) errors.push(`${path}.status is invalid for an ignored proposal.`);
    if (item.target !== "ignore" && item.status === "ignored") errors.push(`${path}.status is invalid for a materializable proposal.`);
    if (!validId(item.proposalId)) errors.push(`${path}.proposalId must be a valid preallocated record ID.`);
    else if (proposalIds.has(item.proposalId)) errors.push(`Duplicate proposal ID: ${item.proposalId}.`);
    else if (allIds.has(item.proposalId)) errors.push(`${path}.proposalId conflicts with a capture record ID.`);
    else {
      proposalIds.add(item.proposalId);
      allIds.add(item.proposalId);
    }
    if (typeof item.evidenceProposalId !== "string" || (item.evidenceProposalId && !validId(item.evidenceProposalId))) errors.push(`${path}.evidenceProposalId must be empty or a valid evidence proposal ID.`);
    if (item.target === "evidence" && item.evidenceProposalId !== item.proposalId) errors.push(`${path}.evidenceProposalId must equal proposalId for evidence proposals.`);
    if (!["evidence", "requirement", "winTheme", "decision"].includes(item.target) && item.evidenceProposalId) errors.push(`${path}.evidenceProposalId is not supported for ${item.target} proposals.`);
    if (typeof item.excerpt !== "string") errors.push(`${path}.excerpt must be a string.`);
    else if (item.excerpt.length > MAX_CAPTURE_EXCERPT_CHARS) errors.push(`${path}.excerpt exceeds ${MAX_CAPTURE_EXCERPT_CHARS} characters.`);
    if (CAPTURE_TARGETS.includes(item.target)) checkFields(item.fields, item.target, `${path}.fields`, errors, safeHttpUrl);
  }

  if (workspace) {
    const workspaceValidation = validateWorkspaceWith(validateWorkspace, workspace);
    errors.push(...workspaceValidation.errors.map(error => `Workspace: ${error}`));
    const solution = Array.isArray(workspace.solutions) ? workspace.solutions.find(record => record.id === candidate.solutionId) : null;
    if (!solution) errors.push("Capture.solutionId does not reference a solution in the current workspace.");
    for (const [index, item] of candidate.items.entries()) {
      if (!isPlainObject(item) || !validId(item.proposalId) || !CAPTURE_TARGETS.includes(item.target)) continue;
      const existing = findWorkspaceRecord(workspace, item.proposalId);
      const expectedCollection = TARGET_COLLECTIONS[item.target];
      if (existing && (existing.collection !== expectedCollection || existing.record.solutionId !== item.solutionId)) {
        errors.push(`Capture.items[${index}].proposalId conflicts with an existing workspace record.`);
      }
      if (item.status === "materialized" && !existing) errors.push(`Capture.items[${index}] is marked materialized but its workspace record is missing.`);
      if (item.status === "materialized" && existing && existing.collection !== expectedCollection) errors.push(`Capture.items[${index}] materialized to an unexpected collection.`);
      if (item.target === "ignore" && existing) errors.push(`Capture.items[${index}] is ignored but its proposalId already exists in the workspace.`);
    }
    validateReferences(candidate, workspace, errors);
  }

  return { valid: errors.length === 0, errors };
}

function sourceLabel(provenance) {
  const source = provenance.sourceTitle || provenance.sourceFileName || "Captured source";
  if (!provenance.locator || provenance.locator === source) return source.slice(0, 500);
  const combined = `${source} · ${provenance.locator}`;
  return combined.length <= 500 ? combined : provenance.locator.slice(0, 500);
}

function explicitEvidenceIds(item) {
  return unique([
    item.evidenceProposalId,
    ...(Array.isArray(item.fields.evidenceIds) ? item.fields.evidenceIds : []),
    ...(Array.isArray(item.fields.sourceEvidenceIds) ? item.fields.sourceEvidenceIds : [])
  ].filter(Boolean));
}

function optionalEvidenceMetadata(fields) {
  return Object.fromEntries(
    ["sourceType", "meetingDate", "participants", "missionSegments"]
      .filter(field => Object.hasOwn(fields, field))
      .map(field => [field, clone(fields[field])])
  );
}

function materializedRecord(item, provenance, safeHttpUrl) {
  const common = { id: item.proposalId, solutionId: item.solutionId };
  const source = sourceLabel(provenance);
  switch (item.target) {
    case "hotButton":
      return { ...common, title: item.fields.title, detail: item.fields.detail || item.excerpt, source: (item.fields.source || source).slice(0, 300), confidence: "Unverified", status: "Captured" };
    case "evidence":
      return { ...common, title: item.fields.title, source: (item.fields.source || source).slice(0, 500), url: safeUrl(item.fields.url || provenance.sourceUrl, safeHttpUrl), notes: item.fields.notes || item.excerpt, confidence: item.fields.confidence || "Low", ...optionalEvidenceMetadata(item.fields) };
    case "requirement":
      return { ...common, title: item.fields.title, type: item.fields.type, priority: item.fields.priority, sourceEvidenceId: item.evidenceProposalId, acceptanceMethod: item.fields.acceptanceMethod, status: "Draft", linkedElementIds: [], linkedHotButtonIds: clone(item.fields.linkedHotButtonIds) };
    case "winTheme":
      return { ...common, title: item.fields.title, customerValue: item.fields.customerValue || item.excerpt, discriminator: "", proof: "", linkedHotButtonIds: clone(item.fields.linkedHotButtonIds), sourceEvidenceIds: explicitEvidenceIds(item), status: "Draft" };
    case "assumption":
      return { ...common, statement: item.fields.statement, status: "Unverified", owner: item.fields.owner, validationPlan: item.fields.validationPlan };
    case "risk":
      return { ...common, title: item.fields.title, likelihood: item.fields.likelihood || "Unknown", impact: item.fields.impact || "Unknown", owner: item.fields.owner, mitigation: item.fields.mitigation, status: "Open" };
    case "decision":
      return { ...common, title: item.fields.title, status: "Proposed", rationale: item.fields.rationale, evidenceIds: explicitEvidenceIds(item), owner: item.fields.owner, date: item.fields.date };
    default:
      return null;
  }
}

function selectionDependencyErrors(workspace, inbox, selected, materializableItems) {
  const errors = [];
  const selectedProposalIds = new Set(materializableItems.map(item => item.proposalId));
  const available = (id, collection, target) => {
    const existing = findWorkspaceRecord(workspace, id);
    if (existing) return existing.collection === collection && existing.record.solutionId === inbox.solutionId;
    const proposal = proposalFor(inbox, id, target);
    return !!proposal && (proposal.status === "materialized" || selectedProposalIds.has(proposal.proposalId));
  };
  for (const item of materializableItems) {
    for (const evidenceId of explicitEvidenceIds(item)) {
      if (!available(evidenceId, "evidence", "evidence")) errors.push(`Capture item ${item.id} requires evidence proposal ${evidenceId} to be materialized in the same batch or already present.`);
    }
    for (const hotButtonId of Array.isArray(item.fields.linkedHotButtonIds) ? item.fields.linkedHotButtonIds : []) {
      if (!available(hotButtonId, "hotButtons", "hotButton")) errors.push(`Capture item ${item.id} requires hot-button proposal ${hotButtonId} to be materialized in the same batch or already present.`);
    }
  }
  for (const id of selected) if (!inbox.items.some(item => item.id === id)) errors.push(`Selected capture item ${id} does not exist.`);
  return errors;
}

export function materializeCaptureItems(workspace, inbox, options = {}) {
  const originalWorkspace = clone(workspace);
  const originalInbox = clone(inbox);
  const validateWorkspace = options.validateWorkspace || engineValidateWorkspace;
  const safeHttpUrl = options.safeHttpUrl || engineSafeHttpUrl;
  const nowIso = options.nowIso || engineNowIso;
  const itemIds = options.itemIds;
  const failure = errors => ({ valid: false, errors, nextWorkspace: originalWorkspace, nextInbox: originalInbox, materializedItemIds: [], skippedItemIds: [] });

  const workspaceValidation = validateWorkspaceWith(validateWorkspace, workspace);
  if (!workspaceValidation.valid) return failure(workspaceValidation.errors.map(error => `Workspace: ${error}`));
  const captureValidation = validateCaptureInbox(inbox, { workspace, validateWorkspace, safeHttpUrl });
  if (!captureValidation.valid) return failure(captureValidation.errors);
  if (!Array.isArray(itemIds) || !itemIds.length) return failure(["Materialization requires at least one explicitly selected capture item ID."]);
  if (itemIds.length > MAX_CAPTURE_ITEMS) return failure([`Materialization exceeds ${MAX_CAPTURE_ITEMS} selected items.`]);
  const selected = unique(itemIds);
  if (selected.length !== itemIds.length || selected.some(id => !validId(id))) return failure(["Selected capture item IDs must be unique valid IDs."]);
  const selectedItems = selected.map(id => inbox.items.find(item => item.id === id)).filter(Boolean);
  const missing = selected.filter(id => !selectedItems.some(item => item.id === id));
  if (missing.length) return failure(missing.map(id => `Selected capture item ${id} does not exist.`));

  const materializableItems = selectedItems.filter(item => item.target !== "ignore" && item.status !== "ignored");
  const dependencyErrors = selectionDependencyErrors(workspace, inbox, selected, materializableItems);
  if (dependencyErrors.length) return failure(dependencyErrors);

  const nextWorkspace = clone(workspace);
  const nextInbox = clone(inbox);
  const materializedItemIds = [];
  const skippedItemIds = [];
  let workspaceChanged = false;
  let inboxChanged = false;
  const order = { evidence: 0, hotButton: 1, requirement: 2, winTheme: 3, assumption: 4, risk: 5, decision: 6, ignore: 7 };

  for (const item of [...selectedItems].sort((left, right) => order[left.target] - order[right.target])) {
    const nextItem = nextInbox.items.find(candidate => candidate.id === item.id);
    if (item.target === "ignore") {
      if (nextItem.status === "ignored") skippedItemIds.push(item.id);
      else {
        nextItem.status = "ignored";
        inboxChanged = true;
        materializedItemIds.push(item.id);
      }
      continue;
    }
    const existing = findWorkspaceRecord(nextWorkspace, item.proposalId);
    if (existing) {
      nextItem.status = "materialized";
      if (item.status !== "materialized") inboxChanged = true;
      skippedItemIds.push(item.id);
      continue;
    }
    const provenance = nextInbox.provenance.find(record => record.id === item.provenanceId);
    const record = materializedRecord(item, provenance, safeHttpUrl);
    nextWorkspace[TARGET_COLLECTIONS[item.target]].push(record);
    nextItem.status = "materialized";
    workspaceChanged = true;
    inboxChanged = true;
    materializedItemIds.push(item.id);
  }

  if (workspaceChanged) nextWorkspace.savedAt = nowIso();
  if (inboxChanged) nextInbox.updatedAt = nowIso();
  const nextValidation = validateWorkspaceWith(validateWorkspace, nextWorkspace);
  if (!nextValidation.valid) return failure(nextValidation.errors.map(error => `Materialized workspace: ${error}`));
  const nextCaptureValidation = validateCaptureInbox(nextInbox, { workspace: nextWorkspace, validateWorkspace, safeHttpUrl });
  if (!nextCaptureValidation.valid) return failure(nextCaptureValidation.errors.map(error => `Materialized inbox: ${error}`));
  return { valid: true, errors: [], nextWorkspace, nextInbox, materializedItemIds, skippedItemIds };
}
