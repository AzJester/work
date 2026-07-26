import {
  SCHEMA_VERSION,
  buildCompetitiveReport,
  calculateCompetitiveScores,
  escapeHtml as esc,
  markdownToWordHtml,
  normalizeWorkspace,
  safeHttpUrl,
  splitMarkdownSections,
  validateWorkspace,
  workspaceInputHash
} from "./engine.js";

const STORAGE_KEY = "black_hat_agent_public_v2";
const LEGACY_KEYS = ["astrion_blackhat_public_v2", "astrion_blackhat_public_v1"];
const MAX_IMPORT_BYTES = 4_000_000;
const MAX_ATTACHMENT_BYTES = 300_000;
const COLLECTIONS = [
  "pursuits",
  "criteria",
  "evidence",
  "competitors",
  "actions",
  "playbooks",
  "runs"
];
const uid = () =>
  crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

const seed = {
  schemaVersion: SCHEMA_VERSION,
  appVersion: "2.0.0",
  createdAt: "2026-07-26T12:00:00.000Z",
  updatedAt: "2026-07-26T12:00:00.000Z",
  active: "p1",
  pursuits: [
    {
      id: "p1",
      name: "Joint Multi-Domain T&E Support",
      customer: "U.S. defense test organization",
      stage: "Capture",
      status: "Active",
      owner: "Shane Turner",
      review: "2026-08-06",
      decisionDate: "2026-11-15",
      contractValue: "Synthetic demonstration",
      playbook: "Opportunity competitive assessment",
      summary:
        "Integrate credible test planning, digital engineering, and mission-thread analysis across domains.",
      ourPosition:
        "Strong mission-integration story with proof gaps in surge staffing and transition detail.",
      procurementContext:
        "Best-value evaluation with technical, management, past-performance, and cost considerations.",
      priorEstimate: 50,
      archived: false
    },
    {
      id: "p2",
      name: "Space Systems Engineering Services",
      customer: "U.S. space mission organization",
      stage: "Shape",
      status: "Active",
      owner: "Capture Team",
      review: "2026-09-18",
      decisionDate: "",
      contractValue: "Synthetic demonstration",
      playbook: "Customer evaluator simulation",
      summary:
        "Position mission engineering depth and execution confidence for a complex services opportunity.",
      ourPosition: "Early positioning; customer priorities require validation.",
      procurementContext: "Acquisition strategy is not yet final.",
      priorEstimate: 50,
      archived: false
    },
    {
      id: "p3",
      name: "Range Modernization Recompete",
      customer: "U.S. range operations organization",
      stage: "Draft RFP",
      status: "On hold",
      owner: "Growth Team",
      review: "2026-10-03",
      decisionDate: "",
      contractValue: "Synthetic demonstration",
      playbook: "Recompete and incumbent defense",
      summary:
        "Assess transition risk, incumbent advantages, and modernization discriminators.",
      ourPosition: "Challenger position against a credible incumbent.",
      procurementContext: "Recompete with transition and continuity sensitivity.",
      priorEstimate: 35,
      archived: false
    }
  ],
  criteria: [
    {
      id: "cr1",
      pursuitId: "p1",
      name: "Mission integration",
      category: "Technical",
      description: "Ability to integrate test, digital engineering, and mission threads.",
      weight: 30,
      ourScore: 4,
      classification: "Inference",
      rationale: "Relevant experience is strong but proof must be tailored.",
      evidenceIds: ["e1"],
      isGate: true
    },
    {
      id: "cr2",
      pursuitId: "p1",
      name: "Transition confidence",
      category: "Management",
      description: "Low-risk transition with credible milestones and knowledge transfer.",
      weight: 25,
      ourScore: 4,
      classification: "Inference",
      rationale: "A credible outline exists; detailed proof remains in development.",
      evidenceIds: ["e1"],
      isGate: true
    },
    {
      id: "cr3",
      pursuitId: "p1",
      name: "Workforce depth",
      category: "Staffing",
      description: "Cleared, available, and scalable technical workforce.",
      weight: 20,
      ourScore: 3,
      classification: "Hypothesis",
      rationale: "Meets the anticipated requirement but surge depth is unverified.",
      evidenceIds: [],
      isGate: false
    },
    {
      id: "cr4",
      pursuitId: "p1",
      name: "Relevant performance",
      category: "Past performance",
      description: "Recent, relevant, and high-quality execution evidence.",
      weight: 15,
      ourScore: 4,
      classification: "Inference",
      rationale: "Relevant references are expected to support the narrative.",
      evidenceIds: ["e1"],
      isGate: false
    },
    {
      id: "cr5",
      pursuitId: "p1",
      name: "Cost credibility",
      category: "Price",
      description: "Realistic, competitive, and traceable cost approach.",
      weight: 10,
      ourScore: 3,
      classification: "Hypothesis",
      rationale: "No validated competitor pricing intelligence is available.",
      evidenceIds: [],
      isGate: false
    },
    {
      id: "cr6",
      pursuitId: "p2",
      name: "Mission engineering outcomes",
      category: "Technical",
      description: "Demonstrated mission outcomes rather than generic labor capacity.",
      weight: 50,
      ourScore: 4,
      classification: "Inference",
      rationale: "Synthetic industry-day evidence indicates strong customer relevance.",
      evidenceIds: ["e3"],
      isGate: true
    },
    {
      id: "cr7",
      pursuitId: "p2",
      name: "Execution confidence",
      category: "Management",
      description: "Credible delivery governance and performance controls.",
      weight: 50,
      ourScore: 3,
      classification: "Hypothesis",
      rationale: "Requires additional proof.",
      evidenceIds: [],
      isGate: false
    },
    {
      id: "cr8",
      pursuitId: "p3",
      name: "Continuity of operations",
      category: "Transition",
      description: "Maintain mission performance throughout modernization.",
      weight: 60,
      ourScore: 3,
      classification: "Hypothesis",
      rationale: "Transition approach has not been validated.",
      evidenceIds: [],
      isGate: true
    },
    {
      id: "cr9",
      pursuitId: "p3",
      name: "Modernization value",
      category: "Technical",
      description: "Measurable improvement without unacceptable disruption.",
      weight: 40,
      ourScore: 4,
      classification: "Hypothesis",
      rationale: "Working solution hypothesis only.",
      evidenceIds: [],
      isGate: false
    }
  ],
  evidence: [
    {
      id: "e1",
      pursuitId: "p1",
      citation: "E-001",
      title: "Draft acquisition objectives",
      source: "Synthetic customer brief",
      url: "",
      type: "Customer",
      publishedAt: "2026-07-10",
      confidence: "Medium",
      classification: "Inference",
      stance: "Support",
      note:
        "Customer prioritizes integration speed, traceability, and credible transition planning.",
      criterionIds: ["cr1", "cr2", "cr4"],
      attachmentName: "",
      attachmentType: "",
      attachmentData: ""
    },
    {
      id: "e2",
      pursuitId: "p1",
      citation: "E-002",
      title: "Public capability statement",
      source: "Synthetic market material",
      url: "",
      type: "Competitor",
      publishedAt: "2026-06-12",
      confidence: "Low",
      classification: "Hypothesis",
      stance: "Challenge",
      note:
        "Likely competitor emphasizes scale, workforce access, and an incumbent-adjacent transition model.",
      criterionIds: ["cr2", "cr3"],
      attachmentName: "",
      attachmentType: "",
      attachmentData: ""
    },
    {
      id: "e3",
      pursuitId: "p2",
      citation: "E-001",
      title: "Mission engineering priorities",
      source: "Synthetic industry day",
      url: "",
      type: "Customer",
      publishedAt: "2026-07-02",
      confidence: "Medium",
      classification: "Inference",
      stance: "Support",
      note:
        "Evaluation likely rewards demonstrated mission outcomes over generic staffing depth.",
      criterionIds: ["cr6"],
      attachmentName: "",
      attachmentType: "",
      attachmentData: ""
    }
  ],
  competitors: [
    {
      id: "c1",
      pursuitId: "p1",
      name: "Northstar Mission Systems",
      position: "Likely challenger",
      incumbent: false,
      bidLikelihood: "Very likely",
      strengths: "Scale; broad contract access; polished transition model",
      weaknesses: "Generic technical narrative; integration depth unproven",
      strategy: "Lead with workforce scale, management maturity, and transition confidence.",
      ghosting:
        "Question whether smaller teams can staff rapidly and sustain multi-domain surge requirements.",
      counterMoves:
        "Prove named staffing pipelines and make mission-integration depth measurable.",
      classification: "Hypothesis",
      evidenceIds: ["e2"],
      scores: { cr1: 3, cr2: 4, cr3: 5, cr4: 4, cr5: 3 }
    },
    {
      id: "c2",
      pursuitId: "p1",
      name: "Vector Range Solutions",
      position: "Specialist",
      incumbent: false,
      bidLikelihood: "Likely",
      strengths: "Range familiarity; focused technical bench",
      weaknesses: "Limited multi-domain breadth; smaller surge capacity",
      strategy: "Frame domain specialization as lower execution risk.",
      ghosting: "Challenge the relevance of broad corporate capabilities to the specific mission.",
      counterMoves:
        "Connect breadth to named mission outcomes and avoid generic corporate claims.",
      classification: "Hypothesis",
      evidenceIds: ["e2"],
      scores: { cr1: 4, cr2: 3, cr3: 2, cr4: 3, cr5: 4 }
    }
  ],
  actions: [
    {
      id: "a1",
      pursuitId: "p1",
      title: "Validate evaluator priorities",
      owner: "Capture Lead",
      due: "2026-08-01",
      status: "Open",
      priority: "Critical",
      finding: "Confirm criterion weights and critical gates."
    },
    {
      id: "a2",
      pursuitId: "p1",
      title: "Build transition proof points",
      owner: "Solution Lead",
      due: "2026-08-04",
      status: "In progress",
      priority: "High",
      finding: "Counter competitor transition positioning."
    },
    {
      id: "a3",
      pursuitId: "p2",
      title: "Map mission outcomes to evidence",
      owner: "Growth Team",
      due: "2026-09-10",
      status: "Open",
      priority: "High",
      finding: "Strengthen discriminator credibility."
    }
  ],
  playbooks: [
    {
      id: "pb1",
      name: "Opportunity competitive assessment",
      description:
        "Evidence-grounded analysis of customer priorities, competitor posture, gaps, and win themes.",
      sections:
        "Executive summary, intelligence quality, scoring matrix, vulnerabilities, evaluator simulation, actions",
      builtIn: true
    },
    {
      id: "pb2",
      name: "Customer evaluator simulation",
      description:
        "Scores the offer through plausible evaluator lenses and identifies credibility gaps.",
      sections:
        "Customer priorities, evaluator simulation, scoring matrix, proof gaps, actions",
      builtIn: true
    },
    {
      id: "pb3",
      name: "Recompete and incumbent defense",
      description:
        "Tests incumbent advantages, transition threats, and challenger counter-positioning.",
      sections:
        "Incumbent posture, continuity risk, ghosting themes, counter-positioning, actions",
      builtIn: true
    }
  ],
  runs: [],
  snapshots: []
};

