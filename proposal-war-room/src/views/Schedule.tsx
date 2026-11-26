import { useMemo, useState } from "react";
import { addDays, businessDaysBetween, daysBetween, formatDate, isISODate, monthLabel, offDayReason } from "../lib/calendar.ts";
import type { ISODate } from "../lib/calendar.ts";
import { changeLogCsv, formatTime, scheduleCsv, scheduleIcs } from "../lib/exports.ts";
import { pursuitFileName, timeZoneLabel } from "../lib/model.ts";
import { planPursuit } from "../lib/pursuit-ops.ts";
import { calendarFor, DEFAULT_SETTINGS, MILESTONES, milestoneDays, MINIMUMS, nextMilestone, normalizeSettings } from "../lib/scheduler.ts";
import type { Milestone, MilestoneDef, PlanResult, ScheduleSettings } from "../lib/scheduler.ts";
import { useScheduleActions } from "../schedule-actions.tsx";
import { usePursuit } from "../state.tsx";
import { Button, Checkbox, CountdownBlock, DateInput, downloadFile, EmptyState, Field, Icon, NumberInput, Region, StatusWord, Tabs, TextInput } from "../ui/kit.tsx";
import type { IconName } from "../ui/kit.tsx";

type Tab = "timeline" | "list" | "log" | "rules";
const iconFor = (def: MilestoneDef): IconName => (def.kind === "review" ? "color-review" : def.id === "due" ? "deadline" : def.id === "internalSubmit" ? "submit" : def.kind === "work" ? "schedule" : "milestone");
const days = (count: number): string => (count === 1 ? "1 business day" : `${count} business days`);

