// Backward scheduler. The plan runs from kickoff to internal submit and is counted in business days.
// Nothing here squeezes a date without saying so: a window that cannot hold the minimum durations comes back with
// its problems listed and with compressed plans to choose from, each with the exact list of what it drops or shortens.

import {
  addBusinessDays, businessDaysBetween, businessDaysIn, formatDate, makeCalendar, nextBusinessDay, offDayReason,
} from "./calendar.ts";
import type { Blackout, ISODate, WorkCalendar } from "./calendar.ts";

export type MilestoneId =
  | "kickoff" | "storyboards" | "pink" | "pinkRecovery" | "red" | "redRecovery" | "gold" | "production" | "internalSubmit" | "due";

export type MilestoneKind = "point" | "review" | "work";

export interface MilestoneDef {
  id: MilestoneId;
  label: string;
  /** The name used in countdowns and short lists. */
  short: string;
  kind: MilestoneKind;
  note: string;
}

export const MILESTONES: readonly MilestoneDef[] = [
  { id: "kickoff", label: "Kickoff", short: "Kickoff", kind: "point", note: "" },
  { id: "storyboards", label: "Storyboards / annotated outline due", short: "Storyboards", kind: "point", note: "" },
  { id: "pink", label: "Pink team review", short: "Pink team", kind: "review", note: "" },
  { id: "pinkRecovery", label: "Pink recovery", short: "Pink recovery", kind: "work", note: "" },
  { id: "red", label: "Red team review", short: "Red team", kind: "review", note: "" },
  { id: "redRecovery", label: "Red recovery", short: "Red recovery", kind: "work", note: "" },
  { id: "gold", label: "Gold team review", short: "Gold team", kind: "review", note: "" },
  { id: "production", label: "Final production", short: "Final production", kind: "work", note: "Formatting, graphics, white glove check" },
  { id: "internalSubmit", label: "Internal submit", short: "Internal submit", kind: "point", note: "" },
  { id: "due", label: "Due", short: "Due", kind: "point", note: "" },
];

export const MILESTONE_IDS: readonly MilestoneId[] = MILESTONES.map(def => def.id);
export const COLOR_TEAMS: readonly MilestoneId[] = ["pink", "red", "gold"];
const DEF = new Map(MILESTONES.map(def => [def.id, def]));
export const milestoneDef = (id: MilestoneId): MilestoneDef => DEF.get(id)!;

export interface Milestone {
  id: MilestoneId;
  start: ISODate;
  end: ISODate;
  /** The owner set this date by hand. Planning leaves it alone. */
  locked: boolean;
  /** A compressed plan removed this milestone. */
  dropped: boolean;
}

export type ScheduleMode = "proportional" | "fixed";
export interface ReviewPositions { storyboards: number; pink: number; red: number; gold: number }

export interface ScheduleSettings {
  mode: ScheduleMode;
  /** Internal submit sits this many business days before the due date. Off means it is the due date. */
  bufferEnabled: boolean;
  bufferDays: number;
  /** Proportional mode: percent of the window from kickoff to internal submit. */
  percents: ReviewPositions;
  /** Fixed mode: business days before internal submit. */
  offsets: ReviewPositions;
  /** Length of each review session in business days. */
  reviewDays: { pink: number; red: number; gold: number };
  /** Company holidays and other days nobody works. */
  blackouts: Blackout[];
}

/** The floors a plan has to hold. draftDays is a working default, not a rule of the review process. */
export const MINIMUMS = { reviewDays: 1, recoveryDays: 2, productionDays: 2, draftDays: 3 } as const;

export const DEFAULT_SETTINGS: ScheduleSettings = {
  mode: "proportional",
  bufferEnabled: true,
  bufferDays: 1,
  percents: { storyboards: 15, pink: 35, red: 65, gold: 85 },
  offsets: { storyboards: 22, pink: 16, red: 8, gold: 3 },
  reviewDays: { pink: 1, red: 1, gold: 1 },
  blackouts: [],
};

export interface AppliedCompression {
  key: string;
  title: string;
  changes: string[];
  appliedAt: string;
}

