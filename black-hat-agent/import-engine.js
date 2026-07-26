import { validateWorkspace as defaultWorkspaceValidator } from "./engine.js";

export const IMPORT_LIMITS = Object.freeze({
  maxRows: 2_000,
  maxColumns: 100,
  maxCells: 100_000,
  maxCellCharacters: 10_000,
  maxPreviewRows: 100
});

const CLASSIFICATIONS = ["Confirmed", "Inference", "Hypothesis", "Conflicting", "Missing"];
const EVIDENCE_CLASSIFICATIONS = CLASSIFICATIONS.filter(value => value !== "Missing");

function field(key, label, options = {}) {
  return Object.freeze({
    key,
    label,
    type: "text",
    required: false,
    aliases: [],
    ...options
  });
}

export const IMPORT_TARGETS = Object.freeze({
  pursuits: Object.freeze({
    key: "pursuits",
    label: "Pursuits",
    description: "Create or update opportunity records.",
    replaceAllowed: false,
    modes: Object.freeze(["append", "upsert"]),
    fields: Object.freeze([
      field("name", "Opportunity name", {
        required: true,
        aliases: ["name", "opportunity", "opportunity name", "pursuit", "pursuit name"]
      }),
      field("customer", "Customer", {
        required: true,
        aliases: ["customer", "customer name", "client", "agency"]
      }),
      field("stage", "Stage", { aliases: ["stage", "capture stage", "phase"] }),
      field("status", "Status", { aliases: ["status", "opportunity status"] }),
      field("owner", "Owner", { aliases: ["owner", "capture owner", "lead"] }),
      field("review", "Next review", {
        type: "date",
        aliases: ["review", "next review", "review date"]
      }),
      field("decisionDate", "Decision date", {
        type: "date",
        aliases: ["decision date", "award date", "decision"]
      }),
      field("contractValue", "Contract value", {
        aliases: ["contract value", "value", "estimated value"]
      }),
      field("playbook", "Playbook", { aliases: ["playbook", "analysis playbook"] }),
      field("summary", "Summary", {
        aliases: ["summary", "description", "opportunity summary"]
      }),
      field("ourPosition", "Our position", {
        aliases: ["our position", "position", "current position"]
      }),
      field("procurementContext", "Procurement context", {
        aliases: ["procurement context", "acquisition context", "procurement"]
      }),
      field("priorEstimate", "Prior estimate", {
        type: "number",
        aliases: ["prior estimate", "baseline estimate", "win estimate", "pwin"]
      }),
      field("archived", "Archived", {
        type: "boolean",
        aliases: ["archived", "archive", "is archived"]
      })
    ])
  }),
  criteria: Object.freeze({
    key: "criteria",
    label: "Evaluation criteria",
    description: "Import weighted customer evaluation criteria for one pursuit.",
    replaceAllowed: true,
    modes: Object.freeze(["append", "upsert", "replace"]),
    fields: Object.freeze([
      field("name", "Criterion name", {
        required: true,
        aliases: ["criterion", "criterion name", "criteria", "evaluation criterion", "name"]
      }),
      field("category", "Category", {
        aliases: ["category", "criterion category", "evaluation category"]
      }),
      field("description", "Description", {
        aliases: ["description", "customer priority", "criterion description"]
      }),
      field("weight", "Weight", {
        type: "number",
        required: true,
        aliases: ["weight", "weight percent", "weighting", "importance"]
      }),
      field("ourScore", "Our score", {
        type: "number",
        aliases: ["our score", "team score", "score", "self score"]
      }),
      field("classification", "Classification", {
        type: "enum",
        options: CLASSIFICATIONS,
        aliases: ["classification", "claim classification", "confidence class"]
      }),
      field("rationale", "Rationale", {
        aliases: ["rationale", "score rationale", "reason"]
      }),
      field("evidenceRefs", "Supporting evidence", {
        type: "references",
        virtual: true,
        aliases: [
          "evidence",
          "evidence refs",
          "evidence references",
          "citations",
          "supporting evidence"
        ]
      }),
      field("isGate", "Critical gate", {
        type: "boolean",
        aliases: ["critical gate", "gate", "is gate", "mandatory"]
      })
    ])
  }),
  evidence: Object.freeze({
    key: "evidence",
    label: "Evidence",
    description: "Import source-linked evidence and connect it to existing criteria.",
    replaceAllowed: true,
    modes: Object.freeze(["append", "upsert", "replace"]),
    fields: Object.freeze([
      field("citation", "Existing citation", {
        virtual: true,
        aliases: ["citation", "citation id", "evidence id", "evidence reference"]
      }),
      field("title", "Evidence title", {
        required: true,
        aliases: ["title", "evidence", "evidence title", "claim", "claim title"]
      }),
      field("source", "Source", {
        required: true,
        aliases: ["source", "source name", "origin"]
      }),
      field("url", "Source URL", {
        type: "url",
        aliases: ["url", "source url", "link", "source link"]
      }),
      field("type", "Source type", {
        type: "enum",
        options: ["Customer", "Competitor", "Market", "Internal", "Other"],
        aliases: ["type", "source type", "evidence type"]
      }),
      field("publishedAt", "Published or observed date", {
        type: "date",
        aliases: ["published", "published date", "observed date", "date", "published at"]
      }),
      field("confidence", "Confidence", {
        type: "enum",
        options: ["High", "Medium", "Low"],
        aliases: ["confidence", "confidence level"]
      }),
      field("classification", "Classification", {
        type: "enum",
        options: EVIDENCE_CLASSIFICATIONS,
        aliases: ["classification", "claim classification"]
      }),
      field("stance", "Stance", {
        type: "enum",
        options: ["Support", "Challenge", "Context", "Neutral"],
        aliases: ["stance", "position", "evidence stance"]
      }),
      field("note", "Note", {
        aliases: ["note", "notes", "excerpt", "observation", "analyst note"]
      }),
      field("criterionRefs", "Linked criteria", {
        type: "references",
        virtual: true,
        aliases: [
          "criteria",
          "criterion refs",
          "criterion references",
          "linked criteria",
          "evaluation criteria"
        ]
      })
    ])
  }),
  competitors: Object.freeze({
    key: "competitors",
    label: "Competitors",
    description: "Import competitor profiles for one pursuit.",
    replaceAllowed: true,
    modes: Object.freeze(["append", "upsert", "replace"]),
    fields: Object.freeze([
      field("name", "Competitor name", {
        required: true,
        aliases: ["name", "competitor", "competitor name", "company", "bidder"]
      }),
      field("position", "Competitive role", {
        aliases: ["position", "role", "competitive role"]
      }),
      field("incumbent", "Incumbent", {
        type: "boolean",
        aliases: ["incumbent", "is incumbent", "status quo"]
      }),
      field("bidLikelihood", "Bid likelihood", {
        type: "enum",
        options: ["Very likely", "Likely", "Possible", "Unlikely", "Unknown"],
        aliases: ["bid likelihood", "likelihood", "probability to bid"]
      }),
      field("strengths", "Strengths", {
        aliases: ["strengths", "advantages", "competitor strengths"]
      }),
      field("weaknesses", "Weaknesses", {
        aliases: ["weaknesses", "disadvantages", "competitor weaknesses"]
      }),
      field("strategy", "Likely strategy", {
        aliases: ["strategy", "likely strategy", "approach"]
      }),
      field("ghosting", "Ghosting themes", {
        aliases: ["ghosting", "ghosting themes", "likely ghosting themes"]
      }),
      field("counterMoves", "Counter-positioning", {
        aliases: ["counter moves", "countermoves", "counter positioning", "counter-positioning"]
      }),
      field("classification", "Classification", {
        type: "enum",
        options: EVIDENCE_CLASSIFICATIONS,
        aliases: ["classification", "assessment classification"]
      }),
      field("evidenceRefs", "Supporting evidence", {
        type: "references",
        virtual: true,
        aliases: [
          "evidence",
          "evidence refs",
          "evidence references",
          "citations",
          "supporting evidence"
        ]
      })
    ])
  }),
  competitorScores: Object.freeze({
    key: "competitorScores",
    label: "Competitor scores",
    description: "Set competitor scores against existing criteria.",
    replaceAllowed: false,
    modes: Object.freeze(["append", "upsert"]),
    fields: Object.freeze([
      field("competitor", "Competitor", {
        required: true,
        virtual: true,
        aliases: ["competitor", "competitor name", "company", "bidder"]
      }),
      field("criterion", "Criterion", {
        required: true,
        virtual: true,
        aliases: ["criterion", "criterion name", "evaluation criterion", "criteria"]
      }),
      field("score", "Score", {
        type: "number",
        required: true,
        virtual: true,
        aliases: ["score", "rating", "competitor score"]
      })
    ])
  }),
  actions: Object.freeze({
    key: "actions",
    label: "Actions",
    description: "Import mitigation and intelligence actions for one pursuit.",
    replaceAllowed: true,
    modes: Object.freeze(["append", "upsert", "replace"]),
    fields: Object.freeze([
      field("title", "Action", {
        required: true,
        aliases: ["action", "action title", "title", "task"]
      }),
      field("owner", "Owner", {
        aliases: ["owner", "action owner", "assignee"]
      }),
      field("due", "Due date", {
        type: "date",
        aliases: ["due", "due date", "deadline"]
      }),
      field("status", "Status", {
        type: "enum",
        options: ["Open", "In progress", "Blocked", "Complete"],
        aliases: ["status", "action status"]
      }),
      field("priority", "Priority", {
        type: "enum",
        options: ["Critical", "High", "Medium", "Low"],
        aliases: ["priority", "severity"]
      }),
      field("finding", "Finding or gap", {
        aliases: ["finding", "gap", "finding or gap", "reason", "description"]
      })
    ])
  })
});

