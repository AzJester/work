export const SCHEMA_VERSION = 3;

export const CONFIDENCE_FACTORS = Object.freeze({
  Confirmed: 1,
  Inference: 0.75,
  Hypothesis: 0.5,
  Conflicting: 0.35,
  Missing: 0
});

const REQUIRED_COLLECTIONS = [
  "pursuits",
  "criteria",
  "evidence",
  "competitors",
  "actions",
  "playbooks",
  "runs",
  "snapshots"
];

const SAFE_RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SNAPSHOT_MAX_DEPTH = 4;
const REPORT_STATUSES = Object.freeze(["Draft", "In review", "Approved"]);
const REPORT_VISUAL_SCHEMA_VERSION = 1;
const REPORT_VISUAL_SNAPSHOT_VERSION = 2;
const REPORT_VISUAL_SNAPSHOT_MAX_BYTES = 64_000;
const REPORT_VISUAL_TEXT_LIMIT = 180;
const REPORT_VISUAL_SPEC_TEXT_LIMIT = 1_000;
const REPORT_VISUAL_TOTAL_LIMIT = 100_000;
const REPORT_VISUAL_KEYS = Object.freeze([
  "rankedCpi",
  "scoreHeatmap",
  "criterionDeltas",
  "scenarioRange",
  "evidenceGrid",
  "evidenceRelationships",
  "actionSummary"
]);
const REPORT_ACTION_PRIORITIES = Object.freeze([
  "Critical",
  "High",
  "Medium",
  "Low",
  "Other"
]);
const REPORT_ACTION_STATUSES = Object.freeze([
  "Open",
  "In progress",
  "Blocked",
  "Complete",
  "Other"
]);
const SAFE_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain"
]);

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]
  );
}

export function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function safeAttachmentDataUrl(value) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 450_000) return false;
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(
    value
  );
  if (!match) return false;
  const mimeType = match[1].toLowerCase();
  const payload = match[2];
  return (
    SAFE_ATTACHMENT_MIME_TYPES.has(mimeType) &&
    payload.length > 0 &&
    payload.length % 4 === 0
  );
}

function attachmentMimeType(value) {
  return (
    /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/i.exec(String(value || ""))?.[1]?.toLowerCase() ||
    ""
  );
}

export function isSafeRecordId(value) {
  return typeof value === "string" && SAFE_RECORD_ID_PATTERN.test(value);
}

export function validateWorkspaceImport(candidate) {
  return validateWorkspaceCandidate(candidate, {
    path: "Workspace",
    requireCurrentCollections: candidate?.schemaVersion === SCHEMA_VERSION,
    enforceReciprocity: candidate?.schemaVersion === SCHEMA_VERSION,
    validateSnapshots: true,
    snapshotDepth: 0,
    maxSnapshotDepth: SNAPSHOT_MAX_DEPTH
  });
}

export function validateRawWorkspace(candidate) {
  return validateWorkspaceImport(candidate);
}

export function validateWorkspace(candidate) {
  return validateWorkspaceCandidate(candidate, {
    path: "Workspace",
    requireCurrentCollections: true,
    enforceReciprocity: true,
    validateSnapshots: true,
    snapshotDepth: 0,
    maxSnapshotDepth: SNAPSHOT_MAX_DEPTH
  });
}

export function validateWorkspaceSnapshot(snapshot, options = {}) {
  const errors = [];
  const requestedDepth = Number(options.maxDepth);
  const maxSnapshotDepth =
    Number.isInteger(requestedDepth) && requestedDepth >= 0
      ? Math.min(requestedDepth, SNAPSHOT_MAX_DEPTH)
      : SNAPSHOT_MAX_DEPTH;
  validateSnapshotInto(snapshot, errors, {
    path: "Snapshot",
    snapshotDepth: 0,
    maxSnapshotDepth,
    enforceReciprocity: true
  });
  return { valid: errors.length === 0, errors };
}

