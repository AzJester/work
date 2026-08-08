import {
  SCHEMA_VERSION,
  buildCompetitiveReport,
  calculateCompetitiveScores,
  escapeHtml as esc,
  markdownToWordHtml,
  normalizeWorkspace,
  safeAttachmentDataUrl,
  safeHttpUrl,
  splitMarkdownSections,
  validateWorkspace,
  validateWorkspaceImport,
  validateWorkspaceSnapshot,
  workspaceInputHash
} from "./engine.js";
import {
  downloadImportTemplate,
  openLocalImportWizard
} from "./import-wizard.js";
import {
  buildRunVisualizationSnapshot,
  buildVisualizationSpecs,
  renderVisualizationSvg,
  renderVisualizationSet
} from "./visualizations.js";

const STORAGE_KEY = "black_hat_agent_public_v2";
const LEGACY_KEYS = ["astrion_blackhat_public_v2", "astrion_blackhat_public_v1"];
const MAX_IMPORT_BYTES = 10_000_000;
const MAX_ATTACHMENT_BYTES = 300_000;
const LEGACY_VISUAL_NOTICE =
  "Analysis visuals are unavailable because this legacy report has no report-time visual snapshot. Current workspace data was not substituted.";
const ATTACHMENT_MIME_BY_EXTENSION = Object.freeze({
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
});
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
const NAV_GROUPS = [
  {
    label: "Workspace",
    entries: [
      ["portfolio", "Pursuit Portfolio"],
      ["command", "Command Center"],
      ["opportunity", "Opportunity"]
    ]
  },
  {
    label: "Analysis",
    entries: [
      ["criteria", "Evaluation Criteria"],
      ["evidence", "Evidence Room"],
      ["competitors", "Competitors"]
    ]
  },
  {
    label: "Workflow",
    entries: [
      ["imports", "Data Import"],
      ["playbooks", "Playbook Library"],
      ["session", "Black Hat Session"]
    ]
  },
  {
    label: "Results",
    entries: [
      ["history", "Run History"],
      ["outputs", "Output Center"],
      ["actions", "Action Register"],
      ["recovery", "Recovery"]
    ]
  },
  {
    label: "Help",
    entries: [["guide", "User Guide"]]
  }
];
const VIEW_LABELS = Object.fromEntries(NAV_GROUPS.flatMap(group => group.entries));
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const seed = {
  schemaVersion: SCHEMA_VERSION,
  appVersion: "3.0.0",
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
      evidenceIds: ["e1", "e2"],
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
      evidenceIds: ["e2"],
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

let startupWarning = "";
let data = loadWorkspace();
let lastPersistedData = structuredClone(data);
let view = VIEW_LABELS[location.hash.slice(1)] ? location.hash.slice(1) : "portfolio";
let query = "";
let showArchived = false;
let navOpen = false;
let workspaceMenuOpen = false;
let dirtyForm = false;
let saveError = "";
let modalTrigger = null;
const listState = Object.fromEntries(
  ["criteria", "evidence", "competitors", "actions"].map(name => [
    name,
    { query: "", page: 1, pageSize: 25, sort: "" }
  ])
);

function loadWorkspace() {
  let raw = "";
  try {
    raw =
      localStorage.getItem(STORAGE_KEY) ||
      LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
    if (!raw) return normalizeWorkspace(seed, seed);
    const candidate = JSON.parse(raw);
    const importValidation = validateWorkspaceImport(candidate);
    if (!importValidation.valid) throw new Error(importValidation.errors.join("\n"));
    const normalized = normalizeWorkspace(candidate, seed);
    const validation = validateWorkspace(normalized);
    if (!validation.valid) throw new Error(validation.errors.join("\n"));
    return normalized;
  } catch (error) {
    startupWarning = raw
      ? "The stored workspace failed validation and was not loaded. Restore a known-good JSON backup before saving new work."
      : "The browser workspace could not be read. A fresh local demonstration was opened.";
    return normalizeWorkspace(seed, seed);
  }
}

function save() {
  const previous = structuredClone(lastPersistedData);
  data.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    lastPersistedData = structuredClone(data);
    dirtyForm = false;
    saveError = "";
    return true;
  } catch (error) {
    data = previous;
    saveError =
      error?.name === "QuotaExceededError"
        ? "Browser storage is full. Export the workspace and remove large attachments."
        : "The workspace could not be saved locally.";
    toast(
      saveError,
      "error"
    );
    return false;
  }
}

function saveStateText() {
  if (saveError) return saveError;
  if (dirtyForm) return "Unsaved changes";
  return `Saved locally · schema v${SCHEMA_VERSION}`;
}

function markDirty() {
  if (dirtyForm) return;
  dirtyForm = true;
  saveError = "";
  const indicator = document.querySelector(".save-state");
  if (indicator) {
    indicator.textContent = saveStateText();
    indicator.classList.add("dirty");
    indicator.classList.remove("error");
  }
}

function confirmDiscardChanges() {
  return !dirtyForm || confirm("Discard the unsaved changes on this page?");
}

function setNavOpen(open) {
  navOpen = Boolean(open);
  document.querySelector("#workspace-sidebar")?.classList.toggle("open", navOpen);
  document.querySelector(".nav-backdrop")?.classList.toggle("open", navOpen);
  document.querySelector(".nav-toggle")?.setAttribute("aria-expanded", String(navOpen));
  document.body.classList.toggle("nav-open", navOpen);
  if (navOpen) {
    document.querySelector(".nav-close")?.focus();
  } else {
    document.querySelector(".nav-toggle")?.focus();
  }
}

function setWorkspaceMenuOpen(open) {
  workspaceMenuOpen = Boolean(open);
  const menu = document.querySelector("#workspace-menu");
  const toggle = document.querySelector(".workspace-menu-toggle");
  if (menu) menu.hidden = !workspaceMenuOpen;
  toggle?.setAttribute("aria-expanded", String(workspaceMenuOpen));
  if (workspaceMenuOpen) menu?.querySelector("button")?.focus();
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

function pagedRecords(collection, records, searchText, sorters = {}) {
  const state = listState[collection];
  const needle = state.query.trim().toLowerCase();
  const filtered = records.filter(item => !needle || searchText(item).toLowerCase().includes(needle));
  const sorter = sorters[state.sort] || sorters.default;
  if (sorter) filtered.sort(sorter);
  const pages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * state.pageSize;
  return {
    items: filtered.slice(start, start + state.pageSize),
    filteredTotal: filtered.length,
    total: records.length,
    page: state.page,
    pages
  };
}

function listControls(collection, label, result, sortOptions = []) {
  const state = listState[collection];
  return `<div class="data-toolbar collection-toolbar" role="search" aria-label="${esc(label)} controls">
    <label><span>Search</span><input type="search" data-list-filter="${esc(
      collection
    )}" value="${esc(state.query)}" placeholder="Search ${esc(label.toLowerCase())}"></label>
    ${
      sortOptions.length
        ? `<label><span>Sort</span><select data-list-sort="${esc(collection)}">${sortOptions
            .map(
              option =>
                `<option value="${esc(option.value)}" ${
                  state.sort === option.value ? "selected" : ""
                }>${esc(option.label)}</option>`
            )
            .join("")}</select></label>`
        : ""
    }
    <label><span>Rows</span><select data-list-size="${esc(collection)}">${PAGE_SIZE_OPTIONS.map(
      size => `<option value="${size}" ${state.pageSize === size ? "selected" : ""}>${size}</option>`
    ).join("")}</select></label>
    <span class="result-count" role="status">${result.filteredTotal} of ${result.total}</span>
  </div>`;
}

function pagination(collection, result) {
  if (result.pages <= 1) return "";
  return `<nav class="pagination" aria-label="${esc(collection)} pages">
    <button class="btn small" type="button" data-list-page="${esc(collection)}" data-page="${
      result.page - 1
    }" ${result.page === 1 ? "disabled" : ""}>Previous</button>
    <span>Page ${result.page} of ${result.pages}</span>
    <button class="btn small" type="button" data-list-page="${esc(collection)}" data-page="${
      result.page + 1
    }" ${result.page === result.pages ? "disabled" : ""}>Next</button>
  </nav>`;
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

function pushSnapshot(label) {
  data.snapshots.push(makeSnapshot(label));
  data.snapshots = data.snapshots.slice(-8);
}

function createSnapshot(label) {
  pushSnapshot(label);
  if (!save()) {
    render();
    return false;
  }
  return true;
}

function restoreSnapshot(id) {
  const snapshot = data.snapshots.find(item => item.id === id);
  if (!snapshot) return;
  const snapshotValidation = validateWorkspaceSnapshot(snapshot);
  if (!snapshotValidation.valid) {
    toast("This recovery point failed validation and was not restored.", "error");
    return false;
  }
  const current = makeSnapshot("Before recovery restore");
  const restored = normalizeWorkspace(
    {
      ...structuredClone(snapshot.workspace),
      schemaVersion: SCHEMA_VERSION,
      active: snapshot.active,
      snapshots: []
    },
    seed
  );
  const validation = validateWorkspace(restored);
  if (!validation.valid) {
    toast("This recovery point contains invalid workspace data and was not restored.", "error");
    return false;
  }
  restored.snapshots = [...data.snapshots, current].slice(-8);
  data = restored;
  if (!save()) {
    render();
    return false;
  }
  navigateTo("portfolio");
  toast("Recovery snapshot restored");
  return true;
}

function toast(message, type = "info") {
  document.querySelector(".toast")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="toast ${type === "error" ? "error" : ""}" role="${
      type === "error" ? "alert" : "status"
    }">${esc(message)}</div>`
  );
  setTimeout(() => document.querySelector(".toast")?.remove(), 2600);
}

