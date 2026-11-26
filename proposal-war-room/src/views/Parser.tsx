import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AssistError, callAssist } from "../data/cloud.ts";
import { formatDate } from "../lib/calendar.ts";
import { formatTime } from "../lib/exports.ts";
import { docxToText, pdfItemsToText } from "../lib/extract.ts";
import type { PdfTextItem } from "../lib/extract.ts";
import { REQ_TYPES, timeZoneLabel } from "../lib/model.ts";
import type { ReqType } from "../lib/model.ts";
import { applyParse, dueDateCandidate, previewApply, questionsDateCandidate, runParse, SAMPLE_EXCERPT, splitIntoParts, timeZoneFor } from "../lib/parser.ts";
import type { ApplyPlan, ParsedOutlineItem, ParseResult, ParseRun } from "../lib/parser.ts";
import { useScheduleActions } from "../schedule-actions.tsx";
import { useApp, usePursuit } from "../state.tsx";
import { Button, Checkbox, Dialog, Field, Icon, NumberInput, Region, Select, StatusWord, TextArea, TextInput, useToast } from "../ui/kit.tsx";

/* ---------- The parser's working state lives above the views, so leaving the screen does not lose a review ---------- */

type Marked<T> = T & { _id: string; _on: boolean };
interface Review {
  volumes: Marked<ParseResult["volumes"][number]>[];
  format_rules: Marked<ParseResult["format_rules"][number]>[];
  outline: Marked<Omit<ParsedOutlineItem, "children"> & { children: Marked<ParsedOutlineItem>[] }>[];
  requirements: Marked<ParseResult["requirements"][number]>[];
  evaluation_factors: Marked<ParseResult["evaluation_factors"][number]>[];
  key_dates: Marked<ParseResult["key_dates"][number]>[];
  conflicts: Marked<ParseResult["conflicts"][number]>[];
  questions_for_co: Marked<ParseResult["questions_for_co"][number]>[];
}
type Kind = keyof Review;

interface Session {
  text: string;
  run: ParseRun | null;
  review: Review | null;
  applied: ApplyPlan | null;
}
const SessionContext = createContext<{ session: Session; setSession: (change: (session: Session) => Session) => void } | null>(null);

export function ParserSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session>({ text: "", run: null, review: null, applied: null });
  const value = useMemo(() => ({ session, setSession: (change: (session: Session) => Session) => setSessionState(change) }), [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

let counter = 0;
const mark = <T,>(item: T): Marked<T> => ({ ...item, _id: `r${(counter += 1)}`, _on: true });
const toReview = (result: ParseResult): Review => ({
  volumes: result.volumes.map(mark), format_rules: result.format_rules.map(mark),
  outline: result.outline.map(item => mark({ ...item, children: item.children.map(mark) })),
  requirements: result.requirements.map(mark), evaluation_factors: result.evaluation_factors.map(mark), key_dates: result.key_dates.map(mark),
  conflicts: result.conflicts.map(mark), questions_for_co: result.questions_for_co.map(mark),
});
const strip = <T extends { _id: string; _on: boolean }>({ _id, _on, ...rest }: T): Omit<T, "_id" | "_on"> => { void _id; void _on; return rest; };
const toSelection = (review: Review): ParseResult => ({
  volumes: review.volumes.filter(item => item._on).map(strip),
  format_rules: review.format_rules.filter(item => item._on).map(strip),
  outline: review.outline.filter(item => item._on).map(item => ({ ...strip(item), children: item.children.filter(child => child._on).map(child => ({ ...strip(child), children: [] })) })),
  requirements: review.requirements.filter(item => item._on).map(strip),
  evaluation_factors: review.evaluation_factors.filter(item => item._on).map(strip),
  key_dates: review.key_dates.filter(item => item._on).map(strip),
  conflicts: review.conflicts.filter(item => item._on).map(strip),
  questions_for_co: review.questions_for_co.filter(item => item._on).map(strip),
});

async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".docx")) return docxToText(bytes);
  if (name.endsWith(".pdf")) {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: bytes });
    const document = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(pdfItemsToText(content.items as PdfTextItem[]));
    }
    await task.destroy();
    return pages.join("\n\n");
  }
  if (/\.(txt|md|text)$/.test(name) || file.type.startsWith("text/")) return new TextDecoder().decode(bytes);
  throw new Error("Upload a PDF, a Word .docx file or a text file.");
}

