export const WORKSPACE_SCHEMA = "solution-workspace-v1";
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "solution_architect_workspace_v1";
export const MAX_SNAPSHOTS = 8;

export const STAGES = Object.freeze([
  "Discover",
  "Shape",
  "Assess",
  "Architect",
  "Prove",
  "Propose",
  "Transition"
]);

export const DEFAULT_CRITERIA = Object.freeze([
  ["mission-fit", "Mission fit", 14],
  ["performance", "Performance", 10],
  ["maturity", "Maturity", 8],
  ["integration", "Integration", 10],
  ["cyber-safety", "Cyber and safety", 10],
  ["mosa", "MOSA and openness", 10],
  ["data-rights", "Data rights", 8],
  ["supply-chain", "Supply chain", 7],
  ["affordability", "Affordability", 8],
  ["schedule", "Schedule", 7],
  ["sustainment", "Sustainment", 8]
]);

export const ELEMENT_TYPES = Object.freeze([
  "Person / organization",
  "Mission activity",
  "Hardware",
  "Software",
  "Service",
  "Data store",
  "Network",
  "Facility",
  "Environment",
  "External system"
]);

export const INTERFACE_TYPES = Object.freeze([
  "Physical",
  "Electrical",
  "RF",
  "Network",
  "API",
  "Data",
  "Human / process"
]);

export const VIEW_TEMPLATES = Object.freeze([
  ["context", "Mission / system context"],
  ["mission-thread", "Operational mission thread"],
  ["system-interface", "System and platform interfaces"],
  ["data-flow", "Data and information flow"],
  ["deployment-transition", "Deployment and transition"]
]);

const REQUIRED_COLLECTIONS = Object.freeze([
  "solutions",
  "stakeholders",
  "hotButtons",
  "outcomes",
  "measures",
  "requirements",
  "evidence",
  "criteria",
  "candidates",
  "winThemes",
  "architectureViews",
  "elements",
  "connections",
  "trades",
  "decisions",
  "risks",
  "dependencies",
  "assumptions",
  "roadmapItems",
  "reviews",
  "transitionActions",
  "aiDrafts",
  "snapshots"
]);

const SCOPED_COLLECTIONS = REQUIRED_COLLECTIONS.filter(name => !["solutions", "snapshots"].includes(name));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AI_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCORE_VALUES = new Set([0, 1, 2, 3, 4, 5, null]);

const MISSION_FIELDS = Object.freeze(["problem", "operationalContext", "currentState", "desiredState", "constraints"]);
const PROPOSAL_FIELDS = Object.freeze(["conops", "technicalApproach", "discriminators", "estimateAssumptions", "deliveryCommitments"]);

const RECORD_FIELD_TYPES = Object.freeze({
  stakeholders: { name: "string", role: "string", concern: "string" },
  hotButtons: { title: "string", detail: "string", source: "string", confidence: "string", status: "string" },
  outcomes: { title: "string", verificationMethod: "string", linkedRequirementIds: "id-array" },
  measures: { name: "string", target: "string", method: "string" },
  requirements: { title: "string", type: "string", priority: "string", sourceEvidenceId: "optional-id", acceptanceMethod: "string", status: "string", linkedElementIds: "id-array", linkedHotButtonIds: "id-array" },
  evidence: { title: "string", source: "string", url: "string", notes: "string", confidence: "string" },
  criteria: { name: "string", weight: "number", description: "string" },
  candidates: { name: "string", category: "string", vendor: "string", description: "string", trl: "nullable-number", mrl: "nullable-number", irl: "nullable-number", status: "string", scores: "array" },
  winThemes: { title: "string", customerValue: "string", discriminator: "string", proof: "string", linkedHotButtonIds: "id-array", sourceEvidenceIds: "id-array", status: "string" },
  architectureViews: { name: "string", template: "string", description: "string", width: "number", height: "number" },
  elements: { viewId: "id", type: "string", name: "string", description: "string", x: "number", y: "number", width: "number", height: "number" },
  connections: { viewId: "id", sourceElementId: "id", targetElementId: "id", type: "string", label: "string", protocol: "string", description: "string" },
  trades: { title: "string", question: "string", optionIds: "id-array", recommendation: "string", status: "string" },
  decisions: { title: "string", status: "string", rationale: "string", evidenceIds: "id-array", owner: "string", date: "string" },
  risks: { title: "string", likelihood: "string", impact: "string", owner: "string", mitigation: "string", status: "string" },
  dependencies: { title: "string", type: "string", provider: "string", owner: "string", neededBy: "string", status: "string", impact: "string" },
  assumptions: { statement: "string", status: "string", owner: "string", validationPlan: "string" },
  roadmapItems: { stage: "string", title: "string", start: "string", end: "string", owner: "string", status: "string", gate: "boolean" },
  reviews: { name: "string", type: "string", due: "string", owner: "string", status: "string", entryCriteria: "string" },
  transitionActions: { title: "string", owner: "string", target: "string", status: "string", blocker: "string" },
  aiDrafts: { action: "string", stage: "string", title: "string", status: "string", createdAt: "string", citationIds: "id-array", result: "object", requestId: "string", model: "string" }
});

const AI_ACTIONS = Object.freeze(["draft_artifact", "critique_artifact", "find_gaps", "generate_review_questions", "propose_architecture_view"]);
const AI_ARTIFACT_TYPES = Object.freeze(["mission_brief", "conops", "technical_approach", "discriminators", "compliance_trace", "estimate_assumptions", "delivery_commitments", "trade_study", "decision_brief", "transition_plan", "review_package"]);
const AI_FINDING_SEVERITIES = Object.freeze(["critical", "high", "medium", "low", "info"]);
const AI_FINDING_CATEGORIES = Object.freeze(["evidence", "traceability", "requirement", "technology", "score", "interface", "decision", "risk", "review", "transition", "proposal", "other"]);
const AI_VIEW_TYPES = Object.freeze(["mission_context", "operational_thread", "system_interfaces", "data_flow", "deployment_transition"]);
const AI_ELEMENT_TYPES = Object.freeze(["person_organization", "mission_activity", "hardware", "software", "service", "data_store", "network", "facility", "environment", "external_system"]);
const AI_INTERFACE_TYPES = Object.freeze(["physical", "electrical", "rf", "network", "api", "data", "human_process"]);

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
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

export function makeId(prefix = "record") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random.replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 128);
}

export function nowIso() {
  return new Date().toISOString();
}

function emptyWorkspace() {
  return Object.fromEntries(REQUIRED_COLLECTIONS.map(name => [name, []]));
}

export function createWorkspace({ includeSynthetic = true } = {}) {
  const workspace = {
    schema: WORKSPACE_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    activeSolutionId: "",
    savedAt: nowIso(),
    ...emptyWorkspace()
  };
  if (includeSynthetic) seedSyntheticSolution(workspace);
  return workspace;
}

export function createBlankSolution(name = "Untitled solution") {
  const id = makeId("solution");
  return {
    id,
    name: String(name).trim().slice(0, 180) || "Untitled solution",
    customer: "",
    domain: "Defense capability integration",
    stage: "Discover",
    status: "Working",
    decision: "",
    description: "",
    classification: "Approved unclassified / non-CUI",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mission: {
      problem: "",
      operationalContext: "",
      currentState: "",
      desiredState: "",
      constraints: ""
    },
    proposal: {
      conops: "",
      technicalApproach: "",
      discriminators: "",
      estimateAssumptions: "",
      deliveryCommitments: ""
    }
  };
}

export function addBlankSolution(workspace, name) {
  const next = structuredClone(workspace);
  const solution = createBlankSolution(name);
  next.solutions.push(solution);
  next.activeSolutionId = solution.id;
  next.criteria.push(...DEFAULT_CRITERIA.map(([slug, criterionName, weight]) => ({
    id: makeId(`criterion_${slug}`),
    solutionId: solution.id,
    name: criterionName,
    weight,
    description: ""
  })));
  const view = createArchitectureView(solution.id, "context");
  next.architectureViews.push(view);
  next.savedAt = nowIso();
  return { workspace: next, solution };
}

export function createArchitectureView(solutionId, template = "context") {
  const title = VIEW_TEMPLATES.find(([value]) => value === template)?.[1] || "Architecture view";
  return {
    id: makeId("view"),
    solutionId,
    name: title,
    template,
    description: "",
    width: 1200,
    height: 680
  };
}