function nav() {
  const brand = `<div class="brand"><strong>Black Hat Agent</strong><span>Competitive analysis</span></div>`;
  return `<header class="mobile-header">
      <div class="mobile-brand">${brand}</div>
      <button class="nav-toggle" type="button" data-action="toggle-nav" aria-controls="workspace-sidebar" aria-expanded="${
        navOpen ? "true" : "false"
      }">Menu</button>
    </header>
    <aside class="sidebar ${navOpen ? "open" : ""}" id="workspace-sidebar">
    <div class="sidebar-header">${brand}<button class="nav-close" type="button" data-action="close-nav" aria-label="Close navigation">×</button></div>
    <nav class="nav" id="workspace-navigation" aria-label="Workspace navigation">
      ${NAV_GROUPS
        .map(
          (group, groupIndex) => `<section class="nav-section" aria-labelledby="nav-group-${groupIndex}">
            <div class="nav-label" id="nav-group-${groupIndex}">${esc(group.label)}</div>
            ${group.entries
              .map(
                item =>
                  `<a href="#${item[0]}" data-view="${item[0]}" class="${
                    view === item[0] ? "active" : ""
                  }" ${view === item[0] ? 'aria-current="page"' : ""}>${esc(item[1])}</a>`
              )
              .join("")}
          </section>`
        )
        .join("")}
    </nav>
    <div class="guardrail"><strong>Anonymous local workspace</strong>No sign-in, API, AI model, or automatic web research. Export backups regularly.</div>
  </aside>
  <div class="nav-backdrop ${navOpen ? "open" : ""}" data-action="close-nav" aria-hidden="true"></div>`;
}

function header() {
  const active = pursuit();
  return `<header class="topbar">
    <div class="active-context"><p class="eyebrow">ACTIVE PURSUIT</p><strong>${esc(
      active?.name || "No pursuit selected"
    )}</strong><span class="save-state ${dirtyForm ? "dirty" : saveError ? "error" : ""}">${esc(
      saveStateText()
    )}</span></div>
    <div class="workspace-actions">
      <span class="pill">LOCAL · NO SIGN-IN</span>
      <div class="workspace-menu-shell">
        <button class="btn small workspace-menu-toggle" type="button" data-action="toggle-workspace-menu" aria-controls="workspace-menu" aria-expanded="${
          workspaceMenuOpen ? "true" : "false"
        }">Workspace</button>
        <div class="workspace-menu" id="workspace-menu" ${workspaceMenuOpen ? "" : "hidden"}>
          <button type="button" data-action="snapshot">Create recovery snapshot</button>
          <button type="button" data-action="export">Export workspace JSON</button>
          <button type="button" data-action="tabular-import">Import Excel or CSV</button>
          <button type="button" data-action="import">Restore workspace JSON</button>
        </div>
      </div>
      <input id="importFile" type="file" accept=".json,application/json" aria-label="Restore workspace JSON" hidden>
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
              <span><small>OUR CPI</small>${result.totalWeight ? formatCpi(result.us.cpi) : "Not scored"}</span>
              <span><small>OPEN ACTIONS</small>${openActions}</span>
            </div>
            <div class="row">
              ${
                item.archived
                  ? `<button class="btn primary small" data-restore-pursuit="${esc(item.id)}">Restore</button>`
                  : `<button class="btn primary small" data-open="${esc(item.id)}">Open workspace</button>
                     <button class="btn small" data-duplicate="${esc(item.id)}">Duplicate with records</button>
                     <button class="btn small danger" data-archive="${esc(item.id)}">Archive</button>`
              }
            </div>
          </article>`;
        })
        .join("") ||
      `<div class="empty">No pursuits match this view. <button class="btn small" data-action="clear-portfolio">Clear filters</button></div>`
    }
  </div>`;
}

function command() {
  const active = pursuit();
  const scores = calculateCompetitiveScores(data, active.id);
  const visuals = buildVisualizationSpecs(data, active.id, scores);
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
    ${metric("OUR CPI", scores.totalWeight ? formatCpi(scores.us.cpi, "N/A") : "N/A")}
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
    ${chartPanel(visuals.rankedCpi, { idPrefix: "command-ranked-cpi" })}
  </div>
  ${
    scores.gateWarnings.length
      ? `<p class="note danger">Critical gates below minimum: ${esc(
          scores.gateWarnings.join(", ")
        )}</p>`
      : ""
  }
  <div class="visualization-grid visual-grid">
    ${chartPanel(visuals.scenarioRange, { idPrefix: "command-scenario" })}
    ${chartPanel(visuals.criterionDeltas, {
      wide: true,
      idPrefix: "command-criterion-deltas"
    })}
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
  if (!listState.criteria.sort) listState.criteria.sort = "weight-desc";
  const result = pagedRecords(
    "criteria",
    rows,
    item => `${item.name} ${item.category} ${item.description} ${item.classification}`,
    {
      "weight-desc": (a, b) => Number(b.weight || 0) - Number(a.weight || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      default: (a, b) => Number(b.weight || 0) - Number(a.weight || 0)
    }
  );
  const total = rows.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  return `${sectionHero(
    "EVALUATION CRITERIA",
    "Customer priorities and scoring",
    "Weight the customer's decision criteria, record our score, and link each judgment to evidence.",
    `<button class="btn primary" data-add="criteria">Add criterion</button>`
  )}
  <div class="panel">
    ${listControls("criteria", "Evaluation criteria", result, [
      { value: "weight-desc", label: "Highest weight" },
      { value: "name", label: "Name" }
    ])}
    <p class="note ${Math.abs(total - 100) > 0.01 ? "warn" : ""}">Entered weights total <strong>${total}</strong>. ${
      Math.abs(total - 100) > 0.01
        ? "Reports normalize them to 100, but confirming the intended weights is recommended."
        : "Weights are ready for direct comparison."
    }</p>
    ${
      result.items.length
        ? `<div class="table-wrap table-sticky sticky-first"><table><caption>Evaluation criteria and current scores</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Category</th><th scope="col">Weight</th><th scope="col">Our score</th><th scope="col">Classification</th><th scope="col">Evidence</th><th scope="col">Actions</th></tr></thead><tbody>
          ${result.items
            .map(
              item => `<tr>
                <th scope="row"><strong>${esc(item.name)}</strong>${item.isGate ? ` <span class="tag danger">GATE</span>` : ""}<small class="block">${esc(item.description)}</small></th>
                <td>${esc(item.category)}</td><td>${esc(item.weight)}</td><td>${scoreCell(item.ourScore)}</td>
                <td>${classificationTag(item.classification)}</td><td>${item.evidenceIds.length}</td>
                <td>${rowActions("criteria", item.id, `criterion ${item.name}`)}</td>
              </tr>`
            )
            .join("")}
        </tbody></table></div>${pagination("criteria", result)}`
        : `<div class="empty">${
            rows.length
              ? `No criteria match this search. <button class="btn small" data-clear-list="criteria">Clear filters</button>`
              : `Add weighted customer criteria before running a scored analysis. <button class="btn small" data-add="criteria">Add criterion</button>`
          }</div>`
    }
  </div>`;
}

function evidenceView() {
  const rows = scoped("evidence");
  const visuals = buildVisualizationSpecs(data, data.active);
  if (!listState.evidence.sort) listState.evidence.sort = "date-desc";
  const result = pagedRecords(
    "evidence",
    rows,
    item =>
      `${item.citation} ${item.title} ${item.source} ${item.note} ${item.classification} ${item.stance}`,
    {
      "date-desc": (a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")),
      citation: (a, b) => String(a.citation).localeCompare(String(b.citation)),
      title: (a, b) => a.title.localeCompare(b.title),
      default: (a, b) => String(a.citation).localeCompare(String(b.citation))
    }
  );
  return `${sectionHero(
    "EVIDENCE ROOM",
    "Source-linked evidence register",
    "Treat each record as one atomic claim. Label whether it supports, challenges, or contextualizes a judgment.",
    `<button class="btn primary" data-add="evidence">Add evidence</button>`
  )}
  <div class="visualization-grid visual-grid">
    ${chartPanel(visuals.evidenceGrid, { idPrefix: "evidence-grid" })}
    ${chartPanel(visuals.evidenceRelationships, {
      wide: true,
      idPrefix: "evidence-relationships"
    })}
  </div>
  <div class="panel">
    ${listControls("evidence", "Evidence", result, [
      { value: "date-desc", label: "Newest source date" },
      { value: "citation", label: "Citation" },
      { value: "title", label: "Title" }
    ])}
    ${
      result.items.length
        ? `<div class="evidence-list">${result.items
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
                  ${item.attachmentData ? `<button class="btn small" data-attachment="${esc(item.id)}">Download ${esc(item.attachmentName)}</button>` : ""}
                  ${rowActions("evidence", item.id, `evidence ${item.citation || item.title}`)}
                </div>
              </article>`;
            })
            .join("")}</div>${pagination("evidence", result)}`
        : `<div class="empty">${
            rows.length
              ? `No evidence matches this search. <button class="btn small" data-clear-list="evidence">Clear filters</button>`
              : `No evidence has been recorded. <button class="btn small" data-add="evidence">Add evidence</button>`
          }</div>`
    }
  </div>`;
}