const RECORD_DEFAULTS = Object.freeze({
  pursuits: Object.freeze({
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
  }),
  criteria: Object.freeze({
    category: "Technical",
    description: "",
    weight: 10,
    ourScore: "",
    classification: "Hypothesis",
    rationale: "",
    evidenceIds: [],
    isGate: false
  }),
  evidence: Object.freeze({
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
    attachmentData: ""
  }),
  competitors: Object.freeze({
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
    scores: {}
  }),
  actions: Object.freeze({
    owner: "",
    due: "",
    status: "Open",
    priority: "Medium",
    finding: ""
  })
});

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function suggestColumnMapping(target, headers) {
  const metadata = IMPORT_TARGETS[target];
  if (!metadata) throw new Error(`Unsupported import target: ${target}.`);
  if (!Array.isArray(headers)) throw new TypeError("Headers must be an array.");

  const normalizedHeaders = headers.map(normalizeHeader);
  const used = new Set();
  const mapping = {};
  const matches = [];

  for (const definition of metadata.fields) {
    const aliases = [definition.key, definition.label, ...definition.aliases].map(normalizeHeader);
    const index = normalizedHeaders.findIndex(
      (header, columnIndex) => header && !used.has(columnIndex) && aliases.includes(header)
    );
    if (index >= 0) {
      mapping[definition.key] = index;
      used.add(index);
      matches.push({
        field: definition.key,
        columnIndex: index,
        header: String(headers[index] ?? "")
      });
    }
  }

  return {
    mapping,
    matches,
    unmatchedHeaders: headers
      .map((header, columnIndex) => ({ header: String(header ?? ""), columnIndex }))
      .filter(item => !used.has(item.columnIndex)),
    missingRequired: metadata.fields
      .filter(definition => definition.required && mapping[definition.key] === undefined)
      .map(definition => definition.key)
  };
}