function seedSyntheticSolution(workspace) {
  const createdAt = nowIso();
  const solutionId = "solution_synthetic_sensor_node";
  workspace.activeSolutionId = solutionId;
  workspace.solutions.push({
    id: solutionId,
    name: "Expeditionary Sensor Node Upgrade",
    customer: "Synthetic joint mission partner",
    domain: "Mission systems and platform integration",
    stage: "Assess",
    status: "Working",
    decision: "Select the modular sensor and edge package for an integration demonstration.",
    description: "Synthetic example combining hardware, software, tactical transport, MOSA, technology assessment, and transition planning.",
    classification: "Synthetic / approved unclassified",
    createdAt,
    updatedAt: createdAt,
    mission: {
      problem: "Forward teams need faster detection-to-decision timelines without replacing the host platform or locking the mission package to one vendor.",
      operationalContext: "A transportable mission package operates at bandwidth-constrained expeditionary sites and exchanges tracks with an existing command-and-control environment.",
      currentState: "Legacy sensors use proprietary interfaces and send minimally processed data over intermittent links.",
      desiredState: "A modular sensor and edge-processing package publishes quality-tagged tracks through an open, governed interface and can transition between platform variants.",
      constraints: "Limited power, intermittent transport, environmental exposure, existing platform safety envelope, and a six-month demonstration window."
    },
    proposal: {
      conops: "A forward operator deploys the mission package, the sensor detects and characterizes activity, edge software fuses observations, and the gateway publishes quality-tagged tracks to the mission network.",
      technicalApproach: "Use modular hardware and software boundaries, open interface specifications, containerized mission applications, and an integration lab before platform installation.",
      discriminators: "Portable interface package; evidence-led technology selection; vendor-independent integration harness.",
      estimateAssumptions: "Government-furnished platform access and representative interface documentation are available by the integration readiness review.",
      deliveryCommitments: "Demonstrate the mission thread, deliver interface documentation, and transition the verified baseline to the platform team."
    }
  });

  workspace.stakeholders.push(
    { id: "stakeholder_operator", solutionId, name: "Forward operator", role: "Mission user", concern: "Fast setup and trustworthy tracks" },
    { id: "stakeholder_platform", solutionId, name: "Platform integration lead", role: "Technical authority", concern: "Safe interfaces and controlled changes" },
    { id: "stakeholder_cyber", solutionId, name: "Authorizing team", role: "Cyber / risk", concern: "Boundary, identity, logging, and residual risk" }
  );
  workspace.hotButtons.push(
    { id: "hot_button_open", solutionId, title: "Avoid vendor lock-in at the sensor boundary", detail: "Customer discussions repeatedly emphasized future sensor competition and rapid replacement.", source: "Synthetic mission-partner working session", confidence: "High", status: "Validated" },
    { id: "hot_button_demo", solutionId, title: "Show a credible platform demonstration within six months", detail: "Schedule confidence and access to the host platform are expected to shape the down-select.", source: "Synthetic capture notes", confidence: "Medium", status: "Captured" }
  );
  workspace.outcomes.push(
    { id: "outcome_latency", solutionId, title: "Reduce detection-to-decision latency", verificationMethod: "Timed end-to-end mission-thread demonstration", linkedRequirementIds: ["req_latency"] },
    { id: "outcome_swap", solutionId, title: "Replace a sensor without redesigning the host platform", verificationMethod: "", linkedRequirementIds: ["req_open_interface"] },
    { id: "outcome_transport", solutionId, title: "Continue useful operations during degraded transport", verificationMethod: "", linkedRequirementIds: ["req_degraded"] }
  );
  workspace.measures.push(
    { id: "measure_latency", solutionId, name: "Median track publication latency", target: "≤ 2 seconds", method: "Instrumented mission-thread run" },
    { id: "measure_swap", solutionId, name: "Sensor replacement effort", target: "No host-platform software change", method: "Interface conformance demonstration" }
  );
  workspace.evidence.push(
    { id: "evidence_mission_need", solutionId, title: "Approved synthetic mission need", source: "Synthetic planning brief", url: "", notes: "Defines the operational problem and target mission thread.", confidence: "High" },
    { id: "evidence_interface_draft", solutionId, title: "Draft interface control description", source: "Synthetic engineering note", url: "", notes: "Defines candidate message and timing constraints; data-rights terms remain open.", confidence: "Medium" },
    { id: "evidence_lab_result", solutionId, title: "Bench throughput observation", source: "Synthetic lab note", url: "", notes: "Candidate A processed the representative stream with margin on the development unit.", confidence: "Medium" }
  );
  workspace.requirements.push(
    { id: "req_latency", solutionId, title: "Publish a quality-tagged track within two seconds of detection", type: "Performance", priority: "Must", sourceEvidenceId: "evidence_mission_need", acceptanceMethod: "Instrumented mission-thread demonstration", status: "Validated", linkedElementIds: ["element_edge", "element_gateway"], linkedHotButtonIds: ["hot_button_demo"] },
    { id: "req_open_interface", solutionId, title: "Use a documented modular sensor interface", type: "Interface", priority: "Must", sourceEvidenceId: "evidence_interface_draft", acceptanceMethod: "Interface conformance test", status: "Draft", linkedElementIds: ["element_sensor", "element_edge"], linkedHotButtonIds: ["hot_button_open"] },
    { id: "req_degraded", solutionId, title: "Retain local processing during transport disruption", type: "Resilience", priority: "Must", sourceEvidenceId: "evidence_mission_need", acceptanceMethod: "", status: "Draft", linkedElementIds: ["element_edge"], linkedHotButtonIds: [] },
    { id: "req_power", solutionId, title: "Remain within the host platform power allocation", type: "Physical", priority: "Must", sourceEvidenceId: "", acceptanceMethod: "Power characterization", status: "Draft", linkedElementIds: ["element_sensor", "element_edge"], linkedHotButtonIds: [] }
  );

  workspace.criteria.push(...DEFAULT_CRITERIA.map(([slug, name, weight]) => ({
    id: `criterion_${slug}`,
    solutionId,
    name,
    weight,
    description: ""
  })));
  const score = (criterionId, value, rationale, evidenceIds = []) => ({ criterionId, value, rationale, evidenceIds });
  workspace.candidates.push(
    {
      id: "candidate_alpha",
      solutionId,
      name: "Candidate Alpha mission package",
      category: "Integrated hardware and software",
      vendor: "Synthetic supplier A",
      description: "Ruggedized sensor, edge compute, and adapter software.",
      trl: 7,
      mrl: 5,
      irl: 5,
      status: "Shortlist",
      scores: [
        score("criterion_mission-fit", 4, "Covers the target mission thread.", ["evidence_mission_need"]),
        score("criterion_performance", 4, "Bench observation shows processing margin.", ["evidence_lab_result"]),
        score("criterion_maturity", 3, "Prototype demonstrated in a relevant environment."),
        score("criterion_integration", 3, "Adapter required for the host platform.", ["evidence_interface_draft"]),
        score("criterion_cyber-safety", 3, "Boundary defined; control inheritance is unresolved."),
        score("criterion_mosa", 4, "Documented modular boundary."),
        score("criterion_data-rights", null, "License and interface-data rights are not confirmed."),
        score("criterion_supply-chain", 3, "Key compute component has a single qualified source."),
        score("criterion_affordability", 3, "Within planning range; integration labor remains uncertain."),
        score("criterion_schedule", 4, "Development units are available."),
        score("criterion_sustainment", 3, "Spares concept exists; depot path is not defined.")
      ]
    },
    {
      id: "candidate_bravo",
      solutionId,
      name: "Candidate Bravo open sensor stack",
      category: "Sensor and integration kit",
      vendor: "Synthetic supplier B",
      description: "Open sensor interface with government-integrated edge software.",
      trl: 6,
      mrl: 4,
      irl: 6,
      status: "Shortlist",
      scores: [
        score("criterion_mission-fit", 4, "Matches required sensing modes.", ["evidence_mission_need"]),
        score("criterion_performance", null, "Representative performance evidence is pending."),
        score("criterion_maturity", 3, "Subsystem prototype demonstrated."),
        score("criterion_integration", 4, "Interface aligns with the draft platform boundary.", ["evidence_interface_draft"]),
        score("criterion_cyber-safety", 3, "Government software integration reduces opaque components."),
        score("criterion_mosa", 5, "Open interface and replaceable modules.", ["evidence_interface_draft"]),
        score("criterion_data-rights", 4, "Interface package offered with government-purpose rights."),
        score("criterion_supply-chain", 3, "Two sensor suppliers; compute path not yet qualified."),
        score("criterion_affordability", 3, "Lower unit cost with higher integration labor."),
        score("criterion_schedule", 2, "Integration software requires development."),
        score("criterion_sustainment", 4, "Replaceable modules and published maintenance interfaces.")
      ]
    }
  );
  workspace.winThemes.push({
    id: "win_theme_open_mission_package",
    solutionId,
    title: "Mission flexibility without platform redesign",
    customerValue: "The mission partner can compete and refresh sensors while preserving the host-platform investment.",
    discriminator: "A vendor-independent integration harness and governed modular boundary make replacement testable before platform installation.",
    proof: "Interface conformance plus a representative sensor-swap mission-thread demonstration.",
    linkedHotButtonIds: ["hot_button_open"],
    sourceEvidenceIds: ["evidence_interface_draft", "evidence_lab_result"],
    status: "Substantiated"
  });

  const views = [
    { id: "view_context", solutionId, name: "Mission and system context", template: "context", description: "High-level actors, system boundary, and external mission exchanges.", width: 1200, height: 680 },
    { id: "view_interface", solutionId, name: "Mission package interfaces", template: "system-interface", description: "Hardware, software, and host-platform integration boundary.", width: 1200, height: 680 },
    { id: "view_transition", solutionId, name: "Transition view", template: "deployment-transition", description: "From integration lab through platform demonstration and operational handoff.", width: 1200, height: 680 }
  ];
  workspace.architectureViews.push(...views);
  workspace.elements.push(
    { id: "element_operator", solutionId, viewId: "view_context", type: "Person / organization", name: "Forward operator", description: "Deploys and operates the mission package.", x: 70, y: 260, width: 190, height: 78 },
    { id: "element_package", solutionId, viewId: "view_context", type: "Service", name: "Mission package", description: "Sensor, edge compute, gateway, and mission software.", x: 450, y: 230, width: 230, height: 110 },
    { id: "element_c2", solutionId, viewId: "view_context", type: "External system", name: "Mission C2 environment", description: "Receives quality-tagged tracks.", x: 860, y: 260, width: 230, height: 78 },
    { id: "element_sensor", solutionId, viewId: "view_interface", type: "Hardware", name: "Modular sensor", description: "Replaceable sensing module.", x: 70, y: 250, width: 190, height: 82 },
    { id: "element_edge", solutionId, viewId: "view_interface", type: "Hardware", name: "Edge compute", description: "Hosts the mission application and fusion services.", x: 370, y: 250, width: 200, height: 82 },
    { id: "element_gateway", solutionId, viewId: "view_interface", type: "Software", name: "Mission gateway", description: "Translates and publishes governed track messages.", x: 680, y: 250, width: 200, height: 82 },
    { id: "element_platform", solutionId, viewId: "view_interface", type: "External system", name: "Host platform", description: "Provides power, mounting, transport, and safety boundary.", x: 950, y: 250, width: 180, height: 82 },
    { id: "element_lab", solutionId, viewId: "view_transition", type: "Facility", name: "Integration lab", description: "Interface conformance and mission-thread test.", x: 80, y: 250, width: 190, height: 82 },
    { id: "element_demo", solutionId, viewId: "view_transition", type: "Environment", name: "Platform demonstration", description: "Representative operational environment.", x: 430, y: 250, width: 220, height: 82 },
    { id: "element_handoff", solutionId, viewId: "view_transition", type: "Person / organization", name: "Program delivery team", description: "Accepts the baseline and residual risks.", x: 820, y: 250, width: 220, height: 82 }
  );
  workspace.connections.push(
    { id: "connection_operator_package", solutionId, viewId: "view_context", sourceElementId: "element_operator", targetElementId: "element_package", type: "Human / process", label: "Configure / operate", protocol: "", description: "" },
    { id: "connection_package_c2", solutionId, viewId: "view_context", sourceElementId: "element_package", targetElementId: "element_c2", type: "Data", label: "Quality-tagged tracks", protocol: "Governed message schema", description: "" },
    { id: "connection_sensor_edge", solutionId, viewId: "view_interface", sourceElementId: "element_sensor", targetElementId: "element_edge", type: "Data", label: "Observations", protocol: "Open sensor interface", description: "" },
    { id: "connection_edge_gateway", solutionId, viewId: "view_interface", sourceElementId: "element_edge", targetElementId: "element_gateway", type: "API", label: "Fused tracks", protocol: "Versioned internal API", description: "" },
    { id: "connection_gateway_platform", solutionId, viewId: "view_interface", sourceElementId: "element_gateway", targetElementId: "element_platform", type: "Network", label: "Mission exchange", protocol: "Platform transport", description: "" },
    { id: "connection_lab_demo", solutionId, viewId: "view_transition", sourceElementId: "element_lab", targetElementId: "element_demo", type: "Human / process", label: "Verified baseline", protocol: "", description: "" },
    { id: "connection_demo_handoff", solutionId, viewId: "view_transition", sourceElementId: "element_demo", targetElementId: "element_handoff", type: "Human / process", label: "Evidence and residual risk", protocol: "", description: "" }
  );
  workspace.trades.push({ id: "trade_sensor_package", solutionId, title: "Mission package technology selection", question: "Which candidate best balances mission effect, open integration, delivery risk, and sustainment?", optionIds: ["candidate_alpha", "candidate_bravo"], recommendation: "Retain both candidates until the representative performance event closes the current evidence gap.", status: "In analysis" });
  workspace.decisions.push(
    { id: "decision_mosa_boundary", solutionId, title: "Establish the sensor-to-edge boundary as a controlled modular interface", status: "Approved", rationale: "Enables sensor competition and technology refresh without host-platform redesign.", evidenceIds: ["evidence_interface_draft"], owner: "Solution architect", date: createdAt.slice(0, 10) },
    { id: "decision_transport", solutionId, title: "Select the transport adaptation approach", status: "Proposed", rationale: "Pending degraded-link evidence and platform network constraints.", evidenceIds: [], owner: "", date: "" }
  );
  workspace.risks.push(
    { id: "risk_data_rights", solutionId, title: "Insufficient interface and software data rights could undermine MOSA objectives", likelihood: "Medium", impact: "High", owner: "Capture and contracts lead", mitigation: "Define required rights and delivery items before candidate down-select.", status: "Open" },
    { id: "risk_platform_access", solutionId, title: "Late host-platform access compresses integration and safety evidence", likelihood: "High", impact: "High", owner: "Integration lead", mitigation: "Use a representative interface harness and lock the platform event by the readiness review.", status: "Open" }
  );
  workspace.dependencies.push(
    { id: "dependency_platform_event", solutionId, title: "Host-platform integration window", type: "External schedule", provider: "Synthetic platform program", owner: "Integration lead", neededBy: "2026-11-09", status: "At risk", impact: "Late access compresses safety evidence, interface correction, and the mission-thread demonstration." }
  );
  workspace.assumptions.push(
    { id: "assumption_power", solutionId, statement: "The platform can provide the preliminary power allocation.", status: "Unverified", owner: "Platform integration lead", validationPlan: "Confirm through platform interface documentation and bench characterization." },
    { id: "assumption_data", solutionId, statement: "The government can obtain the interface data needed for competitive sensor replacement.", status: "Unverified", owner: "", validationPlan: "Review supplier assertions with contracts and data-rights counsel." }
  );
  workspace.roadmapItems.push(
    { id: "roadmap_assessment", solutionId, stage: "Assess", title: "Representative candidate assessment", start: "2026-09-14", end: "2026-10-02", owner: "Technology assessment lead", status: "Planned", gate: false },
    { id: "roadmap_review", solutionId, stage: "Architect", title: "Architecture and MOSA review", start: "2026-10-12", end: "2026-10-12", owner: "Solution architect", status: "Planned", gate: true },
    { id: "roadmap_demo", solutionId, stage: "Prove", title: "Platform mission-thread demonstration", start: "2026-11-09", end: "2026-11-20", owner: "Integration lead", status: "Planned", gate: true }
  );
  workspace.reviews.push(
    { id: "review_architecture", solutionId, name: "Architecture and MOSA review", type: "Architecture", due: "2026-10-12", owner: "Solution architect", status: "Planned", entryCriteria: "Mission thread, requirements trace, assessed candidates, interfaces, risks, and data-rights position." },
    { id: "review_transition", solutionId, name: "Transition readiness review", type: "Transition", due: "2026-11-30", owner: "", status: "Planned", entryCriteria: "Verified baseline, residual risks, configuration record, training, sustainment, and receiving-team acceptance." }
  );
  workspace.transitionActions.push(
    { id: "transition_interface", solutionId, title: "Deliver the governed interface package", owner: "Systems engineering lead", target: "Platform demonstration", status: "In progress", blocker: "Data-rights language not finalized" },
    { id: "transition_platform", solutionId, title: "Secure host-platform integration event", owner: "", target: "Platform demonstration", status: "Blocked", blocker: "Platform schedule not committed" },
    { id: "transition_handoff", solutionId, title: "Prepare configuration baseline and residual-risk handoff", owner: "Solution architect", target: "Transition readiness review", status: "Planned", blocker: "" }
  );
  workspace.savedAt = createdAt;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function string(value) {
  return typeof value === "string" ? value : "";
}

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function recordMap(collection) {
  return new Map(collection.filter(isObject).map(record => [record.id, record]));
}

function validateValueBounds(value, path, errors, depth = 0) {
  if (depth > 10) { errors.push(`${path} exceeds the supported nesting depth.`); return; }
  if (typeof value === "string" && value.length > 12_000) errors.push(`${path} exceeds 12,000 characters.`);
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) errors.push(`${path} is not valid JSON data.`);
  if (Array.isArray(value)) {
    if (value.length > 2_000) errors.push(`${path} exceeds 2,000 items.`);
    value.forEach((item, index) => validateValueBounds(item, `${path}[${index}]`, errors, depth + 1));
  } else if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > 100) errors.push(`${path} has too many fields.`);
    for (const key of keys) {
      if (["__proto__", "prototype", "constructor"].includes(key)) errors.push(`${path}.${key} is not supported.`);
      else validateValueBounds(value[key], `${path}.${key}`, errors, depth + 1);
    }
  }
}

