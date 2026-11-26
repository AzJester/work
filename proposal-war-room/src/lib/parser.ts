// The client side of the Section L/M parser: split long text, check what Claude returns, merge the parts, and work
// out what applying the result would add to a pursuit or change in it. Nothing here calls the network.

import { isISODate } from "./calendar.ts";
import type { ISODate } from "./calendar.ts";
import { logEntry, newNode, newRequirement, newVolume, nextReqId, uid } from "./model.ts";
import type { FormatCategory, OutlineNode, Pursuit, ReqType, Requirement } from "./model.ts";
import { defaultDueMilestone } from "./pursuit-ops.ts";

export const ASSIST_CONTRACT = "proposal-assist-v1";
/** The server takes at most this much text in one call. */
export const MAX_PART_CHARS = 24_000;
/** Parts aim for this size, so a reply fits and returns inside the time limit. */
export const TARGET_PART_CHARS = 8_000;

export interface ParsedVolume { name: string; page_limit: number | null; exclusions: string[]; source_ref: string; quote: string }
export interface ParsedFormatRule { rule: string; source_ref: string; quote: string }
export interface ParsedOutlineItem { volume: string; section_title: string; l_ref: string; m_ref: string; children: ParsedOutlineItem[] }
export interface ParsedRequirement { id: string; source: "L" | "M" | "SOW"; ref: string; text: string; type: ReqType; confidence: "high" | "medium" | "low" }
export interface ParsedFactor { factor: string; subfactors: string[]; relative_importance: string; source_ref: string; quote: string }
export interface ParsedKeyDate { label: string; date: ISODate | ""; time: string; time_zone: string; source_ref: string }
export interface ParsedConflict { description: string; refs: string[] }
export interface ParsedQuestion { question: string; ref: string }

export interface ParseResult {
  volumes: ParsedVolume[];
  format_rules: ParsedFormatRule[];
  outline: ParsedOutlineItem[];
  requirements: ParsedRequirement[];
  evaluation_factors: ParsedFactor[];
  key_dates: ParsedKeyDate[];
  conflicts: ParsedConflict[];
  questions_for_co: ParsedQuestion[];
}

export const PARSE_KEYS = ["volumes", "format_rules", "outline", "requirements", "evaluation_factors", "key_dates", "conflicts", "questions_for_co"] as const;
export const emptyResult = (): ParseResult => ({ volumes: [], format_rules: [], outline: [], requirements: [], evaluation_factors: [], key_dates: [], conflicts: [], questions_for_co: [] });

/* ---------- Splitting ---------- */

// A line that opens a new paragraph of the solicitation: "L.3.1", "M.2", "SECTION L", "C.5.2.1", "Volume II".
const HEADING = /^\s*(?:SECTION\s+[A-M]\b|[A-M]\.\d+(?:\.\d+)*\b|\d+(?:\.\d+){1,4}\s+\S|Volume\s+[IVX\d]+\b|ATTACHMENT\s+\S+)/i;

/** Splits text at paragraph headings into parts of about the target size. A short text comes back as one part. */
export function splitIntoParts(text: string, target = TARGET_PART_CHARS, max = MAX_PART_CHARS): string[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of clean.split("\n")) {
    if (HEADING.test(line) && current.length) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  // A block with no heading inside it for longer than a part breaks at blank lines, then at sentence ends.
  const pieces = blocks.flatMap(block => (block.length <= max ? [block] : breakLong(block, target)));
  const parts: string[] = [];
  let part = "";
  for (const piece of pieces) {
    if (part && part.length + piece.length + 1 > target) {
      parts.push(part);
      part = "";
    }
    part = part ? `${part}\n${piece}` : piece;
  }
  if (part) parts.push(part);
  return parts;
}

function breakLong(block: string, target: number): string[] {
  const out: string[] = [];
  let rest = block;
  while (rest.length > target) {
    const window = rest.slice(0, target);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". ") + 1);
    const at = cut > target * 0.4 ? cut : target;
    out.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Halves a part near its middle, at a line break when there is one. Used when a reply ran out of room. */