export interface ScheduleState {
  settings: ScheduleSettings;
  milestones: Milestone[];
  compression: AppliedCompression | null;
}

export function emptySchedule(): ScheduleState {
  return { settings: structuredClone(DEFAULT_SETTINGS), milestones: [], compression: null };
}

export interface PlanIssue {
  code: "order" | "duration" | "off-day" | "window";
  severity: "error" | "warning";
  milestones: MilestoneId[];
  message: string;
  /** A date set by hand is part of the problem. */
  lockedConflict: boolean;
}

export interface CompressedOption {
  key: string;
  title: string;
  summary: string;
  milestones: Milestone[];
  /** Exactly what this plan drops, shortens or moves compared with the standard plan. */
  changes: string[];
  issues: PlanIssue[];
  /** Business days of writing between the storyboards (or kickoff) and the first review. */
  draftDays: number;
}

export interface PlanInput {
  dueDate: ISODate;
  rfpReleaseDate: ISODate | "";
  today: ISODate;
  settings: ScheduleSettings;
  /** The milestones planned so far. Locks and the kickoff date come from here. Empty for a first plan. */
  current: readonly Milestone[];
  /** The compressed plan the owner accepted earlier, if any. */
  compressionKey?: string | null;
}

export interface PlanResult {
  /** The plan to keep: the standard plan, or the accepted compressed plan when the standard one does not fit. */
  milestones: Milestone[];
  issues: PlanIssue[];
  /** The standard plan and its problems, whatever was chosen. */
  nominal: Milestone[];
  nominalIssues: PlanIssue[];
  /** Compressed plans that fit, recommended first. Empty when the standard plan fits. */
  options: CompressedOption[];
  used: CompressedOption | null;
  internalSubmit: ISODate;
  kickoff: ISODate;
  /** Business days from kickoff to internal submit. */
  windowDays: number;
  /** The standard plan breaks a minimum or the milestone order. */
  needsCompression: boolean;
}

interface Variant {
  key: string;
  title: string;
  keepStoryboards: boolean;
  keepPink: boolean;
  keepGold: boolean;
  /** 0 drops Red recovery. */
  redRecoveryMin: number;
  productionMin: number;
  shortReviews: boolean;
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

/** Settings with every number inside its allowed range. */
export function normalizeSettings(raw: Partial<ScheduleSettings> | null | undefined): ScheduleSettings {
  const base = DEFAULT_SETTINGS;
  const positions = (value: Partial<ReviewPositions> | undefined, fallback: ReviewPositions, max: number): ReviewPositions => ({
    storyboards: clampInt(value?.storyboards, 0, max, fallback.storyboards),
    pink: clampInt(value?.pink, 0, max, fallback.pink),
    red: clampInt(value?.red, 0, max, fallback.red),
    gold: clampInt(value?.gold, 0, max, fallback.gold),
  });
  return {
    mode: raw?.mode === "fixed" ? "fixed" : "proportional",
    bufferEnabled: raw?.bufferEnabled !== false,
    bufferDays: clampInt(raw?.bufferDays, 1, 10, base.bufferDays),
    percents: positions(raw?.percents, base.percents, 99),
    offsets: positions(raw?.offsets, base.offsets, 250),
    reviewDays: {
      pink: clampInt(raw?.reviewDays?.pink, 1, 5, 1),
      red: clampInt(raw?.reviewDays?.red, 1, 5, 1),
      gold: clampInt(raw?.reviewDays?.gold, 1, 5, 1),
    },
    blackouts: Array.isArray(raw?.blackouts)
      ? raw.blackouts.filter(entry => entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)).map(entry => ({ date: entry.date, label: String(entry.label ?? "").slice(0, 80) }))
      : [],
  };
}

export function calendarFor(settings: ScheduleSettings): WorkCalendar {
  return makeCalendar(settings.blackouts);
}

/** Internal submit: the due date less the buffer, in business days. With the buffer off it is the due date. */
export function internalSubmitDate(dueDate: ISODate, settings: ScheduleSettings, calendar: WorkCalendar = calendarFor(settings)): ISODate {
  return settings.bufferEnabled ? addBusinessDays(dueDate, -settings.bufferDays, calendar) : dueDate;
}