function validateKnownKeys(value, allowedKeys, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} is not supported.`);
  }
}

function validateIdArray(value, path, errors, { requireItems = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (requireItems && !value.length) errors.push(`${path} must contain at least one record ID.`);
  for (const [index, item] of value.entries()) {
    if (!validId(item)) errors.push(`${path}[${index}] must be a valid record ID.`);
  }
}

function validateFieldType(value, type, path, errors) {
  if (type === "string" && typeof value !== "string") errors.push(`${path} must be a string.`);
  else if (type === "number" && !Number.isFinite(value)) errors.push(`${path} must be a finite number.`);
  else if (type === "nullable-number" && value !== null && !Number.isFinite(value)) errors.push(`${path} must be a finite number or null.`);
  else if (type === "boolean" && typeof value !== "boolean") errors.push(`${path} must be a boolean.`);
  else if (type === "array" && !Array.isArray(value)) errors.push(`${path} must be an array.`);
  else if (type === "object" && !isObject(value)) errors.push(`${path} must be an object.`);
  else if (type === "id" && !validId(value)) errors.push(`${path} must be a valid record ID.`);
  else if (type === "optional-id" && value !== "" && !validId(value)) errors.push(`${path} must be empty or a valid record ID.`);
  else if (type === "id-array") validateIdArray(value, path, errors);
}

function validateRequiredFields(value, fieldTypes, path, errors, commonKeys = []) {
  const allowedKeys = new Set([...commonKeys, ...Object.keys(fieldTypes)]);
  validateKnownKeys(value, allowedKeys, path, errors);
  for (const [field, type] of Object.entries(fieldTypes)) {
    if (!Object.hasOwn(value, field)) errors.push(`${path}.${field} is required.`);
    else validateFieldType(value[field], type, `${path}.${field}`, errors);
  }
}

function validateSolutionShape(solution, path, errors) {
  const stringFields = ["name", "customer", "domain", "stage", "status", "decision", "description", "classification", "createdAt", "updatedAt"];
  const allowedKeys = new Set(["id", ...stringFields, "mission", "proposal"]);
  validateKnownKeys(solution, allowedKeys, path, errors);
  for (const field of stringFields) {
    if (!Object.hasOwn(solution, field)) errors.push(`${path}.${field} is required.`);
    else if (typeof solution[field] !== "string") errors.push(`${path}.${field} must be a string.`);
  }
  for (const [field, nestedFields] of [["mission", MISSION_FIELDS], ["proposal", PROPOSAL_FIELDS]]) {
    if (!isObject(solution[field])) {
      errors.push(`${path}.${field} must be an object.`);
      continue;
    }
    validateKnownKeys(solution[field], new Set(nestedFields), `${path}.${field}`, errors);
    for (const nestedField of nestedFields) {
      if (!Object.hasOwn(solution[field], nestedField)) errors.push(`${path}.${field}.${nestedField} is required.`);
      else if (typeof solution[field][nestedField] !== "string") errors.push(`${path}.${field}.${nestedField} must be a string.`);
    }
  }
}

function validateScoreShape(score, path, errors) {
  if (!isObject(score)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateRequiredFields(score, { criterionId: "id", value: "nullable-number", rationale: "string", evidenceIds: "id-array" }, path, errors);
}

function validateRecordShape(record, collectionName, path, errors) {
  if (!isObject(record)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  validateRequiredFields(record, RECORD_FIELD_TYPES[collectionName], path, errors, ["id", "solutionId"]);
  if (collectionName === "candidates" && Array.isArray(record.scores)) {
    record.scores.forEach((score, index) => validateScoreShape(score, `${path}.scores[${index}]`, errors));
  }
}

export function validateWorkspace(candidate, { includeSnapshots = true } = {}) {
  const errors = [];
  if (!isObject(candidate)) return { valid: false, errors: ["Workspace must be a JSON object."] };
  const allowedTopLevel = new Set(["schema", "schemaVersion", "activeSolutionId", "savedAt", ...REQUIRED_COLLECTIONS]);
  for (const key of Object.keys(candidate)) if (!allowedTopLevel.has(key)) errors.push(`Workspace.${key} is not supported.`);
  validateValueBounds(candidate, "Workspace", errors);
  if (candidate.schema !== WORKSPACE_SCHEMA) errors.push(`Workspace.schema must equal ${WORKSPACE_SCHEMA}.`);
  if (candidate.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schema version. Expected ${SCHEMA_VERSION}.`);
  if (!validId(candidate.activeSolutionId)) errors.push("Workspace.activeSolutionId must be a valid solution ID.");
  if (!string(candidate.savedAt).trim()) errors.push("Workspace.savedAt is required.");
  for (const name of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(candidate[name])) errors.push(`Workspace.${name} must be an array.`);
    else if (candidate[name].length > 2_000) errors.push(`Workspace.${name} exceeds 2,000 records.`);
  }
  if (errors.length) return { valid: false, errors };
  if (!candidate.solutions.length) errors.push("Workspace requires at least one solution.");

  const seenIds = new Set();
  const solutions = recordMap(candidate.solutions);
  for (const [index, solution] of candidate.solutions.entries()) {
    if (!isObject(solution)) { errors.push(`solutions[${index}] must be an object.`); continue; }
    if (!validId(solution.id)) errors.push(`solutions[${index}].id is invalid.`);
    if (seenIds.has(solution.id)) errors.push(`Duplicate record ID: ${solution.id}.`);
    seenIds.add(solution.id);
    validateSolutionShape(solution, `solutions[${index}]`, errors);
    if (!string(solution.name).trim()) errors.push(`solutions[${index}].name is required.`);
    if (!STAGES.includes(solution.stage)) errors.push(`solutions[${index}].stage is unsupported.`);
  }

  const maps = Object.fromEntries(SCOPED_COLLECTIONS.map(name => [name, recordMap(candidate[name])]));
  for (const name of SCOPED_COLLECTIONS) {
    for (const [index, record] of candidate[name].entries()) {
      if (!isObject(record)) { errors.push(`${name}[${index}] must be an object.`); continue; }
      if (!validId(record.id)) errors.push(`${name}[${index}].id is invalid.`);
      if (seenIds.has(record.id)) errors.push(`Duplicate record ID: ${record.id}.`);
      seenIds.add(record.id);
      validateRecordShape(record, name, `${name}[${index}]`, errors);
      if (!validId(record.solutionId)) errors.push(`${name}[${index}].solutionId is invalid.`);
      if (!solutions.has(record.solutionId)) errors.push(`${name}[${index}].solutionId is invalid.`);
    }
  }
  if (errors.length) return { valid: false, errors };
  if (!solutions.has(candidate.activeSolutionId)) errors.push("activeSolutionId must reference an existing solution.");

  const sameSolution = (record, target, path) => {
    if (!target) errors.push(`${path} references a missing record.`);
    else if (record.solutionId !== target.solutionId) errors.push(`${path} crosses solution boundaries.`);
  };
  for (const [index, outcome] of candidate.outcomes.entries()) {
    for (const requirementId of Array.isArray(outcome.linkedRequirementIds) ? outcome.linkedRequirementIds : []) {
      sameSolution(outcome, maps.requirements.get(requirementId), `outcomes[${index}].linkedRequirementIds`);
    }
  }
  for (const [index, requirement] of candidate.requirements.entries()) {
    if (requirement.sourceEvidenceId) sameSolution(requirement, maps.evidence.get(requirement.sourceEvidenceId), `requirements[${index}].sourceEvidenceId`);
    for (const hotButtonId of Array.isArray(requirement.linkedHotButtonIds) ? requirement.linkedHotButtonIds : []) {
      sameSolution(requirement, maps.hotButtons.get(hotButtonId), `requirements[${index}].linkedHotButtonIds`);
    }
    for (const elementId of Array.isArray(requirement.linkedElementIds) ? requirement.linkedElementIds : []) {
      sameSolution(requirement, maps.elements.get(elementId), `requirements[${index}].linkedElementIds`);
    }
  }
  for (const [index, hotButton] of candidate.hotButtons.entries()) {
    if (!string(hotButton.title).trim()) errors.push(`hotButtons[${index}].title is required.`);
    if (!["Unverified", "Low", "Medium", "High"].includes(hotButton.confidence)) errors.push(`hotButtons[${index}].confidence is unsupported.`);
    if (!["Captured", "Validated", "Retired"].includes(hotButton.status)) errors.push(`hotButtons[${index}].status is unsupported.`);
  }
  for (const [index, winTheme] of candidate.winThemes.entries()) {
    if (!string(winTheme.title).trim()) errors.push(`winThemes[${index}].title is required.`);
    if (!["Draft", "Substantiated", "Retired"].includes(winTheme.status)) errors.push(`winThemes[${index}].status is unsupported.`);
    for (const hotButtonId of Array.isArray(winTheme.linkedHotButtonIds) ? winTheme.linkedHotButtonIds : []) sameSolution(winTheme, maps.hotButtons.get(hotButtonId), `winThemes[${index}].linkedHotButtonIds`);
    for (const evidenceId of Array.isArray(winTheme.sourceEvidenceIds) ? winTheme.sourceEvidenceIds : []) sameSolution(winTheme, maps.evidence.get(evidenceId), `winThemes[${index}].sourceEvidenceIds`);
  }
  for (const [index, criterion] of candidate.criteria.entries()) {
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0 || criterion.weight > 100) errors.push(`criteria[${index}].weight must be between 0 and 100.`);
  }
  for (const [index, technologyCandidate] of candidate.candidates.entries()) {
    if (!Array.isArray(technologyCandidate.scores)) errors.push(`candidates[${index}].scores must be an array.`);
    for (const [fieldName, maximum] of [["trl", 9], ["mrl", 10], ["irl", 9]]) {
      const value = technologyCandidate[fieldName];
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > maximum)) errors.push(`candidates[${index}].${fieldName} must be 1-${maximum} or null.`);
    }
    const scoredCriteria = new Set();
    for (const [scoreIndex, score] of (Array.isArray(technologyCandidate.scores) ? technologyCandidate.scores : []).entries()) {
      if (!SCORE_VALUES.has(score.value)) errors.push(`candidates[${index}].scores[${scoreIndex}].value must be 0-5 or null.`);
      if (scoredCriteria.has(score.criterionId)) errors.push(`candidates[${index}].scores contains duplicate criterion ${score.criterionId}.`);
      scoredCriteria.add(score.criterionId);
      sameSolution(technologyCandidate, maps.criteria.get(score.criterionId), `candidates[${index}].scores[${scoreIndex}].criterionId`);
      for (const evidenceId of Array.isArray(score.evidenceIds) ? score.evidenceIds : []) {
        sameSolution(technologyCandidate, maps.evidence.get(evidenceId), `candidates[${index}].scores[${scoreIndex}].evidenceIds`);
      }
    }
  }
  for (const [index, view] of candidate.architectureViews.entries()) {
    if (!VIEW_TEMPLATES.some(([value]) => value === view.template)) errors.push(`architectureViews[${index}].template is unsupported.`);
    if (![view.width, view.height].every(value => Number.isFinite(value) && value >= 300 && value <= 5000)) errors.push(`architectureViews[${index}] has invalid geometry.`);
  }
  for (const [index, element] of candidate.elements.entries()) {
    const view = maps.architectureViews.get(element.viewId);
    sameSolution(element, view, `elements[${index}].viewId`);
    if (!ELEMENT_TYPES.includes(element.type)) errors.push(`elements[${index}].type is unsupported.`);
    if (![element.x, element.y, element.width, element.height].every(Number.isFinite)) errors.push(`elements[${index}] has invalid geometry.`);
    if (view && (element.x < 0 || element.y < 0 || element.width < 60 || element.height < 40 || element.x + element.width > view.width || element.y + element.height > view.height)) {
      errors.push(`elements[${index}] falls outside its architecture view.`);
    }
  }
  for (const [index, connection] of candidate.connections.entries()) {
    const view = maps.architectureViews.get(connection.viewId);
    const source = maps.elements.get(connection.sourceElementId);
    const target = maps.elements.get(connection.targetElementId);
    sameSolution(connection, view, `connections[${index}].viewId`);
    sameSolution(connection, source, `connections[${index}].sourceElementId`);
    sameSolution(connection, target, `connections[${index}].targetElementId`);
    if (source && source.viewId !== connection.viewId) errors.push(`connections[${index}].sourceElementId is outside the selected view.`);
    if (target && target.viewId !== connection.viewId) errors.push(`connections[${index}].targetElementId is outside the selected view.`);
    if (source && target && source.id === target.id) errors.push(`connections[${index}] cannot connect an element to itself.`);
    if (!INTERFACE_TYPES.includes(connection.type)) errors.push(`connections[${index}].type is unsupported.`);
  }
  for (const [index, decision] of candidate.decisions.entries()) {
    for (const evidenceId of Array.isArray(decision.evidenceIds) ? decision.evidenceIds : []) sameSolution(decision, maps.evidence.get(evidenceId), `decisions[${index}].evidenceIds`);
  }
  for (const [index, trade] of candidate.trades.entries()) {
    for (const optionId of Array.isArray(trade.optionIds) ? trade.optionIds : []) sameSolution(trade, maps.candidates.get(optionId), `trades[${index}].optionIds`);
  }
  for (const [index, draft] of candidate.aiDrafts.entries()) {
    if (!AI_ACTIONS.includes(draft.action)) errors.push(`aiDrafts[${index}].action is unsupported.`);
    if (!STAGES.includes(draft.stage)) errors.push(`aiDrafts[${index}].stage is unsupported.`);
    if (!["Pending review", "Accepted", "Rejected"].includes(draft.status)) errors.push(`aiDrafts[${index}].status is unsupported.`);
    for (const citationId of Array.isArray(draft.citationIds) ? draft.citationIds : []) {
      const target = SCOPED_COLLECTIONS.map(name => maps[name].get(citationId)).find(Boolean) || solutions.get(citationId);
      if (!target) errors.push(`aiDrafts[${index}].citationIds references a missing record.`);
      else if (target.id !== draft.solutionId && target.solutionId !== draft.solutionId) errors.push(`aiDrafts[${index}].citationIds crosses solution boundaries.`);
    }
    const responseValidation = validateAiResponse({
      contract_version: "solution-assist-v1",
      solution_id: draft.solutionId,
      action: draft.action,
      request_id: draft.requestId,
      model: draft.model,
      result: draft.result
    }, candidate, draft.solutionId, draft.action);
    errors.push(...responseValidation.errors.map(error => `aiDrafts[${index}]: ${error}`));
    if (isObject(draft.result) && Array.isArray(draft.result.citation_ids) && (draft.citationIds.length !== draft.result.citation_ids.length || draft.citationIds.some(id => !draft.result.citation_ids.includes(id)))) {
      errors.push(`aiDrafts[${index}].citationIds must match result.citation_ids.`);
    }
  }
  if (includeSnapshots) {
    if (candidate.snapshots.length > MAX_SNAPSHOTS) errors.push(`Workspace.snapshots exceeds ${MAX_SNAPSHOTS} recovery points.`);
    for (const [index, snapshot] of candidate.snapshots.entries()) {
      if (!isObject(snapshot)) {
        errors.push(`snapshots[${index}] is invalid.`);
        continue;
      }
      validateKnownKeys(snapshot, new Set(["id", "createdAt", "label", "activeSolutionId", "workspace"]), `snapshots[${index}]`, errors);
      if (!validId(snapshot.id) || !string(snapshot.createdAt) || typeof snapshot.label !== "string" || !validId(snapshot.activeSolutionId) || !isObject(snapshot.workspace)) {
        errors.push(`snapshots[${index}] is invalid.`);
        continue;
      }
      if (seenIds.has(snapshot.id)) errors.push(`Duplicate record ID: ${snapshot.id}.`);
      seenIds.add(snapshot.id);
      if (snapshot.activeSolutionId !== snapshot.workspace.activeSolutionId) errors.push(`snapshots[${index}].activeSolutionId must match the nested workspace.`);
      if (!Array.isArray(snapshot.workspace.snapshots)) errors.push(`snapshots[${index}].workspace.snapshots must be an array.`);
      else if (snapshot.workspace.snapshots.length) errors.push(`snapshots[${index}].workspace must not contain nested snapshots.`);
      const result = validateWorkspace({ ...snapshot.workspace, snapshots: [] }, { includeSnapshots: false });
      errors.push(...result.errors.map(error => `snapshots[${index}]: ${error}`));
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateWorkspaceImport(candidate) {
  if (!isObject(candidate)) return { valid: false, errors: ["Import must contain a JSON object."] };
  if (candidate.schema !== WORKSPACE_SCHEMA || candidate.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, errors: [`Unsupported workspace. Expected ${WORKSPACE_SCHEMA} version ${SCHEMA_VERSION}.`] };
  }
  return validateWorkspace(candidate);
}

export function scoped(workspace, collectionName, solutionId = workspace.activeSolutionId) {
  return (workspace[collectionName] || []).filter(record => record.solutionId === solutionId);
}

export function assessmentResult(workspace, solutionId, candidateId) {
  const assessmentCandidate = scoped(workspace, "candidates", solutionId).find(record => record.id === candidateId);
  const criteria = scoped(workspace, "criteria", solutionId);
  if (!assessmentCandidate) return { score: null, coverage: 0, evidenceCoverage: 0, rows: [] };
  let weighted = 0;
  let scoredWeight = 0;
  let totalWeight = 0;
  let evidenceWeight = 0;
  const rows = criteria.map(criterion => {
    const item = assessmentCandidate.scores?.find(score => score.criterionId === criterion.id) || { value: null, rationale: "", evidenceIds: [] };
    const weight = Math.max(0, Number(criterion.weight) || 0);
    totalWeight += weight;
    if (item.value !== null && Number.isFinite(item.value)) {
      scoredWeight += weight;
      weighted += item.value * weight;
      if (item.evidenceIds?.length) evidenceWeight += weight;
    }
    return { criterion, ...item };
  });
  return {
    score: scoredWeight ? weighted / scoredWeight : null,
    coverage: totalWeight ? scoredWeight / totalWeight : 0,
    evidenceCoverage: scoredWeight ? evidenceWeight / scoredWeight : 0,
    rows
  };
}

export function collectObligations(workspace, solutionId = workspace.activeSolutionId) {
  const obligations = [];
  const add = (severity, stage, kind, message, recordId) => obligations.push({ id: `${kind}_${recordId}`, severity, stage, kind, message, recordId });
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) return obligations;
  if (!solution.mission.problem.trim()) add("high", "Discover", "mission-gap", "Mission problem is not defined", solution.id);
  if (!solution.decision.trim()) add("medium", "Discover", "decision-gap", "Decision to be supported is not defined", solution.id);
  for (const outcome of scoped(workspace, "outcomes", solutionId)) {
    if (!outcome.verificationMethod?.trim()) add("high", "Shape", "unverified-outcome", `Outcome lacks a verification method: ${outcome.title}`, outcome.id);
  }
  const requirements = scoped(workspace, "requirements", solutionId);
  const linkedHotButtonIds = new Set(requirements.flatMap(requirement => requirement.linkedHotButtonIds || []));
  for (const hotButton of scoped(workspace, "hotButtons", solutionId)) {
    if (hotButton.status !== "Retired" && !hotButton.source?.trim()) add("medium", "Discover", "hot-button-source-gap", `Customer hot button has no source: ${hotButton.title}`, hotButton.id);
    if (hotButton.status === "Captured") add("low", "Discover", "hot-button-validation-gap", `Customer hot button is not yet validated: ${hotButton.title}`, hotButton.id);
    if (hotButton.status !== "Retired" && !linkedHotButtonIds.has(hotButton.id)) add("medium", "Shape", "hot-button-trace-gap", `Customer hot button is not traced to a requirement: ${hotButton.title}`, hotButton.id);
  }
  for (const winTheme of scoped(workspace, "winThemes", solutionId)) {
    if (winTheme.status === "Retired") continue;
    if (!winTheme.linkedHotButtonIds?.length) add("medium", "Propose", "win-theme-customer-gap", `Win theme has no linked customer hot button: ${winTheme.title}`, winTheme.id);
    if (!winTheme.sourceEvidenceIds?.length) add("high", "Propose", "win-theme-proof-gap", `Win theme has no supporting evidence: ${winTheme.title}`, winTheme.id);
    if (!winTheme.customerValue?.trim() || !winTheme.discriminator?.trim() || !winTheme.proof?.trim()) add("medium", "Propose", "win-theme-content-gap", `Win theme is incomplete: ${winTheme.title}`, winTheme.id);
  }
  for (const requirement of requirements) {
    if (!requirement.sourceEvidenceId) add("medium", "Shape", "untraced-requirement", `Requirement has no source evidence: ${requirement.title}`, requirement.id);
    if (!requirement.acceptanceMethod?.trim()) add("high", "Shape", "acceptance-gap", `Requirement has no acceptance method: ${requirement.title}`, requirement.id);
    if (!requirement.linkedElementIds?.length) add("medium", "Architect", "architecture-trace-gap", `Requirement is not linked to an architecture element: ${requirement.title}`, requirement.id);
  }
  for (const candidate of scoped(workspace, "candidates", solutionId)) {
    const result = assessmentResult(workspace, solutionId, candidate.id);
    for (const row of result.rows) {
      if (row.value === null) add("medium", "Assess", "unknown-score", `${candidate.name}: ${row.criterion.name} is unknown`, candidate.id);
      else if (!row.rationale?.trim()) add("medium", "Assess", "unsupported-score", `${candidate.name}: ${row.criterion.name} lacks rationale`, candidate.id);
      else if (!row.evidenceIds?.length) add("low", "Assess", "unevidenced-score", `${candidate.name}: ${row.criterion.name} lacks linked evidence`, candidate.id);
    }
  }
  const elements = scoped(workspace, "elements", solutionId);
  const linkedIds = new Set(scoped(workspace, "connections", solutionId).flatMap(connection => [connection.sourceElementId, connection.targetElementId]));
  for (const element of elements) if (!linkedIds.has(element.id)) add("medium", "Architect", "interface-gap", `Architecture element has no defined exchange: ${element.name}`, element.id);
  for (const decision of scoped(workspace, "decisions", solutionId)) {
    if (decision.status !== "Approved") add("medium", "Prove", "open-decision", `Decision is unresolved: ${decision.title}`, decision.id);
    if (!decision.evidenceIds?.length) add("low", "Prove", "decision-evidence-gap", `Decision has no evidence link: ${decision.title}`, decision.id);
  }
  for (const risk of scoped(workspace, "risks", solutionId)) if (risk.status !== "Closed" && !risk.owner?.trim()) add("high", "Prove", "unowned-risk", `Risk has no owner: ${risk.title}`, risk.id);
  for (const dependency of scoped(workspace, "dependencies", solutionId)) {
    if (dependency.status !== "Satisfied" && !dependency.owner?.trim()) add("medium", "Prove", "dependency-owner-gap", `Dependency has no owner: ${dependency.title}`, dependency.id);
    if (["At risk", "Blocked"].includes(dependency.status)) add(dependency.status === "Blocked" ? "high" : "medium", "Transition", "dependency-gap", `Dependency is ${dependency.status.toLowerCase()}: ${dependency.title}`, dependency.id);
  }
  for (const review of scoped(workspace, "reviews", solutionId)) if (review.status !== "Complete" && !review.owner?.trim()) add("medium", "Prove", "review-owner-gap", `Review has no owner: ${review.name}`, review.id);
  for (const action of scoped(workspace, "transitionActions", solutionId)) {
    if (action.status !== "Complete" && !action.owner?.trim()) add("high", "Transition", "transition-owner-gap", `Transition action has no owner: ${action.title}`, action.id);
    if (action.status === "Blocked") add("high", "Transition", "transition-blocker", `Transition action is blocked: ${action.title}`, action.id);
  }
  return obligations.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
}