export function buildTableFromMatrix(matrix, options = {}) {
  if (!Array.isArray(matrix)) throw new TypeError("Spreadsheet data must be an array of rows.");
  const headerRow = Number.isInteger(options.headerRow) ? options.headerRow : 0;
  if (headerRow < 0 || headerRow >= matrix.length) {
    if (!matrix.length && headerRow === 0) return { headers: [], rows: [], duplicateHeaders: [] };
    throw new RangeError("Header row is outside the spreadsheet data.");
  }
  if (matrix.length > IMPORT_LIMITS.maxRows + headerRow + 1) {
    throw new RangeError(`Spreadsheet exceeds the ${IMPORT_LIMITS.maxRows.toLocaleString()} row limit.`);
  }

  const sourceHeaders = Array.isArray(matrix[headerRow]) ? matrix[headerRow] : [];
  if (sourceHeaders.length > IMPORT_LIMITS.maxColumns) {
    throw new RangeError(
      `Spreadsheet exceeds the ${IMPORT_LIMITS.maxColumns.toLocaleString()} column limit.`
    );
  }
  const headers = sourceHeaders.map(value => cellToText(value));
  const rows = matrix.slice(headerRow + 1).map(row => {
    if (!Array.isArray(row)) throw new TypeError("Every spreadsheet row must be an array.");
    if (row.length > IMPORT_LIMITS.maxColumns) {
      throw new RangeError(
        `Spreadsheet exceeds the ${IMPORT_LIMITS.maxColumns.toLocaleString()} column limit.`
      );
    }
    return Array.from({ length: headers.length }, (_, index) => row[index] ?? "");
  });
  enforceCellLimit(headers, rows);

  const counts = new Map();
  for (const header of headers.map(normalizeHeader).filter(Boolean)) {
    counts.set(header, (counts.get(header) || 0) + 1);
  }
  const duplicateHeaders = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([header]) => header);

  return { headers, rows, duplicateHeaders };
}

export function parseCsv(text, options = {}) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text.");
  const delimiter = options.delimiter ?? ",";
  const headerRow = Number.isInteger(options.headerRow) && options.headerRow >= 0
    ? options.headerRow
    : 0;
  const maximumSourceRows = IMPORT_LIMITS.maxRows + headerRow + 1;
  if (typeof delimiter !== "string" || delimiter.length !== 1 || /[\r\n"]/.test(delimiter)) {
    throw new TypeError("CSV delimiter must be one non-quote character.");
  }

  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;
  let cells = 0;

  const pushValue = () => {
    if (value.length > IMPORT_LIMITS.maxCellCharacters) {
      throw new RangeError(
        `A CSV cell exceeds the ${IMPORT_LIMITS.maxCellCharacters.toLocaleString()} character limit.`
      );
    }
    row.push(value);
    value = "";
    cells += 1;
    if (row.length > IMPORT_LIMITS.maxColumns) {
      throw new RangeError(`CSV exceeds the ${IMPORT_LIMITS.maxColumns} column limit.`);
    }
    if (cells > IMPORT_LIMITS.maxCells) {
      throw new RangeError(`CSV exceeds the ${IMPORT_LIMITS.maxCells.toLocaleString()} cell limit.`);
    }
  };

  const pushRow = () => {
    matrix.push(row);
    row = [];
    if (matrix.length > maximumSourceRows) {
      throw new RangeError(`CSV exceeds the ${IMPORT_LIMITS.maxRows.toLocaleString()} row limit.`);
    }
  };

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value === "") {
      quoted = true;
    } else if (character === delimiter) {
      pushValue();
    } else if (character === "\n" || character === "\r") {
      pushValue();
      pushRow();
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (value !== "" || row.length || !matrix.length) {
    pushValue();
    pushRow();
  }
  if (
    matrix.length > 1 &&
    matrix[matrix.length - 1].every(item => item === "") &&
    /[\r\n]$/.test(source)
  ) {
    matrix.pop();
  }
  return buildTableFromMatrix(matrix, options);
}

