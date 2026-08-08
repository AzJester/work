import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateCompetitiveScores } from "../black-hat-agent/engine.js";
import {
  REPORT_VISUAL_SNAPSHOT_MAX_BYTES,
  REPORT_VISUAL_SNAPSHOT_VERSION,
  VISUALIZATION_SCHEMA_VERSION,
  buildRunVisualizationSnapshot,
  buildVisualizationSpecs,
  escapeSvgText,
  renderActionSummarySvg,
  renderCriterionDeltaSvg,
  renderEvidenceGridSvg,
  renderEvidenceRelationshipsSvg,
  renderRankedCpiSvg,
  renderRunHistorySvg,
  renderScenarioRangeSvg,
  renderScoreHeatmapSvg,
  renderVisualizationSet,
  renderVisualizationSvg,
  utf8ByteLength
} from "../black-hat-agent/visualizations.js";

const styles = readFileSync(
  new URL("../black-hat-agent/styles.css", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../black-hat-agent/app.js", import.meta.url),
  "utf8"
);

function workspaceFixture() {
  return {
    schemaVersion: 2,
    active: "p1",
    pursuits: [
      {
        id: "p1",
        name: "Satellite pursuit",
        customer: "Example customer",
        priorEstimate: 50
      }
    ],
    criteria: [
      {
        id: "c1",
        pursuitId: "p1",
        name: "Technical merit",
        weight: 60,
        ourScore: 5,
        classification: "Confirmed",
        evidenceIds: ["e1", "e2"]
      },
      {
        id: "c2",
        pursuitId: "p1",
        name: "Price",
        weight: 40,
        ourScore: "",
        classification: "Missing",
        evidenceIds: []
      }
    ],
    evidence: [
      {
        id: "e1",
        pursuitId: "p1",
        citation: "E-001",
        title: "Customer interview",
        classification: "Confirmed",
        stance: "Support",
        criterionIds: ["c1"]
      },
      {
        id: "e2",
        pursuitId: "p1",
        citation: "E-002",
        title: "Contrary observation",
        classification: "Inference",
        stance: "Challenge",
        criterionIds: ["c1"]
      }
    ],
    competitors: [
      {
        id: "r1",
        pursuitId: "p1",
        name: "Rival One",
        classification: "Inference",
        evidenceIds: ["e1"],
        scores: { c1: 3, c2: "" }
      }
    ],
    actions: [
      { id: "a1", pursuitId: "p1", priority: "Critical", status: "Open" },
      { id: "a2", pursuitId: "p1", priority: "High", status: "Complete" },
      { id: "a3", pursuitId: "p1", priority: "High", status: "Open" }
    ],
    playbooks: [],
    snapshots: [],
    runs: []
  };
}

function assertAccessibleSvg(svg) {
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /\brole="img"/);
  assert.match(svg, /\baria-labelledby="[^"]+-title [^"]+-description"/);
  assert.match(svg, /<title id="[^"]+-title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="[^"]+-description">[^<]+<\/desc>/);
  assert.match(svg, /\bviewBox="0 0 \d+ \d+"/);
  assert.doesNotMatch(svg, /\b(?:NaN|Infinity|undefined)\b/);
}

test("buildVisualizationSpecs creates all eight serializable visual contracts", () => {
  const workspace = workspaceFixture();
  const scores = calculateCompetitiveScores(workspace, "p1");
  workspace.runs.push({
    id: "run-1",
    pursuitId: "p1",
    title: "First run",
    createdAt: "2026-07-01T12:00:00Z",
    scoreSummary: scores
  });
  const specs = buildVisualizationSpecs(workspace, "p1", scores);
  const names = [
    "rankedCpi",
    "scoreHeatmap",
    "criterionDeltas",
    "scenarioRange",
    "evidenceGrid",
    "evidenceRelationships",
    "runHistory",
    "actionSummary"
  ];
  assert.equal(specs.schemaVersion, VISUALIZATION_SCHEMA_VERSION);
  assert.deepEqual(
    names.map(name => specs[name].type),
    [
      "ranked-cpi",
      "score-heatmap",
      "criterion-deltas",
      "scenario-range",
      "evidence-grid",
      "evidence-relationships",
      "run-history",
      "action-summary"
    ]
  );
  assert.equal(specs.evidenceRelationships.links.length, 2);
  assert.equal(specs.evidenceGrid.rows[0].conflict, true);
  assert.equal(specs.scoreHeatmap.rows[1].values.us, null);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(specs)));
});

