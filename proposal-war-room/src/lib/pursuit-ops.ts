// Operations that touch more than one part of a pursuit. All pure: a pursuit in, a new pursuit out.

import type { ISODate } from "./calendar.ts";
import { logEntry } from "./model.ts";
import type { ChangeLogEntry, OutlineNode, Pursuit } from "./model.ts";
import { applyPlan, COLOR_TEAMS, diffSchedules, nextColorTeam, planSchedule } from "./scheduler.ts";
import type { DiffRow, Milestone, MilestoneId, PlanResult, ScheduleSettings } from "./scheduler.ts";

export interface PlanPatch {
  dueDate?: ISODate;
  settings?: ScheduleSettings;
  current?: readonly Milestone[];
  /** null clears an accepted compressed plan. Leave it out to keep the one in force. */
  compressionKey?: string | null;
}

/** The plan for a pursuit as it stands, or with some inputs changed. Null until the pursuit has a due date. */
export function planPursuit(pursuit: Pursuit, today: ISODate, patch: PlanPatch = {}): PlanResult | null {
  const dueDate = patch.dueDate ?? pursuit.dueDate;
  if (!dueDate) return null;
  return planSchedule({
    dueDate, today,
    rfpReleaseDate: pursuit.rfpReleaseDate,
    settings: patch.settings ?? pursuit.schedule.settings,
    current: patch.current ?? pursuit.schedule.milestones,
    compressionKey: patch.compressionKey !== undefined ? patch.compressionKey : pursuit.schedule.compression?.key ?? null,
  });
}

const FOLLOWING: Record<string, MilestoneId[]> = { pink: ["red", "gold", "internalSubmit"], red: ["gold", "internalSubmit"], gold: ["internalSubmit"] };

/** The milestone a section is due at, moved to the next review that is still planned when its own was dropped. */
export function liveDueMilestone(milestones: readonly Milestone[], id: MilestoneId | ""): Milestone | null {
  if (!id) return null;
  const find = (wanted: MilestoneId): Milestone | undefined => milestones.find(item => item.id === wanted && !item.dropped);
  return find(id) ?? (FOLLOWING[id] ?? []).map(find).find(Boolean) ?? null;
}

/** When a section is due: its own date when one is set, otherwise the start of the milestone it follows. */
export function sectionDueDate(pursuit: Pursuit, node: OutlineNode): ISODate | "" {
  if (node.dueDate) return node.dueDate;
  return liveDueMilestone(pursuit.schedule.milestones, node.dueMilestone)?.start ?? "";
}

/** New sections are due at the next color team. */
export function defaultDueMilestone(pursuit: Pursuit, today: ISODate): MilestoneId | "" {
  const next = nextColorTeam(pursuit.schedule.milestones, today);
  return next && (COLOR_TEAMS.includes(next.id) || next.id === "internalSubmit") ? next.id : "";
}

export interface ScheduleChange {
  pursuit: Pursuit;
  result: PlanResult;
  rows: DiffRow[];
  moved: number;
}

/**
 * Applies a plan and writes it to the change log. `entry` names what caused it. Sections with no due milestone yet
 * pick up the next color team, so a pursuit outlined before it was scheduled still gets due dates.
 */
export function applySchedule(pursuit: Pursuit, result: PlanResult, today: ISODate, nowISO: string, entry: Pick<ChangeLogEntry, "kind" | "title" | "detail"> & Partial<ChangeLogEntry>, patch: Partial<Pursuit> = {}): ScheduleChange {
  const rows = diffSchedules(pursuit.schedule.milestones, result.milestones);
  const moved = rows.filter(row => row.changed).length;
  const schedule = applyPlan({ ...pursuit.schedule, ...(patch.schedule ?? {}) }, result, nowISO);
  const next: Pursuit = { ...pursuit, ...patch, schedule };
  const fallback = defaultDueMilestone(next, today);
  next.outline = next.outline.map(node => (node.dueMilestone || node.dueDate || !fallback ? node : { ...node, dueMilestone: fallback }));
  next.changeLog = [...pursuit.changeLog, logEntry(entry.kind, entry.title, entry.detail, nowISO, { ...entry, rows })].slice(-500);
  return { pursuit: next, result, rows, moved };
}

/** Plans with the pursuit's own inputs and applies the result. The pursuit comes back unchanged when it has no due date. */
export function replan(pursuit: Pursuit, today: ISODate, nowISO: string, title: string, detail = "", patch: PlanPatch = {}): ScheduleChange | null {
  const base: Pursuit = patch.settings ? { ...pursuit, schedule: { ...pursuit.schedule, settings: patch.settings } } : pursuit;
  const result = planPursuit(base, today, patch);
  if (!result) return null;
  const kind = result.used ? "compression" : "schedule";
  const extra = result.used ? ` Compressed plan in force: ${result.used.title}.` : "";
  return applySchedule(base, result, today, nowISO, { kind, title, detail: `${detail}${extra}`.trim() }, patch.dueDate ? { dueDate: patch.dueDate } : {});
}