/** Where a first plan starts: the RFP release date, or today once that has passed, moved to a business day. */
export function defaultKickoff(rfpReleaseDate: ISODate | "", today: ISODate, calendar: WorkCalendar): ISODate {
  const from = rfpReleaseDate && rfpReleaseDate > today ? rfpReleaseDate : today;
  return nextBusinessDay(from, calendar);
}

const byId = (list: readonly Milestone[]): Map<MilestoneId, Milestone> => new Map(list.map(item => [item.id, item]));
const day = (count: number): string => (count === 1 ? "1 business day" : `${count} business days`);

function span(id: MilestoneId, start: ISODate, end: ISODate = start): Milestone {
  return { id, start, end, locked: false, dropped: false };
}

/** Business days a milestone covers. A point counts as one day. */
export function milestoneDays(milestone: Milestone, calendar: WorkCalendar): number {
  return businessDaysIn(milestone.start, milestone.end, calendar);
}

interface Frame {
  calendar: WorkCalendar;
  settings: ScheduleSettings;
  locks: Map<MilestoneId, Milestone>;
  kickoff: ISODate;
  internalSubmit: ISODate;
  due: ISODate;
  window: number;
}

function frame(input: PlanInput): Frame {
  const settings = input.settings;
  const calendar = calendarFor(settings);
  const current = byId(input.current);
  // The due date is an input and is changed through an amendment, never by a lock.
  const locks = new Map([...current].filter(([id, item]) => item.locked && !item.dropped && id !== "due"));
  const lockedSubmit = locks.get("internalSubmit");
  const internalSubmit = lockedSubmit ? lockedSubmit.start : internalSubmitDate(input.dueDate, settings, calendar);
  // Kickoff is the anchor of the window. Once planned it stays where it is until the owner moves it.
  const kickoff = current.get("kickoff")?.start || defaultKickoff(input.rfpReleaseDate, input.today, calendar);
  return { calendar, settings, locks, kickoff, internalSubmit, due: input.dueDate, window: businessDaysBetween(kickoff, internalSubmit, calendar) };
}

/** Where the standard plan puts the storyboards and the start of each review. */
function positions(f: Frame): Record<"storyboards" | "pink" | "red" | "gold", ISODate> {
  const { settings, calendar, kickoff, internalSubmit, window } = f;
  if (settings.mode === "fixed") {
    const at = (offset: number): ISODate => addBusinessDays(internalSubmit, -offset, calendar);
    return { storyboards: at(settings.offsets.storyboards), pink: at(settings.offsets.pink), red: at(settings.offsets.red), gold: at(settings.offsets.gold) };
  }
  const at = (percent: number): ISODate => addBusinessDays(kickoff, Math.max(0, Math.round((window * percent) / 100)), calendar);
  return { storyboards: at(settings.percents.storyboards), pink: at(settings.percents.pink), red: at(settings.percents.red), gold: at(settings.percents.gold) };
}