export function buildImportPlan({
  workspace,
  target,
  headers,
  rows,
  mapping,
  pursuitId = "",
  mode = "append",
  rowNumberOffset = 1,
  idFactory,
  validator = defaultWorkspaceValidator
}) {
  const diagnostics = [];
  const preview = [];
  const metadata = IMPORT_TARGETS[target];
  const normalizedMode = String(mode || "").toLowerCase();
  const summary = {
    target,
    mode: normalizedMode,
    totalRows: Array.isArray(rows) ? rows.length : 0,
    processedRows: 0,
    blankRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    replaced: 0,
    errors: 0,
    warnings: 0
  };

  if (!metadata) {
    addDiagnostic(diagnostics, "error", "unsupported_target", `Unsupported import target: ${target}.`);
    return finalizePlan(null, diagnostics, summary, preview);
  }
  if (!["append", "upsert", "replace"].includes(normalizedMode)) {
    addDiagnostic(diagnostics, "error", "unsupported_mode", `Unsupported import mode: ${mode}.`);
  }
  if (normalizedMode === "replace" && !metadata.replaceAllowed) {
    addDiagnostic(
      diagnostics,
      "error",
      "replace_not_allowed",
      `Replace mode is not available for ${metadata.label.toLowerCase()}.`
    );
  }
  if (!isWorkspaceShape(workspace)) {
    addDiagnostic(diagnostics, "error", "invalid_workspace", "The current workspace is invalid.");
  }
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    addDiagnostic(
      diagnostics,
      "error",
      "invalid_table",
      "Import headers and rows must both be arrays."
    );
  }
  if (Array.isArray(headers) && headers.length > IMPORT_LIMITS.maxColumns) {
    addDiagnostic(
      diagnostics,
      "error",
      "column_limit",
      `Import exceeds the ${IMPORT_LIMITS.maxColumns.toLocaleString()} column limit.`
    );
  }
  if (Array.isArray(rows) && rows.length > IMPORT_LIMITS.maxRows) {
    addDiagnostic(
      diagnostics,
      "error",
      "row_limit",
      `Import exceeds the ${IMPORT_LIMITS.maxRows.toLocaleString()} row limit.`
    );
  }
  if (Array.isArray(headers) && Array.isArray(rows)) {
    try {
      enforceCellLimit(headers, rows);
    } catch (error) {
      addDiagnostic(diagnostics, "error", "cell_limit", error.message);
    }
  }
  if (hasErrors(diagnostics)) return finalizePlan(null, diagnostics, summary, preview);

  const selectedPursuit =
    target === "pursuits" ? null : workspace.pursuits.find(item => item.id === pursuitId);
  if (target !== "pursuits" && !selectedPursuit) {
    addDiagnostic(
      diagnostics,
      "error",
      "missing_pursuit",
      "Select an existing pursuit before importing this record type."
    );
  }

  const resolvedMapping = resolveMapping(metadata, headers, mapping, diagnostics);
  if (!rows.some(row => !rowIsBlank(row, headers))) {
    addDiagnostic(diagnostics, "error", "no_data_rows", "The import contains no data rows.");
  }
  if (hasErrors(diagnostics)) return finalizePlan(null, diagnostics, summary, preview);

  const nextWorkspace = clonePlain(workspace);
  const freshId = createIdAllocator(nextWorkspace, idFactory, diagnostics);
  if (normalizedMode === "replace") {
    summary.replaced = removeScopedRecords(nextWorkspace, target, pursuitId);
  }

  const seenInputKeys = new Set();
  const sourceRowOffset =
    Number.isInteger(rowNumberOffset) && rowNumberOffset >= 1 ? rowNumberOffset : 1;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const sourceRow = rows[rowIndex];
    const rowNumber = rowIndex + sourceRowOffset + 1;
    if (rowIsBlank(sourceRow, headers)) {
      summary.blankRows += 1;
      continue;
    }
    summary.processedRows += 1;
    const beforeErrorCount = diagnostics.filter(item => item.severity === "error").length;
    const parsed = parseMappedRow(
      metadata,
      headers,
      sourceRow,
      resolvedMapping,
      rowNumber,
      diagnostics
    );
    if (diagnostics.filter(item => item.severity === "error").length > beforeErrorCount) continue;

    if (target === "competitorScores") {
      importScoreRow({
        workspace: nextWorkspace,
        values: parsed.values,
        pursuitId,
        mode: normalizedMode,
        rowNumber,
        diagnostics,
        preview,
        summary,
        seenInputKeys
      });
      continue;
    }

    importRecordRow({
      workspace: nextWorkspace,
      target,
      values: parsed.values,
      present: parsed.present,
      pursuitId,
      mode: normalizedMode,
      rowNumber,
      diagnostics,
      preview,
      summary,
      seenInputKeys,
      freshId
    });
  }

  if (!hasErrors(diagnostics)) {
    reconcileReciprocalLinks(nextWorkspace);
    const validationResult =
      typeof validator === "function"
        ? validator(nextWorkspace)
        : { valid: false, errors: ["A workspace validator is required."] };
    if (!validationResult?.valid) {
      for (const message of validationResult?.errors || ["Workspace validation failed."]) {
        addDiagnostic(diagnostics, "error", "workspace_validation", String(message));
      }
    }
  }

  return finalizePlan(hasErrors(diagnostics) ? null : nextWorkspace, diagnostics, summary, preview);
}

function resolveMapping(metadata, headers, suppliedMapping, diagnostics) {
  const suggestion = suggestColumnMapping(metadata.key, headers);
  const source =
    suppliedMapping && typeof suppliedMapping === "object" && suppliedMapping.mapping
      ? suppliedMapping.mapping
      : suppliedMapping && typeof suppliedMapping === "object"
        ? suppliedMapping
        : suggestion.mapping;
  const mapping = {};
  const definitions = new Set(metadata.fields.map(item => item.key));

  for (const definition of metadata.fields) {
    const reference = source[definition.key];
    const columnIndex = resolveColumnReference(reference, headers);
    if (columnIndex >= 0) mapping[definition.key] = columnIndex;
    else if (reference !== undefined && reference !== null && reference !== "") {
      addDiagnostic(
        diagnostics,
        "error",
        "missing_column",
        `The mapped column for ${definition.label} does not exist.`,
        null,
        definition.key
      );
    }
  }

  // Also accept a reverse map: column index/header -> canonical field.
  for (const [columnReference, fieldKey] of Object.entries(source)) {
    if (!definitions.has(fieldKey) || mapping[fieldKey] !== undefined) continue;
    const columnIndex = resolveColumnReference(columnReference, headers);
    if (columnIndex >= 0) mapping[fieldKey] = columnIndex;
  }

  const usedColumns = new Map();
  for (const [fieldKey, columnIndex] of Object.entries(mapping)) {
    if (usedColumns.has(columnIndex)) {
      addDiagnostic(
        diagnostics,
        "error",
        "duplicate_mapping",
        `One source column is mapped to both ${usedColumns.get(columnIndex)} and ${fieldKey}.`,
        null,
        fieldKey
      );
    } else {
      usedColumns.set(columnIndex, fieldKey);
    }
  }

  for (const definition of metadata.fields.filter(item => item.required)) {
    if (mapping[definition.key] === undefined) {
      addDiagnostic(
        diagnostics,
        "error",
        "required_mapping",
        `Map a column to ${definition.label}.`,
        null,
        definition.key
      );
    }
  }
  return mapping;
}

function resolveColumnReference(reference, headers) {
  if (Number.isInteger(reference)) {
    return reference >= 0 && reference < headers.length ? reference : -1;
  }
  if (typeof reference !== "string") return -1;
  if (/^\d+$/.test(reference) && Number(reference) < headers.length) return Number(reference);
  const normalized = normalizeHeader(reference);
  return headers.findIndex(header => normalizeHeader(header) === normalized);
}

