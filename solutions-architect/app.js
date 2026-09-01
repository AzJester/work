import {
  WORKSPACE_SCHEMA,
  STORAGE_KEY,
  STAGES,
  MISSION_SEGMENTS,
  EVIDENCE_SOURCE_TYPES,
  ELEMENT_TYPES,
  INTERFACE_TYPES,
  VIEW_TEMPLATES,
  escapeHtml,
  safeHttpUrl,
  formatLocalDate,
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
} from "./engine.js?v=13";
import {
  CAPTURE_TARGETS,
  captureStorageKey,
  createCaptureInbox,
  createCaptureItem,
  createCaptureProvenance,
  materializeCaptureItems,
  validateCaptureInbox
} from "./capture.js?v=13";
import {
  MAX_SOURCE_FILE_BYTES,
  SOURCE_FILE_ACCEPT,
  extractLocalSource
} from "./ingestion.js?v=13";
import { buildDecisionPackagePdf } from "./export-pdf.js?v=13";
import {
  DOCX_MIME_TYPE,
  buildDecisionPackageDocx,
  decisionPackageDocxFilename
} from "./export-docx.js?v=13";
import {
  DECISION_WORKBOOK_MIME,
  decisionWorkbookFilename,
  writeDecisionWorkbook
} from "./export-xlsx.js?v=13";
import {
  KNOWLEDGE_BASE_STORAGE_KEY,
  KNOWLEDGE_LIFECYCLE_STATUSES,
  KNOWLEDGE_OFFERING_TYPES,
  MAX_KNOWLEDGE_IMPORT_BYTES,
  createKnowledgeBase,
  createKnowledgeItem,
  archiveKnowledgeItem,
  restoreKnowledgeItem,
  deleteArchivedKnowledgeItem,
  materializeKnowledgeItem,
  refreshCandidateFromKnowledge,
  updateKnowledgeItem,
  validateKnowledgeBase
} from "./knowledge-base.js?v=13";
import {
  KNOWLEDGE_IMPORT_COLUMNS,
  KNOWLEDGE_IMPORT_FILE_ACCEPT,
  buildKnowledgeCsvTemplate,
  buildKnowledgeImportPlan,
  normalizeKnowledgeImportRows,
  parseKnowledgeCsv,
  parseKnowledgeWorkbook
} from "./knowledge-import.js?v=13";

const ROUTES = new Set(["dashboard", "discover", "shape", "assess", "architect", "prove", "propose", "transition", "knowledge-base", "decision-package"]);
const DECISION_EXPORT_ACTIONS = new Set(["export-markdown", "export-html", "export-docx", "export-xlsx", "export-pdf"]);
const SUPABASE_URL = "https://hqqwlkmggwgaoiyzgrhy.supabase.co";
const SUPABASE_KEY = "sb_publishable_HmSmGVio0b9HQCBocjeuYA_eleacS3u";
const THEME_KEY = "solution_architect_theme_v1";
const THEME_VALUES = new Set(["system", "light", "dark"]);
const CAPTURE_TARGET_LABELS = Object.freeze({
  evidence: "Evidence",
  hotButton: "Customer hot button",
  requirement: "Requirement",
  winTheme: "Win theme",
  assumption: "Assumption",
  risk: "Risk",
  decision: "Decision",
  ignore: "Ignore"
});
const MAX_INTAKE_FILES = 10;
const MAX_INTAKE_BYTES = 25_000_000;
const MAX_MEETING_TEXT_CHARS = 200_000;
const MAX_MEETING_EXCERPT_CHARS = 6_000;
const MAX_MEETING_EXCERPTS = 20;
const EVIDENCE_LINK_TARGETS = new Set(["requirement", "winTheme", "decision"]);
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const app = document.querySelector("#app");
let themePreference = loadThemePreference();
applyTheme(themePreference);
let initialWorkspaceNeedsSave = false;
let initialKnowledgeBaseNeedsSave = false;
let knowledgeBaseLoadError = "";
let workspace = loadWorkspace();
let knowledgeBase = loadKnowledgeBase();
let captureInbox = loadCaptureInbox(workspace.activeSolutionId);
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
let ingestionSession = [];
let ingestionAcknowledged = false;
let ingestionGeneration = 0;
let ingestionProcessing = false;
let ingestionAbortController = null;
let meetingSession = null;
let knowledgeFilters = { search: "", type: "", status: "active", segment: "" };
let knowledgeImportSession = null;
let knowledgeImportGeneration = 0;

function h(value) { return escapeHtml(value); }
function activeSolution() { return workspace.solutions.find(item => item.id === workspace.activeSolutionId) || workspace.solutions[0]; }
function readRoute() { const value = location.hash.replace(/^#\/?/, ""); return ROUTES.has(value) ? value : "dashboard"; }
function stageRoute(stage) { return stage.toLowerCase(); }
function option(value, label, current) { return `<option value="${h(value)}" ${value === current ? "selected" : ""}>${h(label)}</option>`; }
function record(collection, id) { return workspace[collection]?.find(item => item.id === id); }
function captureTitleMax(target) {
  if (["evidence", "hotButton", "winTheme"].includes(target)) return 280;
  if (target === "assumption") return 3_000;
  if (target === "ignore") return 1_000;
  return 2_000;
}
function companionEvidenceTitle(title) {
  const suffix = " — source excerpt";
  const clean = String(title || "Source").trim();
  return `${clean.slice(0, 280 - suffix.length)}${suffix}`;
}

function loadThemePreference() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEME_VALUES.has(value) ? value : "light";
  } catch {
    return "light";
  }
}

function resolveTheme(preference = themePreference) {
  return preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference;
}

function applyTheme(preference = themePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b1119" : "#eef3f6");
  const toggle = document.querySelector("#theme-toggle");
  if (toggle) {
    toggle.setAttribute("aria-checked", String(resolved === "dark"));
    toggle.title = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
  const systemThemeAction = document.querySelector('[data-action="use-system-theme"]');
  if (systemThemeAction) systemThemeAction.setAttribute("aria-pressed", String(preference === "system"));
  return resolved;
}

function setThemePreference(value) {
  if (!THEME_VALUES.has(value)) return;
  themePreference = value;
  let persisted = true;
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    persisted = false;
  }
  applyTheme(value);
  if (!persisted) toast("Theme changed for this session, but the preference could not be saved.", "error");
}

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

function loadCaptureInbox(solutionId) {
  const fresh = () => createCaptureInbox(solutionId);
  try {
    const raw = localStorage.getItem(captureStorageKey(solutionId));
    if (!raw) return fresh();
    const candidate = JSON.parse(raw);
    const result = validateCaptureInbox(candidate, { workspace });
    if (!result.valid) throw new Error(result.errors[0]);
    return candidate;
  } catch (error) {
    console.warn("Could not load the saved capture inbox.", error);
    return fresh();
  }
}

function persistCaptureInbox(candidate, { quiet = false } = {}) {
  const result = validateCaptureInbox(candidate, { workspace });
  if (!result.valid) {
    if (!quiet) toast(`Capture inbox was not saved: ${result.errors[0]}`, "error");
    return false;
  }
  try {
    localStorage.setItem(captureStorageKey(candidate.solutionId), JSON.stringify(candidate));
    captureInbox = candidate;
    return true;
  } catch {
    if (!quiet) toast("Capture inbox could not be saved. Browser storage may be unavailable or full.", "error");
    return false;
  }
}

function pendingCaptureCount() {
  return captureInbox.items.filter(item => item.status === "pending").length;
}

function captureTargetOptions(current) {
  return CAPTURE_TARGETS.map(value => option(value, CAPTURE_TARGET_LABELS[value], current)).join("");
}

function captureTitle(item) {
  if (item.target === "assumption") return item.fields.statement;
  if (item.target === "ignore") return item.fields.reason;
  return item.fields.title || "";
}

function captureDetail(item) {
  return ({
    hotButton: item.fields.detail,
    evidence: item.fields.notes,
    requirement: item.excerpt,
    winTheme: item.fields.customerValue,
    assumption: item.excerpt,
    risk: item.excerpt,
    decision: item.fields.rationale,
    ignore: item.excerpt
  })[item.target] || item.excerpt || "";
}

function fieldsForCapture(target, title, detail, source = "") {
  const cleanTitle = String(title || "").trim();
  const cleanDetail = String(detail || "").trim();
  if (target === "hotButton") return { title: cleanTitle, detail: cleanDetail, source: String(source || "").trim().slice(0, 300) };
  if (target === "evidence") return { title: cleanTitle, source: String(source || "").trim().slice(0, 500), url: "", notes: cleanDetail, confidence: "Low" };
  if (target === "requirement") return { title: cleanTitle, type: "Functional", priority: "Must", acceptanceMethod: "", linkedHotButtonIds: [] };
  if (target === "winTheme") return { title: cleanTitle, customerValue: cleanDetail, linkedHotButtonIds: [], sourceEvidenceIds: [] };
  if (target === "assumption") return { statement: cleanTitle || cleanDetail, owner: "", validationPlan: "" };
  if (target === "risk") return { title: cleanTitle, likelihood: "Unknown", impact: "Unknown", owner: "", mitigation: "" };
  if (target === "decision") return { title: cleanTitle, rationale: cleanDetail, evidenceIds: [], owner: "", date: "" };
  return { reason: cleanTitle || "Not relevant to this solution" };
}

function createMeetingSession() {
  return {
    solutionId: workspace.activeSolutionId,
    title: "",
    sourceType: "Meeting transcript",
    meetingDate: "",
    participantsText: "",
    missionSegments: [...(activeSolution().missionSegments || [])],
    text: "",
    excerpts: [],
    acknowledged: false
  };
}

function clearMeetingSession() {
  if (meetingSession) {
    meetingSession.text = "";
    meetingSession.excerpts = [];
  }
  meetingSession = null;
}

function meetingParticipants(value) {
  return [...new Set(String(value || "")
    .split(/[\n,;]+/)
    .map(participant => participant.trim().slice(0, 200))
    .filter(Boolean))]
    .slice(0, 50);
}

function meetingLineLocator(text, start, end) {
  const first = text.slice(0, start).split("\n").length;
  const last = text.slice(0, Math.max(start, end - 1)).split("\n").length;
  return first === last ? `Line ${first}` : `Lines ${first}–${last}`;
}

function discardMeetingExcerpts(message = "The meeting source changed. Select the needed excerpts again before staging.") {
  if (!meetingSession?.excerpts.length) return false;
  meetingSession.excerpts = [];
  const list = document.querySelector("#meeting-intake-workflow .meeting-excerpts");
  if (list) list.innerHTML = `<div class="empty-state"><strong>No excerpts selected</strong><p>Highlight a bounded passage in the meeting text, then add it here.</p></div>`;
  const stage = document.querySelector("[data-meeting-stage]");
  if (stage) {
    stage.disabled = true;
    stage.textContent = "Stage selected excerpts for review";
  }
  toast(message, "error");
  return true;
}

function sourceLabel(provenance) {
  if (!provenance) return "Quick capture";
  const source = provenance.sourceTitle || provenance.sourceFileName || "Quick capture";
  if (!provenance.locator || provenance.locator === source) return source.slice(0, 500);
  const combined = `${source} · ${provenance.locator}`;
  return combined.length <= 500 ? combined : provenance.locator.slice(0, 500);
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

function clearTransientModalSessions({ preserve = "" } = {}) {
  const root = document.querySelector("#modal-root");
  if (preserve !== "file" && root?.querySelector("#file-intake-workflow")) clearIngestionSession();
  if (preserve !== "meeting" && root?.querySelector("#meeting-intake-workflow")) clearMeetingSession();
}

function openModal(title, body, { wide = false, transient = "" } = {}) {
  const root = document.querySelector("#modal-root");
  clearTransientModalSessions({ preserve: transient });
  if (!root.querySelector(".modal")) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${h(title)}</h2><button class="icon-button" type="button" data-close-modal aria-label="Close dialog">×</button></header><div class="modal-body">${body}</div></section></div>`;
  const initialFocus = root.querySelector("[autofocus], input:not([type='hidden']), textarea, select, button:not([data-close-modal])")
    || root.querySelector("[data-close-modal]");
  initialFocus?.focus();
}

function closeModal() {
  const root = document.querySelector("#modal-root");
  clearTransientModalSessions();
  if (root) root.innerHTML = "";
  aiPreview = null;
  aiResponse = null;
  knowledgeImportSession = null;
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

function trapSidebarFocus(event) {
  if (event.key !== "Tab" || document.querySelector("#modal-root .modal")) return;
  const sidebar = document.querySelector("#sidebar.open");
  if (!sidebar) return;
  const focusable = [...sidebar.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter(node => node instanceof HTMLElement && node.getClientRects().length > 0);
  if (!focusable.length) { event.preventDefault(); sidebar.focus(); return; }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function field(label, value, attributes, { multiline = false, hint = "", rows = 4 } = {}) {
  const control = multiline
    ? `<textarea ${attributes} rows="${Math.max(2, Math.min(12, Number(rows) || 4))}">${h(value)}</textarea>`
    : `<input ${attributes} value="${h(value)}">`;
  return `<label class="field"><span>${h(label)}</span>${control}${hint ? `<small>${h(hint)}</small>` : ""}</label>`;
}

function setSidebarOpen(open) {
  const sidebar = document.querySelector("#sidebar");
  const trigger = document.querySelector('[data-action="toggle-nav"]');
  const workbench = document.querySelector("#workspace");
  if (!sidebar || !trigger) return;
  sidebar.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", String(open));
  trigger.setAttribute("aria-label", open ? "Close workspace navigation" : "Open workspace navigation");
  if (workbench) {
    if (open) workbench.setAttribute("inert", "");
    else workbench.removeAttribute("inert");
  }
}

function selectField(label, attributes, options, hint = "") {
  return `<label class="field"><span>${h(label)}</span><select ${attributes}>${options}</select>${hint ? `<small>${h(hint)}</small>` : ""}</label>`;
}

function emptyState(title, copy, action = "") {
  return `<div class="empty-state"><strong>${h(title)}</strong><p>${h(copy)}</p>${action}</div>`;
}

function fitAutoGrowTextarea(node) {
  if (!(node instanceof HTMLTextAreaElement) || !node.matches("textarea[data-auto-grow]")) return;
  node.style.height = "auto";
  const styles = getComputedStyle(node);
  const borderHeight = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
  const minimum = Number.parseFloat(styles.minHeight) || 0;
  const maximum = Number.parseFloat(styles.maxHeight);
  const desired = Math.max(minimum, node.scrollHeight + borderHeight);
  const height = Number.isFinite(maximum) ? Math.min(desired, maximum) : desired;
  node.style.height = `${Math.ceil(height)}px`;
  node.style.overflowY = desired > height + 1 ? "auto" : "hidden";
}

function fitAutoGrowTextareas(root = document) {
  root.querySelectorAll("textarea[data-auto-grow]").forEach(fitAutoGrowTextarea);
}

function syncRequirementRelationshipField(field) {
  if (!field) return;
  const options = [...field.querySelectorAll('input[type="checkbox"]')];
  const selected = options.filter(option => option.checked);
  const count = field.querySelector("[data-relationship-count]");
  const selection = field.querySelector("[data-relationship-selection]");
  if (count) count.textContent = `${selected.length} of ${options.length} linked`;
  if (!selection) return;
  selection.replaceChildren();
  if (!selected.length) {
    const empty = document.createElement("span");
    empty.className = "relationship-empty";
    empty.textContent = selection.dataset.emptyLabel || "No records linked";
    selection.append(empty);
    return;
  }
  for (const option of selected) {
    const chip = document.createElement("span");
    chip.className = "relationship-chip";
    chip.textContent = option.dataset.relationshipLabel || option.value;
    selection.append(chip);
  }
}

function render() {
  const solution = activeSolution();
  if (!solution) return;
  const resolvedTheme = resolveTheme(themePreference);
  const pendingCaptures = pendingCaptureCount();
  clearTransientModalSessions();
  const navItems = [
    ["dashboard", "00", "Command view"],
    ...STAGES.map((stage, index) => [stageRoute(stage), `0${index + 1}`, stage]),
    ["decision-package", "08", "Decision package"]
  ];
  const renderNavItem = ([value, number, label]) => `<a class="stage-link ${route === value ? "active" : ""}" href="#${value}" data-route="${value}" ${route === value ? 'aria-current="page"' : ""}><span class="number">${number}</span><span class="label">${h(label)}</span>${value === "dashboard" ? `<span class="count" aria-label="${collectObligations(workspace, solution.id).length} open obligations">${collectObligations(workspace, solution.id).length}</span>` : ""}</a>`;
  const navGroups = [
    ["Overview", [navItems[0]]],
    ["Lifecycle", navItems.slice(1, -1)],
    ["Reference", [["knowledge-base", "KB", "Knowledge base"]]],
    ["Output", [navItems.at(-1)]]
  ];
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar" aria-label="Solution workspace navigation">
        <div class="brand"><div class="brand-copy"><span class="brand-mark">SA Workbench</span><h1>Solution Architect</h1></div><div class="brand-controls"><button class="theme-toggle" id="theme-toggle" type="button" role="switch" aria-label="Dark theme" aria-checked="${resolvedTheme === "dark"}" data-action="toggle-theme" title="${resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}"><span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-thumb"></span></span></button><button class="mobile-menu" type="button" data-action="toggle-nav" aria-label="Open workspace navigation" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true">☰</span><span class="mobile-menu-label">Menu</span></button></div></div>
        <label class="solution-switcher"><small>Active solution</small><select id="solution-select" aria-label="Active solution">${workspace.solutions.map(item => option(item.id, item.name, solution.id)).join("")}</select></label>
        <nav class="stage-nav" id="lifecycle-navigation" aria-label="Solution workspace">${navGroups.map(([group, items]) => `<section class="nav-group" aria-label="${group}"><p class="nav-group-label">${group}</p>${items.map(renderNavItem).join("")}</section>`).join("")}</nav>
        <div class="sidebar-utilities">
          <div class="sidebar-actions"><button class="text-button" type="button" data-action="open-guide">Guide</button><button class="text-button" type="button" data-action="open-recovery">Recovery</button></div>
          <p class="sidebar-foot">Local workspace · No cloud project storage</p>
        </div>
      </aside>
      <main class="workbench" id="workspace" tabindex="-1">
        <header class="topbar">
          <div class="title-block"><h2>${h(routeTitle(route))}</h2><p>${h(routeSubtitle(route, solution))}</p></div>
          <span id="save-state" class="save-state" data-tone="${dirty ? "warn" : "ok"}">${dirty ? "Unsaved changes" : "Saved locally"}</span>
          <div class="top-actions" role="group" aria-label="Workspace actions">
            <button class="top-action capture-button" type="button" data-action="quick-capture" aria-keyshortcuts="Alt+Q" aria-haspopup="dialog">
              <span class="top-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14"/></svg></span><span class="top-action-label">Capture</span>
            </button>
            <button class="top-action inbox-button" type="button" data-action="open-capture-inbox" aria-label="Open capture inbox, ${pendingCaptures} pending" aria-haspopup="dialog">
              <span class="top-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.5 7.5h15l1.5 11h-18l1.5-11Z"/><path d="M3.8 14h4.6l1.5 2h4.2l1.5-2h4.6"/></svg></span><span class="top-action-label">Inbox</span><span class="inbox-count" aria-hidden="true" ${pendingCaptures ? "" : "hidden"}>${pendingCaptures}</span>
            </button>
            <button class="top-action tools-button" type="button" data-action="open-tools" aria-label="Workspace tools" aria-haspopup="dialog" title="Workspace tools">
              <span class="top-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 7h7M15 7h5M4 17h3M11 17h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg></span><span class="top-action-label tools-label">Tools</span>
            </button>
          </div>
        </header>
        <aside class="development-banner" aria-label="Development status"><strong>Under development</strong><span>This workbench is still being actively built and refined.</span></aside>
        <div class="data-boundary" role="note"><strong>Data boundary</strong><span class="boundary-short">Approved unclassified, non-CUI only. Browser storage is not an authorization boundary.</span><span class="boundary-detail">Approved unclassified, non-CUI information only. Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted content. Browser storage is not an authorization boundary. <a href="https://www.acquisition.gov/dfars/204.7302-policy." target="_blank" rel="noopener noreferrer">DFARS safeguarding policy context</a>.</span></div>
        <div class="content">${renderRoute(solution)}</div>
      </main>
    </div>
    <div id="modal-root"></div><div id="toast-region" class="toast-region" aria-live="polite"></div><input id="workspace-import" type="file" accept="application/json,.json" hidden><input id="knowledge-import" type="file" accept="application/json,.json" hidden><input id="knowledge-list-import" type="file" accept="${h(KNOWLEDGE_IMPORT_FILE_ACCEPT)}" hidden>`;
  bindDiagramInteractions();
  fitAutoGrowTextareas(app);
}

function routeTitle(value) {
  return ({ dashboard: "Command view", discover: "Discover the mission", shape: "Shape the need", assess: "Technology Assessment", architect: "Architect the solution", prove: "Prove and govern", propose: "Propose the approach", transition: "Transition to delivery", "knowledge-base": "Knowledge base", "decision-package": "Decision package" })[value] || "Solution Architect Workbench";
}

function routeSubtitle(value, solution) {
  if (value === "knowledge-base") return `Reusable local catalog · Add items to ${solution.name}`;
  return `${solution.name} · Solution status: ${solution.stage}`;
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
    "knowledge-base": renderKnowledgeBase,
    "decision-package": renderDecisionPackage
  })[route](solution);
}

function renderStageRail(current) {
  const currentIndex = Math.max(0, STAGES.indexOf(current));
  const previous = STAGES[currentIndex - 1];
  const next = STAGES[currentIndex + 1];
  return `<div class="stage-rail" aria-label="Lifecycle work lenses">${STAGES.map((stage, index) => `<a href="#${stageRoute(stage)}" class="stage-chip ${stage === current ? "current" : ""}" ${stage === current ? 'aria-current="step"' : ""}><span>0${index + 1}</span><strong>${h(stage)}</strong></a>`).join("")}</div><nav class="mobile-stage-nav" aria-label="Current lifecycle work lens">${previous ? `<a href="#${stageRoute(previous)}" aria-label="Previous work lens: ${h(previous)}">← ${h(previous)}</a>` : `<span aria-hidden="true"></span>`}<strong><span>0${currentIndex + 1}</span>${h(STAGES[currentIndex])}</strong>${next ? `<a href="#${stageRoute(next)}" aria-label="Next work lens: ${h(next)}">${h(next)} →</a>` : `<span aria-hidden="true"></span>`}</nav>`;
}