export function Schedule({ go }: { go: (route: string) => void }) {
  const { pursuit, today } = usePursuit();
  const actions = useScheduleActions();
  const [tab, setTab] = useState<Tab>("timeline");
  const plan = useMemo(() => planPursuit(pursuit, today), [pursuit, today]);

  if (!pursuit.dueDate || !plan || !pursuit.schedule.milestones.length) {
    return (
      <div className="page" data-view="schedule">
        <header className="page-head"><h1 className="page-title">Schedule</h1></header>
        <EmptyState name="no-schedule" title="No due date yet" body="Enter the proposal due date on the setup screen and the review schedule is planned back from it."
          action={<Button variant="primary" icon="rfp" iconSize={20} onClick={() => go("setup")}>Open pursuit setup</Button>} />
      </div>
    );
  }

  const settings = pursuit.schedule.settings;
  const calendar = calendarFor(settings);
  const milestones = pursuit.schedule.milestones;
  const next = nextMilestone(milestones, today, calendar);
  const toDue = businessDaysBetween(today, pursuit.dueDate, calendar);
  const errors = plan.issues.filter(issue => issue.severity === "error");
  const warnings = plan.issues.filter(issue => issue.severity === "warning");
  const stampName = (extension: string, suffix: string) => pursuitFileName(pursuit, extension, suffix);

  return (
    <div className="page" data-view="schedule">
      <header className="page-head">
        <h1 className="page-title">Schedule</h1>
        <p className="mono muted">Due {formatDate(pursuit.dueDate)} / {formatTime(pursuit.dueTime)} {timeZoneLabel(pursuit.timeZone)}</p>
      </header>

      <div className="grid cols-2">
        <Region name="schedule-countdown" ion className="panel">
          <div className="panel-head"><h2 className="panel-title"><Icon name="milestone" size={16} /><span>Next milestone</span></h2></div>
          {next
            ? <CountdownBlock name="next-milestone" signal value={String(next.businessDays)} caption={next.businessDays === 0 ? `${next.milestone.id === "due" ? "The due date" : next.label} is today` : next.caption} />
            : <CountdownBlock name="next-milestone" value="0" caption="No milestone ahead" />}
          <p className="caption" data-countdown-text>{next ? `${next.text}, ${formatDate(next.milestone.start)}.` : "Every milestone on this schedule has passed."}</p>
        </Region>
        <Region name="schedule-plan" className="panel">
          <div className="panel-head"><h2 className="panel-title"><Icon name="schedule" /><span>Plan</span></h2></div>
          <dl className="spec">
            <dt>Mode</dt><dd>{settings.mode === "proportional" ? "Proportional" : "Fixed offsets"}</dd>
            <dt>Window</dt><dd data-value="window">{days(plan.windowDays)}, kickoff to internal submit</dd>
            <dt>Internal submit</dt><dd data-value="internal-submit">{formatDate(plan.internalSubmit)}{settings.bufferEnabled ? `, ${days(settings.bufferDays)} before due` : ", buffer off"}</dd>
            <dt>Due</dt><dd>{toDue >= 0 ? `${days(toDue)} from today` : `${days(-toDue)} ago`}</dd>
          </dl>
          <div className="row">
            <Button variant="primary" icon="refresh" onClick={() => actions.replanNow("Schedule re-planned", "Planned again by hand.")} data-action="replan">Re-plan</Button>
            <Button icon="download" onClick={() => downloadFile(stampName("ics", "schedule"), scheduleIcs(pursuit, new Date().toISOString()), "text/calendar")}>Export .ics</Button>
            <Button icon="download" onClick={() => downloadFile(stampName("csv", "schedule"), scheduleCsv(pursuit), "text/csv")}>Export CSV</Button>
          </div>
        </Region>
      </div>

      <PlanNotice plan={plan} />
      {warnings.length ? (
        <div className="notice" data-notice="schedule-notes">
          <div className="notice-head"><Icon name="info" size={16} /><span>Dates on non-working days</span></div>
          <ul>{warnings.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>
        </div>
      ) : null}

      <Tabs label="Schedule views" value={tab} onValue={setTab} tabs={[
        { value: "timeline", label: "Timeline", icon: "calendar" }, { value: "list", label: "List", icon: "list-view" },
        { value: "log", label: "Change log", icon: "amendment" }, { value: "rules", label: "Planning rules", icon: "settings" },
      ]} />

      {tab === "timeline" ? <Gantt milestones={milestones} today={today} settings={settings} /> : null}
      {tab === "list" ? <MilestoneList milestones={milestones} plan={plan} errors={errors.length} /> : null}
      {tab === "log" ? <ChangeLog /> : null}
      {tab === "rules" ? <PlanningRules key={JSON.stringify(settings)} /> : null}
    </div>
  );
}

/** The warning that a window is too short, with the compressed plans to choose from. Nothing moves until one is applied. */
function PlanNotice({ plan }: { plan: PlanResult }) {
  const { pursuit } = usePursuit();
  const actions = useScheduleActions();
  const [picked, setPicked] = useState<string | null>(null);
  const inForce = pursuit.schedule.compression;
  const errors = plan.nominalIssues.filter(issue => issue.severity === "error");

  if (plan.used && inForce) {
    return (
      <Region name="schedule-compression" className="notice">
        <div className="notice-head" data-notice="compressed-in-force"><StatusWord value="Compressed plan" /><span>in force: {inForce.title}</span></div>
        <p>The standard plan does not fit {days(plan.windowDays)}. This is what the compressed plan changed:</p>
        <ul data-list="compression-changes">{inForce.changes.map(change => <li key={change}>{change}</li>)}</ul>
        <div className="row"><Button onClick={() => actions.useCompression(null)}>Return to the standard plan</Button></div>
      </Region>
    );
  }
  if (!plan.needsCompression) return null;
  const selected = plan.options.find(option => option.key === picked) ?? plan.options[0];
  // A date set by hand that breaks the order is the cause, whatever else it knocks over behind it.
  const lockedOnly = errors.some(issue => issue.lockedConflict);
  return (
    <Region name="schedule-compression" className="notice">
      <div className="notice-head" data-notice="compression-warning">
        <Icon name="status-attention" />
        <span>{lockedOnly ? "A locked date conflicts with the plan" : `The window is too short for the standard plan`}</span>
      </div>
      <p>Kickoff to internal submit is {days(plan.windowDays)}. The dates below are the standard plan, and nothing has been moved to make it fit. These problems stand:</p>
      <ul data-list="plan-problems">{errors.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>
      {selected ? (
        <>
          <p className="strong">Recommended compressed plan</p>
          {plan.options.length > 1 ? (
            <div className="seg" role="group" aria-label="Compressed plan">
              {plan.options.map((option, index) => <Button key={option.key} on={option.key === selected.key} onClick={() => setPicked(option.key)}>{index === 0 ? `${option.title} (recommended)` : option.title}</Button>)}
            </div>
          ) : <p className="option-title">{selected.title}</p>}
          <p className="caption">{selected.summary}</p>
          <p>Applying it makes exactly these changes:</p>
          <ul data-list="compression-changes">{selected.changes.map(change => <li key={change}>{change}</li>)}</ul>
          <div className="row"><Button variant="primary" icon="check" onClick={() => actions.useCompression(selected.key)} data-action="apply-compression">Apply compressed plan</Button></div>
        </>
      ) : (
        <p className="strong" data-notice="no-fit">No plan fits this window. Unlock a date, turn off the internal submit buffer, or ask for a later due date.</p>
      )}
    </Region>
  );
}

function Gantt({ milestones, today, settings }: { milestones: readonly Milestone[]; today: ISODate; settings: ScheduleSettings }) {
  const [dayWidth, setDayWidth] = useState(20);
  const calendar = calendarFor(settings);
  const live = milestones.filter(item => !item.dropped);
  const first = live.reduce((min, item) => (item.start < min ? item.start : min), today);
  const last = live.reduce((max, item) => (item.end > max ? item.end : max), today);
  const start = addDays(first, -2);
  const total = daysBetween(start, addDays(last, 3)) + 1;
  const x = (date: ISODate): number => daysBetween(start, date) * dayWidth;
  const allDays = Array.from({ length: total }, (_, index) => addDays(start, index));
  const months: { label: string; left: number; width: number }[] = [];
  for (const date of allDays) {
    const label = monthLabel(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    const current = months[months.length - 1];
    if (current && current.label === label) current.width += dayWidth;
    else months.push({ label, left: x(date), width: dayWidth });
  }
  return (
    <Region name="schedule-timeline" ion className="section" label="Timeline">
      <div className="row between">
        <div className="gantt-legend">
          <span><span className="swatch is-review" />Review session</span>
          <span><span className="swatch is-work" />Recovery and production</span>
          <span><span className="swatch is-off" />Weekend, federal holiday or blackout</span>
        </div>
        <div className="seg" role="group" aria-label="Timeline scale">
          <Button on={dayWidth === 12} onClick={() => setDayWidth(12)}>Compact</Button>
          <Button on={dayWidth === 20} onClick={() => setDayWidth(20)}>Standard</Button>
          <Button on={dayWidth === 32} onClick={() => setDayWidth(32)}>Wide</Button>
        </div>
      </div>
      <div className="gantt-wrap" data-gantt tabIndex={0} aria-label="Schedule timeline. The list view holds the same dates as a table.">
        <div className="gantt" style={{ width: `calc(var(--gantt-label-w) + ${total * dayWidth}px)` }}>
          <div className="gantt-head">
            <div className="gantt-label"><span className="mono muted">Milestone</span></div>
            <div className="gantt-track">
              <div className="gantt-months">{months.map(month => <div className="gantt-month" key={month.label} style={{ left: month.left, width: month.width }}>{month.width >= 56 ? month.label : ""}</div>)}</div>
              <div className="gantt-days">{allDays.map(date => (dayWidth >= 20 || date.endsWith("-01") || new Date(`${date}T00:00:00Z`).getUTCDay() === 1 ? <div className="gantt-day" key={date} style={{ left: x(date), width: Math.max(dayWidth, 20) }}>{Number(date.slice(8))}</div> : null))}</div>
            </div>
          </div>
          <div className="gantt-body">
            <div className="gantt-offdays">
              {allDays.map(date => { const reason = offDayReason(date, calendar); return reason ? <div className="gantt-offday" key={date} data-offday={date} title={`${formatDate(date)}: ${reason}`} style={{ left: x(date), width: dayWidth }} /> : null; })}
            </div>
            {MILESTONES.map(def => {
              const item = milestones.find(entry => entry.id === def.id);
              if (!item) return null;
              const count = milestoneDays(item, calendar);
              const title = `${def.label}: ${item.start === item.end ? formatDate(item.start) : `${formatDate(item.start)} to ${formatDate(item.end)}`}${def.kind === "point" ? "" : `, ${days(count)}`}`;
              return (
                <div className={`gantt-row${item.dropped ? " is-dropped" : ""}`} key={def.id} data-gantt-row={def.id}>
                  <div className="gantt-label">
                    <Icon name={iconFor(def)} size={def.kind === "point" && def.id === "kickoff" || def.id === "storyboards" ? 16 : 20} />
                    <span title={def.label}>{def.label}</span>
                    {item.locked ? <Icon name="lock" size={16} label="Locked" /> : null}
                    {item.dropped ? <span className="mono muted">Dropped</span> : null}
                  </div>
                  <div className="gantt-track">
                    {item.dropped || (def.kind !== "point" && count === 0) ? null
                      : def.kind === "point" ? <div className="gantt-point" data-gantt-point={def.id} title={title} style={{ left: x(item.start) + dayWidth / 2 }}><Icon name="milestone" size={16} /></div>
                      : <div className={`gantt-bar ${def.kind === "review" ? "is-review" : "is-work"}`} data-gantt-bar={def.id} title={title} style={{ left: x(item.start), width: (daysBetween(item.start, item.end) + 1) * dayWidth }} />}
                  </div>
                </div>
              );
            })}
            <div className="gantt-today" data-gantt-today={today} style={{ left: `calc(var(--gantt-label-w) + ${x(today) + dayWidth / 2}px)` }}><span className="gantt-today-label">Today</span></div>
          </div>
        </div>
      </div>
    </Region>
  );
}

function MilestoneList({ milestones, plan, errors }: { milestones: readonly Milestone[]; plan: PlanResult; errors: number }) {
  const { pursuit } = usePursuit();
  const actions = useScheduleActions();
  const calendar = calendarFor(pursuit.schedule.settings);
  return (
    <Region name="schedule-list" className="section">
      <p className="caption">Change a date and that milestone locks. Re-planning then moves only the unlocked ones.{errors ? ` ${errors} ${errors === 1 ? "conflict is" : "conflicts are"} flagged below.` : ""}</p>
      <div className="table-wrap">
        <table data-table="milestones">
          <thead><tr><th>Milestone</th><th>Start</th><th>End</th><th className="num">Business days</th><th>State</th><th>Actions</th></tr></thead>
          <tbody>
            {MILESTONES.map(def => {
              const item = milestones.find(entry => entry.id === def.id);
              if (!item) return null;
              const issues = plan.issues.filter(issue => issue.severity === "error" && issue.milestones.includes(def.id));
              return (
                <tr key={def.id} data-milestone={def.id} className={item.dropped ? "is-muted" : undefined}>
                  <td>
                    <span className="tree-title"><Icon name={iconFor(def)} size={def.kind === "point" && def.id !== "due" && def.id !== "internalSubmit" ? 16 : 20} /><span>{def.label}</span></span>
                    {def.note ? <span className="cell-note">{def.note}</span> : null}
                  </td>
                  <td style={{ width: 176 }}>{item.dropped ? null : <DateInput aria-label={`${def.label} start`} value={item.start} onValue={value => { if (isISODate(value)) actions.editMilestone(def.id, value, def.kind === "point" ? value : item.end < value ? value : item.end); }} />}</td>
                  <td style={{ width: 176 }}>{item.dropped || def.kind === "point" ? null : <DateInput aria-label={`${def.label} end`} value={item.end} min={item.start} onValue={value => { if (isISODate(value)) actions.editMilestone(def.id, value < item.start ? value : item.start, value); }} />}</td>
                  <td className="num mono-cell">{item.dropped ? "" : def.kind === "point" ? "" : milestoneDays(item, calendar)}</td>
                  <td>
                    <div className="stack tight">
                      {item.dropped ? <StatusWord value="Dropped" /> : issues.length ? <StatusWord value="Conflict" /> : item.locked ? null : <StatusWord value="On plan" size={16} />}
                      {item.locked && !item.dropped ? <StatusWord value="Locked" size={16} /> : null}
                      {issues.map(issue => <span className="cell-note" key={issue.message}>{issue.message}</span>)}
                    </div>
                  </td>
                  <td>{item.locked && def.id !== "due" ? <Button variant="quiet" onClick={() => actions.unlock(def.id)}>Unlock</Button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Region>
  );
}

function ChangeLog() {
  const { pursuit } = usePursuit();
  const entries = [...pursuit.changeLog].reverse();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Region name="schedule-log" className="section">
      <div className="row between">
        <p className="caption">Amendments, re-plans, locks and compressed plans, newest first.</p>
        <Button icon="download" onClick={() => downloadFile(pursuitFileName(pursuit, "csv", "change-log"), changeLogCsv(pursuit), "text/csv")}>Export CSV</Button>
      </div>
      <div className="table-wrap">
        <table className="dense" data-table="change-log">
          <thead><tr><th>Recorded</th><th>Kind</th><th>Amendment</th><th>Amendment date</th><th>Change</th><th>Dates</th></tr></thead>
          <tbody>
            {entries.map(entry => {
              const moved = entry.rows.filter(row => row.changed);
              return (
                <tr key={entry.id} data-log-kind={entry.kind}>
                  <td className="mono-cell">{entry.at.slice(0, 16).replace("T", " ")}</td>
                  <td><span className="tree-title">{entry.kind === "amendment" ? <Icon name="amendment" /> : entry.kind === "lock" ? <Icon name="lock" size={16} /> : null}<span>{entry.kind === "amendment" ? "Amendment" : entry.kind === "lock" ? "Lock" : entry.kind === "compression" ? "Compressed plan" : entry.kind === "parser" ? "Parser" : entry.kind === "import" ? "Import" : "Schedule"}</span></span></td>
                  <td className="mono-cell">{entry.amendmentNumber}</td>
                  <td className="mono-cell">{formatDate(entry.amendmentDate)}</td>
                  <td><span className="strong">{entry.title}</span>{entry.detail ? <span className="cell-note">{entry.detail}</span> : null}
                    {open === entry.id ? <span className="cell-note">{moved.map(row => `${row.label}: ${row.before} to ${row.after}`).join(". ")}.</span> : null}
                  </td>
                  <td className="nowrap">{moved.length ? <Button variant="quiet" onClick={() => setOpen(open === entry.id ? null : entry.id)}>{open === entry.id ? "Hide dates" : `${moved.length} moved`}</Button> : <span className="muted">None moved</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Region>
  );
}

function PlanningRules() {
  const { pursuit } = usePursuit();
  const actions = useScheduleActions();
  const [draft, setDraft] = useState<ScheduleSettings>(() => structuredClone(pursuit.schedule.settings));
  const [blackoutDate, setBlackoutDate] = useState("");
  const [blackoutLabel, setBlackoutLabel] = useState("");
  const order = draft.mode === "proportional"
    ? draft.percents.storyboards < draft.percents.pink && draft.percents.pink < draft.percents.red && draft.percents.red < draft.percents.gold && draft.percents.gold < 100
    : draft.offsets.storyboards > draft.offsets.pink && draft.offsets.pink > draft.offsets.red && draft.offsets.red > draft.offsets.gold && draft.offsets.gold >= 1;
  const dirty = JSON.stringify(normalizeSettings(draft)) !== JSON.stringify(pursuit.schedule.settings);
  const position = (key: "storyboards" | "pink" | "red" | "gold", value: number | null) => setDraft(current => (current.mode === "proportional"
    ? { ...current, percents: { ...current.percents, [key]: value ?? 0 } }
    : { ...current, offsets: { ...current.offsets, [key]: value ?? 0 } }));
  const values = draft.mode === "proportional" ? draft.percents : draft.offsets;
  const unit = draft.mode === "proportional" ? "percent of the window" : "business days before internal submit";
  return (
    <Region name="schedule-rules" className="section">
      <div className="form-grid">
        <div className="field span-6">
          <span className="label">Scheduling mode</span>
          <div className="seg" role="group" aria-label="Scheduling mode">
            <Button on={draft.mode === "proportional"} onClick={() => setDraft({ ...draft, mode: "proportional" })}>Proportional</Button>
            <Button on={draft.mode === "fixed"} onClick={() => setDraft({ ...draft, mode: "fixed" })}>Fixed offsets</Button>
          </div>
          <span className="hint">{draft.mode === "proportional" ? "Each milestone sits at a share of the window from kickoff to internal submit." : "Each milestone sits a set number of business days before internal submit."}</span>
        </div>
        <div className="field span-6">
          <span className="label">Internal submit buffer</span>
          <div className="row">
            <Checkbox checked={draft.bufferEnabled} onValue={value => setDraft({ ...draft, bufferEnabled: value })}>Submit internally ahead of the due date</Checkbox>
            <span style={{ width: 88 }}><NumberInput aria-label="Buffer in business days" min={1} max={10} disabled={!draft.bufferEnabled} value={draft.bufferDays} onValue={value => setDraft({ ...draft, bufferDays: value ?? 1 })} /></span>
            <span className="caption">business days</span>
          </div>
        </div>
        {(["storyboards", "pink", "red", "gold"] as const).map(key => (
          <Field key={key} className="span-3" label={key === "storyboards" ? "Storyboards due" : `${key[0].toUpperCase()}${key.slice(1)} team review`} hint={unit}>
            {id => <NumberInput id={id} min={0} max={draft.mode === "proportional" ? 99 : 250} value={values[key]} onValue={value => position(key, value)} />}
          </Field>
        ))}
        {(["pink", "red", "gold"] as const).map(key => (
          <Field key={key} className="span-3" label={`${key[0].toUpperCase()}${key.slice(1)} session length`} hint="business days, at least 1">
            {id => <NumberInput id={id} min={1} max={5} value={draft.reviewDays[key]} onValue={value => setDraft({ ...draft, reviewDays: { ...draft.reviewDays, [key]: value ?? 1 } })} />}
          </Field>
        ))}
      </div>
      {!order ? <p role="alert" className="strong">{draft.mode === "proportional" ? "The percentages have to rise from storyboards to Gold and stay under 100." : "The offsets have to fall from storyboards to Gold, and Gold needs at least 1."}</p> : null}

      <div className="stack">
        <h3 className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="calendar" size={16} /><span>Company holidays and blackout days</span></h3>
        <p className="caption">Weekends and United States federal holidays are already skipped, with Saturday holidays observed on Friday and Sunday holidays on Monday.</p>
        {draft.blackouts.length ? (
          <div className="table-wrap">
            <table className="dense" data-table="blackouts">
              <thead><tr><th>Date</th><th>Label</th><th>Actions</th></tr></thead>
              <tbody>
                {[...draft.blackouts].sort((a, b) => (a.date < b.date ? -1 : 1)).map(entry => (
                  <tr key={entry.date}><td className="mono-cell">{formatDate(entry.date)}</td><td>{entry.label || "Company blackout"}</td>
                    <td><Button variant="quiet" icon="delete" onClick={() => setDraft({ ...draft, blackouts: draft.blackouts.filter(item => item.date !== entry.date) })}>Remove</Button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="form-grid">
          <Field label="Blackout date" className="span-3">{id => <DateInput id={id} value={blackoutDate} onValue={setBlackoutDate} />}</Field>
          <Field label="Label" className="span-4">{id => <TextInput id={id} value={blackoutLabel} onValue={setBlackoutLabel} maxLength={80} placeholder="Company holiday" />}</Field>
          <div className="field span-3"><span className="label">Add</span><Button icon="add" disabled={!isISODate(blackoutDate)} onClick={() => { setDraft({ ...draft, blackouts: [...draft.blackouts.filter(item => item.date !== blackoutDate), { date: blackoutDate, label: blackoutLabel.trim() }] }); setBlackoutDate(""); setBlackoutLabel(""); }}>Add blackout day</Button></div>
        </div>
      </div>

      <dl className="spec">
        <dt>Review session</dt><dd>At least {days(MINIMUMS.reviewDays)}</dd>
        <dt>Pink and Red recovery</dt><dd>At least {days(MINIMUMS.recoveryDays)} each</dd>
        <dt>Final production</dt><dd>At least {days(MINIMUMS.productionDays)}, ending the business day before internal submit</dd>
        <dt>Drafting before Pink</dt><dd>{days(MINIMUMS.draftDays)} (working default). With less, the recommended compressed plan folds Pink into Red.</dd>
      </dl>
      <div className="row">
        <Button variant="primary" icon="check" disabled={!order || !dirty} onClick={() => actions.changeSettings(normalizeSettings(draft), "Planning rules changed")} data-action="apply-rules">Apply rules and re-plan</Button>
        <Button onClick={() => setDraft(structuredClone({ ...DEFAULT_SETTINGS, blackouts: draft.blackouts }))}>Reset to defaults</Button>
      </div>
    </Region>
  );
}