export function halve(part: string): [string, string] {
  const middle = Math.floor(part.length / 2);
  const after = part.indexOf("\n", middle);
  const before = part.lastIndexOf("\n", middle);
  const at = after > 0 && after - middle <= middle - before ? after : before > 0 ? before : middle;
  return [part.slice(0, at).trimEnd(), part.slice(at).trimStart()];
}

/* ---------- Checking what the model returned ---------- */

const str = (value: unknown, max = 4000): string => (typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "");
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const strings = (value: unknown, max = 300): string[] => arr(value).map(entry => str(entry, max)).filter(Boolean);

function pageLimit(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^\s*\d+(\.\d+)?\s*(pages?)?\s*$/i.test(value)) return Number.parseFloat(value);
  return null;
}

const TYPES: readonly ReqType[] = ["shall", "must", "will", "should", "evaluation factor", "subfactor"];
function reqType(value: unknown, text: string): { type: ReqType; known: boolean } {
  const given = str(value, 40).toLowerCase();
  if ((TYPES as readonly string[]).includes(given)) return { type: given as ReqType, known: true };
  const word = /\b(shall|must|will|should)\b/i.exec(text)?.[1].toLowerCase();
  return { type: (word as ReqType | undefined) ?? "should", known: false };
}

function source(value: unknown, ref: string): "L" | "M" | "SOW" {
  const given = str(value, 10).toUpperCase();
  if (given === "L" || given === "M" || given === "SOW") return given;
  if (/^M\b/i.test(ref)) return "M";
  if (/^(SOW|PWS|C)\b/i.test(ref)) return "SOW";
  return "L";
}

function outlineItem(value: unknown, volume = "", depth = 0): ParsedOutlineItem | null {
  const item = obj(value);
  const title = str(item.section_title, 300);
  if (!title) return null;
  const itemVolume = str(item.volume, 160) || volume;
  return {
    volume: itemVolume, section_title: title, l_ref: str(item.l_ref, 80), m_ref: str(item.m_ref, 120),
    children: depth === 0 ? arr(item.children).map(child => outlineItem(child, itemVolume, 1)).filter((child): child is ParsedOutlineItem => child !== null) : [],
  };
}

export type ParseCheck = { ok: true; value: ParseResult } | { ok: false; error: string };

/**
 * Reads the model's reply. The reply has to be one JSON object with all eight keys, each an array. A code fence
 * around it is tolerated. Inside the arrays, wrong types are coerced and items with no content are dropped.
 */