function parseMappedRow(metadata, headers, row, mapping, rowNumber, diagnostics) {
  const values = Object.create(null);
  const present = new Set();
  for (const definition of metadata.fields) {
    const columnIndex = mapping[definition.key];
    if (columnIndex === undefined) continue;
    present.add(definition.key);
    const raw = getCell(row, headers, columnIndex);
    const parsed = parseFieldValue(definition, raw, rowNumber, diagnostics);
    values[definition.key] = parsed;
  }
  for (const definition of metadata.fields.filter(item => item.required)) {
    if (isBlank(values[definition.key])) {
      addDiagnostic(
        diagnostics,
        "error",
        "required_value",
        `${definition.label} is required.`,
        rowNumber,
        definition.key
      );
    }
  }
  validateTargetValues(metadata.key, values, rowNumber, diagnostics);
  return { values, present };
}

function parseFieldValue(definition, raw, rowNumber, diagnostics) {
  if (definition.type === "references") return splitReferences(raw);
  if (definition.type === "boolean") {
    if (isBlank(raw)) return false;
    const normalized = normalizeHeader(raw);
    if (["true", "yes", "y", "1", "x", "checked"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "unchecked"].includes(normalized)) return false;
    addDiagnostic(
      diagnostics,
      "error",
      "invalid_boolean",
      `${definition.label} must be yes/no or true/false.`,
      rowNumber,
      definition.key
    );
    return false;
  }
  if (definition.type === "number") {
    if (isBlank(raw)) return "";
    const number = typeof raw === "number" ? raw : Number(String(raw).replace(/[,%$]/g, "").trim());
    if (!Number.isFinite(number)) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_number",
        `${definition.label} must be a number.`,
        rowNumber,
        definition.key
      );
      return "";
    }
    return number;
  }
  if (definition.type === "date") {
    if (isBlank(raw)) return "";
    const date = normalizeDate(raw);
    if (!date) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_date",
        `${definition.label} must be a valid date (YYYY-MM-DD or M/D/YYYY).`,
        rowNumber,
        definition.key
      );
      return "";
    }
    return date;
  }

  const text = cellToText(raw);
  if (text.length > IMPORT_LIMITS.maxCellCharacters) {
    addDiagnostic(
      diagnostics,
      "error",
      "cell_too_long",
      `${definition.label} exceeds the character limit.`,
      rowNumber,
      definition.key
    );
  }
  if (definition.type === "url" && text) {
    try {
      const url = new URL(text);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol.");
    } catch {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_url",
        `${definition.label} must use an http or https URL.`,
        rowNumber,
        definition.key
      );
    }
  }
  if (definition.type === "enum" && text) {
    const match = definition.options.find(option => normalizeHeader(option) === normalizeHeader(text));
    if (!match) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_enum",
        `${definition.label} must be one of: ${definition.options.join(", ")}.`,
        rowNumber,
        definition.key
      );
      return text;
    }
    return match;
  }
  return text;
}

function validateTargetValues(target, values, rowNumber, diagnostics) {
  if (target === "pursuits" && values.priorEstimate !== "" && values.priorEstimate !== undefined) {
    if (values.priorEstimate < 5 || values.priorEstimate > 95) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_prior_estimate",
        "Prior estimate must be between 5 and 95.",
        rowNumber,
        "priorEstimate"
      );
    }
  }
  if (target === "criteria") {
    if (!Number.isFinite(values.weight) || values.weight <= 0 || values.weight > 100) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_weight",
        "Weight must be greater than 0 and no more than 100.",
        rowNumber,
        "weight"
      );
    }
    if (
      values.ourScore !== "" &&
      values.ourScore !== undefined &&
      (!Number.isInteger(values.ourScore) || values.ourScore < 1 || values.ourScore > 5)
    ) {
      addDiagnostic(
        diagnostics,
        "error",
        "invalid_score",
        "Our score must be a whole number from 1 to 5 or blank.",
        rowNumber,
        "ourScore"
      );
    }
  }
  if (
    target === "competitorScores" &&
    (!Number.isInteger(values.score) || values.score < 1 || values.score > 5)
  ) {
    addDiagnostic(
      diagnostics,
      "error",
      "invalid_score",
      "Competitor score must be a whole number from 1 to 5.",
      rowNumber,
      "score"
    );
  }
}

