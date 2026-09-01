import {
  VIEW_TEMPLATES,
  assessmentResult,
  buildAnalysisOfAlternativesModels,
  buildReadiness,
  cleanDecisionPackageValue,
  collectObligations,
  formatLocalDate,
  safeHttpUrl,
  scoped,
  validateWorkspace
} from "./engine.js?v=13";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CONTENT_WIDTH_DXA = 9360;
const TABLE_INDENT_DXA = 120;
const encoder = new TextEncoder();
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function cleanExportText(value) {
  return cleanDecisionPackageValue(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function valueText(value, fallback = "Not recorded") {
  return cleanExportText(value) || fallback;
}

function joined(values, fallback = "None recorded") {
  const items = (values || []).map(cleanExportText).filter(Boolean);
  return items.length ? items.join("; ") : fallback;
}

function slug(value) {
  return cleanExportText(value || "solution")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "solution";
}

export function decisionPackageDocxFilename(workspaceOrName, solutionId = workspaceOrName?.activeSolutionId) {
  const solutionName = typeof workspaceOrName === "string"
    ? workspaceOrName
    : workspaceOrName?.solutions?.find(record => record.id === solutionId)?.name;
  return `${slug(solutionName)}-decision-package.docx`;
}

function labels(ids, lookup, field) {
  return (ids || []).map(id => cleanExportText(lookup.get(id)?.[field] || id)).filter(Boolean);
}

export function buildDecisionPackageDocxModel(workspace, solutionId = workspace?.activeSolutionId, { generatedAt = new Date() } = {}) {
  const validation = validateWorkspace(workspace);
  if (!validation.valid) throw new TypeError(`DOCX export blocked: ${validation.errors[0]}`);

  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) throw new TypeError("DOCX export blocked: solution was not found.");
  const exportSolution = structuredClone(solution);
  delete exportSolution.classification;

  const collections = Object.fromEntries([
    "stakeholders", "outcomes", "measures", "hotButtons", "requirements", "evidence",
    "criteria", "candidates", "winThemes", "architectureViews", "elements", "connections",
    "trades", "decisions", "risks", "dependencies", "assumptions", "roadmapItems",
    "reviews", "transitionActions"
  ].map(name => [name, scoped(workspace, name, solutionId)]));

  const evidenceById = new Map(collections.evidence.map(record => [record.id, record]));
  const candidateById = new Map(collections.candidates.map(record => [record.id, record]));
  const hotButtonById = new Map(collections.hotButtons.map(record => [record.id, record]));
  const elementById = new Map(collections.elements.map(record => [record.id, record]));
  const requirementById = new Map(collections.requirements.map(record => [record.id, record]));
  const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const prepared = formatLocalDate(Number.isFinite(generatedDate.valueOf()) ? generatedDate : new Date());

  return {
    solution: exportSolution,
    prepared,
    summary: solution.description || solution.mission?.desiredState || solution.mission?.problem || "Decision-ready solution architecture package.",
    readiness: buildReadiness(workspace, solutionId),
    obligations: collectObligations(workspace, solutionId),
    stakeholders: collections.stakeholders,
    outcomes: collections.outcomes.map(record => ({
      ...record,
      requirementNames: labels(record.linkedRequirementIds, requirementById, "title")
    })),
    measures: collections.measures,
    hotButtons: collections.hotButtons.map(record => ({
      ...record,
      requirementNames: collections.requirements.filter(requirement => requirement.linkedHotButtonIds?.includes(record.id)).map(requirement => requirement.title)
    })),
    requirements: collections.requirements.map(record => ({
      ...record,
      sourceEvidenceName: evidenceById.get(record.sourceEvidenceId)?.title || "Untraced",
      hotButtonNames: labels(record.linkedHotButtonIds, hotButtonById, "title"),
      elementNames: labels(record.linkedElementIds, elementById, "name"),
      outcomeNames: collections.outcomes.filter(outcome => outcome.linkedRequirementIds?.includes(record.id)).map(outcome => outcome.title)
    })),
    evidence: collections.evidence,
    candidates: collections.candidates.map(record => ({
      ...record,
      assessment: assessmentResult(workspace, solutionId, record.id)
    })),
    winThemes: collections.winThemes.map(record => ({
      ...record,
      hotButtonNames: labels(record.linkedHotButtonIds, hotButtonById, "title"),
      evidenceNames: labels(record.sourceEvidenceIds, evidenceById, "title")
    })),
    architectureViews: collections.architectureViews.map(view => ({
      ...view,
      templateName: VIEW_TEMPLATES.find(([value]) => value === view.template)?.[1] || view.template,
      elements: collections.elements.filter(record => record.viewId === view.id),
      connections: collections.connections.filter(record => record.viewId === view.id).map(connection => ({
        ...connection,
        sourceName: elementById.get(connection.sourceElementId)?.name || connection.sourceElementId,
        targetName: elementById.get(connection.targetElementId)?.name || connection.targetElementId
      }))
    })),
    trades: collections.trades.filter(record => record.analysisType !== "Analysis of Alternatives").map(record => ({
      ...record,
      optionNames: labels(record.optionIds, candidateById, "name")
    })),
    analysesOfAlternatives: buildAnalysisOfAlternativesModels(workspace, solutionId),
    decisions: collections.decisions.map(record => ({
      ...record,
      evidenceNames: labels(record.evidenceIds, evidenceById, "title")
    })),
    risks: collections.risks,
    dependencies: collections.dependencies,
    assumptions: collections.assumptions,
    roadmapItems: collections.roadmapItems,
    reviews: collections.reviews,
    transitionActions: collections.transitionActions,
    proposal: exportSolution.proposal || {}
  };
}

function run(text, { bold = false, italic = false, color = "", size = 0, caps = false } = {}) {
  const properties = [
    bold ? "<w:b/>" : "",
    italic ? "<w:i/>" : "",
    color ? `<w:color w:val="${xml(color)}"/>` : "",
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : "",
    caps ? "<w:caps/>" : ""
  ].join("");
  const parts = valueText(text, "").split(/(\r?\n|\t)/);
  const content = parts.map(part => {
    if (part === "\t") return "<w:tab/>";
    if (/^\r?\n$/.test(part)) return "<w:br/>";
    return part ? `<w:t xml:space="preserve">${xml(part)}</w:t>` : "";
  }).join("") || "<w:t/>";
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${content}</w:r>`;
}

function tabRun() {
  return "<w:r><w:tab/></w:r>";
}

function paragraphRuns(runs, style = "BodyText", {
  align = "", keepNext = false, pageBreakBefore = false, numId = 0,
  shading = "", borderLeft = "", indentLeft = 0, indentHanging = 0
} = {}) {
  const properties = [
    style ? `<w:pStyle w:val="${xml(style)}"/>` : "",
    keepNext ? "<w:keepNext/>" : "",
    pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : "",
    borderLeft ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${xml(borderLeft)}"/></w:pBdr>` : "",
    shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${xml(shading)}"/>` : "",
    indentLeft ? `<w:ind w:left="${indentLeft}"${indentHanging ? ` w:hanging="${indentHanging}"` : ""}/>` : "",
    align ? `<w:jc w:val="${xml(align)}"/>` : ""
  ].join("");
  return `<w:p><w:pPr>${properties}</w:pPr>${runs.join("")}</w:p>`;
}