export function readModelReply(reply: string): ParseCheck {
  let text = reply.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence) text = fence[1].trim();
  if (!text) return { ok: false, error: "The reply was empty." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `The reply is not valid JSON: ${error instanceof Error ? error.message : "parse error"}.` };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "The reply is JSON but not an object." };
  const top = raw as Record<string, unknown>;
  const missing = PARSE_KEYS.filter(key => !Array.isArray(top[key]));
  if (missing.length) return { ok: false, error: `The reply is missing these keys, or they are not arrays: ${missing.join(", ")}.` };

  const requirements: ParsedRequirement[] = [];
  for (const entry of arr(top.requirements).map(obj)) {
    const body = str(entry.text, 6000);
    if (!body) continue;
    const ref = str(entry.ref, 80);
    const { type, known } = reqType(entry.type, body);
    const confidence = str(entry.confidence, 10).toLowerCase();
    requirements.push({
      id: str(entry.id, 40), source: source(entry.source, ref), ref, text: body, type,
      confidence: !known ? "low" : confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium",
    });
  }
  return {
    ok: true,
    value: {
      volumes: arr(top.volumes).map(obj).map(entry => ({ name: str(entry.name, 160), page_limit: pageLimit(entry.page_limit), exclusions: strings(entry.exclusions), source_ref: str(entry.source_ref, 80), quote: str(entry.quote, 600) })).filter(entry => entry.name),
      format_rules: arr(top.format_rules).map(obj).map(entry => ({ rule: str(entry.rule, 600), source_ref: str(entry.source_ref, 80), quote: str(entry.quote, 600) })).filter(entry => entry.rule),
      outline: arr(top.outline).map(entry => outlineItem(entry)).filter((entry): entry is ParsedOutlineItem => entry !== null),
      requirements,
      evaluation_factors: arr(top.evaluation_factors).map(obj).map(entry => ({ factor: str(entry.factor, 300), subfactors: strings(entry.subfactors), relative_importance: str(entry.relative_importance, 600), source_ref: str(entry.source_ref, 80), quote: str(entry.quote, 600) })).filter(entry => entry.factor),
      key_dates: arr(top.key_dates).map(obj).map(entry => ({ label: str(entry.label, 200), date: (isISODate(entry.date) ? entry.date : "") as ISODate | "", time: /^\d{1,2}:\d{2}$/.test(str(entry.time)) ? str(entry.time).padStart(5, "0") : "", time_zone: str(entry.time_zone, 60), source_ref: str(entry.source_ref, 80) })).filter(entry => entry.label || entry.date),
      conflicts: arr(top.conflicts).map(obj).map(entry => ({ description: str(entry.description, 2000), refs: strings(entry.refs, 80) })).filter(entry => entry.description),
      questions_for_co: arr(top.questions_for_co).map(obj).map(entry => ({ question: str(entry.question, 2000), ref: str(entry.ref, 120) })).filter(entry => entry.question),
    },
  };
}

/* ---------- Merging parts ---------- */

export const norm = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Volume I, Technical" and "the technical volume" share the key "technical". */
export function volumeKey(name: string): string {
  const key = norm(name).replace(/\b(the|volume|vol|book|part|proposal)\b/g, " ").replace(/\b(?:[ivx]{1,4}|\d{1,2})\b/g, " ").replace(/\s+/g, " ").trim();
  return key || norm(name);
}

function union(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(a.map(norm));
  return [...a, ...b.filter(entry => !seen.has(norm(entry)) && seen.add(norm(entry)))];
}

/**
 * Merges the results of the parts, in order, and removes duplicates. Two page limits for one volume become a
 * conflict here as well, so a disagreement between distant paragraphs is caught even when no single part saw both.
 */