function competitorsView() {
  const competitors = scoped("competitors");
  const criteria = scoped("criteria");
  const scores = calculateCompetitiveScores(data, data.active);
  const visuals = buildVisualizationSpecs(data, data.active, scores);
  if (!listState.competitors.sort) listState.competitors.sort = "cpi-desc";
  const competitorResult = pagedRecords(
    "competitors",
    competitors,
    item =>
      `${item.name} ${item.position} ${item.strategy} ${item.strengths} ${item.weaknesses} ${item.bidLikelihood}`,
    {
      "cpi-desc": (a, b) =>
        Number(scores.competitors.find(item => item.id === b.id)?.cpi || 0) -
        Number(scores.competitors.find(item => item.id === a.id)?.cpi || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      likelihood: (a, b) => String(a.bidLikelihood).localeCompare(String(b.bidLikelihood)),
      default: (a, b) => a.name.localeCompare(b.name)
    }
  );
  const visibleCompetitors = competitorResult.items;
  return `${sectionHero(
    "COMPETITORS",
    "Competitive landscape and scoring",
    "Record explicit competitor hypotheses, cite supporting evidence, and score each company against the same customer criteria.",
    `<button class="btn primary" data-add="competitors">Add competitor</button>`
  )}
  ${listControls("competitors", "Competitors", competitorResult, [
    { value: "cpi-desc", label: "Highest CPI" },
    { value: "name", label: "Name" },
    { value: "likelihood", label: "Bid likelihood" }
  ])}
  <div class="visualization-grid visual-grid">
    ${chartPanel(visuals.scoreHeatmap, { wide: true, idPrefix: "competitor-heatmap" })}
  </div>
  <div class="grid">
    ${
      visibleCompetitors
        .map(item => {
          const result = scores.competitors.find(score => score.id === item.id);
          return `<article class="card">
            <span class="stage">${esc(item.position)}${item.incumbent ? " · INCUMBENT" : ""}</span>
            <span class="status">${esc(item.bidLikelihood)}</span>
            <h3>${esc(item.name)}</h3>
            <div class="score-hero">${formatCpi(result?.cpi, "Unknown", false)}<small>CPI / 100</small></div>
            <p><strong>Likely strategy:</strong> ${esc(item.strategy || "Not recorded")}</p>
            <p><strong>Strengths:</strong> ${esc(item.strengths || "Not recorded")}</p>
            <p><strong>Weaknesses:</strong> ${esc(item.weaknesses || "Not recorded")}</p>
            <p><strong>Ghosting themes:</strong> ${esc(item.ghosting || "Not recorded")}</p>
            ${rowActions("competitors", item.id, `competitor ${item.name}`)}
          </article>`;
        })
        .join("") ||
      `<div class="empty">${
        competitors.length
          ? `No competitors match this search. <button class="btn small" data-clear-list="competitors">Clear filters</button>`
          : `Add at least one competitor for relative scoring. <button class="btn small" data-add="competitors">Add competitor</button>`
      }</div>`
    }
  </div>
  ${pagination("competitors", competitorResult)}
  <section class="panel matrix-panel"><h2>Scoring matrix</h2>
    <p class="muted">Scores use a 1–5 scale. Competitive Position Index (CPI) is normalized to 100 and is not a win probability.</p>
    ${
      criteria.length
        ? `<div class="table-wrap table-sticky sticky-first comparison-table"><table><caption>Weighted criterion scores for the visible competitors</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Weight</th><th scope="col">Our team</th>${visibleCompetitors
            .map(item => `<th scope="col">${esc(item.name)}</th>`)
            .join("")}</tr></thead><tbody>
            ${criteria
              .map(
                criterion => `<tr><th scope="row">${esc(criterion.name)}</th><td>${esc(
                  criterion.weight
                )}</td><td>${scoreCell(criterion.ourScore)}</td>${visibleCompetitors
                  .map(item => `<td>${scoreCell(item.scores?.[criterion.id])}</td>`)
                  .join("")}</tr>`
              )
              .join("")}
            <tr class="total-row"><th scope="row">CPI</th><td>100 normalized</td><td>${formatCpi(scores.us.cpi, "Unknown", false)}</td>${visibleCompetitors
              .map(
                competitor =>
                  `<td>${formatCpi(
                    scores.competitors.find(item => item.id === competitor.id)?.cpi,
                    "Unknown",
                    false
                  )}</td>`
              )
              .join("")}</tr>
          </tbody></table></div>`
        : `<div class="empty">Define evaluation criteria to enable scoring. <button class="btn small" data-add="criteria">Add criterion</button></div>`
    }
  </section>`;
}

function importsView() {
  return `${sectionHero(
    "DATA IMPORT",
    "Bring spreadsheet data into the analysis",
    "Select an Excel or CSV file, choose a worksheet and destination, map its columns, and validate every row before anything changes.",
    `<button class="btn primary" data-action="tabular-import">Start local import</button>`
  )}
  <div class="two-col">
    <section class="panel">
      <h2>Supported destinations</h2>
      <div class="import-target-list">
        <span>Pursuits</span><span>Evaluation criteria</span><span>Evidence</span>
        <span>Competitors</span><span>Competitor scores</span><span>Actions</span>
      </div>
      <p>Imports can add new records, update matching records, or replace one record type inside the active pursuit. Replace operations require explicit confirmation.</p>
      <div class="row">
        <button class="btn primary" data-action="tabular-import">Choose Excel or CSV</button>
        <button class="btn" data-action="import-template">Download workbook template</button>
      </div>
    </section>
    <section class="panel">
      <h2>Private by design</h2>
      <ul class="import-checklist">
        <li>The selected file is parsed on this device and is never uploaded.</li>
        <li>Macros, formulas, and external workbook links are never executed.</li>
        <li>Only mapped cell values are retained; the original workbook is discarded.</li>
        <li>A recovery snapshot is created immediately before a successful import.</li>
      </ul>
      <p class="note warn">Imported values are stored in this browser and included in workspace backups. Do not use this public edition for controlled or classified information.</p>
    </section>
  </div>
  <section class="panel">
    <h2>Four-step workflow</h2>
    <ol class="import-flow">
      <li><strong>Choose</strong><span>Select .xlsx, .xls, or .csv.</span></li>
      <li><strong>Configure</strong><span>Pick the worksheet, header row, destination, and import mode.</span></li>
      <li><strong>Map</strong><span>Confirm how spreadsheet columns match Black Hat Agent fields.</span></li>
      <li><strong>Review</strong><span>Resolve errors, preview the result, and apply once.</span></li>
    </ol>
  </section>`;
}

function guideView() {
  const steps = [
    [
      "portfolio",
      "Choose a pursuit",
      "Create a pursuit or select the opportunity your team is assessing.",
      "Open Pursuit Portfolio"
    ],
    [
      "opportunity",
      "Frame the opportunity",
      "Record the customer, acquisition context, priorities, decision dates, and your current position.",
      "Open Opportunity"
    ],
    [
      "criteria",
      "Define how the customer will evaluate",
      "Add weighted criteria, gates, your current scores, and the rationale behind each judgment.",
      "Open Evaluation Criteria"
    ],
    [
      "evidence",
      "Build the evidence base",
      "Capture sources, confidence, classification, stance, and links to the criteria each source supports.",
      "Open Evidence Room"
    ],
    [
      "competitors",
      "Assess likely competitors",
      "Describe each competitor and score everyone against the same customer evaluation criteria.",
      "Open Competitors"
    ],
    [
      "imports",
      "Import structured data when useful",
      "Use the local wizard for Excel or CSV data, confirm the column mapping, and resolve every validation error.",
      "Open Data Import"
    ],
    [
      "session",
      "Run the Black Hat session",
      "Select a playbook, add participants and facilitator notes, then generate the deterministic analysis.",
      "Open Black Hat Session"
    ],
    [
      "outputs",
      "Review, act, and share",
      "Challenge the draft, save revisions, assign actions, and export approved reports and workspace backups.",
      "Open Output Center"
    ]
  ];
  return `${sectionHero(
    "USER GUIDE",
    "How to use Black Hat Agent",
    "Follow this workflow to turn team knowledge and source evidence into a reviewable competitive analysis.",
    `<button class="btn primary" data-view="portfolio">Start with Pursuit Portfolio</button>`
  )}
  <section class="panel guide-panel" aria-labelledby="guideWorkflowHeading">
    <div class="report-heading">
      <div><p class="eyebrow">RECOMMENDED WORKFLOW</p><h2 id="guideWorkflowHeading">Build the analysis in eight steps</h2></div>
      <span class="tag good">START HERE</span>
    </div>
    <ol class="guide-steps">
      ${steps
        .map(
          ([destination, title, description, action]) => `<li>
            <div><strong>${title}</strong><p>${description}</p></div>
            <button class="btn small" type="button" data-view="${destination}">${action}</button>
          </li>`
        )
        .join("")}
    </ol>
  </section>
  <div class="two-col guide-grid">
    <section class="panel guide-card">
      <p class="eyebrow">BEFORE GENERATING A REPORT</p>
      <h2>Build an evidence-ready workspace</h2>
      <ul class="guide-checklist">
        <li>Use one active pursuit with a clear customer, scope, and decision context.</li>
        <li>Define meaningful evaluation criteria and weights before scoring competitors.</li>
        <li>Connect important judgments to evidence and label assumptions honestly.</li>
        <li>Score your team and every competitor against the same criteria.</li>
        <li>Resolve obvious gaps or record them as actions before sharing the report.</li>
      </ul>
    </section>
    <section class="panel guide-card">
      <p class="eyebrow">UNDERSTAND THE OUTPUT</p>
      <h2>Use the report as a structured team judgment</h2>
      <p>The application compares only the data your team enters. It applies repeatable scoring and report rules; it does not search the web, discover competitors, verify facts, or call an AI model.</p>
      <p>Treat the generated report as a draft. Review the evidence, challenge assumptions, edit conclusions, save a new version, and record the actions the team agrees to take.</p>
      <button class="btn small" type="button" data-view="command">Check analysis readiness</button>
    </section>
    <section class="panel guide-card">
      <p class="eyebrow">IMPORTING DATA</p>
      <h2>Preview spreadsheet changes before applying them</h2>
      <p>Choose an Excel or UTF-8 CSV file, select the worksheet and header row, choose a destination and mode, then review every suggested field mapping.</p>
      <p>Nothing changes until validation passes and you select <strong>Apply import</strong>. Review all diagnostics or download the diagnostics CSV when a source needs correction. A recovery point is created immediately before the import is saved.</p>
      <button class="btn small" type="button" data-view="imports">Open Data Import</button>
    </section>
    <section class="panel guide-card">
      <p class="eyebrow">READING THE VISUALS</p>
      <h2>Compare position, evidence, uncertainty, and action</h2>
      <p>Charts across the workspace show CPI ranking, score gaps, scenario range, evidence coverage and relationships, run trends, and action status. Select <strong>View accessible data table</strong> for exact values.</p>
      <p><strong>Unknown</strong> means a value is missing; the application never silently treats it as zero. Generated reports preserve a report-time visual snapshot.</p>
      <button class="btn small" type="button" data-view="command">Open Command Center</button>
    </section>
    <section class="panel guide-card">
      <p class="eyebrow">BACKUP AND PRIVACY</p>
      <h2>Protect the work stored in this browser</h2>
      <p>There is no sign-in. Workspace data remains in this browser profile, so clearing site data can remove it. Export a dated workspace backup before major sessions or bulk changes.</p>
      <p>Use only synthetic, public, or otherwise approved information in this public edition. Browser storage is not an enterprise security boundary.</p>
      <div class="row">
        <button class="btn small" type="button" data-action="export">Export workspace</button>
        <button class="btn small" type="button" data-view="recovery">Open Recovery</button>
      </div>
    </section>
  </div>`;
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
        <div class="row"><button class="btn small" data-use-playbook="${esc(item.id)}">Use for active pursuit</button>
          ${
            item.builtIn
            ? `<button class="btn small" data-clone-playbook="${esc(item.id)}">Clone</button>`
            : rowActions("playbooks", item.id, `playbook ${item.name}`)
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
  const visuals = buildVisualizationSpecs(data, data.active);
  return `${sectionHero(
    "RUN HISTORY",
    "Analysis history",
    "Reports preserve their source hash, approval status, edits, and prior revisions.",
    ""
  )}
  <div class="visualization-grid visual-grid">
    ${chartPanel(visuals.runHistory, { wide: true, idPrefix: "run-history-trend" })}
  </div>
  <div class="grid">${
    runs
      .map(run => {
        const stale = run.sourceHash && run.sourceHash !== workspaceInputHash(data, data.active);
        return `<article class="card">
          <span class="stage">${esc(run.date || run.createdAt?.slice(0, 10))}</span>
          <span class="status">${esc(run.status)}</span>
          <h3>${esc(run.title)}</h3><p>${esc(run.question)}</p>
          <div class="row">${stale ? `<span class="tag danger">SOURCE DATA CHANGED</span>` : `<span class="tag good">CURRENT INPUTS</span>`}<span class="tag">VERSION ${esc(run.version)}</span></div>
          <div class="row"><button class="btn small" data-run="${esc(run.id)}">Open output</button><button class="btn small" data-revisions="${esc(run.id)}">Versions</button><button class="btn small danger" data-delete="${esc(`runs:${run.id}`)}" aria-label="Delete report ${esc(run.title)}">Delete</button></div>
        </article>`;
      })
      .join("") ||
    `<div class="empty">No reports have been generated for this pursuit. <button class="btn small" data-view="session">Run analysis</button></div>`
  }</div>`;
}

function outputsView() {
  const runs = scoped("runs").slice().reverse();
  return `${sectionHero(
    "OUTPUT CENTER",
    "Editable competitive-analysis reports",
    "Review the analysis, save controlled revisions, approve it, and export Markdown, visual HTML, Word-compatible .doc, or print-ready PDF.",
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
          ${reportVisualMarkup(run, `report-${String(run.id).replace(/[^a-z0-9_-]/gi, "-")}`)}
          <div class="report-document report-view">${reportBodyHtml(run.output, run.title)}</div>
          <details class="markdown-source"><summary>View Markdown source</summary><pre class="run-output">${esc(
            run.output
          )}</pre></details>
          <div class="report-actions">
            <div class="action-group" role="group" aria-label="Review report">
              <span>Review</span>
              <button class="btn small" data-edit-report="${esc(run.id)}">Edit report</button>
              <button class="btn small" data-revisions="${esc(run.id)}">Version history</button>
            </div>
            <div class="action-group" role="group" aria-label="Export report">
              <span>Export</span>
              <button class="btn small" data-copy="${esc(run.id)}">Copy</button>
              <button class="btn small" data-download="${esc(run.id)}">Markdown</button>
              <button class="btn small" data-visuals="${esc(run.id)}">Visuals HTML</button>
              <button class="btn small" data-word="${esc(run.id)}">Word</button>
              <button class="btn small" data-pdf="${esc(run.id)}">Print / PDF</button>
            </div>
          </div>
        </article>`;
      })
      .join("") ||
    `<div class="empty">Run a Black Hat session to generate a competitive-analysis report. <button class="btn small" data-view="session">Start Black Hat session</button></div>`
  }`;
}

function actionsView() {
  const rows = scoped("actions");
  const visuals = buildVisualizationSpecs(data, data.active);
  if (!listState.actions.sort) listState.actions.sort = "priority";
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const result = pagedRecords(
    "actions",
    rows,
    item => `${item.priority} ${item.title} ${item.finding} ${item.owner} ${item.status}`,
    {
      priority: (a, b) =>
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
        String(a.due || "9999").localeCompare(String(b.due || "9999")),
      due: (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")),
      owner: (a, b) => String(a.owner || "").localeCompare(String(b.owner || "")),
      status: (a, b) => String(a.status).localeCompare(String(b.status)),
      default: (a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    }
  );
  return `${sectionHero(
    "ACTION REGISTER",
    "Prioritized mitigation and intelligence actions",
    "Convert vulnerabilities, proof gaps, and unanswered questions into accountable work.",
    `<button class="btn primary" data-add="actions">Add action</button>`
  )}
  <div class="visualization-grid visual-grid">
    ${chartPanel(visuals.actionSummary, { wide: true, idPrefix: "action-summary" })}
  </div>
  <div class="panel">
    ${listControls("actions", "Actions", result, [
      { value: "priority", label: "Priority" },
      { value: "due", label: "Due date" },
      { value: "owner", label: "Owner" },
      { value: "status", label: "Status" }
    ])}
    ${
    result.items.length
      ? `<div class="table-wrap table-sticky sticky-first"><table><caption>Mitigation and intelligence actions</caption><thead><tr><th scope="col">Priority</th><th scope="col">Action</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>${result.items
          .map(
            item =>
              `<tr><td><span class="tag ${item.priority === "Critical" ? "danger" : ""}">${esc(
                item.priority
              )}</span></td><td><strong>${esc(item.title)}</strong><small class="block">${esc(
                item.finding
              )}</small></td><td>${esc(item.owner || "Unassigned")}</td><td>${esc(
                item.due || "TBD"
              )}</td><td>${esc(item.status)}</td><td>${rowActions(
                "actions",
                item.id,
                `action ${item.title}`
              )}</td></tr>`
          )
          .join("")}</tbody></table></div>${pagination("actions", result)}`
      : `<div class="empty">${
          rows.length
            ? `No actions match this search. <button class="btn small" data-clear-list="actions">Clear filters</button>`
            : `No actions have been recorded. <button class="btn small" data-add="actions">Add action</button>`
        }</div>`
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
            )}</small></div><button class="btn small" data-restore-snapshot="${esc(item.id)}">Restore</button></article>`
          )
          .join("")}</div>`
      : `<div class="empty">No recovery snapshots exist yet.</div>`
  }</div>`;
}

function navigateTo(nextView, { historyMode = "push", focus = true } = {}) {
  if (!VIEW_LABELS[nextView] || !confirmDiscardChanges()) return false;
  dirtyForm = false;
  saveError = "";
  navOpen = false;
  workspaceMenuOpen = false;
  view = nextView;
  if (historyMode === "push") {
    history.pushState({ view }, "", `#${view}`);
  } else if (historyMode === "replace") {
    history.replaceState({ view }, "", `#${view}`);
  }
  render();
  if (focus) requestAnimationFrame(() => document.querySelector("#content")?.focus());
  return true;
}