/** Fills in the recoveries and production from the reviews around them, then lays locked dates over the result. */
function assemble(
  f: Frame, reviews: Partial<Record<"pink" | "red" | "gold", Milestone>>, storyboards: ISODate | null,
  dropped: ReadonlySet<MilestoneId>, nominal: readonly Milestone[] | null, recoveryDaysWithoutGold = 1,
): Milestone[] {
  const { calendar, locks } = f;
  const reference = nominal ? byId(nominal) : null;
  const made = new Map<MilestoneId, Milestone>();
  made.set("kickoff", span("kickoff", f.kickoff));
  if (storyboards) made.set("storyboards", span("storyboards", storyboards));
  for (const id of ["pink", "red", "gold"] as const) if (reviews[id]) made.set(id, reviews[id]);
  made.set("internalSubmit", span("internalSubmit", f.internalSubmit));
  made.set("due", span("due", f.due));
  for (const [id, lock] of locks) if (!dropped.has(id)) made.set(id, { ...lock, dropped: false });

  const between = (id: MilestoneId, before: MilestoneId, after: MilestoneId): void => {
    if (dropped.has(id) || made.has(id)) return;
    const a = made.get(before), b = made.get(after);
    if (!a || !b) return;
    made.set(id, span(id, addBusinessDays(a.end, 1, calendar), addBusinessDays(b.start, -1, calendar)));
  };
  between("pinkRecovery", "pink", "red");
  if (made.has("gold")) between("redRecovery", "red", "gold");
  else if (!dropped.has("redRecovery") && !made.has("redRecovery") && made.has("red")) {
    // With no Gold review, Red recovery takes its days straight after Red and production takes the rest.
    const red = made.get("red")!;
    made.set("redRecovery", span("redRecovery", addBusinessDays(red.end, 1, calendar), addBusinessDays(red.end, recoveryDaysWithoutGold, calendar)));
  }
  between("production", made.has("gold") ? "gold" : made.has("redRecovery") ? "redRecovery" : "red", "internalSubmit");

  return MILESTONE_IDS.map(id => {
    const item = made.get(id);
    if (item) return { ...item, locked: locks.has(id), dropped: false };
    // A dropped milestone keeps the dates the standard plan gave it, for reference.
    const was = reference?.get(id);
    return { id, start: was?.start ?? f.kickoff, end: was?.end ?? f.kickoff, locked: false, dropped: true };
  });
}

function buildNominal(f: Frame): Milestone[] {
  const at = positions(f);
  const review = (id: "pink" | "red" | "gold"): Milestone => span(id, at[id], addBusinessDays(at[id], f.settings.reviewDays[id] - 1, f.calendar));
  return assemble(f, { pink: review("pink"), red: review("red"), gold: review("gold") }, at.storyboards, new Set(), null);
}

function validate(f: Frame, milestones: readonly Milestone[], minimums: { recovery: Partial<Record<MilestoneId, number>>; production: number }): PlanIssue[] {
  const { calendar } = f;
  const live = milestones.filter(item => !item.dropped);
  const get = byId(live);
  const issues: PlanIssue[] = [];
  const name = (item: Milestone): string => milestoneDef(item.id).label + (item.locked ? " (locked)" : "");
  const push = (code: PlanIssue["code"], severity: PlanIssue["severity"], items: Milestone[], message: string): void => {
    issues.push({ code, severity, milestones: items.map(item => item.id), message, lockedConflict: items.some(item => item.locked) });
  };

  if (f.window < 1) {
    push("window", "error", [get.get("kickoff")!, get.get("internalSubmit")!],
      `Internal submit (${formatDate(f.internalSubmit)}) is on or before kickoff (${formatDate(f.kickoff)}). No plan fits.`);
  }

  const anchors = live.filter(item => milestoneDef(item.id).kind !== "work");
  for (let i = 1; i < anchors.length; i += 1) {
    const before = anchors[i - 1], after = anchors[i];
    const ok = after.id === "due" ? after.start >= before.end : after.start > before.end;
    if (!ok) {
      push("order", "error", [before, after],
        `${name(after)} on ${formatDate(after.start)} does not come after ${name(before)} on ${formatDate(before.end)}.`);
    }
  }

  for (const item of live) {
    const def = milestoneDef(item.id);
    if (def.kind === "review") {
      if (item.end < item.start || milestoneDays(item, calendar) < MINIMUMS.reviewDays) {
        push("duration", "error", [item], `${name(item)} has no business day. A review session needs at least ${day(MINIMUMS.reviewDays)}.`);
      }
    } else if (def.kind === "work") {
      const minimum = item.id === "production" ? minimums.production : minimums.recovery[item.id] ?? MINIMUMS.recoveryDays;
      const days = milestoneDays(item, calendar);
      if (days < minimum) {
        push("duration", "error", [item], `${name(item)} has ${day(days)}. The minimum is ${day(minimum)}.`);
      } else if (item.locked) {
        const index = live.indexOf(item);
        const before = live.slice(0, index).reverse().find(other => milestoneDef(other.id).kind !== "work");
        const after = live.slice(index + 1).find(other => milestoneDef(other.id).kind !== "work");
        if ((before && item.start <= before.end) || (after && item.end >= after.start)) {
          push("order", "error", [item], `${name(item)} (${formatDate(item.start)} to ${formatDate(item.end)}) overlaps the milestone beside it.`);
        }
      }
    } else if (item.id !== "due") {
      const reason = offDayReason(item.start, calendar);
      if (reason) push("off-day", "warning", [item], `${name(item)} falls on ${reason === "Weekend" ? "a weekend" : reason} (${formatDate(item.start)}).`);
    }
  }
  const due = get.get("due");
  if (due) {
    const reason = offDayReason(due.start, calendar);
    if (reason) push("off-day", "warning", [due], `The due date falls on ${reason === "Weekend" ? "a weekend" : reason} (${formatDate(due.start)}).`);
  }
  return issues;
}