function renderDashboard(solution) {
  const readiness = buildReadiness(workspace, solution.id);
  const obligations = collectObligations(workspace, solution.id);
  const candidates = scoped(workspace, "candidates", solution.id);
  const winThemes = scoped(workspace, "winThemes", solution.id).filter(item => item.status !== "Retired");
  const views = scoped(workspace, "architectureViews", solution.id);
  const risks = scoped(workspace, "risks", solution.id).filter(item => item.status !== "Closed");
  return `${renderStageRail(solution.stage)}<div class="dashboard-grid"><div>
    <section class="panel" aria-labelledby="readiness-title"><div class="panel-head"><div><p class="section-kicker">Decision coverage</p><h3 id="readiness-title">Workspace coverage</h3><p>Record completeness for decision support—not approval, certification, operational suitability, or authority to operate.</p></div><span class="metric">${readiness.overall}%</span></div>
      <div class="readiness"><article><small>Traceability</small><strong>${readiness.traceability}%</strong><p>Source, acceptance, architecture</p></article><article><small>Evidence</small><strong>${readiness.evidence}%</strong><p>Assessed claims with support</p></article><article><small>Element connectivity</small><strong>${readiness.interfaces}%</strong><p>Architecture elements with an exchange</p></article><article><small>Transition</small><strong>${readiness.transition}%</strong><p>Owned, unblocked actions</p></article></div></section>
    <section class="panel obligations"><div class="panel-head"><div><p class="section-kicker">Unscheduled obligations</p><h3>Needs architect attention</h3><p>Gaps that can weaken the decision or delivery${obligations.length > 12 ? ` · Showing 12 of ${obligations.length}` : ""}</p></div><span class="metric">${Math.min(12, obligations.length)} / ${obligations.length}</span></div>
      ${obligations.length ? `<ul class="obligation-list">${obligations.slice(0, 12).map(item => `<li class="obligation"><span class="severity ${item.severity}" aria-hidden="true"></span><div><strong>${h(item.message)}</strong><span>${h(item.severity)} priority · ${h(item.stage)} · ${h(item.kind.replaceAll("-", " "))}</span></div><a href="#${stageRoute(item.stage)}">Resolve →</a></li>`).join("")}</ul>` : emptyState("No deterministic gaps detected", "Use a formal review before treating the solution as complete.")}</section>
  </div><aside class="panel mission-card"><p class="eyebrow">${h(solution.classification)}</p><h3>${h(solution.name)}</h3><p>${h(solution.description || solution.mission.problem || "Define the mission problem and decision this solution must support.")}</p><div class="tags">${(solution.missionSegments || []).map(segment => `<span class="tag mission-segment-tag">${h(segment)}</span>`).join("")}<span class="tag">${h(solution.domain)}</span><span class="tag">${h(solution.stage)}</span><span class="tag">${h(solution.status)}</span></div><dl class="mini-list"><div><dt>Decision</dt><dd>${h(solution.decision || "Not defined")}</dd></div><div><dt>Candidates</dt><dd>${candidates.length}</dd></div><div><dt>Win themes</dt><dd>${winThemes.length}</dd></div><div><dt>Open risks</dt><dd>${risks.length}</dd></div><div><dt>Architecture views</dt><dd>${views.length}</dd></div></dl><button class="button block" type="button" data-route-button="discover">Open solution brief</button></aside></div>`;
}

function renderDiscover(solution) {
  const stakeholders = scoped(workspace, "stakeholders", solution.id);
  const hotButtons = scoped(workspace, "hotButtons", solution.id);
  const outcomes = scoped(workspace, "outcomes", solution.id);
  const measures = scoped(workspace, "measures", solution.id);
  return `${renderStageRail("Discover")}<div class="page-grid"><section class="panel form-panel"><div class="panel-head"><div><p class="section-kicker">Mission framing</p><h3>Define the decision and operational problem</h3><p>Start with mission effect and constraints before selecting technology.</p></div></div><div class="form-grid">
    ${field("Solution name", solution.name, `data-solution-field="name" maxlength="180"`)}
    ${field("Customer / mission partner", solution.customer, `data-solution-field="customer" maxlength="180"`)}
    ${selectField("Current working stage", `data-solution-field="stage"`, STAGES.map(item => option(item, item, solution.stage)).join(""), "Stages are work lenses, not calendar gates; revisit them as evidence changes.")}
    ${field("Domain", solution.domain, `data-solution-field="domain" maxlength="180"`)}
    <fieldset class="mission-segments span-2"><legend>Company mission segment(s)</legend><p>Select every segment this solution supports. These selections carry into the decision package and reviewed AI payload.</p><div class="mission-segment-grid">${MISSION_SEGMENTS.map(segment => `<label class="mission-segment-option"><input type="checkbox" value="${h(segment.name)}" data-mission-segment ${solution.missionSegments?.includes(segment.name) ? "checked" : ""}><span><strong>${h(segment.name)}</strong><small>${h(segment.description)}</small></span></label>`).join("")}</div></fieldset>
    <div class="span-2">${field("Decision to support", solution.decision, `data-solution-field="decision" maxlength="1200"`, { multiline: true, hint: "Write the specific choice, approval, or commitment this package must support." })}</div>
    <div class="span-2">${field("Mission problem", solution.mission.problem, `data-solution-nested="mission.problem" maxlength="5000"`, { multiline: true, rows: 6 })}</div>
    <div class="span-2">${field("Operational context", solution.mission.operationalContext, `data-solution-nested="mission.operationalContext" maxlength="5000"`, { multiline: true, rows: 6 })}</div>
    ${field("Current state", solution.mission.currentState, `data-solution-nested="mission.currentState" maxlength="4000"`, { multiline: true })}
    ${field("Desired state", solution.mission.desiredState, `data-solution-nested="mission.desiredState" maxlength="4000"`, { multiline: true })}
    <div class="span-2">${field("Constraints and non-negotiables", solution.mission.constraints, `data-solution-nested="mission.constraints" maxlength="5000"`, { multiline: true, rows: 6 })}</div>
  </div></section>
  <aside class="stack"><section class="panel compact hot-button-panel"><div class="panel-head"><div><h3>Customer hot buttons</h3><p>Capture customer signals without silently turning them into requirements.</p></div><div class="panel-head-actions hot-button-actions"><button class="small-button" type="button" data-action="ingest-hot-buttons">Ingest list</button><button class="small-button" type="button" data-add="hotButtons">Add signal</button></div></div>${hotButtons.length ? hotButtons.map(item => hotButtonCard(item)).join("") : emptyState("No customer hot buttons", "Paste or add priorities, concerns, sensitivities, and decision drivers with their source and confidence.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Stakeholders</h3><p>Mission users, authorities, delivery owners, and affected partners.</p></div><button class="small-button" type="button" data-add="stakeholders">＋ Add</button></div>${stakeholders.length ? stakeholders.map(item => recordCard("stakeholders", item, ["name", "role", "concern"])).join("") : emptyState("No stakeholders", "Add the people who define, build, authorize, operate, or sustain the solution.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Operational outcomes</h3><p>Observable mission effects with verification methods.</p></div><button class="small-button" type="button" data-add="outcomes">＋ Add</button></div>${outcomes.length ? outcomes.map(item => recordCard("outcomes", item, ["title", "verificationMethod"])).join("") : emptyState("No outcomes", "Define what changes for the mission and how it will be demonstrated.")}</section>
  <section class="panel compact"><div class="panel-head"><div><h3>Measures</h3><p>Decision-relevant measures of effectiveness and performance.</p></div><button class="small-button" type="button" data-add="measures">＋ Add</button></div>${measures.length ? measures.map(item => recordCard("measures", item, ["name", "target", "method"])).join("") : emptyState("No measures", "Add the measures that will distinguish an acceptable solution.")}</section></aside></div>`;
}

function recordCard(collection, item, fields) {
  const multilineFields = new Set(["concern", "verificationMethod", "method"]);
  return `<article class="record-card" data-record-card="${h(item.id)}"><button class="delete-record" type="button" data-delete="${h(collection)}" data-id="${h(item.id)}" aria-label="Delete record">×</button>${fields.map((name, index) => `<label><span>${h(name.replace(/([A-Z])/g, " $1").replace(/^./, value => value.toUpperCase()))}</span>${multilineFields.has(name) || (index === fields.length - 1 && fields.length < 3) ? `<textarea rows="2" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(name)}">${h(item[name])}</textarea>` : `<input value="${h(item[name])}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(name)}">`}</label>`).join("")}</article>`;
}

function hotButtonCard(item) {
  return `<article class="record-card hot-button-card"><div class="hot-button-card-heading"><label class="hot-button-title"><span>Customer signal</span><textarea rows="2" maxlength="280" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="title">${h(item.title)}</textarea></label><button class="delete-record" type="button" data-delete="hotButtons" data-id="${h(item.id)}" aria-label="Delete customer hot button">×</button></div><label class="hot-button-source"><span>Source</span><input value="${h(item.source)}" maxlength="300" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="source"></label><label><span>Confidence</span><select data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="confidence">${["Unverified", "Low", "Medium", "High"].map(value => option(value, value, item.confidence)).join("")}</select></label><label><span>Validation</span><select data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="status">${["Captured", "Validated", "Retired"].map(value => option(value, value, item.status)).join("")}</select></label><label class="hot-button-detail"><span>Why it matters / exact context</span><textarea rows="3" maxlength="2000" data-record-collection="hotButtons" data-record-id="${h(item.id)}" data-record-field="detail">${h(item.detail)}</textarea></label></article>`;
}

function evidenceCard(item) {
  const hasMeetingMetadata = ["Meeting transcript", "Meeting summary"].includes(item.sourceType);
  const meetingMetadata = hasMeetingMetadata ? `<dl class="evidence-meeting-meta">
    <div><dt>Participants</dt><dd>${h((item.participants || []).join(", ") || "Not recorded")}</dd></div>
    <div class="span-2"><dt>Mission segments</dt><dd class="evidence-segment-tags">${(item.missionSegments || []).length ? item.missionSegments.map(segment => `<span>${h(segment)}</span>`).join("") : "Not tagged"}</dd></div>
  </dl>` : "";
  return `<article class="evidence-card"><button class="delete-record" type="button" data-delete="evidence" data-id="${h(item.id)}" aria-label="Delete evidence">×</button><input class="card-title-input" value="${h(item.title)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="title"><div class="evidence-source-fields"><label><span>Source type</span><select data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="sourceType">${EVIDENCE_SOURCE_TYPES.map(value => option(value, value, item.sourceType || "Other")).join("")}</select></label><label><span>Source date</span><input type="date" value="${h(item.meetingDate || "")}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="meetingDate"></label></div>${meetingMetadata}<label><span>Source / citation</span><input value="${h(item.source)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="source"></label><label><span>Reference URL</span><input type="url" value="${h(item.url)}" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="url"></label><label><span>Confidence</span><select data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="confidence">${["Unknown", "High", "Medium", "Low", "Conflicting"].map(value => option(value, value, item.confidence)).join("")}</select></label><label><span>Notes</span><textarea rows="3" data-record-collection="evidence" data-record-id="${h(item.id)}" data-record-field="notes">${h(item.notes)}</textarea></label></article>`;
}

function requirementRelationshipField({ title, action, requirement, items, selectedIds, attribute, emptyText, labelFor }) {
  const selectedSet = new Set(selectedIds || []);
  const entries = items.map(item => ({ item, label: String(labelFor(item) || "Untitled link").trim() || "Untitled link" }));
  const selected = entries.filter(({ item }) => selectedSet.has(item.id));
  const context = String(requirement.title || "Untitled requirement").trim() || "Untitled requirement";
  const selectedMarkup = selected.length
    ? selected.map(({ label }) => `<span class="relationship-chip">${h(label)}</span>`).join("")
    : `<span class="relationship-empty">${h(emptyText)}</span>`;
  const optionsMarkup = entries.length
    ? entries.map(({ item, label }) => `<label class="relationship-option"><input type="checkbox" value="${h(item.id)}" ${attribute}="${h(requirement.id)}" data-relationship-label="${h(label)}" ${selectedSet.has(item.id) ? "checked" : ""}><span>${h(label)}</span></label>`).join("")
    : `<p class="relationship-options-empty">No choices are available in this solution yet.</p>`;
  return `<fieldset class="relationship-field" aria-label="${h(`${title} for ${context}`)}" data-relationship-field>
    <legend><span>${h(title)}</span><small data-relationship-count>${selected.length} of ${entries.length} linked</small></legend>
    <div class="relationship-selection" data-relationship-selection data-empty-label="${h(emptyText)}" aria-live="polite">${selectedMarkup}</div>
    <details class="relationship-picker"><summary>${h(action)}</summary><div class="relationship-options">${optionsMarkup}</div></details>
  </fieldset>`;
}

function requirementCard(item, index, evidence, hotButtons, elements) {
  const number = String(index + 1).padStart(2, "0");
  const title = String(item.title || "Untitled requirement").trim() || "Untitled requirement";
  const context = `Requirement ${index + 1}: ${title}`;
  const source = evidence.find(record => record.id === item.sourceEvidenceId);
  const sourcePreviewId = `requirement-source-${item.id}`;
  const sourceTitle = source?.title || "No source evidence linked";
  const sourceMeta = source
    ? [source.sourceType || "Evidence", source.meetingDate || "", `${source.confidence || "Unknown"} confidence`].filter(Boolean).join(" · ")
    : "Choose an authoritative source or keep the requirement explicitly untraced.";
  return `<article class="requirement-card" data-requirement-card="${h(item.id)}" aria-label="${h(context)}">
    <header class="requirement-card-header"><span class="requirement-number">Requirement ${number}</span><button class="small-button requirement-delete" type="button" data-delete="requirements" data-id="${h(item.id)}" aria-label="Delete ${h(context)}"><span aria-hidden="true">×</span><span>Delete</span></button></header>
    <div class="requirement-card-body">
      <label class="requirement-statement"><span>Requirement statement</span><textarea rows="3" maxlength="2000" data-auto-grow aria-label="${h(context)} statement" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="title">${h(item.title)}</textarea><small>Use one clear, testable statement.</small></label>
      <div class="requirement-meta-grid">
        <label><span>Status</span><select aria-label="${h(context)} status" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="status">${["Draft", "Validated", "Baselined", "Retired"].map(value => option(value, value, item.status)).join("")}</select></label>
        <label><span>Type</span><select aria-label="${h(context)} type" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="type">${["Functional", "Performance", "Interface", "Data", "Cyber", "Safety", "Resilience", "Physical", "Sustainment"].map(value => option(value, value, item.type)).join("")}</select></label>
        <label><span>Priority</span><select aria-label="${h(context)} priority" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="priority">${["Must", "Should", "Could"].map(value => option(value, value, item.priority)).join("")}</select></label>
      </div>
      <label class="requirement-source"><span>Source evidence</span><select aria-label="${h(context)} source evidence" aria-describedby="${h(sourcePreviewId)}" title="${h(sourceTitle)}" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="sourceEvidenceId"><option value="">Untraced — select source evidence</option>${evidence.map(record => option(record.id, record.title, item.sourceEvidenceId)).join("")}</select><span class="selected-source-preview ${source ? "" : "empty"}" id="${h(sourcePreviewId)}"><span>Selected source</span><strong>${h(sourceTitle)}</strong><small>${h(sourceMeta)}</small></span></label>
      <label class="requirement-acceptance"><span>Acceptance method</span><textarea rows="3" maxlength="2000" data-auto-grow aria-label="${h(context)} acceptance method" data-record-collection="requirements" data-record-id="${h(item.id)}" data-record-field="acceptanceMethod">${h(item.acceptanceMethod)}</textarea><small>State the verification activity and measurable pass/fail result.</small></label>
      ${requirementRelationshipField({ title: "Customer drivers", action: "Choose customer drivers", requirement: item, items: hotButtons, selectedIds: item.linkedHotButtonIds, attribute: "data-requirement-driver", emptyText: "No customer drivers linked", labelFor: driver => driver.title })}
      ${requirementRelationshipField({ title: "Architecture trace", action: "Choose architecture elements", requirement: item, items: elements, selectedIds: item.linkedElementIds, attribute: "data-requirement-element", emptyText: "No architecture elements linked", labelFor: element => `${element.name} · ${element.type}` })}
    </div>
  </article>`;
}