function render() {
  const views = {
    portfolio,
    command,
    opportunity,
    criteria: criteriaView,
    evidence: evidenceView,
    competitors: competitorsView,
    imports: importsView,
    playbooks: playbooksView,
    session: sessionView,
    history: historyView,
    outputs: outputsView,
    actions: actionsView,
    recovery: recoveryView,
    guide: guideView
  };
  if (!views[view]) view = "portfolio";
  document.querySelector("#app").innerHTML = `<a class="skip-link" href="#content">Skip to content</a><div class="app">${nav()}<main class="main">${header()}<div class="content" id="content" tabindex="-1">${views[
    view
  ]()}</div><div class="footer-note">Public browser-only application · Synthetic sample data · Deterministic analysis · Export backups regularly.</div></main></div><dialog id="modal" aria-modal="true" aria-labelledby="modal-title"></dialog>`;
  document.title = `${VIEW_LABELS[view] || "Black Hat Agent"} · Black Hat Agent`;
}

function modal(title, body) {
  const dialog = document.querySelector("#modal");
  modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const cancelHandler = event => {
    if (!confirmDiscardChanges()) {
      event.preventDefault();
      return;
    }
    dirtyForm = false;
  };
  dialog.innerHTML = `<div class="modal"><header><h2 id="modal-title">${esc(
    title
  )}</h2><button class="close" aria-label="Close dialog" data-close>×</button></header>${body}</div>`;
  dialog.addEventListener(
    "close",
    () => {
      dialog.removeEventListener("cancel", cancelHandler);
      if (modalTrigger?.isConnected) modalTrigger.focus();
      modalTrigger = null;
    },
    { once: true }
  );
  dialog.addEventListener("cancel", cancelHandler);
  dialog.showModal();
  requestAnimationFrame(() => {
    (
      dialog.querySelector("input:not([type=hidden]), select, textarea") ||
      dialog.querySelector("button")
    )?.focus();
  });
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
  return `<form data-form="record" data-kind="${esc(kind)}" data-record-id="${esc(
    id || ""
  )}" class="form-grid">${fields}<div class="field full form-actions"><button class="btn primary">Save ${
    id ? "changes" : "record"
  }</button><button class="btn" type="button" data-close>Cancel</button></div></form>`;
}