function validateWorkspaceCandidate(candidate, context) {
  const errors = [];
  const path = context.path || "Workspace";
  if (!isRecordObject(candidate)) {
    return { valid: false, errors: [`${path} must be a JSON object.`] };
  }
  if (
    candidate.schemaVersion !== undefined &&
    (!Number.isInteger(candidate.schemaVersion) ||
      candidate.schemaVersion < 1 ||
      candidate.schemaVersion > SCHEMA_VERSION)
  ) {
    errors.push(`${path} has an unsupported schema version. Expected 1-${SCHEMA_VERSION}.`);
  }
  for (const name of REQUIRED_COLLECTIONS) {
    if (candidate[name] === undefined) {
      if (
        context.requireCurrentCollections ||
        (context.requireSnapshotCollections && name !== "snapshots")
      ) {
        errors.push(`${path}.${name} must be an array.`);
      }
    } else if (!Array.isArray(candidate[name])) {
      errors.push(`${path}.${name} must be an array.`);
    }
  }
  const collections = Object.fromEntries(
    REQUIRED_COLLECTIONS.map(name => [name, Array.isArray(candidate[name]) ? candidate[name] : []])
  );
  if (!collections.pursuits.length) {
    errors.push(`${path} requires at least one pursuit.`);
  }

  const pursuitById = new Map();
  const seenIds = new Set();
  for (const [index, pursuit] of collections.pursuits.entries()) {
    const recordPath = `${path}.pursuits[${index}]`;
    if (!isRecordObject(pursuit)) {
      errors.push(`${recordPath} must be an object.`);
      continue;
    }
    if (!isSafeRecordId(pursuit.id)) {
      errors.push(`${recordPath}.id must be a safe record ID.`);
    } else {
      if (seenIds.has(pursuit.id)) errors.push(`${recordPath}.id is duplicated.`);
      seenIds.add(pursuit.id);
      if (!pursuitById.has(pursuit.id)) pursuitById.set(pursuit.id, pursuit);
    }
    if (!nonEmpty(pursuit.name) || !nonEmpty(pursuit.customer)) {
      errors.push(`${recordPath} requires name and customer.`);
    }
  }

  const recordsByCollection = Object.fromEntries(
    ["criteria", "evidence", "competitors", "actions", "runs"].map(name => [name, new Map()])
  );
  for (const name of ["criteria", "evidence", "competitors", "actions", "runs"]) {
    for (const [index, record] of collections[name].entries()) {
      const recordPath = `${path}.${name}[${index}]`;
      if (!isRecordObject(record)) {
        errors.push(`${recordPath} must be an object.`);
        continue;
      }
      if (!isSafeRecordId(record.id)) {
        errors.push(`${recordPath}.id must be a safe record ID.`);
      } else {
        if (seenIds.has(record.id)) errors.push(`${recordPath}.id is duplicated.`);
        seenIds.add(record.id);
        if (!recordsByCollection[name].has(record.id)) {
          recordsByCollection[name].set(record.id, record);
        }
      }
      if (!isSafeRecordId(record.pursuitId)) {
        errors.push(`${recordPath}.pursuitId must be a safe relationship ID.`);
      } else if (!pursuitById.has(record.pursuitId)) {
        errors.push(`${recordPath} references a missing pursuit.`);
      }
    }
  }

  for (const [index, playbook] of collections.playbooks.entries()) {
    const recordPath = `${path}.playbooks[${index}]`;
    if (!isRecordObject(playbook)) {
      errors.push(`${recordPath} must be an object.`);
      continue;
    }
    if (!isSafeRecordId(playbook.id)) {
      errors.push(`${recordPath}.id must be a safe record ID.`);
    } else {
      if (seenIds.has(playbook.id)) errors.push(`${recordPath}.id is duplicated.`);
      seenIds.add(playbook.id);
    }
    if (!nonEmpty(playbook.name)) errors.push(`${recordPath} requires a name.`);
  }

  if (context.enforceReciprocity) {
    for (const [index, run] of collections.runs.entries()) {
      if (!isRecordObject(run)) continue;
      const revisionsPath = `${path}.runs[${index}].revisions`;
      if (!Array.isArray(run.revisions)) {
        errors.push(`${revisionsPath} must be an array.`);
        continue;
      }
      for (const [revisionIndex, revision] of run.revisions.entries()) {
        if (!isValidReportRevision(revision)) {
          errors.push(
            `${revisionsPath}[${revisionIndex}] must be a valid report revision object.`
          );
        }
      }
      if (
        run.visualSnapshot !== undefined &&
        !isValidReportVisualSnapshot(run.visualSnapshot, run.pursuitId)
      ) {
        errors.push(
          `${path}.runs[${index}].visualSnapshot must be a valid compact visualization snapshot no larger than 64 KB.`
        );
      }
    }
  }

  if (candidate.active !== undefined && candidate.active !== "") {
    if (!isSafeRecordId(candidate.active)) {
      errors.push(`${path}.active must be a safe relationship ID.`);
    } else if (!pursuitById.has(candidate.active)) {
      errors.push(`${path}.active references a missing pursuit.`);
    }
  }

  const criterionById = recordsByCollection.criteria;
  const evidenceById = recordsByCollection.evidence;
  for (const [index, criterion] of collections.criteria.entries()) {
    if (!isRecordObject(criterion)) continue;
    const recordPath = `${path}.criteria[${index}]`;
    const weight = strictFiniteNumber(criterion.weight);
    const allowLegacyDefault =
      candidate.schemaVersion === undefined || candidate.schemaVersion < SCHEMA_VERSION;
    if (!nonEmpty(criterion.name)) errors.push(`${recordPath} requires a name.`);
    if (
      !(allowLegacyDefault && criterion.weight === undefined) &&
      (weight === null || weight <= 0 || weight > 1000)
    ) {
      errors.push(`${recordPath} has an invalid weight.`);
    }
    if (
      criterion.ourScore !== undefined &&
      criterion.ourScore !== "" &&
      !isScoreInRange(criterion.ourScore)
    ) {
      errors.push(`${recordPath} has an invalid score.`);
    }
    const evidenceIds = validateRelationshipIdArray(
      criterion.evidenceIds,
      `${recordPath}.evidenceIds`,
      errors,
      context.enforceReciprocity
    );
    for (const evidenceId of evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        errors.push(`${recordPath} references missing evidence.`);
        continue;
      }
      if (evidence.pursuitId !== criterion.pursuitId) {
        errors.push(`${recordPath} references evidence from another pursuit.`);
      }
      if (
        context.enforceReciprocity &&
        Array.isArray(evidence.criterionIds) &&
        isSafeRecordId(criterion.id) &&
        !evidence.criterionIds.includes(criterion.id)
      ) {
        errors.push(`${recordPath} has a nonreciprocal evidence link.`);
      }
    }
  }

  for (const [index, competitor] of collections.competitors.entries()) {
    if (!isRecordObject(competitor)) continue;
    const recordPath = `${path}.competitors[${index}]`;
    if (!nonEmpty(competitor.name)) errors.push(`${recordPath} requires a name.`);
    if (
      competitor.scores !== undefined &&
      (!isRecordObject(competitor.scores) || Array.isArray(competitor.scores))
    ) {
      errors.push(`${recordPath}.scores must be an object.`);
    }
    const scores = isRecordObject(competitor.scores) ? competitor.scores : {};
    for (const [criterionId, score] of Object.entries(scores)) {
      if (!isSafeRecordId(criterionId)) {
        errors.push(`${recordPath}.scores contains an unsafe relationship ID.`);
        continue;
      }
      const criterion = criterionById.get(criterionId);
      if (!criterion) {
        errors.push(`${recordPath}.scores references a missing criterion.`);
      } else if (criterion.pursuitId !== competitor.pursuitId) {
        errors.push(`${recordPath}.scores references a criterion from another pursuit.`);
      }
      if (score !== "" && !isScoreInRange(score)) {
        errors.push(`${recordPath} contains a nonnumeric score or a score outside 1-5.`);
      }
    }
    const evidenceIds = validateRelationshipIdArray(
      competitor.evidenceIds,
      `${recordPath}.evidenceIds`,
      errors,
      context.enforceReciprocity
    );
    for (const evidenceId of evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        errors.push(`${recordPath} references missing evidence.`);
      } else if (evidence.pursuitId !== competitor.pursuitId) {
        errors.push(`${recordPath} references evidence from another pursuit.`);
      }
    }
  }

  for (const [index, evidence] of collections.evidence.entries()) {
    if (!isRecordObject(evidence)) continue;
    const recordPath = `${path}.evidence[${index}]`;
    if (!nonEmpty(evidence.title) || !nonEmpty(evidence.source)) {
      errors.push(`${recordPath} requires a title and source.`);
    }
    if (evidence.url && !safeHttpUrl(evidence.url)) {
      errors.push(`${recordPath} has an invalid source URL.`);
    }
    if (
      evidence.attachmentData !== undefined &&
      evidence.attachmentData !== "" &&
      (typeof evidence.attachmentData !== "string" ||
        evidence.attachmentData.length > 450_000 ||
        !safeAttachmentDataUrl(evidence.attachmentData))
    ) {
      errors.push(`${recordPath} attachment must be a bounded base64 data URL with a safe MIME type.`);
    }
    if (
      evidence.attachmentType &&
      !SAFE_ATTACHMENT_MIME_TYPES.has(String(evidence.attachmentType).toLowerCase())
    ) {
      errors.push(`${recordPath}.attachmentType is not an allowed MIME type.`);
    }
    if (
      evidence.attachmentData &&
      evidence.attachmentType &&
      attachmentMimeType(evidence.attachmentData) !==
        String(evidence.attachmentType).toLowerCase()
    ) {
      errors.push(`${recordPath} attachment MIME types do not match.`);
    }
    const criterionIds = validateRelationshipIdArray(
      evidence.criterionIds,
      `${recordPath}.criterionIds`,
      errors,
      context.enforceReciprocity
    );
    for (const criterionId of criterionIds) {
      const criterion = criterionById.get(criterionId);
      if (!criterion) {
        errors.push(`${recordPath} references a missing criterion.`);
        continue;
      }
      if (criterion.pursuitId !== evidence.pursuitId) {
        errors.push(`${recordPath} references a criterion from another pursuit.`);
      }
      if (
        context.enforceReciprocity &&
        Array.isArray(criterion.evidenceIds) &&
        isSafeRecordId(evidence.id) &&
        !criterion.evidenceIds.includes(evidence.id)
      ) {
        errors.push(`${recordPath} has a nonreciprocal criterion link.`);
      }
    }
  }

  if (context.validateSnapshots && Array.isArray(candidate.snapshots)) {
    const snapshotIds = new Set();
    for (const [index, snapshot] of candidate.snapshots.entries()) {
      const snapshotPath = `${path}.snapshots[${index}]`;
      if (isRecordObject(snapshot) && isSafeRecordId(snapshot.id)) {
        if (snapshotIds.has(snapshot.id) || seenIds.has(snapshot.id)) {
          errors.push(`${snapshotPath}.id is duplicated.`);
        }
        snapshotIds.add(snapshot.id);
      }
      validateSnapshotInto(snapshot, errors, {
        path: snapshotPath,
        snapshotDepth: context.snapshotDepth,
        maxSnapshotDepth: context.maxSnapshotDepth,
        enforceReciprocity: context.enforceReciprocity
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateSnapshotInto(snapshot, errors, context) {
  const path = context.path;
  if (!isRecordObject(snapshot)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (!isSafeRecordId(snapshot.id)) {
    errors.push(`${path}.id must be a safe record ID.`);
  }
  if (!isSafeRecordId(snapshot.active)) {
    errors.push(`${path}.active must be a safe relationship ID.`);
  }
  if (!isRecordObject(snapshot.workspace)) {
    errors.push(`${path}.workspace must be an object.`);
    return;
  }
  const nestingLimitReached = context.snapshotDepth >= context.maxSnapshotDepth;
  if (nestingLimitReached) {
    if (
      Array.isArray(snapshot.workspace.snapshots) &&
      snapshot.workspace.snapshots.length
    ) {
      errors.push(`${path}.workspace exceeds the supported snapshot nesting depth.`);
    }
  }

  const nestedCandidate = {};
  for (const name of REQUIRED_COLLECTIONS) {
    if (Object.prototype.hasOwnProperty.call(snapshot.workspace, name)) {
      nestedCandidate[name] = snapshot.workspace[name];
    }
  }
  if (Object.prototype.hasOwnProperty.call(snapshot.workspace, "schemaVersion")) {
    nestedCandidate.schemaVersion = snapshot.workspace.schemaVersion;
  }
  nestedCandidate.active = snapshot.active;
  const result = validateWorkspaceCandidate(nestedCandidate, {
    path: `${path}.workspace`,
    requireCurrentCollections: false,
    requireSnapshotCollections: context.enforceReciprocity,
    enforceReciprocity: context.enforceReciprocity,
    validateSnapshots: !nestingLimitReached,
    snapshotDepth: context.snapshotDepth + 1,
    maxSnapshotDepth: context.maxSnapshotDepth
  });
  errors.push(...result.errors);
}

function validateRelationshipIdArray(value, path, errors, required = false) {
  if (value === undefined) {
    if (required) errors.push(`${path} must be an array of safe record IDs.`);
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of safe record IDs.`);
    return [];
  }
  const ids = [];
  const seen = new Set();
  for (const id of value) {
    if (!isSafeRecordId(id)) {
      errors.push(`${path} contains an unsafe relationship ID.`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${path} contains a duplicate relationship ID.`);
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function isScoreInRange(value) {
  const score = strictFiniteNumber(value);
  return score !== null && score >= 1 && score <= 5;
}

function strictFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecordObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReportRevisions(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidReportRevision).map(revision => ({
    ...revision,
    version: Number(revision.version),
    reviewer: typeof revision.reviewer === "string" ? revision.reviewer : "",
    approvalNote: typeof revision.approvalNote === "string" ? revision.approvalNote : ""
  }));
}

function isValidReportRevision(value) {
  const version = Number(value?.version);
  return (
    isRecordObject(value) &&
    Number.isInteger(version) &&
    version > 0 &&
    nonEmpty(value.savedAt) &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    REPORT_STATUSES.includes(value.status) &&
    typeof value.output === "string" &&
    (value.reviewer === undefined || typeof value.reviewer === "string") &&
    (value.approvalNote === undefined || typeof value.approvalNote === "string")
  );
}

function isValidReportVisualSnapshot(value, pursuitId) {
  if (
    !isRecordObject(value) ||
    !hasExactKeys(value, ["schemaVersion", "snapshotVersion", "pursuitId", "metrics", "visuals"]) ||
    value.schemaVersion !== REPORT_VISUAL_SCHEMA_VERSION ||
    value.snapshotVersion !== REPORT_VISUAL_SNAPSHOT_VERSION ||
    !isSafeRecordId(value.pursuitId) ||
    value.pursuitId !== pursuitId ||
    !isRecordObject(value.metrics) ||
    !isRecordObject(value.visuals) ||
    !isValidReportVisualMetrics(value.metrics) ||
    !isValidReportVisuals(value.visuals) ||
    !reportVisualMetricsMatch(value.metrics, value.visuals)
  ) {
    return false;
  }
  try {
    const serialized = JSON.stringify(value);
    return (
      typeof serialized === "string" &&
      utf8ByteLength(serialized) <= REPORT_VISUAL_SNAPSHOT_MAX_BYTES
    );
  } catch {
    return false;
  }
}

function reportVisualMetricsMatch(metrics, visuals) {
  const ourEntities = visuals.rankedCpi.entities.filter(item => item.isUs);
  if (
    ourEntities.length === 1 &&
    (metrics.ourCpi !== ourEntities[0].cpi ||
      metrics.coverage !== ourEntities[0].coverage ||
      metrics.confidence !== ourEntities[0].confidence)
  ) {
    return false;
  }
  const rivalCpis = visuals.rankedCpi.entities
    .filter(item => !item.isUs && item.cpi !== null)
    .map(item => item.cpi);
  const strongestRivalCpi = rivalCpis.length ? Math.max(...rivalCpis) : null;
  const scenario = visuals.scenarioRange.estimate?.value ?? null;
  return metrics.strongestRivalCpi === strongestRivalCpi && metrics.scenario === scenario;
}

function isValidReportVisualMetrics(value) {
  return (
    hasExactKeys(value, [
      "ourCpi",
      "strongestRivalCpi",
      "scenario",
      "coverage",
      "confidence"
    ]) &&
    Object.values(value).every(item => isNullableFiniteRange(item, 0, 100))
  );
}

function isValidReportVisuals(value) {
  return (
    hasExactKeys(value, REPORT_VISUAL_KEYS) &&
    isValidRankedCpiSpec(value.rankedCpi) &&
    isValidScoreHeatmapSpec(value.scoreHeatmap) &&
    isValidCriterionDeltaSpec(value.criterionDeltas) &&
    isValidScenarioRangeSpec(value.scenarioRange) &&
    isValidEvidenceGridSpec(value.evidenceGrid) &&
    isValidEvidenceRelationshipsSpec(value.evidenceRelationships) &&
    isValidActionSummarySpec(value.actionSummary)
  );
}

function isValidRankedCpiSpec(spec) {
  if (
    !isValidVisualSpecBase(spec, "ranked-cpi", ["entities", "totalEntities"]) ||
    !Array.isArray(spec.entities) ||
    spec.entities.length > 14 ||
    !isValidShownTotal(spec.totalEntities, spec.entities.length)
  ) {
    return false;
  }
  let ourTeamCount = 0;
  for (const [index, item] of spec.entities.entries()) {
    if (
      !hasExactKeys(item, ["id", "name", "cpi", "coverage", "confidence", "isUs"]) ||
      item.id !== `entity-${index}` ||
      !isBoundedVisualText(item.name) ||
      !isNullableFiniteRange(item.cpi, 0, 100) ||
      !isNullableFiniteRange(item.coverage, 0, 100) ||
      !isNullableFiniteRange(item.confidence, 0, 100) ||
      typeof item.isUs !== "boolean"
    ) {
      return false;
    }
    if (item.isUs) ourTeamCount += 1;
  }
  return ourTeamCount === 1;
}

function isValidScoreHeatmapSpec(spec) {
  if (
    !isValidVisualSpecBase(spec, "score-heatmap", [
      "columns",
      "rows",
      "totalColumns",
      "totalRows"
    ]) ||
    !Array.isArray(spec.columns) ||
    !Array.isArray(spec.rows) ||
    spec.columns.length < 1 ||
    spec.columns.length > 7 ||
    spec.rows.length > 14 ||
    !isValidShownTotal(spec.totalColumns, spec.columns.length) ||
    !isValidShownTotal(spec.totalRows, spec.rows.length)
  ) {
    return false;
  }
  const columnIds = spec.columns.map((item, index) => {
    if (
      !hasExactKeys(item, ["id", "name"]) ||
      item.id !== `entity-${index}` ||
      !isBoundedVisualText(item.name)
    ) {
      return "";
    }
    return item.id;
  });
  if (columnIds.some(item => !item)) return false;
  return spec.rows.every(
    (item, index) =>
      hasExactKeys(item, ["id", "name", "weight", "values"]) &&
      item.id === `criterion-${index}` &&
      isBoundedVisualText(item.name) &&
      isNullableFiniteRange(item.weight, 0, 1_000) &&
      isRecordObject(item.values) &&
      hasExactKeys(item.values, columnIds) &&
      Object.values(item.values).every(value => isNullableFiniteRange(value, 1, 5))
  );
}

function isValidCriterionDeltaSpec(spec) {
  return (
    isValidVisualSpecBase(spec, "criterion-deltas", [
      "competitorName",
      "rows",
      "totalRows"
    ]) &&
    isBoundedVisualText(spec.competitorName) &&
    Array.isArray(spec.rows) &&
    spec.rows.length <= 14 &&
    isValidShownTotal(spec.totalRows, spec.rows.length) &&
    spec.rows.every(
      (item, index) =>
        hasExactKeys(item, [
          "id",
          "name",
          "weight",
          "ourEffective",
          "rivalEffective",
          "delta"
        ]) &&
        item.id === `criterion-${index}` &&
        isBoundedVisualText(item.name) &&
        isNullableFiniteRange(item.weight, 0, 1_000) &&
        isNullableFiniteRange(item.ourEffective, 1, 5) &&
        isNullableFiniteRange(item.rivalEffective, 1, 5) &&
        isNullableFiniteRange(item.delta, -4, 4)
    )
  );
}

function isValidScenarioRangeSpec(spec) {
  if (!isValidVisualSpecBase(spec, "scenario-range", ["estimate"])) return false;
  if (spec.estimate === null) return true;
  if (
    !hasExactKeys(spec.estimate, ["value", "prior", "trust", "low", "high"]) ||
    !isFiniteRange(spec.estimate.value, 0, 100) ||
    !["prior", "trust", "low", "high"].every(key =>
      isNullableFiniteRange(spec.estimate[key], 0, 100)
    )
  ) {
    return false;
  }
  return (
    (spec.estimate.low === null || spec.estimate.low <= spec.estimate.value) &&
    (spec.estimate.high === null || spec.estimate.value <= spec.estimate.high)
  );
}

function isValidEvidenceGridSpec(spec) {
  return (
    isValidVisualSpecBase(spec, "evidence-grid", ["rows", "totalRows"]) &&
    Array.isArray(spec.rows) &&
    spec.rows.length <= 14 &&
    isValidShownTotal(spec.totalRows, spec.rows.length) &&
    spec.rows.every(
      (item, index) =>
        hasExactKeys(item, [
          "id",
          "name",
          "weight",
          "score",
          "classification",
          "linked",
          "support",
          "challenge",
          "conflict"
        ]) &&
        item.id === `criterion-${index}` &&
        isBoundedVisualText(item.name) &&
        isNullableFiniteRange(item.weight, 0, 1_000) &&
        isNullableFiniteRange(item.score, 1, 5) &&
        isBoundedVisualText(item.classification) &&
        isNonnegativeSafeInteger(item.linked) &&
        isNonnegativeSafeInteger(item.support) &&
        isNonnegativeSafeInteger(item.challenge) &&
        item.support <= item.linked &&
        item.challenge <= item.linked &&
        typeof item.conflict === "boolean" &&
        item.conflict === (item.support > 0 && item.challenge > 0)
    )
  );
}

function isValidEvidenceRelationshipsSpec(spec) {
  if (
    !isValidVisualSpecBase(spec, "evidence-relationships", [
      "evidence",
      "criteria",
      "links",
      "totalEvidence",
      "totalCriteria",
      "totalLinks"
    ]) ||
    !Array.isArray(spec.evidence) ||
    !Array.isArray(spec.criteria) ||
    !Array.isArray(spec.links) ||
    spec.evidence.length > 9 ||
    spec.criteria.length > 9 ||
    spec.links.length > 81 ||
    !isValidShownTotal(spec.totalEvidence, spec.evidence.length) ||
    !isValidShownTotal(spec.totalCriteria, spec.criteria.length) ||
    !isValidShownTotal(spec.totalLinks, spec.links.length)
  ) {
    return false;
  }
  const evidenceIds = new Set();
  for (const [index, item] of spec.evidence.entries()) {
    if (
      !hasExactKeys(item, ["id", "label", "classification", "stance"]) ||
      item.id !== `evidence-${index}` ||
      !isBoundedVisualText(item.label) ||
      !isBoundedVisualText(item.classification) ||
      !isBoundedVisualText(item.stance)
    ) {
      return false;
    }
    evidenceIds.add(item.id);
  }
  const criterionIds = new Set();
  for (const [index, item] of spec.criteria.entries()) {
    if (
      !hasExactKeys(item, ["id", "label", "weight"]) ||
      item.id !== `criterion-${index}` ||
      !isBoundedVisualText(item.label) ||
      !isNullableFiniteRange(item.weight, 0, 1_000)
    ) {
      return false;
    }
    criterionIds.add(item.id);
  }
  const linkedPairs = new Set();
  for (const item of spec.links) {
    const pair = `${item?.evidenceId}\u0000${item?.criterionId}`;
    if (
      !hasExactKeys(item, ["evidenceId", "criterionId", "stance"]) ||
      !evidenceIds.has(item.evidenceId) ||
      !criterionIds.has(item.criterionId) ||
      !isBoundedVisualText(item.stance) ||
      linkedPairs.has(pair)
    ) {
      return false;
    }
    linkedPairs.add(pair);
  }
  return true;
}

function isValidActionSummarySpec(spec) {
  if (
    !isValidVisualSpecBase(spec, "action-summary", ["actions", "counts", "totalActions"]) ||
    !Array.isArray(spec.actions) ||
    spec.actions.length !== 0 ||
    !Array.isArray(spec.counts) ||
    spec.counts.length > REPORT_ACTION_PRIORITIES.length * REPORT_ACTION_STATUSES.length ||
    !isNonnegativeSafeInteger(spec.totalActions)
  ) {
    return false;
  }
  const buckets = new Set();
  let total = 0;
  for (const item of spec.counts) {
    const key = `${item?.priority}\u0000${item?.status}`;
    if (
      !hasExactKeys(item, ["priority", "status", "count"]) ||
      !REPORT_ACTION_PRIORITIES.includes(item.priority) ||
      !REPORT_ACTION_STATUSES.includes(item.status) ||
      !isNonnegativeSafeInteger(item.count) ||
      item.count <= 0 ||
      buckets.has(key)
    ) {
      return false;
    }
    buckets.add(key);
    total += item.count;
    if (!Number.isSafeInteger(total)) return false;
  }
  return spec.totalActions === total;
}

function isValidVisualSpecBase(spec, type, extraKeys) {
  return (
    isRecordObject(spec) &&
    hasExactKeys(spec, ["type", "title", "description", ...extraKeys]) &&
    spec.type === type &&
    isBoundedVisualText(spec.title, REPORT_VISUAL_SPEC_TEXT_LIMIT) &&
    isBoundedVisualText(spec.description, REPORT_VISUAL_SPEC_TEXT_LIMIT)
  );
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecordObject(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isBoundedVisualText(value, maximum = REPORT_VISUAL_TEXT_LIMIT) {
  return typeof value === "string" && utf8ByteLength(value) <= maximum;
}

function isNullableFiniteRange(value, minimum, maximum) {
  return value === null || isFiniteRange(value, minimum, maximum);
}

function isFiniteRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isNonnegativeSafeInteger(value) {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= REPORT_VISUAL_TOTAL_LIMIT
  );
}

function isValidShownTotal(value, shownCount) {
  return isNonnegativeSafeInteger(value) && value >= shownCount;
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export function normalizeWorkspace(candidate, fallback) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const isImportedWorkspace = Array.isArray(source.pursuits);
  const workspace = {};
  for (const collection of REQUIRED_COLLECTIONS) {
    workspace[collection] = Array.isArray(source[collection])
      ? structuredClone(source[collection])
      : structuredClone(
          isImportedWorkspace && collection !== "playbooks" ? [] : base[collection] || []
        );
  }
  workspace.schemaVersion = SCHEMA_VERSION;
  workspace.appVersion = "3.0.0";
  workspace.createdAt = source.createdAt || base.createdAt || new Date().toISOString();
  workspace.updatedAt = source.updatedAt || base.updatedAt || workspace.createdAt;
  workspace.active =
    source.active && workspace.pursuits.some(item => item.id === source.active)
      ? source.active
      : workspace.pursuits.find(item => !item.archived)?.id || workspace.pursuits[0]?.id || "";

  workspace.pursuits = workspace.pursuits.map(item => ({
    stage: "Capture",
    status: "Active",
    owner: "",
    review: "",
    decisionDate: "",
    contractValue: "",
    playbook: workspace.playbooks[0]?.name || "",
    summary: "",
    ourPosition: "",
    procurementContext: "",
    priorEstimate: 50,
    archived: false,
    ...item,
    archived: Boolean(item.archived)
  }));
  workspace.criteria = workspace.criteria.map(item => ({
    category: "Technical",
    description: "",
    weight: 10,
    ourScore: "",
    classification: "Hypothesis",
    rationale: "",
    evidenceIds: [],
    isGate: false,
    ...item,
    evidenceIds: asStringArray(item.evidenceIds),
    isGate: Boolean(item.isGate)
  }));
  workspace.evidence = workspace.evidence.map((item, index) => ({
    citation: `E-${String(index + 1).padStart(3, "0")}`,
    type: "Customer",
    url: "",
    publishedAt: "",
    confidence: "Medium",
    classification: "Hypothesis",
    stance: "Neutral",
    note: "",
    criterionIds: [],
    attachmentName: "",
    attachmentType: "",
    attachmentData: "",
    ...item,
    citation: item.citation || `E-${String(index + 1).padStart(3, "0")}`,
    criterionIds: asStringArray(item.criterionIds)
  }));
  workspace.competitors = workspace.competitors.map(item => ({
    position: "Challenger",
    incumbent: false,
    bidLikelihood: "Likely",
    strengths: "",
    weaknesses: "",
    strategy: "",
    ghosting: "",
    counterMoves: "",
    classification: "Hypothesis",
    evidenceIds: [],
    scores: {},
    ...item,
    incumbent: Boolean(item.incumbent),
    evidenceIds: asStringArray(item.evidenceIds),
    scores: item.scores && typeof item.scores === "object" ? { ...item.scores } : {}
  }));
  workspace.actions = workspace.actions.map(item => ({
    owner: "",
    due: "",
    status: "Open",
    priority: "Medium",
    finding: "",
    ...item
  }));
  workspace.playbooks = workspace.playbooks.map(item => ({
    description: "",
    sections: "Executive summary, scoring matrix, vulnerabilities, actions",
    builtIn: false,
    ...item,
    builtIn: Boolean(item.builtIn)
  }));
  workspace.runs = workspace.runs.map(item => {
    const run = {
      title: "Black Hat Competitive Analysis",
      createdAt: item.date ? `${item.date}T12:00:00` : new Date().toISOString(),
      updatedAt: item.createdAt || new Date().toISOString(),
      version: 1,
      status: "Draft",
      participants: "",
      notes: "",
      reviewer: "",
      approvalNote: "",
      sourceHash: "",
      revisions: [],
      sections: [],
      ...item,
      revisions: normalizeReportRevisions(item.revisions),
      sections: Array.isArray(item.sections) ? item.sections : []
    };
    if (!isValidReportVisualSnapshot(run.visualSnapshot, run.pursuitId)) {
      delete run.visualSnapshot;
    }
    return run;
  });
  repairCriterionEvidenceLinks(workspace);
  workspace.snapshots = workspace.snapshots
    .filter(item => isRecordObject(item) && isRecordObject(item.workspace))
    .map(item => normalizeSnapshotForMigration(item))
    .slice(-8);
  return workspace;
}

function normalizeSnapshotForMigration(snapshot, depth = 0) {
  const normalized = structuredClone(snapshot);
  const nested = normalized.workspace;
  for (const name of REQUIRED_COLLECTIONS.filter(name => name !== "snapshots")) {
    if (!Array.isArray(nested[name])) nested[name] = [];
  }
  nested.criteria = nested.criteria.map(item => ({
    ...item,
    evidenceIds: asStringArray(item?.evidenceIds)
  }));
  nested.evidence = nested.evidence.map(item => ({
    ...item,
    criterionIds: asStringArray(item?.criterionIds)
  }));
  nested.competitors = nested.competitors.map(item => ({
    ...item,
    evidenceIds: asStringArray(item?.evidenceIds),
    scores: isRecordObject(item?.scores) ? { ...item.scores } : {}
  }));
  nested.runs = nested.runs.map(item => {
    const run = {
      ...item,
      revisions: normalizeReportRevisions(item?.revisions),
      sections: Array.isArray(item?.sections) ? item.sections : []
    };
    if (!isValidReportVisualSnapshot(run.visualSnapshot, run.pursuitId)) {
      delete run.visualSnapshot;
    }
    return run;
  });
  repairCriterionEvidenceLinks(nested);
  if (Array.isArray(nested.snapshots) && depth < SNAPSHOT_MAX_DEPTH) {
    nested.snapshots = nested.snapshots
      .filter(item => isRecordObject(item) && isRecordObject(item.workspace))
      .map(item => normalizeSnapshotForMigration(item, depth + 1));
  } else {
    nested.snapshots = [];
  }
  return normalized;
}

function repairCriterionEvidenceLinks(workspace) {
  const criteria = Array.isArray(workspace.criteria) ? workspace.criteria : [];
  const evidence = Array.isArray(workspace.evidence) ? workspace.evidence : [];
  const criterionById = new Map(
    criteria
      .filter(item => isRecordObject(item) && isSafeRecordId(item.id))
      .map(item => [item.id, item])
  );
  const evidenceById = new Map(
    evidence
      .filter(item => isRecordObject(item) && isSafeRecordId(item.id))
      .map(item => [item.id, item])
  );
  const links = new Set();
  for (const criterion of criterionById.values()) {
    for (const evidenceId of uniqueStrings(criterion.evidenceIds)) {
      const linkedEvidence = evidenceById.get(evidenceId);
      if (linkedEvidence?.pursuitId === criterion.pursuitId) {
        links.add(`${criterion.id}\u0000${evidenceId}`);
      }
    }
  }
  for (const item of evidenceById.values()) {
    for (const criterionId of uniqueStrings(item.criterionIds)) {
      const criterion = criterionById.get(criterionId);
      if (criterion?.pursuitId === item.pursuitId) {
        links.add(`${criterionId}\u0000${item.id}`);
      }
    }
  }
  for (const criterion of criteria) criterion.evidenceIds = [];
  for (const item of evidence) item.criterionIds = [];
  for (const link of links) {
    const [criterionId, evidenceId] = link.split("\u0000");
    criterionById.get(criterionId)?.evidenceIds.push(evidenceId);
    evidenceById.get(evidenceId)?.criterionIds.push(criterionId);
  }
}

export function calculateCompetitiveScores(workspace, pursuitId) {
  const criteria = workspace.criteria.filter(item => item.pursuitId === pursuitId);
  const competitors = workspace.competitors.filter(item => item.pursuitId === pursuitId);
  const totalWeight = criteria.reduce((sum, item) => sum + positive(item.weight), 0);
  const evidence = workspace.evidence.filter(item => item.pursuitId === pursuitId);
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  const us = scoreSubject(
    "Our team",
    "us",
    criteria,
    totalWeight,
    criterion => criterion.ourScore,
    criterion => criterion.classification,
    criterion => criterion.evidenceIds,
    evidenceById
  );
  const rivals = competitors.map(competitor =>
    scoreSubject(
      competitor.name,
      competitor.id,
      criteria,
      totalWeight,
      criterion => competitor.scores?.[criterion.id] ?? "",
      () => competitor.classification,
      criterion =>
        uniqueStrings(
          (competitor.evidenceIds || []).filter(evidenceId =>
            evidenceById.get(evidenceId)?.criterionIds?.includes(criterion.id)
          )
        ),
      evidenceById
    )
  );

  const scoredRivals = rivals
    .filter(item => item.cpi !== null)
    .sort((a, b) => b.cpi - a.cpi);
  const strongestCompetitor = us.cpi !== null ? scoredRivals[0] || null : null;
  const margin =
    us.cpi !== null && strongestCompetitor && strongestCompetitor.cpi !== null
      ? round(us.cpi - strongestCompetitor.cpi, 1)
      : null;
  const gateWarnings = criteria
    .filter(item => item.isGate && numericScore(item.ourScore) !== null && Number(item.ourScore) < 3)
    .map(item => item.name);
  const scenarioEstimate =
    margin !== null && strongestCompetitor && totalWeight
      ? calculateScenarioEstimate(
          workspace.pursuits.find(item => item.id === pursuitId)?.priorEstimate,
          margin,
          gateWarnings.length,
          Math.min(us.coverage, strongestCompetitor.coverage),
          Math.min(us.confidence, strongestCompetitor.confidence)
        )
      : null;

  return {
    totalWeight,
    normalized: totalWeight > 0 && Math.abs(totalWeight - 100) > 0.01,
    criteria,
    us,
    competitors: rivals,
    strongestCompetitor,
    margin,
    gateWarnings,
    scenarioEstimate
  };
}

export function buildCompetitiveReport(workspace, pursuitId, session = {}) {
  const pursuit = workspace.pursuits.find(item => item.id === pursuitId);
  if (!pursuit) throw new Error("The selected pursuit no longer exists.");
  const criteria = workspace.criteria.filter(item => item.pursuitId === pursuitId);
  const evidence = workspace.evidence.filter(item => item.pursuitId === pursuitId);
  const competitors = workspace.competitors.filter(item => item.pursuitId === pursuitId);
  const actions = workspace.actions.filter(item => item.pursuitId === pursuitId);
  const scores = calculateCompetitiveScores(workspace, pursuitId);
  const citationById = new Map(evidence.map(item => [item.id, item.citation]));
  const citation = ids =>
    uniqueStrings(ids || [])
      .map(id => citationById.get(id))
      .filter(Boolean)
      .map(value => `[${value}]`)
      .join(" ");

  const strongest = scores.strongestCompetitor
    ? competitors.find(item => item.id === scores.strongestCompetitor.id)
    : null;
  const advantages = [];
  const vulnerabilities = [];
  const contested = [];
  const intelligenceGaps = [];
  const conflicts = [];
  const reportStatus = REPORT_STATUSES.includes(session.reportStatus)
    ? session.reportStatus
    : "Draft";

  for (const criterion of criteria.slice().sort((a, b) => positive(b.weight) - positive(a.weight))) {
    const ourScore = numericScore(criterion.ourScore);
    const rivalScore = strongest ? numericScore(strongest.scores?.[criterion.id]) : null;
    const references = uniqueStrings(criterion.evidenceIds || []);
    const linked = evidence.filter(item => references.includes(item.id));
    const stances = new Set(linked.map(item => item.stance));
    if (stances.has("Support") && stances.has("Challenge")) conflicts.push(criterion);
    if (ourScore === null || !references.length || criterion.classification === "Hypothesis") {
      intelligenceGaps.push(criterion);
    }
    if (ourScore === null || rivalScore === null) continue;
    const difference = ourScore - rivalScore;
    if (difference >= 0.75) advantages.push({ criterion, difference, references });
    else if (difference <= -0.75) vulnerabilities.push({ criterion, difference, references });
    else contested.push({ criterion, difference, references });
  }

  const relativePosture =
    scores.margin === null
      ? "Not scored"
      : scores.margin >= 10
        ? "Strong advantage"
        : scores.margin >= 3
          ? "Advantage"
          : scores.margin > -3
            ? "Contested"
            : scores.margin > -10
              ? "Disadvantage"
              : "Severe disadvantage";

  const date = localDate();
  const lines = [
    `# Black Hat Competitive Analysis: ${pursuit.name}`,
    "",
    `**Report date:** ${date}`,
    `**Status:** ${reportStatus}`,
    `**Playbook:** ${session.playbook || pursuit.playbook || "Competitive assessment"}`,
    `**Facilitator:** ${session.facilitator || "Public workspace facilitator"}`,
    `**Participants:** ${session.participants || "Not recorded"}`,
    `**Customer:** ${pursuit.customer}`,
    `**Competitive posture:** ${relativePosture}`,
    scores.scenarioEstimate
      ? `**Scenario win estimate:** ${scores.scenarioEstimate.value}% (${scores.scenarioEstimate.low}-${scores.scenarioEstimate.high}% uncertainty range; planning estimate, not a forecast)`
      : `**Scenario win estimate:** Not available until our team and at least one competitor have scored criteria`,
    "",
    "> This is a deterministic analysis of user-entered judgments and evidence. It does not perform web research, verify claims, or call an AI model.",
    "",
    "## 1. Executive summary",
    scores.us.cpi !== null
      ? `Our Competitive Position Index is **${scores.us.cpi}/100** with **${scores.us.coverage}% evidence coverage** and **${scores.us.confidence}% confidence**. ${
          scores.strongestCompetitor
            ? `${scores.strongestCompetitor.name} is the strongest scored competitor at **${scores.strongestCompetitor.cpi}/100**, producing a margin of **${signed(scores.margin)} points**.`
            : "No competitor has been scored, so a relative ranking is not available."
        }`
      : scores.totalWeight
        ? "Our Competitive Position Index is not available because no customer criterion has an entered score."
        : "No weighted customer criteria have been entered; scored analysis is blocked until criteria are defined.",
    scores.gateWarnings.length
      ? `Critical gate warning: ${scores.gateWarnings.join(", ")}.`
      : "No scored critical-gate failures are currently recorded.",
    vulnerabilities.length
      ? `The most consequential vulnerabilities are ${vulnerabilities
          .slice(0, 3)
          .map(item => item.criterion.name)
          .join(", ")}.`
      : "No scored vulnerability exceeds the configured comparison threshold.",
    "",
    "## 2. Opportunity and customer priorities",
    pursuit.summary || "No opportunity summary has been entered.",
    pursuit.procurementContext ? `\nProcurement context: ${pursuit.procurementContext}` : "",
    pursuit.ourPosition ? `\nOur position: ${pursuit.ourPosition}` : "",
    "",
    ...criteria.map(
      item =>
        `- **${item.name}** — weight ${item.weight}; our score ${displayScore(item.ourScore)}; ${item.classification}. ${item.description || ""} ${citation(item.evidenceIds)}`
    ),
    criteria.length ? "" : "- No evaluation criteria have been entered.",
    "## 3. Intelligence quality",
    `- Evidence records: ${evidence.length}`,
    `- Weighted coverage: ${scores.us.coverage}%`,
    `- Weighted confidence: ${scores.us.confidence}%`,
    scores.scenarioEstimate
      ? `- Scenario estimate trust factor: ${scores.scenarioEstimate.trust}%`
      : "- Scenario estimate trust factor: not available",
    `- Conflicting criteria: ${conflicts.length ? conflicts.map(item => item.name).join(", ") : "None identified"}`,
    `- Intelligence gaps: ${intelligenceGaps.length ? intelligenceGaps.map(item => item.name).join(", ") : "No structural gaps identified"}`,
    scores.normalized
      ? `- Entered weights total ${scores.totalWeight}; calculations normalize them to 100.`
      : "- Entered weights already total 100.",
    "",
    "## 4. Competitive landscape",
    ...competitors.flatMap(competitor => {
      const score = scores.competitors.find(item => item.id === competitor.id);
      const top = criteria
        .map(criterion => ({
          name: criterion.name,
          score: numericScore(competitor.scores?.[criterion.id])
        }))
        .filter(item => item.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      return [
        `### ${competitor.name}`,
        `- Role: ${competitor.position}${competitor.incumbent ? "; incumbent" : ""}; bid likelihood: ${competitor.bidLikelihood}`,
        `- CPI: ${
          score?.cpi === null || score?.cpi === undefined
            ? "Unknown (no scored criteria)"
            : `${score.cpi}/100`
        }; coverage: ${score?.coverage ?? 0}%; confidence: ${score?.confidence ?? 0}%`,
        `- Likely strategy (${competitor.classification}): ${competitor.strategy || `May emphasize ${top.map(item => item.name).join(" and ") || "its recorded strengths"}.`} ${citation(competitor.evidenceIds)}`,
        `- Strengths: ${competitor.strengths || "Not recorded"}`,
        `- Weaknesses: ${competitor.weaknesses || "Not recorded"}`,
        `- Candidate ghosting themes: ${competitor.ghosting || "Not recorded; treat any inferred theme as a hypothesis."}`,
        `- Counter-moves: ${competitor.counterMoves || "Validate the threat, close proof gaps, and prepare measurable rebuttal evidence."}`,
        ""
      ];
    }),
    competitors.length ? "" : "No competitors have been entered. This report is an intelligence-readiness assessment rather than a competitive ranking.\n",
    "## 5. Weighted scoring matrix",
    scoreMatrix(criteria, scores, competitors, citation),
    "",
    "CPI is a deterministic 0-100 index, not a statistical win probability. Uncertain scores are shrunk toward neutral before weighting.",
    "",
    "## 6. Relative strengths and vulnerabilities",
    "### Advantages",
    ...(advantages.length
      ? advantages.map(
          item =>
            `- **${item.criterion.name}:** leads the strongest scored competitor by ${round(item.difference, 1)} points. ${item.criterion.rationale || ""} ${citation(item.references)}`
        )
      : ["- No supported advantage exceeds the comparison threshold."]),
    "",
    "### Vulnerabilities",
    ...(vulnerabilities.length
      ? vulnerabilities.map(
          item =>
            `- **${item.criterion.name}:** trails the strongest scored competitor by ${Math.abs(round(item.difference, 1))} points. A competitor may frame this as a delivery or credibility risk. ${citation(item.references)}`
        )
      : ["- No scored vulnerability exceeds the comparison threshold."]),
    "",
    "### Contested areas",
    ...(contested.length
      ? contested.map(item => `- **${item.criterion.name}:** scores are within 0.75 points.`)
      : ["- No fully scored criterion is currently classified as contested."]),
    "",
    "## 7. Customer evaluator simulation",
    ...criteria
      .slice()
      .sort((a, b) => positive(b.weight) - positive(a.weight))
      .map(criterion => {
        const ranking = [
          { name: "Our team", score: numericScore(criterion.ourScore) },
          ...competitors.map(item => ({
            name: item.name,
            score: numericScore(item.scores?.[criterion.id])
          }))
        ]
          .filter(item => item.score !== null)
          .sort((a, b) => b.score - a.score);
        if (!ranking.length) {
          return `- **${criterion.name}:** insufficient scoring data for evaluator simulation.`;
        }
        const leaders = ranking.filter(item => item.score === ranking[0].score);
        return `- On **${criterion.name}** (${criterion.weight} weight), an evaluator would currently rank **${leaders
          .map(item => item.name)
          .join(" and ")}** ${leaders.length > 1 ? "jointly " : ""}highest based on entered scores. ${citation(
          criterion.evidenceIds
        )}`;
      }),
    criteria.length ? "" : "- Define weighted criteria to run this simulation.\n",
    "## 8. Win themes and discriminator credibility",
    ...(advantages.length
      ? advantages.map(
          item =>
            `- Candidate win theme — **${item.criterion.name}:** connect the customer priority to measurable proof. Current classification: ${item.criterion.classification}. ${citation(item.references)}`
        )
      : ["- No evidence-supported scored advantage is ready to become a win theme."]),
    "",
    "## 9. Counter-positioning and mitigation",
    ...(vulnerabilities.length
      ? vulnerabilities.map(
          item =>
            `- **${item.criterion.name}:** validate whether the gap is real, then mitigate the capability deficit, strengthen teaming, or provide customer-relevant proof.`
        )
      : ["- Focus on validating assumptions and strengthening proof for high-weight criteria."]),
    ...competitors
      .filter(item => item.counterMoves)
      .map(item => `- Against **${item.name}:** ${item.counterMoves}`),
    "",
    "## 10. Risks, assumptions, and intelligence gaps",
    ...scores.gateWarnings.map(item => `- Critical gate: ${item} is currently scored below 3.`),
    ...conflicts.map(item => `- Conflicting evidence exists for ${item.name}; confidence is reduced.`),
    ...intelligenceGaps.map(
      item =>
        `- ${item.name}: obtain direct customer or competitor evidence and document a score rationale.`
    ),
    !scores.gateWarnings.length && !conflicts.length && !intelligenceGaps.length
      ? "- No structural risk flags were triggered; validate material judgments before use."
      : "",
    "",
    "## 11. Prioritized action plan",
    ...(actions.length
      ? actions
          .slice()
          .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
          .map(
            item =>
              `- [${item.status === "Complete" ? "x" : " "}] **${item.priority}:** ${item.title} — ${item.owner || "Unassigned"}; due ${item.due || "TBD"}`
          )
      : ["- Assign owners to close the highest-weight intelligence and proof gaps."]),
    "",
    "## 12. Session record",
    `- Question: ${session.question || "Not recorded"}`,
    `- Participants: ${session.participants || "Not recorded"}`,
    `- Notes: ${session.notes || "Not recorded"}`,
    "",
    "## Appendix A. Evidence register",
    ...evidence.map(
      item =>
        `- **[${item.citation}] ${item.title}** — ${item.source}; ${item.classification}; ${item.confidence} confidence; stance: ${item.stance}. ${item.note}${item.url ? ` Source: ${item.url}` : ""}`
    ),
    evidence.length ? "" : "- No evidence records were entered.",
    "## Appendix B. Methodology",
    "Scores use a 1-5 scale. Confidence factors are Confirmed 1.00, Inference 0.75, Hypothesis 0.50, Conflicting 0.35, and Missing 0.00. Effective scores shrink uncertain judgments toward neutral (3). Normalized weighted means are converted to a 0-100 Competitive Position Index.",
    "",
    "## Verification guardrail",
    "This output is a structured analysis of locally entered data, not an external intelligence product. Verify consequential claims, permissions, and classifications before use."
  ].filter(line => line !== undefined);

  const output = lines.join("\n");
  const sections = splitMarkdownSections(output);
  return {
    title: `Black Hat Competitive Analysis: ${pursuit.name}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    date,
    version: 1,
    status: reportStatus,
    playbook: session.playbook || pursuit.playbook || "Competitive assessment",
    question: session.question || "",
    facilitator: session.facilitator || "",
    participants: session.participants || "",
    notes: session.notes || "",
    reviewer: "",
    approvalNote: "",
    sourceHash: workspaceInputHash(workspace, pursuitId),
    scoreSummary: scores,
    sections,
    output,
    revisions: []
  };
}

export function workspaceInputHash(workspace, pursuitId) {
  const input = JSON.stringify({
    pursuit: workspace.pursuits.find(item => item.id === pursuitId),
    criteria: workspace.criteria.filter(item => item.pursuitId === pursuitId),
    evidence: workspace.evidence.filter(item => item.pursuitId === pursuitId),
    competitors: workspace.competitors.filter(item => item.pursuitId === pursuitId),
    actions: workspace.actions.filter(item => item.pursuitId === pursuitId)
  });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function splitMarkdownSections(markdown) {
  const sections = [];
  let current = { heading: "Cover", generatedText: "", editedText: "", dirty: false };
  for (const line of String(markdown).split("\n")) {
    if (line.startsWith("## ")) {
      if (current.generatedText.trim()) sections.push(current);
      current = {
        heading: line.slice(3),
        generatedText: `${line}\n`,
        editedText: "",
        dirty: false
      };
    } else {
      current.generatedText += `${line}\n`;
    }
  }
  if (current.generatedText.trim()) sections.push(current);
  return sections;
}

export function markdownToWordHtml(markdown, title) {
  const html = [];
  let inList = false;
  const lines = String(markdown).split("\n");
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = escapeHtml(raw);
    const headerCells = markdownTableCells(raw);
    const dividerCells = markdownTableCells(lines[index + 1]);
    if (
      headerCells &&
      dividerCells &&
      headerCells.length === dividerCells.length &&
      dividerCells.every(cell => /^:?-{3,}:?$/.test(cell))
    ) {
      closeList();
      const bodyRows = [];
      index += 2;
      while (index < lines.length) {
        const cells = markdownTableCells(lines[index]);
        if (!cells || cells.length !== headerCells.length) break;
        bodyRows.push(cells);
        index += 1;
      }
      index -= 1;
      html.push(
        `<table><thead><tr>${headerCells
          .map(cell => `<th scope="col">${inlineMarkdown(escapeHtml(cell))}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows
          .map(
            cells =>
              `<tr>${cells
                .map(cell => `<td>${inlineMarkdown(escapeHtml(cell))}</td>`)
                .join("")}</tr>`
          )
          .join("")}</tbody></table>`
      );
    } else if (raw.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (raw.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (raw.startsWith("# ")) {
      closeList();
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (/^- /.test(raw)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
    } else if (raw.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    } else if (raw.trim()) {
      closeList();
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>body{font-family:Arial,sans-serif;color:#171327;line-height:1.45;margin:48px}h1{color:#442c81}h2{border-bottom:1px solid #ccc;padding-bottom:4px}blockquote{background:#eef8fc;border-left:4px solid #29aae1;padding:10px}table{border-collapse:collapse;width:100%;margin:16px 0;font-size:9pt}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eef8fc}</style></head><body>${html.join(
    ""
  )}</body></html>`;
}

function markdownTableCells(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map(cell => cell.trim());
}

function scoreSubject(
  name,
  id,
  criteria,
  totalWeight,
  scoreFor,
  classificationFor,
  evidenceIdsFor,
  evidenceById
) {
  let weightedEffective = 0;
  let includedWeight = 0;
  let coveredWeight = 0;
  let confidenceWeight = 0;
  const details = [];

  for (const criterion of criteria) {
    const weight = positive(criterion.weight);
    const rawScore = numericScore(scoreFor(criterion));
    const evidenceIds = uniqueStrings(evidenceIdsFor(criterion));
    const linkedEvidence = evidenceIds.map(item => evidenceById.get(item)).filter(Boolean);
    let classification = classificationFor(criterion) || "Missing";
    const stances = new Set(linkedEvidence.map(item => item.stance));
    if (stances.has("Support") && stances.has("Challenge")) classification = "Conflicting";
    if (classification === "Confirmed" && !linkedEvidence.length) classification = "Inference";
    const factor = rawScore === null ? 0 : CONFIDENCE_FACTORS[classification] ?? 0.5;
    const effectiveScore = rawScore === null ? 3 : 3 + (rawScore - 3) * factor;
    if (rawScore !== null) {
      weightedEffective += effectiveScore * weight;
      includedWeight += weight;
    }
    if (rawScore !== null && linkedEvidence.length) coveredWeight += weight;
    confidenceWeight += factor * weight;
    details.push({
      criterionId: criterion.id,
      rawScore,
      effectiveScore: round(effectiveScore, 2),
      classification,
      evidenceIds
    });
  }

  const denominator = totalWeight || includedWeight;
  const weightedMean = includedWeight ? weightedEffective / includedWeight : null;
  return {
    id,
    name,
    cpi: weightedMean === null ? null : round(25 * (weightedMean - 1), 1),
    includedWeight,
    coverage: denominator ? round((coveredWeight / denominator) * 100, 0) : 0,
    confidence: denominator ? round((confidenceWeight / denominator) * 100, 0) : 0,
    details
  };
}

function scoreMatrix(criteria, scores, competitors, citation) {
  if (!criteria.length) return "No weighted criteria have been entered.";
  const headers = ["Criterion", "Weight", "Our team", ...competitors.map(item => item.name)];
  const divider = headers.map(() => "---");
  const rows = criteria.map(criterion => [
    `${criterion.name} ${citation(criterion.evidenceIds)}`.trim(),
    String(criterion.weight),
    displayScore(criterion.ourScore),
    ...competitors.map(item => displayScore(item.scores?.[criterion.id]))
  ]);
  const totals = [
    "CPI",
    "100 normalized",
    scores.us.cpi === null ? "Unknown" : String(scores.us.cpi),
    ...scores.competitors.map(item => (item.cpi === null ? "Unknown" : String(item.cpi)))
  ];
  return [headers, divider, ...rows, totals].map(row => `| ${row.join(" | ")} |`).join("\n");
}

function inlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(E-\d+)\]/g, "<code>[$1]</code>");
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
}

function uniqueStrings(value) {
  return [...new Set(asStringArray(value))];
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numericScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? number : null;
}

function displayScore(value) {
  const score = numericScore(value);
  return score === null ? "Unknown" : `${score}/5`;
}

function round(value, decimals) {
  const power = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function signed(value) {
  if (value === null || value === undefined) return "N/A";
  return value > 0 ? `+${value}` : String(value);
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function priorityRank(value) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[value] ?? 4;
}

function calculateScenarioEstimate(priorValue, margin, criticalGateGaps, coverage, confidence) {
  const prior = Math.max(0.05, Math.min(0.95, Number(priorValue || 50) / 100));
  const logit = Math.log(prior / (1 - prior));
  const raw = 1 / (1 + Math.exp(-(logit + 0.035 * margin - 0.4 * criticalGateGaps)));
  const trust = (coverage / 100) * (confidence / 100);
  const estimate = prior + (raw - prior) * trust;
  const value = Math.max(5, Math.min(95, Math.round((estimate * 100) / 5) * 5));
  const uncertainty = Math.round((10 + (1 - trust) * 25) / 5) * 5;
  return {
    value,
    low: Math.max(0, value - uncertainty),
    high: Math.min(100, value + uncertainty),
    prior: Math.round(prior * 100),
    trust: Math.round(trust * 100)
  };
}