function paragraph(text, style = "BodyText", options = {}) {
  return paragraphRuns([run(valueText(text, options.fallback || "Not recorded"), options.run)], style, options);
}

function labeledParagraph(label, value, style = "BodyText") {
  return paragraphRuns([
    run(`${label}: `, { bold: true, color: "1F4D78" }),
    run(valueText(value))
  ], style);
}

function listItem(text, { ordered = false } = {}) {
  return paragraphRuns([run(valueText(text))], "ListText", { numId: ordered ? 2 : 1 });
}

function emptyState(message) {
  return paragraph(valueText(message), "NotRecorded");
}

function normalizedWidths(widths, columnCount) {
  if (!widths?.length) {
    const base = Math.floor(CONTENT_WIDTH_DXA / columnCount);
    const result = Array(columnCount).fill(base);
    result[result.length - 1] += CONTENT_WIDTH_DXA - result.reduce((sum, value) => sum + value, 0);
    return result;
  }
  if (widths.length !== columnCount || widths.some(value => !Number.isInteger(value) || value <= 0)) {
    throw new TypeError("DOCX table widths must contain one positive DXA width per column.");
  }
  const total = widths.reduce((sum, value) => sum + value, 0);
  if (total !== CONTENT_WIDTH_DXA) throw new TypeError(`DOCX table widths must total ${CONTENT_WIDTH_DXA} DXA.`);
  return widths;
}