function renderShape(solution) {
  const requirements = scoped(workspace, "requirements", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  const hotButtons = scoped(workspace, "hotButtons", solution.id).filter(item => item.status !== "Retired");
  const elements = scoped(workspace, "elements", solution.id);
  return `${renderStageRail("Shape")}<div class="section-toolbar"><div><p class="section-kicker">Traceability</p><h3>Requirements and evidence</h3><p>Bind every requirement to its source, acceptance logic, and architecture realization.</p></div><div><button class="button secondary" type="button" data-add="evidence">＋ Evidence</button><button class="button primary" type="button" data-add="requirements">＋ Requirement</button></div></div>
  <section class="panel requirements-panel" aria-label="Requirements editor"><div class="requirements-list">${requirements.map((item, index) => requirementCard(item, index, evidence, hotButtons, elements)).join("")}</div>${!requirements.length ? emptyState("No requirements", "Add requirements only when they can be traced to a mission need or authoritative source.") : ""}</section>
  <section class="panel evidence-panel"><div class="panel-head"><div><h3>Evidence library</h3><p>References and approved excerpts only; v1 does not store binary attachments or full meeting transcripts.</p></div></div><div class="card-grid">${evidence.map(evidenceCard).join("")}</div>${!evidence.length ? emptyState("No evidence", "Record authoritative sources, test observations, customer statements, and documented constraints.") : ""}</section>`;
}

function catalogCandidateNotice(candidate) {
  const source = candidate.catalogSource;
  if (!source) return "";
  const catalogItem = knowledgeBase.items.find(item => item.id === source.itemId);
  const archived = catalogItem?.lifecycleStatus === "Retired";
  const updateAvailable = catalogItem && !archived && catalogItem.revision > source.revision;
  const message = archived
    ? `Knowledge Base copy · Source offering is archived`
    : updateAvailable
    ? `Update available · Solution copy revision ${source.revision} · Catalog revision ${catalogItem.revision}`
    : catalogItem
      ? `Knowledge Base copy · Catalog revision ${source.revision}`
      : `Knowledge Base copy · Source item is not present in this browser`;
  const detail = archived
    ? "This independent solution copy remains usable, but the catalog offering cannot be copied or refreshed until it is restored."
    : updateAvailable
    ? "Review the newer offering facts in the Knowledge Base. Refresh is explicit and preserves this solution’s status, scores, rationales, and evidence links."
    : catalogItem
      ? "This candidate is an independent solution copy. Manage offering facts and future revisions in the Knowledge Base."
      : "This portable candidate remains usable; import the separate Knowledge Base backup to restore catalog management here.";
  return `<div class="candidate-provenance ${updateAvailable ? "update-available" : ""} ${archived ? "source-archived" : ""}"><div><strong>${h(message)}</strong><p>${h(detail)}</p></div><button class="button secondary" type="button" data-route-button="knowledge-base">${updateAvailable ? "Review update" : "Open Knowledge Base"}</button></div>`;
}

function renderAssess(solution) {
  const candidates = scoped(workspace, "candidates", solution.id);
  const criteria = scoped(workspace, "criteria", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  if (!selectedCandidateId || !candidates.some(item => item.id === selectedCandidateId)) selectedCandidateId = candidates[0]?.id || "";
  const selected = candidates.find(item => item.id === selectedCandidateId);
  const catalogNotice = selected ? catalogCandidateNotice(selected) : "";
  const results = candidates.map(item => ({ candidate: item, result: assessmentResult(workspace, solution.id, item.id) })).sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1));
  return `${renderStageRail("Assess")}<div class="section-toolbar"><div><p class="section-kicker">Technology Assessment</p><h3>Compare complete solution candidates</h3><p>Unknown remains unknown. Scores without rationale or evidence create visible obligations.</p></div><div><button class="button secondary" type="button" data-route-button="knowledge-base">Browse Knowledge Base</button><button class="button primary" type="button" data-add="candidates">＋ Candidate</button></div></div>
  <section class="readiness-key" aria-labelledby="readiness-key-title"><div class="readiness-key-heading"><p class="section-kicker">Key</p><h4 id="readiness-key-title">Readiness levels</h4><p>Use these optional fields only when the team has a defensible, dated basis. Leave them blank when readiness is unknown.</p></div><dl><div><dt>TRL</dt><dd><strong>Technology Readiness Level</strong><span>Technology maturity for its intended use · 1–9</span></dd></div><div><dt>MRL</dt><dd><strong>Manufacturing Readiness Level</strong><span>Manufacturing and production maturity · 1–10</span></dd></div><div><dt>IRL</dt><dd><strong>Integration Readiness Level</strong><span>Integration maturity between specified components · 0–9</span></dd></div></dl></section>
  <div class="assessment-layout"><section class="panel candidate-rank"><div class="panel-head"><div><h3>Provisional candidate comparison</h3><p>Order reflects entered scores only. Coverage and evidence support determine how much confidence to place in it.</p></div></div>${results.length ? results.map(({ candidate, result }, index) => { const unsupported = result.rows.filter(row => row.value !== null && (!row.rationale?.trim() || !row.evidenceIds?.length)).length; return `<button class="candidate-row ${candidate.id === selectedCandidateId ? "active" : ""}" type="button" data-candidate="${h(candidate.id)}" aria-pressed="${candidate.id === selectedCandidateId}"><span class="rank">${index + 1}</span><span><strong>${h(candidate.name)}</strong><small>${h(candidate.category)} · TRL ${h(candidate.trl ?? "—")} · summary IRL ${h(candidate.irl ?? "—")}</small></span><span class="score">${result.score === null ? "—" : result.score.toFixed(2)}<small>${Math.round(result.coverage * 100)}% assessed · ${Math.round(result.evidenceCoverage * 100)}% evidenced · ${unsupported} unsupported</small></span></button>`; }).join("") : emptyState("No candidates", "Add hardware, software, tools, vendors, platforms, or integrated mission-package alternatives.")}</section>
  <section class="panel assessment-detail">${selected ? `<div class="panel-head"><div><p class="section-kicker">Selected candidate</p><h3>${h(selected.name)}</h3><p>${h(selected.description || "No candidate description recorded.")}</p></div><button class="icon-button" type="button" data-delete="candidates" data-id="${h(selected.id)}" aria-label="Delete candidate">×</button></div>${catalogNotice}<div class="candidate-meta"><label><span>Name</span><input value="${h(selected.name)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="name"></label><label><span>Category</span><input value="${h(selected.category)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="category"></label><label><span>Status</span><select data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="status">${["Considering", "Shortlist", "Preferred", "Rejected", "Retired"].map(value => option(value, value, selected.status)).join("")}</select></label><label><span>Vendor / source</span><input value="${h(selected.vendor)}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="vendor"></label><label class="candidate-description"><span>Description</span><textarea rows="3" maxlength="3000" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="description">${h(selected.description)}</textarea></label><label class="candidate-readiness-basis"><span>Readiness basis / scope</span><textarea rows="3" maxlength="3000" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="readinessBasis">${h(selected.readinessBasis || "")}</textarea></label><label><span>Readiness as-of date</span><input type="date" value="${h(selected.readinessAsOf || "")}" data-record-collection="candidates" data-record-id="${h(selected.id)}" data-record-field="readinessAsOf"></label><label><span title="Technology Readiness Level">TRL</span><input type="number" min="1" max="9" value="${h(selected.trl ?? "")}" aria-label="Technology Readiness Level (TRL)" aria-describedby="readiness-key-title" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="trl"></label><label><span title="Manufacturing Readiness Level">MRL</span><input type="number" min="1" max="10" value="${h(selected.mrl ?? "")}" aria-label="Manufacturing Readiness Level (MRL)" aria-describedby="readiness-key-title" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="mrl"></label><label><span title="Integration Readiness Level">Summary / limiting IRL</span><input type="number" min="0" max="9" value="${h(selected.irl ?? "")}" aria-label="Summary or limiting Integration Readiness Level (IRL)" aria-describedby="readiness-key-title" data-record-number="candidates" data-record-id="${h(selected.id)}" data-record-field="irl"></label></div>
  <div class="table-scroll"><table class="score-table editable-table"><thead><tr><th>Criterion</th><th>Weight</th><th>Score</th><th>Rationale</th><th>Evidence</th></tr></thead><tbody>${criteria.map(criterion => { const score = selected.scores?.find(item => item.criterionId === criterion.id) || { value: null, rationale: "", evidenceIds: [] }; return `<tr><td data-label="Criterion"><strong>${h(criterion.name)}</strong></td><td data-label="Weight"><input type="number" min="0" max="100" value="${h(criterion.weight)}" data-record-number="criteria" data-record-id="${h(criterion.id)}" data-record-field="weight" aria-label="${h(criterion.name)} weight"></td><td data-label="Score"><select aria-label="${h(criterion.name)} score" data-candidate-score="${h(selected.id)}" data-criterion="${h(criterion.id)}" data-score-field="value"><option value="">Unknown</option>${[0,1,2,3,4,5].map(value => option(String(value), `${value}`, score.value === null ? "" : String(score.value))).join("")}</select></td><td data-label="Rationale"><textarea rows="2" aria-label="${h(criterion.name)} rationale" data-candidate-score="${h(selected.id)}" data-criterion="${h(criterion.id)}" data-score-field="rationale">${h(score.rationale)}</textarea></td><td data-label="Evidence"><select multiple size="2" aria-label="${h(criterion.name)} evidence" data-score-evidence="${h(selected.id)}" data-criterion="${h(criterion.id)}">${evidence.map(item => `<option value="${h(item.id)}" ${score.evidenceIds?.includes(item.id) ? "selected" : ""}>${h(item.title)}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table></div>` : emptyState("Select or add a candidate", "Assess the whole candidate solution, including technical and business constraints.")}</section></div>`;
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
  ${view ? `<div class="diagram-layout"><section class="panel diagram-panel"><div class="diagram-tools"><label>View name <input value="${h(view.name)}" data-record-collection="architectureViews" data-record-id="${h(view.id)}" data-record-field="name"></label><span class="template-label">${h(VIEW_TEMPLATES.find(([value]) => value === view.template)?.[1] || view.template)}</span><button class="small-button" type="button" data-action="auto-layout" title="Arrange every element in a repeatable fitted layout">Auto-layout</button><button class="small-button" type="button" data-action="export-svg">SVG</button><button class="small-button" type="button" data-action="export-png">PNG</button><button class="icon-button" type="button" data-delete="architectureViews" data-id="${h(view.id)}" aria-label="Delete view">×</button></div><label class="view-description-field"><span>View purpose / decision supported</span><textarea rows="2" maxlength="2000" data-record-collection="architectureViews" data-record-id="${h(view.id)}" data-record-field="description">${h(view.description)}</textarea></label><div class="diagram-canvas" id="diagram-canvas" aria-label="Editable architecture diagram">${buildDiagramSvg(workspace, view.id)}</div><p class="diagram-help">The full view is fit to the available canvas. Drag elements to position them. Select an element and use arrow keys for 10-pixel movement; hold Shift for 1 pixel.</p></section>
    <aside class="panel inspector"><div class="panel-head"><div><h3>Inspector</h3><p>${selected ? "Edit the selected architecture element." : "Select an element in the view."}</p></div></div>${selected ? `<div class="inspector-form">${field("Name", selected.name, `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="name" maxlength="180"`)}${selectField("Element type", `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="type"`, ELEMENT_TYPES.map(value => option(value, value, selected.type)).join(""))}${field("Description", selected.description, `data-record-collection="elements" data-record-id="${h(selected.id)}" data-record-field="description" maxlength="2000"`, { multiline: true })}<button class="button danger block" type="button" data-delete="elements" data-id="${h(selected.id)}">Delete element</button></div>` : emptyState("Nothing selected", "Choose an element to edit its identity, type, and description.")}</aside></div>
    <details class="panel accessible-model"><summary>Accessible architecture data</summary><div class="table-scroll"><table><thead><tr><th>Element</th><th>Type</th><th>Description</th><th>Position</th></tr></thead><tbody>${elements.map(item => `<tr><td>${h(item.name)}</td><td>${h(item.type)}</td><td>${h(item.description)}</td><td>${item.x}, ${item.y}</td></tr>`).join("")}</tbody></table></div><div class="table-scroll"><table class="editable-table"><thead><tr><th>Source</th><th>Exchange</th><th>Type</th><th>Target</th><th>Protocol / standard</th><th>Description / verification notes</th><th></th></tr></thead><tbody>${connections.map(item => `<tr><td data-label="Source">${h(elements.find(element => element.id === item.sourceElementId)?.name)}</td><td data-label="Exchange"><input aria-label="Exchange name" value="${h(item.label)}" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="label"></td><td data-label="Type"><select aria-label="Exchange type" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="type">${INTERFACE_TYPES.map(value => option(value, value, item.type)).join("")}</select></td><td data-label="Target">${h(elements.find(element => element.id === item.targetElementId)?.name)}</td><td data-label="Protocol / standard"><input aria-label="Exchange protocol or standard" value="${h(item.protocol)}" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="protocol"></td><td data-label="Description / verification notes"><textarea rows="2" aria-label="Exchange description or verification notes" data-record-collection="connections" data-record-id="${h(item.id)}" data-record-field="description">${h(item.description)}</textarea></td><td data-label="Remove"><button class="icon-button" type="button" data-delete="connections" data-id="${h(item.id)}" aria-label="Delete exchange">×</button></td></tr>`).join("")}</tbody></table></div></details>` : emptyState("No architecture views", "Create a guided mission, interface, data-flow, or transition view.", `<button class="button primary" type="button" data-action="new-view">Create first view</button>`)}`;
}

function governanceSection(title, copy, collection, items, columns) {
  const control = (item, column) => {
    const ariaLabel = h(`${title}: ${column.label}`);
    if (column.multipleOptions) {
      const selectedIds = Array.isArray(item[column.field]) ? item[column.field] : [];
      const empty = !column.multipleOptions.length;
      return `<select multiple size="3" aria-label="${ariaLabel}" data-record-links-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-links-field="${h(column.field)}" ${empty ? "disabled" : ""}>${empty ? `<option>${h(column.emptyLabel || "No records available")}</option>` : column.multipleOptions.map(link => `<option value="${h(link.id)}" ${selectedIds.includes(link.id) ? "selected" : ""}>${h(link.name || link.title)}</option>`).join("")}</select>`;
    }
    if (column.options) return `<select aria-label="${ariaLabel}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">${column.options.map(value => option(value, value, item[column.field])).join("")}</select>`;
    if (column.multiline) return `<textarea rows="2" aria-label="${ariaLabel}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">${h(item[column.field])}</textarea>`;
    return `<input ${column.type ? `type="${column.type}"` : ""} aria-label="${ariaLabel}" value="${h(item[column.field])}" data-record-collection="${h(collection)}" data-record-id="${h(item.id)}" data-record-field="${h(column.field)}">`;
  };
  return `<section class="panel governance-section"><div class="panel-head"><div><h3>${h(title)}</h3><p>${h(copy)}</p></div><button class="small-button" type="button" data-add="${h(collection)}">＋ Add</button></div><div class="table-scroll"><table class="editable-table"><thead><tr>${columns.map(column => `<th>${h(column.label)}</th>`).join("")}<th></th></tr></thead><tbody>${items.map(item => `<tr>${columns.map(column => `<td data-label="${h(column.label)}">${control(item, column)}</td>`).join("")}<td data-label="Remove"><button class="icon-button" type="button" data-delete="${h(collection)}" data-id="${h(item.id)}" aria-label="Delete ${h(title)} record">×</button></td></tr>`).join("")}</tbody></table></div>${!items.length ? emptyState(`No ${title.toLowerCase()}`, `Add the first ${title.toLowerCase()} record.`) : ""}</section>`;
}

function loadKnowledgeBase() {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_BASE_STORAGE_KEY);
    if (raw === null) {
      initialKnowledgeBaseNeedsSave = true;
      return createKnowledgeBase();
    }
    const candidate = JSON.parse(raw);
    const result = validateKnowledgeBase(candidate);
    if (!result.valid) throw new Error(result.errors[0]);
    return candidate;
  } catch (error) {
    console.warn("Could not load the saved Solution Architect Knowledge Base.", error);
    knowledgeBaseLoadError = error instanceof Error ? error.message : "The saved catalog could not be read.";
    return createKnowledgeBase();
  }
}

function persistKnowledgeBase(candidate, { quiet = false, renderAfter = false, replaceInvalidStore = false } = {}) {
  if (knowledgeBaseLoadError && !replaceInvalidStore) {
    if (!quiet) toast("Knowledge Base editing is paused to protect the unreadable saved catalog. Import a valid catalog backup to recover.", "error");
    return false;
  }
  const result = validateKnowledgeBase(candidate);
  if (!result.valid) {
    if (!quiet) toast(`Knowledge Base was not saved: ${result.errors[0]}`, "error");
    return false;
  }
  try {
    localStorage.setItem(KNOWLEDGE_BASE_STORAGE_KEY, JSON.stringify(candidate));
    knowledgeBase = candidate;
    if (replaceInvalidStore) knowledgeBaseLoadError = "";
    if (renderAfter) render();
    return true;
  } catch {
    if (!quiet) toast("Knowledge Base could not be saved. Browser storage may be unavailable or full; export a catalog backup.", "error");
    return false;
  }
}

function commitKnowledgeBase(mutator, { renderAfter = true } = {}) {
  const next = structuredClone(knowledgeBase);
  mutator(next);
  next.savedAt = new Date().toISOString();
  return persistKnowledgeBase(next, { renderAfter });
}

function analysisOfAlternativesSection(items, candidates, evidence, solutionId) {
  return `<section class="panel aoa-section"><div class="panel-head"><div><p class="section-kicker">Optional decision depth</p><h3>Analysis of Alternatives</h3><p>Use this when a decision needs a documented comparison of multiple assessed candidates. The matrix below reuses Technology Assessment scores and evidence; it does not create a second scoring source.</p></div><button class="small-button" type="button" data-action="add-aoa">Add analysis</button></div>${items.length ? `<div class="aoa-list">${items.map(item => analysisOfAlternativesCard(item, candidates, evidence, solutionId)).join("")}</div>` : emptyState("No Analysis of Alternatives", "Add one only when the decision warrants baseline, ground-rule, sensitivity, and evidence documentation.")}</section>`;
}

function analysisOfAlternativesCard(item, candidates, evidence, solutionId) {
  const selectedIds = item.optionIds || [];
  const selectedCandidates = candidates.filter(candidate => selectedIds.includes(candidate.id));
  const baselineOptions = selectedCandidates.length ? `<option value="">Select a baseline</option>${selectedCandidates.map(candidate => option(candidate.id, candidate.name, item.baselineOptionId || "")).join("")}` : `<option value="">Select alternatives first</option>`;
  const comparisonRows = selectedCandidates.map(candidate => {
    const result = assessmentResult(workspace, solutionId, candidate.id);
    return `<tr><td data-label="Alternative"><strong>${h(candidate.name)}</strong><small>${h(candidate.category || "Category not recorded")}</small></td><td data-label="Baseline">${candidate.id === item.baselineOptionId ? `<span class="aoa-baseline">Baseline</span>` : "—"}</td><td data-label="Weighted score"><strong>${result.score === null ? "Unknown" : `${result.score.toFixed(2)} / 5`}</strong></td><td data-label="Assessed">${Math.round(result.coverage * 100)}%</td><td data-label="Evidenced">${Math.round(result.evidenceCoverage * 100)}%</td><td data-label="Readiness levels">TRL ${h(candidate.trl ?? "—")} · MRL ${h(candidate.mrl ?? "—")} · IRL ${h(candidate.irl ?? "—")}</td><td data-label="Status">${h(candidate.status)}</td></tr>`;
  }).join("");
  return `<article class="aoa-editor-card"><header class="aoa-card-header"><div><span class="aoa-optional">Optional</span><h4>${h(item.title || "Untitled analysis")}</h4><p>${selectedIds.length} alternative${selectedIds.length === 1 ? "" : "s"} selected · ${h(item.status)}</p></div><button class="icon-button" type="button" data-delete="trades" data-id="${h(item.id)}" aria-label="Delete Analysis of Alternatives">×</button></header><div class="aoa-form-grid"><div class="aoa-title-status-row span-2"><label class="aoa-title"><span>Analysis title</span><input value="${h(item.title)}" maxlength="280" data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="title"></label><label class="aoa-status"><span>Status</span><select data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="status">${["In analysis", "Ready for decision", "Closed"].map(value => option(value, value, item.status)).join("")}</select></label></div><label class="span-2"><span>Decision objective</span><textarea rows="3" maxlength="3000" data-auto-grow data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="question">${h(item.question)}</textarea></label><label class="span-2"><span>Alternatives</span><select multiple size="${Math.min(6, Math.max(3, candidates.length))}" data-record-links-collection="trades" data-record-id="${h(item.id)}" data-record-links-field="optionIds" ${candidates.length ? "" : "disabled"}>${candidates.length ? candidates.map(candidate => `<option value="${h(candidate.id)}" ${selectedIds.includes(candidate.id) ? "selected" : ""}>${h(candidate.name)}</option>`).join("") : `<option>Add candidates in Technology Assessment</option>`}</select><small>Select at least two candidates. Hold Ctrl or Command to select more than one.</small></label><label><span>Baseline alternative</span><select data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="baselineOptionId" ${selectedCandidates.length ? "" : "disabled"}>${baselineOptions}</select></label><label><span>Owner</span><input value="${h(item.owner || "")}" maxlength="300" data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="owner"></label><label><span>Analysis date</span><input type="date" value="${h(item.date || "")}" data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="date"></label><label><span>Supporting evidence</span><select multiple size="3" data-record-links-collection="trades" data-record-id="${h(item.id)}" data-record-links-field="evidenceIds" ${evidence.length ? "" : "disabled"}>${evidence.length ? evidence.map(record => `<option value="${h(record.id)}" ${(item.evidenceIds || []).includes(record.id) ? "selected" : ""}>${h(record.title)}</option>`).join("") : `<option>Add evidence in Shape</option>`}</select></label><label class="span-2"><span>Scope and ground rules</span><textarea rows="4" maxlength="5000" data-auto-grow data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="scopeAndGroundRules">${h(item.scopeAndGroundRules || "")}</textarea></label><label class="span-2"><span>Evaluation approach</span><textarea rows="4" maxlength="5000" data-auto-grow data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="evaluationApproach">${h(item.evaluationApproach || "")}</textarea></label><label class="span-2"><span>Sensitivity and uncertainty</span><textarea rows="4" maxlength="5000" data-auto-grow data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="sensitivityAnalysis">${h(item.sensitivityAnalysis || "")}</textarea></label><label class="span-2"><span>Recommendation</span><textarea rows="4" maxlength="5000" data-auto-grow data-record-collection="trades" data-record-id="${h(item.id)}" data-record-field="recommendation">${h(item.recommendation)}</textarea></label></div><section class="aoa-comparison" aria-label="${h(item.title || "Analysis of Alternatives")} comparison"><div><h5>Derived alternative comparison</h5><p>Weighted scores and coverage update from Technology Assessment. Unknown values remain unknown.</p></div>${comparisonRows ? `<div class="table-scroll"><table><thead><tr><th>Alternative</th><th>Baseline</th><th>Weighted score</th><th>Assessed</th><th>Evidenced</th><th>Readiness levels</th><th>Status</th></tr></thead><tbody>${comparisonRows}</tbody></table></div>` : `<p class="aoa-comparison-empty">Select two or more assessed candidates to compare them here.</p>`}</section></article>`;
}

function renderProve(solution) {
  const trades = scoped(workspace, "trades", solution.id);
  const tradeStudies = trades.filter(record => record.analysisType !== "Analysis of Alternatives");
  const alternativesAnalyses = trades.filter(record => record.analysisType === "Analysis of Alternatives");
  const decisions = scoped(workspace, "decisions", solution.id);
  const risks = scoped(workspace, "risks", solution.id);
  const dependencies = scoped(workspace, "dependencies", solution.id);
  const reviews = scoped(workspace, "reviews", solution.id);
  const drafts = scoped(workspace, "aiDrafts", solution.id);
  const candidates = scoped(workspace, "candidates", solution.id);
  const evidence = scoped(workspace, "evidence", solution.id);
  return `${renderStageRail("Prove")}<div class="section-toolbar"><div><p class="section-kicker">Technical assurance</p><h3>Make trade-offs, evidence, and residual risk explicit</h3><p>Govern the solution without replacing domain specialists or formal authorities.</p></div></div><div class="governance-stack">
  ${governanceSection("Trade studies", "Frame the question, compare assessed candidates, and record the current recommendation.", "trades", tradeStudies, [{ label: "Trade / question", field: "title" }, { label: "Decision question", field: "question", multiline: true }, { label: "Candidates", field: "optionIds", multipleOptions: candidates, emptyLabel: "Add candidates in Assess" }, { label: "Recommendation", field: "recommendation", multiline: true }, { label: "Status", field: "status", options: ["In analysis", "Ready for decision", "Closed"] }])}
  ${analysisOfAlternativesSection(alternativesAnalyses, candidates, evidence, solution.id)}
  ${governanceSection("Decision records", "Preserve design intent, ownership, rationale, supporting evidence, and approval state.", "decisions", decisions, [{ label: "Decision", field: "title" }, { label: "Rationale", field: "rationale", multiline: true }, { label: "Evidence", field: "evidenceIds", multipleOptions: evidence, emptyLabel: "Add evidence in Shape" }, { label: "Owner", field: "owner" }, { label: "Status", field: "status", options: ["Proposed", "Approved", "Superseded"] }])}
  ${governanceSection("Risks", "Track technical, integration, delivery, cyber, safety, supply, and transition exposure. Keep new captures Unknown until reviewed.", "risks", risks, [{ label: "Risk", field: "title" }, { label: "Likelihood", field: "likelihood", options: ["Unknown", "Low", "Medium", "High"] }, { label: "Impact", field: "impact", options: ["Unknown", "Low", "Medium", "High"] }, { label: "Owner", field: "owner" }, { label: "Mitigation", field: "mitigation", multiline: true }, { label: "Status", field: "status", options: ["Open", "Watching", "Mitigated", "Closed"] }])}
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
    ${field("Concept of operations", solution.proposal.conops, `data-solution-nested="proposal.conops" maxlength="12000"`, { multiline: true, rows: 8 })}
    ${field("Technical approach", solution.proposal.technicalApproach, `data-solution-nested="proposal.technicalApproach" maxlength="12000"`, { multiline: true, rows: 8 })}
    ${field("Discriminators", solution.proposal.discriminators, `data-solution-nested="proposal.discriminators" maxlength="8000"`, { multiline: true, rows: 6 })}
    ${field("Estimate and Basis of Estimate assumptions", solution.proposal.estimateAssumptions, `data-solution-nested="proposal.estimateAssumptions" maxlength="8000"`, { multiline: true, rows: 6, hint: "Capture WBS scope, quantities, labor, material, schedule, supplier, and integration assumptions." })}
    ${field("Delivery commitments", solution.proposal.deliveryCommitments, `data-solution-nested="proposal.deliveryCommitments" maxlength="8000"`, { multiline: true, rows: 6 })}
  </div></section><aside class="panel compliance-panel"><div class="panel-head"><div><h3>Requirement support check</h3><p>Checks internal source evidence and acceptance methods only. This is not a solicitation compliance matrix.</p></div></div><ul class="compliance-list">${requirements.map(item => { const source = evidence.find(record => record.id === item.sourceEvidenceId); return `<li><span class="compliance-state ${item.sourceEvidenceId && item.acceptanceMethod ? "ready" : "gap"}">${item.sourceEvidenceId && item.acceptanceMethod ? "Supported" : "Needs support"}</span><div><strong>${h(item.title)}</strong><small>${h(source?.title || "No source")} · ${h(item.acceptanceMethod || "No acceptance method")}</small></div></li>`; }).join("")}</ul>${!requirements.length ? emptyState("No requirement support check", "Shape requirements before checking source and acceptance-method support.") : ""}</aside></div>`;
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

function renderDecisionExportMenu() {
  const formats = [
    { action: "export-pdf", badge: "PDF", title: "PDF document", description: "Polished, share-ready report", label: "Download decision package as PDF" },
    { action: "export-docx", badge: "DOCX", title: "Word document", description: "Editable Microsoft Word report", label: "Download decision package as Microsoft Word" },
    { action: "export-xlsx", badge: "XLSX", title: "Excel workbook", description: "Structured Microsoft Excel workbook", label: "Download decision workbook as Microsoft Excel" },
    { action: "export-html", badge: "HTML", title: "Standalone HTML", description: "Browser-ready report with embedded styling", label: "Download decision package as standalone HTML" },
    { action: "export-markdown", badge: "MD", title: "Markdown", description: "Portable plain-text source", label: "Download decision package as Markdown" }
  ];
  return `<div class="decision-export-actions">
    <button class="button primary decision-export-trigger" type="button" data-action="toggle-decision-export" aria-haspopup="menu" aria-expanded="false" aria-controls="decision-export-menu">
      <span class="decision-export-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"/></svg></span>
      <span>Export</span><span class="visually-hidden"> decision package</span>
      <span class="decision-export-chevron" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="m6 8 4 4 4-4"/></svg></span>
    </button>
    <div class="decision-export-menu" id="decision-export-menu" role="menu" aria-label="Decision package export formats" hidden>
      ${formats.map(format => `<button class="decision-export-item" type="button" role="menuitem" tabindex="-1" data-action="${format.action}" aria-label="${format.label}"><span class="decision-export-badge" aria-hidden="true">${format.badge}</span><span class="decision-export-copy"><strong>${format.title}</strong><small>${format.description}</small></span></button>`).join("")}
    </div>
  </div>`;
}

function renderDecisionPackage(solution) {
  const readiness = buildReadiness(workspace, solution.id);
  const prepared = formatLocalDate();
  const segments = solution.missionSegments || [];
  return `${renderStageRail(solution.stage)}<div class="section-toolbar decision-export-toolbar"><div><p class="section-kicker">Review artifact</p><h3>Decision package</h3><p>Mission brief, traceability, assessments, architecture, decisions, risks, roadmap, and evidence gaps.</p></div>${renderDecisionExportMenu()}</div><section class="panel package-summary"><div><span>Overall coverage</span><strong>${readiness.overall}%</strong></div><div><span>Traceability</span><strong>${readiness.traceability}%</strong></div><div><span>Evidence</span><strong>${readiness.evidence}%</strong></div><div><span>Element connectivity</span><strong>${readiness.interfaces}%</strong></div><div><span>Transition</span><strong>${readiness.transition}%</strong></div></section><section class="panel package-preview"><div class="panel-head"><div><p class="section-kicker">Output preview</p><h3>Executive decision document</h3><p>HTML, PDF, Word, and Excel use the same validated solution facts with layouts tailored to each format.</p></div></div><div class="package-preview-artifact"><header class="package-preview-cover"><p class="package-preview-kicker">Solution decision package</p><h4>${h(solution.name)}</h4><p class="package-preview-lede">${h(solution.description || solution.mission.desiredState || solution.mission.problem || "Decision-ready solution architecture package.")}</p><dl><div><dt>Customer</dt><dd>${h(solution.customer || "Not recorded")}</dd></div><div><dt>Lifecycle stage</dt><dd>${h(solution.stage)}</dd></div><div><dt>Domain</dt><dd>${h(solution.domain || "Not recorded")}</dd></div><div><dt>Prepared</dt><dd>${h(prepared)}</dd></div></dl><div class="package-preview-decision"><span>Decision requested</span><p>${h(solution.decision || "Decision request not yet defined")}</p></div><div class="package-preview-segments"><strong>Company mission segments</strong><div class="package-preview-tags">${segments.length ? segments.map(segment => `<span>${h(segment)}</span>`).join("") : `<span>Mission segment not selected</span>`}</div></div></header><div class="package-preview-contents"><div><p class="section-kicker">Inside the package</p><h4>One coherent decision story</h4><p>The report carries the complete workspace into readable sections with semantic headings, wrapping records, architecture figures, and format-aware pagination.</p></div><ol><li>Executive overview and mission context</li><li>Customer priorities, win themes, and proposal approach</li><li>Requirements, assessments, trades, and architecture</li><li>Decisions, risks, roadmap, transition, and evidence</li></ol></div></div></section>`;
}

const ADD_DEFAULTS = {
  stakeholders: () => ({ id: makeId("stakeholder"), name: "New stakeholder", role: "", concern: "" }),
  hotButtons: () => ({ id: makeId("hot_button"), title: "New customer hot button", detail: "", source: "", confidence: "Unverified", status: "Captured" }),
  outcomes: () => ({ id: makeId("outcome"), title: "New operational outcome", verificationMethod: "", linkedRequirementIds: [] }),
  measures: () => ({ id: makeId("measure"), name: "New measure", target: "", method: "" }),
  evidence: () => ({ id: makeId("evidence"), title: "New evidence", sourceType: "Other", meetingDate: "", source: "", url: "", notes: "", confidence: "Unknown" }),
  requirements: () => ({ id: makeId("requirement"), title: "New requirement", type: "Functional", priority: "Must", sourceEvidenceId: "", acceptanceMethod: "", status: "Draft", linkedElementIds: [], linkedHotButtonIds: [] }),
  candidates: () => ({ id: makeId("candidate"), name: "New candidate", category: "Integrated solution", vendor: "", description: "", readinessBasis: "", readinessAsOf: "", trl: null, mrl: null, irl: null, status: "Considering", scores: [] }),
  winThemes: () => ({ id: makeId("win_theme"), title: "New win theme", customerValue: "", discriminator: "", proof: "", linkedHotButtonIds: [], sourceEvidenceIds: [], status: "Draft" }),
  trades: () => ({ id: makeId("trade"), title: "New trade study", question: "", optionIds: [], recommendation: "", status: "In analysis", analysisType: "Trade study", baselineOptionId: "", scopeAndGroundRules: "", evaluationApproach: "", sensitivityAnalysis: "", evidenceIds: [], owner: "", date: "" }),
  decisions: () => ({ id: makeId("decision"), title: "New decision", status: "Proposed", rationale: "", evidenceIds: [], owner: "", date: "" }),
  risks: () => ({ id: makeId("risk"), title: "New risk", likelihood: "Unknown", impact: "Unknown", owner: "", mitigation: "", status: "Open" }),
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

function knowledgeLifecycleLabel(status) {
  return status === "Retired" ? "Archived" : status;
}

function knowledgeStatusMatches(item, statusFilter = knowledgeFilters.status) {
  if (statusFilter === "active") return item.lifecycleStatus !== "Retired";
  if (statusFilter === "archived") return item.lifecycleStatus === "Retired";
  if (!statusFilter || statusFilter === "all") return true;
  return item.lifecycleStatus === statusFilter;
}

function knowledgeItemMatches(item, filters = knowledgeFilters) {
  const query = filters.search.trim().toLowerCase();
  const searchable = [item.name, item.provider, item.version, item.summary, item.capabilities?.join(" "), item.tags?.join(" "), item.missionSegments?.join(" ")].join(" ").toLowerCase();
  return (!query || searchable.includes(query))
    && (!filters.type || item.offeringType === filters.type)
    && knowledgeStatusMatches(item, filters.status)
    && (!filters.segment || item.missionSegments?.includes(filters.segment));
}

function knowledgeCard(item, solution) {
  const existing = scoped(workspace, "candidates", solution.id).find(candidate => candidate.catalogSource?.itemId === item.id);
  const archived = item.lifecycleStatus === "Retired";
  const stale = !archived && existing && Number(existing.catalogSource?.revision || 0) < item.revision;
  const sourceUrl = safeHttpUrl(item.sourceUrl);
  const primaryAction = archived
    ? existing
      ? `<button class="button secondary" type="button" data-knowledge-open="${h(existing.id)}">Open assessment</button>`
      : ""
    : existing
    ? stale
      ? `<button class="button primary" type="button" data-knowledge-refresh="${h(item.id)}">Refresh solution copy</button>`
      : `<button class="button secondary" type="button" data-knowledge-open="${h(existing.id)}">Open assessment</button>`
    : `<button class="button primary" type="button" data-knowledge-use="${h(item.id)}">Use in active solution</button>`;
  const statusNote = archived
    ? `<p class="knowledge-archive-note"><strong>Archived</strong> Hidden from active results and unavailable for new solution use or refresh.${existing ? ` The independent copy in ${h(solution.name)} remains available.` : ""}</p>`
    : stale
      ? `<p class="knowledge-update-note"><strong>Update available</strong> Solution copy uses revision ${h(existing.catalogSource.revision)}; catalog is revision ${h(item.revision)}.</p>`
      : existing
        ? `<p class="knowledge-copy-note">Revision ${h(item.revision)} is already copied into ${h(solution.name)}.</p>`
        : "";
  const managementActions = archived
    ? `<button class="button primary" type="button" data-knowledge-restore="${h(item.id)}">Restore offering</button><button class="button danger" type="button" data-knowledge-delete="${h(item.id)}">Delete permanently</button>`
    : `<button class="button secondary" type="button" data-knowledge-archive="${h(item.id)}">Archive offering</button>`;
  return `<article class="knowledge-card ${archived ? "is-archived" : ""}" data-knowledge-card data-knowledge-search="${h([item.name, item.provider, item.version, item.summary, ...(item.capabilities || []), ...(item.tags || []), ...(item.missionSegments || [])].join(" ").toLowerCase())}" data-knowledge-type="${h(item.offeringType)}" data-knowledge-status="${h(item.lifecycleStatus)}" data-knowledge-archived="${archived}" data-knowledge-segments="${h((item.missionSegments || []).join("|"))}" ${knowledgeItemMatches(item) ? "" : "hidden"}>
    <div class="knowledge-card-head"><div class="knowledge-badges"><span class="knowledge-type">${h(item.offeringType)}</span><span class="knowledge-status status-${h(item.lifecycleStatus.toLowerCase())}">${h(knowledgeLifecycleLabel(item.lifecycleStatus))}</span></div><span class="knowledge-revision">Revision ${h(item.revision)}</span></div>
    <h3>${h(item.name)}</h3><p class="knowledge-provider">${h([item.provider, item.version].filter(Boolean).join(" · ") || "Provider and version not recorded")}</p><p class="knowledge-summary">${h(item.summary || "Summary not recorded.")}</p>
    ${item.capabilities.length ? `<div class="knowledge-tags" aria-label="Capabilities">${item.capabilities.map(value => `<span>${h(value)}</span>`).join("")}</div>` : ""}
    ${item.missionSegments.length ? `<div class="knowledge-segments" aria-label="Company mission segments">${item.missionSegments.map(value => `<span>${h(value)}</span>`).join("")}</div>` : ""}
    <dl class="knowledge-meta"><div><dt>Readiness levels</dt><dd>TRL ${h(item.trl ?? "—")} · MRL ${h(item.mrl ?? "—")} · IRL ${h(item.irl ?? "—")}</dd></div><div><dt>Last reviewed</dt><dd>${h(item.reviewedAt || "Not recorded")}</dd></div><div><dt>Last change</dt><dd>${h(item.changeSummary || "No change summary")}</dd></div></dl>
    <details class="knowledge-details"><summary>Offering details</summary><div><h4>Deployment and environment</h4><p>${h(item.deploymentAndEnvironment || "Not recorded")}</p><h4>Interfaces</h4><p>${h(item.interfaces || "Not recorded")}</p><h4>Integration considerations</h4><p>${h(item.integrationConsiderations || "Not recorded")}</p><h4>Cyber and safety considerations</h4><p>${h(item.cyberSafetyConsiderations || "Not recorded")}</p><h4>MOSA and data rights</h4><p>${h(item.mosaDataRights || "Not recorded")}</p><h4>Source</h4><p>${h(item.sourceTitle || "Not recorded")}${sourceUrl ? ` · <a href="${h(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open reference</a>` : ""}</p></div></details>
    ${statusNote}<footer class="knowledge-card-actions"><button class="button secondary" type="button" data-knowledge-edit="${h(item.id)}">Edit</button>${primaryAction}${managementActions}</footer>
  </article>`;
}

function renderKnowledgeBase(solution) {
  const visible = knowledgeBase.items.filter(item => knowledgeItemMatches(item)).length;
  const recovery = knowledgeBaseLoadError ? `<div class="panel knowledge-recovery" role="alert"><strong>Saved catalog needs recovery</strong><p>The stored Knowledge Base could not be opened and was left unchanged. Editing is paused to protect it. Import a valid catalog backup to replace it intentionally.</p></div>` : "";
  const filterAttributes = `aria-controls="knowledge-results-grid" aria-describedby="knowledge-filter-status"`;
  const resultAnnouncement = `${visible} of ${knowledgeBase.items.length} Knowledge Base items match the current filters.`;
  return `<div class="section-toolbar knowledge-toolbar">
    <div><p class="section-kicker">Reusable reference</p><h3>Knowledge base</h3><p>Maintain approved unclassified, non-CUI products, applications, software, platforms, solutions, and offerings. Using an item creates an independent Technology Assessment candidate for <strong>${h(solution.name)}</strong>.</p></div>
    <div class="knowledge-toolbar-actions"><button class="button secondary" type="button" data-knowledge-template>Templates</button><button class="button secondary" type="button" data-knowledge-list-import ${knowledgeBaseLoadError ? "disabled" : ""}>Import list</button><button class="button secondary" type="button" data-knowledge-backup>JSON backup</button><button class="button primary" type="button" data-knowledge-add ${knowledgeBaseLoadError ? "disabled" : ""}>Add offering</button></div>
  </div>${recovery}<section class="panel knowledge-search-panel" aria-label="Knowledge Base filters" aria-describedby="knowledge-filter-status">
    <div class="knowledge-filter-grid">
      <label class="knowledge-search"><span>Search</span><input type="search" value="${h(knowledgeFilters.search)}" data-knowledge-filter="search" placeholder="Name, provider, capability, tag, or version" ${filterAttributes}></label>
      <label><span>Offering type</span><select data-knowledge-filter="type" ${filterAttributes}><option value="">All types</option>${KNOWLEDGE_OFFERING_TYPES.map(value => option(value, value, knowledgeFilters.type)).join("")}</select></label>
      <label><span>Availability</span><select data-knowledge-filter="status" ${filterAttributes}>${option("active", "Active offerings", knowledgeFilters.status)}${["Current", "Emerging", "Legacy"].map(value => option(value, value, knowledgeFilters.status)).join("")}${option("archived", "Archived offerings", knowledgeFilters.status)}${option("all", "All offerings", knowledgeFilters.status)}</select></label>
      <label><span>Mission segment</span><select data-knowledge-filter="segment" ${filterAttributes}><option value="">All mission segments</option>${MISSION_SEGMENTS.map(record => option(record.name, record.name, knowledgeFilters.segment)).join("")}</select></label>
    </div>
    <div class="knowledge-results-meta"><strong data-knowledge-count>${visible} of ${knowledgeBase.items.length} items</strong><span class="visually-hidden" id="knowledge-filter-status" data-knowledge-filter-status role="status" aria-live="polite" aria-atomic="true">${h(resultAnnouncement)}</span><button class="text-button" type="button" data-knowledge-clear aria-controls="knowledge-results-grid">Clear filters</button></div>
  </section><p class="knowledge-boundary-note"><strong>Copy-on-use:</strong> catalog updates never silently alter solution assessments, scores, decisions, or evidence. Archived offerings are hidden by default and cannot be copied or refreshed until restored; existing solution copies remain independent.</p><div class="knowledge-grid" id="knowledge-results-grid" data-knowledge-grid>${knowledgeBase.items.map(item => knowledgeCard(item, solution)).join("")}</div><div class="panel knowledge-empty" data-knowledge-empty ${visible ? "hidden" : ""}>${emptyState("No Knowledge Base items match", "Reset the filters or add a reusable solution offering.")}</div>`;
}

function applyKnowledgeFilters() {
  let visible = 0;
  document.querySelectorAll("[data-knowledge-card]").forEach(card => {
    const query = knowledgeFilters.search.trim().toLowerCase();
    const matches = (!query || card.dataset.knowledgeSearch.includes(query))
      && (!knowledgeFilters.type || card.dataset.knowledgeType === knowledgeFilters.type)
      && knowledgeStatusMatches({ lifecycleStatus: card.dataset.knowledgeStatus }, knowledgeFilters.status)
      && (!knowledgeFilters.segment || card.dataset.knowledgeSegments.split("|").includes(knowledgeFilters.segment));
    card.hidden = !matches;
    if (matches) visible += 1;
  });
  const count = document.querySelector("[data-knowledge-count]");
  if (count) count.textContent = `${visible} of ${knowledgeBase.items.length} items`;
  const status = document.querySelector("[data-knowledge-filter-status]");
  if (status) status.textContent = `${visible} of ${knowledgeBase.items.length} Knowledge Base items match the current filters.`;
  const empty = document.querySelector("[data-knowledge-empty]");
  if (empty) empty.hidden = visible > 0;
}

function showKnowledgeEditor(itemId = "") {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before editing the Knowledge Base.", "error"); return; }
  const existing = knowledgeBase.items.find(item => item.id === itemId);
  const item = existing || createKnowledgeItem({ name: "" });
  if (!existing) item.name = "";
  openModal(existing ? "Update solution offering" : "Add solution offering", `<form id="knowledge-item-form" data-knowledge-id="${h(existing?.id || "")}"><p class="modal-intro">Catalog facts are reusable reference material. Saving an update creates revision ${h(existing ? existing.revision + 1 : 1)}; existing solution copies remain unchanged until explicitly refreshed.</p><div class="knowledge-editor-grid"><label class="span-2"><span>Name</span><input name="name" value="${h(item.name)}" required maxlength="280" autofocus></label><label><span>Offering type</span><select name="offeringType">${KNOWLEDGE_OFFERING_TYPES.map(value => option(value, value, item.offeringType)).join("")}</select></label><label><span>Lifecycle status</span><select name="lifecycleStatus">${KNOWLEDGE_LIFECYCLE_STATUSES.map(value => option(value, knowledgeLifecycleLabel(value), item.lifecycleStatus)).join("")}</select></label><label><span>Provider / owner</span><input name="provider" value="${h(item.provider)}" maxlength="300"></label><label><span>Version / release</span><input name="version" value="${h(item.version)}" maxlength="160"></label><label class="span-2"><span>Summary</span><textarea name="summary" rows="4" maxlength="5000" data-auto-grow>${h(item.summary)}</textarea></label><fieldset class="knowledge-segment-picker span-2"><legend>Applicable company mission segments</legend><div>${MISSION_SEGMENTS.map(record => `<label><input type="checkbox" name="missionSegments" value="${h(record.name)}" ${item.missionSegments.includes(record.name) ? "checked" : ""}><span>${h(record.name)}</span></label>`).join("")}</div></fieldset><label class="span-2"><span>Capabilities — one per line</span><textarea name="capabilities" rows="4" maxlength="12000" data-auto-grow>${h(item.capabilities.join("\n"))}</textarea></label><label class="span-2"><span>Tags — comma separated</span><input name="tags" value="${h(item.tags.join(", "))}" maxlength="6000"></label><label><span>Last reviewed</span><input type="date" name="reviewedAt" value="${h(item.reviewedAt)}"></label><label><span>Change summary</span><input name="changeSummary" value="${h(item.changeSummary)}" maxlength="3000" placeholder="What changed in this revision?"></label></div><details class="knowledge-more" open><summary>Architecture, readiness, and source details</summary><div class="knowledge-editor-grid"><label class="span-2"><span>Deployment and environment</span><textarea name="deploymentAndEnvironment" rows="3" maxlength="5000" data-auto-grow>${h(item.deploymentAndEnvironment)}</textarea></label><label class="span-2"><span>Interfaces</span><textarea name="interfaces" rows="3" maxlength="5000" data-auto-grow>${h(item.interfaces)}</textarea></label><label class="span-2"><span>Integration considerations</span><textarea name="integrationConsiderations" rows="3" maxlength="5000" data-auto-grow>${h(item.integrationConsiderations)}</textarea></label><label class="span-2"><span>Cyber and safety considerations</span><textarea name="cyberSafetyConsiderations" rows="3" maxlength="5000" data-auto-grow>${h(item.cyberSafetyConsiderations)}</textarea></label><label class="span-2"><span>MOSA and data rights</span><textarea name="mosaDataRights" rows="3" maxlength="5000" data-auto-grow>${h(item.mosaDataRights)}</textarea></label><label><span>TRL</span><input type="number" name="trl" min="1" max="9" value="${h(item.trl ?? "")}"></label><label><span>MRL</span><input type="number" name="mrl" min="1" max="10" value="${h(item.mrl ?? "")}"></label><label><span>IRL</span><input type="number" name="irl" min="0" max="9" value="${h(item.irl ?? "")}"></label><label><span>Readiness as-of</span><input type="date" name="readinessAsOf" value="${h(item.readinessAsOf)}"></label><label class="span-2"><span>Readiness basis</span><textarea name="readinessBasis" rows="3" maxlength="5000" data-auto-grow>${h(item.readinessBasis)}</textarea></label><label><span>Source title</span><input name="sourceTitle" value="${h(item.sourceTitle)}" maxlength="500"></label><label><span>Source URL</span><input type="url" name="sourceUrl" value="${h(item.sourceUrl)}" maxlength="2000" placeholder="https://"></label><label class="span-2"><span>Source notes</span><textarea name="sourceNotes" rows="3" maxlength="5000" data-auto-grow>${h(item.sourceNotes)}</textarea></label></div></details><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">${existing ? "Save new revision" : "Add to Knowledge Base"}</button></div></form>`, { wide: true });
  const lifecycleSelect = document.querySelector('#knowledge-item-form [name="lifecycleStatus"]');
  if (lifecycleSelect) {
    const archivedOption = lifecycleSelect.querySelector('option[value="Retired"]');
    const hint = document.createElement("small");
    hint.id = "knowledge-lifecycle-hint";
    lifecycleSelect.setAttribute("aria-describedby", hint.id);
    if (item.lifecycleStatus === "Retired") {
      lifecycleSelect.disabled = true;
      hint.textContent = "Use Restore offering to return this item to active use.";
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "lifecycleStatus";
      hidden.value = "Retired";
      lifecycleSelect.after(hidden, hint);
    } else {
      archivedOption?.remove();
      hint.textContent = "Use Archive offering when this item should no longer be available.";
      lifecycleSelect.after(hint);
    }
  }
}

function knowledgeFormValues(data) {
  const lines = value => String(value || "").split(/\r?\n/).map(item => item.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  const tags = String(data.get("tags") || "").split(/[\n,]/).map(item => item.trim()).filter(Boolean);
  const nullableNumber = name => String(data.get(name) || "") === "" ? null : Number(data.get(name));
  return { name: String(data.get("name") || "").trim(), offeringType: String(data.get("offeringType") || "Integrated solution"), provider: String(data.get("provider") || "").trim(), version: String(data.get("version") || "").trim(), lifecycleStatus: String(data.get("lifecycleStatus") || "Current"), summary: String(data.get("summary") || "").trim(), capabilities: lines(data.get("capabilities")), missionSegments: data.getAll("missionSegments").map(String), deploymentAndEnvironment: String(data.get("deploymentAndEnvironment") || "").trim(), interfaces: String(data.get("interfaces") || "").trim(), integrationConsiderations: String(data.get("integrationConsiderations") || "").trim(), cyberSafetyConsiderations: String(data.get("cyberSafetyConsiderations") || "").trim(), mosaDataRights: String(data.get("mosaDataRights") || "").trim(), trl: nullableNumber("trl"), mrl: nullableNumber("mrl"), irl: nullableNumber("irl"), readinessBasis: String(data.get("readinessBasis") || "").trim(), readinessAsOf: String(data.get("readinessAsOf") || ""), sourceTitle: String(data.get("sourceTitle") || "").trim(), sourceUrl: String(data.get("sourceUrl") || "").trim(), sourceNotes: String(data.get("sourceNotes") || "").trim(), tags, reviewedAt: String(data.get("reviewedAt") || ""), changeSummary: String(data.get("changeSummary") || "").trim() };
}

function showKnowledgeArchiveDialog(itemId) {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before archiving Knowledge Base items.", "error"); return; }
  const item = knowledgeBase.items.find(record => record.id === itemId);
  if (!item || item.lifecycleStatus === "Retired") return;
  openModal("Archive solution offering", `<form id="knowledge-archive-form" data-knowledge-id="${h(item.id)}"><p class="modal-intro">Archive <strong>${h(item.name)}</strong>? It will be hidden from active results and cannot be copied into or refreshed within a solution until restored.</p><div class="guide-note"><strong>Existing solution copies stay intact</strong><p>Any independent Technology Assessment candidate already created from this offering remains available in its solution.</p></div>${field("Archive note", `Archived ${item.name} from active solution use.`, `name="changeSummary" maxlength="3000" autofocus`, { multiline: true, rows: 3 })}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button danger" type="submit">Archive offering</button></div></form>`);
}

function showKnowledgeRestoreDialog(itemId) {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before restoring Knowledge Base items.", "error"); return; }
  const item = knowledgeBase.items.find(record => record.id === itemId);
  if (!item || item.lifecycleStatus !== "Retired") return;
  openModal("Restore solution offering", `<form id="knowledge-restore-form" data-knowledge-id="${h(item.id)}"><p class="modal-intro">Restore <strong>${h(item.name)}</strong> to the active catalog so solution architects can use it again.</p>${selectField("Restore as", `name="lifecycleStatus" autofocus`, ["Current", "Emerging", "Legacy"].map(value => option(value, value, "Current")).join(""))}${field("Restore note", `Restored ${item.name} to active solution use.`, `name="changeSummary" maxlength="3000"`, { multiline: true, rows: 3 })}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Restore offering</button></div></form>`);
}

function showKnowledgeDeleteDialog(itemId) {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before deleting Knowledge Base items.", "error"); return; }
  const item = knowledgeBase.items.find(record => record.id === itemId);
  if (!item || item.lifecycleStatus !== "Retired") return;
  const copies = workspace.candidates.filter(candidate => candidate.catalogSource?.itemId === item.id).length;
  openModal("Delete solution offering permanently", `<form id="knowledge-delete-form" data-knowledge-id="${h(item.id)}" data-knowledge-name="${h(item.name)}"><p class="modal-intro">Permanently delete <strong>${h(item.name)}</strong> from this browser's Knowledge Base?</p><div class="guide-note warning"><strong>This cannot be undone without a JSON backup</strong><p>${copies ? `${copies} existing solution cop${copies === 1 ? "y" : "ies"} will remain independent and usable, but catalog management and refresh will no longer be available.` : "No existing solution copies were found."}</p></div><label><span>Type the offering name to confirm</span><input name="confirmation" data-knowledge-delete-confirm-input data-knowledge-name="${h(item.name)}" autocomplete="off" required autofocus></label><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button danger" type="submit" data-knowledge-delete-confirm disabled>Delete permanently</button></div></form>`);
}

function useKnowledgeItem(itemId) {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before using Knowledge Base items.", "error"); return; }
  const item = knowledgeBase.items.find(record => record.id === itemId);
  if (!item || item.lifecycleStatus === "Retired") return;
  const existing = scoped(workspace, "candidates").find(candidate => candidate.catalogSource?.itemId === item.id);
  if (existing) { selectedCandidateId = existing.id; location.hash = "assess"; return; }
  const created = materializeKnowledgeItem(item, workspace.activeSolutionId);
  if (commit(next => next.candidates.push(created), { snapshot: `Before using Knowledge Base item ${item.name}` })) {
    selectedCandidateId = created.id;
    toast(`${item.name} was copied into ${activeSolution().name} for solution-specific assessment.`, "ok");
  }
}

function refreshKnowledgeCandidate(itemId) {
  if (knowledgeBaseLoadError) { toast("Import a valid catalog backup before refreshing a solution copy.", "error"); return; }
  const item = knowledgeBase.items.find(record => record.id === itemId);
  const candidate = scoped(workspace, "candidates").find(record => record.catalogSource?.itemId === itemId);
  if (!item || !candidate || item.lifecycleStatus === "Retired") return;
  if (commit(next => { const index = next.candidates.findIndex(record => record.id === candidate.id); next.candidates[index] = refreshCandidateFromKnowledge(next.candidates[index], item); }, { snapshot: `Before refreshing ${candidate.name} from Knowledge Base` })) toast(`${item.name} was refreshed. Assessment scores and solution-specific status were preserved.`, "ok");
}

function formatImportFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1_000) return `${value} bytes`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function showKnowledgeTemplateDialog() {
  const columnRows = KNOWLEDGE_IMPORT_COLUMNS.map(column => `<tr><td><strong>${h(column.header)}</strong>${column.key === "name" ? `<span class="required-badge">Required</span>` : ""}</td><td>${h(column.description)}</td></tr>`).join("");
  openModal("Knowledge Base import templates", `<div class="knowledge-template-intro"><p class="modal-intro">Use Excel when possible. CSV is also supported for simple lists. Both formats keep processing in this browser and use one offering per row.</p><div class="knowledge-template-options"><article><span class="file-format-badge">XLSX · Preferred</span><h3>Excel workbook</h3><p>Includes a formatted Solutions sheet, instructions, allowed values, validation controls, and a separate synthetic example.</p><a class="button primary" href="./assets/solution-knowledge-base-import-template.xlsx" download="solution-knowledge-base-import-template.xlsx">Download Excel template</a></article><article><span class="file-format-badge">CSV · UTF-8</span><h3>CSV template</h3><p>Header-only template for a flat list. Save the finished file as UTF-8 CSV before importing it.</p><button class="button secondary" type="button" data-knowledge-download-csv>Download CSV template</button></article></div><section class="knowledge-format-guide"><h3>Format rules</h3><div class="knowledge-rule-grid"><div><strong>Required</strong><span>Name is the only required value for a new offering.</span></div><div><strong>Lists</strong><span>Separate capabilities, mission segments, and tags with semicolons or line breaks.</span></div><div><strong>Dates</strong><span>Use YYYY-MM-DD.</span></div><div><strong>Readiness</strong><span>Technology 1–9, Manufacturing 1–10, Integration 0–9, or blank when unknown.</span></div><div><strong>Updates</strong><span>Use the exact Catalog ID, Expected Revision, and Change Summary. Names never trigger updates.</span></div><div><strong>Apply safely</strong><span>The full list is validated and previewed before one all-or-nothing save.</span></div></div></section><details class="knowledge-column-reference"><summary>See all ${KNOWLEDGE_IMPORT_COLUMNS.length} supported columns</summary><div class="table-scroll"><table><thead><tr><th>Column</th><th>What it contains</th></tr></thead><tbody>${columnRows}</tbody></table></div></details><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button><button class="button primary" type="button" data-knowledge-list-import ${knowledgeBaseLoadError ? "disabled" : ""}>Choose a list to import</button></div></div>`, { wide: true });
}

function showKnowledgeBackupDialog() {
  const recoveryCopy = knowledgeBaseLoadError
    ? `<div class="knowledge-import-alert error" role="alert"><strong>Recovery required</strong><span>The unreadable saved catalog was left unchanged. Restore a valid JSON backup to recover it.</span></div>`
    : `<p class="modal-intro">JSON is the exact full-catalog backup and recovery format. Spreadsheet imports merge reviewed rows; JSON restore deliberately replaces the catalog after complete validation.</p>`;
  openModal("Knowledge Base backup and restore", `${recoveryCopy}<div class="knowledge-backup-options"><article><h3>Download JSON backup</h3><p>Save the complete catalog contract, IDs, revisions, source details, and timestamps.</p><button class="button secondary" type="button" data-knowledge-export ${knowledgeBaseLoadError ? "disabled" : ""}>Download JSON backup</button></article><article><h3>Restore JSON backup</h3><p>Choose a valid <code>solution-knowledge-base-v1</code> JSON file. Nothing changes unless the entire backup passes validation.</p><button class="button primary" type="button" data-knowledge-import>Choose JSON backup</button></article></div><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button></div>`);
}

function importDiagnosticList(diagnostics) {
  if (!diagnostics.length) return `<p class="knowledge-import-clean"><strong>No import findings.</strong> The selected rows passed all checks.</p>`;
  const visible = diagnostics.slice(0, 20);
  const remaining = diagnostics.length - visible.length;
  return `<ul class="knowledge-import-diagnostics">${visible.map(item => `<li class="${h(item.severity || "info")}"><strong>${h((item.severity || "info").toUpperCase())}</strong><span>${h(item.message)}</span></li>`).join("")}${remaining ? `<li class="info"><strong>INFO</strong><span>${remaining} more finding${remaining === 1 ? "" : "s"} not shown.</span></li>` : ""}</ul>`;
}

function refreshKnowledgeImportPlan(mode = knowledgeImportSession?.mode || "add") {
  if (!knowledgeImportSession) return;
  knowledgeImportSession.mode = mode;
  knowledgeImportSession.plan = buildKnowledgeImportPlan(knowledgeBase, knowledgeImportSession.table, { mode });
}

function showKnowledgeImportPreview({ focusSelector = "" } = {}) {
  if (!knowledgeImportSession) return;
  const { fileName, fileSize, table, normalized, plan, mode } = knowledgeImportSession;
  const counts = plan.counts;
  const actionable = counts.created + counts.updated;
  const previewRows = normalized.rows.slice(0, 10).map(row => {
    const values = row.values || {};
    return `<tr><td>${h(row.rowNumber)}</td><td>${h(values.name || "")}</td><td>${h(values.provider || "—")}</td><td>${h(values.offeringType || "Integrated solution")}</td><td>${row.catalogId ? "Update" : "Add"}</td></tr>`;
  }).join("");
  const sourceLabel = table.sourceType === "xlsx" ? `Excel · ${table.sheetName || "visible worksheet"}` : "UTF-8 CSV";
  const statusCopy = plan.valid
    ? actionable
      ? `${actionable} catalog change${actionable === 1 ? " is" : "s are"} ready to apply.`
      : "The file is valid, but it contains no new or changed offerings to apply."
    : `${counts.errors} error${counts.errors === 1 ? " must" : "s must"} be corrected before this list can be applied.`;
  const applyLabel = actionable ? `Apply ${actionable} change${actionable === 1 ? "" : "s"}` : "Nothing to apply";
  openModal("Review Knowledge Base import", `<div class="knowledge-import-summary"><div><span class="file-format-badge">${h(sourceLabel)}</span><h3>${h(fileName)}</h3><p>${h(formatImportFileSize(fileSize))} · ${counts.dataRows} data row${counts.dataRows === 1 ? "" : "s"}${counts.blankRows ? ` · ${counts.blankRows} blank row${counts.blankRows === 1 ? "" : "s"} ignored` : ""}</p></div><button class="button secondary" type="button" data-knowledge-list-import>Choose another file</button></div><fieldset class="knowledge-import-mode"><legend>Import behavior</legend><label><input type="radio" name="knowledge-import-mode" value="add" data-knowledge-import-mode ${mode === "add" ? "checked" : ""}><span><strong>Add new offerings only</strong><small>Catalog ID must be blank on every row.</small></span></label><label><input type="radio" name="knowledge-import-mode" value="upsert" data-knowledge-import-mode ${mode === "upsert" ? "checked" : ""}><span><strong>Add new and update by Catalog ID</strong><small>Updates require the exact Expected Revision and a Change Summary.</small></span></label></fieldset><dl class="knowledge-import-counts" aria-label="Import preview totals"><div><dt>New</dt><dd>${counts.created}</dd></div><div><dt>Updated</dt><dd>${counts.updated}</dd></div><div><dt>Unchanged</dt><dd>${counts.unchanged}</dd></div><div><dt>Warnings</dt><dd>${counts.warnings}</dd></div><div class="${counts.errors ? "has-errors" : ""}"><dt>Errors</dt><dd>${counts.errors}</dd></div></dl><p class="knowledge-import-status ${plan.valid ? "ready" : "blocked"}" role="status" aria-live="polite">${h(statusCopy)}</p>${previewRows ? `<section class="knowledge-import-preview"><h3>Row preview</h3><div class="table-scroll"><table><thead><tr><th>Row</th><th>Name</th><th>Provider / owner</th><th>Offering type</th><th>Action</th></tr></thead><tbody>${previewRows}</tbody></table></div>${normalized.rows.length > 10 ? `<p>${normalized.rows.length - 10} more row${normalized.rows.length - 10 === 1 ? "" : "s"} will be included in the same validation and apply step.</p>` : ""}</section>` : ""}<section class="knowledge-import-findings"><h3>Validation findings</h3>${importDiagnosticList(plan.diagnostics)}</section><p class="knowledge-import-boundary"><strong>Existing solution copies stay unchanged.</strong> Refresh a copied offering explicitly from its Knowledge Base card when you want the newer facts.</p><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="button" data-knowledge-list-apply ${!plan.valid || !actionable ? "disabled" : ""}>${h(applyLabel)}</button></div>`, { wide: true });
  if (focusSelector) document.querySelector(focusSelector)?.focus();
}

async function importKnowledgeListFile(file) {
  if (!file) return;
  const generation = ++knowledgeImportGeneration;
  const input = document.querySelector("#knowledge-list-import");
  try {
    if (knowledgeBaseLoadError) throw new Error("Restore a valid JSON catalog backup before importing a spreadsheet list.");
    if (file.size === 0) throw new Error("The selected file is empty.");
    if (file.size > MAX_KNOWLEDGE_IMPORT_BYTES) throw new Error("Knowledge Base list import exceeds 5 MB.");
    const fileName = String(file.name || "knowledge-base-list").split(/[\\/]/).at(-1).slice(0, 255);
    const bytes = await file.arrayBuffer();
    if (generation !== knowledgeImportGeneration) return;
    let table;
    if (/\.csv$/i.test(fileName)) table = parseKnowledgeCsv(bytes);
    else if (/\.xlsx$/i.test(fileName)) {
      if (!window.XLSX?.read) throw new Error("The repository-bundled Excel reader is unavailable.");
      let workbook;
      try {
        workbook = window.XLSX.read(bytes, { type: "array", cellDates: false, cellFormula: true, cellHTML: false, cellStyles: true, bookVBA: true, bookDeps: false, WTF: false });
      } catch {
        throw new Error("The Excel workbook could not be read. Use an unencrypted .xlsx file or the provided template.");
      }
      table = parseKnowledgeWorkbook(workbook, { xlsx: window.XLSX });
    } else throw new Error("Choose an .xlsx workbook or UTF-8 .csv file.");
    const normalized = normalizeKnowledgeImportRows(table);
    knowledgeImportSession = { fileName, fileSize: file.size, table, normalized, mode: "add", baseSavedAt: knowledgeBase.savedAt, plan: null };
    refreshKnowledgeImportPlan("add");
    showKnowledgeImportPreview();
  } catch (error) {
    knowledgeImportSession = null;
    openModal("Knowledge Base list rejected", `<div class="knowledge-import-alert error" role="alert"><strong>The file was not imported</strong><span>${h(error.message || "The selected file could not be read.")}</span></div><p>Use the provided Excel or CSV template, keep one offering per row, and try again. The current Knowledge Base was not changed.</p><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button><button class="button primary" type="button" data-knowledge-template>Open templates</button></div>`);
  } finally {
    if (input?.isConnected) input.value = "";
    else {
      const current = document.querySelector("#knowledge-list-import");
      if (current) current.value = "";
    }
  }
}

function currentStoredKnowledgeBaseSavedAt() {
  const raw = localStorage.getItem(KNOWLEDGE_BASE_STORAGE_KEY);
  if (raw === null) return "";
  const candidate = JSON.parse(raw);
  const validation = validateKnowledgeBase(candidate);
  if (!validation.valid) throw new Error("The saved Knowledge Base changed into an unreadable state. Reload before importing.");
  return candidate.savedAt;
}

function applyKnowledgeListImport() {
  const session = knowledgeImportSession;
  if (!session?.plan?.valid || !session.plan.nextCatalog) return;
  const actionable = session.plan.counts.created + session.plan.counts.updated;
  if (!actionable) return;
  try {
    const storedSavedAt = currentStoredKnowledgeBaseSavedAt();
    if (knowledgeBase.savedAt !== session.baseSavedAt || storedSavedAt !== session.baseSavedAt) throw new Error("The Knowledge Base changed after this preview was created. Close the preview, reload, and review the file again.");
    if (!persistKnowledgeBase(session.plan.nextCatalog)) return;
    const { created, updated } = session.plan.counts;
    closeModal();
    render();
    const changes = [created ? `${created} offering${created === 1 ? "" : "s"} added` : "", updated ? `${updated} offering${updated === 1 ? "" : "s"} updated` : ""].filter(Boolean).join(" and ");
    toast(`${changes}. Existing solution copies were not changed.`, "ok");
  } catch (error) {
    toast(`Knowledge Base list was not applied: ${error.message}`, "error");
  }
}

function exportKnowledgeBaseJson() {
  if (knowledgeBaseLoadError) { toast("The unreadable catalog was left unchanged and cannot be exported from this view. Import a valid backup to recover.", "error"); return; }
  download(`solution-knowledge-base-${formatLocalDate()}.json`, JSON.stringify(knowledgeBase, null, 2), "application/json;charset=utf-8");
}

async function importKnowledgeBaseFile(file) {
  if (!file) return;
  try {
    if (file.size > MAX_KNOWLEDGE_IMPORT_BYTES) throw new Error("Knowledge Base import exceeds 5 MB.");
    const candidate = JSON.parse(await file.text());
    const result = validateKnowledgeBase(candidate);
    if (!result.valid) throw new Error(result.errors[0]);
    if (!persistKnowledgeBase(candidate, { renderAfter: true, replaceInvalidStore: true })) return;
    toast(`${candidate.items.length} Knowledge Base item${candidate.items.length === 1 ? "" : "s"} imported.`, "ok");
  } catch (error) {
    toast(`Knowledge Base import rejected: ${error.message}`, "error");
  } finally {
    const input = document.querySelector("#knowledge-import");
    if (input) input.value = "";
  }
}

function addAnalysisOfAlternatives() {
  const created = { ...ADD_DEFAULTS.trades(), id: makeId("aoa"), title: "New Analysis of Alternatives", analysisType: "Analysis of Alternatives", solutionId: workspace.activeSolutionId };
  commit(next => next.trades.push(created), { snapshot: "Before adding Analysis of Alternatives" });
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
      for (const trade of next.trades) trade.evidenceIds = (trade.evidenceIds || []).filter(evidenceId => evidenceId !== id);
    }
    if (collection === "hotButtons") {
      for (const requirement of next.requirements) requirement.linkedHotButtonIds = (requirement.linkedHotButtonIds || []).filter(hotButtonId => hotButtonId !== id);
      for (const winTheme of next.winThemes) winTheme.linkedHotButtonIds = (winTheme.linkedHotButtonIds || []).filter(hotButtonId => hotButtonId !== id);
    }
    if (collection === "criteria") for (const candidate of next.candidates) candidate.scores = (candidate.scores || []).filter(score => score.criterionId !== id);
    if (collection === "candidates") for (const trade of next.trades) {
      trade.optionIds = (trade.optionIds || []).filter(optionId => optionId !== id);
      if (trade.baselineOptionId === id) trade.baselineOptionId = "";
    }
    if (collection === "requirements") for (const outcome of next.outcomes) outcome.linkedRequirementIds = (outcome.linkedRequirementIds || []).filter(requirementId => requirementId !== id);
    remove(collection, item => item.id === id);
  }, { snapshot: `Before deleting ${collection}` });
  if (selectedElementId === id) selectedElementId = "";
  if (selectedCandidateId === id) selectedCandidateId = "";
  if (selectedViewId === id) selectedViewId = "";
}

function showQuickCapture() {
  const solution = activeSolution();
  const segmentText = (solution.missionSegments || []).join(" · ") || "No company mission segment selected";
  openModal("Quick capture", `<form id="quick-capture-form">
    <p class="modal-intro">Capture once, classify now or refine later. This creates a proposal in the <strong>${h(solution.name)}</strong> review inbox; it does not change an authoritative workspace record.</p>
    <p class="capture-context"><strong>Active solution</strong><span>${h(segmentText)}</span></p>
    <button class="capture-path" type="button" data-action="meeting-capture"><strong>Meeting transcript or summary</strong><span>Select only the useful excerpts and tag them to company mission segments.</span></button>
    <div class="form-grid">
      <label class="field"><span>Proposed record type</span><select name="target">${captureTargetOptions("evidence")}</select></label>
      <label class="field"><span>Source / interaction</span><input name="source" maxlength="300" placeholder="Meeting, email, field note, document, or observation"></label>
      <label class="field span-2"><span>Short title or statement</span><input name="title" maxlength="280" required autofocus placeholder="What needs to be remembered or reviewed?"><small>Keep the short title to 280 characters or fewer; put supporting detail below.</small></label>
      <label class="field span-2"><span>Context, excerpt, or rationale</span><textarea name="detail" rows="6" maxlength="6000" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" placeholder="Paste the smallest useful excerpt and preserve the context needed to evaluate it."></textarea><small>Ctrl/Command + Enter saves and keeps Quick capture open. Alt + Q opens this dialog from anywhere.</small></label>
    </div>
    <div class="guide-note warning"><strong>Review boundary</strong><p>Use approved unclassified, non-CUI information only. Inbox proposals remain separate until you explicitly review and commit them.</p></div>
    <div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button secondary" type="submit" name="next" value="continue">Save & continue</button><button class="button primary" type="submit" name="next" value="review">Save & review inbox</button></div>
  </form>`, { wide: true });
}

function captureSupplementalControls(item) {
  const disabled = item.status === "pending" ? "" : "disabled";
  if (item.target === "evidence") return `<label><span>Initial confidence</span><select data-capture-field="confidence" data-capture-id="${h(item.id)}" ${disabled}>${["Low", "Medium", "High", "Conflicting"].map(value => option(value, value, item.fields.confidence)).join("")}</select></label>`;
  if (item.target === "requirement") return `<label><span>Type</span><select data-capture-field="type" data-capture-id="${h(item.id)}" ${disabled}>${["Functional", "Performance", "Interface", "Data", "Cyber", "Safety", "Resilience", "Physical", "Sustainment"].map(value => option(value, value, item.fields.type)).join("")}</select></label><label><span>Priority</span><select data-capture-field="priority" data-capture-id="${h(item.id)}" ${disabled}>${["Must", "Should", "Could"].map(value => option(value, value, item.fields.priority)).join("")}</select></label>`;
  if (item.target === "risk") return `<label><span>Likelihood</span><select data-capture-field="likelihood" data-capture-id="${h(item.id)}" ${disabled}>${["Unknown", "Low", "Medium", "High"].map(value => option(value, value, item.fields.likelihood)).join("")}</select></label><label><span>Impact</span><select data-capture-field="impact" data-capture-id="${h(item.id)}" ${disabled}>${["Unknown", "Low", "Medium", "High"].map(value => option(value, value, item.fields.impact)).join("")}</select></label><label class="span-2"><span>Initial mitigation (optional)</span><textarea rows="2" maxlength="3000" data-capture-field="mitigation" data-capture-id="${h(item.id)}" ${disabled}>${h(item.fields.mitigation)}</textarea></label>`;
  return "";
}

function captureInboxCard(item) {
  const provenance = captureInbox.provenance.find(record => record.id === item.provenanceId);
  const pending = item.status === "pending";
  const linkedEvidence = item.target !== "evidence" && item.evidenceProposalId
    ? captureInbox.items.find(candidate => candidate.proposalId === item.evidenceProposalId)
    : null;
  const titleLimit = captureTitleMax(item.target);
  return `<article class="capture-card ${pending ? "" : "capture-complete"}" data-capture-card="${h(item.id)}"><div class="capture-card-head"><label class="capture-select"><input type="checkbox" data-capture-select value="${h(item.id)}" ${pending ? "checked" : "disabled"}><span class="visually-hidden">Select ${h(captureTitle(item))}</span></label><div><span class="capture-status">${h(item.status)}</span><strong>${h(sourceLabel(provenance))}</strong></div><label class="capture-target"><span>Map to</span><select data-capture-target data-capture-id="${h(item.id)}" ${pending ? "" : "disabled"}>${captureTargetOptions(item.target)}</select></label></div><div class="capture-card-fields"><label class="span-2"><span>${item.target === "assumption" ? "Assumption statement" : item.target === "ignore" ? "Reason to ignore" : "Proposed title"}</span><input value="${h(captureTitle(item))}" maxlength="${titleLimit}" data-capture-title data-capture-id="${h(item.id)}" ${pending ? "" : "disabled"}><small>Maximum ${titleLimit.toLocaleString()} characters for ${h(CAPTURE_TARGET_LABELS[item.target]).toLowerCase()}.</small></label><label class="span-2"><span>Selected excerpt / context</span><textarea rows="4" maxlength="6000" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-capture-detail data-capture-id="${h(item.id)}" ${pending ? "" : "disabled"}>${h(captureDetail(item))}</textarea></label>${captureSupplementalControls(item)}</div>${linkedEvidence ? `<p class="capture-link-note">Source evidence will be committed in the same batch: <strong>${h(captureTitle(linkedEvidence))}</strong></p>` : ""}</article>`;
}

function showCaptureInbox() {
  const pending = captureInbox.items.filter(item => item.status === "pending");
  const completed = captureInbox.items.length - pending.length;
  openModal("Review capture inbox", `<div class="capture-inbox"><p class="modal-intro">Nothing enters the authoritative solution until you select proposals and commit them. Every proposal is locked to <strong>${h(activeSolution().name)}</strong>.</p><div class="capture-summary"><div><span>Pending review</span><strong>${pending.length}</strong></div><div><span>Completed / ignored</span><strong>${completed}</strong></div><div><span>Source records</span><strong>${captureInbox.provenance.length}</strong></div></div>${captureInbox.items.length ? `<div class="capture-list">${captureInbox.items.map(captureInboxCard).join("")}</div>` : emptyState("Inbox is clear", "Use Quick capture, paste customer hot buttons, or open local files to create reviewable proposals.", `<button class="button primary" type="button" data-action="quick-capture">Start a capture</button>`) }<div class="modal-actions capture-inbox-actions"><button class="button secondary" type="button" data-capture-export>Download inbox JSON</button>${completed ? `<button class="button secondary" type="button" data-capture-clear>Clear completed</button>` : ""}<button class="button secondary" type="button" data-close-modal>Close</button><button class="button primary" type="button" data-capture-commit ${pending.length ? "" : "disabled"}>Commit selected proposals</button></div></div>`, { wide: true });
}

function updateCaptureItem(itemId, updater, { rerender = false } = {}) {
  const next = structuredClone(captureInbox);
  const item = next.items.find(candidate => candidate.id === itemId && candidate.status === "pending");
  if (!item) return false;
  try {
    updater(item, next);
  } catch (error) {
    toast(error.message, "error");
    if (rerender) showCaptureInbox();
    return false;
  }
  next.updatedAt = new Date().toISOString();
  if (!persistCaptureInbox(next)) {
    if (rerender) showCaptureInbox();
    return false;
  }
  if (rerender) showCaptureInbox();
  return true;
}

function changeCaptureTarget(itemId, target) {
  if (!CAPTURE_TARGETS.includes(target)) return;
  updateCaptureItem(itemId, (item, next) => {
    if (item.target === "evidence" && target !== "evidence" && next.items.some(candidate => candidate.id !== item.id && candidate.evidenceProposalId === item.proposalId)) {
      throw new Error("This source evidence is linked to another pending proposal. Change or commit the linked proposal first.");
    }
    const provenance = next.provenance.find(record => record.id === item.provenanceId);
    const evidenceProposalId = target === "evidence" || item.target === "evidence" || !EVIDENCE_LINK_TARGETS.has(target)
      ? ""
      : item.evidenceProposalId;
    const replacement = createCaptureItem(item.solutionId, {
      id: item.id,
      provenanceId: item.provenanceId,
      target,
      excerpt: item.excerpt,
      evidenceProposalId,
      fields: fieldsForCapture(target, captureTitle(item), captureDetail(item), sourceLabel(provenance))
    });
    next.items.splice(next.items.indexOf(item), 1, replacement);
  }, { rerender: true });
}

function commitCaptureSelection() {
  const itemIds = [...document.querySelectorAll("[data-capture-select]:checked")].map(input => input.value);
  if (!itemIds.length) { toast("Select at least one pending capture proposal.", "error"); return; }
  let base = pushSnapshot(workspace, "Before committing capture inbox");
  const solution = base.solutions.find(item => item.id === base.activeSolutionId);
  if (solution) solution.updatedAt = new Date().toISOString();
  const result = materializeCaptureItems(base, captureInbox, { itemIds });
  if (!result.valid) { toast(`Capture commit blocked: ${result.errors[0]}`, "error"); return; }
  const savedAt = new Date().toISOString();
  const persistedWorkspace = { ...result.nextWorkspace, savedAt };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedWorkspace));
  } catch {
    toast("Capture commit was not applied because the workspace could not be saved.", "error");
    return;
  }
  workspace = persistedWorkspace;
  dirty = false;
  try {
    localStorage.setItem(captureStorageKey(result.nextInbox.solutionId), JSON.stringify(result.nextInbox));
    captureInbox = result.nextInbox;
  } catch {
    toast("Workspace records were saved, but the inbox status could not be updated. Retrying is safe and will not create duplicates.", "error");
    closeModal();
    render();
    return;
  }
  closeModal();
  render();
  toast(`${result.materializedItemIds.length} capture proposal${result.materializedItemIds.length === 1 ? "" : "s"} committed.`, "ok");
}

