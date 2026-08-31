import {
  WORKSPACE_SCHEMA,
  STORAGE_KEY,
  STAGES,
  ELEMENT_TYPES,
  INTERFACE_TYPES,
  VIEW_TEMPLATES,
  escapeHtml,
  makeId,
  createWorkspace,
  addBlankSolution,
  createArchitectureView,
  validateWorkspace,
  validateWorkspaceImport,
  scoped,
  assessmentResult,
  collectObligations,
  buildReadiness,
  autoLayoutView,
  buildDiagramSvg,
  buildDecisionPackageMarkdown,
  buildDecisionPackageHtml,
  pushSnapshot,
  restoreSnapshot,
  buildAiPayload,
  validateAiResponse
} from "./engine.js";

const ROUTES = new Set(["dashboard", "discover", "shape", "assess", "architect", "prove", "propose", "transition", "decision-package"]);
const SUPABASE_URL = "https://hqqwlkmggwgaoiyzgrhy.supabase.co";
const SUPABASE_KEY = "sb_publishable_HmSmGVio0b9HQCBocjeuYA_eleacS3u";
const app = document.querySelector("#app");
let initialWorkspaceNeedsSave = false;
let workspace = loadWorkspace();
let route = readRoute();
let selectedCandidateId = "";
let selectedViewId = "";
let selectedElementId = "";
let dirty = false;
let saveTimer = 0;
let supabaseClient = null;
let aiPreview = null;
let aiResponse = null;
let drag = null;
let modalReturnFocus = null;

function h(value) { return escapeHtml(value); }
function activeSolution() { return workspace.solutions.find(item => item.id === workspace.activeSolutionId) || workspace.solutions[0]; }
function readRoute() { const value = location.hash.replace(/^#\/?/, ""); return ROUTES.has(value) ? value : "dashboard"; }
function stageRoute(stage) { return stage.toLowerCase(); }
function option(value, label, current) { return `<option value="${h(value)}" ${value === current ? "selected" : ""}>${h(label)}</option>`; }
function record(collection, id) { return workspace[collection]?.find(item => item.id === id); }

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      initialWorkspaceNeedsSave = true;
      return createWorkspace();
    }
    const candidate = JSON.parse(raw);
    const result = validateWorkspace(candidate);
    if (!result.valid) throw new Error(result.errors[0]);
    return candidate;
  } catch (error) {
    console.warn("Could not load the saved Solution Architect workspace.", error);
    return createWorkspace();
  }
}

function setSaveState(text, tone = "") {
  const node = document.querySelector("#save-state");
  if (node) { node.textContent = text; node.dataset.tone = tone; }
}

function saveNow() {
  clearTimeout(saveTimer);
  const result = validateWorkspace(workspace);
  if (!result.valid) {
    setSaveState(`Save blocked: ${result.errors[0]}`, "error");
    dirty = true;
    return false;
  }
  try {
    const savedAt = new Date().toISOString();
    const persisted = { ...workspace, savedAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    workspace.savedAt = savedAt;
    dirty = false;
    setSaveState("Saved locally", "ok");
    return true;
  } catch (error) {
    dirty = true;
    setSaveState("Save failed — export a backup", "error");
    toast("Browser storage is unavailable or full. Export a JSON backup now.", "error");
    return false;
  }
}

function scheduleSave() {
  dirty = true;
  setSaveState("Unsaved changes", "warn");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 450);
}

function commit(mutator, { renderAfter = true, snapshot = "" } = {}) {
  let next = structuredClone(workspace);
  if (snapshot) next = pushSnapshot(next, snapshot);
  mutator(next);
  const solution = next.solutions.find(item => item.id === next.activeSolutionId);
  if (solution) solution.updatedAt = new Date().toISOString();
  const result = validateWorkspace(next);
  if (!result.valid) { toast(result.errors[0], "error"); return false; }
  workspace = next;
  scheduleSave();
  if (renderAfter) render();
  return true;
}