export function mergeResults(parts: readonly ParseResult[]): ParseResult {
  const merged = emptyResult();
  const conflictKeys = new Set<string>();
  const addConflict = (conflict: ParsedConflict): void => {
    const key = norm(conflict.description);
    if (key && !conflictKeys.has(key)) { conflictKeys.add(key); merged.conflicts.push(conflict); }
  };
  const seen = { rule: new Set<string>(), outline: new Set<string>(), requirement: new Set<string>(), date: new Set<string>(), question: new Set<string>() };

  for (const part of parts) {
    for (const volume of part.volumes) {
      const key = volumeKey(volume.name);
      const existing = merged.volumes.find(entry => volumeKey(entry.name) === key);
      if (!existing) { merged.volumes.push({ ...volume, exclusions: [...volume.exclusions] }); continue; }
      if (volume.page_limit !== null && existing.page_limit !== null && volume.page_limit !== existing.page_limit) {
        const refs = [existing.source_ref, volume.source_ref].filter(Boolean);
        const already = [...merged.conflicts, ...parts.flatMap(entry => entry.conflicts)].some(conflict => conflict.description.includes(String(existing.page_limit)) && conflict.description.includes(String(volume.page_limit)));
        if (!already) addConflict({ description: `${existing.name} is limited to ${existing.page_limit} pages${existing.source_ref ? ` in ${existing.source_ref}` : ""} and to ${volume.page_limit} pages${volume.source_ref ? ` in ${volume.source_ref}` : ""}.`, refs });
      }
      if (existing.page_limit === null) existing.page_limit = volume.page_limit;
      existing.exclusions = union(existing.exclusions, volume.exclusions);
      if (!existing.source_ref) existing.source_ref = volume.source_ref;
      if (!existing.quote) existing.quote = volume.quote;
    }
    for (const rule of part.format_rules) {
      const key = norm(rule.rule);
      if (!seen.rule.has(key)) { seen.rule.add(key); merged.format_rules.push(rule); }
    }
    for (const item of part.outline) {
      const key = `${volumeKey(item.volume)}|${norm(item.l_ref) || norm(item.section_title)}`;
      if (seen.outline.has(key)) continue;
      seen.outline.add(key);
      merged.outline.push({ ...item, children: item.children.map(child => ({ ...child })) });
    }
    for (const requirement of part.requirements) {
      const key = `${requirement.source}|${norm(requirement.text)}`;
      if (!seen.requirement.has(key)) { seen.requirement.add(key); merged.requirements.push({ ...requirement }); }
    }
    for (const factor of part.evaluation_factors) {
      const existing = merged.evaluation_factors.find(entry => norm(entry.factor) === norm(factor.factor));
      if (existing) {
        existing.subfactors = union(existing.subfactors, factor.subfactors);
        if (!existing.relative_importance) existing.relative_importance = factor.relative_importance;
      } else merged.evaluation_factors.push({ ...factor, subfactors: [...factor.subfactors] });
    }
    for (const date of part.key_dates) {
      const key = `${norm(date.label)}|${date.date}|${date.time}`;
      if (!seen.date.has(key)) { seen.date.add(key); merged.key_dates.push(date); }
    }
    for (const conflict of part.conflicts) addConflict(conflict);
    for (const question of part.questions_for_co) {
      const key = norm(question.question);
      if (!seen.question.has(key)) { seen.question.add(key); merged.questions_for_co.push(question); }
    }
  }
  // Ids are numbered again across the whole text, in order, so two parts cannot both hold L-001.
  const counters: Record<string, number> = {};
  for (const requirement of merged.requirements) {
    counters[requirement.source] = (counters[requirement.source] ?? 0) + 1;
    requirement.id = `${requirement.source}-${String(counters[requirement.source]).padStart(3, "0")}`;
  }
  return merged;
}

/* ---------- The request the server route expects ---------- */

export interface ParseRequest {
  contract_version: typeof ASSIST_CONTRACT;
  action: "parse_lm";
  text: string;
  part: number;
  parts: number;
  known_volumes: { name: string; page_limit: number | null; source_ref: string }[];
  retry?: { error: string; previous: string };
}

export function parseRequest(text: string, part: number, parts: number, known: readonly ParsedVolume[], retry?: { error: string; previous: string }): ParseRequest {
  return {
    contract_version: ASSIST_CONTRACT, action: "parse_lm", text, part, parts,
    known_volumes: known.slice(0, 12).map(volume => ({ name: volume.name.slice(0, 160), page_limit: volume.page_limit, source_ref: volume.source_ref.slice(0, 80) })),
    ...(retry ? { retry: { error: retry.error.slice(0, 600), previous: retry.previous.slice(0, 24_000) } } : {}),
  };
}

export interface PartOutcome { index: number; ok: boolean; error: string; raw: string; attempts: number }
export interface ParseRun { result: ParseResult; parts: PartOutcome[]; total: number }
export type AskModel = (request: ParseRequest) => Promise<{ text: string; stop_reason: string }>;

/**
 * Runs the whole text through the model, part by part and in order. Each reply is checked. A reply that fails is
 * asked for once more with the parser's error. A part that fails twice keeps its raw reply for the review screen.
 * A reply cut off for length has its part halved and each half asked on its own.
 */
