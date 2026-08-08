import { calculateCompetitiveScores } from "./engine.js";

export const VISUALIZATION_SCHEMA_VERSION = 1;
export const REPORT_VISUAL_SNAPSHOT_VERSION = 2;
export const REPORT_VISUAL_SNAPSHOT_MAX_BYTES = 64_000;
const UTF8_ENCODER = typeof TextEncoder === "function" ? new TextEncoder() : null;

export function utf8ByteLength(value) {
  const text = String(value ?? "");
  if (UTF8_ENCODER) return UTF8_ENCODER.encode(text).byteLength;
  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

const REPORT_VISUAL_LIMITS = Object.freeze({
  rankedEntities: 14,
  heatmapRows: 14,
  heatmapColumns: 7,
  deltaRows: 14,
  evidenceRows: 14,
  relationshipNodesPerSide: 9,
  relationshipLinks: 81,
  textBytes: 180
});

const DARK_PALETTE = Object.freeze({
  ink: "#f7f4ff",
  muted: "#bcb4cf",
  quiet: "#8e849f",
  grid: "#514760",
  track: "#2a2338",
  surface: "#211a30",
  accent: "#29aae1",
  accentDark: "#087da9",
  accentOpen: "#d8f3ff",
  onAccent: "#10202a",
  onAccentDark: "#ffffff",
  actionFill: "#087da9",
  actionText: "#ffffff",
  scenario: "#d8f3ff",
  comparator: "#f0b44d",
  comparatorOpen: "#fff0c8"
});

const LIGHT_PALETTE = Object.freeze({
  ink: "#211a30",
  muted: "#62586f",
  quiet: "#80778c",
  grid: "#d6d0df",
  track: "#eeeaf3",
  surface: "#ffffff",
  accent: "#087da9",
  accentDark: "#075d7d",
  accentOpen: "#d8f3ff",
  onAccent: "#ffffff",
  onAccentDark: "#ffffff",
  actionFill: "#d8f3ff",
  actionText: "#211a30",
  scenario: "#075d7d",
  comparator: "#a96f09",
  comparatorOpen: "#fff0c8"
});

const PRIORITIES = Object.freeze(["Critical", "High", "Medium", "Low"]);
const ACTION_STATUSES = Object.freeze(["Open", "In progress", "Blocked", "Complete"]);
const HISTORY_SERIES = Object.freeze([
  { key: "ourCpi", label: "Our CPI", dash: "", marker: "circle", color: "accent" },
  {
    key: "rivalCpi",
    label: "Strongest rival CPI",
    dash: "7 5",
    marker: "square",
    color: "comparator"
  },
  {
    key: "scenario",
    label: "Scenario estimate",
    dash: "2 5",
    marker: "diamond",
    color: "scenario"
  },
  {
    key: "coverage",
    label: "Evidence coverage",
    dash: "11 4 2 4",
    marker: "triangle",
    color: "muted"
  },
  {
    key: "confidence",
    label: "Confidence",
    dash: "4 4",
    marker: "cross",
    color: "quiet"
  }
]);

export function escapeSvgText(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]
  );
}

export function buildVisualizationSpecs(workspace, pursuitId, scoreSummary) {
  const safeWorkspace = workspace && typeof workspace === "object" ? workspace : {};
  const criteria = collection(safeWorkspace.criteria).filter(item => item.pursuitId === pursuitId);
  const competitors = collection(safeWorkspace.competitors).filter(
    item => item.pursuitId === pursuitId
  );
  const evidence = collection(safeWorkspace.evidence).filter(item => item.pursuitId === pursuitId);
  const actions = collection(safeWorkspace.actions).filter(item => item.pursuitId === pursuitId);
  const scores =
    scoreSummary && typeof scoreSummary === "object"
      ? scoreSummary
      : calculateCompetitiveScores(
          {
            ...safeWorkspace,
            criteria: collection(safeWorkspace.criteria),
            competitors: collection(safeWorkspace.competitors),
            evidence: collection(safeWorkspace.evidence),
            pursuits: collection(safeWorkspace.pursuits)
          },
          pursuitId
        );
  const strongest = scores?.strongestCompetitor || null;
  const ourDetails = new Map(collection(scores?.us?.details).map(item => [item.criterionId, item]));
  const rivalDetails = new Map(
    collection(strongest?.details).map(item => [item.criterionId, item])
  );
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  const ranking = [
    {
      id: scores?.us?.id || "us",
      name: scores?.us?.name || "Our team",
      cpi: finite(scores?.us?.cpi, 0, 100),
      coverage: finite(scores?.us?.coverage, 0, 100),
      confidence: finite(scores?.us?.confidence, 0, 100),
      isUs: true
    },
    ...collection(scores?.competitors).map(item => ({
      id: item.id,
      name: item.name || competitorName(competitors, item.id),
      cpi: finite(item.cpi, 0, 100),
      coverage: finite(item.coverage, 0, 100),
      confidence: finite(item.confidence, 0, 100),
      isUs: false
    }))
  ];

  const heatmapColumns = [
    { id: "us", name: "Our team" },
    ...competitors.map(item => ({ id: item.id, name: item.name || "Unnamed competitor" }))
  ];
  const heatmapRows = criteria.map(criterion => ({
    id: criterion.id,
    name: criterion.name || "Unnamed criterion",
    weight: finite(criterion.weight, 0),
    values: Object.fromEntries([
      ["us", score(criterion.ourScore)],
      ...competitors.map(competitor => [
        competitor.id,
        score(competitor.scores?.[criterion.id])
      ])
    ])
  }));

  const deltaRows = criteria.map(criterion => {
    const ours = ourDetails.get(criterion.id);
    const rival = rivalDetails.get(criterion.id);
    const hasBothScores = score(ours?.rawScore) !== null && score(rival?.rawScore) !== null;
    const ourEffective = hasBothScores ? finite(ours?.effectiveScore, 1, 5) : null;
    const rivalEffective = hasBothScores ? finite(rival?.effectiveScore, 1, 5) : null;
    return {
      id: criterion.id,
      name: criterion.name || "Unnamed criterion",
      weight: finite(criterion.weight, 0),
      ourEffective,
      rivalEffective,
      delta:
        ourEffective === null || rivalEffective === null
          ? null
          : round(ourEffective - rivalEffective, 2)
    };
  });

  const evidenceRows = criteria.map(criterion => {
    const ids = new Set(stringCollection(criterion.evidenceIds));
    for (const item of evidence) {
      if (stringCollection(item.criterionIds).includes(criterion.id)) ids.add(item.id);
    }
    const linked = [...ids].map(id => evidenceById.get(id)).filter(Boolean);
    const support = linked.filter(item => item.stance === "Support").length;
    const challenge = linked.filter(item => item.stance === "Challenge").length;
    return {
      id: criterion.id,
      name: criterion.name || "Unnamed criterion",
      weight: finite(criterion.weight, 0),
      score: score(criterion.ourScore),
      classification: ourDetails.get(criterion.id)?.classification || "Missing",
      linked: linked.length,
      support,
      challenge,
      conflict: support > 0 && challenge > 0
    };
  });

  const relationshipLinks = [];
  const relationshipKeys = new Set();
  const addRelationship = (evidenceId, criterionId) => {
    const item = evidenceById.get(evidenceId);
    if (!item || !criteria.some(criterion => criterion.id === criterionId)) return;
    const key = `${String(evidenceId)}\u0000${String(criterionId)}`;
    if (relationshipKeys.has(key)) return;
    relationshipKeys.add(key);
    relationshipLinks.push({
      evidenceId,
      criterionId,
      stance: item.stance || "Neutral"
    });
  };
  for (const criterion of criteria) {
    for (const evidenceId of stringCollection(criterion.evidenceIds)) {
      addRelationship(evidenceId, criterion.id);
    }
  }
  for (const item of evidence) {
    for (const criterionId of stringCollection(item.criterionIds)) {
      addRelationship(item.id, criterionId);
    }
  }

  const historyPoints = collection(safeWorkspace.runs)
    .filter(item => item.pursuitId === pursuitId && item.scoreSummary)
    .map(item => {
      const summary = item.scoreSummary || {};
      return {
        id: item.id,
        label: historyLabel(item),
        createdAt: item.createdAt || item.date || "",
        ourCpi: finite(summary.us?.cpi, 0, 100),
        rivalCpi: finite(summary.strongestCompetitor?.cpi, 0, 100),
        scenario: finite(summary.scenarioEstimate?.value, 0, 100),
        coverage: finite(summary.us?.coverage, 0, 100),
        confidence: finite(summary.us?.confidence, 0, 100),
        margin: finite(summary.margin, -100, 100)
      };
    })
    .sort((a, b) => {
      const dateOrder = String(a.createdAt).localeCompare(String(b.createdAt));
      return dateOrder || String(a.id).localeCompare(String(b.id));
    });

  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    pursuitId: String(pursuitId ?? ""),
    rankedCpi: {
      type: "ranked-cpi",
      title: "Competitive Position Index comparison",
      description:
        "Zero-based comparison from 0 to 100. Coverage and confidence are shown beside each entity.",
      entities: ranking
    },
    scoreHeatmap: {
      type: "score-heatmap",
      title: "Weighted criterion score heatmap",
      description:
        "Direct 1-to-5 scores by criterion and competitor. Criterion weights are shown in row labels; unknown scores are striped and labeled Unknown.",
      columns: heatmapColumns,
      rows: heatmapRows
    },
    criterionDeltas: {
      type: "criterion-deltas",
      title: "Criterion advantages and disadvantages",
      description: strongest
        ? `Evidence-adjusted score difference: Our team minus ${strongest.name}. Positive values favor our team; criterion weight is shown separately.`
        : "A scored competitor is required before criterion differences can be calculated.",
      competitorName: strongest?.name || "",
      rows: deltaRows
    },
    scenarioRange: {
      type: "scenario-range",
      title: "Scenario estimate and uncertainty",
      description:
        "Planning estimate on a zero-to-100 scale. The interval reflects modeled uncertainty and is not a forecast.",
      estimate: normalizeScenario(scores?.scenarioEstimate)
    },
    evidenceGrid: {
      type: "evidence-grid",
      title: "Evidence coverage and conflict",
      description:
        "Criterion-level score availability, linked evidence counts, supporting and challenging evidence, and detected conflicts.",
      rows: evidenceRows
    },
    evidenceRelationships: {
      type: "evidence-relationships",
      title: "Evidence-to-criterion relationships",
      description:
        "Bipartite traceability diagram. Solid lines are supporting evidence; dashed lines are challenges; dotted lines are context or neutral evidence.",
      evidence: evidence.map(item => ({
        id: item.id,
        label: `${item.citation ? `[${item.citation}] ` : ""}${item.title || "Untitled evidence"}`,
        classification: item.classification || "Missing",
        stance: item.stance || "Neutral"
      })),
      criteria: criteria.map(item => ({
        id: item.id,
        label: item.name || "Unnamed criterion",
        weight: finite(item.weight, 0)
      })),
      links: relationshipLinks
    },
    runHistory: {
      type: "run-history",
      title: "Saved analysis history",
      description:
        "Scored report checkpoints on a zero-to-100 scale. Lines connect saved runs; they do not imply observations between runs.",
      points: historyPoints
    },
    actionSummary: {
      type: "action-summary",
      title: "Action priority and status",
      description:
        "Counts of pursuit actions by priority and workflow status. Every cell shows its exact count.",
      actions: actions.map(item => ({
        priority: PRIORITIES.includes(item.priority) ? item.priority : "Other",
        status: ACTION_STATUSES.includes(item.status) ? item.status : "Other"
      }))
    }
  };
}