let data = loadWorkspace();
let view = "portfolio";
let query = "";
let showArchived = false;

function loadWorkspace() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
    if (!raw) return normalizeWorkspace(seed, seed);
    return normalizeWorkspace(JSON.parse(raw), seed);
  } catch {
    return normalizeWorkspace(seed, seed);
  }
}

function save() {
  data.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    toast(
      error?.name === "QuotaExceededError"
        ? "Browser storage is full. Export the workspace and remove large attachments."
        : "The workspace could not be saved locally."
    );
    return false;
  }
}

function pursuit() {
  return (
    data.pursuits.find(item => item.id === data.active) ||
    data.pursuits.find(item => !item.archived) ||
    data.pursuits[0]
  );
}

function scoped(collection) {
  return data[collection].filter(item => item.pursuitId === data.active);
}

function makeSnapshot(label) {
  const workspace = Object.fromEntries(
    COLLECTIONS.map(collection => [collection, structuredClone(data[collection])])
  );
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    label,
    active: data.active,
    workspace
  };
}

function createSnapshot(label) {
  data.snapshots.push(makeSnapshot(label));
  data.snapshots = data.snapshots.slice(-8);
  save();
}

function restoreSnapshot(id) {
  const snapshot = data.snapshots.find(item => item.id === id);
  if (!snapshot) return;
  const current = makeSnapshot("Before recovery restore");
  for (const collection of COLLECTIONS) {
    data[collection] = structuredClone(snapshot.workspace[collection] || []);
  }
  data.active = snapshot.active;
  data.snapshots.push(current);
  data.snapshots = data.snapshots.slice(-8);
  save();
  view = "portfolio";
  render();
  toast("Recovery snapshot restored");
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="toast" role="status">${esc(message)}</div>`
  );
  setTimeout(() => document.querySelector(".toast")?.remove(), 2600);
}

function nav() {
  const entries = [
    ["portfolio", "PF", "Pursuit Portfolio"],
    ["command", "CC", "Command Center"],
    ["opportunity", "OP", "Opportunity"],
    ["criteria", "CT", "Evaluation Criteria"],
    ["evidence", "ER", "Evidence Room"],
    ["competitors", "CO", "Competitors"],
    ["playbooks", "PB", "Playbook Library"],
    ["session", "BH", "Black Hat Session"],
    ["history", "RH", "Run History"],
    ["outputs", "OC", "Output Center"],
    ["actions", "AR", "Action Register"],
    ["recovery", "RV", "Recovery"]
  ];
  return `<aside class="sidebar">
    <div class="brand"><div class="mark">BH</div><div><strong>BLACK HAT AGENT</strong><span>COMPETITIVE ANALYSIS</span></div></div>
    <nav class="nav" aria-label="Workspace navigation">
      <div class="nav-label">WORKSPACE</div>
      ${entries
        .map(
          item =>
            `<button data-view="${item[0]}" class="${view === item[0] ? "active" : ""}"><b>${
              item[1]
            }</b>${item[2]}</button>`
        )
        .join("")}
    </nav>
    <div class="guardrail"><strong>Anonymous local workspace</strong>No sign-in, API, AI model, or automatic web research. Export backups regularly.</div>
  </aside>`;
}

function header() {
  const active = pursuit();
  return `<header class="topbar">
    <div><p class="eyebrow">ACTIVE PURSUIT</p><h2>${esc(
      active?.name || "No pursuit selected"
    )}</h2><span class="save-state">Saved locally · schema v${SCHEMA_VERSION}</span></div>
    <div class="actions">
      <span class="pill">LOCAL · NO SIGN-IN</span>
      <button class="btn small" data-action="snapshot">Create snapshot</button>
      <button class="btn small" data-action="export">Export workspace</button>
      <button class="btn small" data-action="import">Import</button>
      <input id="importFile" type="file" accept=".json" hidden>
    </div>
  </header>`;
}

function portfolio() {
  const visible = data.pursuits.filter(item => {
    const matchesArchive = showArchived ? item.archived : !item.archived;
    const text = [item.name, item.customer, item.owner, item.stage].join(" ").toLowerCase();
    return matchesArchive && text.includes(query.toLowerCase());
  });
  return `<div class="hero">
    <div><p class="eyebrow">PURSUIT PORTFOLIO</p><h1>Evidence-grounded competitive analysis.</h1><p>Define customer priorities, score competitors, challenge assumptions, and generate source-linked Black Hat reports entirely in your browser.</p></div>
    <button class="btn primary" data-action="new-pursuit">Create pursuit</button>
  </div>
  <div class="metrics">
    ${metric("ACTIVE PURSUITS", data.pursuits.filter(item => !item.archived && item.status === "Active").length)}
    ${metric("EVALUATION CRITERIA", data.criteria.length)}
    ${metric("EVIDENCE RECORDS", data.evidence.length)}
    ${metric("REPORT VERSIONS", data.runs.reduce((sum, run) => sum + Number(run.version || 1), 0))}
  </div>
  <div class="toolbar">
    <input id="search" aria-label="Search pursuits" placeholder="Search pursuit, customer, owner, or stage" value="${esc(
      query
    )}">
    <label class="toggle"><input id="showArchived" type="checkbox" ${
      showArchived ? "checked" : ""
    }> Show archived</label>
    <button class="btn" data-action="reset-demo">Reset demo</button>
  </div>
  <div class="grid">
    ${
      visible
        .map(item => {
          const result = calculateCompetitiveScores(data, item.id);
          const openActions = data.actions.filter(
            action => action.pursuitId === item.id && action.status !== "Complete"
          ).length;
          return `<article class="card">
            <span class="stage">${esc(item.stage)}</span>
            <span class="status">${esc(item.archived ? "Archived" : item.status)}</span>
            <h3>${esc(item.name)}</h3><p>${esc(item.customer)}</p>
            <div class="meta">
              <span><small>OWNER</small>${esc(item.owner || "Unassigned")}</span>
              <span><small>NEXT REVIEW</small>${esc(item.review || "Not set")}</span>
              <span><small>OUR CPI</small>${result.totalWeight ? `${result.us.cpi}/100` : "Not scored"}</span>
              <span><small>OPEN ACTIONS</small>${openActions}</span>
            </div>
            <div class="row">
              ${
                item.archived
                  ? `<button class="btn primary small" data-restore-pursuit="${item.id}">Restore</button>`
                  : `<button class="btn primary small" data-open="${item.id}">Open workspace</button>
                     <button class="btn small" data-duplicate="${item.id}">Duplicate with records</button>
                     <button class="btn small danger" data-archive="${item.id}">Archive</button>`
              }
            </div>
          </article>`;
        })
        .join("") || `<div class="empty">No pursuits match this view.</div>`
    }
  </div>`;
}

function command() {
  const active = pursuit();
  const scores = calculateCompetitiveScores(data, active.id);
  const sourceReports = scoped("runs");
  const stale = sourceReports.filter(
    run => run.sourceHash && run.sourceHash !== workspaceInputHash(data, active.id)
  ).length;
  return `<div class="hero">
    <div><p class="eyebrow">COMMAND CENTER</p><h1>${esc(active.name)}</h1><p>${esc(
      active.summary
    )}</p></div>
    <button class="btn primary" data-view="session">Run competitive analysis</button>
  </div>
  <div class="metrics">
    ${metric("OUR CPI", scores.totalWeight ? `${scores.us.cpi}/100` : "N/A")}
    ${metric("EVIDENCE COVERAGE", `${scores.us.coverage}%`)}
    ${metric("CONFIDENCE", `${scores.us.confidence}%`)}
    ${metric("SCENARIO ESTIMATE", scores.scenarioEstimate ? `${scores.scenarioEstimate.value}%*` : "N/A")}
  </div>
  <div class="two-col">
    <section class="panel"><h2>Competitive readiness</h2>
      ${readinessList(scores)}
      ${stale ? `<p class="note warn">${stale} report${stale === 1 ? "" : "s"} may be stale because source data changed.</p>` : ""}
      <div class="row"><button class="btn" data-view="criteria">Review criteria</button><button class="btn" data-view="evidence">Review evidence</button><button class="btn" data-view="competitors">Review scoring</button></div>
    </section>
    <section class="panel"><h2>Scored posture</h2>
      <div class="score-list">
        ${scoreBar("Our team", scores.us.cpi)}
        ${scores.competitors.map(item => scoreBar(item.name, item.cpi)).join("")}
      </div>
      ${scores.gateWarnings.length ? `<p class="note danger">Critical gates below minimum: ${esc(scores.gateWarnings.join(", "))}</p>` : ""}
    </section>
  </div>`;
}

function opportunity() {
  const active = pursuit();
  return `<div class="hero"><div><p class="eyebrow">OPPORTUNITY</p><h1>Opportunity profile</h1><p>Maintain the framing assumptions used by every competitive report.</p></div></div>
  <form class="panel form-grid" data-form="opportunity">
    ${textField("name", "Opportunity name", active.name, true)}
    ${textField("customer", "Customer", active.customer, true)}
    ${textField("stage", "Stage", active.stage)}
    ${selectField("status", "Status", ["Active", "On hold", "Complete"], active.status)}
    ${textField("owner", "Owner", active.owner)}
    ${textField("review", "Next review", active.review, false, "date")}
    ${textField("decisionDate", "Anticipated decision", active.decisionDate, false, "date")}
    ${textField("contractValue", "Value / context", active.contractValue)}
    ${textField("priorEstimate", "Baseline scenario estimate (%)", active.priorEstimate, false, "number", 'min="5" max="95"')}
    ${textareaField("summary", "Opportunity summary", active.summary)}
    ${textareaField("ourPosition", "Our current position", active.ourPosition)}
    ${textareaField("procurementContext", "Procurement and evaluation context", active.procurementContext)}
    <div class="field full"><button class="btn primary">Save opportunity</button></div>
  </form>`;
}

function criteriaView() {
  const rows = scoped("criteria");
  const total = rows.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  return `${sectionHero(
    "EVALUATION CRITERIA",
    "Customer priorities and scoring",
    "Weight the customer's decision criteria, record our score, and link each judgment to evidence.",
    `<button class="btn primary" data-add="criteria">Add criterion</button>`
  )}
  <div class="panel">
    <p class="note ${Math.abs(total - 100) > 0.01 ? "warn" : ""}">Entered weights total <strong>${total}</strong>. ${
      Math.abs(total - 100) > 0.01
        ? "Reports normalize them to 100, but confirming the intended weights is recommended."
        : "Weights are ready for direct comparison."
    }</p>
    ${
      rows.length
        ? `<div class="table-wrap"><table><thead><tr><th>Criterion</th><th>Category</th><th>Weight</th><th>Our score</th><th>Classification</th><th>Evidence</th><th></th></tr></thead><tbody>
          ${rows
            .map(
              item => `<tr>
                <td><strong>${esc(item.name)}</strong>${item.isGate ? ` <span class="tag danger">GATE</span>` : ""}<small class="block">${esc(item.description)}</small></td>
                <td>${esc(item.category)}</td><td>${esc(item.weight)}</td><td>${esc(item.ourScore || "Unknown")}/5</td>
                <td>${classificationTag(item.classification)}</td><td>${item.evidenceIds.length}</td>
                <td>${rowActions("criteria", item.id)}</td>
              </tr>`
            )
            .join("")}
        </tbody></table></div>`
        : `<div class="empty">Add weighted customer criteria before running a scored analysis.</div>`
    }
  </div>`;
}

function evidenceView() {
  const rows = scoped("evidence");
  return `${sectionHero(
    "EVIDENCE ROOM",
    "Source-linked evidence register",
    "Treat each record as one atomic claim. Label whether it supports, challenges, or contextualizes a judgment.",
    `<button class="btn primary" data-add="evidence">Add evidence</button>`
  )}
  <div class="panel">
    ${
      rows.length
        ? `<div class="evidence-list">${rows
            .map(item => {
              const url = safeHttpUrl(item.url);
              const linked = scoped("criteria")
                .filter(criterion => item.criterionIds.includes(criterion.id))
                .map(criterion => criterion.name);
              return `<article class="evidence-item">
                <div><span class="citation">[${esc(item.citation)}]</span> ${classificationTag(
                  item.classification
                )} <span class="tag">${esc(item.stance)}</span></div>
                <h3>${esc(item.title)}</h3>
                <p>${esc(item.note)}</p>
                <div class="evidence-meta"><span>Source: ${esc(item.source)}</span><span>${esc(
                  item.confidence
                )} confidence</span><span>${esc(item.publishedAt || "No date")}</span></div>
                ${linked.length ? `<small>Linked criteria: ${esc(linked.join(", "))}</small>` : `<small>No criteria linked</small>`}
                <div class="row">
                  ${url ? `<a class="btn small" href="${esc(url)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
                  ${item.attachmentData ? `<button class="btn small" data-attachment="${item.id}">Download ${esc(item.attachmentName)}</button>` : ""}
                  <button class="btn small" data-edit="evidence:${item.id}">Edit</button>
                  <button class="btn small danger" data-delete="evidence:${item.id}">Delete</button>
                </div>
              </article>`;
            })
            .join("")}</div>`
        : `<div class="empty">No evidence has been recorded.</div>`
    }
  </div>`;
}

