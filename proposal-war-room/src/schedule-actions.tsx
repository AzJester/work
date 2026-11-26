import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatDate } from "./lib/calendar.ts";
import type { ISODate } from "./lib/calendar.ts";
import { applySchedule, planPursuit, replan } from "./lib/pursuit-ops.ts";
import { diffSchedules, lockMilestone, milestoneDef, unlockMilestone } from "./lib/scheduler.ts";
import type { MilestoneId, PlanResult, ScheduleSettings } from "./lib/scheduler.ts";
import { usePursuit } from "./state.tsx";
import { Button, DateInput, Dialog, Field, Icon, StatusWord, TextInput, useToast } from "./ui/kit.tsx";

interface ScheduleActions {
  /** Sets the due date. A change to a date that is already planned opens the amendment dialog first. */
  requestDueDate(date: ISODate | ""): void;
  /** Plans again with the pursuit's current inputs. Locked milestones stay where they are. */
  replanNow(title: string, detail?: string): void;
  changeSettings(settings: ScheduleSettings, title: string): void;
  /** Sets a milestone's dates by hand, which locks it. The due date goes through the amendment dialog instead. */
  editMilestone(id: MilestoneId, start: ISODate, end?: ISODate): void;
  unlock(id: MilestoneId): void;
  /** Accepts a compressed plan, or returns to the standard plan with null. */
  useCompression(key: string | null): void;
}

const Context = createContext<ScheduleActions | null>(null);
export function useScheduleActions(): ScheduleActions {
  const value = useContext(Context);
  if (!value) throw new Error("Schedule actions need their provider");
  return value;
}

const stamp = (): string => new Date().toISOString();

export function ScheduleActionsProvider({ children }: { children: ReactNode }) {
  const { pursuit, update, today } = usePursuit();
  const toast = useToast();
  const [pending, setPending] = useState<ISODate | null>(null);

  const announce = useCallback((moved: number, result: PlanResult) => {
    const problems = result.issues.filter(issue => issue.severity === "error").length;
    toast(moved ? `Schedule re-planned: ${moved} ${moved === 1 ? "milestone" : "milestones"} moved` : "Schedule re-planned: no dates moved",
      problems ? `${problems} ${problems === 1 ? "conflict needs" : "conflicts need"} attention on the Schedule screen.` : undefined);
  }, [toast]);

  const replanNow = useCallback((title: string, detail = "") => {
    let outcome: { moved: number; result: PlanResult } | null = null;
    update(current => {
      const change = replan(current, today, stamp(), title, detail);
      if (!change) return current;
      outcome = { moved: change.moved, result: change.result };
      return change.pursuit;
    });
    if (outcome) announce((outcome as { moved: number }).moved, (outcome as { result: PlanResult }).result);
  }, [announce, today, update]);

  const requestDueDate = useCallback((date: ISODate | "") => {
    if (date === pursuit.dueDate) return;
    if (!date) {
      // A planned pursuit keeps its due date until a new one replaces it.
      if (!pursuit.schedule.milestones.length) update(current => ({ ...current, dueDate: "" }));
      return;
    }
    if (pursuit.dueDate && pursuit.schedule.milestones.length) {
      setPending(date);
      return;
    }
    update(current => {
      const change = replan(current, today, stamp(), "Schedule planned", `Planned back from the due date, ${formatDate(date)}.`, { dueDate: date });
      return change ? change.pursuit : { ...current, dueDate: date };
    });
  }, [pursuit.dueDate, pursuit.schedule.milestones.length, today, update]);

  const changeSettings = useCallback((settings: ScheduleSettings, title: string) => {
    update(current => {
      const change = replan(current, today, stamp(), title, "", { settings });
      return change ? change.pursuit : { ...current, schedule: { ...current.schedule, settings } };
    });
  }, [today, update]);

  const editMilestone = useCallback((id: MilestoneId, start: ISODate, end?: ISODate) => {
    if (id === "due") return requestDueDate(start);
    update(current => {
      const locked = lockMilestone(current.schedule.milestones, id, start, end);
      const item = locked.find(entry => entry.id === id)!;
      const label = milestoneDef(id).label;
      const when = item.start === item.end ? formatDate(item.start) : `${formatDate(item.start)} to ${formatDate(item.end)}`;
      const change = replan(current, today, stamp(), `${label} locked`, `Set by hand to ${when}.`, { current: locked });
      return change ? { ...change.pursuit, changeLog: change.pursuit.changeLog.map((entry, index, all) => (index === all.length - 1 ? { ...entry, kind: "lock" as const } : entry)) } : current;
    });
  }, [requestDueDate, today, update]);

  const unlock = useCallback((id: MilestoneId) => {
    update(current => {
      const change = replan(current, today, stamp(), `${milestoneDef(id).label} unlocked`, "The date returns to the plan.", { current: unlockMilestone(current.schedule.milestones, id) });
      return change ? change.pursuit : current;
    });
  }, [today, update]);

  const useCompression = useCallback((key: string | null) => {
    update(current => {
      const result = planPursuit(current, today, { compressionKey: key });
      if (!result) return current;
      const title = result.used ? `Compressed plan applied: ${result.used.title}` : "Standard plan restored";
      const detail = result.used ? result.used.changes.join(" ") : "The compressed plan was removed.";
      return applySchedule(current, result, today, stamp(), { kind: "compression", title, detail }).pursuit;
    });
  }, [today, update]);

  const value = useMemo(() => ({ requestDueDate, replanNow, changeSettings, editMilestone, unlock, useCompression }), [requestDueDate, replanNow, changeSettings, editMilestone, unlock, useCompression]);

  return (
    <Context.Provider value={value}>
      {children}
      {pending ? <AmendmentDialog date={pending} onClose={() => setPending(null)} /> : null}
    </Context.Provider>
  );
}