function cellParagraphs(value, style) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const values = Array.isArray(value.paragraphs) ? value.paragraphs : [value.text];
    return values.map(item => paragraph(valueText(item), value.style || style, { fallback: "" })).join("");
  }
  return paragraph(valueText(value), style);
}

function table(headers, rows, widths, { headerFill = "0D1A26", bodyFill = "FFFFFF" } = {}) {
  if (!rows.length) return "";
  const resolvedWidths = normalizedWidths(widths, headers.length);
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map(side => `<w:${side} w:val="single" w:sz="5" w:space="0" w:color="C7D3DB"/>`).join("");
  const cell = (value, width, header = false, rowIndex = 0) => {
    const fill = header ? headerFill : rowIndex % 2 ? "F7FAFB" : bodyFill;
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>${cellParagraphs(value, header ? "TableHeader" : "TableText")}</w:tc>`;
  };
  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map((header, index) => cell(header, resolvedWidths[index], true)).join("")}</w:tr>`;
  const bodyRows = rows.map((row, rowIndex) => `<w:tr>${headers.map((_, index) => cell(row[index], resolvedWidths[index], false, rowIndex)).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH_DXA}" w:type="dxa"/><w:tblInd w:w="${TABLE_INDENT_DXA}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${resolvedWidths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`;
}

function metricTable(readiness) {
  const labels = ["Overall coverage", "Traceability", "Evidence", "Connectivity", "Transition"];
  const values = [readiness.overall, readiness.traceability, readiness.evidence, readiness.interfaces, readiness.transition].map(value => `${value}%`);
  const widths = normalizedWidths(null, 5);
  const row = (items, style, fill) => `<w:tr>${items.map((item, index) => `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="center"/></w:tcPr>${paragraph(item, style)}</w:tc>`).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH_DXA}" w:type="dxa"/><w:tblInd w:w="${TABLE_INDENT_DXA}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${row(labels, "MetricLabel", "EAF4F5")}${row(values, "MetricValue", "F7FAFB")}</w:tbl>`;
}

function addTableOrEmpty(parts, headers, rows, widths, emptyMessage, options) {
  if (rows.length) parts.push(table(headers, rows, widths, options));
  else parts.push(emptyState(emptyMessage));
}

function sectionHeading(number, title, lead) {
  return [
    paragraph(`${String(number).padStart(2, "0")}  ${title}`, "Heading1"),
    paragraph(lead, "LeadText")
  ];
}

function metadataTable(model) {
  return table(
    ["Customer", "Lifecycle stage", "Domain", "Prepared"],
    [[model.solution.customer, model.solution.stage, model.solution.domain, model.prepared]],
    [2400, 1800, 3360, 1800],
    { headerFill: "0D1A26" }
  );
}

function buildDocumentBody(model) {
  const parts = [];
  const proposal = model.proposal;

  parts.push(paragraph("SOLUTION DECISION PACKAGE", "Kicker"));
  parts.push(paragraph(model.solution.name, "Title"));
  parts.push(paragraph(model.summary, "Subtitle"));
  parts.push(metadataTable(model));
  parts.push(paragraph("Decision requested", "Heading3"));
  parts.push(paragraph(model.solution.decision, "DecisionCallout", { shading: "FFF4DE", borderLeft: "D39235" }));
  parts.push(labeledParagraph("Mission segments", joined(model.solution.missionSegments, "Not selected"), "SmallText"));

  parts.push(...sectionHeading(1, "Executive overview", "A concise view of decision readiness and the mission outcome this solution is intended to enable."));
  parts.push(metricTable(model.readiness));
  parts.push(paragraph("Mission problem", "Heading2"));
  parts.push(paragraph(model.solution.mission?.problem));
  parts.push(paragraph("Current state", "Heading2"));
  parts.push(paragraph(model.solution.mission?.currentState));
  parts.push(paragraph("Desired state", "Heading2"));
  parts.push(paragraph(model.solution.mission?.desiredState));

  parts.push(...sectionHeading(2, "Mission and operational context", "The people, operating conditions, outcomes, measures, and constraints that shape the solution."));
  parts.push(paragraph("Operational context", "Heading2"));
  parts.push(paragraph(model.solution.mission?.operationalContext));
  parts.push(paragraph("Constraints", "Heading2"));
  parts.push(paragraph(model.solution.mission?.constraints));
  parts.push(paragraph("Stakeholders", "Heading2"));
  addTableOrEmpty(parts, ["Stakeholder", "Role", "Primary concern"], model.stakeholders.map(record => [record.name, record.role, record.concern]), [2200, 2200, 4960], "No stakeholders recorded.");
  parts.push(paragraph("Outcomes", "Heading2"));
  addTableOrEmpty(parts, ["Outcome", "Verification method", "Linked requirements"], model.outcomes.map(record => [record.title, record.verificationMethod, joined(record.requirementNames)]), [3000, 3100, 3260], "No outcomes recorded.");
  parts.push(paragraph("Measures of effectiveness and performance", "Heading2"));
  addTableOrEmpty(parts, ["Measure", "Target", "Method"], model.measures.map(record => [record.name, record.target, record.method]), [3000, 2500, 3860], "No measures recorded.");

  parts.push(...sectionHeading(3, "Customer priorities and win themes", "Customer signals are traced to requirements, customer value, discriminators, and proof."));
  parts.push(paragraph("Customer hot buttons and decision drivers", "Heading2"));
  addTableOrEmpty(parts, ["Customer signal", "Detail", "Source", "Confidence / status", "Requirements"], model.hotButtons.map(record => [record.title, record.detail, record.source, `${valueText(record.confidence)} / ${valueText(record.status)}`, joined(record.requirementNames)]), [1900, 2300, 1700, 1400, 2060], "No customer priorities recorded.");
  parts.push(paragraph("Win themes", "Heading2"));
  if (model.winThemes.length) {
    for (const record of model.winThemes) {
      parts.push(paragraph(record.title, "Heading3"));
      parts.push(labeledParagraph("Status", record.status));
      parts.push(labeledParagraph("Customer value", record.customerValue));
      parts.push(labeledParagraph("Discriminator", record.discriminator));
      parts.push(labeledParagraph("Proof", record.proof));
      parts.push(labeledParagraph("Trace", joined([...record.hotButtonNames, ...record.evidenceNames])));
    }
  } else parts.push(emptyState("No win themes recorded."));

  parts.push(...sectionHeading(4, "Requirements trace", "Each requirement is shown with its source, acceptance method, customer drivers, operational outcomes, and architecture realization."));
  if (model.requirements.length) {
    model.requirements.forEach((record, index) => {
      parts.push(paragraph(`Requirement ${String(index + 1).padStart(2, "0")} - ${valueText(record.title)}`, "Heading2"));
      parts.push(table(["Type", "Priority", "Status", "Source evidence"], [[record.type, record.priority, record.status, record.sourceEvidenceName]], [1800, 1400, 1800, 4360]));
      parts.push(labeledParagraph("Acceptance method", record.acceptanceMethod));
      parts.push(labeledParagraph("Customer drivers", joined(record.hotButtonNames)));
      parts.push(labeledParagraph("Operational outcomes", joined(record.outcomeNames)));
      parts.push(labeledParagraph("Architecture trace", joined(record.elementNames)));
    });
  } else parts.push(emptyState("No requirements recorded."));

  parts.push(...sectionHeading(5, "Technology Assessment", "Weighted criteria, evidence coverage, readiness, rationale, and source support for each solution candidate."));
  if (model.candidates.length) {
    for (const candidate of model.candidates) {
      parts.push(paragraph(candidate.name, "Heading2"));
      parts.push(labeledParagraph("Candidate", joined([candidate.category, candidate.vendor])));
      parts.push(paragraph(candidate.description, "BodyText"));
      parts.push(table(
        ["Weighted score", "Assessed", "Evidenced", "Status"],
        [[candidate.assessment.score === null ? "Unknown" : `${candidate.assessment.score.toFixed(2)} / 5`, `${Math.round(candidate.assessment.coverage * 100)}%`, `${Math.round(candidate.assessment.evidenceCoverage * 100)}%`, candidate.status]],
        [2300, 1900, 1900, 3260]
      ));
      parts.push(labeledParagraph("Readiness", `TRL ${candidate.trl ?? "Unknown"}; MRL ${candidate.mrl ?? "Unknown"}; IRL ${candidate.irl ?? "Unknown"}${candidate.readinessAsOf ? `; as of ${candidate.readinessAsOf}` : ""}`));
      parts.push(labeledParagraph("Readiness basis", candidate.readinessBasis));
      addTableOrEmpty(parts,
        ["Criterion", "Weight", "Score", "Rationale", "Evidence"],
        candidate.assessment.rows.map(row => [
          row.criterion.description ? `${row.criterion.name}\n${row.criterion.description}` : row.criterion.name,
          `${row.criterion.weight}%`,
          row.value === null ? "Unknown" : `${row.value} / 5`,
          row.rationale,
          joined(labels(row.evidenceIds, new Map(model.evidence.map(record => [record.id, record])), "title"))
        ]),
        [2100, 900, 900, 3100, 2360],
        `No assessment rows recorded for ${candidate.name}.`
      );
    }
  } else parts.push(emptyState("No technology candidates recorded."));

  parts.push(...sectionHeading(6, "Solution and proposal approach", "The operational concept, technical approach, discriminators, estimate assumptions, and delivery commitments."));
  for (const [label, value] of [
    ["Concept of operations", proposal.conops],
    ["Technical approach", proposal.technicalApproach],
    ["Discriminators", proposal.discriminators],
    ["Estimate and Basis of Estimate assumptions", proposal.estimateAssumptions],
    ["Delivery commitments", proposal.deliveryCommitments]
  ]) {
    parts.push(paragraph(label, "Heading2"));
    parts.push(paragraph(value));
  }

  parts.push(...sectionHeading(7, "Architecture views", "Decision-useful views are represented with complete element and interface registers for accessible review."));
  if (model.architectureViews.length) {
    for (const view of model.architectureViews) {
      parts.push(paragraph(view.name, "Heading2"));
      parts.push(paragraph(view.description));
      parts.push(labeledParagraph("View template", view.templateName));
      parts.push(paragraph("Elements", "Heading3"));
      addTableOrEmpty(parts, ["Element", "Type", "Description"], view.elements.map(record => [record.name, record.type, record.description]), [3000, 1900, 4460], `No elements recorded for ${view.name}.`);
      parts.push(paragraph("Architecture interfaces and exchanges", "Heading3"));
      addTableOrEmpty(parts, ["Source", "Exchange", "Type / protocol", "Target", "Description"], view.connections.map(record => [record.sourceName, record.label, joined([record.type, record.protocol]), record.targetName, record.description]), [1700, 1800, 1600, 1700, 2560], `No interfaces recorded for ${view.name}.`);
    }
  } else parts.push(emptyState("No architecture views recorded."));

  parts.push(...sectionHeading(8, "Trades and decisions", "The evaluated alternatives, recommendations, decision status, rationale, ownership, and supporting evidence."));
  parts.push(paragraph("Trade studies", "Heading2"));
  if (model.trades.length) {
    for (const record of model.trades) {
      parts.push(paragraph(record.title, "Heading3"));
      parts.push(labeledParagraph("Decision question", record.question));
      parts.push(labeledParagraph("Options", joined(record.optionNames)));
      parts.push(labeledParagraph("Recommendation", record.recommendation));
      parts.push(labeledParagraph("Status", record.status));
    }
  } else parts.push(emptyState("No trade studies recorded."));
  if (model.analysesOfAlternatives.length) {
    parts.push(paragraph("Analysis of Alternatives (AoA)", "Heading2"));
    for (const analysis of model.analysesOfAlternatives) {
      parts.push(paragraph(analysis.title, "Heading3"));
      parts.push(labeledParagraph("Decision objective", analysis.question));
      parts.push(labeledParagraph("Baseline alternative", analysis.baselineName));
      parts.push(labeledParagraph("Scope and ground rules", analysis.scopeAndGroundRules));
      parts.push(labeledParagraph("Evaluation approach", analysis.evaluationApproach));
      parts.push(labeledParagraph("Sensitivity and uncertainty", analysis.sensitivityAnalysis));
      parts.push(labeledParagraph("Supporting evidence", joined(analysis.evidenceNames)));
      parts.push(labeledParagraph("Recommendation", analysis.recommendation));
      parts.push(labeledParagraph("Owner / date / status", joined([analysis.owner, analysis.date, analysis.status])));
      addTableOrEmpty(parts, ["Alternative", "Baseline", "Weighted score", "Assessed", "Evidenced", "Readiness levels", "Status"], analysis.alternatives.map(candidate => [candidate.name, candidate.baseline ? "Yes" : "No", candidate.weightedScore === null ? "Unknown" : `${candidate.weightedScore.toFixed(2)} / 5`, `${Math.round(candidate.assessmentCoverage * 100)}%`, `${Math.round(candidate.evidenceCoverage * 100)}%`, `TRL ${candidate.trl ?? "Unknown"}; MRL ${candidate.mrl ?? "Unknown"}; IRL ${candidate.irl ?? "Unknown"}`, candidate.status]), [1800, 900, 1200, 900, 900, 2200, 1460], `No alternatives recorded for ${analysis.title}.`);
    }
  }
  parts.push(paragraph("Decision record", "Heading2"));
  addTableOrEmpty(parts, ["Decision", "Status", "Owner / date", "Rationale", "Evidence"], model.decisions.map(record => [record.title, record.status, joined([record.owner, record.date]), record.rationale, joined(record.evidenceNames)]), [2000, 1200, 1600, 2800, 1760], "No decisions recorded.");

  parts.push(...sectionHeading(9, "Risk, dependencies, and assumptions", "Conditions that could affect performance, integration, schedule, delivery, or sustainment."));
  parts.push(paragraph("Risks", "Heading2"));
  addTableOrEmpty(parts, ["Risk", "Likelihood", "Impact", "Owner", "Mitigation", "Status"], model.risks.map(record => [record.title, record.likelihood, record.impact, record.owner, record.mitigation, record.status]), [1900, 1000, 900, 1300, 3100, 1160], "No risks recorded.");
  parts.push(paragraph("Dependencies", "Heading2"));
  addTableOrEmpty(parts, ["Dependency", "Type", "Provider", "Owner", "Needed by", "Status", "Impact"], model.dependencies.map(record => [record.title, record.type, record.provider, record.owner, record.neededBy, record.status, record.impact]), [1600, 1100, 1250, 1100, 1000, 1060, 2250], "No dependencies recorded.");
  parts.push(paragraph("Assumptions", "Heading2"));
  addTableOrEmpty(parts, ["Assumption", "Owner", "Validation plan", "Status"], model.assumptions.map(record => [record.statement, record.owner, record.validationPlan, record.status]), [3300, 1500, 3160, 1400], "No assumptions recorded.");

  parts.push(...sectionHeading(10, "Roadmap, reviews, and transition", "The sequence, ownership, gates, review criteria, receiving-team actions, and delivery blockers."));
  parts.push(paragraph("Roadmap and gates", "Heading2"));
  addTableOrEmpty(parts, ["Stage", "Activity", "Start", "End", "Owner", "Status", "Gate"], model.roadmapItems.map(record => [record.stage, record.title, record.start, record.end, record.owner, record.status, record.gate ? "Yes" : "No"]), [1100, 2460, 1000, 1000, 1400, 1400, 1000], "No roadmap items recorded.");
  parts.push(paragraph("Reviews", "Heading2"));
  addTableOrEmpty(parts, ["Review", "Type", "Due", "Owner", "Status", "Entry criteria"], model.reviews.map(record => [record.name, record.type, record.due, record.owner, record.status, record.entryCriteria]), [1600, 1100, 1100, 1300, 1200, 3060], "No reviews recorded.");
  parts.push(paragraph("Transition actions", "Heading2"));
  addTableOrEmpty(parts, ["Transition action", "Owner", "Target / gate", "Status", "Blocker"], model.transitionActions.map(record => [record.title, record.owner, record.target, record.status, record.blocker || "No blocker recorded"]), [2400, 1400, 1900, 1300, 2360], "No transition actions recorded.");

  parts.push(...sectionHeading(11, "Evidence and open obligations", "The evidence register and deterministic gaps that still need action before the decision can be fully supported."));
  parts.push(paragraph("Open obligations", "Heading2"));
  if (model.obligations.length) {
    for (const record of model.obligations) parts.push(listItem(`${record.stage} / ${String(record.severity).toUpperCase()}: ${record.message}`));
  } else parts.push(emptyState("No deterministic gaps detected."));
  parts.push(paragraph("Evidence register", "Heading2"));
  addTableOrEmpty(parts, ["Evidence", "Type", "Source / date", "Participants", "Mission segments", "Confidence", "Reference / notes"], model.evidence.map(record => [
    record.title,
    record.sourceType,
    joined([record.source, record.meetingDate]),
    joined(record.participants),
    joined(record.missionSegments),
    record.confidence,
    joined([safeHttpUrl(record.url), record.notes])
  ]), [1500, 950, 1500, 1200, 1350, 900, 1960], "No source evidence recorded.");
  parts.push(paragraph("Acronym key", "Heading2"));
  parts.push(table(["Acronym", "Meaning"], [
    ...(model.analysesOfAlternatives.length ? [["AoA", "Analysis of Alternatives"]] : []),
    ["TRL", "Technology Readiness Level"],
    ["MRL", "Manufacturing Readiness Level"],
    ["IRL", "Integration Readiness Level"],
    ["MOSA", "Modular Open Systems Approach"],
    ["CONOPS", "Concept of Operations"],
    ["RF", "Radio Frequency"]
  ], [1600, 7760]));

  return parts.join("");
}

function stylesXml() {
  const style = (id, name, { basedOn = "Normal", next = "BodyText", size = 21, color = "17232F", bold = false, italic = false, before = 0, after = 120, line = 264, keepNext = false, pageBreakBefore = false, caps = false, align = "" } = {}) => `
    <w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}${next ? `<w:next w:val="${next}"/>` : ""}<w:qFormat/><w:pPr>${keepNext ? "<w:keepNext/>" : ""}${pageBreakBefore ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>${align ? `<w:jc w:val="${align}"/>` : ""}</w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${caps ? "<w:caps/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:color w:val="17232F"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  ${style("Normal", "Normal", { basedOn: "", next: "Normal" })}
  ${style("BodyText", "Body Text", {})}
  ${style("Title", "Title", { size: 56, color: "0D1A26", bold: true, after: 160, line: 600, keepNext: true })}
  ${style("Subtitle", "Subtitle", { size: 26, color: "536572", after: 320, line: 340, keepNext: true })}
  ${style("Kicker", "Kicker", { size: 18, color: "007B86", bold: true, caps: true, after: 100, line: 220, keepNext: true })}
  ${style("Heading1", "Heading 1", { size: 32, color: "006F79", bold: true, before: 240, after: 160, line: 360, keepNext: true, pageBreakBefore: true })}
  ${style("Heading2", "Heading 2", { size: 26, color: "007B86", bold: true, before: 220, after: 100, line: 300, keepNext: true })}
  ${style("Heading3", "Heading 3", { size: 22, color: "1F4D78", bold: true, before: 160, after: 80, line: 270, keepNext: true })}
  ${style("LeadText", "Lead Text", { size: 22, color: "536572", italic: true, after: 180, line: 290 })}
  ${style("SmallText", "Small Text", { size: 18, color: "586A78", after: 100, line: 230 })}
  ${style("NotRecorded", "Not Recorded", { size: 20, color: "718390", italic: true, after: 120, line: 250 })}
  ${style("DecisionCallout", "Decision Callout", { size: 23, color: "17232F", bold: true, before: 40, after: 220, line: 300 })}
  ${style("ListText", "List Text", { size: 21, color: "17232F", after: 80, line: 264 })}
  ${style("TableText", "Table Text", { size: 17, color: "17232F", after: 0, line: 220 })}
  ${style("TableHeader", "Table Header", { size: 17, color: "FFFFFF", bold: true, after: 0, line: 220 })}
  ${style("MetricLabel", "Metric Label", { size: 16, color: "586A78", bold: true, caps: true, after: 0, line: 200, align: "center" })}
  ${style("MetricValue", "Metric Value", { size: 30, color: "006F79", bold: true, after: 0, line: 320, align: "center" })}
  ${style("Header", "Header", { size: 17, color: "718390", after: 0, line: 220 })}
  ${style("Footer", "Footer", { size: 17, color: "718390", after: 0, line: 220 })}
</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#x2022;"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function headerXml(model) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Header"/><w:pBdr><w:bottom w:val="single" w:sz="5" w:space="6" w:color="CCD8DF"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>${run(model.solution.name)}${tabRun()}${run("Decision Package", { bold: true, color: "007B86" })}</w:p></w:hdr>`;
}

function footerXml(model) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:jc w:val="right"/></w:pPr>${run(`Prepared ${model.prepared}  |  Page `)}<w:fldSimple w:instr="PAGE \\* MERGEFORMAT"><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="718390"/><w:sz w:val="17"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
}

function documentXml(model) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${buildDocumentBody(model)}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function packageRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function documentRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
}

function settingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:displayBackgroundShape/><w:evenAndOddHeaders w:val="0"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

function corePropertiesXml(model, generatedAt) {
  const instant = generatedAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(model.solution.name)} - Decision Package</dc:title><dc:subject>Solution decision package</dc:subject><dc:creator>Solution Architect Workbench</dc:creator><cp:lastModifiedBy>Solution Architect Workbench</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${instant}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${instant}</dcterms:modified></cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Solution Architect Workbench</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function uint32(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function zipStore(entries, generatedAt) {
  const localParts = [];
  const centralParts = [];
  const stamp = dosDateTime(generatedAt);
  let offset = 0;

  for (const [name, source] of entries) {
    const nameBytes = encoder.encode(name);
    const data = typeof source === "string" ? encoder.encode(source) : source;
    const checksum = crc32(data);
    const localHeader = concat([
      uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(stamp.time), uint16(stamp.date),
      uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes
    ]);
    localParts.push(localHeader, data);
    centralParts.push(concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(stamp.time), uint16(stamp.date),
      uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes
    ]));
    offset += localHeader.length + data.length;
  }

  const centralDirectory = concat(centralParts);
  const end = concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(centralDirectory.length), uint32(offset), uint16(0)
  ]);
  return concat([...localParts, centralDirectory, end]);
}