function competitorsView() {
  const competitors = scoped("competitors");
  const criteria = scoped("criteria");
  const scores = calculateCompetitiveScores(data, data.active);
  return `${sectionHero(
    "COMPETITORS",
    "Competitive landscape and scoring",
    "Record explicit competitor hypotheses, cite supporting evidence, and score each company against the same customer criteria.",
    `<button class="btn primary" data-add="competitors">Add competitor</button>`
  )}
  <div class="grid">
    ${
      competitors
        .map(item => {
          const result = scores.competitors.find(score => score.id === item.id);
          return `<article class="card">
            <span class="stage">${esc(item.position)}${item.incumbent ? " · INCUMBENT" : ""}</span>
            <span class="status">${esc(item.bidLikelihood)}</span>
            <h3>${esc(item.name)}</h3>
            <div class="score-hero">${result?.cpi ?? 50}<small>CPI / 100</small></div>
            <p><strong>Likely strategy:</strong> ${esc(item.strategy || "Not recorded")}</p>
            <p><strong>Strengths:</strong> ${esc(item.strengths || "Not recorded")}</p>
            <p><strong>Weaknesses:</strong> ${esc(item.weaknesses || "Not recorded")}</p>
            <p><strong>Ghosting themes:</strong> ${esc(item.ghosting || "Not recorded")}</p>
            <div class="row"><button class="btn small" data-edit="competitors:${item.id}">Edit and score</button><button class="btn small danger" data-delete="competitors:${item.id}">Delete</button></div>
          </article>`;
        })
        .join("") || `<div class="empty">Add at least one competitor for relative scoring.</div>`
    }
  </div>
  <section class="panel matrix-panel"><h2>Scoring matrix</h2>
    ${
      criteria.length
        ? `<div class="table-wrap"><table><thead><tr><th>Criterion</th><th>Weight</th><th>Our team</th>${competitors
            .map(item => `<th>${esc(item.name)}</th>`)
            .join("")}</tr></thead><tbody>
            ${criteria
              .map(
                criterion => `<tr><td>${esc(criterion.name)}</td><td>${esc(
                  criterion.weight
                )}</td><td>${scoreCell(criterion.ourScore)}</td>${competitors
                  .map(item => `<td>${scoreCell(item.scores?.[criterion.id])}</td>`)
                  .join("")}</tr>`
              )
              .join("")}
            <tr class="total-row"><td>CPI</td><td>100 normalized</td><td>${scores.us.cpi}</td>${scores.competitors
              .map(item => `<td>${item.cpi}</td>`)
              .join("")}</tr>
          </tbody></table></div>`
        : `<div class="empty">Define evaluation criteria to enable scoring.</div>`
    }
  </section>`;
}