function clearCompletedCaptures() {
  const next = structuredClone(captureInbox);
  next.items = next.items.filter(item => item.status === "pending");
  const sourceIds = new Set(next.items.map(item => item.provenanceId).filter(Boolean));
  next.provenance = next.provenance.filter(item => sourceIds.has(item.id));
  next.updatedAt = new Date().toISOString();
  if (persistCaptureInbox(next)) showCaptureInbox();
}

function clearIngestionSession() {
  ingestionGeneration += 1;
  ingestionProcessing = false;
  ingestionAbortController?.abort();
  ingestionAbortController = null;
  for (const url of new Set(ingestionSession.map(item => item.previewUrl).filter(Boolean))) URL.revokeObjectURL(url);
  ingestionSession = [];
  ingestionAcknowledged = false;
}

function intakeResultCard(item) {
  if (item.error) return `<article class="intake-card intake-error"><div class="intake-card-head"><strong>${h(item.filename)}</strong><span>Rejected</span></div><p>${h(item.error)}</p></article>`;
  const result = item.result;
  const sections = result.sections || [];
  const titleLimit = captureTitleMax(item.target);
  return `<article class="intake-card" data-intake-card="${h(item.id)}"><div class="intake-card-head"><label class="capture-select"><input type="checkbox" data-intake-select data-intake-id="${h(item.id)}" ${item.selected ? "checked" : ""}><span class="visually-hidden">Select ${h(result.filename)}</span></label><div><strong>${h(result.filename)}</strong><span>${h(result.format.toUpperCase())} · ${(result.sizeBytes / 1024).toFixed(1)} KB · SHA-256 ${h(result.sha256.slice(0, 12))}…</span></div><button class="small-button" type="button" data-intake-duplicate="${h(item.id)}">＋ Another excerpt</button></div>${item.previewUrl ? `<img class="intake-image-preview" src="${h(item.previewUrl)}" alt="Local preview of ${h(result.filename)}">` : ""}<div class="intake-fields"><label><span>Map selected excerpt to</span><select data-intake-target data-intake-id="${h(item.id)}">${captureTargetOptions(item.target)}</select></label>${sections.length ? `<label><span>Source section</span><select data-intake-section data-intake-id="${h(item.id)}"><option value="-1">Entire extracted preview</option>${sections.map((section, index) => option(String(index), `${section.label || `Section ${index + 1}`} — ${section.locator}`, String(item.sectionIndex))).join("")}</select></label>` : `<label><span>Source locator</span><input value="${h(item.locator)}" maxlength="500" data-intake-locator data-intake-id="${h(item.id)}"></label>`}<label class="span-2"><span>Proposed title</span><input value="${h(item.title)}" maxlength="${titleLimit}" data-intake-title data-intake-id="${h(item.id)}"><small data-intake-title-limit>Maximum ${titleLimit.toLocaleString()} characters for ${h(CAPTURE_TARGET_LABELS[item.target]).toLowerCase()}.</small></label><label class="span-2"><span>${result.needsManualText ? "Manual caption or transcription (no OCR is performed)" : "Selected excerpt"}</span><textarea rows="7" maxlength="6000" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-intake-excerpt data-intake-id="${h(item.id)}" placeholder="${result.needsManualText ? "Describe only what you can verify in the image." : "Keep only the text needed for this proposed record."}">${h(item.excerpt)}</textarea></label></div>${result.diagnostics.length ? `<ul class="intake-diagnostics">${result.diagnostics.map(note => `<li>${h(note.message)}</li>`).join("")}</ul>` : ""}</article>`;
}