function reportEditForm(run) {
  return `<form data-form="report-edit" data-run-id="${esc(run.id)}" class="form-grid">
    ${selectField("status", "Review status", ["Draft", "In review", "Approved"], run.status)}
    ${textField("reviewer", "Reviewer / approver", run.reviewer)}
    ${textareaField("approvalNote", "Review or approval note", run.approvalNote)}
    <div class="field full"><label for="report-output">Report Markdown <span class="required-mark" aria-hidden="true">*</span></label><textarea id="report-output" class="report-editor" name="output" required>${esc(
      run.output
    )}</textarea></div>
    <div class="field full form-actions"><button class="btn primary">Save new version</button><button class="btn" type="button" data-close>Cancel</button></div>
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
          : `<button class="btn small" data-restore-report="${esc(
            `${run.id}:${revision.version}`
          )}">Restore as new version</button>`
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
  if (!save()) return null;
  return collection[index];
}

function restorePursuit(id) {
  const restored = data.pursuits.find(item => item.id === id);
  if (restored) {
    restored.archived = false;
    data.active = id;
    if (save()) {
      showArchived = false;
      render();
      toast("Pursuit restored");
    } else {
      render();
    }
  }
}

function saveReportVersion(runId, output, status, reviewer = "", approvalNote = "") {
  const run = data.runs.find(item => item.id === runId);
  if (!run) return false;
  run.revisions = Array.isArray(run.revisions) ? run.revisions : [];
  run.revisions.push({
    version: run.version || 1,
    savedAt: run.updatedAt || run.createdAt,
    status: run.status || "Draft",
    reviewer: run.reviewer || "",
    approvalNote: run.approvalNote || "",
    output: run.output
  });
  const statusLine = `**Status:** ${status}`;
  const statusAlignedOutput = /^\*\*Status:\*\*.*$/m.test(String(output))
    ? String(output).replace(/^\*\*Status:\*\*.*$/m, statusLine)
    : String(output).replace(/^# .+$/m, match => `${match}\n\n${statusLine}`);
  run.output = statusAlignedOutput;
  run.sections = splitMarkdownSections(statusAlignedOutput);
  run.version = Number(run.version || 1) + 1;
  run.status = status;
  run.reviewer = reviewer;
  run.approvalNote = approvalNote;
  run.updatedAt = new Date().toISOString();
  return save();
}

function restoreReportVersion(runId, version) {
  const run = data.runs.find(item => item.id === runId);
  const revision = run?.revisions?.find(item => Number(item.version) === Number(version));
  if (!run || !revision) return;
  if (
    saveReportVersion(
      run.id,
      revision.output,
      revision.status,
      revision.reviewer,
      `Restored from version ${version}. ${revision.approvalNote || ""}`.trim()
    )
  ) {
    render();
    toast(`Version ${version} restored as a new version`);
  } else {
    render();
  }
}

function exportMarkdown(run) {
  download(`${reportFilename(run)}.md`, run.output, "text/markdown;charset=utf-8");
}

function reportBodyHtml(markdown, title) {
  const documentHtml = markdownToWordHtml(markdown, title);
  return documentHtml.match(/<body>([\s\S]*)<\/body>/i)?.[1] || `<pre>${esc(markdown)}</pre>`;
}

function visualExportSections(run, { imageData = {} } = {}) {
  const specs = reportVisualSpecs(run);
  if (!specs) {
    return `<section class="export-visual legacy-visual-notice"><h2>Analysis visuals unavailable</h2><p>${esc(
      LEGACY_VISUAL_NOTICE
    )}</p></section>`;
  }
  const rendered = renderVisualizationSet(specs, {
    idPrefix: `export-${String(run.id || "report").replace(/[^a-z0-9_-]/gi, "-")}`,
    theme: "light"
  });
  const order = [
    "rankedCpi",
    "scenarioRange",
    "criterionDeltas",
    "scoreHeatmap",
    "evidenceGrid",
    "evidenceRelationships",
    "actionSummary"
  ];
  return order
    .filter(name => specs?.[name])
    .map(name => {
      const spec = specs[name];
      const visual = imageData[name]
        ? `<img src="${imageData[name]}" alt="${esc(spec.title || "Analysis visualization")}" />`
        : rendered[name] || "";
      return `<section class="export-visual"><h2>${esc(
        spec.title || "Analysis visualization"
      )}</h2><p>${esc(spec.description || "")}</p>${visual}${visualDataTable(spec)}</section>`;
    })
    .join("");
}

function visualExportIntro(run) {
  return reportVisualSpecs(run)
    ? "These visuals reflect the saved report snapshot. Values marked Unknown were not available at report time."
    : "";
}

function exportVisuals(run) {
  const sections = visualExportSections(run);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    run.title
  )} — Analysis visuals</title><style>body{font:15px/1.5 Arial,sans-serif;color:#211a30;max-width:1100px;margin:32px auto;padding:0 24px}h1,h2{line-height:1.2}.export-visual{margin:36px 0;break-inside:avoid}.export-visual svg{display:block;width:100%;height:auto;border:1px solid #d6d0df;border-radius:8px;background:#fff}.table-wrap{overflow:auto;margin-top:12px}table{border-collapse:collapse;width:100%;font-size:13px}caption{text-align:left;font-weight:700;margin-bottom:8px}th,td{border:1px solid #d6d0df;padding:7px;text-align:left}thead{background:#eeeaf3}@media print{body{margin:0;max-width:none}.export-visual{break-inside:avoid}}</style></head><body><h1>${esc(
    run.title
  )} — Analysis visuals</h1>${
    visualExportIntro(run) ? `<p>${esc(visualExportIntro(run))}</p>` : ""
  }${sections}</body></html>`;
  download(`${reportFilename(run)}-visuals.html`, html, "text/html;charset=utf-8");
}

function svgToPngDataUrl(svg) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      try {
        const viewBox = String(svg.match(/viewBox="([^"]+)"/i)?.[1] || "")
          .trim()
          .split(/\s+/)
          .map(Number);
        const sourceWidth =
          viewBox.length === 4 && Number.isFinite(viewBox[2]) ? Math.max(1, viewBox[2]) : 940;
        const sourceHeight =
          viewBox.length === 4 && Number.isFinite(viewBox[3]) ? Math.max(1, viewBox[3]) : 430;
        const width = Math.min(1800, Math.max(900, sourceWidth * 1.5));
        const height = Math.round((sourceHeight / sourceWidth) * width);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("The visualization could not be converted for Word."));
    };
    image.src = blobUrl;
  });
}

async function exportWord(run) {
  toast("Preparing the Word report with analysis visuals.");
  const specs = reportVisualSpecs(run) || {};
  const rendered = renderVisualizationSet(specs, {
    idPrefix: `word-${String(run.id || "report").replace(/[^a-z0-9_-]/gi, "-")}`,
    theme: "light"
  });
  const imageData = {};
  for (const [name, svg] of Object.entries(rendered)) {
    try {
      imageData[name] = await svgToPngDataUrl(svg);
    } catch {
      // The accessible table remains in the document if a browser cannot rasterize an SVG.
    }
  }
  const visuals = visualExportSections(run, { imageData });
  const html = markdownToWordHtml(run.output, run.title)
    .replace(
      "<body>",
      `<body><section><h1>Analysis visuals</h1>${
        visualExportIntro(run) ? `<p>${esc(visualExportIntro(run))}</p>` : ""
      }${visuals}</section><hr>`
    )
    .replace(
      "</head>",
      "<style>.export-visual{margin:24px 0;page-break-inside:avoid}.export-visual img{max-width:100%;height:auto}.table-wrap{margin-top:8px}table{border-collapse:collapse;width:100%;font-size:10pt}caption{text-align:left;font-weight:bold;margin-bottom:6px}th,td{border:1px solid #b8b8b8;padding:5px;text-align:left}thead{background:#eeeaf3}</style></head>"
    );
  download(
    `${reportFilename(run)}.doc`,
    `\ufeff${html}`,
    "application/msword;charset=utf-8"
  );
  toast("Word report downloaded");
}

function exportPDF(run) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast("Allow pop-ups to open the print-ready report.");
    return;
  }
  printWindow.opener = null;
  const visuals = visualExportSections(run);
  const html = markdownToWordHtml(run.output, run.title)
    .replace(
      "<body>",
      `<body><section><h1>Analysis visuals</h1>${
        visualExportIntro(run) ? `<p>${esc(visualExportIntro(run))}</p>` : ""
      }${visuals}</section><hr>`
    )
    .replace(
      "</head>",
      "<style>@page{margin:.55in}body{margin:0}button{display:none}.export-visual{page-break-inside:avoid;margin:24px 0}.export-visual svg{display:block;max-width:100%;height:auto}.table-wrap{overflow:visible}table{border-collapse:collapse;width:100%;font-size:9pt}caption{text-align:left;font-weight:bold;margin-bottom:5px}th,td{border:1px solid #b8b8b8;padding:4px;text-align:left}thead{background:#eeeaf3}</style></head>"
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
  pushSnapshot(`Before duplicating ${source.name}`);
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
  if (save()) {
    navigateTo("command");
    toast("Pursuit and working records duplicated");
  } else {
    render();
  }
}

function applySpreadsheetImport(nextWorkspace, details) {
  const previous = structuredClone(data);
  const backup = makeSnapshot(`Before importing ${details.label || details.target}`);
  const normalized = normalizeWorkspace(nextWorkspace, seed);
  const validation = validateWorkspace(normalized);
  if (!validation.valid) {
    throw new Error(validation.errors.slice(0, 8).join("\n"));
  }
  normalized.snapshots = [...(data.snapshots || []), backup].slice(-8);
  data = normalized;
  if (!save()) {
    data = previous;
    throw new Error(
      "Browser storage is full. Export a backup, remove large attachments, and try again."
    );
  }
  let nextView =
    details.target === "pursuits"
      ? "portfolio"
      : details.target === "competitorScores"
        ? "competitors"
        : details.target;
  if (!["portfolio", "criteria", "evidence", "competitors", "actions"].includes(nextView)) {
    nextView = "command";
  }
  navigateTo(nextView);
}

async function handleRecordSubmit(form) {
  const previous = structuredClone(data);
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
        data = previous;
        alert("Attachment is too large. The public browser edition allows a maximum of 300 KB.");
        return false;
      }
      const attachmentType =
        ATTACHMENT_MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase()] || "";
      if (!attachmentType) {
        data = previous;
        alert("Choose a TXT, Markdown, CSV, JSON, PDF, DOC, or DOCX attachment.");
        return false;
      }
      record.attachmentName = file.name;
      record.attachmentType = attachmentType;
      record.attachmentData = String(await readDataUrl(file)).replace(
        /^data:[^;,]+/i,
        `data:${attachmentType}`
      );
      if (!safeAttachmentDataUrl(record.attachmentData)) {
        data = previous;
        alert("The selected attachment could not be encoded safely.");
        return false;
      }
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

  let persisted = false;
  let nextView = "";
  if (recordId) {
    persisted = Boolean(updateRecord(kind, recordId, record));
  } else {
    data[kind].push(record);
    if (kind === "pursuits") {
      data.active = record.id;
      nextView = "command";
    }
    persisted = save();
  }
  if (!persisted) {
    data = structuredClone(lastPersistedData);
    render();
    return false;
  }
  dirtyForm = false;
  document.querySelector("#modal").close();
  if (nextView) navigateTo(nextView);
  else render();
  toast(recordId ? "Changes saved" : "Record added");
  return true;
}

function buildAndSaveReport(formData) {
  const session = Object.fromEntries(formData);
  const report = buildCompetitiveReport(data, data.active, session);
  report.id = uid();
  report.pursuitId = data.active;
  report.status = session.reportStatus || "Draft";
  try {
    report.visualSnapshot = buildRunVisualizationSnapshot(
      data,
      data.active,
      report.scoreSummary
    );
  } catch (error) {
    toast(
      `The report was not generated because its visual snapshot could not be stored: ${
        error?.message || "Unknown snapshot error."
      }`,
      "error"
    );
    return false;
  }
  data.runs.push(report);
  if (save()) {
    navigateTo("outputs");
    toast("Competitive-analysis report generated");
  } else {
    render();
  }
}

function deleteRecord(kind, id) {
  const record = data[kind]?.find(item => item.id === id);
  if (!record) return;
  if (!confirm(`Delete this ${kind.replace(/s$/, "")}? A recovery snapshot will be created first.`)) {
    return;
  }
  pushSnapshot(`Before deleting ${kind} record`);
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
  if (save()) {
    render();
    toast("Record deleted; recovery snapshot retained");
  } else {
    render();
  }
}

function openRecord(kind, id = "") {
  const record = id ? data[kind].find(item => item.id === id) : {};
  modal(`${id ? "Edit" : "Add"} ${singular(kind)}`, recordForm(kind, record || {}));
}

document.addEventListener("click", async event => {
  const viewControl = event.target.closest("[data-view]");
  if (viewControl) {
    event.preventDefault();
    navigateTo(viewControl.dataset.view);
    return;
  }
  const actionControl = event.target.closest("[data-action]");
  if (actionControl?.dataset.action === "toggle-nav") {
    setNavOpen(!navOpen);
    return;
  }
  if (actionControl?.dataset.action === "close-nav") {
    setNavOpen(false);
    return;
  }
  if (actionControl?.dataset.action === "toggle-workspace-menu") {
    setWorkspaceMenuOpen(!workspaceMenuOpen);
    return;
  }
  const button = event.target.closest("button");
  if (!button) {
    if (workspaceMenuOpen && !event.target.closest(".workspace-menu-shell")) {
      setWorkspaceMenuOpen(false);
    }
    return;
  }
  if (button.dataset.listPage) {
    const state = listState[button.dataset.listPage];
    if (state) {
      state.page = Math.max(1, Number(button.dataset.page || 1));
      render();
      requestAnimationFrame(() =>
        document.querySelector(`[data-list-filter="${button.dataset.listPage}"]`)?.focus()
      );
    }
    return;
  }
  if (button.dataset.clearList) {
    const state = listState[button.dataset.clearList];
    if (state) {
      state.query = "";
      state.page = 1;
      render();
      requestAnimationFrame(() =>
        document.querySelector(`[data-list-filter="${button.dataset.clearList}"]`)?.focus()
      );
    }
    return;
  }
  if (button.dataset.open) {
    data.active = button.dataset.open;
    if (save()) navigateTo("command");
    else render();
    return;
  }
  if (button.dataset.duplicate) duplicatePursuit(button.dataset.duplicate);
  if (button.dataset.archive) {
    const item = data.pursuits.find(record => record.id === button.dataset.archive);
    if (item && confirm(`Archive ${item.name}?`)) {
      pushSnapshot(`Before archiving ${item.name}`);
      item.archived = true;
      if (data.active === item.id) {
        data.active = data.pursuits.find(record => !record.archived)?.id || item.id;
      }
      if (save()) {
        render();
        toast("Pursuit archived");
      } else {
        render();
      }
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
  if (button.dataset.action === "clear-portfolio") {
    query = "";
    showArchived = false;
    render();
  }
  if (button.dataset.action === "snapshot") {
    if (createSnapshot("Manual recovery point")) {
      if (view === "recovery") render();
      toast("Recovery snapshot created");
    }
  }
  if (button.dataset.action === "reset-demo") {
    if (confirm("Replace the current workspace with the synthetic demonstration?")) {
      const backup = makeSnapshot("Before resetting demo");
      data = normalizeWorkspace(seed, seed);
      data.snapshots.push(backup);
      if (save()) {
        navigateTo("portfolio");
        toast("Synthetic demo restored");
      } else {
        render();
      }
    }
  }
  if (button.dataset.action === "export") {
    setWorkspaceMenuOpen(false);
    download(
      `black-hat-agent-workspace-${localDate()}.json`,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8"
    );
  }
  if (button.dataset.action === "import") {
    setWorkspaceMenuOpen(false);
    document.querySelector("#importFile").click();
  }
  if (button.dataset.action === "tabular-import") {
    setWorkspaceMenuOpen(false);
    openLocalImportWizard({
      trigger: button,
      getWorkspace: () => data,
      activePursuit: pursuit(),
      idFactory: uid,
      validator: validateWorkspace,
      onApply: applySpreadsheetImport,
      onSuccess: details =>
        toast(
          `Import complete: ${details.summary.created} created, ${details.summary.updated} updated, ${details.summary.skipped} skipped`
        )
    });
  }
  if (button.dataset.action === "import-template") downloadImportTemplate();
  if ("close" in button.dataset) {
    if (confirmDiscardChanges()) {
      dirtyForm = false;
      document.querySelector("#modal").close();
    }
    return;
  }
  if (button.dataset.usePlaybook) {
    pursuit().playbook = data.playbooks.find(item => item.id === button.dataset.usePlaybook).name;
    if (save()) {
      render();
      toast("Playbook assigned");
    } else {
      render();
    }
  }
  if (button.dataset.clonePlaybook) {
    const source = data.playbooks.find(item => item.id === button.dataset.clonePlaybook);
    data.playbooks.push({
      ...structuredClone(source),
      id: uid(),
      name: `${source.name} — Custom`,
      builtIn: false
    });
    if (save()) {
      render();
      toast("Custom playbook created");
    } else {
      render();
    }
  }
  if (button.dataset.run) {
    navigateTo("outputs");
    requestAnimationFrame(() =>
      document.querySelector(`[data-edit-report="${CSS.escape(button.dataset.run)}"]`)?.focus()
    );
  }
  if (button.dataset.copy) {
    navigator.clipboard
      .writeText(data.runs.find(item => item.id === button.dataset.copy).output)
      .then(() => toast("Report copied"))
      .catch(() => toast("The report could not be copied. Use the Markdown export instead.", "error"));
  }
  if (button.dataset.download) {
    exportMarkdown(data.runs.find(item => item.id === button.dataset.download));
  }
  if (button.dataset.visuals) {
    exportVisuals(data.runs.find(item => item.id === button.dataset.visuals));
  }
  if (button.dataset.word) await exportWord(data.runs.find(item => item.id === button.dataset.word));
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
    if (!item || !safeAttachmentUrl(item.attachmentData)) {
      toast("This attachment is not a supported local data file.", "error");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = item.attachmentData;
    anchor.download = item.attachmentName;
    anchor.click();
  }
});

document.addEventListener("input", event => {
  if (event.target.dataset.listFilter) {
    const collection = event.target.dataset.listFilter;
    const state = listState[collection];
    if (!state) return;
    state.query = event.target.value;
    state.page = 1;
    render();
    const input = document.querySelector(`[data-list-filter="${collection}"]`);
    input?.focus();
    input?.setSelectionRange(state.query.length, state.query.length);
    return;
  }
  if (event.target.id === "search") {
    query = event.target.value;
    render();
    const search = document.querySelector("#search");
    search?.focus();
    search?.setSelectionRange(query.length, query.length);
    return;
  }
  if (event.target.dataset.filterOptions) {
    const value = event.target.value.trim().toLowerCase();
    event.target
      .closest(".check-picker")
      ?.querySelectorAll("[data-option-text]")
      .forEach(option => {
        option.hidden = value && !option.dataset.optionText.includes(value);
      });
    return;
  }
  if (event.target.closest("form[data-form]")) markDirty();
});

document.addEventListener("change", event => {
  if (event.target.dataset.listSize) {
    const state = listState[event.target.dataset.listSize];
    if (state) {
      state.pageSize = PAGE_SIZE_OPTIONS.includes(Number(event.target.value))
        ? Number(event.target.value)
        : 25;
      state.page = 1;
      render();
    }
    return;
  }
  if (event.target.dataset.listSort) {
    const state = listState[event.target.dataset.listSort];
    if (state) {
      state.sort = event.target.value;
      state.page = 1;
      render();
    }
    return;
  }
  if (event.target.id === "showArchived") {
    showArchived = event.target.checked;
    render();
  }
  if (event.target.id === "importFile" && event.target.files[0]) {
    importWorkspaceFile(event.target.files[0]);
  }
  if (event.target.closest("form[data-form]") && !event.target.dataset.filterOptions) markDirty();
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.form;
  if (type === "opportunity") {
    if (updateRecord("pursuits", data.active, Object.fromEntries(new FormData(form)))) {
      dirtyForm = false;
      render();
      toast("Opportunity saved");
    } else {
      render();
    }
  }
  if (type === "run") buildAndSaveReport(new FormData(form));
  if (type === "record") await handleRecordSubmit(form);
  if (type === "report-edit") {
    const formData = new FormData(form);
    if (
      saveReportVersion(
        form.dataset.runId,
        formData.get("output"),
        formData.get("status"),
        formData.get("reviewer"),
        formData.get("approvalNote")
      )
    ) {
      dirtyForm = false;
      document.querySelector("#modal").close();
      render();
      toast("New report version saved");
    } else {
      render();
    }
  }
});

window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY && event.newValue) {
    toast("This workspace changed in another tab. Reload before making more edits.");
  }
});

window.addEventListener("beforeunload", event => {
  if (!dirtyForm) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("popstate", () => {
  const requestedView = location.hash.slice(1);
  if (!VIEW_LABELS[requestedView] || requestedView === view) return;
  if (!confirmDiscardChanges()) {
    history.pushState({ view }, "", `#${view}`);
    return;
  }
  dirtyForm = false;
  navOpen = false;
  workspaceMenuOpen = false;
  view = requestedView;
  render();
  requestAnimationFrame(() => document.querySelector("#content")?.focus());
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (navOpen) {
    event.preventDefault();
    setNavOpen(false);
  } else if (workspaceMenuOpen) {
    event.preventDefault();
    setWorkspaceMenuOpen(false);
    document.querySelector(".workspace-menu-toggle")?.focus();
  }
});