function playbooksView() {
  return `${sectionHero(
    "PLAYBOOK LIBRARY",
    "Facilitation playbooks",
    "Use built-in lenses or create a reusable custom playbook for your organization.",
    `<button class="btn primary" data-add="playbooks">Create playbook</button>`
  )}
  <div class="grid">${data.playbooks
    .map(
      item => `<article class="card">
        <span class="stage">${item.builtIn ? "BUILT-IN" : "CUSTOM"}</span>
        <h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>
        <small class="block">Sections: ${esc(item.sections)}</small>
        <div class="row"><button class="btn small" data-use-playbook="${item.id}">Use for active pursuit</button>
        ${
          item.builtIn
            ? `<button class="btn small" data-clone-playbook="${item.id}">Clone</button>`
            : `<button class="btn small" data-edit="playbooks:${item.id}">Edit</button><button class="btn small danger" data-delete="playbooks:${item.id}">Delete</button>`
        }</div>
      </article>`
    )
    .join("")}</div>`;
}

function sessionView() {
  const active = pursuit();
  const readiness = calculateCompetitiveScores(data, active.id);
  const blocked = !readiness.criteria.length;
  return `${sectionHero(
    "BLACK HAT SESSION",
    "Generate a deterministic competitive analysis",
    "The engine calculates weighted relative position and writes a source-linked report from the information entered here. It does not call an AI model.",
    ""
  )}
  ${blocked ? `<p class="note danger">Add at least one weighted evaluation criterion before generating a report.</p>` : ""}
  <form class="panel form-grid" data-form="run">
    ${selectField(
      "playbook",
      "Playbook",
      data.playbooks.map(item => item.name),
      active.playbook
    )}
    ${textField("facilitator", "Facilitator", "Public workspace facilitator")}
    ${textField("participants", "Participants", "")}
    ${selectField("reportStatus", "Initial report status", ["Draft", "In review"], "Draft")}
    ${textareaField(
      "question",
      "Session question",
      "Where is our position vulnerable, what will credible competitors emphasize, and which actions most improve our relative position?"
    )}
    ${textareaField("notes", "Facilitator notes and decisions", "")}
    <div class="field full"><button class="btn primary" ${blocked ? "disabled" : ""}>Generate competitive analysis</button></div>
  </form>`;
}

function historyView() {
  const runs = scoped("runs").slice().reverse();
  return `${sectionHero(
    "RUN HISTORY",
    "Analysis history",
    "Reports preserve their source hash, approval status, edits, and prior revisions.",
    ""
  )}
  <div class="grid">${
    runs
      .map(run => {
        const stale = run.sourceHash && run.sourceHash !== workspaceInputHash(data, data.active);
        return `<article class="card">
          <span class="stage">${esc(run.date || run.createdAt?.slice(0, 10))}</span>
          <span class="status">${esc(run.status)}</span>
          <h3>${esc(run.title)}</h3><p>${esc(run.question)}</p>
          <div class="row">${stale ? `<span class="tag danger">SOURCE DATA CHANGED</span>` : `<span class="tag good">CURRENT INPUTS</span>`}<span class="tag">VERSION ${esc(run.version)}</span></div>
          <div class="row"><button class="btn small" data-run="${run.id}">Open output</button><button class="btn small" data-revisions="${run.id}">Versions</button><button class="btn small danger" data-delete="runs:${run.id}">Delete</button></div>
        </article>`;
      })
      .join("") || `<div class="empty">No reports have been generated for this pursuit.</div>`
  }</div>`;
}

