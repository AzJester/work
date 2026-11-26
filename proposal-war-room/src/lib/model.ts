// The pursuit: everything one proposal needs, as one document. It saves, exports and imports as a whole.

import { isISODate } from "./calendar.ts";
import type { ISODate } from "./calendar.ts";
import { MILESTONE_IDS, emptySchedule, normalizeSettings } from "./scheduler.ts";
import type { DiffRow, Milestone, MilestoneId, ScheduleState } from "./scheduler.ts";

export const SCHEMA_VERSION = 1;
export const APP_ID = "astrion-proposal-war-room";

export type SubmissionMethod = "portal" | "email" | "hand";
export const SUBMISSION_METHODS: readonly { value: SubmissionMethod; label: string }[] = [
  { value: "portal", label: "Portal" },
  { value: "email", label: "Email" },
  { value: "hand", label: "Hand delivery" },
];

export const TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona (no daylight time)" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "UTC", label: "UTC" },
];
export const timeZoneLabel = (zone: string): string => TIME_ZONES.find(item => item.value === zone)?.label ?? zone;

export const SECTION_STATUSES = ["Not started", "Outlining", "Drafting", "In review", "Final"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export const REQ_SOURCES = ["L", "M", "SOW", "Other"] as const;
export type ReqSource = (typeof REQ_SOURCES)[number];
export const REQ_TYPES = ["shall", "must", "will", "should", "evaluation factor", "subfactor"] as const;
export type ReqType = (typeof REQ_TYPES)[number];
export const REQ_STATUSES = ["Open", "Addressed", "Verified compliant", "Gap", "N/A"] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];

export const FORMAT_CATEGORIES = ["Page size", "Margins", "Font", "Font size", "Spacing", "Graphics text", "Header and footer", "Other"] as const;
export type FormatCategory = (typeof FORMAT_CATEGORIES)[number];