function showFileIntake() {
  openModal("Open local files", `<div id="file-intake-workflow">
    <p class="modal-intro">Files are opened and extracted locally in this browser. They are not uploaded. Reviewable excerpts can be copied to the active solution's capture inbox; original file bytes are discarded when you close this dialog.</p>
    <button class="capture-path" type="button" data-action="meeting-capture"><strong>Have meeting text instead?</strong><span>Paste a transcript or summary and preserve only selected excerpts.</span></button>
    <label class="intake-ack"><input type="checkbox" id="intake-ack" ${ingestionAcknowledged ? "checked" : ""}> <span>I confirm these files are approved unclassified, non-CUI and contain no classified, export-controlled, proprietary, or customer-restricted information.</span></label>
    <label class="source-drop-zone" id="source-drop-zone"><strong>Choose or drop local files</strong><span>TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, or WebP · 8 MB each · 10 files / 25 MB per session</span><input id="source-files" type="file" multiple accept="${h(SOURCE_FILE_ACCEPT)}" ${ingestionAcknowledged ? "" : "disabled"}></label>
    <p id="intake-progress" class="intake-progress" aria-live="polite"></p>
    ${ingestionSession.length ? `<div class="intake-list">${ingestionSession.map(intakeResultCard).join("")}</div>` : `<div class="guide-note"><strong>Safe extraction, not source validation</strong><p>PDF and Office layout may not reproduce exactly. Images are previewed locally and require a manual caption; no OCR or AI classification runs. Verify every excerpt and locator before committing it.</p></div>`}
    <div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="button" data-intake-add ${ingestionSession.some(item => !item.error && item.selected) ? "" : "disabled"}>Add selected excerpts to review inbox</button></div>
  </div>`, { wide: true, transient: "file" });
}