export async function runParse(text: string, ask: AskModel, onProgress: (done: number, total: number) => void = () => undefined): Promise<ParseRun> {
  const queue = splitIntoParts(text);
  const results: ParseResult[] = [];
  const outcomes: PartOutcome[] = [];
  let known: ParsedVolume[] = [];
  let done = 0;
  for (let index = 0; index < queue.length; index += 1) {
    onProgress(done, queue.length);
    const part = queue[index];
    let reply = await ask(parseRequest(part, index + 1, queue.length, known));
    if (reply.stop_reason === "max_tokens" && part.length > 1500) {
      // The reply ran out of room. Ask for each half instead.
      queue.splice(index, 1, ...halve(part));
      index -= 1;
      continue;
    }
    let check = readModelReply(reply.text);
    let attempts = 1;
    if (!check.ok) {
      const error = reply.stop_reason === "max_tokens" ? `${check.error} The reply was cut off before it finished.` : check.error;
      reply = await ask(parseRequest(part, index + 1, queue.length, known, { error, previous: reply.text }));
      check = readModelReply(reply.text);
      attempts = 2;
    }
    if (check.ok) {
      results.push(check.value);
      known = mergeResults(results).volumes;
      outcomes.push({ index, ok: true, error: "", raw: "", attempts });
    } else {
      outcomes.push({ index, ok: false, error: check.error, raw: reply.text, attempts });
    }
    done += 1;
  }
  onProgress(done, queue.length);
  return { result: mergeResults(results), parts: outcomes, total: queue.length };
}

/* ---------- Applying a reviewed result to a pursuit ---------- */

const ZONES: [RegExp, string][] = [
  [/\b(eastern|e[sd]?t)\b/i, "America/New_York"], [/\b(central|c[sd]?t)\b/i, "America/Chicago"], [/\b(mountain|m[sd]?t)\b/i, "America/Denver"],
  [/\barizona\b/i, "America/Phoenix"], [/\b(pacific|p[sd]?t)\b/i, "America/Los_Angeles"], [/\b(alaska|ak[sd]?t)\b/i, "America/Anchorage"],
  [/\b(hawaii|hst)\b/i, "Pacific/Honolulu"], [/\b(utc|gmt|zulu)\b/i, "UTC"],
];
export const timeZoneFor = (written: string): string => ZONES.find(([pattern]) => pattern.test(written))?.[1] ?? "";

/** The key date that reads as the proposal due date, if one does. */
export function dueDateCandidate(dates: readonly ParsedKeyDate[]): ParsedKeyDate | null {
  const candidates = dates.filter(date => date.date && /\b(due|deadline|closing|receipt|submission|submit)\b/i.test(date.label) && !/\b(question|q&a|q and a|inquir|comment|site visit|industry day|intent)/i.test(date.label));
  return candidates.find(date => /\b(proposal|offer|quote|quotation|response|bid)s?\b/i.test(date.label)) ?? candidates[0] ?? null;
}

export function questionsDateCandidate(dates: readonly ParsedKeyDate[]): ParsedKeyDate | null {
  return dates.find(date => date.date && /\b(question|q&a|q and a|inquir)/i.test(date.label)) ?? null;
}

export function formatCategory(rule: string): FormatCategory {
  const text = rule.toLowerCase();
  if (/header|footer|page number/.test(text)) return "Header and footer";
  if (/table|graphic|figure|exhibit|chart/.test(text)) return "Graphics text";
  if (/margin/.test(text)) return "Margins";
  if (/spac(ed|ing)|single-spaced|double-spaced/.test(text)) return "Spacing";
  if (/\bpoint\b|\bpt\b|font size|type size/.test(text) && !/times|arial|calibri|helvetica|courier|typeface/.test(text)) return "Font size";
  if (/font|typeface|times|arial|calibri|helvetica|courier|\bpoint\b/.test(text)) return "Font";
  if (/8\.5|11 inch|letter|a4|page size|paper/.test(text)) return "Page size";
  return "Other";
}