test("all visualization renderers produce accessible dependency-free native SVG", () => {
  const workspace = workspaceFixture();
  const scores = calculateCompetitiveScores(workspace, "p1");
  workspace.runs = [
    {
      id: "run-1",
      pursuitId: "p1",
      createdAt: "2026-07-01T12:00:00Z",
      scoreSummary: scores
    },
    {
      id: "run-2",
      pursuitId: "p1",
      createdAt: "2026-07-10T12:00:00Z",
      scoreSummary: {
        ...scores,
        us: { ...scores.us, cpi: 73, coverage: 70, confidence: 65 },
        margin: 13,
        scenarioEstimate: { ...scores.scenarioEstimate, value: 60 }
      }
    }
  ];
  const specs = buildVisualizationSpecs(workspace, "p1", scores);
  const direct = [
    renderRankedCpiSvg(specs.rankedCpi),
    renderScoreHeatmapSvg(specs.scoreHeatmap),
    renderCriterionDeltaSvg(specs.criterionDeltas),
    renderScenarioRangeSvg(specs.scenarioRange),
    renderEvidenceGridSvg(specs.evidenceGrid),
    renderEvidenceRelationshipsSvg(specs.evidenceRelationships),
    renderRunHistorySvg(specs.runHistory),
    renderActionSummarySvg(specs.actionSummary)
  ];
  direct.forEach(assertAccessibleSvg);
  direct.forEach(svg => {
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<iframe\b/i);
    assert.doesNotMatch(svg, /\b(?:href|src)=/i);
  });

  const renderedSet = renderVisualizationSet(specs, {
    theme: "light",
    idPrefix: "report"
  });
  assert.deepEqual(Object.keys(renderedSet), [
    "rankedCpi",
    "scoreHeatmap",
    "criterionDeltas",
    "scenarioRange",
    "evidenceGrid",
    "evidenceRelationships",
    "runHistory",
    "actionSummary"
  ]);
  Object.values(renderedSet).forEach(assertAccessibleSvg);
});