const STANDARD_MINIMUMS = { recovery: { pinkRecovery: MINIMUMS.recoveryDays, redRecovery: MINIMUMS.recoveryDays }, production: MINIMUMS.productionDays };
const hasErrors = (issues: readonly PlanIssue[]): boolean => issues.some(issue => issue.severity === "error");

/** Business days of writing before the first review: after the storyboards when they are kept, otherwise after kickoff. */
function draftDaysOf(f: Frame, milestones: readonly Milestone[]): number {
  const get = byId(milestones.filter(item => !item.dropped));
  const first = get.get("pink") ?? get.get("red") ?? get.get("gold") ?? get.get("production");
  const from = get.get("storyboards") ?? get.get("kickoff");
  if (!first || !from) return 0;
  return Math.max(0, businessDaysBetween(from.start, first.start, f.calendar) - 1);
}

function buildVariant(f: Frame, variant: Variant, nominal: readonly Milestone[]): Milestone[] | null {
  const { calendar, locks, settings } = f;
  const nominalById = byId(nominal);
  const dropped = new Set<MilestoneId>();
  if (!variant.keepStoryboards) dropped.add("storyboards");
  if (!variant.keepPink) { dropped.add("pink"); dropped.add("pinkRecovery"); }
  if (!variant.keepGold) dropped.add("gold");
  if (variant.redRecoveryMin === 0) dropped.add("redRecovery");
  // A locked milestone is never dropped or moved. A plan that needs to do either does not apply.
  for (const id of dropped) if (locks.has(id)) return null;

  const order = (["pink", "red", "gold"] as const).filter(id => !dropped.has(id));
  const length = (id: "pink" | "red" | "gold"): number => (variant.shortReviews ? 1 : settings.reviewDays[id]);
  const gapAfter = (id: "pink" | "red" | "gold"): number => {
    if (id === "pink") return MINIMUMS.recoveryDays;
    if (id === "red") return order.includes("gold") ? variant.redRecoveryMin : variant.redRecoveryMin + variant.productionMin;
    return variant.productionMin;
  };
  const reviews = new Map<"pink" | "red" | "gold", Milestone>();
  for (const id of order) {
    const lock = locks.get(id);
    const start = lock ? lock.start : nominalById.get(id)!.start;
    reviews.set(id, lock ? { ...lock } : span(id, start, addBusinessDays(start, length(id) - 1, calendar)));
  }

  // Forward: nothing starts before the work ahead of it can finish.
  let earliest = addBusinessDays(f.kickoff, variant.keepStoryboards ? 2 : 1, calendar);
  const lockedStoryboards = variant.keepStoryboards ? locks.get("storyboards") : undefined;
  if (lockedStoryboards) {
    const after = addBusinessDays(lockedStoryboards.start, 1, calendar);
    if (after > earliest) earliest = after;
  }
  for (const id of order) {
    const review = reviews.get(id)!;
    if (!review.locked && review.start < earliest) {
      reviews.set(id, span(id, earliest, addBusinessDays(earliest, length(id) - 1, calendar)));
    }
    earliest = addBusinessDays(reviews.get(id)!.end, gapAfter(id) + 1, calendar);
  }
  // Backward: every review ends early enough to leave the minimum behind it.
  let latestEnd: ISODate | null = null;
  for (const id of [...order].reverse()) {
    const review = reviews.get(id)!;
    const limit: ISODate = latestEnd ?? addBusinessDays(f.internalSubmit, -(gapAfter(id) + 1), calendar);
    if (!review.locked && review.end > limit) {
      reviews.set(id, span(id, addBusinessDays(limit, -(length(id) - 1), calendar), limit));
    }
    const placed = reviews.get(id)!;
    const previous = order[order.indexOf(id) - 1];
    latestEnd = previous ? addBusinessDays(placed.start, -(gapAfter(previous) + 1), calendar) : null;
  }

  let storyboards: ISODate | null = null;
  if (variant.keepStoryboards && !locks.has("storyboards")) {
    const first = reviews.get(order[0])!;
    const low = addBusinessDays(f.kickoff, 1, calendar);
    const high = addBusinessDays(first.start, -1, calendar);
    const wanted = nominalById.get("storyboards")!.start;
    if (wanted >= low && wanted <= high) storyboards = wanted;
    else {
      const share = settings.mode === "proportional" ? settings.percents.storyboards / Math.max(1, settings.percents[order[0]]) : 0.4;
      const steps = Math.max(1, Math.round(businessDaysBetween(f.kickoff, first.start, calendar) * share));
      const placed = addBusinessDays(f.kickoff, steps, calendar);
      storyboards = placed > high ? high : placed;
    }
  }
  return assemble(f, Object.fromEntries(reviews), storyboards, dropped, nominal, Math.max(1, variant.redRecoveryMin));
}

