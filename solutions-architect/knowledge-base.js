import { MISSION_SEGMENTS, makeId, safeHttpUrl } from "./engine.js?v=9";

export const KNOWLEDGE_BASE_SCHEMA = "solution-knowledge-base-v1";
export const KNOWLEDGE_BASE_SCHEMA_VERSION = 1;
export const KNOWLEDGE_BASE_STORAGE_KEY = "solution_architect_knowledge_base_v1";
export const MAX_KNOWLEDGE_IMPORT_BYTES = 5_000_000;
export const KNOWLEDGE_OFFERING_TYPES = Object.freeze(["Product", "Application", "Software", "Service", "Platform", "Integrated solution", "Other offering"]);
export const KNOWLEDGE_LIFECYCLE_STATUSES = Object.freeze(["Current", "Emerging", "Legacy", "Retired"]);

const ITEM_FIELDS = Object.freeze([
  "id", "revision", "name", "offeringType", "provider", "version", "lifecycleStatus", "summary", "capabilities",
  "missionSegments", "deploymentAndEnvironment", "interfaces", "integrationConsiderations", "cyberSafetyConsiderations",
  "mosaDataRights", "trl", "mrl", "irl", "readinessBasis", "readinessAsOf", "sourceTitle", "sourceUrl", "sourceNotes",
  "tags", "reviewedAt", "changeSummary", "createdAt", "updatedAt"
]);
const MISSION_SEGMENT_NAMES = new Set(MISSION_SEGMENTS.map(record => record.name));
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function iso(value) {
  const parsed = new Date(value);
  return typeof value === "string" && Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function calendarDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function boundedString(value, path, errors, maximum = 20_000, { required = false } = {}) {
  if (typeof value !== "string") errors.push(`${path} must be a string.`);
  else {
    if (required && !value.trim()) errors.push(`${path} is required.`);
    if (value.length > maximum) errors.push(`${path} exceeds ${maximum.toLocaleString()} characters.`);
  }
}

function stringList(value, path, errors, { maximumItems = 50, maximumLength = 300, allowed } = {}) {
  if (!Array.isArray(value)) { errors.push(`${path} must be an array.`); return; }
  if (value.length > maximumItems) errors.push(`${path} exceeds ${maximumItems} values.`);
  const seen = new Set();
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) errors.push(`${path}[${index}] must be a nonempty string.`);
    else {
      if (item.length > maximumLength) errors.push(`${path}[${index}] exceeds ${maximumLength} characters.`);
      if (allowed && !allowed.has(item)) errors.push(`${path}[${index}] is unsupported.`);
      if (seen.has(item)) errors.push(`${path}[${index}] is duplicated.`);
      seen.add(item);
    }
  });
}

export function createKnowledgeItem(values = {}, generatedAt = new Date()) {
  const timestamp = generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString();
  return {
    id: values.id || makeId("offering"),
    revision: Number.isSafeInteger(values.revision) && values.revision > 0 ? values.revision : 1,
    name: values.name || "New solution offering",
    offeringType: values.offeringType || "Integrated solution",
    provider: values.provider || "",
    version: values.version || "",
    lifecycleStatus: values.lifecycleStatus || "Current",
    summary: values.summary || "",
    capabilities: [...(values.capabilities || [])],
    missionSegments: [...(values.missionSegments || [])],
    deploymentAndEnvironment: values.deploymentAndEnvironment || "",
    interfaces: values.interfaces || "",
    integrationConsiderations: values.integrationConsiderations || "",
    cyberSafetyConsiderations: values.cyberSafetyConsiderations || "",
    mosaDataRights: values.mosaDataRights || "",
    trl: values.trl ?? null,
    mrl: values.mrl ?? null,
    irl: values.irl ?? null,
    readinessBasis: values.readinessBasis || "",
    readinessAsOf: values.readinessAsOf || "",
    sourceTitle: values.sourceTitle || "",
    sourceUrl: values.sourceUrl || "",
    sourceNotes: values.sourceNotes || "",
    tags: [...(values.tags || [])],
    reviewedAt: values.reviewedAt || "",
    changeSummary: values.changeSummary || "",
    createdAt: values.createdAt || timestamp,
    updatedAt: values.updatedAt || timestamp
  };
}

