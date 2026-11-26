import { useState } from "react";
import { AssistError, callAssist } from "../data/cloud.ts";
import { businessDaysBetween, daysBetween, formatDate } from "../lib/calendar.ts";
import { coverageByVolume, coverageOf, goldGate } from "../lib/compliance.ts";
import { cleanEmail, needsAttention, statusRequest, templateEmail } from "../lib/dashboard.ts";
import type { StatusEmail } from "../lib/dashboard.ts";
import { formatTime } from "../lib/exports.ts";
import { personName, timeZoneLabel } from "../lib/model.ts";
import { overdueByOwner } from "../lib/outline.ts";
import { allVolumeBudgets, formatPages } from "../lib/pagebudget.ts";
import { calendarFor, nextMilestone } from "../lib/scheduler.ts";
import { useApp, usePursuit } from "../state.tsx";
import { Button, CountdownBlock, Dialog, Icon, Region, StatusWord, useToast } from "../ui/kit.tsx";

export function Dashboard({ go }: { go: (route: string) => void }) {
  const { pursuit, today } = usePursuit();
  const [drafting, setDrafting] = useState(false);
  const calendar = calendarFor(pursuit.schedule.settings);
  const next = nextMilestone(pursuit.schedule.milestones, today, calendar);
  const toDue = pursuit.dueDate ? businessDaysBetween(today, pursuit.dueDate, calendar) : null;
  const budgets = allVolumeBudgets(pursuit);
  const coverage = coverageOf(pursuit.requirements);
  const volumes = coverageByVolume(pursuit);
  const gate = goldGate(pursuit);
  const attention = needsAttention(pursuit, today);
  const overdue = overdueByOwner(pursuit, today);
  const questions = pursuit.questions.filter(question => question.status === "Open");

  return (
    <div className="page" data-view="dashboard">
      <header className="page-head">
        <h1 className="page-title" data-value="pursuit-name">{pursuit.name}</h1>
        <p className="mono muted" data-value="solicitation">{[pursuit.solicitationNumber ? `Solicitation ${pursuit.solicitationNumber}` : "No solicitation number", pursuit.agency].filter(Boolean).join(" / ")}</p>
      </header>

      <div className="grid cols-3">
        <Region name="dash-due" className="panel">
          <div className="panel-head"><h2 className="panel-title"><Icon name="deadline" /><span>Due date</span></h2></div>
          {pursuit.dueDate && toDue !== null ? (
            <>
              <CountdownBlock name="due" value={String(Math.max(0, toDue))} caption={toDue < 0 ? "The due date has passed" : toDue === 1 ? "Business day to the due date" : "Business days to the due date"} />
              <p className="caption" data-value="due">{formatDate(pursuit.dueDate)}, {formatTime(pursuit.dueTime)} {timeZoneLabel(pursuit.timeZone)}. {daysBetween(today, pursuit.dueDate) >= 0 ? `${daysBetween(today, pursuit.dueDate)} calendar days.` : ""}</p>
            </>
          ) : (
            <><p className="muted">No due date yet. Set it and the schedule is planned back from it.</p><div className="row"><Button variant="primary" icon="rfp" iconSize={20} onClick={() => go("setup")}>Open pursuit setup</Button></div></>
          )}
        </Region>
        <Region name="dash-next" ion className="panel">
          <div className="panel-head"><h2 className="panel-title"><Icon name="milestone" size={16} /><span>Next milestone</span></h2></div>
          {next ? (
            <>
              <CountdownBlock name="next-milestone" signal value={String(next.businessDays)} caption={next.businessDays === 0 ? `${next.milestone.id === "due" ? "The due date" : next.label} is today` : next.caption} />
              <p className="caption" data-countdown-text>{next.text}, {formatDate(next.milestone.start)}.</p>
            </>
          ) : <p className="muted">{pursuit.dueDate ? "Every milestone on this schedule has passed." : "Nothing is scheduled yet."}</p>}
          <div className="row"><Button icon="schedule" iconSize={20} onClick={() => go("schedule")}>Open schedule</Button></div>
        </Region>
        <Region name="dash-gate" className="panel">
          <div className="panel-head">
            <h2 className="panel-title"><Icon name="gate-review" /><span>Gold team readiness</span></h2>
            {gate.total ? <span data-gate={gate.ready ? "ready" : "not-ready"}><StatusWord value={gate.ready ? "Ready" : "Not ready"} /></span> : null}
          </div>
          <CountdownBlock name="coverage" small value={coverage.percent === null ? "0%" : `${coverage.percent}%`} caption="Compliance coverage" />
          <p className="caption">{gate.total ? `${gate.open} Open, ${gate.gap} Gap, ${gate.unmapped} unmapped in Section L, ${gate.untraced} untraced in Section M.` : "The compliance matrix is empty."}</p>
          <div className="row"><Button icon="compliance-matrix" iconSize={20} onClick={() => go("compliance")}>Open compliance matrix</Button></div>
        </Region>
      </div>

      <Region name="dash-attention" className="section">
        <div className="section-head">
          <h2 className="panel-title"><Icon name="action-item" /><span>Needs attention today</span><span className="mono muted">{attention.length}</span></h2>
          <Button variant="primary" icon="email" onClick={() => setDrafting(true)} data-action="draft-status">Draft status update</Button>
        </div>
        {attention.length ? (
          <ul className="list-plain" data-list="attention">
            {attention.map(item => (
              <li key={item.key} data-attention={item.key}>
                <span style={{ flex: 1 }}>{item.text}</span>
                <Button variant="quiet" onClick={() => go(item.route)}>{item.action}</Button>
              </li>
            ))}
          </ul>
        ) : <p className="muted" data-list="attention-empty">Nothing needs attention today.</p>}
      </Region>

      <div className="grid cols-2">
        <Region name="dash-budget" className="section">
          <div className="section-head"><h2 className="panel-title"><Icon name="page-limit" /><span>Table 1: Page budget by volume</span></h2></div>
          {budgets.length ? (
            <div className="table-wrap">
              <table data-table="dash-budget">
                <thead><tr><th>Volume</th><th className="num">Pages</th><th className="num">Limit</th><th>Status</th></tr></thead>
                <tbody>
                  {budgets.map(budget => (
                    <tr key={budget.volume.id} data-volume={budget.volume.name}>
                      <td>{budget.volume.name}</td>
                      <td className="num mono-cell">{formatPages(budget.current)}</td>
                      <td className="num mono-cell">{budget.limit === null ? "None" : formatPages(budget.limit)}</td>
                      <td><StatusWord value={budget.status} detail={budget.percent === null ? undefined : `${budget.percent}%`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">No volumes yet.</p>}
        </Region>
        <Region name="dash-coverage" className="section">
          <div className="section-head"><h2 className="panel-title"><Icon name="compliance-matrix" /><span>Figure 1: Compliance coverage by volume</span></h2></div>
          {volumes.length ? (
            <div className="bar-chart" data-chart="dash-coverage">
              {volumes.map(row => (
                <div className="bar-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar-track" role="img" aria-label={`${row.label}: ${row.covered} of ${row.applicable} addressed or verified`}><div className="bar-fill" style={{ width: `${row.percent ?? 0}%` }} /></div>
                  <span className="bar-value">{row.percent === null ? "No items" : `${row.percent}%, ${row.covered} of ${row.applicable}`}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No requirements yet.</p>}
        </Region>
      </div>

      <div className="grid cols-2">
        <Region name="dash-overdue" className="section">
          <div className="section-head"><h2 className="panel-title"><Icon name="owner" /><span>Table 2: Overdue sections by owner</span></h2></div>
          {overdue.length ? (
            <div className="table-wrap">
              <table className="dense" data-table="dash-overdue">
                <thead><tr><th>Owner</th><th>Section</th><th>Was due</th><th>Status</th></tr></thead>
                <tbody>
                  {overdue.flatMap(group => group.nodes.map((entry, index) => (
                    <tr key={entry.node.id}>
                      <td>{index === 0 ? <span className="strong">{personName(pursuit, group.ownerId) || "No owner"}</span> : null}</td>
                      <td data-user-text>{entry.node.title}</td>
                      <td className="mono-cell">{formatDate(entry.due)}</td>
                      <td><StatusWord value={entry.node.status} /></td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">No section is overdue.</p>}
        </Region>
        <Region name="dash-questions" className="section">
          <div className="section-head">
            <h2 className="panel-title"><Icon name="question" /><span>Open questions for the CO</span><span className="mono muted">{questions.length}</span></h2>
            <span className="mono muted">{pursuit.qaDeadline ? `Q&A deadline ${formatDate(pursuit.qaDeadline)}` : "No Q&A deadline"}</span>
          </div>
          {questions.length ? (
            <ul className="list-plain" data-list="questions">
              {questions.slice(0, 6).map(question => <li key={question.id}><span className="mono-value" style={{ minWidth: 72 }}>{question.ref || "No ref"}</span><span data-user-text>{question.question}</span></li>)}
            </ul>
          ) : <p className="muted">No open questions.</p>}
          {questions.length > 6 ? <p className="caption">{questions.length - 6} more on the parser screen.</p> : null}
        </Region>
      </div>

      {drafting ? <StatusDialog onClose={() => setDrafting(false)} /> : null}
    </div>
  );
}

function StatusDialog({ onClose }: { onClose: () => void }) {
  const { pursuit, today } = usePursuit();
  const app = useApp();
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [email, setEmail] = useState<StatusEmail | null>(null);
  const [source, setSource] = useState<"claude" | "template">("claude");
  const [error, setError] = useState("");

  const draft = async () => {
    setState("busy");
    setError("");
    try {
      const reply = await callAssist(statusRequest(pursuit, today));
      setEmail(cleanEmail(reply.text));
      setSource("claude");
      setState("done");
    } catch (cause) {
      setError(cause instanceof AssistError || cause instanceof Error ? cause.message : "The draft could not be written.");
      setState("idle");
    }
  };
  const template = () => { setEmail(templateEmail(pursuit, today)); setSource("template"); setState("done"); setError(""); };
  const text = email ? `Subject: ${email.subject}\n\n${email.body}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Status update copied"); }
    catch { toast("Copy did not work", "Select the text and copy it by hand."); }
  };

  return (
    <Dialog name="status-update" title="Draft status update" icon="email" onClose={onClose} wide
      footer={email ? (
        <>
          <Button onClick={onClose}>Close</Button>
          <Button icon="refresh" disabled={state === "busy"} onClick={() => void draft()}>Draft again</Button>
          <a className="btn" href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`} data-action="mailto"><Icon name="email" size={16} /><span>Open in mail app</span></a>
          <Button variant="primary" icon="copy" onClick={() => void copy()} data-action="copy-email">Copy text</Button>
        </>
      ) : (
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={template} data-action="template-email">Use the plain template</Button>
          <Button variant="primary" icon="agent" iconSize={20} disabled={state === "busy"} onClick={() => void draft()} data-action="write-email">{state === "busy" ? "Writing" : "Write with Claude"}</Button>
        </>
      )}>
      {email ? (
        <>
          <dl className="spec"><dt>Subject</dt><dd data-email="subject" data-user-text>{email.subject}</dd></dl>
          <div className="email-draft" data-email="body" data-user-text>{email.body}</div>
          <p className="caption" data-email="source">{source === "claude" ? "Written by Claude from the figures on this dashboard. Read it before you send it." : "Built from the figures on this dashboard with no model."}{email.cleaned.length ? ` Removed from the draft: ${email.cleaned.join(", ")}.` : ""}</p>
        </>
      ) : (
        <>
          <p>Claude writes a short status email from the figures on this dashboard: the countdown, the next milestone, page budgets, compliance counts, overdue sections and what needs attention today. It is plain text in Astrion voice. Only those figures and names are sent, never the requirement text.</p>
          {app.mode === "device" ? <p className="caption" data-notice="device-mode">This pursuit is saved on this device only. Sign in to use Claude, or use the plain template.</p> : null}
          {error ? <div className="notice" role="alert" data-notice="email-error"><div className="notice-head"><Icon name="issue" /><span>The draft was not written</span></div><p>{error}</p></div> : null}
        </>
      )}
    </Dialog>
  );
}