function describeChanges(f: Frame, nominal: readonly Milestone[], candidate: readonly Milestone[]): string[] {
  const { calendar } = f;
  const before = byId(nominal);
  const changes: string[] = [];
  for (const item of candidate) {
    const def = milestoneDef(item.id);
    const was = before.get(item.id)!;
    if (item.dropped) {
      if (item.id === "pink") changes.push("Pink team review dropped. Its checks fold into Red team review.");
      else if (item.id === "pinkRecovery") changes.push("Pink recovery dropped with the Pink team review.");
      else if (item.id === "storyboards") changes.push("Storyboards / annotated outline milestone dropped. Writers draft from kickoff.");
      else if (item.id === "gold") changes.push("Gold team review dropped. The final read folds into Red team review.");
      else if (item.id === "redRecovery") changes.push("Red recovery dropped. Red team comments go straight into production.");
      else changes.push(`${def.label} dropped.`);
      continue;
    }
    if (def.kind === "point") {
      if (item.start !== was.start) changes.push(`${def.label} moved from ${formatDate(was.start)} to ${formatDate(item.start)}.`);
      continue;
    }
    const days = milestoneDays(item, calendar), wasDays = milestoneDays(was, calendar);
    const minimum = item.id === "production" ? MINIMUMS.productionDays : def.kind === "work" ? MINIMUMS.recoveryDays : MINIMUMS.reviewDays;
    // Durations are reported against the minimum first: a plan that cuts below it says so in those words.
    if (days < minimum) {
      changes.push(`${def.label} cut to ${day(days)}, below the ${minimum}-day minimum.`);
    } else if (wasDays < minimum) {
      changes.push(`${def.label} holds ${day(days)}. The standard plan left ${day(wasDays)}.`);
    } else if (days < wasDays) {
      changes.push(`${def.label} shortened from ${day(wasDays)} to ${day(days)}.`);
    } else if (days > wasDays) {
      changes.push(`${def.label} lengthened from ${day(wasDays)} to ${day(days)}.`);
    }
    if (def.kind === "review" && item.start !== was.start) changes.push(`${def.label} moved from ${formatDate(was.start)} to ${formatDate(item.start)}.`);
    else if (def.kind === "work" && days === wasDays && (item.start !== was.start || item.end !== was.end)) changes.push(`${def.label} moved to ${formatDate(item.start)} through ${formatDate(item.end)}.`);
  }
  return changes;
}