export function createKnowledgeBase({ seed = true, generatedAt = new Date() } = {}) {
  const timestamp = generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString();
  const items = seed ? [createKnowledgeItem({
    id: "offering_synthetic_modular_mission_kit",
    name: "Synthetic modular mission integration kit",
    offeringType: "Integrated solution",
    provider: "Synthetic internal offering",
    version: "Reference release 1.0",
    lifecycleStatus: "Current",
    summary: "Reusable unclassified example combining a modular sensor boundary, edge processing, mission gateway, and integration harness.",
    capabilities: ["Modular sensor integration", "Edge mission processing", "Governed data exchange", "Interface conformance testing"],
    missionSegments: ["Layered Defense, Autonomous Warfare & Integrated Fires"],
    deploymentAndEnvironment: "Transportable integration-lab and representative platform-demonstration environments.",
    interfaces: "Open sensor interface, versioned internal API, and governed mission-message schema.",
    integrationConsiderations: "Requires confirmation of host-platform power, mounting, transport, safety, and network constraints.",
    cyberSafetyConsiderations: "Boundary, identity, logging, software assurance, platform safety, and authorization evidence remain solution-specific.",
    mosaDataRights: "Modular boundaries and required interface/software data rights must be confirmed for each pursuit.",
    trl: 6,
    mrl: 4,
    irl: 5,
    readinessBasis: "Synthetic reference values for demonstrating catalog behavior only.",
    readinessAsOf: timestamp.slice(0, 10),
    sourceTitle: "Synthetic workbench example",
    tags: ["MOSA", "edge", "integration", "synthetic"],
    reviewedAt: timestamp.slice(0, 10),
    changeSummary: "Initial synthetic catalog example."
  }, generatedAt)] : [];
  return { schema: KNOWLEDGE_BASE_SCHEMA, schemaVersion: KNOWLEDGE_BASE_SCHEMA_VERSION, savedAt: timestamp, items };
}

export function validateKnowledgeBase(candidate) {
  const errors = [];
  if (!plainObject(candidate)) return { valid: false, errors: ["Knowledge Base must be a JSON object."] };
  for (const key of Object.keys(candidate)) if (!["schema", "schemaVersion", "savedAt", "items"].includes(key)) errors.push(`Knowledge Base.${key} is not supported.`);
  if (candidate.schema !== KNOWLEDGE_BASE_SCHEMA) errors.push(`Knowledge Base.schema must equal ${KNOWLEDGE_BASE_SCHEMA}.`);
  if (candidate.schemaVersion !== KNOWLEDGE_BASE_SCHEMA_VERSION) errors.push(`Unsupported Knowledge Base schema version. Expected ${KNOWLEDGE_BASE_SCHEMA_VERSION}.`);
  if (!iso(candidate.savedAt)) errors.push("Knowledge Base.savedAt must be an ISO timestamp.");
  if (!Array.isArray(candidate.items)) errors.push("Knowledge Base.items must be an array.");
  else if (candidate.items.length > 1_000) errors.push("Knowledge Base.items exceeds 1,000 records.");
  if (errors.length || !Array.isArray(candidate.items)) return { valid: false, errors };

  const seen = new Set();
  candidate.items.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!plainObject(item)) { errors.push(`${path} must be an object.`); return; }
    for (const key of Object.keys(item)) if (!ITEM_FIELDS.includes(key)) errors.push(`${path}.${key} is not supported.`);
    for (const field of ITEM_FIELDS) if (!Object.hasOwn(item, field)) errors.push(`${path}.${field} is required.`);
    if (!ID_PATTERN.test(item.id || "")) errors.push(`${path}.id is invalid.`);
    else if (seen.has(item.id)) errors.push(`Duplicate Knowledge Base item ID: ${item.id}.`);
    seen.add(item.id);
    if (!Number.isSafeInteger(item.revision) || item.revision < 1) errors.push(`${path}.revision must be a positive integer within the safe range.`);
    boundedString(item.name, `${path}.name`, errors, 280, { required: true });
    boundedString(item.offeringType, `${path}.offeringType`, errors, 80);
    if (!KNOWLEDGE_OFFERING_TYPES.includes(item.offeringType)) errors.push(`${path}.offeringType is unsupported.`);
    boundedString(item.provider, `${path}.provider`, errors, 300);
    boundedString(item.version, `${path}.version`, errors, 160);
    boundedString(item.lifecycleStatus, `${path}.lifecycleStatus`, errors, 80);
    if (!KNOWLEDGE_LIFECYCLE_STATUSES.includes(item.lifecycleStatus)) errors.push(`${path}.lifecycleStatus is unsupported.`);
    for (const [field, maximum] of [["summary", 5_000], ["deploymentAndEnvironment", 5_000], ["interfaces", 5_000], ["integrationConsiderations", 5_000], ["cyberSafetyConsiderations", 5_000], ["mosaDataRights", 5_000], ["readinessBasis", 5_000], ["sourceTitle", 500], ["sourceUrl", 2_000], ["sourceNotes", 5_000], ["changeSummary", 3_000]]) boundedString(item[field], `${path}.${field}`, errors, maximum);
    stringList(item.capabilities, `${path}.capabilities`, errors);
    stringList(item.tags, `${path}.tags`, errors, { maximumLength: 120 });
    stringList(item.missionSegments, `${path}.missionSegments`, errors, { maximumItems: MISSION_SEGMENTS.length, allowed: MISSION_SEGMENT_NAMES });
    for (const [field, minimum, maximum] of [["trl", 1, 9], ["mrl", 1, 10], ["irl", 0, 9]]) if (item[field] !== null && (!Number.isInteger(item[field]) || item[field] < minimum || item[field] > maximum)) errors.push(`${path}.${field} must be ${minimum}-${maximum} or null.`);
    for (const field of ["readinessAsOf", "reviewedAt"]) if (!calendarDate(item[field])) errors.push(`${path}.${field} must use a valid YYYY-MM-DD date or be empty.`);
    for (const field of ["createdAt", "updatedAt"]) if (!iso(item[field])) errors.push(`${path}.${field} must be an ISO timestamp.`);
    if (item.sourceUrl) {
      const normalized = safeHttpUrl(item.sourceUrl);
      if (!normalized) errors.push(`${path}.sourceUrl must use HTTP or HTTPS.`);
      else {
        const parsed = new URL(normalized);
        if (parsed.username || parsed.password) errors.push(`${path}.sourceUrl must not contain credentials.`);
      }
    }
    if (Object.hasOwn(item, "solutionId")) errors.push(`${path}.solutionId is not supported in the shared catalog.`);
  });
  return { valid: errors.length === 0, errors };
}

