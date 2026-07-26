export const SCHEMA_VERSION = 2;

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

export function validateWorkspace(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, errors: ["Workspace must be a JSON object."] };
  }
  if (
    candidate.schemaVersion !== undefined &&
    (!Number.isInteger(candidate.schemaVersion) ||
      candidate.schemaVersion < 1 ||
      candidate.schemaVersion > SCHEMA_VERSION)
  ) {
    errors.push(`Unsupported schema version. Expected 1-${SCHEMA_VERSION}.`);
  }
  for (const name of REQUIRED_COLLECTIONS.filter(name => name !== "snapshots")) {
    if (candidate[name] !== undefined && !Array.isArray(candidate[name])) {
      errors.push(`${name} must be an array.`);
    }
  }
  if (!Array.isArray(candidate.pursuits) || !candidate.pursuits.length) {
    errors.push("At least one pursuit is required.");
  }

  const pursuitIds = new Set();
  for (const pursuit of candidate.pursuits || []) {
    if (!pursuit || typeof pursuit !== "object") {
      errors.push("Every pursuit must be an object.");
      continue;
    }
    if (!nonEmpty(pursuit.id) || !nonEmpty(pursuit.name) || !nonEmpty(pursuit.customer)) {
      errors.push("Every pursuit requires id, name, and customer.");
    }
    if (pursuitIds.has(pursuit.id)) errors.push(`Duplicate pursuit id: ${pursuit.id}.`);
    pursuitIds.add(pursuit.id);
  }

  const seenIds = new Set(pursuitIds);
  for (const name of ["criteria", "evidence", "competitors", "actions", "runs"]) {
    for (const record of candidate[name] || []) {
      if (!record || typeof record !== "object" || !nonEmpty(record.id)) {
        errors.push(`Every ${name} record requires an id.`);
        continue;
      }
      if (seenIds.has(record.id)) errors.push(`Duplicate record id: ${record.id}.`);
      seenIds.add(record.id);
      if (!pursuitIds.has(record.pursuitId)) {
        errors.push(`${name} record ${record.id} references a missing pursuit.`);
      }
    }
  }

  for (const playbook of candidate.playbooks || []) {
    if (!playbook || !nonEmpty(playbook.id) || !nonEmpty(playbook.name)) {
      errors.push("Every playbook requires an id and name.");
      continue;
    }
    if (seenIds.has(playbook.id)) errors.push(`Duplicate record id: ${playbook.id}.`);
    seenIds.add(playbook.id);
  }

  const criterionIds = new Set((candidate.criteria || []).map(item => item.id));
  const evidenceIds = new Set((candidate.evidence || []).map(item => item.id));
  for (const criterion of candidate.criteria || []) {
    const weight = Number(criterion.weight);
    const score = Number(criterion.ourScore);
    if (!nonEmpty(criterion.name)) errors.push(`Criterion ${criterion.id} requires a name.`);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) {
      errors.push(`Criterion ${criterion.id} has an invalid weight.`);
    }
    if (criterion.ourScore !== "" && (!Number.isFinite(score) || score < 1 || score > 5)) {
      errors.push(`Criterion ${criterion.id} has an invalid score.`);
    }
    for (const evidenceId of criterion.evidenceIds || []) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`Criterion ${criterion.id} references missing evidence ${evidenceId}.`);
      }
    }
  }

  for (const competitor of candidate.competitors || []) {
    if (!nonEmpty(competitor.name)) errors.push(`Competitor ${competitor.id} requires a name.`);
    if (competitor.scores && typeof competitor.scores !== "object") {
      errors.push(`Competitor ${competitor.id} scores must be an object.`);
    }
    for (const score of Object.values(competitor.scores || {})) {
      if (score !== "" && (Number(score) < 1 || Number(score) > 5)) {
        errors.push(`Competitor ${competitor.id} contains a score outside 1-5.`);
      }
    }
    for (const criterionId of Object.keys(competitor.scores || {})) {
      if (!criterionIds.has(criterionId)) {
        errors.push(`Competitor ${competitor.id} references missing criterion ${criterionId}.`);
      }
    }
    for (const evidenceId of competitor.evidenceIds || []) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`Competitor ${competitor.id} references missing evidence ${evidenceId}.`);
      }
    }
  }

  for (const evidence of candidate.evidence || []) {
    if (!nonEmpty(evidence.title) || !nonEmpty(evidence.source)) {
      errors.push(`Evidence ${evidence.id} requires a title and source.`);
    }
    if (evidence.url && !safeHttpUrl(evidence.url)) {
      errors.push(`Evidence ${evidence.id} has an invalid source URL.`);
    }
    if (
      evidence.attachmentData &&
      typeof evidence.attachmentData === "string" &&
      evidence.attachmentData.length > 450_000
    ) {
      errors.push(`Evidence ${evidence.id} attachment exceeds the local-storage limit.`);
    }
    for (const criterionId of evidence.criterionIds || []) {
      if (!criterionIds.has(criterionId)) {
        errors.push(`Evidence ${evidence.id} references missing criterion ${criterionId}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
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
  workspace.appVersion = "2.0.0";
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
  workspace.runs = workspace.runs.map(item => ({
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
    revisions: Array.isArray(item.revisions) ? item.revisions : [],
    sections: Array.isArray(item.sections) ? item.sections : []
  }));
  workspace.snapshots = workspace.snapshots
    .filter(item => item && typeof item === "object" && item.workspace)
    .slice(-8);
  return workspace;
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

  const strongestCompetitor = rivals.slice().sort((a, b) => b.cpi - a.cpi)[0] || null;
  const margin = strongestCompetitor ? round(us.cpi - strongestCompetitor.cpi, 1) : null;
  const gateWarnings = criteria
    .filter(item => item.isGate && (Number(item.ourScore) || 0) < 3)
    .map(item => item.name);
  const scenarioEstimate =
    strongestCompetitor && totalWeight
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
    `**Status:** Draft`,
    `**Playbook:** ${session.playbook || pursuit.playbook || "Competitive assessment"}`,
    `**Facilitator:** ${session.facilitator || "Public workspace facilitator"}`,
    `**Participants:** ${session.participants || "Not recorded"}`,
    `**Customer:** ${pursuit.customer}`,
    `**Competitive posture:** ${relativePosture}`,
    scores.scenarioEstimate
      ? `**Scenario win estimate:** ${scores.scenarioEstimate.value}% (${scores.scenarioEstimate.low}-${scores.scenarioEstimate.high}% uncertainty range; planning estimate, not a forecast)`
      : `**Scenario win estimate:** Not available until criteria and at least one competitor are scored`,
    "",
    "> This is a deterministic analysis of user-entered judgments and evidence. It does not perform web research, verify claims, or call an AI model.",
    "",
    "## 1. Executive summary",
    scores.totalWeight
      ? `Our Competitive Position Index is **${scores.us.cpi}/100** with **${scores.us.coverage}% evidence coverage** and **${scores.us.confidence}% confidence**. ${
          scores.strongestCompetitor
            ? `${scores.strongestCompetitor.name} is the strongest scored competitor at **${scores.strongestCompetitor.cpi}/100**, producing a margin of **${signed(scores.margin)} points**.`
            : "No competitor has been scored, so a relative ranking is not available."
        }`
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
        `- CPI: ${score?.cpi ?? "N/A"}/100; coverage: ${score?.coverage ?? 0}%; confidence: ${score?.confidence ?? 0}%`,
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
    status: "Draft",
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
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  for (const raw of String(markdown).split("\n")) {
    const line = escapeHtml(raw);
    if (raw.startsWith("### ")) {
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
    } else if (/^\|/.test(raw)) {
      closeList();
      html.push(`<p class="matrix">${inlineMarkdown(line)}</p>`);
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
  )}</title><style>body{font-family:Arial,sans-serif;color:#171327;line-height:1.45;margin:48px}h1{color:#442c81}h2{border-bottom:1px solid #ccc;padding-bottom:4px}blockquote{background:#eef8fc;border-left:4px solid #29aae1;padding:10px}.matrix{font-family:Consolas,monospace;font-size:9pt}</style></head><body>${html.join(
    ""
  )}</body></html>`;
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
  const weightedMean = includedWeight ? weightedEffective / includedWeight : 3;
  return {
    id,
    name,
    cpi: round(25 * (weightedMean - 1), 1),
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
    String(scores.us.cpi),
    ...scores.competitors.map(item => String(item.cpi))
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