function importRecordRow({
  workspace,
  target,
  values,
  present,
  pursuitId,
  mode,
  rowNumber,
  diagnostics,
  preview,
  summary,
  seenInputKeys,
  freshId
}) {
  const effectivePursuitId = target === "pursuits" ? "" : pursuitId;
  const key = logicalKey(target, values);
  if (!key) {
    addDiagnostic(
      diagnostics,
      "error",
      "missing_identity",
      "The row does not contain a usable record identity.",
      rowNumber
    );
    return;
  }
  if (seenInputKeys.has(key)) {
    summary.skipped += 1;
    addDiagnostic(
      diagnostics,
      "warning",
      "duplicate_input",
      "A duplicate row in this file was skipped.",
      rowNumber
    );
    pushPreview(preview, {
      rowNumber,
      operation: "skip",
      identity: displayIdentity(target, values)
    });
    return;
  }
  seenInputKeys.add(key);

  const matches = findMatchingRecords(workspace, target, values, effectivePursuitId);
  if (matches.length > 1) {
    addDiagnostic(
      diagnostics,
      "error",
      "ambiguous_match",
      `The row matches more than one existing ${singularTarget(target)}.`,
      rowNumber
    );
    return;
  }
  const existing = matches[0];
  if (existing && mode === "append") {
    summary.skipped += 1;
    addDiagnostic(
      diagnostics,
      "warning",
      "existing_match",
      `An existing ${singularTarget(target)} matched this row and was skipped.`,
      rowNumber
    );
    pushPreview(preview, {
      rowNumber,
      operation: "skip",
      identity: displayIdentity(target, values),
      id: existing.id
    });
    return;
  }

  const referenceResult = resolveRecordReferences(
    workspace,
    target,
    values,
    effectivePursuitId,
    rowNumber,
    diagnostics
  );
  if (!referenceResult.valid) return;

  if (existing && mode === "upsert") {
    const patch = materialValues(target, values, present);
    Object.assign(existing, patch);
    applyResolvedReferences(workspace, target, existing, referenceResult);
    summary.updated += 1;
    pushPreview(preview, {
      rowNumber,
      operation: "update",
      identity: displayIdentity(target, values),
      id: existing.id,
      record: clonePlain(existing)
    });
    return;
  }

  const id = freshId(target, rowNumber);
  if (!id) return;
  const defaults = clonePlain(RECORD_DEFAULTS[target] || {});
  const record = {
    ...defaults,
    ...materialValues(target, values, present),
    id
  };
  if (target !== "pursuits") record.pursuitId = effectivePursuitId;
  if (target === "evidence") record.citation = nextEvidenceCitation(workspace, effectivePursuitId);
  applyResolvedReferences(workspace, target, record, referenceResult);
  workspace[target].push(record);
  summary.created += 1;
  pushPreview(preview, {
    rowNumber,
    operation: "create",
    identity: displayIdentity(target, values),
    id,
    record: clonePlain(record)
  });
}

function importScoreRow({
  workspace,
  values,
  pursuitId,
  mode,
  rowNumber,
  diagnostics,
  preview,
  summary,
  seenInputKeys
}) {
  const competitors = resolveByReference(workspace.competitors, values.competitor, pursuitId, [
    "name"
  ]);
  const criteria = resolveByReference(workspace.criteria, values.criterion, pursuitId, ["name"]);
  if (competitors.length !== 1) {
    addDiagnostic(
      diagnostics,
      "error",
      competitors.length ? "ambiguous_competitor" : "missing_competitor",
      competitors.length
        ? `Competitor reference "${values.competitor}" is ambiguous.`
        : `Competitor "${values.competitor}" was not found in the selected pursuit.`,
      rowNumber,
      "competitor"
    );
  }
  if (criteria.length !== 1) {
    addDiagnostic(
      diagnostics,
      "error",
      criteria.length ? "ambiguous_criterion" : "missing_criterion",
      criteria.length
        ? `Criterion reference "${values.criterion}" is ambiguous.`
        : `Criterion "${values.criterion}" was not found in the selected pursuit.`,
      rowNumber,
      "criterion"
    );
  }
  if (competitors.length !== 1 || criteria.length !== 1) return;

  const competitor = competitors[0];
  const criterion = criteria[0];
  const key = `${competitor.id}\u0000${criterion.id}`;
  if (seenInputKeys.has(key)) {
    summary.skipped += 1;
    addDiagnostic(
      diagnostics,
      "warning",
      "duplicate_input",
      "A duplicate competitor/criterion score row was skipped.",
      rowNumber
    );
    return;
  }
  seenInputKeys.add(key);

  competitor.scores =
    competitor.scores && typeof competitor.scores === "object" ? competitor.scores : {};
  const hasScore =
    Object.prototype.hasOwnProperty.call(competitor.scores, criterion.id) &&
    competitor.scores[criterion.id] !== "";
  if (hasScore && mode === "append") {
    summary.skipped += 1;
    addDiagnostic(
      diagnostics,
      "warning",
      "existing_match",
      "An existing competitor score matched this row and was skipped.",
      rowNumber
    );
    pushPreview(preview, {
      rowNumber,
      operation: "skip",
      identity: `${competitor.name} / ${criterion.name}`
    });
    return;
  }
  competitor.scores[criterion.id] = values.score;
  if (hasScore) summary.updated += 1;
  else summary.created += 1;
  pushPreview(preview, {
    rowNumber,
    operation: hasScore ? "update" : "create",
    identity: `${competitor.name} / ${criterion.name}`,
    competitorId: competitor.id,
    criterionId: criterion.id,
    score: values.score
  });
}

function materialValues(target, values, present) {
  const output = {};
  const metadata = IMPORT_TARGETS[target];
  for (const definition of metadata.fields) {
    if (!present.has(definition.key) || definition.virtual) continue;
    output[definition.key] = values[definition.key];
  }
  return output;
}

function resolveRecordReferences(workspace, target, values, pursuitId, rowNumber, diagnostics) {
  const result = { valid: true };
  if (target === "criteria" && Array.isArray(values.evidenceRefs)) {
    result.evidenceIds = resolveReferences(
      workspace.evidence,
      values.evidenceRefs,
      pursuitId,
      ["citation", "title"],
      "evidence",
      rowNumber,
      "evidenceRefs",
      diagnostics
    );
  }
  if (target === "evidence" && Array.isArray(values.criterionRefs)) {
    result.criterionIds = resolveReferences(
      workspace.criteria,
      values.criterionRefs,
      pursuitId,
      ["name"],
      "criterion",
      rowNumber,
      "criterionRefs",
      diagnostics
    );
  }
  if (target === "competitors" && Array.isArray(values.evidenceRefs)) {
    result.evidenceIds = resolveReferences(
      workspace.evidence,
      values.evidenceRefs,
      pursuitId,
      ["citation", "title"],
      "evidence",
      rowNumber,
      "evidenceRefs",
      diagnostics
    );
  }
  result.valid = !diagnostics.some(
    item => item.severity === "error" && item.row === rowNumber
  );
  return result;
}