function snapshotDescription(item) {
  return [
    item.summary,
    item.version ? `Catalog version: ${item.version}` : "",
    item.capabilities.length ? `Capabilities: ${item.capabilities.join("; ")}` : "",
    item.deploymentAndEnvironment ? `Deployment and environment: ${item.deploymentAndEnvironment}` : "",
    item.interfaces ? `Interfaces: ${item.interfaces}` : "",
    item.integrationConsiderations ? `Integration considerations: ${item.integrationConsiderations}` : "",
    item.cyberSafetyConsiderations ? `Cyber and safety considerations: ${item.cyberSafetyConsiderations}` : "",
    item.mosaDataRights ? `MOSA and data rights: ${item.mosaDataRights}` : ""
  ].filter(Boolean).join("\n\n").slice(0, 3_000);
}

export function materializeKnowledgeItem(item, solutionId, { generatedAt = new Date(), idFactory = makeId } = {}) {
  const timestamp = generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString();
  return {
    id: idFactory("candidate"),
    solutionId,
    name: item.name,
    category: item.offeringType,
    vendor: item.provider,
    description: snapshotDescription(item),
    readinessBasis: item.readinessBasis.slice(0, 3_000),
    readinessAsOf: item.readinessAsOf,
    trl: item.trl,
    mrl: item.mrl,
    irl: item.irl,
    status: "Considering",
    scores: [],
    catalogSource: { itemId: item.id, revision: item.revision, itemName: item.name, importedAt: timestamp, reviewedAt: item.reviewedAt, sourceUrl: item.sourceUrl }
  };
}

export function refreshCandidateFromKnowledge(candidate, item, { generatedAt = new Date() } = {}) {
  const refreshed = materializeKnowledgeItem(item, candidate.solutionId, { generatedAt, idFactory: () => candidate.id });
  return { ...candidate, name: refreshed.name, category: refreshed.category, vendor: refreshed.vendor, description: refreshed.description, readinessBasis: refreshed.readinessBasis, readinessAsOf: refreshed.readinessAsOf, trl: refreshed.trl, mrl: refreshed.mrl, irl: refreshed.irl, catalogSource: refreshed.catalogSource };
}

export function updateKnowledgeItem(knowledgeBase, itemId, values, { generatedAt = new Date() } = {}) {
  const timestamp = (generatedAt instanceof Date ? generatedAt : new Date(generatedAt)).toISOString();
  const next = structuredClone(knowledgeBase);
  const index = next.items.findIndex(item => item.id === itemId);
  if (index < 0) throw new Error("Knowledge Base item was not found.");
  const existing = next.items[index];
  if (!Number.isSafeInteger(existing.revision) || existing.revision < 1 || existing.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Knowledge Base revision cannot be advanced safely.");
  next.items[index] = createKnowledgeItem({ ...existing, ...values, id: existing.id, revision: existing.revision + 1, createdAt: existing.createdAt, updatedAt: timestamp }, generatedAt);
  next.savedAt = timestamp;
  return next;
}