export function buildDecisionPackageDocxBytes(workspace, solutionId = workspace?.activeSolutionId, options = {}) {
  const generatedAtValue = options.generatedAt instanceof Date ? options.generatedAt : new Date(options.generatedAt || Date.now());
  const generatedAt = Number.isFinite(generatedAtValue.valueOf()) ? generatedAtValue : new Date();
  const model = buildDecisionPackageDocxModel(workspace, solutionId, { generatedAt });
  const entries = [
    ["[Content_Types].xml", contentTypesXml()],
    ["_rels/.rels", packageRelationshipsXml()],
    ["docProps/core.xml", corePropertiesXml(model, generatedAt)],
    ["docProps/app.xml", appPropertiesXml()],
    ["word/document.xml", documentXml(model)],
    ["word/styles.xml", stylesXml()],
    ["word/numbering.xml", numberingXml()],
    ["word/settings.xml", settingsXml()],
    ["word/header1.xml", headerXml(model)],
    ["word/footer1.xml", footerXml(model)],
    ["word/_rels/document.xml.rels", documentRelationshipsXml()]
  ];
  return zipStore(entries, generatedAt);
}

export function buildDecisionPackageDocx(workspace, solutionId = workspace?.activeSolutionId, options = {}) {
  return new Blob([buildDecisionPackageDocxBytes(workspace, solutionId, options)], { type: DOCX_MIME_TYPE });
}