async function importWorkspaceFile(file) {
  if (file.size > MAX_IMPORT_BYTES) {
    alert("Workspace file is too large. The public edition accepts JSON files up to 10 MB.");
    return;
  }
  try {
    const candidate = JSON.parse(await file.text());
    const rawResult = validateWorkspaceImport(candidate);
    if (!rawResult.valid) throw new Error(rawResult.errors.slice(0, 8).join("\n"));
    const normalized = normalizeWorkspace(candidate, seed);
    const result = validateWorkspace(normalized);
    if (!result.valid) throw new Error(result.errors.slice(0, 8).join("\n"));
    const backup = makeSnapshot("Before importing workspace");
    normalized.snapshots = [...(normalized.snapshots || []), backup].slice(-8);
    data = normalized;
    if (save()) {
      navigateTo("portfolio");
      toast("Validated workspace imported");
    } else {
      render();
    }
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

function chartPanel(spec, { wide = false, tableOpen = false, idPrefix = "bha-chart" } = {}) {
  if (!spec?.type) return "";
  const svg = renderVisualizationSvg(spec, { idPrefix, theme: "light" }).replace(
    "<svg ",
    '<svg class="chart-svg" '
  );
  return `<section class="visual-card chart-card ${wide ? "wide" : ""}" aria-labelledby="${esc(
    `${idPrefix}-heading`
  )}">
    <div class="visual-heading chart-heading"><div><h2 id="${esc(`${idPrefix}-heading`)}">${esc(
      spec.title || "Analysis visualization"
    )}</h2><p>${esc(spec.description || "")}</p></div></div>
    <div class="chart-shell chart-canvas">${svg}</div>
    <details class="chart-data" ${tableOpen ? "open" : ""}><summary>View accessible data table</summary>${visualDataTable(
      spec
    )}</details>
  </section>`;
}

function visualDataTable(spec) {
  const unknown = value =>
    value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
      ? "Unknown"
      : String(value);
  const table = (caption, headers, rows, total = rows.length, totalLabel = "records") =>
    `${
      total > rows.length
        ? `<p class="form-help">This table shows ${rows.length} of ${total} ${totalLabel} in this analysis; omitted values are not included in this compact view.</p>`
        : ""
    }<div class="table-wrap"><table><caption>${esc(caption)}</caption><thead><tr>${headers
      .map(header => `<th scope="col">${esc(header)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map(
        row =>
          `<tr>${row
            .map(
              (cell, index) =>
                `<${index === 0 ? 'th scope="row"' : "td"}>${esc(cell)}</${
                  index === 0 ? "th" : "td"
                }>`
            )
            .join("")}</tr>`
      )
      .join("")}</tbody></table></div>`;

  if (spec.type === "ranked-cpi") {
    const entities = [...(spec.entities || [])]
      .sort((a, b) => {
        const left = Number.isFinite(Number(a.cpi)) ? Number(a.cpi) : -1;
        const right = Number.isFinite(Number(b.cpi)) ? Number(b.cpi) : -1;
        return right - left;
      });
    return table(
      spec.title,
      ["Entity", "CPI / 100", "Coverage %", "Confidence %"],
      entities.slice(0, 14).map(item => [
        item.name || "Unnamed entity",
        unknown(item.cpi),
        unknown(item.coverage),
        unknown(item.confidence)
      ]),
      Math.max(entities.length, Number(spec.totalEntities) || 0),
      "ranked entities"
    );
  }
  if (spec.type === "score-heatmap") {
    const columns = (spec.columns || []).slice(0, 7);
    const rows = spec.rows || [];
    const totalColumns = Math.max(columns.length, Number(spec.totalColumns) || 0);
    const columnNotice =
      totalColumns > columns.length
        ? `<p class="form-help">This table shows ${columns.length} of ${totalColumns} scored entities in this analysis; omitted entities are not included in this compact view.</p>`
        : "";
    return `${columnNotice}${table(
      spec.title,
      ["Criterion", "Weight", ...columns.map(item => item.name)],
      rows.slice(0, 14).map(row => [
        row.name,
        unknown(row.weight),
        ...columns.map(column => unknown(row.values?.[column.id]))
      ]),
      Math.max(rows.length, Number(spec.totalRows) || 0),
      "criteria"
    )}`;
  }
  if (spec.type === "criterion-deltas") {
    const rows = [...(spec.rows || [])].sort((a, b) => {
      const left =
        Number.isFinite(Number(a.delta)) && Number.isFinite(Number(a.weight))
          ? Math.abs(Number(a.delta)) * Number(a.weight)
          : -1;
      const right =
        Number.isFinite(Number(b.delta)) && Number.isFinite(Number(b.weight))
          ? Math.abs(Number(b.delta)) * Number(b.weight)
          : -1;
      return right - left;
    });
    return table(
      spec.title,
      ["Criterion", "Weight", "Our effective score", "Rival effective score", "Difference"],
      rows.slice(0, 14).map(row => [
        row.name,
        unknown(row.weight),
        unknown(row.ourEffective),
        unknown(row.rivalEffective),
        row.delta === null || row.delta === undefined
          ? "Unknown"
          : `${Number(row.delta) > 0 ? "+" : ""}${row.delta}`
      ]),
      Math.max(rows.length, Number(spec.totalRows) || 0),
      "criteria"
    );
  }
  if (spec.type === "scenario-range") {
    const estimate = spec.estimate;
    return estimate
      ? table(spec.title, ["Measure", "Percent"], [
          ["Prior estimate", unknown(estimate.prior)],
          ["Scenario estimate", unknown(estimate.value)],
          ["Uncertainty low", unknown(estimate.low)],
          ["Uncertainty high", unknown(estimate.high)],
          ["Trust", unknown(estimate.trust)]
        ])
      : `<p class="muted">No scenario estimate is available.</p>`;
  }
  if (spec.type === "evidence-grid") {
    const rows = spec.rows || [];
    return table(
      spec.title,
      [
        "Criterion",
        "Weight",
        "Score",
        "Classification",
        "Linked",
        "Support",
        "Challenge",
        "Conflict"
      ],
      rows.slice(0, 14).map(row => [
        row.name,
        unknown(row.weight),
        unknown(row.score),
        row.classification || "Missing",
        unknown(row.linked),
        unknown(row.support),
        unknown(row.challenge),
        row.conflict ? "Yes" : "No"
      ]),
      Math.max(rows.length, Number(spec.totalRows) || 0),
      "criteria"
    );
  }
  if (spec.type === "evidence-relationships") {
    const visibleEvidence = (spec.evidence || []).slice(0, 9);
    const visibleCriteria = (spec.criteria || []).slice(0, 9);
    const evidence = new Map(visibleEvidence.map(item => [item.id, item.label]));
    const criteria = new Map(visibleCriteria.map(item => [item.id, item.label]));
    const links = (spec.links || []).filter(
      link => evidence.has(link.evidenceId) && criteria.has(link.criterionId)
    );
    const totalEvidence = Math.max(
      visibleEvidence.length,
      Number(spec.totalEvidence) || 0
    );
    const totalCriteria = Math.max(
      visibleCriteria.length,
      Number(spec.totalCriteria) || 0
    );
    const totalLinks = Math.max(links.length, Number(spec.totalLinks) || 0);
    const scopeNotice = `<p class="form-help">Relationship scope: ${visibleEvidence.length} of ${totalEvidence} evidence records, ${visibleCriteria.length} of ${totalCriteria} criteria, and ${links.length} of ${totalLinks} relationships are shown in this compact view.</p>`;
    return `${scopeNotice}${table(
      spec.title,
      ["Evidence", "Criterion", "Stance"],
      links.map(link => [
        evidence.get(link.evidenceId) || "Unknown evidence",
        criteria.get(link.criterionId) || "Unknown criterion",
        link.stance || "Neutral"
      ])
    )}`;
  }
  if (spec.type === "run-history") {
    const points = spec.points || [];
    return table(
      spec.title,
      ["Run", "Our CPI", "Rival CPI", "Scenario", "Coverage", "Confidence", "Margin"],
      points.slice(-12).map(point => [
        point.label || point.createdAt || "Run",
        unknown(point.ourCpi),
        unknown(point.rivalCpi),
        unknown(point.scenario),
        unknown(point.coverage),
        unknown(point.confidence),
        unknown(point.margin)
      ]),
      points.length
    );
  }
  if (spec.type === "action-summary") {
    const counts = new Map();
    for (const action of spec.actions || []) {
      const key = `${action.priority || "Other"}\u0000${action.status || "Other"}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const item of spec.counts || []) {
      const key = `${item.priority || "Other"}\u0000${item.status || "Other"}`;
      const count = Math.max(0, Math.trunc(Number(item.count) || 0));
      counts.set(key, (counts.get(key) || 0) + count);
    }
    const rows = [...counts.entries()].map(([key, count]) => {
      const [priority, status] = key.split("\u0000");
      return [priority, status, String(count)];
    });
    const countedTotal = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const totalActions = Math.max(countedTotal, Number(spec.totalActions) || 0);
    const totalNotice = `<p class="form-help">${totalActions} total actions are included in this analysis; the table shows exact counts by priority and status.</p>`;
    return `${totalNotice}${table(
      spec.title,
      ["Priority", "Status", "Count"],
      rows
    )}`;
  }
  return `<p class="muted">A data table is not available for this visualization.</p>`;
}