function download(name, content, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function slug(value) { return String(value || "solution").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "solution"; }
function toast(message, tone = "info") {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  const item = document.createElement("div");
  item.className = `toast ${tone}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 5_000);
}

function openModal(title, body, { wide = false } = {}) {
  const root = document.querySelector("#modal-root");
  if (!root.querySelector(".modal")) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${h(title)}</h2><button class="icon-button" type="button" data-close-modal aria-label="Close dialog">×</button></header><div class="modal-body">${body}</div></section></div>`;
  root.querySelector("[autofocus], input:not([type='hidden']), textarea, select, button:not([data-close-modal])")?.focus();
}

function closeModal() {
  const root = document.querySelector("#modal-root");
  if (root) root.innerHTML = "";
  aiPreview = null;
  aiResponse = null;
  const returnTarget = modalReturnFocus;
  modalReturnFocus = null;
  if (returnTarget?.isConnected) returnTarget.focus();
}

function trapModalFocus(event) {
  if (event.key !== "Tab") return;
  const modal = document.querySelector("#modal-root .modal");
  if (!modal) return;
  const focusable = [...modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter(node => node instanceof HTMLElement && node.getClientRects().length > 0);
  if (!focusable.length) { event.preventDefault(); modal.focus(); return; }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function field(label, value, attributes, { multiline = false, hint = "" } = {}) {
  const control = multiline
    ? `<textarea ${attributes} rows="4">${h(value)}</textarea>`
    : `<input ${attributes} value="${h(value)}">`;
  return `<label class="field"><span>${h(label)}</span>${control}${hint ? `<small>${h(hint)}</small>` : ""}</label>`;
}

function selectField(label, attributes, options, hint = "") {
  return `<label class="field"><span>${h(label)}</span><select ${attributes}>${options}</select>${hint ? `<small>${h(hint)}</small>` : ""}</label>`;
}

function emptyState(title, copy, action = "") {
  return `<div class="empty-state"><strong>${h(title)}</strong><p>${h(copy)}</p>${action}</div>`;
}

function render() {
  const solution = activeSolution();
  if (!solution) return;
  const navItems = [
    ["dashboard", "00", "Command view"],
    ...STAGES.map((stage, index) => [stageRoute(stage), `0${index + 1}`, stage]),
    ["decision-package", "08", "Decision package"]
  ];
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar" aria-label="Solution workspace navigation">
        <div class="brand"><span class="brand-mark">SA Workbench</span><h1>Solution Architect</h1></div>
        <label class="solution-switcher"><small>Active solution</small><select id="solution-select" aria-label="Active solution">${workspace.solutions.map(item => option(item.id, item.name, solution.id)).join("")}</select></label>
        <nav class="stage-nav" aria-label="Lifecycle stages">${navItems.map(([value, number, label]) => `<a class="stage-link ${route === value ? "active" : ""}" href="#${value}" data-route="${value}"><span class="number">${number}</span><span class="label">${h(label)}</span>${value === "dashboard" ? `<span class="count">${collectObligations(workspace, solution.id).length}</span>` : ""}</a>`).join("")}</nav>
        <div class="sidebar-actions"><button class="text-button" type="button" data-action="open-guide">Guide</button><button class="text-button" type="button" data-action="open-recovery">Recovery</button></div>
        <p class="sidebar-foot">Local workspace · No cloud project storage</p>
      </aside>
      <main class="workbench" id="workspace" tabindex="-1">
        <header class="topbar">
          <button class="mobile-menu" type="button" data-action="toggle-nav" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">☰</button>
          <div class="title-block"><h2>${h(routeTitle(route))}</h2><p>${h(solution.name)} · ${h(solution.stage)}</p></div>
          <span id="save-state" class="save-state" data-tone="${dirty ? "warn" : "ok"}">${dirty ? "Unsaved changes" : "Saved locally"}</span>
          <div class="top-actions"><button class="button secondary" type="button" data-action="open-ai">AI assist</button><button class="button primary" type="button" data-action="new-solution">＋ New solution</button><button class="icon-button" type="button" data-action="open-tools" aria-label="Workspace tools">•••</button></div>
        </header>
        <div class="data-boundary" role="note"><strong>Data boundary</strong><span>Approved unclassified, non-CUI information only. Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted content unless separately authorized. Browser storage is not an authorization boundary. <a href="https://www.acquisition.gov/dfars/204.7302-policy." target="_blank" rel="noopener noreferrer">DFARS safeguarding policy context</a>.</span></div>
        <div class="content">${renderRoute(solution)}</div>
      </main>
    </div>
    <div id="modal-root"></div><div id="toast-region" class="toast-region" aria-live="polite"></div><input id="workspace-import" type="file" accept="application/json,.json" hidden>`;
  bindDiagramInteractions();
}

function routeTitle(value) {
  return ({ dashboard: "Command view", discover: "Discover the mission", shape: "Shape the need", assess: "Technology Assessment", architect: "Architect the solution", prove: "Prove and govern", propose: "Propose the approach", transition: "Transition to delivery", "decision-package": "Decision package" })[value] || "Solution Architect Workbench";
}

function renderRoute(solution) {
  return ({
    dashboard: renderDashboard,
    discover: renderDiscover,
    shape: renderShape,
    assess: renderAssess,
    architect: renderArchitect,
    prove: renderProve,
    propose: renderPropose,
    transition: renderTransition,
    "decision-package": renderDecisionPackage
  })[route](solution);
}

function renderStageRail(current) {
  return `<div class="stage-rail" aria-label="Lifecycle progress">${STAGES.map((stage, index) => `<a href="#${stageRoute(stage)}" class="stage-chip ${stage === current ? "current" : ""}"><span>0${index + 1}</span><strong>${h(stage)}</strong></a>`).join("")}</div>`;
}

function renderDashboard(solution) {
  const readiness = buildReadiness(workspace, solution.id);
  const obligations = collectObligations(workspace, solution.id);
  const candidates = scoped(workspace, "candidates", solution.id);
  const winThemes = scoped(workspace, "winThemes", solution.id).filter(item => item.status !== "Retired");
  const views = scoped(workspace, "architectureViews", solution.id);
  const risks = scoped(workspace, "risks", solution.id).filter(item => item.status !== "Closed");
  return `${renderStageRail(solution.stage)}<div class="dashboard-grid"><div>
    <section class="panel" aria-labelledby="readiness-title"><div class="panel-head"><div><p class="section-kicker">Decision quality</p><h3 id="readiness-title">Decision readiness</h3><p>Deterministic coverage checks, not activity volume</p></div><span class="metric">${readiness.overall}%</span></div>
      <div class="readiness"><article><small>Traceability</small><strong>${readiness.traceability}%</strong><p>Source, acceptance, architecture</p></article><article><small>Evidence</small><strong>${readiness.evidence}%</strong><p>Assessed claims with support</p></article><article><small>Interfaces</small><strong>${readiness.interfaces}%</strong><p>Connected architecture elements</p></article><article><small>Transition</small><strong>${readiness.transition}%</strong><p>Owned, unblocked actions</p></article></div></section>
    <section class="panel obligations"><div class="panel-head"><div><p class="section-kicker">Unscheduled obligations</p><h3>Needs architect attention</h3><p>Gaps that can weaken the decision or delivery</p></div><span class="metric">${obligations.length}</span></div>
      ${obligations.length ? `<ul class="obligation-list">${obligations.slice(0, 12).map(item => `<li class="obligation"><span class="severity ${item.severity}"></span><div><strong>${h(item.message)}</strong><span>${h(item.stage)} · ${h(item.kind.replaceAll("-", " "))}</span></div><a href="#${stageRoute(item.stage)}">Resolve →</a></li>`).join("")}</ul>` : emptyState("No deterministic gaps detected", "Use a formal review before treating the solution as complete.")}</section>
  </div><aside class="panel mission-card"><p class="eyebrow">${h(solution.classification)}</p><h3>${h(solution.name)}</h3><p>${h(solution.description || solution.mission.problem || "Define the mission problem and decision this solution must support.")}</p><div class="tags"><span class="tag">${h(solution.domain)}</span><span class="tag">${h(solution.stage)}</span><span class="tag">${h(solution.status)}</span></div><dl class="mini-list"><div><dt>Decision</dt><dd>${h(solution.decision || "Not defined")}</dd></div><div><dt>Candidates</dt><dd>${candidates.length}</dd></div><div><dt>Win themes</dt><dd>${winThemes.length}</dd></div><div><dt>Open risks</dt><dd>${risks.length}</dd></div><div><dt>Architecture views</dt><dd>${views.length}</dd></div></dl><button class="button block" type="button" data-route-button="discover">Open solution brief</button></aside></div>`;
}

function renderDiscover(solution) {
  const stakeholders = scoped(workspace, "stakeholders", solution.id);
  const hotButtons = scoped(workspace, "hotButtons", solution.id);
  const outcomes = scoped(workspace, "outcomes", solution.id);
  const measures = scoped(workspace, "measures", solution.id);
  return `${renderStageRail("Discover")}<div class="page-grid"><section class="panel form-panel"><div class="panel-head"><div><p class="section-kicker">Mission framing</p><h3>Define the decision and operational problem</h3><p>Start with mission effect and constraints before selecting technology.</p></div></div><div class="form-grid">
    ${field("Solution name", solution.name, `data-solution-field="name" maxlength="180"`)}
    ${field("Customer / mission partner", solution.customer, `data-solution-field="customer" maxlength="180"`)}
    ${selectField("Lifecycle stage", `data-solution-field="stage"`, STAGES.map(item => option(item, item, solution.stage)).join(""))}
    ${field("Domain", solution.domain, `data-solution-field="domain" maxlength="180"`)}
    <div class="span-2">${field("Decision to support", solution.decision, `data-solution-field="decision" maxlength="1200"`, { multiline: true, hint: "Write the specific choice, approval, or commitment this package must support." })}</div>
    <div class="span-2">${field("Mission problem", solution.mission.problem, `data-solution-nested="mission.problem" maxlength="5000"`, { multiline: true })}</div>
    <div class="span-2">${field("Operational context", solution.mission.operationalContext, `data-solution-nested="mission.operationalContext" maxlength="5000"`, { multiline: true })}</div>
    ${field("Current state", solution.mission.currentState, `data-solution-nested="mission.currentState" maxlength="4000"`, { multiline: true })}
    ${field("Desired state", solution.mission.desiredState, `data-solution-nested="mission.desiredState" maxlength="4000"`, { multiline: true })}
    <div class="span-2">${field("Constraints and non-negotiables", solution.mission.constraints, `data-solution-nested="mission.constraints" maxlength="5000"`, { multiline: true })}</div>
  </div></section>
  <aside class="stack"><section class="panel compact hot-button-panel"><div class="panel-head"><div><h3>Customer hot buttons</h3><p>Capture customer signals without silently turning them into requirements.</p></div><div class="panel-head-actions"><button class="small-button" type="button" data-action="ingest-hot-buttons">Ingest</button><button class="small-button" type="button" data-add="hotButtons">＋ Add</button></div></div>${hotButtons.length ? hotButtons.map(item => hotButtonCard(item)).join("") : emptyState("No customer hot buttons", "Paste or add priorities, concerns, sensitivities, and decision drivers with their source and confidence.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Stakeholders</h3><p>Mission users, authorities, delivery owners, and affected partners.</p></div><button class="small-button" type="button" data-add="stakeholders">＋ Add</button></div>${stakeholders.length ? stakeholders.map(item => recordCard("stakeholders", item, ["name", "role", "concern"])).join("") : emptyState("No stakeholders", "Add the people who define, build, authorize, operate, or sustain the solution.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Operational outcomes</h3><p>Observable mission effects with verification methods.</p></div><button class="small-button" type="button" data-add="outcomes">＋ Add</button></div>${outcomes.length ? outcomes.map(item => recordCard("outcomes", item, ["title", "verificationMethod"])).join("") : emptyState("No outcomes", "Define what changes for the mission and how it will be demonstrated.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Measures</h3><p>Decision-relevant measures of effectiveness and performance.</p></div><button class="small-button" type="button" data-add="measures">＋ Add</button></div>${measures.length ? measures.map(item => recordCard("measures", item, ["name", "target", "method"])).join("") : emptyState("No measures", "Add the measures that will distinguish an acceptable solution.")}</section></aside></div>`;
}

function recordCard(collection, item, fields) {
  return `<article class="record-card" data-record-card="${h(item.id)}"><button class="delete-record" type="button" data-delete="${h(collection)}" data-id="${h(item.id)}" aria-label="Delete record">×</button>${fields.map((name, index) => `<label><span>${h(name.replace(/([A-Z])/g, " $1").replace(/^./, value => value.toUpperCase()))}</span>${index === fields.length - 1 && fields.length < 3 ? `<textarea rows="2" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(name)}">${h(item[name])}</textarea>` : `<input value="${h(item[name])}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(name)}">`}</label>`).join("")}</article>`;
}

function hotButtonCard(item) {
  return `<article class="record-card hot-button-card"><button class="delete-record" type="button" data-delete="hotButtons" data-id="${h(item.id)}" aria-label="Delete customer hot button">×</button><label class="hot-button-title"><span>Customer signal</span><input value="${h(item.title)}" maxlength="280" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="title"></label><label><span>Source</span><input value="${h(item.source)}" maxlength="300" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="source"></label><label><span>Confidence</span><select data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="confidence">${["Unverified", "Low", "Medium", "High"].map(value => option(value, value, item.confidence)).join("")}</select></label><label><span>Validation</span><select data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="status">${["Captured", "Validated", "Retired"].map(value => option(value, value, item.status)).join("")}</select></label><label class="hot-button-detail"><span>Why it matters / exact context</span><textarea rows="3" maxlength="2000" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="detail">${h(item.detail)}</textarea></label></article>`;
}

function renderShape(solution) {
  const requirements = scoped(workspace, "requirements", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  const hotButtons = scoped(workspace, "hotButtons", solution.id).filter(item => item.status !== "Retired");
  const elements = scoped(workspace, "elements", solution.id);
  return `${renderStageRail("Shape")}<div class="section-toolbar"><div><p class="section-kicker">Traceability</p><h3>Requirements and evidence</h3><p>Bind every requirement to its source, acceptance logic, and architecture realization.</p></div><div><button class="button secondary" type="button" data-add="evidence">＋ Evidence</button><button class="button primary" type="button" data-add="requirements">＋ Requirement</button></div></div>
  <section class="panel table-panel"><div class="table-scroll"><table><thead><tr><th>Requirement</th><th>Type / priority</th><th>Customer drivers</th><th>Source evidence</th><th>Acceptance method</th><th>Architecture trace</th><th></th></tr></thead><tbody>${requirements.map(item => `<tr><td><textarea rows="2" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="title">${h(item.title)}</textarea><small>${h(item.status)}</small></td><td><select data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="type">${["Functional", "Performance", "Interface", "Data", "Cyber", "Safety", "Resilience", "Physical", "Sustainment"].map(value => option(value, value, item.type)).join("")}</select><select data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="priority">${["Must", "Should", "Could"].map(value => option(value, value, item.priority)).join("")}</select></td><td><select multiple size="3" data-requirement-hot-buttons="${h(item.id)}">${hotButtons.map(driver => `<option value="${h(driver.id)}" ${item.linkedHotButtonIds?.includes(driver.id) ? "selected" : ""}>${h(driver.title)}</option>`).join("")}</select></td><td><select data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="sourceEvidenceId"><option value="">Untraced</option>${evidence.map(source => option(source.id, source.title, item.sourceEvidenceId)).join("")}</select></td><td><textarea rows="2" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="acceptanceMethod">${h(item.acceptanceMethod)}</textarea></td><td><select multiple size="3" data-requirement-elements="${h(item.id)}">${elements.map(element => `<option value="${h(element.id)}" ${item.linkedElementIds?.includes(element.id) ? "selected" : ""}>${h(element.name)}</option>`).join("")}</select></td><td><button class="icon-button" type="button" data-delete="requirements" data-id="${h(item.id)}" aria-label="Delete requirement">×</button></td></tr>`).join("")}</tbody></table></div>${!requirements.length ? emptyState("No requirements", "Add requirements only when they can be traced to a mission need or authoritative source.") : ""}</section>
  <section class="panel evidence-panel"><div class="panel-head"><div><h3>Evidence library</h3><p>References and notes only; v1 does not store binary attachments.</p></div></div><div class="card-grid">${evidence.map(item => `<article class="evidence-card"><button class="delete-record" type="button" data-delete="evidence" data-id="${h(item.id)}" aria-label="Delete evidence">×</button><input class="card-title-input" value="${h(item.title)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="title"><label><span>Source</span><input value="${h(item.source)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="source"></label><label><span>Reference URL</span><input type="url" value="${h(item.url)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="url"></label><label><span>Confidence</span><select data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="confidence">${["High", "Medium", "Low", "Conflicting"].map(value => option(value, value, item.confidence)).join("")}</select></label><label><span>Notes</span><textarea rows="3" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="notes">${h(item.notes)}</textarea></label></article>`).join("")}</div>${!evidence.length ? emptyState("No evidence", "Record authoritative sources, test observations, customer statements, and documented constraints.") : ""}</section>`;
}

function renderAssess(solution) {
  const candidates = scoped(workspace, "candidates", solution.id);
  const criteria = scoped(workspace, "criteria", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  if (!selectedCandidateId || !candidates.some(item => item.id === selectedCandidateId)) selectedCandidateId = candidates[0]?.id || "";
  const selected = candidates.find(item => item.id === selectedCandidateId);
  const results = candidates.map(item => ({ candidate: item, result: assessmentResult(workspace, solution.id, item.id) })).sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1));
  return `${renderStageRail("Assess")}<div class="section-toolbar"><div><p class="section-kicker">Technology Assessment</p><h3>Compare complete solution candidates</h3><p>Unknown remains unknown. Scores without rationale or evidence create visible obligations.</p></div><button class="button primary" type="button" data-add="candidates">＋ Candidate</button></div>
  <div class="assessment-layout"><section class="panel candidate-rank"><div class="panel-head"><div><h3>Candidate comparison</h3><p>Weighted score uses assessed criteria only; coverage shows what is still unknown.</p></div></div>${results.length ? results.map(({ candidate, result }, index) => `<button class="candidate-row ${candidate.id === selectedCandidateId ? "active" : ""}" type="button" data-candidate="${h(candidate.id)}"><span class="rank">${index + 1}</span><span><strong>${h(candidate.name)}</strong><small>${h(candidate.category)} · TRL ${h(candidate.trl ?? "—")} · IRL ${h(candidate.irl ?? "—")}</small></span><span class="score">${result.score === null ? "—" : result.score.toFixed(2)}<small>${Math.round(result.coverage * 100)}% covered</small></span></button>`).join("") : emptyState("No candidates", "Add hardware, software, tools, vendors, platforms, or integrated mission-package alternatives.")}</section>
  <section class="panel assessment-detail">${selected ? `<div class="panel-head"><div><p class="section-kicker">Selected candidate</p><h3>${h(selected.name)}</h3><p>${h(selected.description)}</p></div><button class="icon-button" type="button" data-delete="candidates" data-id="${h(selected.id)}" aria-label="Delete candidate">×</button></div><div class="candidate-meta"><label><span>Name</span><input value="${h(selected.name)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="name"></label><label><span>Category</span><input value="${h(selected.category)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="category"></label><label><span>Vendor / source</span><input value="${h(selected.vendor)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="vendor"></label><label><span>TRL</span><input type="number" min="1" max="9" value="${h(selected.trl ?? "")}" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="trl"></label><label><span>MRL</span><input type="number" min="1" max="10" value="${h(selected.mrl ?? "")}" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="mrl"></label><label><span>IRL</span><input type="number" min="1" max="9" value="${h(selected.irl ?? "")}" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="irl"></label></div>
  <div class="table-scroll"><table class="score-table"><thead><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>Rationale</th><th>Evidence</th></tr></thead><tbody>${criteria.map(criterion => { const score = selected.scores?.find(item => item.criterionId === criterion.id) || { value: null, rationale: "", evidenceIds: [] }; return `<tr><td><strong>${h(criterion.name)}</strong></td><td><input type="number" min="0" max="100" value="${h(criterion.weight)}" data-record-number="criteria" data-record-id="${h(criterion.id)}" data-record-field="weight" aria-label="${h(criterion.name)} weight"></td><td><select data-candidate-score="${h(selected.id)}" data-criterion="${h(criterion.id)}" data-score-field="value"><option value="">Unknown</option>${[0,1,2,3,4,5].map(value => option(String(value), `${value}`, score.value === null ? "" : String(score.value))).join("")}</select></td><td><textarea rows="2" data-candidate-score="${h(selected.id)}" data-criterion="${h(criterion.id)}" data-score-field="rationale">${h(score.rationale)}</textarea></td><td><select multiple size="2" data-score-evidence="${h(selected.id)}" data-criterion="${h(criterion.id)}">${evidence.map(item => `<option value="${h(item.id)}" ${score.evidenceIds?.includes(item.id) ? "selected" : ""}>${h(item.title)}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table></div>` : emptyState("Select or add a candidate", "Assess the whole candidate solution, including technical and business constraints.")}</section></div>`;
}

function renderArchitect(solution) {
  const views = scoped(workspace, "architectureViews", solution.id);
  if (!selectedViewId || !views.some(item => item.id === selectedViewId)) selectedViewId = views[0]?.id || "";
  const view = views.find(item => item.id === selectedViewId);
  const elements = view ? workspace.elements.filter(item => item.viewId === view.id) : [];
  const connections = view ? workspace.connections.filter(item => item.viewId === view.id) : [];
  if (selectedElementId && !elements.some(item => item.id === selectedElementId)) selectedElementId = "";
  const selected = elements.find(item => item.id === selectedElementId);
  return `${renderStageRail("Architect")}<div class="section-toolbar architect-toolbar"><div><p class="section-kicker">Fit-for-purpose architecture</p><h3>Model the complete capability and its exchanges</h3><p>These structured views support decisions; they do not claim automatic DoDAF conformance.</p></div><div><button class="button secondary" type="button" data-action="new-view">＋ View</button><button class="button secondary" type="button" data-action="add-element" ${view ? "" : "disabled"}>＋ Element</button><button class="button secondary" type="button" data-action="add-connection" ${elements.length > 1 ? "" : "disabled"}>＋ Exchange</button></div></div>
  <div class="view-tabs" role="tablist" aria-label="Architecture views">${views.map(item => `<button role="tab" aria-selected="${item.id === selectedViewId}" class="view-tab ${item.id === selectedViewId ? "active" : ""}" type="button" data-view="${h(item.id)}">${h(item.name)}</button>`).join("")}</div>
  ${view ? `<div class="diagram-layout"><section class="panel diagram-panel"><div class="diagram-tools"><label>View name <input value="${h(view.name)}" data-record-collection="architectureViews" data-record-id="${h(view.id)}" data-record-field="name"></label><span class="template-label">${h(VIEW_TEMPLATES.find(([value]) => value === view.template)?.[1] || view.template)}</span><button class="small-button" type="button" data-action="auto-layout">Auto-layout</button><button class="small-button" type="button" data-action="export-svg">SVG</button><button class="small-button" type="button" data-action="export-png">PNG</button><button class="icon-button" type="button" data-delete="architectureViews" data-id="${h(view.id)}" aria-label="Delete view">×</button></div><div class="diagram-canvas" id="diagram-canvas" aria-label="Editable architecture diagram">${buildDiagramSvg(workspace, view.id)}</div><p class="diagram-help">Drag elements to position them. Select an element and use arrow keys for 10-pixel movement; hold Shift for 1 pixel.</p></section>
    <aside class="panel inspector"><div class="panel-head"><div><h3>Inspector</h3><p>${selected ? "Edit the selected architecture element." : "Select an element in the view."}</p></div></div>${selected ? `<div class="inspector-form">${field("Name", selected.name, `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="name" maxlength="180"`)}${selectField("Element type", `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="type"`, ELEMENT_TYPES.map(value => option(value, value, selected.type)).join(""))}${field("Description", selected.description, `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="description" maxlength="2000"`, { multiline: true })}<button class="button danger block" type="button" data-delete="elements" data-id="${h(selected.id)}">Delete element</button></div>` : emptyState("Nothing selected", "Choose an element to edit its identity, type, and description.")}</aside></div>
    <details class="panel accessible-model"><summary>Accessible architecture data</summary><div class="table-scroll"><table><thead><tr><th>Element</th><th>Type</th><th>Description</th><th>Position</th></tr></thead><tbody>${elements.map(item => `<tr><td>${h(item.name)}</td><td>${h(item.type)}</td><td>${h(item.description)}</td><td>${item.x}, ${item.y}</td></tr>`).join("")}</tbody></table></div><div class="table-scroll"><table><thead><tr><th>Source</th><th>Exchange</th><th>Type</th><th>Target</th><th>Protocol / standard</th><th></th></tr></thead><tbody>${connections.map(item => `<tr><td>${h(elements.find(element => element.id === item.sourceElementId)?.name)}</td><td><input value="${h(item.label)}" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="label"></td><td><select data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="type">${INTERFACE_TYPES.map(value => option(value, value, item.type)).join("")}</select></td><td>${h(elements.find(element => element.id === item.targetElementId)?.name)}</td><td><input value="${h(item.protocol)}" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="protocol"></td><td><button class="icon-button" type="button" data-delete="connections" data-id="${h(item.id)}" aria-label="Delete exchange">×</button></td></tr>`).join("")}</tbody></table></div></details>` : emptyState("No architecture views", "Create a guided mission, interface, data-flow, or transition view.", `<button class="button primary" type="button" data-action="new-view">Create first view</button>`)}`;
}

function governanceSection(title, copy, collection, items, columns) {
  const control = (item, column) => {
    if (column.multipleOptions) {
      const selectedIds = Array.isArray(item[column.field]) ? item[column.field] : [];
      const empty = !column.multipleOptions.length;
      return `<select multiple size="3" aria-label="${h(`${title}: ${column.label}`)}" data-record-links-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-links-field="${h(column.field)}" ${empty ? "disabled" : ""}>${empty ? `<option>${h(column.emptyLabel || "No records available")}</option>` : column.multipleOptions.map(link => `<option value="${h(link.id)}" ${selectedIds.includes(link.id) ? "selected" : ""}>${h(link.name || link.title)}</option>`).join("")}</select>`;
    }
    if (column.options) return `<select data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">${column.options.map(value => option(value, value, item[column.field])).join("")}</select>`;
    if (column.multiline) return `<textarea rows="2" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">${h(item[column.field])}</textarea>`;
    return `<input ${column.type ? `type="${column.type}"` : ""} value="${h(item[column.field])}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">`;
  };
  return `<section class="panel governance-section"><div class="panel-head"><div><h3>${h(title)}</h3><p>${h(copy)}</p></div><button class="small-button" type="button" data-add="${h(collection)}">＋ Add</button></div><div class="table-scroll"><table><thead><tr>${columns.map(column => `<th>${h(column.label)}</th>`).join("")}<th></th></tr></thead><tbody>${items.map(item => `<tr>${columns.map(column => `<td>${control(item, column)}</td>`).join("")}<td><button class="icon-button" type="button" data-delete="${h(collection)}" data-id="${h(item.id)}" aria-label="Delete ${h(title)} record">×</button></td></tr>`).join("")}</tbody></table></div>${!items.length ? emptyState(`No ${title.toLowerCase()}`, `Add the first ${title.toLowerCase()} record.`) : ""}</section>`;
}

function renderProve(solution) {
  const trades = scoped(workspace, "trades", solution.id);
  const decisions = scoped(workspace, "decisions", solution.id);
  const risks = scoped(workspace, "risks", solution.id);
  const dependencies = scoped(workspace, "dependencies", solution.id);
  const reviews = scoped(workspace, "reviews", solution.id);
  const drafts = scoped(workspace, "aiDrafts", solution.id);
  const candidates = scoped(workspace, "candidates", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  return `${renderStageRail("Prove")}<div class="section-toolbar"><div><p class="section-kicker">Technical assurance</p><h3>Make trade-offs, evidence, and residual risk explicit</h3><p>Govern the solution without replacing domain specialists or formal authorities.</p></div></div><div class="governance-stack">
  ${governanceSection("Trade studies", "Frame the question, compare assessed candidates, and record the current recommendation.", "trades", trades, [{ label: "Trade / question", field: "title" }, { label: "Decision question", field: "question", multiline: true }, { label: "Candidates", field: "optionIds", multipleOptions: candidates, emptyLabel: "Add candidates in Assess" }, { label: "Recommendation", field: "recommendation", multiline: true }, { label: "Status", field: "status", options: ["In analysis", "Ready for decision", "Closed"] }])}
  ${governanceSection("Decision records", "Preserve design intent, ownership, rationale, supporting evidence, and approval state.", "decisions", decisions, [{ label: "Decision", field: "title" }, { label: "Rationale", field: "rationale", multiline: true }, { label: "Evidence", field: "evidenceIds", multipleOptions: evidence, emptyLabel: "Add evidence in Shape" }, { label: "Owner", field: "owner" }, { label: "Status", field: "status", options: ["Proposed", "Approved", "Superseded"] }])}
  ${governanceSection("Risks", "Track technical, integration, delivery, cyber, safety, supply, and transition exposure.", "risks", risks, [{ label: "Risk", field: "title" }, { label: "Likelihood", field: "likelihood", options: ["Low", "Medium", "High"] }, { label: "Impact", field: "impact", options: ["Low", "Medium", "High"] }, { label: "Owner", field: "owner" }, { label: "Mitigation", field: "mitigation", multiline: true }, { label: "Status", field: "status", options: ["Open", "Watching", "Mitigated", "Closed"] }])}
  ${governanceSection("Dependencies", "Make external inputs, access, decisions, facilities, data, and schedule commitments visible.", "dependencies", dependencies, [{ label: "Dependency", field: "title" }, { label: "Type", field: "type" }, { label: "Provider", field: "provider" }, { label: "Owner", field: "owner" }, { label: "Needed by", field: "neededBy", type: "date" }, { label: "Status", field: "status", options: ["Open", "At risk", "Blocked", "Satisfied"] }, { label: "Impact", field: "impact", multiline: true }])}
  ${governanceSection("Review gates", "Define entry evidence and the accountable review owner.", "reviews", reviews, [{ label: "Review", field: "name" }, { label: "Type", field: "type", options: ["Mission", "Requirements", "Technology", "Architecture", "Proposal", "Transition"] }, { label: "Due", field: "due", type: "date" }, { label: "Owner", field: "owner" }, { label: "Entry criteria", field: "entryCriteria", multiline: true }, { label: "Status", field: "status", options: ["Planned", "Ready", "Complete"] }])}
  <section class="panel ai-drafts"><div class="panel-head"><div><h3>AI drafts</h3><p>Structured output stays separate from authored content. Review and explicitly accept or reject it; acceptance never overwrites a record.</p></div><span class="metric">${drafts.length}</span></div>${drafts.length ? `<div class="draft-list">${drafts.map(draft => `<article><div><span class="draft-status ${h(draft.status.toLowerCase().replaceAll(" ", "-"))}">${h(draft.status)}</span><h4>${h(draft.title)}</h4><p>${h(draft.result?.summary || `${draft.action.replaceAll("_", " ")} · ${draft.stage}`)}</p><small>${h(new Date(draft.createdAt).toLocaleString())} · ${h(draft.citationIds.length)} cited workspace records</small></div><div class="draft-actions"><button class="small-button" type="button" data-ai-draft-view="${h(draft.id)}">Review</button>${draft.status === "Pending review" ? `<button class="small-button" type="button" data-ai-draft-status="Accepted" data-id="${h(draft.id)}">Accept</button><button class="small-button" type="button" data-ai-draft-status="Rejected" data-id="${h(draft.id)}">Reject</button>` : ""}<button class="icon-button" type="button" data-delete="aiDrafts" data-id="${h(draft.id)}" aria-label="Delete AI draft">×</button></div></article>`).join("")}</div>` : emptyState("No saved AI drafts", "AI assistance is optional. Any response must pass citation validation before it can be saved here.")}</section></div>`;
}

function renderPropose(solution) {
  const requirements = scoped(workspace, "requirements", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  const hotButtons = scoped(workspace, "hotButtons", solution.id).filter(item => item.status !== "Retired");
  const winThemes = scoped(workspace, "winThemes", solution.id);
  return `${renderStageRail("Propose")}<section class="panel win-themes"><div class="panel-head"><div><p class="section-kicker">Capture strategy</p><h3>Win themes</h3><p>Connect a real customer signal to customer value, a defensible discriminator, and proof. A slogan without evidence remains a gap.</p></div><button class="small-button" type="button" data-add="winThemes">＋ Win theme</button></div>${winThemes.length ? `<div class="win-theme-grid">${winThemes.map(theme => winThemeCard(theme, hotButtons, evidence)).join("")}</div>` : emptyState("No win themes", "Build win themes from validated customer priorities and evidence—not generic claims.")}</section><div class="page-grid proposal-grid"><section class="panel form-panel"><div class="panel-head"><div><p class="section-kicker">Solution narrative</p><h3>Explain a coherent, deliverable approach</h3><p>Keep proposal claims tied to the same workspace facts used for technical decisions.</p></div></div><div class="form-grid single">
    ${field("Concept of operations", solution.proposal.conops, `data-solution-nested="proposal.conops" maxlength="12000"`, { multiline: true })}
    ${field("Technical approach", solution.proposal.technicalApproach, `data-solution-nested="proposal.technicalApproach" maxlength="12000"`, { multiline: true })}
    ${field("Discriminators", solution.proposal.discriminators, `data-solution-nested="proposal.discriminators" maxlength="8000"`, { multiline: true })}
    ${field("Estimate assumptions", solution.proposal.estimateAssumptions, `data-solution-nested="proposal.estimateAssumptions" maxlength="8000"`, { multiline: true })}
    ${field("Delivery commitments", solution.proposal.deliveryCommitments, `data-solution-nested="proposal.deliveryCommitments" maxlength="8000"`, { multiline: true })}
  </div></section><aside class="panel compliance-panel"><div class="panel-head"><div><h3>Compliance trace</h3><p>Lightweight v1 view; full proposal-volume generation is deferred.</p></div></div><ul class="compliance-list">${requirements.map(item => { const source = evidence.find(record => record.id === item.sourceEvidenceId); return `<li><span class="compliance-state ${item.sourceEvidenceId && item.acceptanceMethod ? "ready" : "gap"}">${item.sourceEvidenceId && item.acceptanceMethod ? "Ready" : "Gap"}</span><div><strong>${h(item.title)}</strong><small>${h(source?.title || "No source")} · ${h(item.acceptanceMethod || "No acceptance method")}</small></div></li>`; }).join("")}</ul>${!requirements.length ? emptyState("No compliance trace", "Shape requirements before drafting the solution narrative.") : ""}</aside></div>`;
}

function winThemeCard(theme, hotButtons, evidence) {
  return `<article class="win-theme-card"><button class="delete-record" type="button" data-delete="winThemes" data-id="${h(theme.id)}" aria-label="Delete win theme">×</button><div class="win-theme-heading"><label><span>Win theme</span><input value="${h(theme.title)}" maxlength="280" data-record-collection="winThemes" data-record-id="${h(theme.id)}" data-record-field="title"></label><label><span>Status</span><select data-record-collection="winThemes" data-record-id="${h(theme.id)}" data-record-field="status">${["Draft", "Substantiated", "Retired"].map(value => option(value, value, theme.status)).join("")}</select></label></div><label><span>Customer value</span><textarea rows="3" maxlength="3000" data-record-collection="winThemes" data-record-id="${h(theme.id)}" data-record-field="customerValue">${h(theme.customerValue)}</textarea></label><label><span>Our discriminator</span><textarea rows="3" maxlength="3000" data-record-collection="winThemes" data-record-id="${h(theme.id)}" data-record-field="discriminator">${h(theme.discriminator)}</textarea></label><label><span>Proof / reason to believe</span><textarea rows="3" maxlength="3000" data-record-collection="winThemes" data-record-id="${h(theme.id)}" data-record-field="proof">${h(theme.proof)}</textarea></label><div class="win-theme-links"><label><span>Customer hot buttons</span><select multiple size="3" data-win-theme-hot-buttons="${h(theme.id)}">${hotButtons.map(item => `<option value="${h(item.id)}" ${theme.linkedHotButtonIds?.includes(item.id) ? "selected" : ""}>${h(item.title)}</option>`).join("")}</select></label><label><span>Supporting evidence</span><select multiple size="3" data-win-theme-evidence="${h(theme.id)}">${evidence.map(item => `<option value="${h(item.id)}" ${theme.sourceEvidenceIds?.includes(item.id) ? "selected" : ""}>${h(item.title)}</option>`).join("")}</select></label></div></article>`;
}

function renderTransition(solution) {
  const roadmap = scoped(workspace, "roadmapItems", solution.id);
  const actions = scoped(workspace, "transitionActions", solution.id);
  const assumptions = scoped(workspace, "assumptions", solution.id);
  return `${renderStageRail("Transition")}<div class="section-toolbar"><div><p class="section-kicker">Transition and handoff</p><h3>Move design intent, evidence, and residual risk into delivery</h3><p>Cover transition from technology into a program and from solution shaping into implementation.</p></div></div><div class="governance-stack">
  ${governanceSection("Roadmap and gates", "Sequence assessment, integration, demonstrations, reviews, and handoff events.", "roadmapItems", roadmap, [{ label: "Stage", field: "stage", options: STAGES }, { label: "Activity", field: "title" }, { label: "Start", field: "start", type: "date" }, { label: "End", field: "end", type: "date" }, { label: "Owner", field: "owner" }, { label: "Status", field: "status", options: ["Planned", "In progress", "Blocked", "Complete"] }])}
  ${governanceSection("Transition actions", "Make receiving-team acceptance, configuration, training, sustainment, and blockers visible.", "transitionActions", actions, [{ label: "Action", field: "title" }, { label: "Owner", field: "owner" }, { label: "Target / gate", field: "target" }, { label: "Blocker", field: "blocker", multiline: true }, { label: "Status", field: "status", options: ["Planned", "In progress", "Blocked", "Complete"] }])}
  ${governanceSection("Assumptions", "Validate assumptions before they become hidden delivery commitments.", "assumptions", assumptions, [{ label: "Assumption", field: "statement", multiline: true }, { label: "Owner", field: "owner" }, { label: "Validation plan", field: "validationPlan", multiline: true }, { label: "Status", field: "status", options: ["Unverified", "Validated", "Invalidated"] }])}</div>`;
}

function renderDecisionPackage(solution) {
  const readiness = buildReadiness(workspace, solution.id);
  const markdown = buildDecisionPackageMarkdown(workspace, solution.id);
  return `${renderStageRail(solution.stage)}<div class="section-toolbar"><div><p class="section-kicker">Review artifact</p><h3>Decision package</h3><p>Mission brief, traceability, assessments, architecture, decisions, risks, roadmap, and evidence gaps.</p></div><div><button class="button secondary" type="button" data-action="export-markdown">Download Markdown</button><button class="button secondary" type="button" data-action="export-html">Standalone HTML</button><button class="button primary" type="button" data-action="print-package">Print / PDF</button></div></div><section class="panel package-summary"><div><span>Overall readiness</span><strong>${readiness.overall}%</strong></div><div><span>Traceability</span><strong>${readiness.traceability}%</strong></div><div><span>Evidence</span><strong>${readiness.evidence}%</strong></div><div><span>Interfaces</span><strong>${readiness.interfaces}%</strong></div><div><span>Transition</span><strong>${readiness.transition}%</strong></div></section><section class="panel package-preview"><div class="panel-head"><div><h3>Markdown preview</h3><p>Exports include separate SVG/PNG diagram controls in the Architect view.</p></div></div><pre>${h(markdown)}</pre></section>`;
}

const ADD_DEFAULTS = {
  stakeholders: () => ({ id: makeId("stakeholder"), name: "New stakeholder", role: "", concern: "" }),
  hotButtons: () => ({ id: makeId("hot_button"), title: "New customer hot button", detail: "", source: "", confidence: "Unverified", status: "Captured" }),
  outcomes: () => ({ id: makeId("outcome"), title: "New operational outcome", verificationMethod: "", linkedRequirementIds: [] }),
  measures: () => ({ id: makeId("measure"), name: "New measure", target: "", method: "" }),
  evidence: () => ({ id: makeId("evidence"), title: "New evidence", source: "", url: "", notes: "", confidence: "Medium" }),
  requirements: () => ({ id: makeId("requirement"), title: "New requirement", type: "Functional", priority: "Must", sourceEvidenceId: "", acceptanceMethod: "", status: "Draft", linkedElementIds: [], linkedHotButtonIds: [] }),
  candidates: () => ({ id: makeId("candidate"), name: "New candidate", category: "Integrated solution", vendor: "", description: "", trl: null, mrl: null, irl: null, status: "Considering", scores: [] }),
  winThemes: () => ({ id: makeId("win_theme"), title: "New win theme", customerValue: "", discriminator: "", proof: "", linkedHotButtonIds: [], sourceEvidenceIds: [], status: "Draft" }),
  trades: () => ({ id: makeId("trade"), title: "New trade study", question: "", optionIds: [], recommendation: "", status: "In analysis" }),
  decisions: () => ({ id: makeId("decision"), title: "New decision", status: "Proposed", rationale: "", evidenceIds: [], owner: "", date: "" }),
  risks: () => ({ id: makeId("risk"), title: "New risk", likelihood: "Medium", impact: "Medium", owner: "", mitigation: "", status: "Open" }),
  dependencies: () => ({ id: makeId("dependency"), title: "New dependency", type: "External input", provider: "", owner: "", neededBy: "", status: "Open", impact: "" }),
  reviews: () => ({ id: makeId("review"), name: "New review", type: "Architecture", due: "", owner: "", status: "Planned", entryCriteria: "" }),
  roadmapItems: () => ({ id: makeId("roadmap"), stage: "Assess", title: "New activity", start: "", end: "", owner: "", status: "Planned", gate: false }),
  transitionActions: () => ({ id: makeId("transition"), title: "New transition action", owner: "", target: "", status: "Planned", blocker: "" }),
  assumptions: () => ({ id: makeId("assumption"), statement: "New assumption", status: "Unverified", owner: "", validationPlan: "" })
};

function addRecord(collection) {
  const factory = ADD_DEFAULTS[collection];
  if (!factory) return;
  const created = factory();
  created.solutionId = workspace.activeSolutionId;
  commit(next => next[collection].push(created), { snapshot: `Before adding ${collection}` });
  if (collection === "candidates") selectedCandidateId = created.id;
}

function deleteRecord(collection, id) {
  const target = record(collection, id);
  if (!target) return;
  commit(next => {
    const remove = (name, predicate) => { next[name] = next[name].filter(item => !predicate(item)); };
    if (collection === "architectureViews") {
      const elementIds = new Set(next.elements.filter(item => item.viewId === id).map(item => item.id));
      remove("connections", item => item.viewId === id || elementIds.has(item.sourceElementId) || elementIds.has(item.targetElementId));
      remove("elements", item => item.viewId === id);
      for (const requirement of next.requirements) requirement.linkedElementIds = (requirement.linkedElementIds || []).filter(elementId => !elementIds.has(elementId));
    }
    if (collection === "elements") {
      remove("connections", item => item.sourceElementId === id || item.targetElementId === id);
      for (const requirement of next.requirements) requirement.linkedElementIds = (requirement.linkedElementIds || []).filter(elementId => elementId !== id);
    }
    if (collection === "evidence") {
      for (const requirement of next.requirements) if (requirement.sourceEvidenceId === id) requirement.sourceEvidenceId = "";
      for (const candidate of next.candidates) for (const score of candidate.scores || []) score.evidenceIds = (score.evidenceIds || []).filter(evidenceId => evidenceId !== id);
      for (const decision of next.decisions) decision.evidenceIds = (decision.evidenceIds || []).filter(evidenceId => evidenceId !== id);
      for (const winTheme of next.winThemes) winTheme.sourceEvidenceIds = (winTheme.sourceEvidenceIds || []).filter(evidenceId => evidenceId !== id);
    }
    if (collection === "hotButtons") {
      for (const requirement of next.requirements) requirement.linkedHotButtonIds = (requirement.linkedHotButtonIds || []).filter(hotButtonId => hotButtonId !== id);
      for (const winTheme of next.winThemes) winTheme.linkedHotButtonIds = (winTheme.linkedHotButtonIds || []).filter(hotButtonId => hotButtonId !== id);
    }
    if (collection === "criteria") for (const candidate of next.candidates) candidate.scores = (candidate.scores || []).filter(score => score.criterionId !== id);
    if (collection === "candidates") for (const trade of next.trades) trade.optionIds = (trade.optionIds || []).filter(optionId => optionId !== id);
    if (collection === "requirements") for (const outcome of next.outcomes) outcome.linkedRequirementIds = (outcome.linkedRequirementIds || []).filter(requirementId => requirementId !== id);
    remove(collection, item => item.id === id);
  }, { snapshot: `Before deleting ${collection}` });
  if (selectedElementId === id) selectedElementId = "";
  if (selectedCandidateId === id) selectedCandidateId = "";
  if (selectedViewId === id) selectedViewId = "";
}

function showNewSolution() {
  openModal("Create a solution workspace", `<form id="new-solution-form"><p class="modal-intro">Start with a clean solution and the default Technology Assessment criteria.</p>${field("Solution name", "", `name="name" required maxlength="180" autofocus`)}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Create solution</button></div></form>`);
}

function showTools() {
  openModal("Workspace tools", `<div class="tool-list"><button class="tool-card" type="button" data-tool="export-json"><strong>Export JSON backup</strong><span>Download the complete validated workspace, including all solutions.</span></button><button class="tool-card" type="button" data-tool="import-json"><strong>Import JSON backup</strong><span>Validate the entire file before atomically replacing this browser workspace.</span></button><button class="tool-card" type="button" data-tool="snapshot"><strong>Create recovery point</strong><span>Save a bounded local snapshot without nesting older snapshots.</span></button><button class="tool-card" type="button" data-tool="duplicate"><strong>Duplicate active solution</strong><span>Create an independent working copy with new record identifiers.</span></button><button class="tool-card danger" type="button" data-tool="delete-solution" ${workspace.solutions.length === 1 ? "disabled" : ""}><strong>Delete active solution</strong><span>Remove the solution and every record bound to it.</span></button></div>`);
}

function showHotButtonIngest() {
  openModal("Ingest customer hot buttons", `<form id="hot-button-ingest-form"><p class="modal-intro">Paste one priority, concern, sensitivity, or decision driver per line. The workbench preserves these as customer signals—not requirements—until you validate and trace them.</p>${field("Source / interaction", "", `name="source" required maxlength="300" placeholder="Example: customer working session, 2026-08-28"`)}${selectField("Initial confidence", `name="confidence"`, ["Unverified", "Low", "Medium", "High"].map(value => option(value, value, "Medium")).join(""))}${field("Customer hot buttons — one per line", "", `name="items" required maxlength="12000" placeholder="- Avoid vendor lock-in\n- Demonstrate within six months\n- Minimize platform changes"`, { multiline: true, hint: "Up to 50 lines. Bullets and numbered-list prefixes are removed." })}<div class="guide-note warning"><strong>Source discipline</strong><p>Record what you actually heard or observed. Validate the signal before treating it as an evaluation discriminator, proposal claim, or requirement.</p></div><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Ingest signals</button></div></form>`, { wide: true });
}

function showGuide() {
  openModal("Solution Architect Workbench guide", `<div class="guide"><p class="modal-intro">The architect owns solution coherence and defensibility. The workbench coordinates specialist inputs; it does not replace cyber, safety, systems engineering, test, pricing, contracts, logistics, or domain authorities.</p><ol class="guide-steps"><li><strong>Discover</strong><span>Frame the mission, operational context, stakeholders, customer hot buttons, outcomes, measures, constraints, and the exact decision. Preserve each customer signal's source and validation state.</span></li><li><strong>Shape</strong><span>Translate authoritative needs into traceable requirements, nonfunctional requirements, evidence, and acceptance logic. A hot button is not a contractual requirement until it is validated through the proper source.</span></li><li><strong>Assess</strong><span>Compare hardware, software, tools, vendors, platforms, and integrated options. Unknown remains unknown.</span></li><li><strong>Architect</strong><span>Model people, process, hardware, software, data, networks, facilities, and external systems through fit-for-purpose views.</span></li><li><strong>Prove</strong><span>Record trades, decisions, risks, dependencies, reviews, demonstrations, and residual uncertainty.</span></li><li><strong>Propose</strong><span>Build win themes by connecting customer value, a real discriminator, and proof; then carry those themes into the CONOPS and technical narrative.</span></li><li><strong>Transition</strong><span>Handoff configuration, interfaces, evidence, risks, training, sustainment, and ownership into delivery.</span></li></ol><div class="guide-note"><strong>DoDAF and MOSA</strong><p>Use only the views needed for the decision. The app uses selected DoDAF viewpoint concepts and fit-for-purpose presentation guidance but does not implement or certify DoDAF conformance. Treat MOSA as both a technical and business strategy: modular boundaries, open interfaces, standards, upgrade paths, competition, sustainment, and data rights.</p></div><div class="guide-note warning"><strong>Data handling</strong><p>The site is public, but workspace content is stored only in this browser unless exported or deliberately sent through AI assistance. Do not use it for classified, CUI, export-controlled, proprietary, or restricted customer content unless your organization separately authorizes that handling.</p></div></div>`, { wide: true });
}

function showRecovery() {
  openModal("Recovery points", `<p class="modal-intro">Restoring validates the selected snapshot and first preserves the current workspace as “Before recovery restore.”</p>${workspace.snapshots.length ? `<div class="snapshot-list">${workspace.snapshots.map(item => `<article><div><strong>${h(item.label)}</strong><span>${h(new Date(item.createdAt).toLocaleString())}</span></div><button class="small-button" type="button" data-restore="${h(item.id)}">Restore</button></article>`).join("")}</div>` : emptyState("No recovery points", "Create one from Workspace tools or make a structural edit.")}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button></div>`);
}

function exportWorkspaceJson() {
  const result = validateWorkspace(workspace);
  if (!result.valid) { toast(`Backup blocked: ${result.errors[0]}`, "error"); return; }
  download(`solution-architect-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(workspace, null, 2), "application/json;charset=utf-8");
  const saved = saveNow();
  if (!saved) toast("Downloaded the current in-memory workspace. Keep this backup because browser storage did not save it.", "ok");
}

async function importWorkspaceFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast("Workspace imports are limited to 5 MB.", "error"); return; }
  try {
    const candidate = JSON.parse(await file.text());
    const result = validateWorkspaceImport(candidate);
    if (!result.valid) throw new Error(result.errors.slice(0, 5).join(" "));
    const next = pushSnapshot(workspace, "Before JSON workspace import");
    candidate.snapshots = [next.snapshots[0], ...(candidate.snapshots || [])].slice(0, 8);
    const persistedCandidate = { ...candidate, savedAt: new Date().toISOString() };
    const final = validateWorkspace(persistedCandidate);
    if (!final.valid) throw new Error(final.errors[0]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedCandidate));
    } catch (error) {
      const persistenceError = new Error(`Browser storage could not save the validated import. The current workspace was kept. ${error.message}`);
      persistenceError.name = "ImportPersistenceError";
      throw persistenceError;
    }
    workspace = persistedCandidate;
    dirty = false;
    setSaveState("Saved locally", "ok");
    selectedCandidateId = selectedViewId = selectedElementId = "";
    closeModal();
    render();
    toast("Workspace imported and validated.", "ok");
  } catch (error) {
    const prefix = error.name === "ImportPersistenceError" ? "Import not applied" : "Import rejected";
    toast(`${prefix}: ${error.message}`, "error");
  } finally {
    document.querySelector("#workspace-import").value = "";
  }
}

function duplicateActiveSolution() {
  const sourceId = workspace.activeSolutionId;
  commit(next => {
    const source = next.solutions.find(item => item.id === sourceId);
    const idMap = new Map([[sourceId, makeId("solution")]]);
    for (const collection of Object.keys(ADD_DEFAULTS).concat(["criteria", "architectureViews", "elements", "connections"])) {
      for (const item of next[collection].filter(record => record.solutionId === sourceId)) idMap.set(item.id, makeId(collection.replace(/s$/, "")));
    }
    const copyId = idMap.get(sourceId);
    next.solutions.push({ ...structuredClone(source), id: copyId, name: `${source.name} — Copy`, stage: "Discover", status: "Working", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const remap = value => idMap.get(value) || value;
    const collections = ["stakeholders", "hotButtons", "outcomes", "measures", "requirements", "evidence", "criteria", "candidates", "winThemes", "architectureViews", "elements", "connections", "trades", "decisions", "risks", "dependencies", "assumptions", "roadmapItems", "reviews", "transitionActions"];
    for (const collection of collections) {
      const copies = next[collection].filter(item => item.solutionId === sourceId).map(item => {
        const copy = structuredClone(item);
        copy.id = remap(item.id); copy.solutionId = copyId;
        if (copy.viewId) copy.viewId = remap(copy.viewId);
        if (copy.sourceElementId) copy.sourceElementId = remap(copy.sourceElementId);
        if (copy.targetElementId) copy.targetElementId = remap(copy.targetElementId);
        if (copy.sourceEvidenceId) copy.sourceEvidenceId = remap(copy.sourceEvidenceId);
        if (copy.linkedHotButtonIds) copy.linkedHotButtonIds = copy.linkedHotButtonIds.map(remap);
        if (copy.linkedElementIds) copy.linkedElementIds = copy.linkedElementIds.map(remap);
        if (copy.linkedRequirementIds) copy.linkedRequirementIds = copy.linkedRequirementIds.map(remap);
        if (copy.evidenceIds) copy.evidenceIds = copy.evidenceIds.map(remap);
        if (copy.sourceEvidenceIds) copy.sourceEvidenceIds = copy.sourceEvidenceIds.map(remap);
        if (copy.optionIds) copy.optionIds = copy.optionIds.map(remap);
        if (copy.citationIds) copy.citationIds = copy.citationIds.map(remap);
        if (copy.scores) copy.scores = copy.scores.map(score => ({ ...score, criterionId: remap(score.criterionId), evidenceIds: score.evidenceIds.map(remap) }));
        return copy;
      });
      next[collection].push(...copies);
    }
    next.activeSolutionId = copyId;
  }, { snapshot: "Before duplicating solution" });
}

function deleteActiveSolution() {
  if (workspace.solutions.length === 1) return;
  const solution = activeSolution();
  if (!confirm(`Delete “${solution.name}” and every record bound to it? A recovery point will be created first.`)) return;
  commit(next => {
    const id = next.activeSolutionId;
    next.solutions = next.solutions.filter(item => item.id !== id);
    for (const collection of ["stakeholders", "hotButtons", "outcomes", "measures", "requirements", "evidence", "criteria", "candidates", "winThemes", "architectureViews", "elements", "connections", "trades", "decisions", "risks", "dependencies", "assumptions", "roadmapItems", "reviews", "transitionActions", "aiDrafts"]) next[collection] = next[collection].filter(item => item.solutionId !== id);
    next.activeSolutionId = next.solutions[0].id;
  }, { snapshot: "Before deleting solution" });
  closeModal();
}

function newViewDialog() {
  openModal("Create an architecture view", `<form id="new-view-form">${field("View name", "", `name="name" required maxlength="180"`)}${selectField("Guided template", `name="template"`, VIEW_TEMPLATES.map(([value, label]) => option(value, label, "context")).join(""), "Templates guide purpose and element choices; they do not force a DoDAF product set.")}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Create view</button></div></form>`);
}

function addElementDialog() {
  openModal("Add architecture element", `<form id="new-element-form">${field("Element name", "", `name="name" required maxlength="180"`)}${selectField("Element type", `name="type"`, ELEMENT_TYPES.map(value => option(value, value, "Hardware")).join(""))}${field("Description", "", `name="description" maxlength="2000"`, { multiline: true })}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Add element</button></div></form>`);
}

function addConnectionDialog() {
  const elements = workspace.elements.filter(item => item.viewId === selectedViewId);
  openModal("Add an exchange", `<form id="new-connection-form">${selectField("Source", `name="source"`, elements.map(item => option(item.id, item.name, elements[0]?.id)).join(""))}${selectField("Target", `name="target"`, elements.map(item => option(item.id, item.name, elements[1]?.id)).join(""))}${selectField("Interface type", `name="type"`, INTERFACE_TYPES.map(value => option(value, value, "Data")).join(""))}${field("Exchange label", "", `name="label" required maxlength="180"`)}${field("Protocol / standard", "", `name="protocol" maxlength="180"`)}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Add exchange</button></div></form>`);
}

function exportSelectedSvg() {
  const view = record("architectureViews", selectedViewId);
  if (!view) return;
  download(`${slug(view.name)}.svg`, buildDiagramSvg(workspace, view.id, { standalone: true }), "image/svg+xml;charset=utf-8");
}

function exportSelectedPng() {
  const view = record("architectureViews", selectedViewId);
  if (!view) return;
  const svg = buildDiagramSvg(workspace, view.id, { standalone: true });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, 2400 / view.width);
    canvas.width = Math.round(view.width * scale); canvas.height = Math.round(view.height * scale);
    const context = canvas.getContext("2d");
    context.scale(scale, scale); context.drawImage(image, 0, 0);
    canvas.toBlob(blob => { if (blob) download(`${slug(view.name)}.png`, blob, "image/png"); URL.revokeObjectURL(url); }, "image/png");
  };
  image.onerror = () => { URL.revokeObjectURL(url); toast("PNG export could not render this view.", "error"); };
  image.src = url;
}

function printDecisionPackage() {
  const solution = activeSolution();
  const html = buildDecisionPackageHtml(workspace, solution.id);
  const stylesheetUrl = new URL("./print-package.css", location.href).href;
  const printHtml = html.replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="${h(stylesheetUrl)}">`);
  const url = URL.createObjectURL(new Blob([printHtml], { type: "text/html" }));
  const popup = window.open(url, "_blank");
  if (!popup) { URL.revokeObjectURL(url); toast("Allow pop-ups to open and print the decision package.", "error"); return; }
  const invokePrint = () => {
    if (popup.closed) return;
    popup.focus();
    popup.print();
  };
  if (popup.location.href === url && popup.document.readyState === "complete") setTimeout(invokePrint, 0);
  else popup.addEventListener("load", invokePrint, { once: true });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// AI assistance
function currentStage() { return STAGES.find(stage => stageRoute(stage) === route) || activeSolution().stage; }
function showAiDialog() {
  const stage = currentStage();
  openModal("AI assistance — review before sending", `<div id="ai-workflow"><p class="modal-intro">AI receives only the selected stage facts shown in the payload preview. It cannot browse the full workspace, save changes, or overwrite authored content.</p><div class="form-grid"><label class="field"><span>Action</span><select id="ai-action"><option value="find_gaps">Find gaps</option><option value="critique_artifact">Critique an artifact</option><option value="draft_artifact">Draft an artifact</option><option value="generate_review_questions">Generate review questions</option><option value="propose_architecture_view">Propose an architecture view</option></select></label><label class="field"><span>Lifecycle stage</span><select id="ai-stage">${STAGES.map(value => option(value, value, stage)).join("")}</select></label><label class="field span-2"><span>Focus (optional)</span><textarea id="ai-focus" rows="3" maxlength="1000" placeholder="What should the assistant pay particular attention to?"></textarea></label></div><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="button" data-ai="prepare">Prepare exact payload</button></div></div>`, { wide: true });
}

function renderAiPreview() {
  const workflow = document.querySelector("#ai-workflow");
  if (!workflow || !aiPreview) return;
  workflow.innerHTML = `<p class="modal-intro">Inspect the exact JSON below. These are the selected <strong>${h(aiPreview.stage)}</strong> facts. Nothing is sent until you sign in, make all three acknowledgments, and select Send.</p><pre class="payload-preview">${h(JSON.stringify(aiPreview.payload, null, 2))}</pre><div class="ack-list"><label><input type="checkbox" id="ack-payload"> I reviewed this exact payload.</label><label><input type="checkbox" id="ack-data"> It contains approved unclassified, non-CUI information only.</label><label><input type="checkbox" id="ack-restricted"> It contains no classified, export-controlled, proprietary, or customer-restricted information unless separately authorized.</label></div><details class="sign-in-box"><summary>Sign in for AI access</summary><div class="form-grid"><label class="field"><span>Email</span><input type="email" id="ai-email" autocomplete="username"></label><label class="field"><span>Password</span><input type="password" id="ai-password" autocomplete="current-password"></label></div><button class="button secondary" type="button" data-ai="sign-in">Sign in</button><span id="ai-auth-state"></span></details><div class="modal-actions"><button class="button secondary" type="button" data-ai="back">Back</button><button class="button primary" type="button" data-ai="send">Send selected facts to AI</button></div>`;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!globalThis.supabase?.createClient) throw new Error("The local authentication client could not be loaded.");
  supabaseClient = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "solution_architect_auth" } });
  return supabaseClient;
}

async function signInForAi() {
  const email = document.querySelector("#ai-email")?.value.trim();
  const password = document.querySelector("#ai-password")?.value || "";
  const state = document.querySelector("#ai-auth-state");
  if (!email || !password) { if (state) state.textContent = "Enter email and password."; return; }
  if (state) state.textContent = "Signing in…";
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (state) state.textContent = error ? error.message : "Signed in. You can send the reviewed payload.";
}

async function callAi() {
  if (!["ack-payload", "ack-data", "ack-restricted"].every(id => document.querySelector(`#${id}`)?.checked)) { toast("Complete all three data acknowledgments before sending.", "error"); return; }
  const client = getSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) { toast("Sign in with an approved account before using AI assistance.", "error"); return; }
  const workflow = document.querySelector("#ai-workflow");
  workflow.setAttribute("aria-busy", "true");
  workflow.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/solution-assist`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(aiPreview.payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((typeof body.error === "string" ? body.error : body.error?.message) || body.message || `AI request failed (${response.status}).`);
    const result = validateAiResponse(body, workspace, workspace.activeSolutionId, aiPreview.payload.action);
    if (!result.valid) throw new Error(result.errors[0]);
    aiResponse = body;
    workflow.innerHTML = `<p class="modal-intro">The response passed local contract and citation validation. It remains a draft until you explicitly save it.</p><pre class="payload-preview response">${h(JSON.stringify(body.result, null, 2))}</pre><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Discard</button><button class="button primary" type="button" data-ai="save-draft">Save as pending draft</button></div>`;
  } catch (error) {
    workflow.removeAttribute("aria-busy");
    workflow.querySelectorAll("button").forEach(button => { button.disabled = false; });
    toast(error.message, "error");
  }
}

function saveAiDraft() {
  if (!aiResponse || !aiPreview) return;
  const citationIds = aiResponse.result.citation_ids || [];
  const saved = commit(next => next.aiDrafts.push({ id: makeId("ai_draft"), solutionId: next.activeSolutionId, action: aiResponse.action, stage: aiPreview.stage, title: `${aiResponse.action.replaceAll("_", " ")} draft`, status: "Pending review", createdAt: new Date().toISOString(), citationIds, result: aiResponse.result, requestId: aiResponse.request_id, model: aiResponse.model }), { snapshot: "Before saving AI draft" });
  if (!saved) return;
  closeModal();
  toast("AI output saved as a pending draft. No authored content was overwritten.", "ok");
}

function showAiDraft(draftId) {
  const draft = record("aiDrafts", draftId);
  if (!draft || draft.solutionId !== workspace.activeSolutionId) return;
  openModal("Review AI draft", `<div class="draft-review"><p class="modal-intro"><strong>${h(draft.status)}</strong> · ${h(draft.action.replaceAll("_", " "))} · ${h(draft.stage)}</p><pre class="payload-preview response">${h(JSON.stringify(draft.result, null, 2))}</pre><p class="draft-citations"><strong>Workspace citations:</strong> ${draft.citationIds.length ? draft.citationIds.map(h).join(", ") : "None"}</p><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button>${draft.status === "Pending review" ? `<button class="button secondary" type="button" data-ai-draft-status="Rejected" data-id="${h(draft.id)}">Reject</button><button class="button primary" type="button" data-ai-draft-status="Accepted" data-id="${h(draft.id)}">Accept draft</button>` : ""}</div></div>`, { wide: true });
}

function setAiDraftStatus(draftId, status) {
  if (!["Accepted", "Rejected"].includes(status)) return;
  const changed = commit(next => {
    const draft = next.aiDrafts.find(item => item.id === draftId && item.solutionId === next.activeSolutionId);
    if (!draft || draft.status !== "Pending review") return;
    draft.status = status;
  }, { snapshot: `Before marking AI draft ${status.toLowerCase()}` });
  if (changed) {
    closeModal();
    render();
    toast(`AI draft marked ${status.toLowerCase()}. Authored content was not changed.`, status === "Accepted" ? "ok" : "info");
  }
}

// Diagram interactions
function bindDiagramInteractions() {
  const svg = document.querySelector("#diagram-canvas svg");
  if (!svg) return;
  svg.querySelectorAll("[data-element-id]").forEach(node => {
    node.addEventListener("pointerdown", startElementDrag);
    node.addEventListener("click", () => { selectedElementId = node.dataset.elementId; render(); });
    node.addEventListener("keydown", moveElementWithKeyboard);
  });
}

function startElementDrag(event) {
  if (event.button !== 0) return;
  const group = event.currentTarget;
  const element = record("elements", group.dataset.elementId);
  const svg = group.ownerSVGElement;
  if (!element || !svg) return;
  event.preventDefault();
  selectedElementId = element.id;
  const point = clientToSvg(svg, event.clientX, event.clientY);
  drag = { elementId: element.id, svg, group, offsetX: point.x - element.x, offsetY: point.y - element.y };
  group.setPointerCapture(event.pointerId);
  group.addEventListener("pointermove", dragElement);
  group.addEventListener("pointerup", endElementDrag, { once: true });
}

function clientToSvg(svg, clientX, clientY) {
  const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function dragElement(event) {
  if (!drag) return;
  const element = record("elements", drag.elementId);
  const view = record("architectureViews", element.viewId);
  const point = clientToSvg(drag.svg, event.clientX, event.clientY);
  element.x = Math.max(0, Math.min(view.width - element.width, Math.round(point.x - drag.offsetX)));
  element.y = Math.max(0, Math.min(view.height - element.height, Math.round(point.y - drag.offsetY)));
  drag.group.setAttribute("transform", `translate(${element.x} ${element.y})`);
}

function endElementDrag(event) {
  if (!drag) return;
  drag.group.removeEventListener("pointermove", dragElement);
  drag.group.releasePointerCapture?.(event.pointerId);
  drag = null;
  scheduleSave();
  render();
}

function moveElementWithKeyboard(event) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const id = event.currentTarget.dataset.elementId;
  const step = event.shiftKey ? 1 : 10;
  commit(next => {
    const element = next.elements.find(item => item.id === id);
    const view = next.architectureViews.find(item => item.id === element.viewId);
    if (event.key === "ArrowLeft") element.x = Math.max(0, element.x - step);
    if (event.key === "ArrowRight") element.x = Math.min(view.width - element.width, element.x + step);
    if (event.key === "ArrowUp") element.y = Math.max(0, element.y - step);
    if (event.key === "ArrowDown") element.y = Math.min(view.height - element.height, element.y + step);
  });
}

// Event delegation
document.addEventListener("click", event => {
  if (event.target.matches("[data-modal-backdrop]")) { closeModal(); return; }
  const close = event.target.closest("[data-close-modal]"); if (close) { closeModal(); return; }
  const routeButton = event.target.closest("[data-route-button]"); if (routeButton) { location.hash = routeButton.dataset.routeButton; return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "new-solution") showNewSolution();
  if (action === "open-tools") showTools();
  if (action === "open-guide") showGuide();
  if (action === "open-recovery") showRecovery();
  if (action === "open-ai") showAiDialog();
  if (action === "ingest-hot-buttons") showHotButtonIngest();
  if (action === "toggle-nav") { const sidebar = document.querySelector("#sidebar"); const open = sidebar.classList.toggle("open"); event.target.setAttribute("aria-expanded", String(open)); }
  if (action === "new-view") newViewDialog();
  if (action === "add-element") addElementDialog();
  if (action === "add-connection") addConnectionDialog();
  if (action === "auto-layout") { workspace = autoLayoutView(workspace, selectedViewId); scheduleSave(); render(); }
  if (action === "export-svg") exportSelectedSvg();
  if (action === "export-png") exportSelectedPng();
  if (action === "export-markdown") download(`${slug(activeSolution().name)}-decision-package.md`, buildDecisionPackageMarkdown(workspace, workspace.activeSolutionId), "text/markdown;charset=utf-8");
  if (action === "export-html") download(`${slug(activeSolution().name)}-decision-package.html`, buildDecisionPackageHtml(workspace, workspace.activeSolutionId), "text/html;charset=utf-8");
  if (action === "print-package") printDecisionPackage();
  const add = event.target.closest("[data-add]")?.dataset.add; if (add) addRecord(add);
  const deletion = event.target.closest("[data-delete]"); if (deletion && confirm("Delete this record? A recovery point will be created first.")) deleteRecord(deletion.dataset.delete, deletion.dataset.id);
  const candidate = event.target.closest("[data-candidate]")?.dataset.candidate; if (candidate) { selectedCandidateId = candidate; render(); }
  const view = event.target.closest("[data-view]")?.dataset.view; if (view) { selectedViewId = view; selectedElementId = ""; render(); }
  const restore = event.target.closest("[data-restore]")?.dataset.restore; if (restore) { try { workspace = restoreSnapshot(workspace, restore); saveNow(); closeModal(); render(); toast("Recovery point restored.", "ok"); } catch (error) { toast(error.message, "error"); } }
  const draftView = event.target.closest("[data-ai-draft-view]")?.dataset.aiDraftView; if (draftView) showAiDraft(draftView);
  const draftStatus = event.target.closest("[data-ai-draft-status]"); if (draftStatus) setAiDraftStatus(draftStatus.dataset.id, draftStatus.dataset.aiDraftStatus);
  const tool = event.target.closest("[data-tool]")?.dataset.tool;
  if (tool === "export-json") exportWorkspaceJson();
  if (tool === "import-json") document.querySelector("#workspace-import").click();
  if (tool === "snapshot") { workspace = pushSnapshot(workspace, "Manual recovery point"); saveNow(); closeModal(); render(); toast("Recovery point created.", "ok"); }
  if (tool === "duplicate") { duplicateActiveSolution(); closeModal(); }
  if (tool === "delete-solution") deleteActiveSolution();
  const ai = event.target.closest("[data-ai]")?.dataset.ai;
  if (ai === "prepare") { const actionValue = document.querySelector("#ai-action").value; const stage = document.querySelector("#ai-stage").value; const focus = document.querySelector("#ai-focus").value; aiPreview = { stage, payload: buildAiPayload(workspace, workspace.activeSolutionId, actionValue, stage, { focus }) }; renderAiPreview(); }
  if (ai === "back") showAiDialog();
  if (ai === "sign-in") signInForAi().catch(error => toast(error.message, "error"));
  if (ai === "send") callAi().catch(error => toast(error.message, "error"));
  if (ai === "save-draft") saveAiDraft();
});

document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (form.id === "hot-button-ingest-form") {
    const source = String(data.get("source") || "").trim();
    const confidence = String(data.get("confidence") || "Medium");
    const existing = new Set(scoped(workspace, "hotButtons").map(item => item.title.trim().toLowerCase()));
    const titles = String(data.get("items") || "").split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim().slice(0, 280)).filter(Boolean).filter(title => { const key = title.toLowerCase(); if (existing.has(key)) return false; existing.add(key); return true; }).slice(0, 50);
    if (!titles.length) { toast("No new customer hot buttons were found in the pasted lines.", "error"); return; }
    commit(next => next.hotButtons.push(...titles.map(title => ({ id: makeId("hot_button"), solutionId: next.activeSolutionId, title, detail: "", source, confidence, status: "Captured" }))), { snapshot: "Before ingesting customer hot buttons" });
    closeModal();
    toast(`${titles.length} customer hot button${titles.length === 1 ? "" : "s"} ingested for validation and traceability.`, "ok");
  }
  if (form.id === "new-solution-form") {
    const result = addBlankSolution(workspace, data.get("name")); workspace = pushSnapshot(result.workspace, "Created solution"); saveNow(); closeModal(); route = "discover"; location.hash = "discover"; render();
  }
  if (form.id === "new-view-form") {
    const view = createArchitectureView(workspace.activeSolutionId, data.get("template")); view.name = String(data.get("name")).trim(); commit(next => next.architectureViews.push(view), { snapshot: "Before creating architecture view" }); selectedViewId = view.id; closeModal(); render();
  }
  if (form.id === "new-element-form") {
    const view = record("architectureViews", selectedViewId); const elements = workspace.elements.filter(item => item.viewId === selectedViewId);
    const element = { id: makeId("element"), solutionId: workspace.activeSolutionId, viewId: selectedViewId, type: data.get("type"), name: String(data.get("name")).trim(), description: String(data.get("description") || ""), x: 60 + (elements.length % 4) * 250, y: 80 + Math.floor(elements.length / 4) * 150, width: 200, height: 82 };
    element.x = Math.min(view.width - element.width, element.x); element.y = Math.min(view.height - element.height, element.y);
    commit(next => next.elements.push(element), { snapshot: "Before adding architecture element" }); selectedElementId = element.id; closeModal(); render();
  }
  if (form.id === "new-connection-form") {
    const source = data.get("source"), target = data.get("target"); if (source === target) { toast("Source and target must be different elements.", "error"); return; }
    const connection = { id: makeId("connection"), solutionId: workspace.activeSolutionId, viewId: selectedViewId, sourceElementId: source, targetElementId: target, type: data.get("type"), label: String(data.get("label")).trim(), protocol: String(data.get("protocol") || ""), description: "" };
    commit(next => next.connections.push(connection), { snapshot: "Before adding architecture exchange" }); closeModal(); render();
  }
});

document.addEventListener("input", event => {
  const node = event.target;
  const solution = activeSolution();
  if (node.dataset.solutionField) { solution[node.dataset.solutionField] = node.value; scheduleSave(); if (node.dataset.solutionField === "name") document.querySelector(".title-block p").textContent = `${node.value} · ${solution.stage}`; }
  if (node.dataset.solutionNested) { const [group, fieldName] = node.dataset.solutionNested.split("."); solution[group][fieldName] = node.value; scheduleSave(); }
  if (node.dataset.recordCollection && node.dataset.recordField && !node.multiple) { const item = record(node.dataset.recordCollection, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value; scheduleSave(); } }
  if (node.dataset.recordNumber) { const item = record(node.dataset.recordNumber, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value === "" ? null : Number(node.value); scheduleSave(); } }
  if (node.dataset.candidateScore && node.dataset.scoreField === "rationale") { const candidate = record("candidates", node.dataset.candidateScore); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.rationale = node.value; scheduleSave(); }
});

document.addEventListener("change", event => {
  const node = event.target;
  if (node.id === "solution-select") { if (dirty && !saveNow()) return; workspace.activeSolutionId = node.value; selectedCandidateId = selectedViewId = selectedElementId = ""; saveNow(); render(); }
  if (node.id === "workspace-import") importWorkspaceFile(node.files?.[0]);
  if (node.dataset.solutionField) { const solution = activeSolution(); solution[node.dataset.solutionField] = node.value; scheduleSave(); if (node.tagName === "SELECT") render(); }
  if (node.dataset.recordCollection && node.dataset.recordField && node.tagName === "SELECT" && !node.multiple) { const item = record(node.dataset.recordCollection, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value; scheduleSave(); render(); } }
  if (node.dataset.recordLinksCollection && node.dataset.recordLinksField) { const item = record(node.dataset.recordLinksCollection, node.dataset.recordId); if (item) { item[node.dataset.recordLinksField] = [...node.selectedOptions].map(option => option.value); scheduleSave(); } }
  if (node.dataset.requirementElements) { const item = record("requirements", node.dataset.requirementElements); item.linkedElementIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.requirementHotButtons) { const item = record("requirements", node.dataset.requirementHotButtons); item.linkedHotButtonIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.winThemeHotButtons) { const item = record("winThemes", node.dataset.winThemeHotButtons); item.linkedHotButtonIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.winThemeEvidence) { const item = record("winThemes", node.dataset.winThemeEvidence); item.sourceEvidenceIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.candidateScore && node.dataset.scoreField === "value") { const candidate = record("candidates", node.dataset.candidateScore); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.value = node.value === "" ? null : Number(node.value); scheduleSave(); render(); }
  if (node.dataset.scoreEvidence) { const candidate = record("candidates", node.dataset.scoreEvidence); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.evidenceIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
});

window.addEventListener("hashchange", () => { route = readRoute(); document.querySelector("#sidebar")?.classList.remove("open"); render(); document.querySelector("#workspace")?.focus(); });
window.addEventListener("storage", event => { if (event.key === STORAGE_KEY) toast("This workspace changed in another tab. Export your work, then reload before continuing.", "error"); });
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.querySelector("#modal-root .modal")) { event.preventDefault(); closeModal(); return; }
  trapModalFocus(event);
});

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(error => console.warn("Offline shell registration failed.", error));
render();
if (initialWorkspaceNeedsSave) saveNow();