function outputsView() {
  const runs = scoped("runs").slice().reverse();
  return `${sectionHero(
    "OUTPUT CENTER",
    "Editable competitive-analysis reports",
    "Review the analysis, save controlled revisions, approve it, and export Markdown, Word-compatible .doc, or print-ready PDF.",
    ""
  )}
  ${
    runs
      .map(run => {
        const stale = run.sourceHash && run.sourceHash !== workspaceInputHash(data, data.active);
        return `<article class="panel report-card">
          <div class="report-heading"><div><p class="eyebrow">VERSION ${esc(run.version)}</p><h2>${esc(
            run.title
          )}</h2></div><div>${classificationTag(run.status)} ${stale ? `<span class="tag danger">STALE INPUTS</span>` : ""}</div></div>
          <div class="run-output">${esc(run.output)}</div>
          <div class="row report-actions">
            <button class="btn small" data-edit-report="${run.id}">Edit / review</button>
            <button class="btn small" data-revisions="${run.id}">Version history</button>
            <button class="btn small" data-copy="${run.id}">Copy</button>
            <button class="btn small" data-download="${run.id}">Markdown</button>
            <button class="btn small" data-word="${run.id}">Word .doc</button>
            <button class="btn small" data-pdf="${run.id}">Print / Save PDF</button>
          </div>
        </article>`;
      })
      .join("") || `<div class="empty">Run a Black Hat session to generate a competitive-analysis report.</div>`
  }`;
}