function reportVisualSpecs(run) {
  const visuals = run?.visualSnapshot?.visuals;
  return visuals && typeof visuals === "object" && !Array.isArray(visuals) ? visuals : null;
}

function reportVisualMarkup(run, prefix = "report") {
  const specs = reportVisualSpecs(run);
  if (!specs) {
    return `<p class="note warn legacy-visual-notice" role="note">${esc(
      LEGACY_VISUAL_NOTICE
    )}</p>`;
  }
  const order = [
    "rankedCpi",
    "scenarioRange",
    "criterionDeltas",
    "scoreHeatmap",
    "evidenceGrid",
    "evidenceRelationships",
    "actionSummary"
  ];
  return `<div class="visualization-grid visual-grid report-visuals">${order
    .filter(name => specs?.[name])
    .map((name, index) =>
      chartPanel(specs[name], {
        wide: ["scoreHeatmap", "evidenceRelationships"].includes(name),
        idPrefix: `${prefix}-${name}-${index}`
      })
    )
    .join("")}</div>`;
}

function formatCpi(value, unavailable = "Unknown", includeScale = true) {
  if (value === null || value === undefined || value === "") return unavailable;
  const number = Number(value);
  if (!Number.isFinite(number)) return unavailable;
  return `${number}${includeScale ? "/100" : ""}`;
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

function rowActions(kind, id, label = singular(kind) || "record") {
  const target = String(label || singular(kind) || "record");
  return `<div class="row"><button class="btn small" data-edit="${esc(
    `${kind}:${id}`
  )}" aria-label="Edit ${esc(target)}">Edit</button><button class="btn small danger" data-delete="${esc(
    `${kind}:${id}`
  )}" aria-label="Delete ${esc(target)}">Delete</button></div>`;
}

function textField(name, label, value = "", required = false, type = "text", extra = "") {
  return `<div class="field"><label for="field-${esc(name)}">${esc(label)}${
    required
      ? ' <span class="required-mark" aria-hidden="true">*</span><span class="sr-only"> required</span>'
      : ""
  }</label><input id="field-${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(
    value
  )}" ${required ? 'required aria-required="true"' : ""} ${extra}></div>`;
}

function textareaField(name, label, value = "") {
  return `<div class="field full"><label for="field-${esc(name)}">${esc(
    label
  )}</label><textarea id="field-${esc(name)}" name="${esc(name)}">${esc(value)}</textarea></div>`;
}

function selectField(name, label, options, selected) {
  return `<div class="field"><label for="field-${esc(name)}">${esc(
    label
  )}</label><select id="field-${esc(name)}" name="${esc(name)}">${options
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
  return `<fieldset class="field full check-picker"><legend>Supporting evidence</legend>
    <input type="search" data-filter-options="evidenceIds" aria-label="Filter supporting evidence" placeholder="Filter evidence">
    <div class="check-options" id="field-evidenceIds">${options
    .map(
      item =>
        `<label data-option-text="${esc(`${item.citation} ${item.title}`.toLowerCase())}"><input type="checkbox" name="evidenceIds" value="${esc(
          item.id
        )}" ${selected.includes(item.id) ? "checked" : ""}><span>[${esc(item.citation)}] ${esc(
          item.title
        )}</span></label>`
    )
    .join("") || `<p class="muted">No evidence records are available for this pursuit.</p>`}</div></fieldset>`;
}

function multiCriteriaField(selected) {
  const options = scoped("criteria");
  return `<fieldset class="field full check-picker"><legend>Linked criteria</legend>
    <input type="search" data-filter-options="criterionIds" aria-label="Filter linked criteria" placeholder="Filter criteria">
    <div class="check-options" id="field-criterionIds">${options
    .map(
      item =>
        `<label data-option-text="${esc(item.name.toLowerCase())}"><input type="checkbox" name="criterionIds" value="${esc(
          item.id
        )}" ${selected.includes(item.id) ? "checked" : ""}><span>${esc(item.name)}</span></label>`
    )
    .join("") || `<p class="muted">No evaluation criteria are available for this pursuit.</p>`}</div></fieldset>`;
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
  const numeric = Number(value);
  return value === "" || value === undefined || !Number.isFinite(numeric) || numeric < 1 || numeric > 5
    ? `<span class="muted">Unknown</span>`
    : `${esc(numeric)}/5`;
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

function safeAttachmentUrl(value) {
  return Boolean(value) && safeAttachmentDataUrl(value);
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
  exportVisuals,
  exportWord,
  exportPDF
};

history.replaceState({ view }, "", `#${view}`);
render();
if (startupWarning) toast(startupWarning, "error");