export function buildRunVisualizationSnapshot(workspace, pursuitId, scoreSummary) {
  const specs = buildVisualizationSpecs(workspace, pursuitId, scoreSummary);
  const compactText = value => truncateUtf8(value, REPORT_VISUAL_LIMITS.textBytes);
  const compareRankedEntities = (a, b) => {
    const left = finite(a.cpi, 0, 100);
    const right = finite(b.cpi, 0, 100);
    if (left === null && right !== null) return 1;
    if (left !== null && right === null) return -1;
    return (right ?? -1) - (left ?? -1) || a._order - b._order;
  };
  const sortedRankedEntities = collection(specs.rankedCpi.entities)
    .map((item, index) => ({ ...item, _order: index }))
    .sort(compareRankedEntities);
  const ourRankedEntity = sortedRankedEntities.find(item => item.isUs);
  const rankedEntities = [
    ...sortedRankedEntities
      .filter(item => !item.isUs)
      .slice(
        0,
        REPORT_VISUAL_LIMITS.rankedEntities - (ourRankedEntity ? 1 : 0)
      ),
    ...(ourRankedEntity ? [ourRankedEntity] : [])
  ]
    .sort(compareRankedEntities)
    .map((item, index) => ({
      id: `entity-${index}`,
      name: compactText(item.name || "Unnamed entity"),
      cpi: finite(item.cpi, 0, 100),
      coverage: finite(item.coverage, 0, 100),
      confidence: finite(item.confidence, 0, 100),
      isUs: Boolean(item.isUs)
    }));
  const heatmapColumns = collection(specs.scoreHeatmap.columns)
    .slice(0, REPORT_VISUAL_LIMITS.heatmapColumns)
    .map((item, index) => ({
      sourceId: String(item.id ?? ""),
      id: `entity-${index}`,
      name: compactText(item.name || "Unnamed entity")
    }));
  const heatmapRows = collection(specs.scoreHeatmap.rows)
    .slice(0, REPORT_VISUAL_LIMITS.heatmapRows)
    .map((item, index) => ({
      id: `criterion-${index}`,
      name: compactText(item.name || "Unnamed criterion"),
      weight: finite(item.weight, 0),
      values: Object.fromEntries(
        heatmapColumns.map(column => [column.id, score(item.values?.[column.sourceId])])
      )
    }));
  const compactHeatmapColumns = heatmapColumns.map(({ sourceId, ...item }) => item);
  const deltaRows = collection(specs.criterionDeltas.rows)
    .map((item, index) => ({ ...item, _order: index }))
    .sort((a, b) => {
      const left =
        finite(a.delta, -4, 4) === null
          ? -1
          : Math.abs(finite(a.delta, -4, 4)) * (finite(a.weight, 0) || 0);
      const right =
        finite(b.delta, -4, 4) === null
          ? -1
          : Math.abs(finite(b.delta, -4, 4)) * (finite(b.weight, 0) || 0);
      return right - left || a._order - b._order;
    })
    .slice(0, REPORT_VISUAL_LIMITS.deltaRows)
    .map((item, index) => ({
      id: `criterion-${index}`,
      name: compactText(item.name || "Unnamed criterion"),
      weight: finite(item.weight, 0),
      ourEffective: finite(item.ourEffective, 1, 5),
      rivalEffective: finite(item.rivalEffective, 1, 5),
      delta: finite(item.delta, -4, 4)
    }));
  const evidenceRows = collection(specs.evidenceGrid.rows)
    .slice(0, REPORT_VISUAL_LIMITS.evidenceRows)
    .map((item, index) => ({
      id: `criterion-${index}`,
      name: compactText(item.name || "Unnamed criterion"),
      weight: finite(item.weight, 0),
      score: score(item.score),
      classification: compactText(item.classification || "Missing"),
      linked: finite(item.linked, 0),
      support: finite(item.support, 0),
      challenge: finite(item.challenge, 0),
      conflict: Boolean(item.conflict)
    }));
  const relationshipEvidence = collection(specs.evidenceRelationships.evidence).slice(
    0,
    REPORT_VISUAL_LIMITS.relationshipNodesPerSide
  );
  const relationshipCriteria = collection(specs.evidenceRelationships.criteria).slice(
    0,
    REPORT_VISUAL_LIMITS.relationshipNodesPerSide
  );
  const evidenceIdMap = new Map(
    relationshipEvidence.map((item, index) => [String(item.id), `evidence-${index}`])
  );
  const criterionIdMap = new Map(
    relationshipCriteria.map((item, index) => [String(item.id), `criterion-${index}`])
  );
  const relationshipLinks = collection(specs.evidenceRelationships.links)
    .filter(
      item =>
        evidenceIdMap.has(String(item.evidenceId)) &&
        criterionIdMap.has(String(item.criterionId))
    )
    .slice(0, REPORT_VISUAL_LIMITS.relationshipLinks)
    .map(item => ({
      evidenceId: evidenceIdMap.get(String(item.evidenceId)),
      criterionId: criterionIdMap.get(String(item.criterionId)),
      stance: compactText(item.stance || "Neutral")
    }));
  const actionCounts = new Map();
  for (const action of collection(specs.actionSummary.actions)) {
    const priority = PRIORITIES.includes(action?.priority) ? action.priority : "Other";
    const status = ACTION_STATUSES.includes(action?.status) ? action.status : "Other";
    const key = `${priority}\u0000${status}`;
    actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
  }
  const snapshot = {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    snapshotVersion: REPORT_VISUAL_SNAPSHOT_VERSION,
    pursuitId: specs.pursuitId,
    metrics: {
      ourCpi: firstFinite(specs.rankedCpi.entities.find(item => item.isUs)?.cpi),
      strongestRivalCpi: firstFinite(
        specs.rankedCpi.entities
          .filter(item => !item.isUs && item.cpi !== null)
          .sort((a, b) => b.cpi - a.cpi)[0]?.cpi
      ),
      scenario: firstFinite(specs.scenarioRange.estimate?.value),
      coverage: firstFinite(specs.rankedCpi.entities.find(item => item.isUs)?.coverage),
      confidence: firstFinite(specs.rankedCpi.entities.find(item => item.isUs)?.confidence)
    },
    visuals: {
      rankedCpi: {
        ...specs.rankedCpi,
        entities: rankedEntities,
        totalEntities: collection(specs.rankedCpi.entities).length
      },
      scoreHeatmap: {
        ...specs.scoreHeatmap,
        columns: compactHeatmapColumns,
        rows: heatmapRows,
        totalColumns: collection(specs.scoreHeatmap.columns).length,
        totalRows: collection(specs.scoreHeatmap.rows).length
      },
      criterionDeltas: {
        ...specs.criterionDeltas,
        competitorName: compactText(specs.criterionDeltas.competitorName),
        rows: deltaRows,
        totalRows: collection(specs.criterionDeltas.rows).length
      },
      scenarioRange: specs.scenarioRange,
      evidenceGrid: {
        ...specs.evidenceGrid,
        rows: evidenceRows,
        totalRows: collection(specs.evidenceGrid.rows).length
      },
      evidenceRelationships: {
        ...specs.evidenceRelationships,
        evidence: relationshipEvidence.map((item, index) => ({
          id: `evidence-${index}`,
          label: compactText(item.label || "Untitled evidence"),
          classification: compactText(item.classification || "Missing"),
          stance: compactText(item.stance || "Neutral")
        })),
        criteria: relationshipCriteria.map((item, index) => ({
          id: `criterion-${index}`,
          label: compactText(item.label || "Unnamed criterion"),
          weight: finite(item.weight, 0)
        })),
        links: relationshipLinks,
        totalEvidence: collection(specs.evidenceRelationships.evidence).length,
        totalCriteria: collection(specs.evidenceRelationships.criteria).length,
        totalLinks: collection(specs.evidenceRelationships.links).length
      },
      actionSummary: {
        ...specs.actionSummary,
        actions: [],
        counts: [...actionCounts.entries()].map(([key, count]) => {
          const [priority, status] = key.split("\u0000");
          return { priority, status, count };
        }),
        totalActions: collection(specs.actionSummary.actions).length
      }
    }
  };
  if (utf8ByteLength(JSON.stringify(snapshot)) > REPORT_VISUAL_SNAPSHOT_MAX_BYTES) {
    throw new Error("The bounded report visualization snapshot exceeded its storage limit.");
  }
  return snapshot;
}