async function processSourceFiles(files) {
  const selected = [...files];
  if (!ingestionAcknowledged) { toast("Confirm the data-handling acknowledgment before opening files.", "error"); return; }
  if (ingestionProcessing) { toast("Wait for the current local files to finish opening before adding more.", "error"); return; }
  if (ingestionSession.length + selected.length > MAX_INTAKE_FILES) { toast(`A local intake session is limited to ${MAX_INTAKE_FILES} files.`, "error"); return; }
  const currentBytes = ingestionSession.reduce((total, item) => total + (item.result?.sizeBytes || 0), 0);
  const incomingBytes = selected.reduce((total, file) => total + file.size, 0);
  if (currentBytes + incomingBytes > MAX_INTAKE_BYTES) { toast("A local intake session is limited to 25 MB total.", "error"); return; }
  const generation = ingestionGeneration;
  const abortController = new AbortController();
  ingestionAbortController = abortController;
  ingestionProcessing = true;
  const progress = document.querySelector("#intake-progress");
  const workflow = document.querySelector("#file-intake-workflow");
  workflow?.setAttribute("aria-busy", "true");
  const input = workflow?.querySelector("#source-files");
  if (input) input.disabled = true;
  try {
    for (const [index, file] of selected.entries()) {
      if (generation !== ingestionGeneration || !document.querySelector("#file-intake-workflow")) return;
      if (progress) progress.textContent = `Opening ${index + 1} of ${selected.length}: ${file.name}`;
      let previewUrl = "";
      try {
        if (file.size > MAX_SOURCE_FILE_BYTES) throw new Error("This file exceeds the 8 MB local extraction limit.");
        const result = await extractLocalSource(file, { signal: abortController.signal });
        if (generation !== ingestionGeneration || !document.querySelector("#file-intake-workflow")) return;
        if (["png", "jpg", "webp"].includes(result.format)) previewUrl = URL.createObjectURL(file);
        const title = result.filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || result.filename;
        ingestionSession.push({ id: makeId("intake"), filename: result.filename, result, previewUrl, selected: true, target: "evidence", title, excerpt: result.text.slice(0, 6000), locator: result.locator, sectionIndex: -1 });
      } catch (error) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (generation !== ingestionGeneration || !document.querySelector("#file-intake-workflow")) return;
        ingestionSession.push({ id: makeId("intake"), filename: file.name.slice(0, 255), error: String(error.message || error).slice(0, 500), selected: false });
      }
    }
    if (generation !== ingestionGeneration || !document.querySelector("#file-intake-workflow")) return;
    ingestionProcessing = false;
    showFileIntake();
    const summary = ingestionSession.filter(item => !item.error).length;
    const currentProgress = document.querySelector("#intake-progress");
    if (currentProgress) currentProgress.textContent = `${summary} file${summary === 1 ? "" : "s"} ready for excerpt review.`;
  } finally {
    if (generation === ingestionGeneration) {
      ingestionProcessing = false;
      if (ingestionAbortController === abortController) ingestionAbortController = null;
      const currentWorkflow = document.querySelector("#file-intake-workflow");
      currentWorkflow?.removeAttribute("aria-busy");
      const currentInput = currentWorkflow?.querySelector("#source-files");
      if (currentInput) currentInput.disabled = !ingestionAcknowledged;
    }
  }
}

function addIntakeToCaptureInbox() {
  const selectedIds = new Set([...document.querySelectorAll("[data-intake-select]:checked")].map(input => input.dataset.intakeId));
  const selected = ingestionSession.filter(item => selectedIds.has(item.id) && !item.error);
  if (!selected.length) { toast("Select at least one extracted source excerpt.", "error"); return; }
  const oversizedTitle = selected.find(item => item.title.length > captureTitleMax(item.target));
  if (oversizedTitle) { toast(`Shorten the proposed ${CAPTURE_TARGET_LABELS[oversizedTitle.target].toLowerCase()} title to ${captureTitleMax(oversizedTitle.target).toLocaleString()} characters or fewer.`, "error"); return; }
  if (selected.some(item => item.target !== "ignore" && !item.excerpt.trim())) { toast("Every selected source needs an excerpt or a verified manual image caption.", "error"); return; }
  const next = structuredClone(captureInbox);
  try {
    for (const item of selected) {
      const provenance = createCaptureProvenance(next.solutionId, { sourceFileName: item.result.filename, sourceTitle: item.result.filename, locator: item.locator, sha256: item.result.sha256 });
      next.provenance.push(provenance);
      if (item.target === "ignore") {
        next.items.push(createCaptureItem(next.solutionId, { provenanceId: provenance.id, target: "ignore", excerpt: item.excerpt, fields: fieldsForCapture("ignore", item.title, item.excerpt) }));
        continue;
      }
      const source = sourceLabel(provenance);
      const evidenceTitle = item.target === "evidence" ? item.title : companionEvidenceTitle(item.title);
      const evidence = createCaptureItem(next.solutionId, { provenanceId: provenance.id, target: "evidence", excerpt: item.excerpt, fields: fieldsForCapture("evidence", evidenceTitle, item.excerpt, source) });
      next.items.push(evidence);
      if (item.target !== "evidence") {
        const evidenceProposalId = EVIDENCE_LINK_TARGETS.has(item.target) ? evidence.proposalId : "";
        next.items.push(createCaptureItem(next.solutionId, { provenanceId: provenance.id, target: item.target, excerpt: item.excerpt, evidenceProposalId, fields: fieldsForCapture(item.target, item.title, item.excerpt, source) }));
      }
    }
    next.updatedAt = new Date().toISOString();
  } catch (error) {
    toast(`Source excerpts could not be prepared: ${error.message}`, "error");
    return;
  }
  if (!persistCaptureInbox(next)) return;
  const count = selected.length;
  clearIngestionSession();
  showCaptureInbox();
  toast(`${count} source excerpt${count === 1 ? "" : "s"} added for review. Original file bytes were discarded.`, "ok");
}

function meetingExcerptCard(excerpt, index) {
  return `<article class="meeting-excerpt" data-meeting-excerpt-card="${h(excerpt.id)}">
    <div><span>Excerpt ${index + 1}</span><strong>${h(excerpt.locator)}</strong></div>
    <p>${h(excerpt.text)}</p>
    <button class="small-button" type="button" data-meeting-remove="${h(excerpt.id)}" aria-label="Remove excerpt ${index + 1}">Remove</button>
  </article>`;
}

function showMeetingIntake({ fresh = false, focusSelector = "" } = {}) {
  if (fresh || !meetingSession || meetingSession.solutionId !== workspace.activeSolutionId) meetingSession = createMeetingSession();
  const session = meetingSession;
  const textLength = session.text.length;
  const wholeSummaryReady = session.acknowledged && session.sourceType === "Meeting summary" && textLength > 0 && textLength <= MAX_MEETING_EXCERPT_CHARS;
  openModal("Paste meeting transcript or summary", `<div id="meeting-intake-workflow">
    <p class="modal-intro">Paste meeting text temporarily, select only the excerpts that matter, and stage them as source evidence for review. The complete transcript or summary is discarded when this dialog closes.</p>
    <label class="intake-ack"><input type="checkbox" id="meeting-ack" ${session.acknowledged ? "checked" : ""}> <span>I confirm this meeting content is approved unclassified, non-CUI and contains no classified, export-controlled, proprietary, or customer-restricted information.</span></label>
    <div class="form-grid meeting-metadata">
      <label class="field"><span>Meeting title</span><input data-meeting-field="title" value="${h(session.title)}" maxlength="280" placeholder="Example: Synthetic mission integration review" autofocus></label>
      <label class="field"><span>Content type</span><select data-meeting-field="sourceType">${option("Meeting transcript", "Transcript", session.sourceType)}${option("Meeting summary", "Summary", session.sourceType)}</select></label>
      <label class="field"><span>Meeting date</span><input type="date" data-meeting-field="meetingDate" value="${h(session.meetingDate)}"></label>
      <label class="field"><span>Participants</span><input data-meeting-field="participantsText" value="${h(session.participantsText)}" maxlength="3000" placeholder="Names or roles, separated by commas"></label>
      <fieldset class="mission-segments span-2"><legend>Company mission segment(s)</legend><p>Tag every segment this meeting excerpt informs.</p><div class="mission-segment-grid">${MISSION_SEGMENTS.map(segment => `<label class="mission-segment-option"><input type="checkbox" value="${h(segment.name)}" data-meeting-segment ${session.missionSegments.includes(segment.name) ? "checked" : ""}><span><strong>${h(segment.name)}</strong><small>${h(segment.description)}</small></span></label>`).join("")}</div></fieldset>
      <label class="field span-2"><span>${session.sourceType}</span><textarea id="meeting-source-text" data-meeting-field="text" rows="12" maxlength="${MAX_MEETING_TEXT_CHARS}" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" ${session.acknowledged ? "" : "disabled"} placeholder="Paste the meeting ${session.sourceType === "Meeting summary" ? "summary" : "transcript"} here. Select the exact text you want to preserve.">${h(session.text)}</textarea><small><span id="meeting-text-count">${textLength.toLocaleString()}</span> / ${MAX_MEETING_TEXT_CHARS.toLocaleString()} characters · Full text is transient and is never saved to browser storage.</small></label>
    </div>
    <div class="meeting-selection-actions">
      <button class="button secondary" type="button" data-meeting-add-selection ${session.acknowledged ? "" : "disabled"}>Add highlighted excerpt</button>
      ${session.sourceType === "Meeting summary" ? `<button class="button secondary" type="button" data-meeting-add-summary ${wholeSummaryReady ? "" : "disabled"}>Use whole short summary</button>` : ""}
      <span>Up to ${MAX_MEETING_EXCERPTS} excerpts · ${MAX_MEETING_EXCERPT_CHARS.toLocaleString()} characters each</span>
    </div>
    <div class="meeting-excerpts" aria-live="polite">${session.excerpts.length ? session.excerpts.map(meetingExcerptCard).join("") : `<div class="empty-state"><strong>No excerpts selected</strong><p>Highlight a bounded passage in the meeting text, then add it here.</p></div>`}</div>
    <div class="guide-note warning"><strong>Evidence, not automatic authority</strong><p>Meeting statements remain source evidence. Validate them before turning them into requirements, commitments, customer hot buttons, or win-theme claims.</p></div>
    <div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel and discard full text</button><button class="button primary" type="button" data-meeting-stage ${session.excerpts.length ? "" : "disabled"}>Stage ${session.excerpts.length || "selected"} excerpt${session.excerpts.length === 1 ? "" : "s"} for review</button></div>
  </div>`, { wide: true, transient: "meeting" });
  if (focusSelector) document.querySelector(`#meeting-intake-workflow ${focusSelector}`)?.focus();
}