export function buildReadiness(workspace, solutionId = workspace.activeSolutionId) {
  const requirements = scoped(workspace, "requirements", solutionId);
  const hotButtons = scoped(workspace, "hotButtons", solutionId).filter(record => record.status !== "Retired");
  const candidates = scoped(workspace, "candidates", solutionId);
  const scores = candidates.flatMap(candidate => assessmentResult(workspace, solutionId, candidate.id).rows);
  const elements = scoped(workspace, "elements", solutionId);
  const linkedElements = new Set(scoped(workspace, "connections", solutionId).flatMap(connection => [connection.sourceElementId, connection.targetElementId]));
  const transitions = scoped(workspace, "transitionActions", solutionId);
  const ratio = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : 0;
  const tracedRequirements = requirements.filter(record => record.sourceEvidenceId && record.acceptanceMethod && record.linkedElementIds?.length).length;
  const tracedHotButtons = hotButtons.filter(record => record.source && requirements.some(requirement => requirement.linkedHotButtonIds?.includes(record.id))).length;
  const traceability = ratio(tracedRequirements + tracedHotButtons, requirements.length + hotButtons.length);
  const evidence = ratio(scores.filter(score => score.value !== null && score.evidenceIds?.length).length, scores.length);
  const interfaces = ratio(elements.filter(element => linkedElements.has(element.id)).length, elements.length);
  const transition = ratio(transitions.filter(action => action.owner && action.status !== "Blocked").length, transitions.length);
  return {
    traceability,
    evidence,
    interfaces,
    transition,
    overall: Math.round((traceability + evidence + interfaces + transition) / 4)
  };
}