export function renderRankedCpiSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxRows = boundedInteger(options.maxRows, 3, 50, 14);
  const allEntities = collection(spec.entities)
    .map((item, index) => ({
      ...item,
      _order: index,
      name: item?.name || "Unnamed entity",
      cpi: finite(item?.cpi, 0, 100),
      coverage: finite(item?.coverage, 0, 100),
      confidence: finite(item?.confidence, 0, 100)
    }))
    .sort((a, b) => {
      if (a.cpi === null && b.cpi !== null) return 1;
      if (a.cpi !== null && b.cpi === null) return -1;
      if (a.cpi !== b.cpi) return (b.cpi ?? -1) - (a.cpi ?? -1);
      return a._order - b._order;
    });
  const entities = allEntities.slice(0, maxRows);
  if (!entities.length) {
    return emptySvg(
      "ranked-cpi",
      spec.title || "Competitive Position Index comparison",
      spec.description || "",
      "No scored entities are available.",
      options
    );
  }

  const width = 860;
  const labelX = 24;
  const plotX = 250;
  const plotWidth = 460;
  const rowHeight = 58;
  const top = 102;
  const totalEntities = Math.max(
    allEntities.length,
    Math.trunc(finite(spec.totalEntities, 0) || 0)
  );
  const omitted = totalEntities - entities.length;
  const height = top + entities.length * rowHeight + (omitted ? 64 : 42);
  const body = [];
  body.push(axisGrid(plotX, top - 13, plotWidth, entities.length * rowHeight, palette));
  body.push(
    textNode(
      labelX,
      70,
      "Ranked entities",
      { fill: palette.muted, size: 12, weight: 700, letterSpacing: 0.7 },
      palette
    )
  );
  body.push(
    textNode(
      plotX,
      70,
      "Competitive Position Index (0–100)",
      { fill: palette.muted, size: 12, weight: 700, letterSpacing: 0.7 },
      palette
    )
  );

  entities.forEach((entity, index) => {
    const y = top + index * rowHeight;
    const valueLabel = entity.cpi === null ? "Unknown" : formatNumber(entity.cpi);
    const evidenceLabel = `Coverage ${percent(entity.coverage)} · Confidence ${percent(
      entity.confidence
    )}`;
    body.push(`<g aria-label="${escapeSvgText(`${entity.name}: ${valueLabel}`)}">`);
    body.push(`<title>${escapeSvgText(`${entity.name}: CPI ${valueLabel}; ${evidenceLabel}`)}</title>`);
    body.push(
      textNode(
        labelX,
        y + 15,
        truncate(entity.name, 31),
        { fill: palette.ink, size: 14, weight: entity.isUs ? 750 : 600 },
        palette
      )
    );
    body.push(
      textNode(
        labelX,
        y + 35,
        evidenceLabel,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
    body.push(
      `<rect x="${plotX}" y="${y}" width="${plotWidth}" height="22" rx="3" fill="${palette.track}" stroke="${palette.grid}"/>`
    );
    if (entity.cpi === null) {
      body.push(
        `<rect x="${plotX}" y="${y}" width="${plotWidth}" height="22" rx="3" fill="none" stroke="${palette.muted}" stroke-dasharray="5 4"/>`
      );
    } else {
      body.push(
        `<rect x="${plotX}" y="${y}" width="${round(
          (entity.cpi / 100) * plotWidth,
          2
        )}" height="22" rx="3" fill="${
          entity.isUs ? palette.accent : palette.accentOpen
        }" stroke="${entity.isUs ? palette.accentDark : palette.comparator}"/>`
      );
    }
    body.push(
      textNode(
        plotX + plotWidth + 16,
        y + 16,
        valueLabel,
        { fill: palette.ink, size: 14, weight: 750, mono: true },
        palette
      )
    );
    body.push("</g>");
  });
  if (omitted) {
    body.push(
      textNode(
        labelX,
        height - 18,
        `Showing ${entities.length} of ${totalEntities} ranked entities.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }

  return svgFrame({
    type: "ranked-cpi",
    title: spec.title || "Competitive Position Index comparison",
    description:
      spec.description ||
      "Zero-based comparison of Competitive Position Index values from zero to one hundred.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderScoreHeatmapSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxRows = boundedInteger(options.maxRows, 4, 50, 14);
  const maxColumns = boundedInteger(options.maxColumns, 2, 10, 7);
  const allRows = collection(spec.rows);
  const allColumns = collection(spec.columns);
  const rows = allRows.slice(0, maxRows);
  const columns = allColumns.slice(0, maxColumns);
  if (!rows.length || !columns.length) {
    return emptySvg(
      "score-heatmap",
      spec.title || "Weighted criterion score heatmap",
      spec.description || "",
      "Add at least one criterion and one scored entity to display the heatmap.",
      options
    );
  }

  const labelWidth = 276;
  const cellWidth = 98;
  const cellHeight = 50;
  const top = 118;
  const width = labelWidth + columns.length * cellWidth + 28;
  const totalRows = Math.max(allRows.length, Math.trunc(finite(spec.totalRows, 0) || 0));
  const totalColumns = Math.max(
    allColumns.length,
    Math.trunc(finite(spec.totalColumns, 0) || 0)
  );
  const omittedRows = totalRows - rows.length;
  const omittedColumns = totalColumns - columns.length;
  const footer = omittedRows || omittedColumns ? 38 : 18;
  const height = top + rows.length * cellHeight + footer;
  const ids = frameIds("score-heatmap", options);
  const unknownPatternId = `${ids.base}-unknown`;
  const body = [];

  body.push(
    `<defs><pattern id="${unknownPatternId}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${palette.track}"/><line x1="0" y1="0" x2="0" y2="8" stroke="${palette.muted}" stroke-width="2"/></pattern></defs>`
  );
  body.push(
    textNode(
      20,
      74,
      "Criterion · entered weight",
      { fill: palette.muted, size: 12, weight: 700 },
      palette
    )
  );
  columns.forEach((column, index) => {
    const x = labelWidth + index * cellWidth + cellWidth / 2;
    body.push(
      textNode(
        x,
        72,
        truncate(column?.name || "Unnamed entity", 13),
        { fill: palette.ink, size: 12, weight: 700, anchor: "middle" },
        palette
      )
    );
    body.push(
      textNode(
        x,
        91,
        "Score",
        { fill: palette.muted, size: 10, anchor: "middle" },
        palette
      )
    );
  });

  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * cellHeight;
    const weightLabel = row?.weight === null || row?.weight === undefined
      ? "weight Unknown"
      : `weight ${formatNumber(row.weight)}`;
    body.push(`<g><title>${escapeSvgText(`${row?.name || "Unnamed criterion"}; ${weightLabel}`)}</title>`);
    body.push(
      textNode(
        20,
        y + 22,
        truncate(row?.name || "Unnamed criterion", 31),
        { fill: palette.ink, size: 13, weight: 650 },
        palette
      )
    );
    body.push(
      textNode(20, y + 40, weightLabel, { fill: palette.muted, size: 10 }, palette)
    );
    columns.forEach((column, columnIndex) => {
      const x = labelWidth + columnIndex * cellWidth;
      const value = score(row?.values?.[column?.id]);
      const valueLabel = value === null ? "Unknown" : `${formatNumber(value)}/5`;
      body.push(
        `<g aria-label="${escapeSvgText(
          `${row?.name || "Unnamed criterion"}, ${column?.name || "Unnamed entity"}: ${valueLabel}`
        )}"><title>${escapeSvgText(
          `${row?.name || "Unnamed criterion"} — ${column?.name || "Unnamed entity"}: ${valueLabel}`
        )}</title><rect x="${x + 4}" y="${y}" width="${cellWidth - 8}" height="${
          cellHeight - 8
        }" rx="3" fill="${
          value === null ? `url(#${unknownPatternId})` : heatTone(value, palette)
        }" stroke="${value === null ? palette.muted : palette.accentDark}"/>`
      );
      body.push(
        textNode(
          x + cellWidth / 2,
          y + 26,
          valueLabel,
          {
            fill: heatTextTone(value, palette),
            size: value === null ? 10 : 13,
            weight: 750,
            mono: true,
            anchor: "middle"
          },
          palette
        )
      );
      body.push("</g>");
    });
    body.push("</g>");
  });
  if (omittedRows || omittedColumns) {
    body.push(
      textNode(
        20,
        height - 12,
        `Showing ${rows.length} of ${totalRows} criteria and ${columns.length} of ${totalColumns} entities.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }

  return svgFrame({
    type: "score-heatmap",
    title: spec.title || "Weighted criterion score heatmap",
    description:
      spec.description ||
      "Direct one-to-five scores by criterion and entity. Unknown values are striped.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderCriterionDeltaSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxRows = boundedInteger(options.maxRows, 4, 50, 14);
  const allRows = collection(spec.rows)
    .map((item, index) => ({
      ...item,
      _order: index,
      delta: finite(item?.delta, -4, 4),
      weight: finite(item?.weight, 0)
    }))
    .sort((a, b) => {
      if (a.delta === null && b.delta !== null) return 1;
      if (a.delta !== null && b.delta === null) return -1;
      const aImpact = Math.abs(a.delta || 0) * (a.weight || 0);
      const bImpact = Math.abs(b.delta || 0) * (b.weight || 0);
      return bImpact - aImpact || a._order - b._order;
    });
  const rows = allRows.slice(0, maxRows);
  if (!rows.length || !spec.competitorName) {
    return emptySvg(
      "criterion-deltas",
      spec.title || "Criterion advantages and disadvantages",
      spec.description || "",
      "Score at least one competitor to calculate criterion differences.",
      options
    );
  }

  const width = 900;
  const labelX = 22;
  const plotX = 300;
  const plotWidth = 480;
  const centerX = plotX + plotWidth / 2;
  const rowHeight = 49;
  const top = 112;
  const totalRows = Math.max(allRows.length, Math.trunc(finite(spec.totalRows, 0) || 0));
  const omitted = totalRows - rows.length;
  const height = top + rows.length * rowHeight + (omitted ? 46 : 24);
  const ids = frameIds("criterion-deltas", options);
  const negativePatternId = `${ids.base}-negative`;
  const body = [
    `<defs><pattern id="${negativePatternId}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${palette.track}"/><line x1="0" y1="0" x2="0" y2="8" stroke="${palette.accent}" stroke-width="2"/></pattern></defs>`
  ];

  for (const tick of [-4, -2, 0, 2, 4]) {
    const x = centerX + (tick / 8) * plotWidth;
    body.push(
      `<line x1="${x}" y1="${top - 24}" x2="${x}" y2="${
        top + rows.length * rowHeight - 8
      }" stroke="${tick === 0 ? palette.ink : palette.grid}" stroke-width="${
        tick === 0 ? 1.5 : 1
      }"/>`
    );
    body.push(
      textNode(
        x,
        top - 32,
        signedNumber(tick),
        { fill: palette.muted, size: 10, mono: true, anchor: "middle" },
        palette
      )
    );
  }
  body.push(
    textNode(
      plotX,
      66,
      `Favors ${truncate(spec.competitorName, 25)}`,
      { fill: palette.muted, size: 11, anchor: "start" },
      palette
    )
  );
  body.push(
    textNode(
      plotX + plotWidth,
      66,
      "Favors our team",
      { fill: palette.muted, size: 11, anchor: "end" },
      palette
    )
  );
  body.push(
    textNode(
      centerX,
      82,
      "Evidence-adjusted score difference",
      { fill: palette.muted, size: 11, weight: 700, anchor: "middle" },
      palette
    )
  );

  rows.forEach((row, index) => {
    const y = top + index * rowHeight;
    const label = row?.name || "Unnamed criterion";
    const weightLabel =
      row.weight === null ? "weight Unknown" : `weight ${formatNumber(row.weight)}`;
    const valueLabel = row.delta === null ? "Unknown" : signedNumber(row.delta);
    body.push(`<g aria-label="${escapeSvgText(`${label}: ${valueLabel}`)}">`);
    body.push(
      `<title>${escapeSvgText(
        `${label}: ${valueLabel} evidence-adjusted points; ${weightLabel}`
      )}</title>`
    );
    body.push(
      textNode(
        labelX,
        y + 15,
        truncate(label, 34),
        { fill: palette.ink, size: 13, weight: 650 },
        palette
      )
    );
    body.push(
      textNode(labelX, y + 33, weightLabel, { fill: palette.muted, size: 10 }, palette)
    );
    if (row.delta === null) {
      body.push(
        `<line x1="${plotX}" y1="${y + 12}" x2="${plotX + plotWidth}" y2="${
          y + 12
        }" stroke="${palette.muted}" stroke-dasharray="5 5"/>`
      );
    } else {
      const barWidth = (Math.abs(row.delta) / 8) * plotWidth;
      const x = row.delta < 0 ? centerX - barWidth : centerX;
      body.push(
        `<rect x="${x}" y="${y + 2}" width="${barWidth}" height="20" rx="2" fill="${
          row.delta < 0 ? `url(#${negativePatternId})` : palette.accent
        }" stroke="${palette.accentDark}"/>`
      );
    }
    body.push(
      textNode(
        plotX + plotWidth + 18,
        y + 17,
        valueLabel,
        { fill: palette.ink, size: 13, weight: 750, mono: true },
        palette
      )
    );
    body.push("</g>");
  });
  if (omitted) {
    body.push(
      textNode(
        labelX,
        height - 12,
        `Showing ${rows.length} of ${totalRows} criteria, sorted by weighted magnitude.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }

  return svgFrame({
    type: "criterion-deltas",
    title: spec.title || "Criterion advantages and disadvantages",
    description:
      spec.description ||
      "Signed evidence-adjusted score differences with a visible zero reference line.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderScenarioRangeSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const estimate = normalizeScenario(spec.estimate);
  if (!estimate) {
    return emptySvg(
      "scenario-range",
      spec.title || "Scenario estimate and uncertainty",
      spec.description || "",
      "A scenario estimate is unavailable until criteria and at least one competitor are scored.",
      options
    );
  }

  const width = 820;
  const height = 246;
  const plotX = 80;
  const plotWidth = 660;
  const y = 118;
  const valueX = plotX + (estimate.value / 100) * plotWidth;
  const hasPrior = estimate.prior !== null;
  const hasTrust = estimate.trust !== null;
  const hasRange = estimate.low !== null && estimate.high !== null;
  const priorX = hasPrior ? plotX + (estimate.prior / 100) * plotWidth : null;
  const lowX = hasRange ? plotX + (estimate.low / 100) * plotWidth : null;
  const highX = hasRange ? plotX + (estimate.high / 100) * plotWidth : null;
  const missingContext = !hasPrior || !hasTrust || !hasRange;
  const body = [];

  for (const tick of [0, 25, 50, 75, 100]) {
    const x = plotX + (tick / 100) * plotWidth;
    body.push(
      `<line x1="${x}" y1="${y - 28}" x2="${x}" y2="${y + 36}" stroke="${palette.grid}"/>`
    );
    body.push(
      textNode(
        x,
        y + 58,
        `${tick}%`,
        { fill: palette.muted, size: 10, mono: true, anchor: "middle" },
        palette
      )
    );
  }
  body.push(
    `<line x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}" stroke="${palette.track}" stroke-width="12" stroke-linecap="round"/>`
  );
  if (hasRange) {
    body.push(
      `<line x1="${lowX}" y1="${y}" x2="${highX}" y2="${y}" stroke="${palette.accentOpen}" stroke-width="18" stroke-linecap="round"/>`
    );
    body.push(
      `<line x1="${lowX}" y1="${y - 14}" x2="${lowX}" y2="${y + 14}" stroke="${palette.accentDark}" stroke-width="2"/><line x1="${highX}" y1="${y - 14}" x2="${highX}" y2="${y + 14}" stroke="${palette.accentDark}" stroke-width="2"/>`
    );
  }
  if (hasPrior) {
    body.push(
      `<polygon points="${priorX},${y - 24} ${priorX + 7},${y - 17} ${priorX},${
        y - 10
      } ${priorX - 7},${y - 17}" fill="${palette.surface}" stroke="${palette.comparator}" stroke-width="2"><title>Prior estimate: ${estimate.prior}%</title></polygon>`
    );
  }
  body.push(
    `<circle cx="${valueX}" cy="${y}" r="9" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="2"><title>Scenario estimate: ${estimate.value}%</title></circle>`
  );
  body.push(
    textNode(
      valueX,
      y - 35,
      `${estimate.value}% estimate`,
      { fill: palette.ink, size: 13, weight: 750, mono: true, anchor: "middle" },
      palette
    )
  );
  body.push(
    textNode(
      plotX,
      74,
      hasRange
        ? `Uncertainty range ${estimate.low}–${estimate.high}%`
        : "Uncertainty range Unknown",
      { fill: palette.ink, size: 13, weight: 700 },
      palette
    )
  );
  body.push(
    textNode(
      plotX + plotWidth,
      74,
      `Prior ${percent(estimate.prior)} · Trust ${percent(estimate.trust)}`,
      { fill: palette.muted, size: 12, mono: true, anchor: "end" },
      palette
    )
  );
  body.push(
    textNode(
      plotX,
      height - 20,
      missingContext
        ? "Planning estimate, not a forecast. Missing prior, trust, or range values are shown as Unknown."
        : "Planning estimate, not a forecast. The range widens as evidence coverage or confidence falls.",
      { fill: palette.muted, size: 11 },
      palette
    )
  );

  return svgFrame({
    type: "scenario-range",
    title: spec.title || "Scenario estimate and uncertainty",
    description:
      `${
        spec.description ||
        "Planning estimate, uncertainty range, prior estimate, and trust on a zero-to-one-hundred scale."
      }${
        missingContext
          ? " One or more contextual values were unavailable and remain Unknown."
          : ""
      }`,
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderEvidenceGridSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxRows = boundedInteger(options.maxRows, 4, 50, 14);
  const allRows = collection(spec.rows);
  const rows = allRows.slice(0, maxRows);
  if (!rows.length) {
    return emptySvg(
      "evidence-grid",
      spec.title || "Evidence coverage and conflict",
      spec.description || "",
      "Add criteria and evidence to display coverage and conflicts.",
      options
    );
  }

  const columns = [
    { key: "score", label: "Score" },
    { key: "linked", label: "Evidence" },
    { key: "support", label: "Supports" },
    { key: "challenge", label: "Challenges" },
    { key: "conflict", label: "Conflict" }
  ];
  const labelWidth = 288;
  const cellWidth = 102;
  const rowHeight = 48;
  const top = 108;
  const totalRows = Math.max(allRows.length, Math.trunc(finite(spec.totalRows, 0) || 0));
  const omitted = totalRows - rows.length;
  const width = labelWidth + columns.length * cellWidth + 24;
  const height = top + rows.length * rowHeight + (omitted ? 40 : 18);
  const ids = frameIds("evidence-grid", options);
  const conflictPatternId = `${ids.base}-conflict`;
  const body = [
    `<defs><pattern id="${conflictPatternId}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${palette.track}"/><line x1="0" y1="0" x2="0" y2="8" stroke="${palette.comparator}" stroke-width="2"/></pattern></defs>`
  ];

  body.push(
    textNode(
      18,
      72,
      "Criterion · weight · assessment",
      { fill: palette.muted, size: 11, weight: 700 },
      palette
    )
  );
  columns.forEach((column, index) => {
    body.push(
      textNode(
        labelWidth + index * cellWidth + cellWidth / 2,
        72,
        column.label,
        { fill: palette.ink, size: 11, weight: 700, anchor: "middle" },
        palette
      )
    );
  });

  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * rowHeight;
    const scoreValue = score(row?.score);
    const values = {
      score: scoreValue === null ? "Unknown" : `${formatNumber(scoreValue)}/5`,
      linked: countValue(row?.linked),
      support: countValue(row?.support),
      challenge: countValue(row?.challenge),
      conflict: row?.conflict ? "Yes" : "No"
    };
    const weightLabel =
      finite(row?.weight, 0) === null ? "weight Unknown" : `weight ${formatNumber(row.weight)}`;
    body.push(
      `<g aria-label="${escapeSvgText(
        `${row?.name || "Unnamed criterion"}: ${Object.entries(values)
          .map(([key, value]) => `${key} ${value}`)
          .join(", ")}`
      )}"><title>${escapeSvgText(
        `${row?.name || "Unnamed criterion"}; ${weightLabel}; ${
          row?.classification || "Missing"
        } assessment`
      )}</title>`
    );
    body.push(
      textNode(
        18,
        y + 17,
        truncate(row?.name || "Unnamed criterion", 31),
        { fill: palette.ink, size: 12, weight: 650 },
        palette
      )
    );
    body.push(
      textNode(
        18,
        y + 34,
        `${weightLabel} · ${row?.classification || "Missing"}`,
        { fill: palette.muted, size: 10 },
        palette
      )
    );
    columns.forEach((column, columnIndex) => {
      const x = labelWidth + columnIndex * cellWidth;
      const value = values[column.key];
      const fill =
        column.key === "conflict" && row?.conflict
          ? `url(#${conflictPatternId})`
          : column.key === "score" && scoreValue === null
            ? palette.track
            : evidenceTone(column.key, row, palette);
      body.push(
        `<rect x="${x + 4}" y="${y}" width="${cellWidth - 8}" height="${
          rowHeight - 7
        }" rx="3" fill="${fill}" stroke="${
          column.key === "conflict" && row?.conflict ? palette.comparator : palette.grid
        }"/>`
      );
      const darkCell =
        (column.key === "score" && scoreValue !== null) ||
        (["linked", "support", "challenge"].includes(column.key) &&
          Number(row?.[column.key]) > 0);
      body.push(
        textNode(
          x + cellWidth / 2,
          y + 25,
          value,
          {
            fill: darkCell ? palette.onAccentDark : palette.ink,
            size: value === "Unknown" ? 10 : 12,
            weight: 750,
            mono: true,
            anchor: "middle"
          },
          palette
        )
      );
    });
    body.push("</g>");
  });
  if (omitted) {
    body.push(
      textNode(
        18,
        height - 10,
        `Showing ${rows.length} of ${totalRows} criteria.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }

  return svgFrame({
    type: "evidence-grid",
    title: spec.title || "Evidence coverage and conflict",
    description:
      spec.description ||
      "Exact criterion-level evidence counts, score availability, and conflict indicators.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderEvidenceRelationshipsSvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxNodes = boundedInteger(options.maxNodesPerSide, 3, 20, 9);
  const allEvidence = collection(spec.evidence);
  const allCriteria = collection(spec.criteria);
  const evidence = allEvidence.slice(0, maxNodes);
  const criteria = allCriteria.slice(0, maxNodes);
  if (!evidence.length || !criteria.length) {
    return emptySvg(
      "evidence-relationships",
      spec.title || "Evidence-to-criterion relationships",
      spec.description || "",
      "Add both evidence and criteria to display traceability relationships.",
      options
    );
  }

  const evidenceIds = new Set(evidence.map(item => item.id));
  const criterionIds = new Set(criteria.map(item => item.id));
  const links = collection(spec.links).filter(
    item => evidenceIds.has(item.evidenceId) && criterionIds.has(item.criterionId)
  );
  const linkedEvidence = new Set(links.map(item => item.evidenceId));
  const linkedCriteria = new Set(links.map(item => item.criterionId));
  const width = 920;
  const top = 126;
  const rowHeight = 64;
  const nodeHeight = 44;
  const leftX = 24;
  const leftWidth = 300;
  const rightX = 596;
  const rightWidth = 300;
  const count = Math.max(evidence.length, criteria.length);
  const totalEvidence = Math.max(
    allEvidence.length,
    Math.trunc(finite(spec.totalEvidence, 0) || 0)
  );
  const totalCriteria = Math.max(
    allCriteria.length,
    Math.trunc(finite(spec.totalCriteria, 0) || 0)
  );
  const totalLinks = Math.max(
    links.length,
    Math.trunc(finite(spec.totalLinks, 0) || 0)
  );
  const omitted =
    totalEvidence - evidence.length + (totalCriteria - criteria.length) + (totalLinks - links.length);
  const height = top + count * rowHeight + (omitted ? 50 : 26);
  const evidencePosition = new Map();
  const criterionPosition = new Map();
  evidence.forEach((item, index) => evidencePosition.set(item.id, top + index * rowHeight));
  criteria.forEach((item, index) => criterionPosition.set(item.id, top + index * rowHeight));
  const body = [];

  body.push(
    textNode(
      leftX,
      72,
      `Evidence (${totalEvidence})`,
      { fill: palette.ink, size: 13, weight: 750 },
      palette
    )
  );
  body.push(
    textNode(
      rightX,
      72,
      `Evaluation criteria (${totalCriteria})`,
      { fill: palette.ink, size: 13, weight: 750 },
      palette
    )
  );
  body.push(
    textNode(
      width / 2,
      95,
      "Solid support · Dashed challenge · Dotted context/neutral",
      { fill: palette.muted, size: 10, anchor: "middle" },
      palette
    )
  );

  links.forEach(link => {
    const y1 = evidencePosition.get(link.evidenceId) + nodeHeight / 2;
    const y2 = criterionPosition.get(link.criterionId) + nodeHeight / 2;
    const evidenceLabel =
      evidence.find(item => item.id === link.evidenceId)?.label || "Unnamed evidence";
    const criterionLabel =
      criteria.find(item => item.id === link.criterionId)?.label || "Unnamed criterion";
    body.push(
      `<path d="M ${leftX + leftWidth} ${y1} C 430 ${y1}, 490 ${y2}, ${rightX} ${y2}" fill="none" stroke="${relationshipColor(
        link.stance,
        palette
      )}" stroke-width="1.75" stroke-dasharray="${relationshipDash(
        link.stance
      )}" opacity="0.9"><title>${escapeSvgText(
        `${evidenceLabel} to ${criterionLabel}: ${link.stance || "Neutral"}`
      )}</title></path>`
    );
  });

  evidence.forEach((item, index) => {
    const y = top + index * rowHeight;
    const linked = linkedEvidence.has(item.id);
    body.push(
      `<g aria-label="${escapeSvgText(
        `${item?.label || "Unnamed evidence"}; ${linked ? "linked" : "unlinked"}`
      )}"><title>${escapeSvgText(item?.label || "Unnamed evidence")}</title><rect x="${leftX}" y="${y}" width="${leftWidth}" height="${nodeHeight}" rx="4" fill="${
        linked ? palette.track : "none"
      }" stroke="${linked ? palette.accentDark : palette.muted}" stroke-dasharray="${
        linked ? "" : "5 4"
      }"/>`
    );
    body.push(
      textNode(
        leftX + 12,
        y + 18,
        truncate(item?.label || "Unnamed evidence", 39),
        { fill: palette.ink, size: 11, weight: 650 },
        palette
      )
    );
    body.push(
      textNode(
        leftX + 12,
        y + 34,
        `${item?.classification || "Missing"} · ${item?.stance || "Neutral"}${
          linked ? "" : " · Unlinked"
        }`,
        { fill: palette.muted, size: 9 },
        palette
      )
    );
    body.push("</g>");
  });

  criteria.forEach((item, index) => {
    const y = top + index * rowHeight;
    const linked = linkedCriteria.has(item.id);
    const weight = finite(item?.weight, 0);
    body.push(
      `<g aria-label="${escapeSvgText(
        `${item?.label || "Unnamed criterion"}; ${linked ? "has evidence" : "no linked evidence"}`
      )}"><title>${escapeSvgText(item?.label || "Unnamed criterion")}</title><rect x="${rightX}" y="${y}" width="${rightWidth}" height="${nodeHeight}" rx="4" fill="${
        linked ? palette.track : "none"
      }" stroke="${linked ? palette.comparator : palette.muted}" stroke-dasharray="${
        linked ? "" : "5 4"
      }"/>`
    );
    body.push(
      textNode(
        rightX + 12,
        y + 18,
        truncate(item?.label || "Unnamed criterion", 38),
        { fill: palette.ink, size: 11, weight: 650 },
        palette
      )
    );
    body.push(
      textNode(
        rightX + 12,
        y + 34,
        `${weight === null ? "Weight Unknown" : `Weight ${formatNumber(weight)}`}${
          linked ? "" : " · No linked evidence"
        }`,
        { fill: palette.muted, size: 9 },
        palette
      )
    );
    body.push("</g>");
  });
  if (omitted) {
    body.push(
      textNode(
        leftX,
        height - 12,
        `Showing ${evidence.length} of ${totalEvidence} evidence records, ${criteria.length} of ${totalCriteria} criteria, and ${links.length} of ${totalLinks} relationships.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }

  return svgFrame({
    type: "evidence-relationships",
    title: spec.title || "Evidence-to-criterion relationships",
    description:
      spec.description ||
      "Traceability diagram connecting evidence records to evaluation criteria using line patterns for stance.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderRunHistorySvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const maxPoints = boundedInteger(options.maxPoints, 2, 24, 12);
  const allPoints = collection(spec.points);
  const points = allPoints.slice(-maxPoints);
  if (points.length < 2) {
    return renderHistoryFallback(spec, points, options);
  }

  const width = 940;
  const height = 430;
  const plotX = 60;
  const plotY = 114;
  const plotWidth = 700;
  const plotHeight = 230;
  const xFor = index =>
    plotX + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = value => plotY + plotHeight - (value / 100) * plotHeight;
  const body = [];

  for (const tick of [0, 25, 50, 75, 100]) {
    const y = yFor(tick);
    body.push(
      `<line x1="${plotX}" y1="${y}" x2="${plotX + plotWidth}" y2="${y}" stroke="${
        palette.grid
      }"/>`
    );
    body.push(
      textNode(
        plotX - 12,
        y + 4,
        String(tick),
        { fill: palette.muted, size: 10, mono: true, anchor: "end" },
        palette
      )
    );
  }
  body.push(
    textNode(
      plotX,
      76,
      `${points.length} saved report checkpoints · zero-to-100 scale`,
      { fill: palette.muted, size: 11 },
      palette
    )
  );

  const visibleSeries = HISTORY_SERIES.filter(series =>
    points.some(point => finite(point?.[series.key], 0, 100) !== null)
  );
  visibleSeries.forEach((series, seriesIndex) => {
    const color = palette[series.color] || palette.accent;
    const segments = lineSegments(points, series.key, xFor, yFor);
    for (const segment of segments) {
      if (segment.length < 2) continue;
      body.push(
        `<path d="${segment
          .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
          .join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${
          series.dash
        }"/>`
      );
    }
    points.forEach((point, pointIndex) => {
      const value = finite(point?.[series.key], 0, 100);
      if (value === null) return;
      body.push(
        markerShape(
          series.marker,
          xFor(pointIndex),
          yFor(value),
          color,
          palette.surface,
          `${series.label}, ${point.label || `run ${pointIndex + 1}`}: ${formatNumber(value)}`
        )
      );
    });
    const latest = [...points]
      .reverse()
      .find(point => finite(point?.[series.key], 0, 100) !== null);
    const latestValue = latest ? finite(latest[series.key], 0, 100) : null;
    const legendY = 112 + seriesIndex * 38;
    body.push(
      `<line x1="790" y1="${legendY}" x2="820" y2="${legendY}" stroke="${color}" stroke-width="2" stroke-dasharray="${series.dash}"/>`
    );
    body.push(markerShape(series.marker, 805, legendY, color, palette.surface, series.label));
    body.push(
      textNode(
        832,
        legendY + 4,
        `${series.label}: ${latestValue === null ? "Unknown" : formatNumber(latestValue)}`,
        { fill: palette.ink, size: 10, weight: 650 },
        palette
      )
    );
  });

  points.forEach((point, index) => {
    const x = xFor(index);
    body.push(
      `<line x1="${x}" y1="${plotY + plotHeight}" x2="${x}" y2="${
        plotY + plotHeight + 5
      }" stroke="${palette.grid}"/>`
    );
    body.push(
      textNode(
        x,
        plotY + plotHeight + 22,
        truncate(point?.label || `Run ${index + 1}`, 12),
        { fill: palette.muted, size: 9, anchor: "middle" },
        palette
      )
    );
  });
  body.push(
    textNode(
      plotX,
      height - 24,
      `${
        allPoints.length > points.length
          ? `Showing the latest ${points.length} of ${allPoints.length} runs. `
          : ""
      }Lines connect discrete saved runs; no values are inferred between checkpoints.`,
      { fill: palette.muted, size: 11 },
      palette
    )
  );

  return svgFrame({
    type: "run-history",
    title: spec.title || "Saved analysis history",
    description:
      spec.description ||
      "Saved scored analysis checkpoints on a zero-to-one-hundred scale.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderActionSummarySvg(spec = {}, options = {}) {
  const palette = paletteFor(options);
  const actions = collection(spec.actions);
  const compactCounts = collection(spec.counts)
    .map(item => ({
      priority: PRIORITIES.includes(item?.priority) ? item.priority : "Other",
      status: ACTION_STATUSES.includes(item?.status) ? item.status : "Other",
      count: Math.max(0, Math.trunc(finite(item?.count, 0) || 0))
    }))
    .filter(item => item.count > 0);
  if (!actions.length && !compactCounts.length) {
    return emptySvg(
      "action-summary",
      spec.title || "Action priority and status",
      spec.description || "",
      "No actions are recorded for this pursuit.",
      options
    );
  }

  const includeOtherPriority =
    actions.some(item => !PRIORITIES.includes(item?.priority)) ||
    compactCounts.some(item => item.priority === "Other");
  const includeOtherStatus =
    actions.some(item => !ACTION_STATUSES.includes(item?.status)) ||
    compactCounts.some(item => item.status === "Other");
  const priorities = [...PRIORITIES, ...(includeOtherPriority ? ["Other"] : [])];
  const statuses = [...ACTION_STATUSES, ...(includeOtherStatus ? ["Other"] : [])];
  const counts = new Map();
  for (const action of actions) {
    const priority = PRIORITIES.includes(action?.priority) ? action.priority : "Other";
    const status = ACTION_STATUSES.includes(action?.status) ? action.status : "Other";
    const key = `${priority}\u0000${status}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const item of compactCounts) {
    const key = `${item.priority}\u0000${item.status}`;
    counts.set(key, (counts.get(key) || 0) + item.count);
  }
  const labelWidth = 160;
  const cellWidth = 118;
  const rowHeight = 54;
  const top = 112;
  const width = labelWidth + statuses.length * cellWidth + 96;
  const height = top + priorities.length * rowHeight + 58;
  const body = [];

  statuses.forEach((status, index) => {
    body.push(
      textNode(
        labelWidth + index * cellWidth + cellWidth / 2,
        74,
        status,
        { fill: palette.ink, size: 11, weight: 700, anchor: "middle" },
        palette
      )
    );
  });
  body.push(
    textNode(
      labelWidth + statuses.length * cellWidth + 44,
      74,
      "Total",
      { fill: palette.muted, size: 11, weight: 700, anchor: "middle" },
      palette
    )
  );

  priorities.forEach((priority, rowIndex) => {
    const y = top + rowIndex * rowHeight;
    body.push(
      textNode(
        18,
        y + 29,
        priority,
        { fill: palette.ink, size: 13, weight: 700 },
        palette
      )
    );
    let rowTotal = 0;
    statuses.forEach((status, columnIndex) => {
      const count = counts.get(`${priority}\u0000${status}`) || 0;
      rowTotal += count;
      const x = labelWidth + columnIndex * cellWidth;
      body.push(
        `<g aria-label="${escapeSvgText(`${priority}, ${status}: ${count}`)}"><title>${escapeSvgText(
          `${priority} priority, ${status}: ${count} action${count === 1 ? "" : "s"}`
        )}</title><rect x="${x + 5}" y="${y}" width="${cellWidth - 10}" height="${
          rowHeight - 8
        }" rx="3" fill="${count ? palette.actionFill : palette.track}" stroke="${
          count ? palette.accentDark : palette.grid
        }"/>`
      );
      body.push(
        textNode(
          x + cellWidth / 2,
          y + 29,
          String(count),
          {
            fill: count ? palette.actionText : palette.ink,
            size: 14,
            weight: 800,
            mono: true,
            anchor: "middle"
          },
          palette
        )
      );
      body.push("</g>");
    });
    body.push(
      textNode(
        labelWidth + statuses.length * cellWidth + 44,
        y + 29,
        String(rowTotal),
        { fill: palette.ink, size: 14, weight: 800, mono: true, anchor: "middle" },
        palette
      )
    );
  });
  const countedTotal = [...counts.values()].reduce((total, count) => total + count, 0);
  const totalActions = Math.max(
    countedTotal,
    Math.trunc(finite(spec.totalActions, 0) || 0)
  );
  const complete = priorities.reduce(
    (total, priority) => total + (counts.get(`${priority}\u0000Complete`) || 0),
    0
  );
  const unresolved = totalActions - complete;
  body.push(
    textNode(
      18,
      height - 20,
      `${totalActions} total actions · ${unresolved} unresolved · ${complete} complete`,
      { fill: palette.muted, size: 11, weight: 650 },
      palette
    )
  );

  return svgFrame({
    type: "action-summary",
    title: spec.title || "Action priority and status",
    description:
      spec.description || "Exact action counts in a priority-by-status matrix.",
    width,
    height,
    body: body.join(""),
    options
  });
}