function addMeetingExcerpt({ wholeSummary = false } = {}) {
  if (!meetingSession?.acknowledged) { toast("Confirm the data-handling acknowledgment before pasting meeting content.", "error"); return; }
  if (meetingSession.excerpts.length >= MAX_MEETING_EXCERPTS) { toast(`A meeting intake is limited to ${MAX_MEETING_EXCERPTS} excerpts.`, "error"); return; }
  const textarea = document.querySelector("#meeting-source-text");
  if (!textarea) return;
  meetingSession.text = textarea.value;
  let start = 0;
  let end = meetingSession.text.length;
  if (wholeSummary) {
    if (meetingSession.sourceType !== "Meeting summary") return;
  } else {
    start = textarea.selectionStart;
    end = textarea.selectionEnd;
    if (start === end) { toast("Highlight the exact transcript or summary passage you want to preserve.", "error"); return; }
  }
  const excerptText = meetingSession.text.slice(start, end).trim();
  if (!excerptText) { toast("The selected meeting excerpt is empty.", "error"); return; }
  if (excerptText.length > MAX_MEETING_EXCERPT_CHARS) { toast(`Meeting excerpts are limited to ${MAX_MEETING_EXCERPT_CHARS.toLocaleString()} characters. Select a smaller passage.`, "error"); return; }
  if (meetingSession.excerpts.some(excerpt => excerpt.text === excerptText)) { toast("That exact meeting excerpt is already selected.", "error"); return; }
  meetingSession.excerpts.push({
    id: makeId("meeting_excerpt"),
    text: excerptText,
    locator: wholeSummary ? "Complete meeting summary" : meetingLineLocator(meetingSession.text, start, end),
    start,
    end,
    sourceType: meetingSession.sourceType
  });
  showMeetingIntake({ focusSelector: "[data-meeting-add-selection]" });
}

function removeMeetingExcerpt(excerptId) {
  if (!meetingSession) return;
  meetingSession.excerpts = meetingSession.excerpts.filter(excerpt => excerpt.id !== excerptId);
  showMeetingIntake({ focusSelector: "[data-meeting-add-selection]" });
}

function stageMeetingExcerpts() {
  if (!meetingSession?.acknowledged) { toast("Confirm the data-handling acknowledgment before staging meeting excerpts.", "error"); return; }
  const title = meetingSession.title.trim();
  if (!title) { toast("Add a meeting title before staging excerpts.", "error"); return; }
  if (!meetingSession.missionSegments.length) { toast("Select at least one company mission segment for this meeting.", "error"); return; }
  if (!meetingSession.excerpts.length) { toast("Select at least one meeting excerpt.", "error"); return; }
  if (meetingSession.excerpts.some(excerpt => excerpt.sourceType !== meetingSession.sourceType || meetingSession.text.slice(excerpt.start, excerpt.end).trim() !== excerpt.text)) {
    discardMeetingExcerpts("The meeting text or content type changed. Re-select the exact excerpts before staging.");
    return;
  }
  const next = structuredClone(captureInbox);
  const participants = meetingParticipants(meetingSession.participantsText);
  try {
    for (const [index, excerpt] of meetingSession.excerpts.entries()) {
      const dateLabel = meetingSession.meetingDate || "Date not recorded";
      const provenance = createCaptureProvenance(next.solutionId, {
        sourceTitle: title,
        locator: `${meetingSession.sourceType} · ${dateLabel} · ${excerpt.locator}`
      });
      const evidenceTitle = (meetingSession.excerpts.length === 1 ? title : `${title} — excerpt ${index + 1}`).slice(0, 280);
      const source = sourceLabel(provenance);
      const fields = {
        ...fieldsForCapture("evidence", evidenceTitle, excerpt.text, source),
        sourceType: meetingSession.sourceType,
        meetingDate: meetingSession.meetingDate,
        participants,
        missionSegments: [...meetingSession.missionSegments]
      };
      next.provenance.push(provenance);
      next.items.push(createCaptureItem(next.solutionId, { provenanceId: provenance.id, target: "evidence", excerpt: excerpt.text, fields }));
    }
    next.updatedAt = new Date().toISOString();
  } catch (error) {
    toast(`Meeting excerpts could not be prepared: ${error.message}`, "error");
    return;
  }
  if (!persistCaptureInbox(next)) return;
  const count = meetingSession.excerpts.length;
  clearMeetingSession();
  showCaptureInbox();
  toast(`${count} meeting excerpt${count === 1 ? "" : "s"} staged as evidence for review. The full meeting text was discarded.`, "ok");
}

function showNewSolution() {
  openModal("Create a solution workspace", `<form id="new-solution-form"><p class="modal-intro">Start with a clean solution and the default Technology Assessment criteria.</p>${field("Solution name", "", `name="name" required maxlength="180" autofocus`)}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Create solution</button></div></form>`);
}

function showSolutionSwitcher() {
  openModal("Switch active solution", `<form id="switch-solution-form"><p class="modal-intro">Choose the independently scoped solution you want to work in.</p>${selectField("Active solution", `name="solutionId" required autofocus`, workspace.solutions.map(item => option(item.id, item.name, workspace.activeSolutionId)).join(""))}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Switch solution</button></div></form>`);
}

function showTools() {
  openModal("Workspace tools", `<div class="tool-sections">
    <section class="tool-section" aria-labelledby="tool-capture-title"><div class="tool-section-head"><h3 id="tool-capture-title">Capture and intake</h3><p>Bring approved facts into the review queue.</p></div><div class="tool-grid">
      <button class="tool-card" type="button" data-action="open-files" aria-label="Open local files"><strong>Open local files</strong><span>Extract reviewable text or preview an approved image without retaining the source file.</span></button>
      <button class="tool-card" type="button" data-action="meeting-capture" aria-label="Paste meeting transcript or summary"><strong>Paste meeting transcript or summary</strong><span>Tag selected excerpts to mission segments without retaining the full meeting text.</span></button>
      <button class="tool-card" type="button" data-action="open-capture-inbox" aria-label="Review capture inbox"><strong>Review capture inbox</strong><span>${pendingCaptureCount()} pending proposal${pendingCaptureCount() === 1 ? "" : "s"} for the active solution.</span></button>
      <button class="tool-card" type="button" data-action="open-ai" aria-label="AI assist"><strong>AI assist</strong><span>Prepare a tightly scoped, reviewed payload for optional authenticated assistance.</span></button>
    </div></section>
    <section class="tool-section" aria-labelledby="tool-workspace-title"><div class="tool-section-head"><h3 id="tool-workspace-title">Workspace and help</h3><p>Change context, recover work, or learn the workflow.</p></div><div class="tool-grid">
      <button class="tool-card" type="button" data-action="new-solution" aria-label="Create a new solution"><strong>Create a new solution</strong><span>Start a clean, independently scoped solution with default assessment criteria.</span></button>
      <button class="tool-card" type="button" data-action="switch-solution" aria-label="Switch active solution"><strong>Switch active solution</strong><span>Choose another isolated solution when the sidebar selector is collapsed.</span></button>
      <button class="tool-card" type="button" data-action="use-system-theme" aria-label="Use device theme" aria-pressed="${themePreference === "system"}"><strong>Use device theme</strong><span>Follow this browser's operating-system light or dark preference.</span></button>
      <button class="tool-card" type="button" data-action="open-guide" aria-label="Open the workbench guide"><strong>Open the workbench guide</strong><span>Use the fast start, lifecycle playbook, capture guidance, and task-oriented user guide.</span></button>
      <button class="tool-card" type="button" data-action="open-recovery" aria-label="Open recovery points"><strong>Open recovery points</strong><span>Restore a validated local snapshot after preserving the current workspace.</span></button>
    </div></section>
    <section class="tool-section" aria-labelledby="tool-backup-title"><div class="tool-section-head"><h3 id="tool-backup-title">Backup and manage</h3><p>Protect, transfer, duplicate, or remove solution data.</p></div><div class="tool-grid">
      <button class="tool-card" type="button" data-tool="export-json" aria-label="Export JSON backup"><strong>Export JSON backup</strong><span>Download the complete validated workspace, including all solutions.</span></button>
      <button class="tool-card" type="button" data-tool="import-json" aria-label="Import JSON backup"><strong>Import JSON backup</strong><span>Validate the entire file before atomically replacing this browser workspace.</span></button>
      <button class="tool-card" type="button" data-tool="snapshot" aria-label="Create recovery point"><strong>Create recovery point</strong><span>Save a bounded local snapshot without nesting older snapshots.</span></button>
      <button class="tool-card" type="button" data-tool="duplicate" aria-label="Duplicate active solution"><strong>Duplicate active solution</strong><span>Create an independent working copy with new record identifiers.</span></button>
      <button class="tool-card danger" type="button" data-tool="delete-solution" aria-label="Delete active solution" ${workspace.solutions.length === 1 ? "disabled" : ""}><strong>Delete active solution</strong><span>Remove the solution and every record bound to it.</span></button>
    </div></section>
  </div>`, { wide: true });
}

function showHotButtonIngest() {
  openModal("Ingest customer hot buttons", `<form id="hot-button-ingest-form"><p class="modal-intro">Paste one priority, concern, sensitivity, or decision driver per line. The workbench preserves these as customer signals—not requirements—until you validate and trace them.</p>${field("Source / interaction", "", `name="source" required maxlength="300" placeholder="Example: customer working session, 2026-08-28"`)}${selectField("Initial confidence", `name="confidence"`, ["Unverified", "Low", "Medium", "High"].map(value => option(value, value, "Medium")).join(""))}${field("Customer hot buttons — one per line", "", `name="items" required maxlength="12000" placeholder="- Avoid vendor lock-in\n- Demonstrate within six months\n- Minimize platform changes"`, { multiline: true, rows: 8, hint: "Up to 50 lines. Bullets and numbered-list prefixes are removed." })}<div class="guide-note warning"><strong>Source discipline</strong><p>Record what you actually heard or observed. Validate the signal before treating it as an evaluation discriminator, proposal claim, or requirement.</p></div><div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">Ingest signals</button></div></form>`, { wide: true });
}

function showGuide() {
  openModal("Solution Architect Workbench guide", `<div class="guide">
    <p class="modal-intro">The architect owns solution coherence and defensibility. The workbench coordinates specialist inputs; it does not replace cyber, safety, systems engineering, test, pricing, contracts, logistics, or domain authorities.</p>
    <div class="guide-note"><strong>Fast start</strong><p>Create or select a solution, choose its company mission segments in Discover, then capture only what you know. Use Capture for one note, Meeting transcript or summary for selected meeting excerpts, and Open local files for bounded document or image evidence. Nothing in the Review inbox changes the solution until you explicitly commit it. Use Command view to choose the next gap and Decision package to review the connected story.</p><p><a href="./guide.html" target="_blank" rel="noopener noreferrer">Open the complete task-oriented user guide →</a></p></div>
    <ol class="guide-steps"><li><strong>Discover</strong><span>Frame the mission, operational context, stakeholders, customer hot buttons, outcomes, measures, constraints, and the exact decision. Preserve each customer signal's source and validation state.</span></li><li><strong>Shape</strong><span>Translate authoritative needs into traceable requirements, nonfunctional requirements, evidence, and acceptance logic. A hot button is not a contractual requirement until it is validated through the proper source.</span></li><li><strong>Assess</strong><span>Compare hardware, software, tools, vendors, platforms, and integrated options. Unknown remains unknown.</span></li><li><strong>Architect</strong><span>Model people, process, hardware, software, data, networks, facilities, and external systems through fit-for-purpose views.</span></li><li><strong>Prove</strong><span>Record trades, decisions, risks, dependencies, reviews, demonstrations, and residual uncertainty.</span></li><li><strong>Propose</strong><span>Build win themes by connecting customer value, a real discriminator, and proof; then carry those themes into the CONOPS and technical narrative.</span></li><li><strong>Transition</strong><span>Handoff configuration, interfaces, evidence, risks, training, sustainment, and ownership into delivery.</span></li></ol>
    <div class="guide-note"><strong>Meeting capture</strong><p>Open Quick capture or Workspace tools, choose Meeting transcript or summary, add the meeting metadata and mission segments, then highlight only the passages worth retaining. The full pasted text is discarded on close; selected excerpts become evidence proposals and remain non-authoritative until review and commit.</p></div>
    <div class="guide-note"><strong>DoDAF and MOSA</strong><p>Use only the views needed for the decision. The app uses selected DoDAF viewpoint concepts and fit-for-purpose presentation guidance but does not implement or certify DoDAF conformance. Treat MOSA as both a technical and business strategy: modular boundaries, open interfaces, standards, upgrade paths, competition, sustainment, and data rights.</p></div>
    <div class="guide-note warning"><strong>Data handling</strong><p>The site is public, and browser storage is not an authorization boundary. Use approved unclassified, non-CUI information only. Do not enter classified, CUI, export-controlled, proprietary, or customer-restricted content.</p></div>
  </div>`, { wide: true });
}

function showRecovery() {
  openModal("Recovery points", `<p class="modal-intro">Restoring validates the selected snapshot and first preserves the current workspace as “Before recovery restore.”</p>${workspace.snapshots.length ? `<div class="snapshot-list">${workspace.snapshots.map(item => `<article><div><strong>${h(item.label)}</strong><span>${h(new Date(item.createdAt).toLocaleString())}</span></div><button class="small-button" type="button" data-restore="${h(item.id)}">Restore</button></article>`).join("")}</div>` : emptyState("No recovery points", "Create one from Workspace tools or make a structural edit.")}<div class="modal-actions"><button class="button secondary" type="button" data-close-modal>Close</button></div>`);
}

function exportWorkspaceJson() {
  const result = validateWorkspace(workspace);
  if (!result.valid) { toast(`Backup blocked: ${result.errors[0]}`, "error"); return; }
  download(`solution-architect-workspace-${formatLocalDate()}.json`, JSON.stringify(workspace, null, 2), "application/json;charset=utf-8");
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
    captureInbox = loadCaptureInbox(workspace.activeSolutionId);
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
  const duplicated = commit(next => {
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
        if (copy.baselineOptionId) copy.baselineOptionId = remap(copy.baselineOptionId);
        if (copy.citationIds) copy.citationIds = copy.citationIds.map(remap);
        if (copy.scores) copy.scores = copy.scores.map(score => ({ ...score, criterionId: remap(score.criterionId), evidenceIds: score.evidenceIds.map(remap) }));
        return copy;
      });
      next[collection].push(...copies);
    }
    next.activeSolutionId = copyId;
  }, { snapshot: "Before duplicating solution", renderAfter: false });
  if (duplicated) { captureInbox = loadCaptureInbox(workspace.activeSolutionId); render(); }
}