function variantsFor(settings: ScheduleSettings): Variant[] {
  const longReviews = Object.values(settings.reviewDays).some(days => days > 1);
  const base = { keepStoryboards: true, keepPink: true, keepGold: true, redRecoveryMin: MINIMUMS.recoveryDays as number, productionMin: MINIMUMS.productionDays as number, shortReviews: false };
  const list: Variant[] = [{ ...base, key: "adjust", title: "Keep all three reviews at minimum spacing" }];
  if (longReviews) list.push({ ...base, key: "adjust-short", title: "Keep all three reviews, one day each", shortReviews: true });
  list.push(
    { ...base, key: "fold-pink", title: "Fold Pink into Red", keepPink: false, shortReviews: true },
    { ...base, key: "fold-pink-no-storyboards", title: "Fold Pink into Red and skip the storyboard milestone", keepPink: false, keepStoryboards: false, shortReviews: true },
    { ...base, key: "short-recovery", title: "Fold Pink into Red with a one-day Red recovery", keepPink: false, keepStoryboards: false, redRecoveryMin: 1, shortReviews: true },
    { ...base, key: "short-production", title: "Fold Pink into Red with one-day recovery and production", keepPink: false, keepStoryboards: false, redRecoveryMin: 1, productionMin: 1, shortReviews: true },
    { ...base, key: "single-review", title: "One combined review", keepPink: false, keepStoryboards: false, keepGold: false, redRecoveryMin: 1, productionMin: 1, shortReviews: true },
    { ...base, key: "review-only", title: "One combined review with no recovery", keepPink: false, keepStoryboards: false, keepGold: false, redRecoveryMin: 0, productionMin: 1, shortReviews: true },
  );
  return list;
}

function compressedOptions(f: Frame, nominal: readonly Milestone[]): CompressedOption[] {
  const fitting: CompressedOption[] = [];
  for (const variant of variantsFor(f.settings)) {
    const milestones = buildVariant(f, variant, nominal);
    if (!milestones) continue;
    const issues = validate(f, milestones, { recovery: { pinkRecovery: MINIMUMS.recoveryDays, redRecovery: Math.max(1, variant.redRecoveryMin) }, production: variant.productionMin });
    if (hasErrors(issues)) continue;
    const draftDays = draftDaysOf(f, milestones);
    const changes = describeChanges(f, nominal, milestones);
    const dropped = milestones.filter(item => item.dropped).length;
    const summary = `${dropped ? `${dropped} ${dropped === 1 ? "milestone" : "milestones"} dropped. ` : "No milestone dropped. "}${day(draftDays)} of writing before the first review.`;
    fitting.push({ key: variant.key, title: variant.title, summary, milestones, changes, issues, draftDays });
  }
  if (!fitting.length) return [];
  // Three reviews stay only when writers get the minimum drafting time before Pink. Otherwise Pink folds into Red.
  const keepsAll = fitting.filter(option => option.key.startsWith("adjust"));
  const folded = fitting.find(option => option.key === "fold-pink");
  const roomy = keepsAll.find(option => option.draftDays >= MINIMUMS.draftDays);
  const first = roomy ?? folded ?? fitting[0];
  const second = first === roomy ? folded : keepsAll[0];
  return [first, ...(second && second !== first ? [second] : [])];
}

/** Plans the schedule back from the due date. Pure: the same input gives the same plan. */
export function planSchedule(input: PlanInput): PlanResult {
  const f = frame(input);
  const nominal = buildNominal(f);
  const nominalIssues = validate(f, nominal, STANDARD_MINIMUMS);
  const needsCompression = hasErrors(nominalIssues);
  const options = needsCompression ? compressedOptions(f, nominal) : [];
  const used = needsCompression && input.compressionKey ? options.find(option => option.key === input.compressionKey) ?? null : null;
  return {
    milestones: used ? used.milestones : nominal,
    issues: used ? used.issues : nominalIssues,
    nominal, nominalIssues, options, used,
    internalSubmit: f.internalSubmit, kickoff: f.kickoff, windowDays: f.window, needsCompression,
  };
}