function actionsView() {
  const rows = scoped("actions");
  return `${sectionHero(
    "ACTION REGISTER",
    "Prioritized mitigation and intelligence actions",
    "Convert vulnerabilities, proof gaps, and unanswered questions into accountable work.",
    `<button class="btn primary" data-add="actions">Add action</button>`
  )}
  <div class="panel">${
    rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows
          .map(
            item =>
              `<tr><td><span class="tag ${item.priority === "Critical" ? "danger" : ""}">${esc(
                item.priority
              )}</span></td><td><strong>${esc(item.title)}</strong><small class="block">${esc(
                item.finding
              )}</small></td><td>${esc(item.owner || "Unassigned")}</td><td>${esc(
                item.due || "TBD"
              )}</td><td>${esc(item.status)}</td><td>${rowActions("actions", item.id)}</td></tr>`
          )
          .join("")}</tbody></table></div>`
      : `<div class="empty">No actions have been recorded.</div>`
  }</div>`;
}

function recoveryView() {
  return `${sectionHero(
    "RECOVERY",
    "Workspace recovery points",
    "Snapshots are created before destructive operations and can also be created manually. The eight newest are retained.",
    `<button class="btn primary" data-action="snapshot">Create snapshot</button>`
  )}
  <div class="panel">${
    data.snapshots.length
      ? `<div class="snapshot-list">${data.snapshots
          .slice()
          .reverse()
          .map(
            item => `<article><div><strong>${esc(item.label)}</strong><small>${esc(
              new Date(item.createdAt).toLocaleString()
            )}</small></div><button class="btn small" data-restore-snapshot="${item.id}">Restore</button></article>`
          )
          .join("")}</div>`
      : `<div class="empty">No recovery snapshots exist yet.</div>`
  }</div>`;
}

function render() {
  const views = {
    portfolio,
    command,
    opportunity,
    criteria: criteriaView,
    evidence: evidenceView,
    competitors: competitorsView,
    playbooks: playbooksView,
    session: sessionView,
    history: historyView,
    outputs: outputsView,
    actions: actionsView,
    recovery: recoveryView
  };
  document.querySelector("#app").innerHTML = `<a class="skip-link" href="#content">Skip to content</a><div class="app">${nav()}<main class="main">${header()}<div class="content" id="content" tabindex="-1">${views[
    view
  ]()}</div><div class="footer-note">Public browser-only application · Synthetic sample data · Deterministic analysis · Export backups regularly.</div></main></div><dialog id="modal" aria-modal="true"></dialog>`;
}

function modal(title, body) {
  const dialog = document.querySelector("#modal");
  dialog.innerHTML = `<div class="modal"><header><h2>${esc(
    title
  )}</h2><button class="close" aria-label="Close dialog" data-close>×</button></header>${body}</div>`;
  dialog.showModal();
}

function recordForm(kind, record = {}) {
  const existing = Boolean(record.id);
  if (kind === "pursuits") {
    return formShell(
      kind,
      record.id,
      [
        textField("name", "Opportunity name", record.name, true),
        textField("customer", "Customer", record.customer, true),
        textField("owner", "Owner", record.owner),
        textField("stage", "Stage", record.stage || "Capture"),
        textField("review", "Next review", record.review, false, "date"),
        textareaField("summary", "Summary", record.summary)
      ].join("")
    );
  }
  if (kind === "criteria") {
    return formShell(
      kind,
      record.id,
      [
        textField("name", "Criterion name", record.name, true),
        textField("category", "Category", record.category || "Technical", true),
        textField("weight", "Weight", record.weight ?? 10, true, "number", 'min="1" max="100"'),
        selectField("ourScore", "Our score", ["", "1", "2", "3", "4", "5"], String(record.ourScore ?? "")),
        selectField(
          "classification",
          "Claim classification",
          ["Confirmed", "Inference", "Hypothesis", "Conflicting", "Missing"],
          record.classification || "Hypothesis"
        ),
        `<div class="field checkbox-field"><label><input type="checkbox" name="isGate" ${
          record.isGate ? "checked" : ""
        }> Critical gate</label></div>`,
        textareaField("description", "Customer priority / criterion description", record.description),
        textareaField("rationale", "Score rationale", record.rationale),
        multiEvidenceField(record.evidenceIds || [])
      ].join("")
    );
  }
  if (kind === "evidence") {
    return formShell(
      kind,
      record.id,
      [
        textField("title", "Atomic claim / evidence title", record.title, true),
        textField("source", "Source name", record.source, true),
        textField("url", "Source URL (https://)", record.url, false, "url"),
        textField("publishedAt", "Published / observed date", record.publishedAt, false, "date"),
        selectField(
          "type",
          "Source type",
          ["Customer", "Competitor", "Market", "Internal", "Other"],
          record.type || "Customer"
        ),
        selectField("confidence", "Confidence", ["High", "Medium", "Low"], record.confidence || "Medium"),
        selectField(
          "classification",
          "Classification",
          ["Confirmed", "Inference", "Hypothesis", "Conflicting"],
          record.classification || "Hypothesis"
        ),
        selectField("stance", "Stance", ["Support", "Challenge", "Context", "Neutral"], record.stance || "Neutral"),
        textareaField("note", "Claim, excerpt, or analyst note", record.note),
        multiCriteriaField(record.criterionIds || []),
        `<div class="field full"><label>Local attachment (optional, maximum 300 KB)</label><input name="attachment" type="file" accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"><small>${
          record.attachmentName
            ? `Current attachment: ${esc(record.attachmentName)}. Selecting another replaces it.`
            : "The file is stored only in this browser and included in workspace exports."
        }</small></div>`
      ].join("")
    );
  }
  if (kind === "competitors") {
    const scoreFields = scoped("criteria")
      .map(
        criterion =>
          selectField(
            `score__${criterion.id}`,
            `${criterion.name} score`,
            ["", "1", "2", "3", "4", "5"],
            String(record.scores?.[criterion.id] ?? "")
          )
      )
      .join("");
    return formShell(
      kind,
      record.id,
      [
        textField("name", "Competitor name", record.name, true),
        textField("position", "Competitive role", record.position || "Challenger"),
        selectField(
          "bidLikelihood",
          "Bid likelihood",
          ["Very likely", "Likely", "Possible", "Unlikely", "Unknown"],
          record.bidLikelihood || "Likely"
        ),
        selectField(
          "classification",
          "Assessment classification",
          ["Confirmed", "Inference", "Hypothesis", "Conflicting"],
          record.classification || "Hypothesis"
        ),
        `<div class="field checkbox-field"><label><input type="checkbox" name="incumbent" ${
          record.incumbent ? "checked" : ""
        }> Incumbent / status quo</label></div>`,
        textareaField("strengths", "Strengths", record.strengths),
        textareaField("weaknesses", "Weaknesses", record.weaknesses),
        textareaField("strategy", "Likely strategy", record.strategy),
        textareaField("ghosting", "Likely ghosting themes", record.ghosting),
        textareaField("counterMoves", "Counter-positioning", record.counterMoves),
        multiEvidenceField(record.evidenceIds || []),
        `<div class="field full"><h3>Criterion scores</h3><p class="form-help">1 materially fails · 3 meets requirement · 5 exceptional proven discriminator · blank unknown</p></div>`,
        scoreFields || `<p class="note full">Add evaluation criteria before scoring this competitor.</p>`
      ].join("")
    );
  }
  if (kind === "actions") {
    return formShell(
      kind,
      record.id,
      [
        textField("title", "Action", record.title, true),
        textField("owner", "Owner", record.owner),
        textField("due", "Due date", record.due, false, "date"),
        selectField("priority", "Priority", ["Critical", "High", "Medium", "Low"], record.priority || "Medium"),
        selectField("status", "Status", ["Open", "In progress", "Blocked", "Complete"], record.status || "Open"),
        textareaField("finding", "Finding or gap addressed", record.finding)
      ].join("")
    );
  }
  if (kind === "playbooks") {
    return formShell(
      kind,
      record.id,
      [
        textField("name", "Playbook name", record.name, true),
        textareaField("description", "Purpose", record.description),
        textareaField("sections", "Preferred sections or facilitation prompts", record.sections)
      ].join("")
    );
  }
  return existing ? "" : "<p>Unsupported record type.</p>";
}

function formShell(kind, id, fields) {
  return `<form data-form="record" data-kind="${kind}" data-record-id="${esc(
    id || ""
  )}" class="form-grid">${fields}<div class="field full"><button class="btn primary">Save ${
    id ? "changes" : "record"
  }</button></div></form>`;
}

function reportEditForm(run) {
  return `<form data-form="report-edit" data-run-id="${run.id}" class="form-grid">
    ${selectField("status", "Review status", ["Draft", "In review", "Approved"], run.status)}
    ${textField("reviewer", "Reviewer / approver", run.reviewer)}
    ${textareaField("approvalNote", "Review or approval note", run.approvalNote)}
    <div class="field full"><label>Report Markdown</label><textarea class="report-editor" name="output" required>${esc(
      run.output
    )}</textarea></div>
    <div class="field full"><button class="btn primary">Save new version</button></div>
  </form>`;
}

function revisionsView(run) {
  const revisions = [
    {
      version: run.version,
      savedAt: run.updatedAt || run.createdAt,
      status: run.status,
      output: run.output,
      current: true
    },
    ...(run.revisions || []).slice().reverse()
  ];
  return `<div class="version-list">${revisions
    .map(
      revision => `<article><div><strong>Version ${esc(revision.version)} · ${esc(
        revision.status
      )}${revision.current ? " · Current" : ""}</strong><small>${esc(
        new Date(revision.savedAt).toLocaleString()
      )}</small></div>${
        revision.current
          ? ""
          : `<button class="btn small" data-restore-report="${run.id}:${revision.version}">Restore as new version</button>`
      }</article>`
    )
    .join("")}</div>`;
}

function updateRecord(kind, id, values) {
  const collection = data[kind];
  if (!Array.isArray(collection)) return null;
  const index = collection.findIndex(item => item.id === id);
  if (index < 0) return null;
  collection[index] = { ...collection[index], ...values, id: collection[index].id };
  save();
  return collection[index];
}

function restorePursuit(id) {
  const restored = updateRecord("pursuits", id, { archived: false });
  if (restored) {
    data.active = id;
    showArchived = false;
    save();
    render();
    toast("Pursuit restored");
  }
}

function saveReportVersion(runId, output, status, reviewer = "", approvalNote = "") {
  const run = data.runs.find(item => item.id === runId);
  if (!run) return;
  run.revisions = Array.isArray(run.revisions) ? run.revisions : [];
  run.revisions.push({
    version: run.version || 1,
    savedAt: run.updatedAt || run.createdAt,
    status: run.status || "Draft",
    reviewer: run.reviewer || "",
    approvalNote: run.approvalNote || "",
    output: run.output
  });
  const statusAlignedOutput = String(output).replace(
    /^\*\*Status:\*\*.*$/m,
    `**Status:** ${status}`
  );
  run.output = statusAlignedOutput;
  run.sections = splitMarkdownSections(statusAlignedOutput);
  run.version = Number(run.version || 1) + 1;
  run.status = status;
  run.reviewer = reviewer;
  run.approvalNote = approvalNote;
  run.updatedAt = new Date().toISOString();
  save();
}

function restoreReportVersion(runId, version) {
  const run = data.runs.find(item => item.id === runId);
  const revision = run?.revisions?.find(item => Number(item.version) === Number(version));
  if (!run || !revision) return;
  saveReportVersion(
    run.id,
    revision.output,
    revision.status,
    revision.reviewer,
    `Restored from version ${version}. ${revision.approvalNote || ""}`.trim()
  );
  render();
  toast(`Version ${version} restored as version ${run.version}`);
}

function exportMarkdown(run) {
  download(`${reportFilename(run)}.md`, run.output, "text/markdown;charset=utf-8");
}

function exportWord(run) {
  const html = markdownToWordHtml(run.output, run.title);
  download(
    `${reportFilename(run)}.doc`,
    `\ufeff${html}`,
    "application/msword;charset=utf-8"
  );
}

function exportPDF(run) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast("Allow pop-ups to open the print-ready report.");
    return;
  }
  printWindow.opener = null;
  const html = markdownToWordHtml(run.output, run.title).replace(
    "</head>",
    "<style>@page{margin:.65in}body{margin:0}button{display:none}</style></head>"
  );
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = run.title;
  printWindow.addEventListener(
    "load",
    () => {
      printWindow.focus();
      printWindow.print();
    },
    { once: true }
  );
}

function duplicatePursuit(id) {
  const source = data.pursuits.find(item => item.id === id);
  if (!source) return;
  createSnapshot(`Before duplicating ${source.name}`);
  const newPursuitId = uid();
  const idMaps = {
    criteria: new Map(),
    evidence: new Map(),
    competitors: new Map(),
    actions: new Map()
  };
  const copy = {
    ...structuredClone(source),
    id: newPursuitId,
    name: `${source.name} — Copy`,
    archived: false
  };
  data.pursuits.push(copy);
  for (const collection of ["criteria", "evidence", "competitors", "actions"]) {
    for (const record of data[collection].filter(item => item.pursuitId === id)) {
      idMaps[collection].set(record.id, uid());
    }
  }
  for (const collection of ["criteria", "evidence", "competitors", "actions"]) {
    const sourceRecords = data[collection].filter(item => item.pursuitId === id);
    for (const record of sourceRecords) {
      const duplicate = structuredClone(record);
      duplicate.id = idMaps[collection].get(record.id);
      duplicate.pursuitId = newPursuitId;
      if (collection === "criteria") {
        duplicate.evidenceIds = duplicate.evidenceIds.map(
          evidenceId => idMaps.evidence.get(evidenceId) || evidenceId
        );
      }
      if (collection === "evidence") {
        duplicate.criterionIds = duplicate.criterionIds.map(
          criterionId => idMaps.criteria.get(criterionId) || criterionId
        );
      }
      if (collection === "competitors") {
        duplicate.evidenceIds = duplicate.evidenceIds.map(
          evidenceId => idMaps.evidence.get(evidenceId) || evidenceId
        );
        duplicate.scores = Object.fromEntries(
          Object.entries(duplicate.scores || {}).map(([criterionId, score]) => [
            idMaps.criteria.get(criterionId) || criterionId,
            score
          ])
        );
      }
      data[collection].push(duplicate);
    }
  }
  data.active = newPursuitId;
  save();
  view = "command";
  render();
  toast("Pursuit and working records duplicated");
}

async function handleRecordSubmit(form) {
  const kind = form.dataset.kind;
  const recordId = form.dataset.recordId;
  const existing = data[kind]?.find(item => item.id === recordId) || {};
  const formData = new FormData(form);
  const record = { ...Object.fromEntries(formData), id: recordId || uid() };
  delete record.attachment;

  if (kind !== "playbooks") record.pursuitId = data.active;
  if (kind === "pursuits") {
    Object.assign(record, {
      status: existing.status || "Active",
      playbook: existing.playbook || data.playbooks[0]?.name || "",
      archived: false
    });
  }
  if (kind === "criteria") {
    record.weight = Number(record.weight);
    record.ourScore = record.ourScore ? Number(record.ourScore) : "";
    record.isGate = formData.has("isGate");
    record.evidenceIds = formData.getAll("evidenceIds");
    for (const evidence of scoped("evidence")) {
      evidence.criterionIds = evidence.criterionIds.filter(id => id !== record.id);
      if (record.evidenceIds.includes(evidence.id)) evidence.criterionIds.push(record.id);
    }
  }
  if (kind === "evidence") {
    record.citation = existing.citation || nextCitation();
    record.criterionIds = formData.getAll("criterionIds");
    for (const criterion of scoped("criteria")) {
      criterion.evidenceIds = criterion.evidenceIds.filter(id => id !== record.id);
      if (record.criterionIds.includes(criterion.id)) criterion.evidenceIds.push(record.id);
    }
    record.attachmentName = existing.attachmentName || "";
    record.attachmentType = existing.attachmentType || "";
    record.attachmentData = existing.attachmentData || "";
    const file = form.elements.attachment?.files?.[0];
    if (file) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        alert("Attachment is too large. The public browser edition allows a maximum of 300 KB.");
        return;
      }
      record.attachmentName = file.name;
      record.attachmentType = file.type || "application/octet-stream";
      record.attachmentData = await readDataUrl(file);
      if (isTextDocument(file)) {
        const excerpt = await file.text();
        if (!record.note.trim()) record.note = excerpt.slice(0, 4000);
      }
    }
  }
  if (kind === "competitors") {
    record.incumbent = formData.has("incumbent");
    record.evidenceIds = formData.getAll("evidenceIds");
    record.scores = Object.fromEntries(
      scoped("criteria").map(criterion => {
        const value = formData.get(`score__${criterion.id}`);
        return [criterion.id, value ? Number(value) : ""];
      })
    );
  }
  if (kind === "playbooks") record.builtIn = existing.builtIn || false;

  if (recordId) {
    updateRecord(kind, recordId, record);
  } else {
    data[kind].push(record);
    if (kind === "pursuits") {
      data.active = record.id;
      view = "command";
    }
    save();
  }
  document.querySelector("#modal").close();
  render();
  toast(recordId ? "Changes saved" : "Record added");
}

function buildAndSaveReport(formData) {
  const session = Object.fromEntries(formData);
  const report = buildCompetitiveReport(data, data.active, session);
  report.id = uid();
  report.pursuitId = data.active;
  report.status = session.reportStatus || "Draft";
  data.runs.push(report);
  save();
  view = "outputs";
  render();
  toast("Competitive-analysis report generated");
}

function deleteRecord(kind, id) {
  const record = data[kind]?.find(item => item.id === id);
  if (!record) return;
  if (!confirm(`Delete this ${kind.replace(/s$/, "")}? A recovery snapshot will be created first.`)) {
    return;
  }
  createSnapshot(`Before deleting ${kind} record`);
  data[kind] = data[kind].filter(item => item.id !== id);
  if (kind === "criteria") {
    for (const evidence of data.evidence) {
      evidence.criterionIds = evidence.criterionIds.filter(item => item !== id);
    }
    for (const competitor of data.competitors) delete competitor.scores[id];
  }
  if (kind === "evidence") {
    for (const criterion of data.criteria) {
      criterion.evidenceIds = criterion.evidenceIds.filter(item => item !== id);
    }
    for (const competitor of data.competitors) {
      competitor.evidenceIds = competitor.evidenceIds.filter(item => item !== id);
    }
  }
  save();
  render();
  toast("Record deleted; recovery snapshot retained");
}

function openRecord(kind, id = "") {
  const record = id ? data[kind].find(item => item.id === id) : {};
  modal(`${id ? "Edit" : "Add"} ${singular(kind)}`, recordForm(kind, record || {}));
}

document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) {
    view = button.dataset.view;
    render();
    return;
  }
  if (button.dataset.open) {
    data.active = button.dataset.open;
    view = "command";
    save();
    render();
  }
  if (button.dataset.duplicate) duplicatePursuit(button.dataset.duplicate);
  if (button.dataset.archive) {
    const item = data.pursuits.find(record => record.id === button.dataset.archive);
    if (item && confirm(`Archive ${item.name}?`)) {
      createSnapshot(`Before archiving ${item.name}`);
      item.archived = true;
      if (data.active === item.id) {
        data.active = data.pursuits.find(record => !record.archived)?.id || item.id;
      }
      save();
      render();
      toast("Pursuit archived");
    }
  }
  if (button.dataset.restorePursuit) restorePursuit(button.dataset.restorePursuit);
  if (button.dataset.add) openRecord(button.dataset.add);
  if (button.dataset.edit) {
    const [kind, id] = button.dataset.edit.split(":");
    openRecord(kind, id);
  }
  if (button.dataset.delete) {
    const [kind, id] = button.dataset.delete.split(":");
    deleteRecord(kind, id);
  }
  if (button.dataset.action === "new-pursuit") openRecord("pursuits");
  if (button.dataset.action === "snapshot") {
    createSnapshot("Manual recovery point");
    if (view === "recovery") render();
    toast("Recovery snapshot created");
  }
  if (button.dataset.action === "reset-demo") {
    if (confirm("Replace the current workspace with the synthetic demonstration?")) {
      const backup = makeSnapshot("Before resetting demo");
      data = normalizeWorkspace(seed, seed);
      data.snapshots.push(backup);
      save();
      view = "portfolio";
      render();
      toast("Synthetic demo restored");
    }
  }
  if (button.dataset.action === "export") {
    download(
      `black-hat-agent-workspace-${localDate()}.json`,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8"
    );
  }
  if (button.dataset.action === "import") document.querySelector("#importFile").click();
  if (button.dataset.close) document.querySelector("#modal").close();
  if (button.dataset.usePlaybook) {
    pursuit().playbook = data.playbooks.find(item => item.id === button.dataset.usePlaybook).name;
    save();
    toast("Playbook assigned");
  }
  if (button.dataset.clonePlaybook) {
    const source = data.playbooks.find(item => item.id === button.dataset.clonePlaybook);
    data.playbooks.push({
      ...structuredClone(source),
      id: uid(),
      name: `${source.name} — Custom`,
      builtIn: false
    });
    save();
    render();
    toast("Custom playbook created");
  }
  if (button.dataset.run) {
    view = "outputs";
    render();
    document.querySelector(`[data-edit-report="${button.dataset.run}"]`)?.focus();
  }
  if (button.dataset.copy) {
    navigator.clipboard
      .writeText(data.runs.find(item => item.id === button.dataset.copy).output)
      .then(() => toast("Report copied"));
  }
  if (button.dataset.download) {
    exportMarkdown(data.runs.find(item => item.id === button.dataset.download));
  }
  if (button.dataset.word) exportWord(data.runs.find(item => item.id === button.dataset.word));
  if (button.dataset.pdf) exportPDF(data.runs.find(item => item.id === button.dataset.pdf));
  if (button.dataset.editReport) {
    const run = data.runs.find(item => item.id === button.dataset.editReport);
    modal("Edit and review report", reportEditForm(run));
  }
  if (button.dataset.revisions) {
    const run = data.runs.find(item => item.id === button.dataset.revisions);
    modal("Report version history", revisionsView(run));
  }
  if (button.dataset.restoreReport) {
    const [runId, version] = button.dataset.restoreReport.split(":");
    document.querySelector("#modal").close();
    restoreReportVersion(runId, version);
  }
  if (button.dataset.restoreSnapshot) {
    if (confirm("Restore this recovery point? The current workspace will be snapshotted first.")) {
      restoreSnapshot(button.dataset.restoreSnapshot);
    }
  }
  if (button.dataset.attachment) {
    const item = data.evidence.find(record => record.id === button.dataset.attachment);
    const anchor = document.createElement("a");
    anchor.href = item.attachmentData;
    anchor.download = item.attachmentName;
    anchor.click();
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "search") {
    query = event.target.value;
    render();
    const search = document.querySelector("#search");
    search?.focus();
    search?.setSelectionRange(query.length, query.length);
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "showArchived") {
    showArchived = event.target.checked;
    render();
  }
  if (event.target.id === "importFile" && event.target.files[0]) {
    importWorkspaceFile(event.target.files[0]);
  }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.form;
  if (type === "opportunity") {
    updateRecord("pursuits", data.active, Object.fromEntries(new FormData(form)));
    render();
    toast("Opportunity saved");
  }
  if (type === "run") buildAndSaveReport(new FormData(form));
  if (type === "record") await handleRecordSubmit(form);
  if (type === "report-edit") {
    const formData = new FormData(form);
    saveReportVersion(
      form.dataset.runId,
      formData.get("output"),
      formData.get("status"),
      formData.get("reviewer"),
      formData.get("approvalNote")
    );
    document.querySelector("#modal").close();
    render();
    toast("New report version saved");
  }
});

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY && event.newValue) {
    toast("This workspace changed in another tab. Reload before making more edits.");
  }
});

async function importWorkspaceFile(file) {
  if (file.size > MAX_IMPORT_BYTES) {
    alert("Workspace file is too large. The public edition accepts JSON files up to 4 MB.");
    return;
  }
  try {
    const candidate = JSON.parse(await file.text());
    const normalized = normalizeWorkspace(candidate, seed);
    const result = validateWorkspace(normalized);
    if (!result.valid) throw new Error(result.errors.slice(0, 8).join("\n"));
    const backup = makeSnapshot("Before importing workspace");
    normalized.snapshots = [...(normalized.snapshots || []), backup].slice(-8);
    data = normalized;
    save();
    view = "portfolio";
    render();
    toast("Validated workspace imported");
  } catch (error) {
    alert(`The workspace was not imported:\n${error.message || "Invalid JSON file."}`);
  }
}

function readinessList(scores) {
  const items = [];
  if (!scores.criteria.length) items.push(["bad", "No customer evaluation criteria"]);
  else items.push(["good", `${scores.criteria.length} weighted customer criteria`]);
  if (!scoped("competitors").length) items.push(["bad", "No competitors recorded"]);
  else items.push(["good", `${scoped("competitors").length} competitors recorded`]);
  if (scores.us.coverage < 60) items.push(["warn", `Evidence coverage is ${scores.us.coverage}%`]);
  else items.push(["good", `Evidence coverage is ${scores.us.coverage}%`]);
  if (scores.gateWarnings.length) items.push(["bad", `${scores.gateWarnings.length} critical gate warning(s)`]);
  return `<ul class="readiness">${items
    .map(item => `<li class="${item[0]}">${esc(item[1])}</li>`)
    .join("")}</ul>`;
}

function metric(label, value) {
  return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
}

function scoreBar(label, value) {
  return `<div><span>${esc(label)}</span><div class="bar"><i style="width:${Math.max(
    0,
    Math.min(100, Number(value || 0))
  )}%"></i></div><strong>${esc(value)}</strong></div>`;
}