export function renderVisualizationSvg(spec = {}, options = {}) {
  const renderers = {
    "ranked-cpi": renderRankedCpiSvg,
    "score-heatmap": renderScoreHeatmapSvg,
    "criterion-deltas": renderCriterionDeltaSvg,
    "scenario-range": renderScenarioRangeSvg,
    "evidence-grid": renderEvidenceGridSvg,
    "evidence-relationships": renderEvidenceRelationshipsSvg,
    "run-history": renderRunHistorySvg,
    "action-summary": renderActionSummarySvg
  };
  const renderer = renderers[spec?.type];
  if (!renderer) {
    return emptySvg(
      "unsupported",
      "Visualization unavailable",
      "The requested visualization type is not supported.",
      `Unknown visualization type: ${spec?.type || "Unknown"}.`,
      options
    );
  }
  return renderer(spec, options);
}

export function renderVisualizationSet(specs = {}, options = {}) {
  const result = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (name === "schemaVersion" || name === "pursuitId" || !spec?.type) continue;
    result[name] = renderVisualizationSvg(spec, {
      ...options,
      idPrefix: `${options.idPrefix || "bha"}-${name}`
    });
  }
  return result;
}

function renderHistoryFallback(spec, points, options) {
  const palette = paletteFor(options);
  const width = 860;
  const height = points.length ? 270 : 210;
  const body = [];
  const message = points.length
    ? "One scored run is available. Save another scored report before interpreting change."
    : "No scored report runs are available. Generate a report to establish the first checkpoint.";
  body.push(
    textNode(28, 88, message, { fill: palette.muted, size: 13, weight: 650 }, palette)
  );
  if (points.length) {
    const point = points[0];
    const metrics = [
      ["Our CPI", finite(point.ourCpi, 0, 100)],
      ["Rival CPI", finite(point.rivalCpi, 0, 100)],
      ["Scenario", finite(point.scenario, 0, 100)],
      ["Coverage", finite(point.coverage, 0, 100)],
      ["Confidence", finite(point.confidence, 0, 100)]
    ];
    metrics.forEach(([label, value], index) => {
      const x = 28 + index * 162;
      body.push(
        `<rect x="${x}" y="118" width="146" height="76" rx="4" fill="${palette.track}" stroke="${palette.grid}"/>`
      );
      body.push(
        textNode(x + 12, 143, label, { fill: palette.muted, size: 10, weight: 700 }, palette)
      );
      body.push(
        textNode(
          x + 12,
          177,
          value === null ? "Unknown" : formatNumber(value),
          {
            fill: palette.ink,
            size: value === null ? 13 : 24,
            weight: 800,
            mono: true
          },
          palette
        )
      );
    });
    body.push(
      textNode(
        28,
        height - 22,
        `Checkpoint: ${point.label || "Saved run"}. No trend line is drawn from one point.`,
        { fill: palette.muted, size: 11 },
        palette
      )
    );
  }
  return svgFrame({
    type: "run-history",
    title: spec.title || "Saved analysis history",
    description:
      spec.description ||
      "A trend requires at least two saved scored report checkpoints.",
    width,
    height,
    body: body.join(""),
    options
  });
}

