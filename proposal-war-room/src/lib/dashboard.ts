// What the dashboard shows that no single module owns: the list of things that need attention today, the data
// behind the status email, and the checks that keep that email in Astrion voice. No model is needed for the list.

import { businessDaysBetween, daysBetween, formatDate } from "./calendar.ts";
import type { ISODate } from "./calendar.ts";
import { coverageOf, goldGate, naMissingReason } from "./compliance.ts";
import { formatTime } from "./exports.ts";
import { personName, timeZoneLabel } from "./model.ts";
import type { Pursuit } from "./model.ts";
import { overdueByOwner } from "./outline.ts";
import { allVolumeBudgets, formatPages } from "./pagebudget.ts";
import { planPursuit } from "./pursuit-ops.ts";
import { calendarFor, milestoneDef, nextMilestone } from "./scheduler.ts";

export interface AttentionItem {
  key: string;
  text: string;
  /** The screen that fixes it. */
  route: "setup" | "schedule" | "outline" | "budget" | "compliance" | "parser" | "team";
  action: string;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const bd = (count: number): string => plural(count, "business day", "business days");

/** Everything that needs a decision or an action today, most serious first. Computed from the pursuit alone. */
export function needsAttention(pursuit: Pursuit, today: ISODate): AttentionItem[] {
  const items: AttentionItem[] = [];
  const calendar = calendarFor(pursuit.schedule.settings);

  for (const budget of allVolumeBudgets(pursuit)) {
    if (budget.status === "Over" && budget.limit !== null) {
      items.push({ key: `over:${budget.volume.id}`, route: "budget", action: "Open page budget", text: `${budget.volume.name} is ${plural(Number(formatPages(budget.current - budget.limit)), "page", "pages")} over its ${budget.limit}-page limit.` });
    }
  }

  if (!pursuit.dueDate) {
    items.push({ key: "no-due", route: "setup", action: "Open pursuit setup", text: "The proposal has no due date, so nothing is scheduled." });
  } else {
    const plan = planPursuit(pursuit, today);
    if (plan) {
      const errors = plan.issues.filter(issue => issue.severity === "error");
      if (plan.needsCompression && !plan.used) {
        items.push({ key: "plan", route: "schedule", action: "Open schedule", text: plan.options.length ? `The standard schedule does not fit ${bd(plan.windowDays)}. Choose a compressed plan.` : `No review plan fits ${bd(plan.windowDays)}. Unlock a date or ask for more time.` });
      } else if (errors.length) {
        items.push({ key: "conflicts", route: "schedule", action: "Open schedule", text: `${plural(errors.length, "schedule conflict needs", "schedule conflicts need")} a decision.` });
      }
      const next = nextMilestone(pursuit.schedule.milestones, today, calendar);
      if (next && next.businessDays <= 2) {
        items.push({ key: "next", route: "schedule", action: "Open schedule", text: next.businessDays === 0 ? `${next.label} is today.` : `${next.label} is in ${bd(next.businessDays)}, on ${formatDate(next.milestone.start)}.` });
      }
      const gate = goldGate(pursuit);
      const gold = pursuit.schedule.milestones.find(item => item.id === "gold" && !item.dropped);
      if (gold && gate.total && !gate.ready) {
        const away = businessDaysBetween(today, gold.start, calendar);
        if (away >= 0 && away <= 3) items.push({ key: "gate", route: "compliance", action: "Open compliance matrix", text: `Gold team review is ${away === 0 ? "today" : `in ${bd(away)}`} and the readiness gate is not met: ${gate.open} Open, ${gate.gap} Gap.` });
      }
    }
  }

  for (const budget of allVolumeBudgets(pursuit)) {
    if (budget.status === "Near limit") items.push({ key: `near:${budget.volume.id}`, route: "budget", action: "Open page budget", text: `${budget.volume.name} is at ${budget.percent}% of its page limit.` });
    if (budget.overAllocatedBy > 0) items.push({ key: `alloc:${budget.volume.id}`, route: "budget", action: "Open page budget", text: `${budget.volume.name} sections are allocated ${plural(Number(formatPages(budget.overAllocatedBy)), "page", "pages")} more than its limit.` });
  }

  for (const group of overdueByOwner(pursuit, today)) {
    const owner = personName(pursuit, group.ownerId);
    items.push({ key: `overdue:${group.ownerId}`, route: "outline", action: "Open outline", text: owner ? `${owner} has ${plural(group.nodes.length, "overdue section", "overdue sections")}.` : `${plural(group.nodes.length, "overdue section has", "overdue sections have")} no owner.` });
  }

  const coverage = coverageOf(pursuit.requirements);
  const gate = goldGate(pursuit);
  if (coverage.gap) items.push({ key: "gaps", route: "compliance", action: "Open compliance matrix", text: `${plural(coverage.gap, "compliance item is a Gap", "compliance items are Gaps")}.` });
  if (gate.unmapped) items.push({ key: "unmapped", route: "compliance", action: "Open compliance matrix", text: `${plural(gate.unmapped, "Section L requirement maps", "Section L requirements map")} to no section.` });
  if (gate.untraced) items.push({ key: "untraced", route: "compliance", action: "Open compliance matrix", text: `${plural(gate.untraced, "Section M factor or subfactor traces", "Section M factors or subfactors trace")} to no section.` });
  const noReason = pursuit.requirements.filter(naMissingReason).length;
  if (noReason) items.push({ key: "na", route: "compliance", action: "Open compliance matrix", text: `${plural(noReason, "item is marked N/A with no reason", "items are marked N/A with no reason")}.` });

  const unresolved = pursuit.conflicts.filter(conflict => !conflict.resolved).length;
  if (unresolved) items.push({ key: "rfp-conflicts", route: "parser", action: "Open parser", text: `${plural(unresolved, "conflict in the solicitation is", "conflicts in the solicitation are")} unresolved.` });

  const openQuestions = pursuit.questions.filter(question => question.status === "Open").length;
  if (openQuestions && pursuit.qaDeadline) {
    const away = businessDaysBetween(today, pursuit.qaDeadline, calendar);
    if (away < 0) items.push({ key: "qa", route: "parser", action: "Open parser", text: `The Q&A deadline passed on ${formatDate(pursuit.qaDeadline)} with ${plural(openQuestions, "question", "questions")} still open.` });
    else if (away <= 3) items.push({ key: "qa", route: "parser", action: "Open parser", text: `The Q&A deadline is ${away === 0 ? "today" : `in ${bd(away)}`} and ${plural(openQuestions, "question is", "questions are")} not submitted.` });
  }

  const unowned = pursuit.outline.filter(node => !node.ownerId).length;
  if (unowned && pursuit.outline.length) items.push({ key: "unowned", route: "outline", action: "Open outline", text: `${plural(unowned, "section has", "sections have")} no owner.` });
  return items;
}

/** The facts the status email is written from. Field names are plain words because the model reads them. */
export function statusPayload(pursuit: Pursuit, today: ISODate): Record<string, unknown> {
  const calendar = calendarFor(pursuit.schedule.settings);
  const plan = planPursuit(pursuit, today);
  const next = nextMilestone(pursuit.schedule.milestones, today, calendar);
  const coverage = coverageOf(pursuit.requirements);
  const gate = goldGate(pursuit);
  const internal = pursuit.schedule.milestones.find(item => item.id === "internalSubmit");
  return {
    pursuit_name: pursuit.name,
    agency: pursuit.agency || null,
    solicitation_number: pursuit.solicitationNumber || null,
    today,
    sender_name: pursuit.proposalManager || null,
    due: pursuit.dueDate ? {
      date: formatDate(pursuit.dueDate), time: `${formatTime(pursuit.dueTime)} ${timeZoneLabel(pursuit.timeZone)}`,
      business_days_remaining: businessDaysBetween(today, pursuit.dueDate, calendar), calendar_days_remaining: daysBetween(today, pursuit.dueDate),
    } : null,
    internal_submit_date: internal ? formatDate(internal.start) : null,
    next_milestone: next ? { name: next.label, date: formatDate(next.milestone.start), business_days_away: next.businessDays } : null,
    schedule: {
      compressed_plan_in_force: pursuit.schedule.compression?.title ?? null,
      conflicts: plan ? plan.issues.filter(issue => issue.severity === "error").map(issue => issue.message).slice(0, 6) : [],
      locked_milestones: pursuit.schedule.milestones.filter(item => item.locked && !item.dropped).map(item => `${milestoneDef(item.id).label}, ${formatDate(item.start)}`),
    },
    page_budget: allVolumeBudgets(pursuit).map(budget => ({ volume: budget.volume.name, page_limit: budget.limit, current_pages: Number(formatPages(budget.current)), percent_of_limit: budget.percent, status: budget.status })),
    compliance: {
      total_items: coverage.total, open: coverage.open, gap: coverage.gap, addressed: coverage.addressed, verified_compliant: coverage.verified, not_applicable: coverage.na,
      coverage_percent: coverage.percent, section_l_requirements_mapped_to_no_section: gate.unmapped, section_m_factors_traced_to_no_section: gate.untraced, gold_team_ready: gate.ready,
    },
    overdue_sections: overdueByOwner(pursuit, today).slice(0, 8).map(group => ({ owner: personName(pursuit, group.ownerId) || "No owner", sections: group.nodes.slice(0, 6).map(entry => ({ title: entry.node.title, was_due: formatDate(entry.due) })) })),
    questions_for_contracting_officer: { open: pursuit.questions.filter(question => question.status === "Open").length, qa_deadline: pursuit.qaDeadline ? formatDate(pursuit.qaDeadline) : null },
    needs_attention_today: needsAttention(pursuit, today).map(item => item.text).slice(0, 10),
  };
}

export function statusRequest(pursuit: Pursuit, today: ISODate): Record<string, unknown> {
  return { contract_version: "proposal-assist-v1", action: "status_update", data: statusPayload(pursuit, today) };
}

export interface StatusEmail { subject: string; body: string; cleaned: string[] }

const PICTOGRAPH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{FE0F}\u{200D}]/gu;