test("hostile labels and id prefixes are escaped rather than becoming active markup", () => {
  const hostile = `"><script onload="alert(1)">Attack & win</script>`;
  const svg = renderRankedCpiSvg(
    {
      type: "ranked-cpi",
      title: hostile,
      description: hostile,
      entities: [{ name: hostile, cpi: 75, coverage: 50, confidence: 25 }]
    },
    { idPrefix: hostile }
  );
  assertAccessibleSvg(svg);
  assert.doesNotMatch(svg, /<script\b/i);
  for (const tag of svg.match(/<[^>]+>/g) || []) {
    assert.doesNotMatch(tag, /\sonload\s*=\s*["']/i);
  }
  assert.match(svg, /&lt;script onload=&quot;alert\(1\)&quot;&gt;/);
  assert.match(svg, /Attack &amp; win/);
  for (const match of svg.matchAll(/\bid="([^"]*)"/g)) {
    assert.match(match[1], /^[A-Za-z0-9_-]+$/);
  }
  assert.equal(
    escapeSvgText(`<>&"'`),
    "&lt;&gt;&amp;&quot;&#39;"
  );
});

test("unknown scores remain explicitly Unknown and are never converted to neutral", () => {
  const svg = renderScoreHeatmapSvg({
    type: "score-heatmap",
    title: "Sparse score matrix",
    description: "One unavailable score.",
    columns: [{ id: "us", name: "Our team" }],
    rows: [{ id: "c1", name: "Unscored criterion", weight: 100, values: { us: null } }]
  });
  assertAccessibleSvg(svg);
  assert.match(svg, />Unknown<\/text>/);
  assert.doesNotMatch(svg, />3(?:\.0)?\/5<\/text>/);

  const ranking = renderRankedCpiSvg({
    type: "ranked-cpi",
    title: "Sparse ranking",
    entities: [{ name: "Unknown rival", cpi: null, coverage: null, confidence: null }]
  });
  assert.match(ranking, />Unknown<\/text>/);
  assert.match(ranking, /Coverage Unknown · Confidence Unknown/);
});

test("run history uses an honest fallback until two scored checkpoints exist", () => {
  const empty = renderRunHistorySvg({
    type: "run-history",
    title: "History",
    points: []
  });
  const one = renderRunHistorySvg({
    type: "run-history",
    title: "History",
    points: [
      {
        label: "2026-07-01",
        ourCpi: 70,
        rivalCpi: null,
        scenario: null,
        coverage: 50,
        confidence: 40
      }
    ]
  });
  assertAccessibleSvg(empty);
  assertAccessibleSvg(one);
  assert.match(empty, /No scored report runs are available/);
  assert.match(one, /One scored run is available/);
  assert.match(one, /No trend line is drawn from one point/);
  assert.doesNotMatch(one, /<path\b/);
  assert.match(one, />Unknown<\/text>/);
});

test("scenario and relationship sparse states explain what is required", () => {
  const scenario = renderScenarioRangeSvg({
    type: "scenario-range",
    title: "Scenario estimate",
    estimate: null
  });
  const relationships = renderEvidenceRelationshipsSvg({
    type: "evidence-relationships",
    title: "Relationships",
    evidence: [],
    criteria: [],
    links: []
  });
  assertAccessibleSvg(scenario);
  assertAccessibleSvg(relationships);
  assert.match(scenario, /unavailable until criteria and at least one competitor are scored/i);
  assert.match(relationships, /Add both evidence and criteria/i);
});

test("light-theme chart labels and the scenario history series retain WCAG contrast", () => {
  const heatmap = renderScoreHeatmapSvg(
    {
      type: "score-heatmap",
      title: "Contrast heatmap",
      columns: [{ id: "us", name: "Our team" }],
      rows: [
        { id: "c3", name: "Score three", weight: 50, values: { us: 3 } },
        { id: "c4", name: "Score four", weight: 50, values: { us: 4 } }
      ]
    },
    { theme: "light" }
  );
  const evidence = renderEvidenceGridSvg(
    {
      type: "evidence-grid",
      title: "Evidence contrast",
      rows: [
        {
          id: "c1",
          name: "Criterion",
          weight: 100,
          score: 3,
          classification: "Inference",
          linked: 1,
          support: 1,
          challenge: 0,
          conflict: false
        }
      ]
    },
    { theme: "light" }
  );
  const actions = renderActionSummarySvg(
    {
      type: "action-summary",
      title: "Action contrast",
      actions: [{ priority: "High", status: "Open" }]
    },
    { theme: "light" }
  );
  const history = renderRunHistorySvg(
    {
      type: "run-history",
      title: "History contrast",
      points: [
        { label: "Run 1", scenario: 45 },
        { label: "Run 2", scenario: 55 }
      ]
    },
    { theme: "light" }
  );

  assert.match(heatmap, /fill="#ffffff"[^>]*>3\/5<\/text>/);
  assert.match(heatmap, /fill="#ffffff"[^>]*>4\/5<\/text>/);
  assert.match(evidence, /fill="#ffffff"[^>]*>3\/5<\/text>/);
  assert.match(actions, /fill="#d8f3ff"[^>]*stroke="#075d7d"/);
  assert.match(actions, /fill="#211a30"[^>]*>1<\/text>/);
  assert.match(history, /stroke="#075d7d"[^>]*stroke-dasharray="2 5"/);
  assert.ok(contrastRatio("#ffffff", "#075d7d") >= 4.5);
  assert.ok(contrastRatio("#ffffff", "#087da9") >= 4.5);
  assert.ok(contrastRatio("#211a30", "#d8f3ff") >= 4.5);
  assert.ok(contrastRatio("#075d7d", "#ffffff") >= 3);
  assert.doesNotMatch(
    styles,
    /\.chart-svg text[^{}]*\{[^{}]*\bfill\s*:/i,
    "page CSS must not override renderer-selected SVG text colors"
  );
});

test("partial scenario snapshots preserve missing context as Unknown", () => {
  const workspace = workspaceFixture();
  const scores = calculateCompetitiveScores(workspace, "p1");
  const specs = buildVisualizationSpecs(workspace, "p1", {
    ...scores,
    scenarioEstimate: { value: 55 }
  });
  assert.deepEqual(specs.scenarioRange.estimate, {
    value: 55,
    prior: null,
    trust: null,
    low: null,
    high: null
  });

  const svg = renderScenarioRangeSvg(specs.scenarioRange, { theme: "light" });
  assertAccessibleSvg(svg);
  assert.match(svg, />55% estimate<\/text>/);
  assert.match(svg, />Uncertainty range Unknown<\/text>/);
  assert.match(svg, />Prior Unknown · Trust Unknown<\/text>/);
  assert.match(svg, /Missing prior, trust, or range values are shown as Unknown/);
  assert.doesNotMatch(svg, /<polygon\b/);
  assert.doesNotMatch(svg, /\b(?:NaN|Infinity)\b/);

  const oneBound = renderScenarioRangeSvg(
    {
      type: "scenario-range",
      title: "Partial range",
      estimate: { value: 55, prior: 50, trust: 40, low: 30 }
    },
    { theme: "light" }
  );
  assert.match(oneBound, />Uncertainty range Unknown<\/text>/);
  assert.doesNotMatch(oneBound, /stroke-width="18"/);
});

test("ranked CPI rendering is bounded and discloses omitted entities", () => {
  const entities = Array.from({ length: 20 }, (_, index) => ({
    name: `Entity ${index + 1}`,
    cpi: 100 - index,
    coverage: 80,
    confidence: 70
  }));
  const svg = renderRankedCpiSvg(
    {
      type: "ranked-cpi",
      title: "Large field",
      entities
    },
    { maxRows: 5 }
  );
  assertAccessibleSvg(svg);
  assert.match(svg, /Showing 5 of 20 ranked entities/);
  assert.match(svg, />Entity 5<\/text>/);
  assert.doesNotMatch(svg, />Entity 6<\/text>/);
});

test("compact ranking always retains an unscored Our team beside the top rivals", () => {
  const workspace = workspaceFixture();
  for (const criterion of workspace.criteria) {
    criterion.ourScore = "";
    criterion.classification = "Missing";
  }
  workspace.competitors = Array.from({ length: 20 }, (_, index) => ({
    id: `rival-${index}`,
    pursuitId: "p1",
    name: `High-scoring rival ${index + 1}`,
    classification: "Inference",
    evidenceIds: [],
    scores: Object.fromEntries(workspace.criteria.map(criterion => [criterion.id, 5]))
  }));

  const snapshot = buildRunVisualizationSnapshot(workspace, "p1");
  const entities = snapshot.visuals.rankedCpi.entities;
  const ourEntities = entities.filter(item => item.isUs);
  assert.equal(entities.length, 14);
  assert.equal(snapshot.visuals.rankedCpi.totalEntities, 21);
  assert.equal(ourEntities.length, 1);
  assert.equal(ourEntities[0].name, "Our team");
  assert.equal(ourEntities[0].cpi, null);
  assert.equal(entities.filter(item => !item.isUs).length, 13);
  assert.equal(entities.at(-1).isUs, true);

  const svg = renderRankedCpiSvg(snapshot.visuals.rankedCpi);
  assert.match(svg, /Our team: Unknown/);
  assert.match(svg, /Showing 14 of 21 ranked entities/);
});

test("run visualization snapshots preserve report-ready visual evidence without history", () => {
  const workspace = workspaceFixture();
  const scores = calculateCompetitiveScores(workspace, "p1");
  const snapshot = buildRunVisualizationSnapshot(workspace, "p1", scores);
  const clone = JSON.parse(JSON.stringify(snapshot));
  assert.equal(clone.schemaVersion, VISUALIZATION_SCHEMA_VERSION);
  assert.equal(clone.pursuitId, "p1");
  assert.equal(clone.metrics.ourCpi, scores.us.cpi);
  assert.equal(clone.metrics.strongestRivalCpi, scores.strongestCompetitor.cpi);
  assert.equal(clone.metrics.coverage, scores.us.coverage);
  assert.equal(clone.metrics.confidence, scores.us.confidence);
  assert.deepEqual(Object.keys(clone.visuals), [
    "rankedCpi",
    "scoreHeatmap",
    "criterionDeltas",
    "scenarioRange",
    "evidenceGrid",
    "evidenceRelationships",
    "actionSummary"
  ]);
  assert.equal("runHistory" in clone.visuals, false);
});

test("report snapshots are bounded, disclose omissions, and preserve exact action totals", () => {
  const workspace = workspaceFixture();
  const longLabel = "Long report-time label ".repeat(80);
  workspace.criteria = Array.from({ length: 40 }, (_, index) => ({
    id: `criterion-${index}`,
    pursuitId: "p1",
    name: `${longLabel}${index}`,
    weight: 1,
    ourScore: (index % 5) + 1,
    classification: "Inference",
    evidenceIds: [`evidence-${index}`]
  }));
  workspace.evidence = Array.from({ length: 40 }, (_, index) => ({
    id: `evidence-${index}`,
    pursuitId: "p1",
    citation: `E-${index}`,
    title: `${longLabel}${index}`,
    classification: "Inference",
    stance: index % 2 ? "Challenge" : "Support",
    criterionIds: [`criterion-${index}`]
  }));
  workspace.competitors = Array.from({ length: 20 }, (_, index) => ({
    id: `rival-${index}`,
    pursuitId: "p1",
    name: `${longLabel}${index}`,
    classification: "Inference",
    evidenceIds: [],
    scores: Object.fromEntries(
      workspace.criteria.map((criterion, criterionIndex) => [
        criterion.id,
        ((criterionIndex + index) % 5) + 1
      ])
    )
  }));
  workspace.actions = Array.from({ length: 4000 }, (_, index) => ({
    id: `action-${index}`,
    pursuitId: "p1",
    priority: index % 2 ? "High" : "Critical",
    status: index % 3 ? "Open" : "Complete"
  }));

  const snapshot = buildRunVisualizationSnapshot(workspace, "p1");
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.snapshotVersion, REPORT_VISUAL_SNAPSHOT_VERSION);
  assert.ok(utf8ByteLength(serialized) <= REPORT_VISUAL_SNAPSHOT_MAX_BYTES);
  assert.equal(snapshot.visuals.rankedCpi.entities.length, 14);
  assert.equal(snapshot.visuals.rankedCpi.totalEntities, 21);
  assert.equal(snapshot.visuals.scoreHeatmap.rows.length, 14);
  assert.equal(snapshot.visuals.scoreHeatmap.totalRows, 40);
  assert.equal(snapshot.visuals.scoreHeatmap.columns.length, 7);
  assert.equal(snapshot.visuals.scoreHeatmap.totalColumns, 21);
  assert.equal(snapshot.visuals.evidenceRelationships.evidence.length, 9);
  assert.equal(snapshot.visuals.evidenceRelationships.totalEvidence, 40);
  assert.equal(snapshot.visuals.actionSummary.actions.length, 0);
  assert.equal(snapshot.visuals.actionSummary.totalActions, 4000);
  assert.equal(
    snapshot.visuals.actionSummary.counts.reduce((sum, item) => sum + item.count, 0),
    4000
  );

  const ranking = renderRankedCpiSvg(snapshot.visuals.rankedCpi);
  const heatmap = renderScoreHeatmapSvg(snapshot.visuals.scoreHeatmap);
  const relationships = renderEvidenceRelationshipsSvg(
    snapshot.visuals.evidenceRelationships
  );
  const actions = renderActionSummarySvg(snapshot.visuals.actionSummary);
  assert.match(ranking, /Showing 14 of 21 ranked entities/);
  assert.match(heatmap, /Showing 14 of 40 criteria and 7 of 21 entities/);
  assert.match(
    relationships,
    /Showing 9 of 40 evidence records, 9 of 40 criteria, and 9 of 40 relationships/
  );
  assert.match(actions, /4000 total actions/);

  const multibyteWorkspace = structuredClone(workspace);
  const multibyteLabel = "界".repeat(200);
  for (const criterion of multibyteWorkspace.criteria) {
    criterion.name = multibyteLabel;
    criterion.classification = multibyteLabel;
  }
  for (const item of multibyteWorkspace.evidence) {
    item.title = multibyteLabel;
    item.classification = multibyteLabel;
  }
  for (const competitor of multibyteWorkspace.competitors) {
    competitor.name = multibyteLabel;
  }
  const multibyteSnapshot = buildRunVisualizationSnapshot(multibyteWorkspace, "p1");
  const multibyteSerialized = JSON.stringify(multibyteSnapshot);
  const truncatedEntity = multibyteSnapshot.visuals.rankedCpi.entities.find(
    item => item.name !== "Our team"
  );
  assert.ok(utf8ByteLength(multibyteSerialized) <= REPORT_VISUAL_SNAPSHOT_MAX_BYTES);
  assert.ok(utf8ByteLength(truncatedEntity.name) <= 180);
  assert.match(truncatedEntity.name, /…$/);
  assert.doesNotMatch(multibyteSerialized, /�/);
});

test("accessible visual tables use snapshot-neutral scope and explicit totals", () => {
  assert.doesNotMatch(appSource, /available in the workspace/i);
  assert.match(
    appSource,
    /Relationship scope:.*totalEvidence.*evidence records.*totalCriteria.*criteria.*totalLinks.*relationships/s
  );
  assert.match(appSource, /total actions are included in this analysis/);
  assert.match(appSource, /exact counts by priority and status/);
  assert.match(appSource, /omitted values are not included in this compact view/);
});

test("generic dispatcher returns a safe explanatory SVG for unsupported types", () => {
  const svg = renderVisualizationSvg({
    type: `"><script>alert(1)</script>`,
    title: "Unknown"
  });
  assertAccessibleSvg(svg);
  assert.doesNotMatch(svg, /<script\b/i);
  assert.match(svg, /Unknown visualization type/);
});

function contrastRatio(foreground, background) {
  const values = [foreground, background].map(color => {
    const channels = color
      .slice(1)
      .match(/.{2}/g)
      .map(value => Number.parseInt(value, 16) / 255)
      .map(value =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  });
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