function resolveReferences(
  collection,
  references,
  pursuitId,
  fields,
  label,
  rowNumber,
  fieldKey,
  diagnostics
) {
  const ids = [];
  for (const reference of references) {
    const matches = resolveByReference(collection, reference, pursuitId, fields);
    if (matches.length !== 1) {
      addDiagnostic(
        diagnostics,
        "error",
        matches.length ? "ambiguous_reference" : "missing_reference",
        matches.length
          ? `${capitalize(label)} reference "${reference}" is ambiguous.`
          : `${capitalize(label)} reference "${reference}" was not found in the selected pursuit.`,
        rowNumber,
        fieldKey
      );
      continue;
    }
    if (!ids.includes(matches[0].id)) ids.push(matches[0].id);
  }
  return ids;
}

function resolveByReference(collection, reference, pursuitId, fields) {
  const normalized = normalizeReference(reference);
  if (!normalized) return [];
  return collection.filter(record => {
    if (record.pursuitId !== pursuitId) return false;
    if (normalizeReference(record.id) === normalized) return true;
    return fields.some(fieldKey => normalizeReference(record[fieldKey]) === normalized);
  });
}

function applyResolvedReferences(workspace, target, record, references) {
  if (target === "criteria" && references.evidenceIds) {
    record.evidenceIds = [...references.evidenceIds];
    for (const evidence of workspace.evidence) {
      evidence.criterionIds = arrayOfStrings(evidence.criterionIds).filter(id => id !== record.id);
      if (record.evidenceIds.includes(evidence.id)) evidence.criterionIds.push(record.id);
    }
  }
  if (target === "evidence" && references.criterionIds) {
    record.criterionIds = [...references.criterionIds];
    for (const criterion of workspace.criteria) {
      criterion.evidenceIds = arrayOfStrings(criterion.evidenceIds).filter(id => id !== record.id);
      if (record.criterionIds.includes(criterion.id)) criterion.evidenceIds.push(record.id);
    }
  }
  if (target === "competitors" && references.evidenceIds) {
    record.evidenceIds = [...references.evidenceIds];
  }
}

function reconcileReciprocalLinks(workspace) {
  const criteria = new Map(workspace.criteria.map(item => [item.id, item]));
  const evidence = new Map(workspace.evidence.map(item => [item.id, item]));
  for (const criterion of workspace.criteria) {
    criterion.evidenceIds = arrayOfStrings(criterion.evidenceIds).filter(id => evidence.has(id));
  }
  for (const item of workspace.evidence) {
    item.criterionIds = arrayOfStrings(item.criterionIds).filter(id => criteria.has(id));
  }
  for (const criterion of workspace.criteria) {
    for (const evidenceId of criterion.evidenceIds) {
      const item = evidence.get(evidenceId);
      if (item?.pursuitId === criterion.pursuitId && !item.criterionIds.includes(criterion.id)) {
        item.criterionIds.push(criterion.id);
      }
    }
  }
  for (const item of workspace.evidence) {
    for (const criterionId of item.criterionIds) {
      const criterion = criteria.get(criterionId);
      if (criterion?.pursuitId === item.pursuitId && !criterion.evidenceIds.includes(item.id)) {
        criterion.evidenceIds.push(item.id);
      }
    }
  }
}

function findMatchingRecords(workspace, target, values, pursuitId) {
  if (target === "pursuits") {
    const key = `${normalizeIdentity(values.name)}\u0000${normalizeIdentity(values.customer)}`;
    return workspace.pursuits.filter(
      item =>
        `${normalizeIdentity(item.name)}\u0000${normalizeIdentity(item.customer)}` === key
    );
  }
  const collection = workspace[target];
  if (target === "evidence") {
    const citation = normalizeReference(values.citation);
    if (citation) {
      const citationMatches = collection.filter(
        item =>
          item.pursuitId === pursuitId && normalizeReference(item.citation) === citation
      );
      if (citationMatches.length) return citationMatches;
    }
    const key = `${normalizeIdentity(values.title)}\u0000${normalizeIdentity(values.source)}`;
    return collection.filter(
      item =>
        item.pursuitId === pursuitId &&
        `${normalizeIdentity(item.title)}\u0000${normalizeIdentity(item.source)}` === key
    );
  }
  const identityField = target === "actions" ? "title" : "name";
  const identity = normalizeIdentity(values[identityField]);
  return collection.filter(
    item =>
      item.pursuitId === pursuitId && normalizeIdentity(item[identityField]) === identity
  );
}

function logicalKey(target, values) {
  if (target === "pursuits") {
    return `${normalizeIdentity(values.name)}\u0000${normalizeIdentity(values.customer)}`;
  }
  if (target === "evidence") {
    return (
      normalizeReference(values.citation) ||
      `${normalizeIdentity(values.title)}\u0000${normalizeIdentity(values.source)}`
    );
  }
  return normalizeIdentity(values[target === "actions" ? "title" : "name"]);
}

function removeScopedRecords(workspace, target, pursuitId) {
  if (target === "criteria") {
    const removedIds = new Set(
      workspace.criteria.filter(item => item.pursuitId === pursuitId).map(item => item.id)
    );
    workspace.criteria = workspace.criteria.filter(item => item.pursuitId !== pursuitId);
    for (const evidence of workspace.evidence) {
      evidence.criterionIds = arrayOfStrings(evidence.criterionIds).filter(
        id => !removedIds.has(id)
      );
    }
    for (const competitor of workspace.competitors) {
      competitor.scores =
        competitor.scores && typeof competitor.scores === "object" ? competitor.scores : {};
      for (const criterionId of removedIds) delete competitor.scores[criterionId];
    }
    return removedIds.size;
  }
  if (target === "evidence") {
    const removedIds = new Set(
      workspace.evidence.filter(item => item.pursuitId === pursuitId).map(item => item.id)
    );
    workspace.evidence = workspace.evidence.filter(item => item.pursuitId !== pursuitId);
    for (const criterion of workspace.criteria) {
      criterion.evidenceIds = arrayOfStrings(criterion.evidenceIds).filter(
        id => !removedIds.has(id)
      );
    }
    for (const competitor of workspace.competitors) {
      competitor.evidenceIds = arrayOfStrings(competitor.evidenceIds).filter(
        id => !removedIds.has(id)
      );
    }
    return removedIds.size;
  }
  const removed = workspace[target].filter(item => item.pursuitId === pursuitId).length;
  workspace[target] = workspace[target].filter(item => item.pursuitId !== pursuitId);
  return removed;
}