/** The due date moved: show every date before and after, and take the amendment number before anything changes. */
function AmendmentDialog({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { pursuit, update, today } = usePursuit();
  const toast = useToast();
  const amendments = pursuit.changeLog.filter(entry => entry.kind === "amendment").length;
  const [number, setNumber] = useState(String(amendments + 1).padStart(4, "0"));
  const [amendmentDate, setAmendmentDate] = useState<string>(today);
  const result = useMemo(() => planPursuit(pursuit, today, { dueDate: date }), [pursuit, today, date]);
  if (!result) return null;
  const rows = diffSchedules(pursuit.schedule.milestones, result.milestones);
  const errors = result.issues.filter(issue => issue.severity === "error");
  const confirm = () => {
    update(current => {
      const fresh = planPursuit(current, today, { dueDate: date });
      if (!fresh) return current;
      return applySchedule(current, fresh, today, stamp(), {
        kind: "amendment",
        title: `Amendment ${number.trim() || "unnumbered"}: due date moved to ${formatDate(date)}`,
        detail: `Due date changed from ${formatDate(current.dueDate)} to ${formatDate(date)}.`,
        amendmentNumber: number.trim(), amendmentDate: amendmentDate as ISODate,
      }, { dueDate: date }).pursuit;
    });
    toast("Amendment recorded", `The schedule now plans back from ${formatDate(date)}.`);
    onClose();
  };
  return (
    <Dialog name="amendment" title="Confirm due date change" icon="amendment" onClose={onClose} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={confirm}>Confirm amendment</Button></>}>
      <p>The due date moves from <span className="strong">{formatDate(pursuit.dueDate)}</span> to <span className="strong">{formatDate(date)}</span>. Unlocked milestones are planned again. Locked milestones stay where they are.</p>
      <div className="form-grid">
        <Field label="Amendment number" className="span-4">{id => <TextInput id={id} value={number} onValue={setNumber} mono maxLength={20} />}</Field>
        <Field label="Amendment date" className="span-4">{id => <DateInput id={id} value={amendmentDate} onValue={setAmendmentDate} />}</Field>
      </div>
      {errors.length ? (
        <div className="notice" data-notice="amendment-conflicts">
          <div className="notice-head"><Icon name="issue" /><span>{result.needsCompression && !result.used ? "The standard plan does not fit the new window" : "The new plan has conflicts"}</span></div>
          <ul>{errors.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>
          <p className="caption">Confirm the date, then settle these on the Schedule screen.</p>
        </div>
      ) : null}
      <div className="stack">
        <span className="table-caption">Table 1: Schedule before and after</span>
        <div className="table-wrap">
          <table className="dense" data-table="amendment-diff">
            <thead><tr><th>Milestone</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} data-milestone={row.id} data-changed={row.changed}>
                  <td>{row.label}</td>
                  <td className="mono-cell">{row.before}</td>
                  <td className="mono-cell">{row.after}</td>
                  <td>{row.locked ? <StatusWord value="Locked" size={16} detail={row.changed ? "" : "No change"} /> : row.changed ? <span className="strong">Moved</span> : <span className="muted">No change</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