function sectionHero(eyebrow, title, description, action) {
  return `<div class="hero"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(
    title
  )}</h1><p>${esc(description)}</p></div>${action}</div>`;
}

function rowActions(kind, id) {
  return `<div class="row"><button class="btn small" data-edit="${kind}:${id}">Edit</button><button class="btn small danger" data-delete="${kind}:${id}">Delete</button></div>`;
}

function textField(name, label, value = "", required = false, type = "text", extra = "") {
  return `<div class="field"><label for="field-${name}">${esc(label)}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(
    value
  )}" ${required ? "required" : ""} ${extra}></div>`;
}

function textareaField(name, label, value = "") {
  return `<div class="field full"><label for="field-${name}">${esc(
    label
  )}</label><textarea id="field-${name}" name="${name}">${esc(value)}</textarea></div>`;
}

function selectField(name, label, options, selected) {
  return `<div class="field"><label for="field-${name}">${esc(
    label
  )}</label><select id="field-${name}" name="${name}">${options
    .map(
      option =>
        `<option value="${esc(option)}" ${String(option) === String(selected) ? "selected" : ""}>${
          option === "" ? "Unknown / not scored" : esc(option)
        }</option>`
    )
    .join("")}</select></div>`;
}

function multiEvidenceField(selected) {
  const options = scoped("evidence");
  return `<div class="field full"><label for="field-evidenceIds">Supporting evidence</label><select id="field-evidenceIds" name="evidenceIds" multiple size="${Math.min(
    7,
    Math.max(3, options.length)
  )}">${options
    .map(
      item =>
        `<option value="${item.id}" ${selected.includes(item.id) ? "selected" : ""}>[${esc(
          item.citation
        )}] ${esc(item.title)}</option>`
    )
    .join("")}</select><small>Use Ctrl/Cmd to select multiple records.</small></div>`;
}