function createIdAllocator(workspace, idFactory, diagnostics) {
  const used = new Set();
  for (const collectionName of [
    "pursuits",
    "criteria",
    "evidence",
    "competitors",
    "actions",
    "playbooks",
    "runs"
  ]) {
    for (const record of workspace[collectionName] || []) {
      if (record?.id) used.add(String(record.id));
    }
  }
  let fallbackCounter = 0;
  const factory =
    typeof idFactory === "function"
      ? idFactory
      : target => {
          if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
          fallbackCounter += 1;
          return `import-${target}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
        };

  return (target, rowNumber) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = String(factory(target, rowNumber, attempt) ?? "").trim();
      if (candidate && !used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    addDiagnostic(
      diagnostics,
      "error",
      "id_generation_failed",
      "A unique record identifier could not be generated.",
      rowNumber
    );
    return "";
  };
}

function nextEvidenceCitation(workspace, pursuitId) {
  const numbers = workspace.evidence
    .filter(item => item.pursuitId === pursuitId)
    .map(item => Number(String(item.citation || "").replace(/\D/g, "")))
    .filter(Number.isFinite);
  let number = numbers.length ? Math.max(...numbers) + 1 : 1;
  let citation = `E-${String(number).padStart(3, "0")}`;
  const used = new Set(
    workspace.evidence
      .filter(item => item.pursuitId === pursuitId)
      .map(item => normalizeReference(item.citation))
  );
  while (used.has(normalizeReference(citation))) {
    number += 1;
    citation = `E-${String(number).padStart(3, "0")}`;
  }
  return citation;
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 2_958_466) {
    const milliseconds = Math.round((value - 25_569) * 86_400_000);
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  }
  const text = cellToText(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validDateParts(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return validDateParts(match[3], match[1], match[2]);
  return "";
}

function validDateParts(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitReferences(value) {
  if (Array.isArray(value)) {
    return unique(value.map(cellToText).map(item => item.trim()).filter(Boolean));
  }
  return unique(
    cellToText(value)
      .split(/[;\n|,]+/)
      .map(item => item.trim())
      .filter(Boolean)
  );
}

function normalizeReference(value) {
  return normalizeIdentity(String(value ?? "").replace(/^\[|\]$/g, ""));
}

function normalizeIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
    return "";
  }
  return String(value).trim();
}

function getCell(row, headers, columnIndex) {
  if (Array.isArray(row)) return row[columnIndex];
  if (row && typeof row === "object") {
    if (Object.prototype.hasOwnProperty.call(row, columnIndex)) return row[columnIndex];
    return row[headers[columnIndex]];
  }
  return "";
}

function rowIsBlank(row, headers) {
  if (Array.isArray(row)) return row.every(isBlank);
  if (row && typeof row === "object") return headers.every(header => isBlank(row[header]));
  return true;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function enforceCellLimit(headers, rows) {
  const cells = headers.length * (rows.length + 1);
  if (cells > IMPORT_LIMITS.maxCells) {
    throw new RangeError(
      `Import exceeds the ${IMPORT_LIMITS.maxCells.toLocaleString()} cell limit.`
    );
  }
  for (const row of rows) {
    const values = Array.isArray(row)
      ? row
      : row && typeof row === "object"
        ? headers.map(header => row[header])
        : [];
    for (const value of values) {
      if (cellToText(value).length > IMPORT_LIMITS.maxCellCharacters) {
        throw new RangeError(
          `A cell exceeds the ${IMPORT_LIMITS.maxCellCharacters.toLocaleString()} character limit.`
        );
      }
    }
  }
}

function isWorkspaceShape(workspace) {
  return (
    workspace &&
    typeof workspace === "object" &&
    !Array.isArray(workspace) &&
    ["pursuits", "criteria", "evidence", "competitors", "actions", "playbooks", "runs"].every(
      name => Array.isArray(workspace[name])
    )
  );
}

function clonePlain(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function addDiagnostic(diagnostics, severity, code, message, row = null, fieldKey = null) {
  diagnostics.push({
    severity,
    code,
    message,
    ...(row === null ? {} : { row }),
    ...(fieldKey === null ? {} : { field: fieldKey })
  });
}

function hasErrors(diagnostics) {
  return diagnostics.some(item => item.severity === "error");
}

function finalizePlan(nextWorkspace, diagnostics, summary, preview) {
  summary.errors = diagnostics.filter(item => item.severity === "error").length;
  summary.warnings = diagnostics.filter(item => item.severity === "warning").length;
  return {
    valid: summary.errors === 0 && Boolean(nextWorkspace),
    diagnostics,
    summary,
    preview,
    nextWorkspace: summary.errors === 0 ? nextWorkspace : null
  };
}

function pushPreview(preview, item) {
  if (preview.length < IMPORT_LIMITS.maxPreviewRows) preview.push(item);
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? unique(value.map(item => String(item)).filter(Boolean))
    : [];
}

function unique(values) {
  return [...new Set(values)];
}

function singularTarget(target) {
  return {
    pursuits: "pursuit",
    criteria: "criterion",
    evidence: "evidence record",
    competitors: "competitor",
    actions: "action"
  }[target];
}

function displayIdentity(target, values) {
  if (target === "pursuits") return `${values.name} / ${values.customer}`;
  if (target === "evidence") return values.citation || values.title;
  return values[target === "actions" ? "title" : "name"];
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