export function autoLayoutView(workspace, viewId) {
  const next = structuredClone(workspace);
  const view = next.architectureViews.find(record => record.id === viewId);
  if (!view) return next;
  const elements = next.elements.filter(record => record.viewId === viewId);
  const columns = Math.max(1, Math.ceil(Math.sqrt(elements.length * 1.7)));
  const rows = Math.max(1, Math.ceil(elements.length / columns));
  const cellWidth = view.width / columns;
  const cellHeight = view.height / rows;
  elements.forEach((element, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    element.width = Math.min(220, Math.max(140, cellWidth - 70));
    element.height = 82;
    element.x = Math.round(column * cellWidth + (cellWidth - element.width) / 2);
    element.y = Math.round(row * cellHeight + (cellHeight - element.height) / 2);
  });
  return next;
}

function elementColor(type) {
  return ({
    "Person / organization": "#67d7e0",
    "Mission activity": "#eab96b",
    Hardware: "#76d1a0",
    Software: "#9eb7ff",
    Service: "#b58ee7",
    "Data store": "#78b9d5",
    Network: "#e39c73",
    Facility: "#a8b0b8",
    Environment: "#8bbf97",
    "External system": "#ef8d8d"
  })[type] || "#8c9cab";
}

export function buildDiagramSvg(workspace, viewId, { standalone = false } = {}) {
  const view = workspace.architectureViews.find(record => record.id === viewId);
  if (!view) return "";
  const idSuffix = String(view.id || viewId).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 128) || "view";
  const titleId = `diagram-${idSuffix}-title`;
  const descriptionId = `diagram-${idSuffix}-description`;
  const arrowId = `diagram-${idSuffix}-arrow`;
  const shadowId = `diagram-${idSuffix}-shadow`;
  const elements = workspace.elements.filter(record => record.viewId === viewId);
  const byId = new Map(elements.map(element => [element.id, element]));
  const connections = workspace.connections.filter(record => record.viewId === viewId);
  const defs = `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#718495"/></marker><filter id="${shadowId}" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".28"/></filter></defs>`;
  const lineMarkup = connections.map(connection => {
    const source = byId.get(connection.sourceElementId);
    const target = byId.get(connection.targetElementId);
    if (!source || !target) return "";
    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height / 2;
    const x2 = target.x + target.width / 2;
    const y2 = target.y + target.height / 2;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return `<g data-connection-id="${escapeHtml(connection.id)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#718495" stroke-width="2" marker-end="url(#${arrowId})"/><rect x="${midX - 70}" y="${midY - 13}" width="140" height="24" rx="5" fill="#0b1119" stroke="#273442"/><text x="${midX}" y="${midY + 4}" text-anchor="middle" fill="#b8c4cf" font-size="11">${escapeHtml(connection.label || connection.type)}</text></g>`;
  }).join("");
  const elementMarkup = elements.map(element => {
    const color = elementColor(element.type);
    const label = escapeHtml(element.name).slice(0, 80);
    const type = escapeHtml(element.type).slice(0, 40);
    return `<g data-element-id="${escapeHtml(element.id)}" tabindex="0" role="button" aria-label="${label}, ${type}" transform="translate(${element.x} ${element.y})"><rect width="${element.width}" height="${element.height}" rx="10" fill="#162230" stroke="${color}" stroke-width="2" filter="url(#${shadowId})"/><rect width="5" height="${element.height}" rx="3" fill="${color}"/><text x="16" y="25" fill="${color}" font-size="10" font-weight="700" letter-spacing="1">${type.toUpperCase()}</text><text x="16" y="52" fill="#e7edf3" font-size="14" font-weight="700">${label}</text></g>`;
  }).join("");
  const content = `${defs}<rect width="100%" height="100%" fill="#0f1822"/><g>${lineMarkup}${elementMarkup}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" width="${view.width}" height="${view.height}" role="img" aria-labelledby="${titleId} ${descriptionId}"><title id="${titleId}">${escapeHtml(view.name)}</title><desc id="${descriptionId}">${escapeHtml(view.description || "Architecture elements and their exchanges.")}</desc>${content}</svg>`;
  return standalone ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg;
}