/** True when a section's M reference names this factor or subfactor. */
export function mRefNames(mRef: string, name: string): boolean {
  const ref = ` ${norm(mRef)} `;
  const target = norm(name);
  if (!target || !ref.trim()) return false;
  if (ref.includes(` ${target} `)) return true;
  // "1a Technical Approach" also answers to "Subfactor 1a" and to "Technical Approach".
  const match = /^(\d+[a-z]?|[a-z]\d*)\s+(.+)$/.exec(target);
  if (match) return ref.includes(` ${match[2]} `) || (ref.includes(` ${match[1]} `) && ref.includes(" subfactor "));
  const factor = /^factor\s+(\d+)\b/.exec(target);
  return factor ? new RegExp(` factor ${factor[1]} `).test(ref) : false;
}

export interface Overwrite {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface ApplyPlan {
  /** What applying would add, by kind. */
  adds: { volumes: number; formatRules: number; sections: number; requirements: number; factors: number; keyDates: number; conflicts: number; questions: number };
  /** Items already in the pursuit, left as they are. */
  duplicates: number;
  /** Values already in the pursuit that the result would change. Each needs its own yes. */
  overwrites: Overwrite[];
  /** The pursuit already holds data of the kinds this result touches. */
  hasExisting: boolean;
}

interface ApplyOptions {
  /** Keys of the overwrites the owner confirmed. Every other existing value is kept. */
  confirmed?: ReadonlySet<string>;
  today: ISODate;
  nowISO: string;
}

/**
 * Works a reviewed result into a pursuit. New items are added. Items the pursuit already holds are left alone.
 * A value that differs from what the pursuit holds is changed only when its key is in `confirmed`.
 * Returns the plan as well, so a preview and the real thing come from the same code.
 */
export function applyParse(pursuit: Pursuit, selection: ParseResult, options: ApplyOptions): { pursuit: Pursuit; plan: ApplyPlan } {
  const confirmed = options.confirmed ?? new Set<string>();
  const plan: ApplyPlan = {
    adds: { volumes: 0, formatRules: 0, sections: 0, requirements: 0, factors: 0, keyDates: 0, conflicts: 0, questions: 0 }, duplicates: 0, overwrites: [],
    hasExisting: pursuit.volumes.length + pursuit.formatRules.length + pursuit.outline.length + pursuit.requirements.length + pursuit.questions.length + pursuit.conflicts.length > 0,
  };
  const volumes = pursuit.volumes.map(volume => ({ ...volume, exclusions: [...volume.exclusions] }));
  const findVolume = (name: string) => volumes.find(volume => volumeKey(volume.name) === volumeKey(name));

  for (const parsed of selection.volumes) {
    const existing = findVolume(parsed.name);
    if (!existing) {
      volumes.push({ ...newVolume(parsed.name, parsed.page_limit), exclusions: [...parsed.exclusions], sourceRef: parsed.source_ref, quote: parsed.quote });
      plan.adds.volumes += 1;
      continue;
    }
    plan.duplicates += 1;
    if (parsed.page_limit !== existing.pageLimit && !(parsed.page_limit === null && existing.pageLimit === null)) {
      const key = `limit:${existing.id}`;
      const describe = (value: number | null): string => (value === null ? "No limit" : `${value} pages`);
      plan.overwrites.push({ key, label: `${existing.name}: page limit`, from: describe(existing.pageLimit), to: describe(parsed.page_limit) });
      if (confirmed.has(key)) existing.pageLimit = parsed.page_limit;
    }
    existing.exclusions = union(existing.exclusions, parsed.exclusions);
    if (!existing.sourceRef) existing.sourceRef = parsed.source_ref;
    if (!existing.quote) existing.quote = parsed.quote;
  }

  const formatRules = [...pursuit.formatRules];
  for (const parsed of selection.format_rules) {
    if (formatRules.some(rule => norm(rule.rule) === norm(parsed.rule))) { plan.duplicates += 1; continue; }
    // The rule's own words decide its kind. The quote can cover two rules at once, so it is only the fallback.
    const category = formatCategory(parsed.rule) === "Other" ? formatCategory(parsed.quote) : formatCategory(parsed.rule);
    formatRules.push({ id: uid(), category, rule: parsed.rule, sourceRef: parsed.source_ref, quote: parsed.quote });
    plan.adds.formatRules += 1;
  }

  const outline: OutlineNode[] = pursuit.outline.map(node => ({ ...node }));
  const staged: Pursuit = { ...pursuit, volumes, outline };
  const dueMilestone = defaultDueMilestone(pursuit, options.today);
  const placeSection = (parsed: ParsedOutlineItem, parent: OutlineNode | null): OutlineNode | null => {
    let volume = parent ? volumes.find(entry => entry.id === parent.volumeId) : findVolume(parsed.volume);
    if (!volume) {
      // An outline entry that names a volume the result did not list still needs a home.
      volume = newVolume(parsed.volume || "Unassigned volume");
      volumes.push(volume);
      plan.adds.volumes += 1;
    }
    const siblings = outline.filter(node => node.volumeId === volume.id && node.parentId === (parent ? parent.id : null));
    const existing = siblings.find(node => (parsed.l_ref && norm(node.lRef) === norm(parsed.l_ref) && norm(node.title) === norm(parsed.section_title)) || norm(node.title) === norm(parsed.section_title));
    if (existing) {
      plan.duplicates += 1;
      // Filling a blank is not an overwrite.
      if (!existing.lRef) existing.lRef = parsed.l_ref;
      if (!existing.mRef) existing.mRef = parsed.m_ref;
      return existing;
    }
    const node = { ...newNode(volume.id, parent ? parent.id : null, parsed.section_title, dueMilestone), lRef: parsed.l_ref, mRef: parsed.m_ref };
    if (parent) {
      const last = outline.reduce((found, item, index) => (item.id === parent.id || item.parentId === parent.id ? index : found), -1);
      outline.splice(last + 1, 0, node);
    } else outline.push(node);
    plan.adds.sections += 1;
    return node;
  };
  for (const parsed of selection.outline) {
    const section = placeSection(parsed, null);
    if (section) for (const child of parsed.children) placeSection(child, section);
  }

  const requirements: Requirement[] = pursuit.requirements.map(item => ({ ...item, sectionIds: [...item.sectionIds] }));
  const factorNames = new Set(selection.evaluation_factors.flatMap(factor => [norm(factor.factor), ...factor.subfactors.map(norm)]));
  for (const parsed of selection.requirements) {
    // A factor listed once under evaluation_factors is not also added as a requirement.
    if ((parsed.type === "evaluation factor" || parsed.type === "subfactor") && factorNames.has(norm(parsed.text))) continue;
    if (requirements.some(item => item.source === parsed.source && norm(item.text) === norm(parsed.text))) { plan.duplicates += 1; continue; }
    const item = { ...newRequirement(parsed.source, nextReqId(requirements, parsed.source)), ref: parsed.ref, text: parsed.text, type: parsed.type, confidence: parsed.confidence };
    // A Section L or SOW requirement lands in the section that answers its paragraph.
    if (parsed.source !== "M" && parsed.ref) item.sectionIds = outline.filter(node => norm(node.lRef) === norm(parsed.ref)).map(node => node.id);
    requirements.push(item);
    plan.adds.requirements += 1;
  }
  for (const parsed of selection.evaluation_factors) {
    let factor = requirements.find(item => item.source === "M" && item.type === "evaluation factor" && norm(item.text) === norm(parsed.factor));
    if (factor) plan.duplicates += 1;
    else {
      factor = { ...newRequirement("M", nextReqId(requirements, "M")), type: "evaluation factor", ref: parsed.source_ref, text: parsed.factor, comment: parsed.relative_importance ? `Relative importance: ${parsed.relative_importance}` : "", confidence: "high" };
      factor.sectionIds = outline.filter(node => mRefNames(node.mRef, parsed.factor)).map(node => node.id);
      requirements.push(factor);
      plan.adds.factors += 1;
    }
    for (const name of parsed.subfactors) {
      if (requirements.some(item => item.source === "M" && item.type === "subfactor" && norm(item.text) === norm(name))) { plan.duplicates += 1; continue; }
      const sub = { ...newRequirement("M", nextReqId(requirements, "M")), type: "subfactor" as const, ref: parsed.source_ref, text: name, parentId: factor.id, confidence: "high" as const };
      sub.sectionIds = outline.filter(node => mRefNames(node.mRef, name)).map(node => node.id);
      requirements.push(sub);
      plan.adds.factors += 1;
      // A factor is traced wherever its subfactors are.
      factor.sectionIds = [...new Set([...factor.sectionIds, ...sub.sectionIds])];
    }
  }

  const keyDates = [...pursuit.keyDates];
  for (const parsed of selection.key_dates) {
    if (keyDates.some(date => norm(date.label) === norm(parsed.label) && date.date === parsed.date)) { plan.duplicates += 1; continue; }
    keyDates.push({ id: uid(), label: parsed.label, date: parsed.date, time: parsed.time, timeZone: parsed.time_zone, sourceRef: parsed.source_ref });
    plan.adds.keyDates += 1;
  }
  const conflicts = [...pursuit.conflicts];
  for (const parsed of selection.conflicts) {
    if (conflicts.some(conflict => norm(conflict.description) === norm(parsed.description))) { plan.duplicates += 1; continue; }
    conflicts.push({ id: uid(), description: parsed.description, refs: parsed.refs, resolved: false });
    plan.adds.conflicts += 1;
  }
  const questions = [...pursuit.questions];
  for (const parsed of selection.questions_for_co) {
    if (questions.some(question => norm(question.question) === norm(parsed.question))) { plan.duplicates += 1; continue; }
    questions.push({ id: uid(), question: parsed.question, ref: parsed.ref, status: "Open", answer: "" });
    plan.adds.questions += 1;
  }

  const added = Object.values(plan.adds).reduce((total, count) => total + count, 0);
  const applied = plan.overwrites.filter(item => confirmed.has(item.key)).length;
  const detail = `${added} ${added === 1 ? "item" : "items"} added, ${plan.duplicates} already present, ${applied} of ${plan.overwrites.length} changes to existing values confirmed.`;
  return {
    plan,
    pursuit: { ...staged, formatRules, requirements, keyDates, conflicts, questions, changeLog: [...pursuit.changeLog, logEntry("parser", "Parser results applied", detail, options.nowISO)].slice(-500) },
  };
}

/** What applying would do, without doing it. */
export function previewApply(pursuit: Pursuit, selection: ParseResult, today: ISODate): ApplyPlan {
  return applyParse(pursuit, selection, { today, nowISO: "1970-01-01T00:00:00.000Z" }).plan;
}

/** The fictional excerpt from the build specification, for trying the parser. */
export const SAMPLE_EXCERPT = `L.2 Proposals are due 2:00 PM Eastern Time, 19 January 2027, via the
designated portal.
L.3.1 Volume I, Technical, shall not exceed 25 pages. Volume II, Management,
shall not exceed 15 pages. Volume III, Price, has no page limit. The cover,
table of contents, and acronym list are excluded from page counts.
L.3.2 Pages shall be 8.5 x 11 inches with 1-inch margins. Text shall be Times
New Roman 12 point. Text in tables and graphics shall be no smaller than
10 point.
L.4.1 The offeror shall describe its technical approach to SOW tasks 3.1
through 3.4.
L.4.2 The offeror shall describe its approach to identifying and mitigating
technical and schedule risk.
L.5.1 The offeror shall provide an organizational chart and resumes for key
personnel. Resumes are excluded from the page count and shall not exceed two
pages each.
M.2 Factor 1, Technical, is significantly more important than Factor 2,
Management. Non-price factors combined are significantly more important than
price. Factor 1 subfactors: 1a Technical Approach, 1b Risk Management.
M.3 The Government will evaluate the 30-page technical volume for
understanding of the requirement and feasibility of approach.`;