export function Parser({ go }: { go: (route: string) => void }) {
  const context = useContext(SessionContext);
  if (!context) throw new Error("The parser needs its session provider");
  const { session, setSession } = context;
  const { pursuit, update, today } = usePursuit();
  const app = useApp();
  const actions = useScheduleActions();
  const toast = useToast();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [merge, setMerge] = useState<{ selection: ParseResult; plan: ApplyPlan } | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [setDue, setSetDue] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parts = useMemo(() => splitIntoParts(session.text), [session.text]);
  const review = session.review;

  const start = async () => {
    setError("");
    abort.current = new AbortController();
    const signal = abort.current.signal;
    setBusy({ done: 0, total: parts.length });
    try {
      const run = await runParse(session.text, async request => callAssist({ ...request }, signal), (done, total) => setBusy({ done, total }));
      setSession(current => ({ ...current, run, review: toReview(run.result), applied: null }));
      setSetDue(true);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof AssistError || cause instanceof Error ? cause.message : "The parser could not finish.");
      }
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const text = (await fileToText(file)).trim();
      if (!text) throw new Error("No text could be read from that file. A scanned PDF has to be run through text recognition first.");
      setSession(current => ({ ...current, text: current.text.trim() ? `${current.text.trim()}\n\n${text}` : text }));
      toast("File read", `${file.name}: ${text.length.toLocaleString("en-US")} characters added to the text box.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const finish = (selection: ParseResult, keys: ReadonlySet<string>) => {
    let plan: ApplyPlan | null = null;
    update(current => { const result = applyParse(current, selection, { confirmed: keys, today, nowISO: new Date().toISOString() }); plan = result.plan; return result.pursuit; });
    const due = dueDateCandidate(selection.key_dates);
    const questions = questionsDateCandidate(selection.key_dates);
    if (questions && !pursuit.qaDeadline) update(current => ({ ...current, qaDeadline: questions.date }));
    if (due && setDue && due.date) {
      const zone = timeZoneFor(due.time_zone);
      update(current => ({ ...current, dueTime: due.time || current.dueTime, timeZone: zone || current.timeZone }));
      actions.requestDueDate(due.date);
    }
    setMerge(null);
    setSession(current => ({ ...current, run: null, review: null, applied: plan }));
    toast("Parser results applied", "The outline, page limits, format rules and compliance rows are in the pursuit.");
  };

  const apply = () => {
    if (!review) return;
    const selection = toSelection(review);
    const plan = previewApply(pursuit, selection, today);
    if (plan.hasExisting) { setConfirmed(new Set()); setMerge({ selection, plan }); }
    else finish(selection, new Set());
  };

  const patch = <K extends Kind>(kind: K, id: string, change: Partial<Review[K][number]>) => setSession(current => (current.review
    ? { ...current, review: { ...current.review, [kind]: current.review[kind].map(item => (item._id === id ? { ...item, ...change } : item)) } }
    : current));
  const patchChild = (parentId: string, id: string, change: Partial<Marked<ParsedOutlineItem>>) => setSession(current => (current.review
    ? { ...current, review: { ...current.review, outline: current.review.outline.map(item => (item._id === parentId ? { ...item, children: item.children.map(child => (child._id === id ? { ...child, ...change } : child)) } : item)) } }
    : current));
  const setAll = (kind: Kind, on: boolean) => setSession(current => (current.review ? { ...current, review: { ...current.review, [kind]: current.review[kind].map(item => ({ ...item, _on: on })) } } : current));

  /* ---------- Review ---------- */
  if (review && session.run) {
    const run = session.run;
    const failed = run.parts.filter(part => !part.ok);
    const selection = toSelection(review);
    const picked = Object.values(selection).reduce((total, list) => total + list.length, 0) + selection.outline.reduce((total, item) => total + item.children.length, 0);
    const due = dueDateCandidate(selection.key_dates);
    const head = (kind: Kind, title: string, icon: Parameters<typeof Icon>[0]["name"], count: number, size: 16 | 20 = 20) => (
      <div className="section-head">
        <h2 className="panel-title"><Icon name={icon} size={size} /><span>{title}</span><span className="mono muted">{count} found</span></h2>
        <div className="row"><Button variant="quiet" onClick={() => setAll(kind, true)}>Select all</Button><Button variant="quiet" onClick={() => setAll(kind, false)}>Select none</Button></div>
      </div>
    );
    const quote = (text: string) => (text ? <span className="cell-note quote" data-user-text>{text}</span> : null);
    return (
      <div className="page" data-view="parser-review">
        <header className="page-head">
          <h1 className="page-title">Review parser results</h1>
          <p className="page-intro">Nothing below is in the pursuit yet. Check each item against its quote, edit what needs it, clear the box on anything wrong, then apply.</p>
        </header>

        <Region name="parser-summary" className="section">
          <dl className="spec" data-spec="parser-run">
            <dt>Parts read</dt><dd data-value="parts">{run.parts.filter(part => part.ok).length} of {run.total}</dd>
            <dt>Selected</dt><dd data-value="selected">{picked} items</dd>
            {run.parts.some(part => part.attempts > 1 && part.ok) ? <><dt>Retried</dt><dd>{run.parts.filter(part => part.attempts > 1 && part.ok).length} {run.parts.filter(part => part.attempts > 1 && part.ok).length === 1 ? "part" : "parts"} returned valid JSON on the second request</dd></> : null}
          </dl>
          {failed.map(part => (
            <div className="notice" key={part.index} data-notice="parser-raw">
              <div className="notice-head"><Icon name="issue" /><span>Part {part.index + 1} did not return usable JSON after two requests</span></div>
              <p>{part.error} Nothing from this part is in the review. The reply is shown as it came back:</p>
              <pre className="pre" data-user-text>{part.raw || "No reply text."}</pre>
            </div>
          ))}
        </Region>

        {review.conflicts.length ? (
          <Region name="review-conflicts" className="section">
            {head("conflicts", "Conflicts in the solicitation", "issue", review.conflicts.length)}
            <div className="table-wrap"><table data-table="review-conflicts">
              <thead><tr><th>Use</th><th>Conflict</th><th>Refs</th></tr></thead>
              <tbody>{review.conflicts.map(item => (
                <tr key={item._id}><td><Checkbox checked={item._on} label="Include this conflict" onValue={value => patch("conflicts", item._id, { _on: value })} /></td>
                  <td><TextArea aria-label="Conflict" value={item.description} onValue={value => patch("conflicts", item._id, { description: value })} data-user-text /></td>
                  <td className="mono-cell">{item.refs.join(", ")}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.volumes.length ? (
          <Region name="review-volumes" className="section">
            {head("volumes", "Volumes and page limits", "volume", review.volumes.length)}
            <div className="table-wrap"><table data-table="review-volumes">
              <thead><tr><th>Use</th><th>Volume</th><th className="num">Page limit</th><th>Excluded from the count</th><th>Ref</th></tr></thead>
              <tbody>{review.volumes.map(item => (
                <tr key={item._id} data-volume={item.name}><td><Checkbox checked={item._on} label={`Include ${item.name}`} onValue={value => patch("volumes", item._id, { _on: value })} /></td>
                  <td><TextInput aria-label="Volume name" value={item.name} onValue={value => patch("volumes", item._id, { name: value })} />{quote(item.quote)}</td>
                  <td className="num" style={{ width: 112 }}><NumberInput aria-label={`Page limit for ${item.name}`} value={item.page_limit} placeholder="None" onValue={value => patch("volumes", item._id, { page_limit: value })} /></td>
                  <td><TextInput aria-label={`Exclusions for ${item.name}`} value={item.exclusions.join("; ")} onValue={value => patch("volumes", item._id, { exclusions: value.split(";").map(entry => entry.trimStart()).filter((entry, index, all) => entry || index === all.length - 1) })} /></td>
                  <td className="mono-cell">{item.source_ref}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.format_rules.length ? (
          <Region name="review-format" className="section">
            {head("format_rules", "Format rules", "format-check", review.format_rules.length)}
            <div className="table-wrap"><table data-table="review-format">
              <thead><tr><th>Use</th><th>Rule</th><th>Ref</th></tr></thead>
              <tbody>{review.format_rules.map(item => (
                <tr key={item._id}><td><Checkbox checked={item._on} label="Include this rule" onValue={value => patch("format_rules", item._id, { _on: value })} /></td>
                  <td><TextInput aria-label="Format rule" value={item.rule} onValue={value => patch("format_rules", item._id, { rule: value })} />{quote(item.quote)}</td>
                  <td className="mono-cell">{item.source_ref}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.outline.length ? (
          <Region name="review-outline" className="section">
            {head("outline", "Proposed outline", "outline", review.outline.length)}
            <div className="table-wrap"><table data-table="review-outline">
              <thead><tr><th>Use</th><th>Volume</th><th>Section</th><th>L ref</th><th>M ref</th></tr></thead>
              <tbody>{review.outline.flatMap(item => [
                <tr key={item._id}><td><Checkbox checked={item._on} label={`Include ${item.section_title}`} onValue={value => patch("outline", item._id, { _on: value })} /></td>
                  <td style={{ width: 220 }}><Select aria-label="Volume" value={item.volume} onValue={value => patch("outline", item._id, { volume: value })} options={[...new Set([...review.volumes.map(volume => volume.name), ...pursuit.volumes.map(volume => volume.name), item.volume])].filter(Boolean).map(name => ({ value: name, label: name }))} /></td>
                  <td><TextInput aria-label="Section title" value={item.section_title} onValue={value => patch("outline", item._id, { section_title: value })} /></td>
                  <td style={{ width: 112 }}><TextInput aria-label="L reference" mono value={item.l_ref} onValue={value => patch("outline", item._id, { l_ref: value })} /></td>
                  <td style={{ width: 260 }}><TextInput aria-label="M reference" mono value={item.m_ref} onValue={value => patch("outline", item._id, { m_ref: value })} /></td></tr>,
                ...item.children.map(child => (
                  <tr key={child._id}><td><Checkbox checked={child._on && item._on} disabled={!item._on} label={`Include ${child.section_title}`} onValue={value => patchChild(item._id, child._id, { _on: value })} /></td>
                    <td className="muted">Subsection</td>
                    <td className="indent-1"><TextInput aria-label="Subsection title" value={child.section_title} onValue={value => patchChild(item._id, child._id, { section_title: value })} /></td>
                    <td><TextInput aria-label="L reference" mono value={child.l_ref} onValue={value => patchChild(item._id, child._id, { l_ref: value })} /></td>
                    <td><TextInput aria-label="M reference" mono value={child.m_ref} onValue={value => patchChild(item._id, child._id, { m_ref: value })} /></td></tr>
                )),
              ])}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.requirements.length ? (
          <Region name="review-requirements" className="section">
            {head("requirements", "Requirements", "compliance-matrix", review.requirements.length)}
            <div className="table-wrap"><table className="dense" data-table="review-requirements">
              <thead><tr><th>Use</th><th>ID</th><th>Source</th><th>Ref</th><th>Requirement, verbatim</th><th>Type</th><th>Confidence</th></tr></thead>
              <tbody>{review.requirements.map(item => (
                <tr key={item._id}><td><Checkbox checked={item._on} label={`Include ${item.id}`} onValue={value => patch("requirements", item._id, { _on: value })} /></td>
                  <td className="mono-cell">{item.id}</td>
                  <td style={{ width: 96 }}><Select aria-label="Source" value={item.source} onValue={value => patch("requirements", item._id, { source: value as "L" | "M" | "SOW" })} options={["L", "M", "SOW"].map(value => ({ value, label: value }))} /></td>
                  <td style={{ width: 104 }}><TextInput aria-label="Paragraph ref" mono value={item.ref} onValue={value => patch("requirements", item._id, { ref: value })} /></td>
                  <td><TextArea aria-label="Requirement text" value={item.text} onValue={value => patch("requirements", item._id, { text: value })} data-user-text /></td>
                  <td style={{ width: 168 }}><Select aria-label="Type" value={item.type} onValue={value => patch("requirements", item._id, { type: value as ReqType })} options={REQ_TYPES.map(value => ({ value, label: value }))} /></td>
                  <td><StatusWord value={item.confidence === "high" ? "High" : item.confidence === "medium" ? "Medium" : "Low"} /></td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.evaluation_factors.length ? (
          <Region name="review-factors" className="section">
            {head("evaluation_factors", "Evaluation factors", "cross-reference", review.evaluation_factors.length)}
            <div className="table-wrap"><table data-table="review-factors">
              <thead><tr><th>Use</th><th>Factor</th><th>Subfactors</th><th>Relative importance</th><th>Ref</th></tr></thead>
              <tbody>{review.evaluation_factors.map(item => (
                <tr key={item._id} data-factor={item.factor}><td><Checkbox checked={item._on} label={`Include ${item.factor}`} onValue={value => patch("evaluation_factors", item._id, { _on: value })} /></td>
                  <td><TextInput aria-label="Factor" value={item.factor} onValue={value => patch("evaluation_factors", item._id, { factor: value })} />{quote(item.quote)}</td>
                  <td><TextInput aria-label={`Subfactors of ${item.factor}`} value={item.subfactors.join("; ")} placeholder="None stated" onValue={value => patch("evaluation_factors", item._id, { subfactors: value.split(";").map(entry => entry.trimStart()).filter((entry, index, all) => entry || index === all.length - 1) })} /></td>
                  <td><TextInput aria-label="Relative importance" value={item.relative_importance} onValue={value => patch("evaluation_factors", item._id, { relative_importance: value })} /></td>
                  <td className="mono-cell">{item.source_ref}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.key_dates.length ? (
          <Region name="review-dates" className="section">
            {head("key_dates", "Key dates", "calendar", review.key_dates.length, 16)}
            <div className="table-wrap"><table data-table="review-dates">
              <thead><tr><th>Use</th><th>What</th><th>Date</th><th>Time</th><th>Zone</th><th>Ref</th></tr></thead>
              <tbody>{review.key_dates.map(item => (
                <tr key={item._id}><td><Checkbox checked={item._on} label="Include this date" onValue={value => patch("key_dates", item._id, { _on: value })} /></td>
                  <td><TextInput aria-label="Label" value={item.label} onValue={value => patch("key_dates", item._id, { label: value })} /></td>
                  <td className="mono-cell">{formatDate(item.date) || "Not stated"}</td><td className="mono-cell">{item.time ? formatTime(item.time) : ""}</td><td>{item.time_zone}</td><td className="mono-cell">{item.source_ref}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        {review.questions_for_co.length ? (
          <Region name="review-questions" className="section">
            {head("questions_for_co", "Questions for the contracting officer", "question", review.questions_for_co.length)}
            <div className="table-wrap"><table data-table="review-questions">
              <thead><tr><th>Use</th><th>Question</th><th>Ref</th></tr></thead>
              <tbody>{review.questions_for_co.map(item => (
                <tr key={item._id}><td><Checkbox checked={item._on} label="Include this question" onValue={value => patch("questions_for_co", item._id, { _on: value })} /></td>
                  <td><TextArea aria-label="Question" value={item.question} onValue={value => patch("questions_for_co", item._id, { question: value })} data-user-text /></td>
                  <td className="mono-cell">{item.ref}</td></tr>
              ))}</tbody>
            </table></div>
          </Region>
        ) : null}

        <Region name="parser-apply" className="panel">
          <div className="panel-head"><h2 className="panel-title"><Icon name="check" size={16} /><span>Apply to the pursuit</span></h2></div>
          {due ? (
            <div className="stack tight" data-offer="due-date">
              <Checkbox checked={setDue} onValue={setSetDue}>
                Set the due date to {formatDate(due.date)}{due.time ? `, ${formatTime(due.time)}` : ""}{due.time_zone ? ` ${timeZoneFor(due.time_zone) ? timeZoneLabel(timeZoneFor(due.time_zone)) : due.time_zone}` : ""} and plan the schedule
              </Checkbox>
              <span className="caption">{pursuit.dueDate && pursuit.dueDate !== due.date ? `The pursuit is due ${formatDate(pursuit.dueDate)} today. A different date is an amendment, and you confirm the schedule change before it applies.` : pursuit.dueDate === due.date ? "This matches the due date already set." : `From ${due.source_ref || "the text"}. The schedule is planned back from this date.`}</span>
            </div>
          ) : <p className="caption">The selected items give no proposal due date.</p>}
          <p>Applying builds the outline, page limits, format rules and compliance rows from the {picked} selected items. {pursuit.volumes.length + pursuit.outline.length + pursuit.requirements.length ? "This pursuit already holds data, so you see what would change first." : ""}</p>
          <div className="row">
            <Button variant="primary" icon="check" disabled={!picked} onClick={apply} data-action="apply-parse">Apply</Button>
            <Button icon="close" onClick={() => setSession(current => ({ ...current, run: null, review: null }))}>Discard results</Button>
          </div>
        </Region>

        {merge ? (
          <Dialog name="merge-preview" title="Merge preview" icon="amendment" wide onClose={() => setMerge(null)}
            footer={<><Button onClick={() => setMerge(null)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => finish(merge.selection, confirmed)} data-action="apply-merge">Apply merge</Button></>}>
            <p>This pursuit already holds data. New items are added, items already present are left as they are, and nothing existing changes unless you tick it below.</p>
            <dl className="spec" data-spec="merge">
              <dt>Added</dt><dd data-value="adds">{Object.entries(merge.plan.adds).filter(([, count]) => count).map(([kind, count]) => `${count} ${({ volumes: "volumes", formatRules: "format rules", sections: "sections", requirements: "requirements", factors: "factors and subfactors", keyDates: "key dates", conflicts: "conflicts", questions: "questions" } as Record<string, string>)[kind]}`).join(", ") || "Nothing new"}</dd>
              <dt>Already present</dt><dd data-value="duplicates">{merge.plan.duplicates} left as they are</dd>
            </dl>
            {merge.plan.overwrites.length ? (
              <div className="stack">
                <span className="table-caption">Table 1: Existing values the parser reads differently</span>
                <div className="table-wrap"><table data-table="overwrites">
                  <thead><tr><th>Change it</th><th>Item</th><th>In the pursuit</th><th>From the parser</th></tr></thead>
                  <tbody>{merge.plan.overwrites.map(item => (
                    <tr key={item.key}><td><Checkbox checked={confirmed.has(item.key)} label={`Change ${item.label}`} onValue={value => setConfirmed(previous => { const next = new Set(previous); if (value) next.add(item.key); else next.delete(item.key); return next; })} /></td>
                      <td>{item.label}</td><td className="mono-cell">{item.from}</td><td className="mono-cell">{item.to}</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            ) : <p className="caption">No existing value would change.</p>}
          </Dialog>
        ) : null}
      </div>
    );
  }

  /* ---------- Input ---------- */
  const applied = session.applied;
  return (
    <div className="page" data-view="parser">
      <header className="page-head">
        <h1 className="page-title">Section L/M parser</h1>
        <p className="page-intro">Paste Section L and Section M. Claude returns the volumes, page limits, format rules, requirements, evaluation factors and dates it finds, each with its paragraph reference and a quote. You review every item before any of it is written.</p>
      </header>

      {applied ? (
        <Region name="parser-applied" className="notice">
          <div className="notice-head" data-notice="applied"><Icon name="check" size={16} /><span>Results applied</span></div>
          <p>{Object.values(applied.adds).reduce((total, count) => total + count, 0)} items added and {applied.duplicates} already present.</p>
          <div className="row">
            <Button icon="outline" iconSize={20} onClick={() => go("outline")}>Open outline</Button>
            <Button icon="compliance-matrix" iconSize={20} onClick={() => go("compliance")}>Open compliance matrix</Button>
            <Button icon="page-limit" iconSize={20} onClick={() => go("budget")}>Open page budget</Button>
          </div>
        </Region>
      ) : null}

      <Region name="parser-input" className="section">
        <div className="section-head">
          <h2 className="panel-title"><Icon name="rfp" /><span>Solicitation text</span></h2>
          <div className="row">
            <Button icon="upload" disabled={reading || Boolean(busy)} onClick={() => fileInput.current?.click()}>{reading ? "Reading file" : "Upload PDF, DOCX or text"}</Button>
            <Button variant="quiet" disabled={Boolean(busy)} onClick={() => setSession(current => ({ ...current, text: SAMPLE_EXCERPT }))}>Use the sample excerpt</Button>
            <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Solicitation file" data-input="parser-file" onChange={event => void upload(event.target.files?.[0])} />
          </div>
        </div>
        <Field label="Section L and Section M text" hint={`${session.text.length.toLocaleString("en-US")} characters. ${parts.length > 1 ? `It is split at paragraph headings into ${parts.length} parts, read in order and merged.` : "It is read in one request."}`}>
          {id => <TextArea id={id} value={session.text} onValue={value => setSession(current => ({ ...current, text: value }))} style={{ minHeight: 280 }} placeholder="L.1 General instructions..." data-user-text disabled={Boolean(busy)} />}
        </Field>
        <div className="notice" data-notice="parser-caution">
          <div className="notice-head"><Icon name="info" size={16} /><span>What leaves this browser</span></div>
          <p>The text in the box goes to Claude through this workspace's server route, and nothing else does. An uploaded file is read here and only its text is used. Run released solicitation text only: nothing classified, controlled unclassified, export controlled or proprietary.</p>
        </div>
        {error ? <div className="notice" role="alert" data-notice="parser-error"><div className="notice-head"><Icon name="issue" /><span>The parser stopped</span></div><p>{error}</p></div> : null}
        {app.mode === "device" ? <p className="caption" data-notice="device-mode">This pursuit is saved on this device only. Sign in to run the parser.</p> : null}
        <div className="row">
          <Button variant="primary" icon="agent" iconSize={20} disabled={!session.text.trim() || Boolean(busy) || parts.length > 100} onClick={() => void start()} data-action="run-parser">{busy ? `Reading part ${Math.min(busy.done + 1, busy.total)} of ${busy.total}` : "Run parser"}</Button>
          {busy ? <Button icon="close" onClick={() => abort.current?.abort()}>Stop</Button> : null}
          {parts.length > 100 ? <span className="caption">That is more than 100 parts. Paste Sections L and M alone.</span> : null}
        </div>
      </Region>

      {pursuit.conflicts.length || pursuit.questions.length ? <OpenItems /> : null}
    </div>
  );
}

/** Conflicts and questions already applied to the pursuit, where they can be closed out. */
function OpenItems() {
  const { pursuit, update } = usePursuit();
  return (
    <>
      {pursuit.conflicts.length ? (
        <Region name="parser-conflicts" className="section">
          <div className="section-head"><h2 className="panel-title"><Icon name="issue" /><span>Conflicts in the solicitation</span></h2></div>
          <div className="table-wrap"><table data-table="conflicts">
            <thead><tr><th>Conflict</th><th>Refs</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>{pursuit.conflicts.map(item => (
              <tr key={item.id} className={item.resolved ? "is-muted" : undefined}>
                <td data-user-text>{item.description}</td><td className="mono-cell">{item.refs.join(", ")}</td>
                <td>{item.resolved ? <StatusWord value="Done" /> : <StatusWord value="Open" />}</td>
                <td className="nowrap"><div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                  <Button variant="quiet" icon="check" onClick={() => update(current => ({ ...current, conflicts: current.conflicts.map(entry => (entry.id === item.id ? { ...entry, resolved: !entry.resolved } : entry)) }))}>{item.resolved ? "Reopen" : "Resolve"}</Button>
                  <Button variant="quiet" icon="delete" onClick={() => update(current => ({ ...current, conflicts: current.conflicts.filter(entry => entry.id !== item.id) }))}>Remove</Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Region>
      ) : null}
      {pursuit.questions.length ? (
        <Region name="parser-questions" className="section">
          <div className="section-head"><h2 className="panel-title"><Icon name="question" /><span>Questions for the contracting officer</span></h2>
            <span className="mono muted">{pursuit.qaDeadline ? `Q&A deadline ${formatDate(pursuit.qaDeadline)}` : "No Q&A deadline set"}</span></div>
          <div className="table-wrap"><table data-table="questions">
            <thead><tr><th>Question</th><th>Ref</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{pursuit.questions.map(item => (
              <tr key={item.id}>
                <td data-user-text>{item.question}</td><td className="mono-cell">{item.ref}</td>
                <td style={{ width: 200 }}><span className="status-edit">{item.status === "Open" ? <Icon name="status-in-progress" /> : item.status === "Submitted" ? <Icon name="submit" /> : <Icon name="status-complete" />}
                  <Select aria-label="Question status" value={item.status} onValue={value => update(current => ({ ...current, questions: current.questions.map(entry => (entry.id === item.id ? { ...entry, status: value as typeof item.status } : entry)) }))} options={["Open", "Submitted", "Answered"].map(value => ({ value, label: value }))} /></span></td>
                <td><Button variant="quiet" icon="delete" onClick={() => update(current => ({ ...current, questions: current.questions.filter(entry => entry.id !== item.id) }))}>Remove</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Region>
      ) : null}
    </>
  );
}