/** What in a draft breaks the Astrion voice rules. An empty list is a clean draft. */
export function emailProblems(subject: string, body: string): string[] {
  const whole = `${subject}\n${body}`;
  const problems: string[] = [];
  if (/[—–]/.test(whole)) problems.push("em or en dash");
  if (/!/.test(whole)) problems.push("exclamation point");
  if (PICTOGRAPH.test(whole) || /[•·✓✔✗]/.test(whole)) problems.push("emoji, icon or symbol");
  PICTOGRAPH.lastIndex = 0;
  if (/\bASTRION\b/.test(whole)) problems.push("ASTRION in capitals");
  if (/[.\s]$/.test(subject) && subject.trim()) problems.push("subject ends in a period");
  if (/(\*\*|^#{1,6}\s|`)/m.test(whole)) problems.push("Markdown");
  return problems;
}

/**
 * Splits a draft into subject and body and enforces the voice rules that can be checked by machine: no em or en
 * dashes, no exclamation points, no emoji or symbols, Astrion in mixed case, plain text, no period on the subject.
 * The model is asked for all of this. This makes sure of it.
 */
export function cleanEmail(draft: string): StatusEmail {
  let text = draft.replace(/\r\n?/g, "\n").trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence) text = fence[1].trim();
  const lines = text.split("\n");
  let subject = "";
  const subjectLine = lines.findIndex(line => /^\s*\**subject\**\s*:/i.test(line));
  if (subjectLine >= 0 && subjectLine <= 2) {
    subject = lines[subjectLine].replace(/^\s*\**subject\**\s*:\s*/i, "");
    lines.splice(0, subjectLine + 1);
  } else {
    subject = lines.shift() ?? "";
  }
  let body = lines.join("\n").trim();
  const before = emailProblems(subject.trim(), body);
  const tidy = (value: string): string => value
    .replace(/\*\*|__|`/g, "").replace(/^#{1,6}\s+/gm, "")
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/^[ \t]*[•·▪●✓✔✗*][ \t]+/gm, "- ")
    .replace(PICTOGRAPH, "").replace(/[•·✓✔✗]/g, "")
    .replace(/!+/g, ".").replace(/\bASTRION\b/g, "Astrion")
    .replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",").replace(/,\s*\./g, ".").replace(/\.{2,}(?!\.)/g, ".").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  subject = tidy(subject).replace(/\n/g, " ").trim().replace(/[.\s]+$/, "");
  body = tidy(body).trim();
  return { subject, body, cleaned: before };
}

/** A plain status email built from the same facts with no model, for when Claude is not available. */
export function templateEmail(pursuit: Pursuit, today: ISODate): StatusEmail {
  const calendar = calendarFor(pursuit.schedule.settings);
  const next = nextMilestone(pursuit.schedule.milestones, today, calendar);
  const coverage = coverageOf(pursuit.requirements);
  const gate = goldGate(pursuit);
  const attention = needsAttention(pursuit, today);
  const budgets = allVolumeBudgets(pursuit);
  const lines: string[] = ["Team,", ""];
  if (pursuit.dueDate) {
    const days = businessDaysBetween(today, pursuit.dueDate, calendar);
    lines.push(`${pursuit.name} is due ${formatDate(pursuit.dueDate)} at ${formatTime(pursuit.dueTime)} ${timeZoneLabel(pursuit.timeZone)}. That is ${days >= 0 ? `${bd(days)} from today` : `${bd(-days)} ago`}.`);
  } else lines.push(`${pursuit.name} has no due date set.`);
  if (next) lines.push(next.businessDays === 0 ? `${next.label} is today.` : `Next is ${next.label} on ${formatDate(next.milestone.start)}, in ${bd(next.businessDays)}.`);
  if (budgets.length) {
    lines.push("", "Page budget:");
    for (const budget of budgets) lines.push(`- ${budget.volume.name}: ${budget.limit === null ? `${formatPages(budget.current)} pages, no limit` : `${formatPages(budget.current)} of ${formatPages(budget.limit)} pages, ${budget.percent}%, ${budget.status}`}`);
  }
  if (coverage.total) lines.push("", `Compliance: ${coverage.percent ?? 0}% covered. ${coverage.open} Open, ${coverage.gap} Gap. Gold team gate: ${gate.ready ? "Ready" : "Not ready"}.`);
  if (attention.length) {
    lines.push("", "Needs attention today:");
    for (const item of attention.slice(0, 8)) lines.push(`- ${item.text}`);
  } else lines.push("", "Nothing needs attention today.");
  if (pursuit.proposalManager) lines.push("", pursuit.proposalManager);
  const subject = pursuit.dueDate ? `${pursuit.name} status: ${bd(Math.max(0, businessDaysBetween(today, pursuit.dueDate, calendar)))} to due` : `${pursuit.name} status`;
  return cleanEmail(`Subject: ${subject}\n\n${lines.join("\n")}`);
}