function markdownText(value) {
  return String(value ?? "").replace(/([\\`*_{}\[\]<>#+.!|])/g, "\\$1").trim();
}

function markdownTable(headers, rows) {
  const clean = value => markdownText(value).replace(/\r?\n/g, " ") || "—";
  return `| ${headers.map(clean).join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row.map(clean).join(" | ")} |`).join("\n")}`;
}

export function buildDecisionPackageMarkdown(workspace, solutionId = workspace.activeSolutionId) {
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) return "";
  const outcomes = scoped(workspace, "outcomes", solutionId);
  const hotButtons = scoped(workspace, "hotButtons", solutionId);
  const requirements = scoped(workspace, "requirements", solutionId);
  const evidence = scoped(workspace, "evidence", solutionId);
  const candidates = scoped(workspace, "candidates", solutionId);
  const trades = scoped(workspace, "trades", solutionId);
  const views = scoped(workspace, "architectureViews", solutionId);
  const risks = scoped(workspace, "risks", solutionId);
  const dependencies = scoped(workspace, "dependencies", solutionId);
  const winThemes = scoped(workspace, "winThemes", solutionId);
  const decisions = scoped(workspace, "decisions", solutionId);
  const roadmap = scoped(workspace, "roadmapItems", solutionId);
  const transitions = scoped(workspace, "transitionActions", solutionId);
  const obligations = collectObligations(workspace, solutionId);
  const readiness = buildReadiness(workspace, solutionId);
  const sections = [
    `# ${markdownText(solution.name)} — Decision Package`,
    `> **Data marking:** ${markdownText(solution.classification)}  \n> Generated ${new Date().toLocaleString()} from a browser-local workspace. This package is not an authorization or DoDAF-conformance determination.`,
    "## Decision",
    markdownText(solution.decision) || "Not yet defined.",
    "## Mission brief",
    `**Problem.** ${markdownText(solution.mission.problem) || "Not yet defined."}\n\n**Operational context.** ${markdownText(solution.mission.operationalContext) || "Not yet defined."}\n\n**Current state.** ${markdownText(solution.mission.currentState) || "Not yet defined."}\n\n**Desired state.** ${markdownText(solution.mission.desiredState) || "Not yet defined."}\n\n**Constraints.** ${markdownText(solution.mission.constraints) || "Not yet defined."}`,
    "## Outcomes and verification",
    markdownTable(["Outcome", "Verification method"], outcomes.map(record => [record.title, record.verificationMethod])),
    "## Customer hot buttons and decision drivers",
    markdownTable(["Customer signal", "Source", "Confidence", "Validation", "Traced requirements"], hotButtons.map(record => [record.title, record.source, record.confidence, record.status, requirements.filter(requirement => requirement.linkedHotButtonIds?.includes(record.id)).map(requirement => requirement.title).join("; ") || "None"])),
    "## Requirements trace",
    markdownTable(["Requirement", "Type", "Priority", "Source", "Acceptance", "Architecture links"], requirements.map(record => [record.title, record.type, record.priority, evidence.find(item => item.id === record.sourceEvidenceId)?.title || "Untraced", record.acceptanceMethod, record.linkedElementIds?.join(", ") || "None"])),
    "## Technology Assessment",
    ...candidates.flatMap(candidate => {
      const result = assessmentResult(workspace, solutionId, candidate.id);
      return [
        `### ${markdownText(candidate.name)}`,
        `Weighted score: ${result.score === null ? "Unknown" : result.score.toFixed(2)} / 5 · Assessment coverage: ${Math.round(result.coverage * 100)}% · Evidence coverage: ${Math.round(result.evidenceCoverage * 100)}%`,
        markdownTable(["Criterion", "Weight", "Score", "Rationale", "Evidence"], result.rows.map(row => [row.criterion.name, `${row.criterion.weight}%`, row.value === null ? "Unknown" : row.value, row.rationale, row.evidenceIds?.map(id => evidence.find(item => item.id === id)?.title || id).join("; ") || "None"]))
      ];
    }),
    "## Trade studies",
    markdownTable(["Trade study", "Decision question", "Options", "Recommendation", "Status"], trades.map(record => [record.title, record.question, record.optionIds.map(id => candidates.find(item => item.id === id)?.name || id).join("; ") || "None", record.recommendation, record.status])),
    "## Architecture views",
    ...views.map(view => `### ${markdownText(view.name)}\n\n${markdownText(view.description) || "No description."}\n\n- Template: ${markdownText(VIEW_TEMPLATES.find(([value]) => value === view.template)?.[1] || view.template)}\n- Elements: ${workspace.elements.filter(record => record.viewId === view.id).length}\n- Exchanges: ${workspace.connections.filter(record => record.viewId === view.id).length}`),
    "## Decisions",
    markdownTable(["Decision", "Status", "Owner", "Rationale", "Supporting evidence"], decisions.map(record => [record.title, record.status, record.owner, record.rationale, record.evidenceIds.map(id => evidence.find(item => item.id === id)?.title || id).join("; ") || "None"])),
    "## Risks",
    markdownTable(["Risk", "Likelihood", "Impact", "Owner", "Mitigation", "Status"], risks.map(record => [record.title, record.likelihood, record.impact, record.owner, record.mitigation, record.status])),
    "## Dependencies",
    markdownTable(["Dependency", "Type", "Provider", "Owner", "Needed by", "Status", "Impact"], dependencies.map(record => [record.title, record.type, record.provider, record.owner, record.neededBy, record.status, record.impact])),
    "## Win themes",
    markdownTable(["Win theme", "Customer value", "Discriminator", "Proof", "Customer signals", "Evidence", "Status"], winThemes.map(record => [record.title, record.customerValue, record.discriminator, record.proof, record.linkedHotButtonIds?.map(id => hotButtons.find(item => item.id === id)?.title || id).join("; ") || "None", record.sourceEvidenceIds?.map(id => evidence.find(item => item.id === id)?.title || id).join("; ") || "None", record.status])),
    "## Roadmap and gates",
    markdownTable(["Stage", "Activity", "Start", "End", "Owner", "Status", "Gate"], roadmap.map(record => [record.stage, record.title, record.start, record.end, record.owner, record.status, record.gate ? "Yes" : "No"])),
    "## Transition plan",
    markdownTable(["Action", "Owner", "Target", "Status", "Blocker"], transitions.map(record => [record.title, record.owner, record.target, record.status, record.blocker])),
    "## Readiness and evidence gaps",
    `Overall ${readiness.overall}% · Traceability ${readiness.traceability}% · Evidence ${readiness.evidence}% · Interfaces ${readiness.interfaces}% · Transition ${readiness.transition}%`,
    obligations.length ? obligations.map(item => `- **${markdownText(item.stage)} · ${markdownText(item.severity.toUpperCase())}:** ${markdownText(item.message)}`).join("\n") : "No deterministic gaps detected.",
    "## Source evidence",
    markdownTable(["Evidence", "Source", "Confidence", "Reference", "Notes"], evidence.map(record => [record.title, record.source, record.confidence, safeHttpUrl(record.url), record.notes]))
  ];
  return `${sections.filter(value => value !== "").join("\n\n")}\n`;
}

export function buildDecisionPackageHtml(workspace, solutionId = workspace.activeSolutionId) {
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) return "";
  const markdown = buildDecisionPackageMarkdown(workspace, solutionId);
  const views = scoped(workspace, "architectureViews", solutionId);
  const diagrams = views.map(view => `<section class="diagram"><h2>${escapeHtml(view.name)}</h2><p>${escapeHtml(view.description)}</p>${buildDiagramSvg(workspace, view.id)}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(solution.name)} — Decision Package</title><style>body{max-width:980px;margin:0 auto;padding:42px;font:15px/1.55 Segoe UI,Arial,sans-serif;color:#18212a}pre{white-space:pre-wrap;font:14px/1.55 Segoe UI,Arial,sans-serif}.marking{padding:10px 14px;border:1px solid #b8893d;background:#fff8e8;font-weight:700}.diagram{page-break-before:always}.diagram svg{max-width:100%;height:auto;border:1px solid #ccd5dd;background:#0f1822}@media print{body{padding:0}.diagram{break-before:page}}</style></head><body><p class="marking">${escapeHtml(solution.classification)} · NO CUI / CLASSIFIED DATA</p><pre>${escapeHtml(markdown)}</pre>${diagrams}</body></html>`;
}

export function makeSnapshot(workspace, label = "Automatic snapshot") {
  const payload = structuredClone(workspace);
  payload.snapshots = [];
  return {
    id: makeId("snapshot"),
    createdAt: nowIso(),
    label: String(label).slice(0, 140),
    activeSolutionId: workspace.activeSolutionId,
    workspace: payload
  };
}

export function pushSnapshot(workspace, label) {
  const next = structuredClone(workspace);
  next.snapshots = [makeSnapshot(workspace, label), ...next.snapshots].slice(0, MAX_SNAPSHOTS);
  return next;
}

export function restoreSnapshot(workspace, snapshotId) {
  const snapshot = workspace.snapshots.find(record => record.id === snapshotId);
  if (!snapshot) throw new Error("Snapshot not found.");
  const result = validateWorkspace({ ...snapshot.workspace, snapshots: [] }, { includeSnapshots: false });
  if (!result.valid) throw new Error(`Snapshot is invalid: ${result.errors[0]}`);
  const preRestore = makeSnapshot(workspace, "Before recovery restore");
  const restored = structuredClone(snapshot.workspace);
  restored.snapshots = [preRestore, ...workspace.snapshots].slice(0, MAX_SNAPSHOTS);
  restored.savedAt = nowIso();
  return restored;
}

export function buildAiPayload(workspace, solutionId, action, stage, options = {}) {
  const solution = workspace.solutions.find(record => record.id === solutionId);
  if (!solution) throw new Error("Solution not found.");
  const allowedActions = new Set(["draft_artifact", "critique_artifact", "find_gaps", "generate_review_questions", "propose_architecture_view"]);
  if (!allowedActions.has(action)) throw new Error("Unsupported AI action.");
  if (!STAGES.includes(stage)) throw new Error("Unsupported lifecycle stage.");
  const stageCollections = {
    Discover: ["stakeholders", "hotButtons", "outcomes", "measures", "assumptions", "evidence"],
    Shape: ["hotButtons", "outcomes", "measures", "requirements", "evidence", "assumptions"],
    Assess: ["criteria", "candidates", "evidence", "trades", "risks", "dependencies"],
    Architect: ["requirements", "architectureViews", "elements", "connections", "decisions", "risks", "dependencies", "evidence"],
    Prove: ["trades", "decisions", "risks", "dependencies", "reviews", "evidence", "requirements"],
    Propose: ["hotButtons", "winThemes", "requirements", "decisions", "risks", "dependencies", "roadmapItems", "evidence"],
    Transition: ["roadmapItems", "reviews", "transitionActions", "risks", "dependencies", "decisions"]
  };
  const recordType = {
    stakeholders: "stakeholder", hotButtons: "customer_hot_button", winThemes: "win_theme", outcomes: "outcome", measures: "measure", requirements: "requirement",
    evidence: "evidence", criteria: "assessment", candidates: "technology_candidate",
    architectureViews: "architecture_view", elements: "architecture_element", connections: "architecture_connection",
    trades: "trade", decisions: "decision", risks: "risk", dependencies: "dependency", assumptions: "assumption",
    roadmapItems: "roadmap_item", reviews: "review", transitionActions: "transition_action"
  };
  const facts = [{
    solution_id: solution.id,
    record_id: solution.id,
    record_type: "mission_context",
    title: solution.name,
    content: JSON.stringify({
      customer: solution.customer,
      domain: solution.domain,
      decision: solution.decision,
      description: solution.description,
      mission: solution.mission,
      proposal: stage === "Propose" ? solution.proposal : undefined
    }).slice(0, 12_000)
  }];
  for (const collection of stageCollections[stage]) {
    for (const record of scoped(workspace, collection, solutionId)) {
      if (facts.length >= 100) break;
      facts.push({
        solution_id: solution.id,
        record_id: record.id,
        record_type: recordType[collection],
        title: String(record.title || record.name || record.label || collection).slice(0, 200),
        content: JSON.stringify(record).slice(0, 12_000)
      });
    }
  }
  const focus = String(options.focus || "").slice(0, 1_000);
  const reviewTypeByStage = {
    Discover: "mission",
    Shape: "requirements",
    Assess: "technology",
    Architect: "architecture",
    Prove: "architecture",
    Propose: "proposal",
    Transition: "transition"
  };
  const parameters = ({
    draft_artifact: { artifact_type: options.artifactType || "decision_brief", ...(focus ? { focus } : {}) },
    critique_artifact: { artifact_type: options.artifactType || "decision_brief", target_record_id: options.targetRecordId || solution.id, ...(focus ? { focus } : {}) },
    find_gaps: { ...(focus ? { focus } : {}) },
    generate_review_questions: { review_type: options.reviewType || reviewTypeByStage[stage], ...(focus ? { focus } : {}) },
    propose_architecture_view: { view_type: options.viewType || "system_interfaces", ...(focus ? { focus } : {}) }
  })[action];
  return {
    contract_version: "solution-assist-v1",
    workspace_version: WORKSPACE_SCHEMA,
    action,
    solution_id: solution.id,
    today: new Date().toISOString().slice(0, 10),
    parameters,
    facts,
    acknowledgment: {
      reviewed_exact_payload: true,
      approved_unclassified_non_cui_only: true,
      no_restricted_content: true
    }
  };
}

export function validateAiResponse(value, workspace, solutionId, expectedAction = "") {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["AI response must be an object."] };
  validateKnownKeys(value, new Set(["contract_version", "solution_id", "action", "request_id", "model", "result", "usage"]), "AI response", errors);
  if (value.contract_version !== "solution-assist-v1") errors.push("AI response contract version is unsupported.");
  if (value.solution_id !== solutionId) errors.push("AI response belongs to another solution.");
  if (!AI_ACTIONS.includes(value.action)) errors.push("AI response action is unsupported.");
  if (expectedAction && value.action !== expectedAction) errors.push("AI response action does not match the reviewed request.");
  for (const field of ["request_id", "model"]) {
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > 200) errors.push(`AI response.${field} is missing or invalid.`);
  }
  if (Object.hasOwn(value, "usage") && !isObject(value.usage)) errors.push("AI response.usage must be an object when provided.");
  if (!isObject(value.result)) errors.push("AI response.result has an invalid shape.");
  const validIds = new Set([solutionId, ...SCOPED_COLLECTIONS.flatMap(name => scoped(workspace, name, solutionId).map(record => record.id))]);
  const result = isObject(value.result) ? value.result : {};
  const resultFields = ["summary", "drafts", "findings", "review_questions", "architecture_views", "assumptions", "warnings", "citation_ids"];
  if (isObject(value.result)) validateKnownKeys(result, new Set(resultFields), "AI response.result", errors);
  if (typeof result.summary !== "string" || !result.summary.trim() || result.summary.length > 2_000) errors.push("AI response.result.summary has an invalid shape.");
  const limits = { drafts: 1, findings: 20, review_questions: 20, architecture_views: 1, assumptions: 10, warnings: 10, citation_ids: 50 };
  for (const name of resultFields.slice(1)) {
    if (!Array.isArray(result[name])) errors.push(`AI response.result.${name} has an invalid shape.`);
    else if (result[name].length > limits[name]) errors.push(`AI response.result.${name} exceeds its item limit.`);
  }

  const collectedCitations = new Set();
  const validateCitations = (citations, path, required = true, collect = true) => {
    if (!Array.isArray(citations)) {
      errors.push(`${path} must be an array.`);
      return;
    }
    if (citations.length > 50) errors.push(`${path} exceeds its item limit.`);
    if (required && !citations.length) errors.push(`${path} must cite at least one selected workspace fact.`);
    const seen = new Set();
    for (const [index, id] of citations.entries()) {
      if (!AI_SAFE_ID.test(id || "") || !validIds.has(id)) errors.push(`${path}[${index}] contains an invalid or cross-solution citation.`);
      if (seen.has(id)) errors.push(`${path}[${index}] duplicates a citation.`);
      seen.add(id);
      if (collect && validIds.has(id)) collectedCitations.add(id);
    }
  };
  const validateOutputString = (item, field, path, maximum, required = false) => {
    const valueAtField = item[field];
    if (typeof valueAtField !== "string" || valueAtField.length > maximum || (required && !valueAtField.trim())) errors.push(`${path}.${field} is invalid.`);
  };
  const validateOutputObject = (item, path, fields) => {
    if (!isObject(item)) {
      errors.push(`${path} must be an object.`);
      return false;
    }
    validateKnownKeys(item, new Set(fields), path, errors);
    for (const field of fields) if (!Object.hasOwn(item, field)) errors.push(`${path}.${field} is required.`);
    return true;
  };

  for (const [index, draft] of (Array.isArray(result.drafts) ? result.drafts : []).entries()) {
    const path = `AI response.result.drafts[${index}]`;
    if (!validateOutputObject(draft, path, ["artifact_type", "title", "markdown", "citation_ids"])) continue;
    if (!AI_ARTIFACT_TYPES.includes(draft.artifact_type)) errors.push(`${path}.artifact_type is unsupported.`);
    validateOutputString(draft, "title", path, 200, true);
    validateOutputString(draft, "markdown", path, 12_000, true);
    validateCitations(draft.citation_ids, `${path}.citation_ids`);
  }
  for (const [index, finding] of (Array.isArray(result.findings) ? result.findings : []).entries()) {
    const path = `AI response.result.findings[${index}]`;
    if (!validateOutputObject(finding, path, ["severity", "category", "title", "detail", "recommendation", "citation_ids"])) continue;
    if (!AI_FINDING_SEVERITIES.includes(finding.severity)) errors.push(`${path}.severity is unsupported.`);
    if (!AI_FINDING_CATEGORIES.includes(finding.category)) errors.push(`${path}.category is unsupported.`);
    validateOutputString(finding, "title", path, 200, true);
    validateOutputString(finding, "detail", path, 1_500, true);
    validateOutputString(finding, "recommendation", path, 1_500, true);
    validateCitations(finding.citation_ids, `${path}.citation_ids`);
  }
  for (const [index, question] of (Array.isArray(result.review_questions) ? result.review_questions : []).entries()) {
    const path = `AI response.result.review_questions[${index}]`;
    if (!validateOutputObject(question, path, ["question", "rationale", "citation_ids"])) continue;
    validateOutputString(question, "question", path, 500, true);
    validateOutputString(question, "rationale", path, 1_000, true);
    validateCitations(question.citation_ids, `${path}.citation_ids`);
  }
  for (const collectionName of ["assumptions", "warnings"]) {
    for (const [index, item] of (Array.isArray(result[collectionName]) ? result[collectionName] : []).entries()) {
      const path = `AI response.result.${collectionName}[${index}]`;
      if (!validateOutputObject(item, path, ["text", "citation_ids"])) continue;
      validateOutputString(item, "text", path, 1_000, true);
      validateCitations(item.citation_ids, `${path}.citation_ids`);
    }
  }
  for (const [viewIndex, view] of (Array.isArray(result.architecture_views) ? result.architecture_views : []).entries()) {
    const path = `AI response.result.architecture_views[${viewIndex}]`;
    if (!validateOutputObject(view, path, ["view_type", "title", "purpose", "nodes", "connections", "citation_ids"])) continue;
    if (!AI_VIEW_TYPES.includes(view.view_type)) errors.push(`${path}.view_type is unsupported.`);
    validateOutputString(view, "title", path, 200, true);
    validateOutputString(view, "purpose", path, 1_000, true);
    if (!Array.isArray(view.nodes) || !view.nodes.length || view.nodes.length > 24) errors.push(`${path}.nodes is invalid.`);
    if (!Array.isArray(view.connections) || view.connections.length > 40) errors.push(`${path}.connections is invalid.`);
    validateCitations(view.citation_ids, `${path}.citation_ids`);
    const nodes = new Set();
    for (const [nodeIndex, node] of (Array.isArray(view.nodes) ? view.nodes : []).entries()) {
      const nodePath = `${path}.nodes[${nodeIndex}]`;
      if (!validateOutputObject(node, nodePath, ["node_id", "source_record_id", "element_type", "label", "description", "citation_ids"])) continue;
      if (!AI_SAFE_ID.test(node.node_id || "") || nodes.has(node.node_id)) errors.push(`${nodePath}.node_id is invalid or duplicated.`);
      nodes.add(node.node_id);
      if (typeof node.source_record_id !== "string" || node.source_record_id.length > 128 || (node.source_record_id && (!AI_SAFE_ID.test(node.source_record_id) || !validIds.has(node.source_record_id)))) errors.push(`${nodePath}.source_record_id is invalid or cross-solution.`);
      if (!AI_ELEMENT_TYPES.includes(node.element_type)) errors.push(`${nodePath}.element_type is unsupported.`);
      validateOutputString(node, "label", nodePath, 200, true);
      validateOutputString(node, "description", nodePath, 1_000);
      validateCitations(node.citation_ids, `${nodePath}.citation_ids`);
    }
    const connections = new Set();
    for (const [connectionIndex, connection] of (Array.isArray(view.connections) ? view.connections : []).entries()) {
      const connectionPath = `${path}.connections[${connectionIndex}]`;
      if (!validateOutputObject(connection, connectionPath, ["connection_id", "source_node_id", "target_node_id", "interface_type", "label", "citation_ids"])) continue;
      if (!AI_SAFE_ID.test(connection.connection_id || "") || connections.has(connection.connection_id)) errors.push(`${connectionPath}.connection_id is invalid or duplicated.`);
      connections.add(connection.connection_id);
      if (!AI_SAFE_ID.test(connection.source_node_id || "") || !nodes.has(connection.source_node_id)) errors.push(`${connectionPath}.source_node_id is invalid or missing.`);
      if (!AI_SAFE_ID.test(connection.target_node_id || "") || !nodes.has(connection.target_node_id)) errors.push(`${connectionPath}.target_node_id is invalid or missing.`);
      if (connection.source_node_id === connection.target_node_id) errors.push(`${connectionPath} cannot connect a node to itself.`);
      if (!AI_INTERFACE_TYPES.includes(connection.interface_type)) errors.push(`${connectionPath}.interface_type is unsupported.`);
      validateOutputString(connection, "label", connectionPath, 200);
      validateCitations(connection.citation_ids, `${connectionPath}.citation_ids`);
    }
  }
  if (Array.isArray(result.citation_ids)) {
    validateCitations(result.citation_ids, "AI response.result.citation_ids", false, false);
    const union = new Set(result.citation_ids);
    if (union.size !== collectedCitations.size || [...collectedCitations].some(id => !union.has(id))) errors.push("AI response.result.citation_ids does not match the cited item union.");
  }
  if (value.action === "draft_artifact" && (result.drafts || []).length !== 1) errors.push("AI draft action must return exactly one draft.");
  if (value.action === "critique_artifact" && !(result.findings || []).length) errors.push("AI critique action must return at least one finding.");
  if (value.action === "generate_review_questions" && !(result.review_questions || []).length) errors.push("AI review action must return at least one review question.");
  if (value.action === "propose_architecture_view" && (result.architecture_views || []).length !== 1) errors.push("AI architecture action must return exactly one view.");
  const irrelevant = ({
    draft_artifact: ["findings", "review_questions", "architecture_views"],
    critique_artifact: ["drafts", "review_questions", "architecture_views"],
    find_gaps: ["drafts", "review_questions", "architecture_views"],
    generate_review_questions: ["drafts", "findings", "architecture_views"],
    propose_architecture_view: ["drafts", "findings", "review_questions"]
  })[value.action] || [];
  for (const name of irrelevant) if ((result[name] || []).length) errors.push(`AI response.result.${name} is not allowed for ${value.action}.`);
  return { valid: errors.length === 0, errors };
}