function svgFrame({ type, title, description, width, height, body, options }) {
  const palette = paletteFor(options);
  const ids = frameIds(type, options);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${ids.title} ${ids.description}" focusable="false" preserveAspectRatio="xMinYMin meet" font-family="Inter,Segoe UI,Arial,sans-serif"><title id="${ids.title}">${escapeSvgText(
    title
  )}</title><desc id="${ids.description}">${escapeSvgText(
    description
  )}</desc><rect x="0" y="0" width="${width}" height="${height}" fill="${
    options.background === true ? palette.surface : "transparent"
  }"/>${textNode(
    20,
    34,
    title,
    { fill: palette.ink, size: 18, weight: 800 },
    palette
  )}${body}</svg>`;
}

function emptySvg(type, title, description, message, options) {
  const palette = paletteFor(options);
  return svgFrame({
    type,
    title,
    description: `${description || ""} ${message}`.trim(),
    width: 820,
    height: 190,
    body: `<rect x="20" y="64" width="780" height="94" rx="4" fill="none" stroke="${
      palette.grid
    }" stroke-dasharray="6 5"/>${textNode(
      410,
      116,
      message,
      { fill: palette.muted, size: 13, weight: 650, anchor: "middle" },
      palette
    )}`,
    options
  });
}

function textNode(x, y, value, style = {}, palette = DARK_PALETTE) {
  const attributes = [
    `x="${round(x, 2)}"`,
    `y="${round(y, 2)}"`,
    `fill="${style.fill || palette.ink}"`,
    `font-size="${style.size || 12}"`,
    `font-weight="${style.weight || 400}"`,
    `text-anchor="${style.anchor || "start"}"`
  ];
  if (style.letterSpacing) attributes.push(`letter-spacing="${style.letterSpacing}"`);
  if (style.mono) attributes.push('font-family="ui-monospace,SFMono-Regular,Consolas,monospace"');
  return `<text ${attributes.join(" ")}>${escapeSvgText(value)}</text>`;
}

function frameIds(type, options = {}) {
  const raw = options.idPrefix || `bha-${type}`;
  const base = String(raw)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || `bha-${type}`;
  return {
    base,
    title: `${base}-title`,
    description: `${base}-description`
  };
}

function paletteFor(options = {}) {
  return options.theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}

function axisGrid(x, y, width, height, palette) {
  return [0, 25, 50, 75, 100]
    .map(tick => {
      const tickX = x + (tick / 100) * width;
      return `<line x1="${tickX}" y1="${y}" x2="${tickX}" y2="${
        y + height
      }" stroke="${palette.grid}"/>${textNode(
        tickX,
        y - 8,
        String(tick),
        { fill: palette.muted, size: 10, mono: true, anchor: "middle" },
        palette
      )}`;
    })
    .join("");
}

function heatTone(value, palette) {
  if (value >= 4.5) return palette.accentOpen;
  if (value >= 3.5) return palette.accent;
  if (value >= 2.5) return palette.accentDark;
  if (value >= 1.5) return palette.track;
  return palette.surface;
}

function heatTextTone(value, palette) {
  if (value === null || value < 2.5 || value >= 4.5) return palette.ink;
  return value >= 3.5 ? palette.onAccent : palette.onAccentDark;
}

function evidenceTone(key, row, palette) {
  if (key === "conflict") return row?.conflict ? palette.comparatorOpen : palette.track;
  if (key === "score") return score(row?.score) === null ? palette.track : palette.accentDark;
  const count = Number(row?.[key]) || 0;
  return count ? palette.accentDark : palette.track;
}

function relationshipDash(stance) {
  if (stance === "Support") return "";
  if (stance === "Challenge") return "8 5";
  return "2 5";
}

function relationshipColor(stance, palette) {
  if (stance === "Challenge") return palette.comparator;
  if (stance === "Support") return palette.accent;
  return palette.muted;
}

function markerShape(shape, x, y, stroke, fill, title) {
  const safeTitle = `<title>${escapeSvgText(title)}</title>`;
  if (shape === "square") {
    return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${fill}" stroke="${stroke}" stroke-width="2">${safeTitle}</rect>`;
  }
  if (shape === "diamond") {
    return `<polygon points="${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}" fill="${fill}" stroke="${stroke}" stroke-width="2">${safeTitle}</polygon>`;
  }
  if (shape === "triangle") {
    return `<polygon points="${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}" fill="${fill}" stroke="${stroke}" stroke-width="2">${safeTitle}</polygon>`;
  }
  if (shape === "cross") {
    return `<g stroke="${stroke}" stroke-width="2">${safeTitle}<line x1="${x - 5}" y1="${
      y - 5
    }" x2="${x + 5}" y2="${y + 5}"/><line x1="${x + 5}" y1="${y - 5}" x2="${
      x - 5
    }" y2="${y + 5}"/></g>`;
  }
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="${fill}" stroke="${stroke}" stroke-width="2">${safeTitle}</circle>`;
}

function lineSegments(points, key, xFor, yFor) {
  const segments = [];
  let segment = [];
  points.forEach((point, index) => {
    const value = finite(point?.[key], 0, 100);
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    segment.push({ x: round(xFor(index), 2), y: round(yFor(value), 2) });
  });
  if (segment.length) segments.push(segment);
  return segments;
}

function normalizeScenario(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const value = finite(candidate.value, 0, 100);
  if (value === null) return null;
  const prior = finite(candidate.prior, 0, 100);
  const trust = finite(candidate.trust, 0, 100);
  const low = finite(candidate.low, 0, 100);
  const high = finite(candidate.high, 0, 100);
  const hasRange = low !== null && high !== null;
  return {
    value,
    prior,
    trust,
    low: hasRange ? Math.min(low, high) : low,
    high: hasRange ? Math.max(low, high) : high
  };
}

function collection(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
}

function stringCollection(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
}

function finite(value, minimum = -Infinity, maximum = Infinity) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function score(value) {
  return finite(value, 1, 5);
}

function countValue(value) {
  const number = finite(value, 0);
  return number === null ? "Unknown" : String(Math.floor(number));
}

function firstFinite(value) {
  return value === null || value === undefined ? null : value;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unknown";
  return Number.isInteger(number) ? String(number) : String(round(number, 1));
}

function signedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unknown";
  if (number > 0) return `+${formatNumber(number)}`;
  return formatNumber(number);
}

function percent(value) {
  return value === null || value === undefined ? "Unknown" : `${formatNumber(value)}%`;
}

function round(value, decimals = 2) {
  const power = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * power) / power;
}

function truncate(value, limit) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function truncateUtf8(value, maxBytes) {
  const text = String(value ?? "");
  if (utf8ByteLength(text) <= maxBytes) return text;
  const suffix = "…";
  const budget = Math.max(0, maxBytes - utf8ByteLength(suffix));
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > budget) break;
    result += character;
    bytes += characterBytes;
  }
  return `${result}${suffix}`;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function competitorName(competitors, id) {
  return competitors.find(item => item.id === id)?.name || "Unnamed competitor";
}

function historyLabel(run) {
  const date = String(run?.createdAt || run?.date || "").slice(0, 10);
  if (date) return date;
  if (run?.version) return `Version ${run.version}`;
  return run?.title || "Saved run";
}