/** The state after a plan is accepted. */
export function applyPlan(state: ScheduleState, result: PlanResult, nowISO: string): ScheduleState {
  return {
    settings: state.settings,
    milestones: result.milestones.map(item => ({ ...item })),
    compression: result.used ? { key: result.used.key, title: result.used.title, changes: [...result.used.changes], appliedAt: nowISO } : null,
  };
}

/** Sets a milestone's dates by hand and locks it. */
export function lockMilestone(milestones: readonly Milestone[], id: MilestoneId, start: ISODate, end: ISODate = start): Milestone[] {
  const kind = milestoneDef(id).kind;
  return milestones.map(item => (item.id === id ? { ...item, start, end: kind === "point" || end < start ? start : end, locked: true, dropped: false } : { ...item }));
}

export function unlockMilestone(milestones: readonly Milestone[], id: MilestoneId): Milestone[] {
  return milestones.map(item => (item.id === id ? { ...item, locked: false } : { ...item }));
}

export interface DiffRow {
  id: MilestoneId;
  label: string;
  before: string;
  after: string;
  changed: boolean;
  locked: boolean;
}

function describe(item: Milestone | undefined): string {
  if (!item) return "Not planned";
  if (item.dropped) return "Dropped";
  return item.start === item.end ? formatDate(item.start) : `${formatDate(item.start)} to ${formatDate(item.end)}`;
}

/** One row per milestone: what it was and what it becomes. */
export function diffSchedules(before: readonly Milestone[], after: readonly Milestone[]): DiffRow[] {
  const a = byId(before), b = byId(after);
  return MILESTONES.map(def => {
    const was = describe(a.get(def.id)), now = describe(b.get(def.id));
    return { id: def.id, label: def.label, before: was, after: now, changed: was !== now, locked: Boolean(b.get(def.id)?.locked) };
  });
}

export interface Countdown {
  milestone: Milestone;
  label: string;
  /** Business days from today to the start of the milestone. Zero means today. */
  businessDays: number;
  /** Mono label under the number, for example BUSINESS DAYS TO RED TEAM. */
  caption: string;
  /** The same thing as a sentence fragment, for example 6 business days to Red team. */
  text: string;
}

/**
 * The next milestone that has not started, counted in business days from today. Recovery and production are spans
 * of work between milestones, so the countdown passes over them to the review or date they lead to.
 */
export function nextMilestone(milestones: readonly Milestone[], today: ISODate, calendar: WorkCalendar): Countdown | null {
  const upcoming = milestones.filter(item => !item.dropped && item.start >= today && milestoneDef(item.id).kind !== "work").sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : MILESTONE_IDS.indexOf(a.id) - MILESTONE_IDS.indexOf(b.id)));
  const milestone = upcoming[0];
  if (!milestone) return null;
  return countdownTo(milestone, today, calendar);
}

export function countdownTo(milestone: Milestone, today: ISODate, calendar: WorkCalendar): Countdown {
  const def = milestoneDef(milestone.id);
  const businessDays = businessDaysBetween(today, milestone.start, calendar);
  const unit = Math.abs(businessDays) === 1 ? "business day" : "business days";
  const target = def.short === "Due" ? "the due date" : def.short;
  return {
    milestone, label: def.label, businessDays,
    caption: businessDays < 0 ? `${unit} since ${target}` : `${unit} to ${target}`,
    text: businessDays === 0 ? `${def.short === "Due" ? "The due date" : def.short} is today` : businessDays < 0 ? `${-businessDays} ${unit} since ${target}` : `${businessDays} ${unit} to ${target}`,
  };
}

/** The next color team review that has not started, or the last milestone before submission when all have passed. */
export function nextColorTeam(milestones: readonly Milestone[], today: ISODate): Milestone | null {
  const live = milestones.filter(item => !item.dropped);
  return COLOR_TEAMS.map(id => live.find(item => item.id === id)).find(item => item && item.start >= today)
    ?? live.find(item => item.id === "internalSubmit") ?? null;
}