function multiCriteriaField(selected) {
  const options = scoped("criteria");
  return `<div class="field full"><label for="field-criterionIds">Linked criteria</label><select id="field-criterionIds" name="criterionIds" multiple size="${Math.min(
    7,
    Math.max(3, options.length)
  )}">${options
    .map(
      item =>
        `<option value="${item.id}" ${selected.includes(item.id) ? "selected" : ""}>${esc(
          item.name
        )}</option>`
    )
    .join("")}</select><small>Use Ctrl/Cmd to select multiple criteria.</small></div>`;
}

function classificationTag(value) {
  const lower = String(value || "").toLowerCase();
  const style =
    lower.includes("confirm") || lower.includes("approve")
      ? "good"
      : lower.includes("conflict") || lower.includes("missing")
        ? "danger"
        : "";
  return `<span class="tag ${style}">${esc(value || "Unclassified")}</span>`;
}

function scoreCell(value) {
  return value === "" || value === undefined ? `<span class="muted">Unknown</span>` : `${esc(value)}/5`;
}

function nextCitation() {
  const values = scoped("evidence")
    .map(item => Number(String(item.citation).replace(/\D/g, "")))
    .filter(Number.isFinite);
  return `E-${String((values.length ? Math.max(...values) : 0) + 1).padStart(3, "0")}`;
}

function singular(kind) {
  return {
    pursuits: "pursuit",
    criteria: "criterion",
    evidence: "evidence",
    competitors: "competitor",
    actions: "action",
    playbooks: "playbook"
  }[kind];
}

function reportFilename(run) {
  return `${pursuit().name}-${run.date || localDate()}-v${run.version}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isTextDocument(file) {
  return (
    file.type.startsWith("text/") ||
    /\.(txt|md|csv|json)$/i.test(file.name)
  );
}

function download(name, content, type) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 800);
}

window.BlackHatApp = {
  validateWorkspace,
  normalizeWorkspace,
  calculateCompetitiveScores,
  buildCompetitiveReport,
  updateRecord,
  restorePursuit,
  saveReportVersion,
  exportMarkdown,
  exportWord,
  exportPDF
};

render();