function deleteActiveSolution() {
  if (workspace.solutions.length === 1) return;
  const solution = activeSolution();
  if (!confirm(`Delete “${solution.name}” and every record bound to it? A recovery point will be created first.`)) return;
  const deletedSolutionId = solution.id;
  const deleted = commit(next => {
    const id = next.activeSolutionId;
    next.solutions = next.solutions.filter(item => item.id !== id);
    for (const collection of ["stakeholders", "hotButtons", "outcomes", "measures", "requirements", "evidence", "criteria", "candidates", "winThemes", "architectureViews", "elements", "connections", "trades", "decisions", "risks", "dependencies", "assumptions", "roadmapItems", "reviews", "transitionActions", "aiDrafts"]) next[collection] = next[collection].filter(item => item.solutionId !== id);
    next.activeSolutionId = next.solutions[0].id;
  }, { snapshot: "Before deleting solution", renderAfter: false });
  if (deleted) {
    try { localStorage.removeItem(captureStorageKey(deletedSolutionId)); } catch { /* Workspace deletion remains valid if inbox cleanup is unavailable. */ }
    captureInbox = loadCaptureInbox(workspace.activeSolutionId);
    render();
  }
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

async function downloadDecisionPackagePdf() {
  const solution = activeSolution();
  const pdf = await buildDecisionPackagePdf(workspace, solution.id);
  download(`${slug(solution.name)}-decision-package.pdf`, pdf, "application/pdf");
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
  workflow.innerHTML = `<p class="modal-intro">Inspect the exact JSON below. These are the selected <strong>${h(aiPreview.stage)}</strong> facts. Nothing is sent until you sign in, make all three acknowledgments, and select Send.</p><pre class="payload-preview">${h(JSON.stringify(aiPreview.payload, null, 2))}</pre><div class="ack-list"><label><input type="checkbox" id="ack-payload"> I reviewed this exact payload.</label><label><input type="checkbox" id="ack-data"> It contains approved unclassified, non-CUI information only.</label><label><input type="checkbox" id="ack-restricted"> It contains no classified, export-controlled, proprietary, or customer-restricted information.</label></div><details class="sign-in-box"><summary>Sign in for AI access</summary><div class="form-grid"><label class="field"><span>Email</span><input type="email" id="ai-email" autocomplete="username"></label><label class="field"><span>Password</span><input type="password" id="ai-password" autocomplete="current-password"></label></div><button class="button secondary" type="button" data-ai="sign-in">Sign in</button><span id="ai-auth-state"></span></details><div class="modal-actions"><button class="button secondary" type="button" data-ai="back">Back</button><button class="button primary" type="button" data-ai="send">Send selected facts to AI</button></div>`;
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

function decisionExportMenuParts() {
  const trigger = document.querySelector('[data-action="toggle-decision-export"]');
  const menu = document.querySelector("#decision-export-menu");
  const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')] : [];
  return { trigger, menu, items };
}

function setDecisionExportMenu(open, { focusItem = null, focusTrigger = false } = {}) {
  const { trigger, menu, items } = decisionExportMenuParts();
  if (!trigger || !menu) return;
  menu.hidden = !open;
  trigger.setAttribute("aria-expanded", String(open));
  if (open && Number.isInteger(focusItem) && items.length) items[Math.max(0, Math.min(items.length - 1, focusItem))].focus();
  if (!open && focusTrigger) trigger.focus();
}

function handleDecisionExportMenuKey(event) {
  const { trigger, menu, items } = decisionExportMenuParts();
  if (!trigger || !menu) return false;
  const onTrigger = event.target === trigger || trigger.contains(event.target);
  if (onTrigger && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (menu.hidden) setDecisionExportMenu(true, { focusItem: 0 });
    else setDecisionExportMenu(false, { focusTrigger: true });
    return true;
  }
  if (onTrigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    setDecisionExportMenu(true, { focusItem: event.key === "ArrowDown" ? 0 : items.length - 1 });
    return true;
  }
  if (menu.hidden) return false;
  if (event.key === "Tab") {
    setDecisionExportMenu(false);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setDecisionExportMenu(false, { focusTrigger: true });
    return true;
  }
  const index = items.indexOf(event.target);
  if (index < 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  event.preventDefault();
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
  return true;
}

// Event delegation
document.addEventListener("click", event => {
  if (document.querySelector("#decision-export-menu:not([hidden])") && !event.target.closest(".decision-export-actions")) setDecisionExportMenu(false);
  if (document.querySelector("#sidebar.open") && !event.target.closest("#sidebar")) setSidebarOpen(false);
  if (event.target.matches("[data-modal-backdrop]")) { closeModal(); return; }
  const close = event.target.closest("[data-close-modal]"); if (close) { closeModal(); return; }
  const routeButton = event.target.closest("[data-route-button]"); if (routeButton) { location.hash = routeButton.dataset.routeButton; return; }
  const actionControl = event.target.closest("[data-action]");
  const action = actionControl?.dataset.action;
  if (action === "toggle-decision-export") { setDecisionExportMenu(document.querySelector("#decision-export-menu")?.hidden !== false); return; }
  if (DECISION_EXPORT_ACTIONS.has(action)) setDecisionExportMenu(false, { focusTrigger: true });
  if (action === "new-solution") showNewSolution();
  if (action === "quick-capture") showQuickCapture();
  if (action === "open-capture-inbox") showCaptureInbox();
  if (action === "open-files") { clearIngestionSession(); showFileIntake(); }
  if (action === "meeting-capture") {
    if (document.querySelector("#file-intake-workflow")) clearIngestionSession();
    showMeetingIntake({ fresh: true });
  }
  if (action === "open-tools") showTools();
  if (action === "open-guide") showGuide();
  if (action === "open-recovery") showRecovery();
  if (action === "open-ai") showAiDialog();
  if (action === "switch-solution") showSolutionSwitcher();
  if (action === "toggle-theme") setThemePreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  if (action === "use-system-theme") { setThemePreference("system"); closeModal(); }
  if (action === "ingest-hot-buttons") showHotButtonIngest();
  if (action === "add-aoa") addAnalysisOfAlternatives();
  if (event.target.closest("[data-knowledge-add]")) showKnowledgeEditor();
  const knowledgeEdit = event.target.closest("[data-knowledge-edit]")?.dataset.knowledgeEdit; if (knowledgeEdit) showKnowledgeEditor(knowledgeEdit);
  const knowledgeUse = event.target.closest("[data-knowledge-use]")?.dataset.knowledgeUse; if (knowledgeUse) useKnowledgeItem(knowledgeUse);
  const knowledgeRefresh = event.target.closest("[data-knowledge-refresh]")?.dataset.knowledgeRefresh; if (knowledgeRefresh) refreshKnowledgeCandidate(knowledgeRefresh);
  const knowledgeOpen = event.target.closest("[data-knowledge-open]")?.dataset.knowledgeOpen; if (knowledgeOpen) { selectedCandidateId = knowledgeOpen; location.hash = "assess"; }
  const knowledgeArchive = event.target.closest("[data-knowledge-archive]")?.dataset.knowledgeArchive;
  if (knowledgeArchive) showKnowledgeArchiveDialog(knowledgeArchive);
  const knowledgeRestore = event.target.closest("[data-knowledge-restore]")?.dataset.knowledgeRestore;
  if (knowledgeRestore) showKnowledgeRestoreDialog(knowledgeRestore);
  const knowledgeDelete = event.target.closest("[data-knowledge-delete]")?.dataset.knowledgeDelete;
  if (knowledgeDelete) showKnowledgeDeleteDialog(knowledgeDelete);
  if (event.target.closest("[data-knowledge-template]")) showKnowledgeTemplateDialog();
  if (event.target.closest("[data-knowledge-backup]")) showKnowledgeBackupDialog();
  if (event.target.closest("[data-knowledge-download-csv]")) download("solution-knowledge-base-import-template.csv", buildKnowledgeCsvTemplate(), "text/csv;charset=utf-8");
  if (event.target.closest("[data-knowledge-list-import]")) document.querySelector("#knowledge-list-import")?.click();
  if (event.target.closest("[data-knowledge-list-apply]")) applyKnowledgeListImport();
  if (event.target.closest("[data-knowledge-export]")) exportKnowledgeBaseJson();
  if (event.target.closest("[data-knowledge-import]")) document.querySelector("#knowledge-import")?.click();
  if (event.target.closest("[data-knowledge-clear]")) { knowledgeFilters = { search: "", type: "", status: "active", segment: "" }; render(); }
  if (action === "toggle-nav") setSidebarOpen(!document.querySelector("#sidebar")?.classList.contains("open"));
  if (action === "new-view") newViewDialog();
  if (action === "add-element") addElementDialog();
  if (action === "add-connection") addConnectionDialog();
  if (action === "auto-layout") { workspace = autoLayoutView(workspace, selectedViewId); scheduleSave(); render(); }
  if (action === "export-svg") exportSelectedSvg();
  if (action === "export-png") exportSelectedPng();
  if (action === "export-markdown") download(`${slug(activeSolution().name)}-decision-package.md`, buildDecisionPackageMarkdown(workspace, workspace.activeSolutionId), "text/markdown;charset=utf-8");
  if (action === "export-html") download(`${slug(activeSolution().name)}-decision-package.html`, buildDecisionPackageHtml(workspace, workspace.activeSolutionId, { theme: resolveTheme(themePreference) }), "text/html;charset=utf-8");
  if (action === "export-docx") {
    try { download(decisionPackageDocxFilename(workspace, workspace.activeSolutionId), buildDecisionPackageDocx(workspace, workspace.activeSolutionId), DOCX_MIME_TYPE); }
    catch (error) { toast(`Word export failed: ${error.message}`, "error"); }
  }
  if (action === "export-xlsx") {
    try { download(decisionWorkbookFilename(workspace, workspace.activeSolutionId), writeDecisionWorkbook(workspace, workspace.activeSolutionId), DECISION_WORKBOOK_MIME); }
    catch (error) { toast(`Excel export failed: ${error.message}`, "error"); }
  }
  if (action === "export-pdf") downloadDecisionPackagePdf().catch(error => toast(`PDF export failed: ${error.message}`, "error"));
  const add = event.target.closest("[data-add]")?.dataset.add; if (add) addRecord(add);
  const deletion = event.target.closest("[data-delete]"); if (deletion && confirm("Delete this record? A recovery point will be created first.")) deleteRecord(deletion.dataset.delete, deletion.dataset.id);
  const candidate = event.target.closest("[data-candidate]")?.dataset.candidate; if (candidate) { selectedCandidateId = candidate; render(); }
  const view = event.target.closest("[data-view]")?.dataset.view; if (view) { selectedViewId = view; selectedElementId = ""; render(); }
  const restore = event.target.closest("[data-restore]")?.dataset.restore; if (restore) { try { workspace = restoreSnapshot(workspace, restore); saveNow(); captureInbox = loadCaptureInbox(workspace.activeSolutionId); closeModal(); render(); toast("Recovery point restored.", "ok"); } catch (error) { toast(error.message, "error"); } }
  if (event.target.closest("[data-capture-commit]")) commitCaptureSelection();
  if (event.target.closest("[data-capture-clear]")) clearCompletedCaptures();
  if (event.target.closest("[data-capture-export]")) download(`solution-capture-inbox-${slug(activeSolution().name)}.json`, JSON.stringify(captureInbox, null, 2), "application/json;charset=utf-8");
  if (event.target.closest("[data-intake-add]")) addIntakeToCaptureInbox();
  if (event.target.closest("[data-meeting-add-selection]")) addMeetingExcerpt();
  if (event.target.closest("[data-meeting-add-summary]")) addMeetingExcerpt({ wholeSummary: true });
  if (event.target.closest("[data-meeting-stage]")) stageMeetingExcerpts();
  const removeMeeting = event.target.closest("[data-meeting-remove]")?.dataset.meetingRemove;
  if (removeMeeting) removeMeetingExcerpt(removeMeeting);
  const duplicateIntake = event.target.closest("[data-intake-duplicate]")?.dataset.intakeDuplicate;
  if (duplicateIntake) {
    const source = ingestionSession.find(item => item.id === duplicateIntake && !item.error);
    if (source) ingestionSession.splice(ingestionSession.indexOf(source) + 1, 0, { ...source, id: makeId("intake"), selected: true });
    showFileIntake();
  }
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
  if (form.id === "knowledge-archive-form") {
    try {
      const item = knowledgeBase.items.find(record => record.id === form.dataset.knowledgeId);
      if (!item) throw new Error("The offering no longer exists.");
      const next = archiveKnowledgeItem(knowledgeBase, item.id, {
        changeSummary: String(data.get("changeSummary") || "").trim()
      });
      if (!persistKnowledgeBase(next)) return;
      closeModal();
      render();
      document.querySelector('[data-knowledge-filter="status"]')?.focus();
      toast(`${item.name} was archived. Existing solution copies were not changed.`, "ok");
    } catch (error) {
      toast(`Offering was not archived: ${error.message}`, "error");
    }
    return;
  }
  if (form.id === "knowledge-restore-form") {
    try {
      const item = knowledgeBase.items.find(record => record.id === form.dataset.knowledgeId);
      if (!item) throw new Error("The offering no longer exists.");
      const lifecycleStatus = String(data.get("lifecycleStatus") || "Current");
      const next = restoreKnowledgeItem(knowledgeBase, item.id, lifecycleStatus, {
        changeSummary: String(data.get("changeSummary") || "").trim()
      });
      if (!persistKnowledgeBase(next)) return;
      closeModal();
      render();
      document.querySelector('[data-knowledge-filter="status"]')?.focus();
      toast(`${item.name} was restored as ${lifecycleStatus}.`, "ok");
    } catch (error) {
      toast(`Offering was not restored: ${error.message}`, "error");
    }
    return;
  }
  if (form.id === "knowledge-delete-form") {
    try {
      const item = knowledgeBase.items.find(record => record.id === form.dataset.knowledgeId);
      if (!item) throw new Error("The offering no longer exists.");
      const confirmation = String(data.get("confirmation") || "");
      if (confirmation !== item.name) throw new Error("Type the offering name exactly as shown.");
      const next = deleteArchivedKnowledgeItem(knowledgeBase, item.id);
      if (!persistKnowledgeBase(next)) return;
      closeModal();
      render();
      document.querySelector('[data-knowledge-filter="status"]')?.focus();
      toast(`${item.name} was permanently deleted from the Knowledge Base. Existing solution copies remain usable.`, "ok");
    } catch (error) {
      toast(`Offering was not deleted: ${error.message}`, "error");
    }
    return;
  }
  if (form.id === "knowledge-item-form") {
    const values = knowledgeFormValues(data);
    try {
      const itemId = form.dataset.knowledgeId || "";
      let next;
      if (itemId) {
        const existing = knowledgeBase.items.find(record => record.id === itemId);
        if (!existing) throw new Error("The offering no longer exists.");
        if (existing.lifecycleStatus === "Retired" && values.lifecycleStatus !== "Retired") throw new Error("Use Restore offering to return an archived item to active use.");
        if (existing.lifecycleStatus !== "Retired" && values.lifecycleStatus === "Retired") throw new Error("Use Archive offering to remove an item from active use.");
        next = updateKnowledgeItem(knowledgeBase, itemId, values);
      }
      else {
        next = structuredClone(knowledgeBase);
        next.items.push(createKnowledgeItem(values));
        next.savedAt = new Date().toISOString();
      }
      if (!persistKnowledgeBase(next)) return;
      closeModal();
      render();
      toast(itemId ? "Knowledge Base revision saved. Existing solution copies were not changed." : "Solution offering added to the Knowledge Base.", "ok");
    } catch (error) {
      toast(`Knowledge Base item was not saved: ${error.message}`, "error");
    }
    return;
  }
  if (form.id === "quick-capture-form") {
    const target = String(data.get("target") || "evidence");
    const title = String(data.get("title") || "").trim();
    const detail = String(data.get("detail") || "").trim();
    const source = String(data.get("source") || "").trim();
    if (!title) { toast("Add a short title or statement before saving the capture.", "error"); return; }
    const next = structuredClone(captureInbox);
    try {
      const provenance = createCaptureProvenance(next.solutionId, { sourceTitle: source || "Quick capture", locator: source || "Quick capture" });
      const item = createCaptureItem(next.solutionId, { provenanceId: provenance.id, target, excerpt: detail, fields: fieldsForCapture(target, title, detail, source) });
      next.provenance.push(provenance);
      next.items.push(item);
      next.updatedAt = new Date().toISOString();
    } catch (error) {
      toast(`Capture was not prepared: ${error.message}`, "error");
      return;
    }
    if (!persistCaptureInbox(next)) return;
    toast("Capture saved for review. No workspace record was changed.", "ok");
    if (event.submitter?.value === "continue") showQuickCapture();
    else showCaptureInbox();
  }
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
    const result = addBlankSolution(workspace, data.get("name")); workspace = pushSnapshot(result.workspace, "Created solution"); saveNow(); captureInbox = loadCaptureInbox(workspace.activeSolutionId); closeModal(); route = "discover"; location.hash = "discover"; render();
  }
  if (form.id === "switch-solution-form") {
    const solutionId = String(data.get("solutionId") || "");
    if (!workspace.solutions.some(item => item.id === solutionId)) { toast("That solution is no longer available.", "error"); return; }
    if (dirty && !saveNow()) return;
    workspace.activeSolutionId = solutionId;
    selectedCandidateId = selectedViewId = selectedElementId = "";
    saveNow();
    captureInbox = loadCaptureInbox(solutionId);
    closeModal();
    render();
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
  if (node.matches("textarea[data-auto-grow]")) fitAutoGrowTextarea(node);
  if (node.matches("[data-knowledge-delete-confirm-input]")) {
    const form = node.closest("#knowledge-delete-form");
    const button = form?.querySelector("[data-knowledge-delete-confirm]");
    if (button) button.disabled = node.value !== form.dataset.knowledgeName;
    return;
  }
  if (node.matches('[data-knowledge-filter="search"]')) { knowledgeFilters.search = node.value; applyKnowledgeFilters(); return; }
  if (node.matches("[data-meeting-field]") && meetingSession) {
    const meetingField = node.dataset.meetingField;
    const changed = meetingSession[meetingField] !== node.value;
    meetingSession[meetingField] = node.value;
    if (meetingField === "text") {
      if (changed) discardMeetingExcerpts();
      const count = document.querySelector("#meeting-text-count");
      if (count) count.textContent = node.value.length.toLocaleString();
      const wholeSummary = document.querySelector("[data-meeting-add-summary]");
      if (wholeSummary) wholeSummary.disabled = node.value.trim().length === 0 || node.value.trim().length > MAX_MEETING_EXCERPT_CHARS;
    }
  }
  if (node.matches("[data-capture-title]")) {
    updateCaptureItem(node.dataset.captureId, item => {
      if (item.target === "assumption") item.fields.statement = node.value;
      else if (item.target === "ignore") item.fields.reason = node.value;
      else item.fields.title = node.value;
    });
  }
  if (node.matches("[data-capture-detail]")) {
    updateCaptureItem(node.dataset.captureId, item => {
      item.excerpt = node.value;
      if (item.target === "hotButton") item.fields.detail = node.value;
      if (item.target === "evidence") item.fields.notes = node.value;
      if (item.target === "winTheme") item.fields.customerValue = node.value;
      if (item.target === "decision") item.fields.rationale = node.value;
    });
  }
  if (node.matches("[data-intake-title], [data-intake-excerpt], [data-intake-locator]")) {
    const item = ingestionSession.find(candidate => candidate.id === node.dataset.intakeId);
    if (item) {
      if (node.matches("[data-intake-title]")) item.title = node.value;
      if (node.matches("[data-intake-excerpt]")) item.excerpt = node.value;
      if (node.matches("[data-intake-locator]")) item.locator = node.value;
    }
  }
  if (node.dataset.solutionField) { solution[node.dataset.solutionField] = node.value; scheduleSave(); if (node.dataset.solutionField === "name") document.querySelector(".title-block p").textContent = `${node.value} · ${solution.stage}`; }
  if (node.dataset.solutionNested) { const [group, fieldName] = node.dataset.solutionNested.split("."); solution[group][fieldName] = node.value; scheduleSave(); }
  if (node.dataset.recordCollection && node.dataset.recordField && !node.multiple) { const item = record(node.dataset.recordCollection, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value; scheduleSave(); } }
  if (node.dataset.recordNumber) { const item = record(node.dataset.recordNumber, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value === "" ? null : Number(node.value); scheduleSave(); } }
  if (node.dataset.candidateScore && node.dataset.scoreField === "rationale") { const candidate = record("candidates", node.dataset.candidateScore); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.rationale = node.value; scheduleSave(); }
});

document.addEventListener("change", event => {
  const node = event.target;
  if (node.matches("[data-knowledge-filter]")) { knowledgeFilters[node.dataset.knowledgeFilter] = node.value; applyKnowledgeFilters(); return; }
  if (node.matches("[data-knowledge-import-mode]")) { refreshKnowledgeImportPlan(node.value); showKnowledgeImportPreview({ focusSelector: `[data-knowledge-import-mode][value="${node.value}"]` }); return; }
  if (node.id === "knowledge-list-import") { importKnowledgeListFile(node.files?.[0]); return; }
  if (node.id === "knowledge-import") { importKnowledgeBaseFile(node.files?.[0]); return; }
  if (node.id === "meeting-ack" && meetingSession) {
    meetingSession.acknowledged = node.checked;
    const textarea = document.querySelector("#meeting-source-text");
    if (textarea) textarea.disabled = !node.checked;
    const add = document.querySelector("[data-meeting-add-selection]");
    if (add) add.disabled = !node.checked;
    const wholeSummary = document.querySelector("[data-meeting-add-summary]");
    if (wholeSummary) wholeSummary.disabled = !node.checked || meetingSession.text.trim().length === 0 || meetingSession.text.trim().length > MAX_MEETING_EXCERPT_CHARS;
    return;
  }
  if (node.matches('[data-meeting-field="sourceType"]') && meetingSession) {
    discardMeetingExcerpts("The meeting content type changed. Select the needed excerpts again before staging.");
    meetingSession.sourceType = node.value;
    showMeetingIntake({ focusSelector: '[data-meeting-field="sourceType"]' });
    return;
  }
  if (node.matches("[data-meeting-segment]") && meetingSession) {
    meetingSession.missionSegments = [...document.querySelectorAll("[data-meeting-segment]:checked")].map(input => input.value);
    return;
  }
  if (node.id === "intake-ack") {
    ingestionAcknowledged = node.checked;
    const input = document.querySelector("#source-files");
    if (input) input.disabled = !ingestionAcknowledged;
    return;
  }
  if (node.id === "source-files") {
    processSourceFiles(node.files || []).catch(error => toast(error.message, "error"));
    return;
  }
  if (node.matches("[data-capture-target]")) { changeCaptureTarget(node.dataset.captureId, node.value); return; }
  if (node.matches("[data-capture-field]")) {
    updateCaptureItem(node.dataset.captureId, item => { item.fields[node.dataset.captureField] = node.value; });
    return;
  }
  if (node.matches("[data-intake-select]")) {
    const item = ingestionSession.find(candidate => candidate.id === node.dataset.intakeId);
    if (item) item.selected = node.checked;
    return;
  }
  if (node.matches("[data-intake-target]")) {
    const item = ingestionSession.find(candidate => candidate.id === node.dataset.intakeId);
    if (item) {
      item.target = node.value;
      const card = node.closest("[data-intake-card]");
      const title = card?.querySelector("[data-intake-title]");
      const limit = captureTitleMax(item.target);
      if (title) title.maxLength = limit;
      const hint = card?.querySelector("[data-intake-title-limit]");
      if (hint) hint.textContent = `Maximum ${limit.toLocaleString()} characters for ${CAPTURE_TARGET_LABELS[item.target].toLowerCase()}.`;
    }
    return;
  }
  if (node.matches("[data-intake-section]")) {
    const item = ingestionSession.find(candidate => candidate.id === node.dataset.intakeId);
    if (item) {
      const index = Number(node.value);
      item.sectionIndex = index;
      if (index < 0) { item.excerpt = item.result.text.slice(0, 6000); item.locator = item.result.locator; }
      else {
        const section = item.result.sections[index];
        if (section) { item.excerpt = item.result.text.slice(section.start, section.end).slice(0, 6000); item.locator = section.locator; }
      }
      showFileIntake();
    }
    return;
  }
  if (node.matches("[data-mission-segment]")) {
    activeSolution().missionSegments = [...document.querySelectorAll("[data-mission-segment]:checked")].map(input => input.value);
    scheduleSave();
    return;
  }
  if (node.id === "solution-select") { if (dirty && !saveNow()) return; workspace.activeSolutionId = node.value; selectedCandidateId = selectedViewId = selectedElementId = ""; saveNow(); captureInbox = loadCaptureInbox(node.value); render(); }
  if (node.id === "workspace-import") importWorkspaceFile(node.files?.[0]);
  if (node.dataset.solutionField) { const solution = activeSolution(); solution[node.dataset.solutionField] = node.value; scheduleSave(); if (node.tagName === "SELECT") render(); }
  if (node.dataset.recordCollection && node.dataset.recordField && node.tagName === "SELECT" && !node.multiple) { const item = record(node.dataset.recordCollection, node.dataset.recordId); if (item) { item[node.dataset.recordField] = node.value; scheduleSave(); render(); } }
  if (node.dataset.recordLinksCollection && node.dataset.recordLinksField) { const item = record(node.dataset.recordLinksCollection, node.dataset.recordId); if (item) { item[node.dataset.recordLinksField] = [...node.selectedOptions].map(option => option.value); if (node.dataset.recordLinksCollection === "trades" && node.dataset.recordLinksField === "optionIds" && item.baselineOptionId && !item.optionIds.includes(item.baselineOptionId)) item.baselineOptionId = ""; scheduleSave(); if (node.dataset.recordLinksCollection === "trades" && item.analysisType === "Analysis of Alternatives") render(); } }
  if (node.dataset.requirementDriver) {
    const item = record("requirements", node.dataset.requirementDriver);
    const field = node.closest("[data-relationship-field]");
    if (item && field) {
      item.linkedHotButtonIds = [...field.querySelectorAll("[data-requirement-driver]:checked")].map(option => option.value);
      syncRequirementRelationshipField(field);
      scheduleSave();
    }
    return;
  }
  if (node.dataset.requirementElement) {
    const item = record("requirements", node.dataset.requirementElement);
    const field = node.closest("[data-relationship-field]");
    if (item && field) {
      item.linkedElementIds = [...field.querySelectorAll("[data-requirement-element]:checked")].map(option => option.value);
      syncRequirementRelationshipField(field);
      scheduleSave();
    }
    return;
  }
  if (node.dataset.winThemeHotButtons) { const item = record("winThemes", node.dataset.winThemeHotButtons); item.linkedHotButtonIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.winThemeEvidence) { const item = record("winThemes", node.dataset.winThemeEvidence); item.sourceEvidenceIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
  if (node.dataset.candidateScore && node.dataset.scoreField === "value") { const candidate = record("candidates", node.dataset.candidateScore); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.value = node.value === "" ? null : Number(node.value); scheduleSave(); render(); }
  if (node.dataset.scoreEvidence) { const candidate = record("candidates", node.dataset.scoreEvidence); let score = candidate.scores.find(item => item.criterionId === node.dataset.criterion); if (!score) { score = { criterionId: node.dataset.criterion, value: null, rationale: "", evidenceIds: [] }; candidate.scores.push(score); } score.evidenceIds = [...node.selectedOptions].map(option => option.value); scheduleSave(); }
});

window.addEventListener("hashchange", () => { route = readRoute(); setSidebarOpen(false); render(); document.querySelector("#workspace")?.focus(); });
let autoGrowResizeFrame = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(autoGrowResizeFrame);
  autoGrowResizeFrame = requestAnimationFrame(() => fitAutoGrowTextareas(app));
});
window.addEventListener("storage", event => {
  if (event.key === THEME_KEY) {
    themePreference = THEME_VALUES.has(event.newValue) ? event.newValue : "light";
    applyTheme(themePreference);
  }
  if (event.key === STORAGE_KEY) toast("This workspace changed in another tab. Export your work, then reload before continuing.", "error");
  if (event.key === captureStorageKey(workspace.activeSolutionId)) toast("This solution's capture inbox changed in another tab. Reload before reviewing or committing it.", "error");
  if (event.key === KNOWLEDGE_BASE_STORAGE_KEY) toast("The Knowledge Base changed in another tab. Reload before editing or importing the catalog.", "error");
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => {
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "q") { event.preventDefault(); showQuickCapture(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && event.target.closest("#quick-capture-form")) {
    event.preventDefault();
    event.target.closest("#quick-capture-form").querySelector('button[name="next"][value="continue"]')?.click();
    return;
  }
  if (event.key === "Escape" && document.querySelector("#modal-root .modal")) { event.preventDefault(); closeModal(); return; }
  if (event.key === "Escape" && document.querySelector("#sidebar.open")) { event.preventDefault(); setSidebarOpen(false); document.querySelector('[data-action="toggle-nav"]')?.focus(); return; }
  if (handleDecisionExportMenuKey(event)) return;
  trapModalFocus(event);
  trapSidebarFocus(event);
});
document.addEventListener("focusin", event => {
  if (document.querySelector("#decision-export-menu:not([hidden])") && !event.target.closest(".decision-export-actions")) setDecisionExportMenu(false);
});
document.addEventListener("dragover", event => {
  if (event.target.closest("#source-drop-zone")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }
});
document.addEventListener("drop", event => {
  if (!event.target.closest("#source-drop-zone")) return;
  event.preventDefault();
  processSourceFiles(event.dataTransfer?.files || []).catch(error => toast(error.message, "error"));
});

const handleSystemThemeChange = () => { if (themePreference === "system") applyTheme(themePreference); };
if (typeof systemTheme.addEventListener === "function") systemTheme.addEventListener("change", handleSystemThemeChange);
else systemTheme.addListener?.(handleSystemThemeChange);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js?v=13", { scope: "./", updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(error => console.warn("Offline shell registration failed.", error));
}
render();
if (initialWorkspaceNeedsSave) saveNow();
if (initialKnowledgeBaseNeedsSave) persistKnowledgeBase(knowledgeBase, { quiet: true });
if (knowledgeBaseLoadError) toast("Saved Knowledge Base could not be opened and was left unchanged. Import a valid catalog backup to recover.", "error");