export const QUESTION_STATUSES = ["Open", "Submitted", "Answered"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export interface Person { id: string; name: string; email: string; role: string }

export interface FormatRule { id: string; category: FormatCategory; rule: string; sourceRef: string; quote: string }

export interface Volume {
  id: string;
  name: string;
  /** Page limit from Section L. Null when the solicitation states none. */
  pageLimit: number | null;
  /** What Section L leaves out of the page count, in its own words. */
  exclusions: string[];
  sourceRef: string;
  quote: string;
  /** Format rule id to checked. */
  formatChecks: Record<string, boolean>;
  /** Current page count for a volume that has no sections yet. */
  manualPages: number | null;
}

export interface OutlineNode {
  id: string;
  volumeId: string;
  /** Null for a section. The id of its section for a subsection. */
  parentId: string | null;
  title: string;
  lRef: string;
  mRef: string;
  ownerId: string;
  reviewerId: string;
  /** Page allocation. */
  pages: number | null;
  status: SectionStatus;
  /** A date set by hand. Empty means the section follows `dueMilestone`. */
  dueDate: ISODate | "";
  /** The milestone this section is due at. It defaults to the next color team when the section is made. */
  dueMilestone: MilestoneId | "";
  notes: string;
  /** Not counted against the page limit: cover, table of contents, acronym list, resumes when L excludes them. */
  excluded: boolean;
  countMode: "manual" | "estimate";
  currentPages: number | null;
  wordCount: number | null;
  graphicsPages: number | null;
}

export interface Requirement {
  id: string;
  reqId: string;
  source: ReqSource;
  ref: string;
  /** Verbatim requirement text. */
  text: string;
  type: ReqType;
  sectionIds: string[];
  ownerId: string;
  status: ReqStatus;
  naReason: string;
  pageRef: string;
  comment: string;
  confidence: "" | "high" | "medium" | "low";
  /** For a subfactor: the row id of its factor. */
  parentId: string;
}

export interface CoQuestion { id: string; question: string; ref: string; status: QuestionStatus; answer: string }
export interface ParserConflict { id: string; description: string; refs: string[]; resolved: boolean }
export interface KeyDate { id: string; label: string; date: ISODate | ""; time: string; timeZone: string; sourceRef: string }

export type ChangeKind = "amendment" | "schedule" | "compression" | "lock" | "parser" | "import" | "setup";
export interface ChangeLogEntry {
  id: string;
  /** When the entry was recorded, as an ISO timestamp. */
  at: string;
  kind: ChangeKind;
  title: string;
  detail: string;
  amendmentNumber: string;
  amendmentDate: ISODate | "";
  rows: DiffRow[];
}

export interface Pursuit {
  app: typeof APP_ID;
  schema: number;
  id: string;
  name: string;
  agency: string;
  solicitationNumber: string;
  rfpReleaseDate: ISODate | "";
  dueDate: ISODate | "";
  dueTime: string;
  timeZone: string;
  submissionMethod: SubmissionMethod;
  qaDeadline: ISODate | "";
  captureManager: string;
  proposalManager: string;
  volumes: Volume[];
  formatRules: FormatRule[];
  outline: OutlineNode[];
  roster: Person[];
  requirements: Requirement[];
  questions: CoQuestion[];
  conflicts: ParserConflict[];
  keyDates: KeyDate[];
  schedule: ScheduleState;
  changeLog: ChangeLogEntry[];
  wordsPerPage: number;
  createdAt: string;
  updatedAt: string;
}

export function uid(): string {
  return globalThis.crypto.randomUUID();
}

export function newPursuit(name: string, nowISO: string): Pursuit {
  return {
    app: APP_ID, schema: SCHEMA_VERSION, id: uid(), name, agency: "", solicitationNumber: "",
    rfpReleaseDate: "", dueDate: "", dueTime: "14:00", timeZone: "America/New_York", submissionMethod: "portal", qaDeadline: "",
    captureManager: "", proposalManager: "",
    volumes: [], formatRules: [], outline: [], roster: [], requirements: [], questions: [], conflicts: [], keyDates: [],
    schedule: emptySchedule(), changeLog: [], wordsPerPage: 500, createdAt: nowISO, updatedAt: nowISO,
  };
}

export function newVolume(name: string, pageLimit: number | null = null): Volume {
  return { id: uid(), name, pageLimit, exclusions: [], sourceRef: "", quote: "", formatChecks: {}, manualPages: null };
}

export function newNode(volumeId: string, parentId: string | null, title: string, dueMilestone: MilestoneId | "" = ""): OutlineNode {
  return {
    id: uid(), volumeId, parentId, title, lRef: "", mRef: "", ownerId: "", reviewerId: "", pages: null, status: "Not started",
    dueDate: "", dueMilestone, notes: "", excluded: false, countMode: "manual", currentPages: null, wordCount: null, graphicsPages: null,
  };
}

export function newRequirement(source: ReqSource, reqId: string): Requirement {
  return {
    id: uid(), reqId, source, ref: "", text: "", type: source === "M" ? "evaluation factor" : "shall", sectionIds: [], ownerId: "",
    status: "Open", naReason: "", pageRef: "", comment: "", confidence: "", parentId: "",
  };
}

/** The next free requirement id for a source, for example L-007. */
export function nextReqId(requirements: readonly Requirement[], source: ReqSource): string {
  const prefix = source === "Other" ? "O" : source;
  let highest = 0;
  for (const item of requirements) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(item.reqId);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export function logEntry(kind: ChangeKind, title: string, detail: string, nowISO: string, extra: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  return { id: uid(), at: nowISO, kind, title, detail, amendmentNumber: "", amendmentDate: "", rows: [], ...extra };
}

/* ---------- Reading a pursuit from outside: an import file or a saved row ---------- */

const text = (value: unknown, max = 4000): string => (typeof value === "string" ? value.slice(0, max) : "");
const date = (value: unknown): ISODate | "" => (isISODate(value) ? value : "");
const count = (value: unknown, max = 100000): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(max, number) : null;
};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const idOf = (value: unknown): string => (typeof value === "string" && value.length > 0 && value.length <= 80 ? value : uid());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PursuitFormatError extends Error {}

/**
 * Checks and completes a pursuit read from a file or from storage. Unknown fields are dropped, missing ones take
 * their defaults, and links to things that do not exist are cleared. Throws when the value is not a pursuit at all.
 */
export function normalizePursuit(raw: unknown, nowISO: string): Pursuit {
  const source = record(raw);
  if (source.app !== APP_ID) throw new PursuitFormatError("This file is not a Proposal War Room pursuit.");
  if (typeof source.schema !== "number" || source.schema > SCHEMA_VERSION) {
    throw new PursuitFormatError("This pursuit was saved by a newer version of Proposal War Room.");
  }

  const roster: Person[] = list(source.roster).map(record).map(item => ({ id: idOf(item.id), name: text(item.name, 120), email: text(item.email, 200), role: text(item.role, 120) }));
  const people = new Set(roster.map(person => person.id));
  const person = (value: unknown): string => (typeof value === "string" && people.has(value) ? value : "");

  const formatRules: FormatRule[] = list(source.formatRules).map(record).map(item => ({
    id: idOf(item.id), category: oneOf(item.category, FORMAT_CATEGORIES, "Other"), rule: text(item.rule, 600), sourceRef: text(item.sourceRef, 80), quote: text(item.quote, 600),
  }));
  const ruleIds = new Set(formatRules.map(rule => rule.id));

  const volumes: Volume[] = list(source.volumes).map(record).map(item => ({
    id: idOf(item.id), name: text(item.name, 160) || "Untitled volume", pageLimit: count(item.pageLimit, 100000),
    exclusions: list(item.exclusions).map(entry => text(entry, 200)).filter(Boolean), sourceRef: text(item.sourceRef, 80), quote: text(item.quote, 600),
    formatChecks: Object.fromEntries(Object.entries(record(item.formatChecks)).filter(([key, value]) => ruleIds.has(key) && value === true).map(([key]) => [key, true])),
    manualPages: count(item.manualPages),
  }));
  const volumeIds = new Set(volumes.map(volume => volume.id));

  const rawNodes = list(source.outline).map(record).filter(item => typeof item.volumeId === "string" && volumeIds.has(item.volumeId));
  const sectionIds = new Set(rawNodes.filter(item => !item.parentId).map(item => String(item.id)));
  const outline: OutlineNode[] = rawNodes
    .filter(item => !item.parentId || sectionIds.has(String(item.parentId)))
    .map(item => ({
      id: idOf(item.id), volumeId: String(item.volumeId), parentId: item.parentId ? String(item.parentId) : null,
      title: text(item.title, 300) || "Untitled section", lRef: text(item.lRef, 80), mRef: text(item.mRef, 80),
      ownerId: person(item.ownerId), reviewerId: person(item.reviewerId), pages: count(item.pages),
      status: oneOf(item.status, SECTION_STATUSES, "Not started"), dueDate: date(item.dueDate),
      dueMilestone: oneOf(item.dueMilestone, ["", ...MILESTONE_IDS] as const, ""), notes: text(item.notes),
      excluded: item.excluded === true, countMode: item.countMode === "estimate" ? "estimate" : "manual",
      currentPages: count(item.currentPages), wordCount: count(item.wordCount, 10_000_000), graphicsPages: count(item.graphicsPages),
    }));
  const nodeIds = new Set(outline.map(node => node.id));

  const requirements: Requirement[] = list(source.requirements).map(record).map(item => ({
    id: idOf(item.id), reqId: text(item.reqId, 40), source: oneOf(item.source, REQ_SOURCES, "Other"), ref: text(item.ref, 80), text: text(item.text, 6000),
    type: oneOf(item.type, REQ_TYPES, "shall"), sectionIds: list(item.sectionIds).map(String).filter(id => nodeIds.has(id)), ownerId: person(item.ownerId),
    status: oneOf(item.status, REQ_STATUSES, "Open"), naReason: text(item.naReason, 600), pageRef: text(item.pageRef, 80), comment: text(item.comment, 2000),
    confidence: oneOf(item.confidence, ["", "high", "medium", "low"] as const, ""), parentId: text(item.parentId, 80),
  }));
  const reqIds = new Set(requirements.map(item => item.id));
  for (const item of requirements) if (!reqIds.has(item.parentId)) item.parentId = "";

  const schedule = record(source.schedule);
  const milestones: Milestone[] = list(schedule.milestones).map(record)
    .filter(item => MILESTONE_IDS.includes(item.id as MilestoneId) && isISODate(item.start) && isISODate(item.end))
    .map(item => ({ id: item.id as MilestoneId, start: item.start as ISODate, end: item.end as ISODate, locked: item.locked === true, dropped: item.dropped === true }));
  const compression = record(schedule.compression);

  const diffRows = (value: unknown): DiffRow[] => list(value).map(record)
    .filter(row => MILESTONE_IDS.includes(row.id as MilestoneId))
    .map(row => ({ id: row.id as MilestoneId, label: text(row.label, 80), before: text(row.before, 80), after: text(row.after, 80), changed: row.changed === true, locked: row.locked === true }));

  return {
    // Storage keys pursuits by UUID, so a file with any other kind of id gets a fresh one.
    app: APP_ID, schema: SCHEMA_VERSION, id: typeof source.id === "string" && UUID.test(source.id) ? source.id : uid(),
    name: text(source.name, 160) || "Untitled pursuit", agency: text(source.agency, 160), solicitationNumber: text(source.solicitationNumber, 80),
    rfpReleaseDate: date(source.rfpReleaseDate), dueDate: date(source.dueDate),
    dueTime: /^\d{2}:\d{2}$/.test(text(source.dueTime)) ? text(source.dueTime) : "14:00",
    timeZone: text(source.timeZone, 60) || "America/New_York",
    submissionMethod: oneOf(source.submissionMethod, ["portal", "email", "hand"] as const, "portal"),
    qaDeadline: date(source.qaDeadline), captureManager: text(source.captureManager, 120), proposalManager: text(source.proposalManager, 120),
    volumes, formatRules, outline, roster, requirements,
    questions: list(source.questions).map(record).map(item => ({ id: idOf(item.id), question: text(item.question, 2000), ref: text(item.ref, 80), status: oneOf(item.status, QUESTION_STATUSES, "Open"), answer: text(item.answer, 4000) })),
    conflicts: list(source.conflicts).map(record).map(item => ({ id: idOf(item.id), description: text(item.description, 2000), refs: list(item.refs).map(entry => text(entry, 80)).filter(Boolean), resolved: item.resolved === true })),
    keyDates: list(source.keyDates).map(record).map(item => ({ id: idOf(item.id), label: text(item.label, 200), date: date(item.date), time: text(item.time, 20), timeZone: text(item.timeZone, 60), sourceRef: text(item.sourceRef, 80) })),
    schedule: {
      settings: normalizeSettings(record(schedule.settings)),
      milestones: milestones.length === MILESTONE_IDS.length ? MILESTONE_IDS.map(id => milestones.find(item => item.id === id)!).filter(Boolean) : [],
      compression: typeof compression.key === "string"
        ? { key: compression.key, title: text(compression.title, 200), changes: list(compression.changes).map(entry => text(entry, 400)), appliedAt: text(compression.appliedAt, 40) }
        : null,
    },
    changeLog: list(source.changeLog).map(record).slice(-500).map(item => ({
      id: idOf(item.id), at: text(item.at, 40), kind: oneOf(item.kind, ["amendment", "schedule", "compression", "lock", "parser", "import", "setup"] as const, "schedule"),
      title: text(item.title, 200), detail: text(item.detail, 2000), amendmentNumber: text(item.amendmentNumber, 40), amendmentDate: date(item.amendmentDate), rows: diffRows(item.rows),
    })),
    wordsPerPage: Math.max(100, Math.min(1500, Number(source.wordsPerPage) || 500)),
    createdAt: text(source.createdAt, 40) || nowISO, updatedAt: text(source.updatedAt, 40) || nowISO,
  };
}

/** The backup file for one pursuit. */
export function exportPursuitJson(pursuit: Pursuit): string {
  return `${JSON.stringify(pursuit, null, 2)}\n`;
}

export function pursuitFileName(pursuit: Pursuit, extension: string, suffix = ""): string {
  const base = (pursuit.solicitationNumber || pursuit.name || "pursuit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pursuit";
  return `${base}${suffix ? `-${suffix}` : ""}.${extension}`;
}

/** A copy of a pursuit under a new id, for "duplicate" and for importing beside an existing one. */
export function clonePursuit(pursuit: Pursuit, name: string, nowISO: string): Pursuit {
  return { ...structuredClone(pursuit), id: uid(), name, createdAt: nowISO, updatedAt: nowISO };
}

export const personName = (pursuit: Pursuit, id: string): string => pursuit.roster.find(person => person.id === id)?.name ?? "";
export const sectionsOf = (pursuit: Pursuit, volumeId: string): OutlineNode[] => pursuit.outline.filter(node => node.volumeId === volumeId && node.parentId === null);
export const childrenOf = (pursuit: Pursuit, sectionId: string): OutlineNode[] => pursuit.outline.filter(node => node.parentId === sectionId);
export const volumeOf = (pursuit: Pursuit, node: OutlineNode): Volume | undefined => pursuit.volumes.find(volume => volume.id === node.volumeId);

/** "Volume I, Technical / 2.1 Technical approach": where a section sits, for pickers and exports. */
export function nodePath(pursuit: Pursuit, node: OutlineNode): string {
  const volume = volumeOf(pursuit, node);
  const parent = node.parentId ? pursuit.outline.find(item => item.id === node.parentId) : null;
  return [volume?.name, parent?.title, node.title].filter(Boolean).join(" / ");
}
