import { Fragment, useState } from "react";
import { formatDate } from "../lib/calendar.ts";
import { SECTION_STATUSES, personName } from "../lib/model.ts";
import type { OutlineNode, Pursuit, SectionStatus, Volume } from "../lib/model.ts";
import { addSection, addSubsection, assignmentsFor, isOverdue, moveNode, orderedOutline, placeNode, removeNode, siblingsOf, updateNode } from "../lib/outline.ts";
import { allocationOf, formatPages } from "../lib/pagebudget.ts";
import { liveDueMilestone, sectionDueDate } from "../lib/pursuit-ops.ts";
import { milestoneDef } from "../lib/scheduler.ts";
import type { MilestoneId } from "../lib/scheduler.ts";
import { statusStyle } from "../lib/status.ts";
import { usePursuit } from "../state.tsx";
import { Button, Checkbox, DateInput, Dialog, EmptyState, Field, Icon, NumberInput, Region, Select, StatusWord, Tabs, TextArea, TextInput } from "../ui/kit.tsx";
import type { IconName, Option } from "../ui/kit.tsx";

type Tab = "outline" | "mine";
const DUE_CHOICES: MilestoneId[] = ["pink", "red", "gold", "internalSubmit"];

export const rosterOptions = (pursuit: Pursuit, empty = "Unassigned"): Option[] => [{ value: "", label: empty }, ...pursuit.roster.map(person => ({ value: person.id, label: person.name || person.email || "Unnamed" }))];

export function readPersonHint(): string {
  try { const value = window.sessionStorage.getItem("pwr:person") ?? ""; window.sessionStorage.removeItem("pwr:person"); return value; } catch { return ""; }
}

export function Outline({ go }: { go: (route: string) => void }) {
  const { pursuit, update, today } = usePursuit();
  const [hint] = useState(readPersonHint);
  const [tab, setTab] = useState<Tab>(hint ? "mine" : "outline");
  const [owner, setOwner] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OutlineNode | null>(null);

  if (!pursuit.volumes.length) {
    return (
      <div className="page" data-view="outline">
        <header className="page-head"><h1 className="page-title">Outline</h1></header>
        <EmptyState name="no-volumes" title="No volumes yet" body="Add the proposal volumes on the setup screen, or let the Section L and M parser read them from the solicitation."
          action={<Button variant="primary" icon="rfp" iconSize={20} onClick={() => go("setup")}>Open pursuit setup</Button>} />
      </div>
    );
  }

  const numbers = new Map(orderedOutline(pursuit).map(row => [row.node.id, row.number]));
  const matches = (item: OutlineNode): boolean => owner === "all" || item.ownerId === owner;

  return (
    <div className="page" data-view="outline">
      <header className="page-head">
        <h1 className="page-title">Outline</h1>
        <p className="page-intro">Volume, section, subsection. Each one carries its Section L and M references, an owner, a reviewer and a page allocation.</p>
      </header>
      <Tabs label="Outline views" value={tab} onValue={setTab} tabs={[{ value: "outline", label: "Outline", icon: "outline" }, { value: "mine", label: "My assignments", icon: "owner" }]} />

      {tab === "mine" ? <Assignments initial={hint} go={go} /> : (
        <div className="stack loose">
          <div className="toolbar">
            <Field label="Filter by owner">{id => <Select id={id} value={owner} onValue={setOwner} options={[{ value: "all", label: "All owners" }, ...rosterOptions(pursuit, "Unassigned")]} />}</Field>
            <p className="caption grow">Select a row to edit it. Drag a row to reorder it within its volume, or use Up and Down.</p>
          </div>
          {pursuit.volumes.map(volume => (
            <VolumeOutline key={volume.id} volume={volume} numbers={numbers} matches={matches} filtered={owner !== "all"} selected={selected} onSelect={id => setSelected(current => (current === id ? null : id))}
              onAdd={() => { let made = ""; update(current => { const result = addSection(current, volume.id, today); made = result.node.id; return result.pursuit; }); if (made) setSelected(made); }}
              onAddChild={target => { let made = ""; update(current => { const result = addSubsection(current, target.parentId ?? target.id, today); if (!result) return current; made = result.node.id; return result.pursuit; }); if (made) setSelected(made); }}
              onDelete={setDeleting} />
          ))}
        </div>
      )}

      {deleting ? (
        <Dialog name="delete-section" title="Delete this section" icon="delete" onClose={() => setDeleting(null)}
          footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="primary" icon="delete" onClick={() => { update(current => removeNode(current, deleting.id)); setSelected(null); setDeleting(null); }}>Delete section</Button></>}>
          <p><span className="strong">{deleting.title}</span>{pursuit.outline.some(item => item.parentId === deleting.id) ? ` and its ${pursuit.outline.filter(item => item.parentId === deleting.id).length} subsections are` : " is"} removed from the outline. Requirements mapped here lose that mapping and show as unmapped.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function VolumeOutline({ volume, numbers, matches, filtered, selected, onSelect, onAdd, onAddChild, onDelete }: {
  volume: Volume; numbers: Map<string, string>; matches: (node: OutlineNode) => boolean; filtered: boolean; selected: string | null; onSelect: (id: string) => void; onAdd: () => void;
  onAddChild: (node: OutlineNode) => void; onDelete: (node: OutlineNode) => void;
}) {
  const { pursuit, update, today } = usePursuit();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const nodes = orderedOutline(pursuit).filter(row => row.node.volumeId === volume.id);
  const visible = nodes.filter(row => matches(row.node) || (row.depth === 0 && pursuit.outline.some(child => child.parentId === row.node.id && matches(child))));
  const dragged = pursuit.outline.find(item => item.id === dragId);
  const canDrop = (target: OutlineNode): boolean => Boolean(dragged && dragged.id !== target.id && dragged.volumeId === target.volumeId && dragged.parentId === target.parentId);
  const drop = (target: OutlineNode) => {
    if (!dragged || !canDrop(target)) return;
    const siblings = siblingsOf(pursuit.outline, target);
    const where = siblings.indexOf(dragged) < siblings.indexOf(target) ? "after" : "before";
    update(current => placeNode(current, dragged.id, target.id, where));
  };
  return (
    <Region name={`outline-volume-${volume.id}`} className="section">
      <div className="section-head">
        <div className="stack tight">
          <h2 className="panel-title"><Icon name="volume" /><span>{volume.name}</span></h2>
          <span className="mono muted">{volume.pageLimit === null ? "No page limit" : `Page limit ${volume.pageLimit}`}</span>
        </div>
        <Button variant="primary" icon="add" onClick={onAdd}>Add section</Button>
      </div>
      {visible.length ? (
        <div className="table-wrap">
          <table data-table="outline" data-volume={volume.name}>
            <thead><tr><th>No</th><th>Section</th><th>L ref</th><th>M ref</th><th>Owner</th><th>Reviewer</th><th className="num">Pages</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.map(({ node, depth }) => {
                const siblings = siblingsOf(pursuit.outline, node);
                const index = siblings.indexOf(node);
                const due = sectionDueDate(pursuit, node);
                const overdue = isOverdue(pursuit, node, today);
                const pages = allocationOf(pursuit, node);
                const derived = node.pages === null && pages !== null;
                const classes = [node.id === selected ? "is-selected" : "", "is-clickable", dragId === node.id ? "is-dragging" : "", overId === node.id ? "is-drop-target" : "", filtered && !matches(node) ? "is-muted" : ""].filter(Boolean).join(" ");
                return (
                  <Fragment key={node.id}>
                  <tr className={classes} data-node={node.title} data-depth={depth} draggable={!filtered}
                    onClick={() => onSelect(node.id)}
                    onDragStart={event => { setDragId(node.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); }}
                    onDragOver={event => { if (canDrop(node)) { event.preventDefault(); setOverId(node.id); } }}
                    onDragLeave={() => setOverId(current => (current === node.id ? null : current))}
                    onDrop={event => { event.preventDefault(); drop(node); setDragId(null); setOverId(null); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}>
                    <td className="mono-cell">{numbers.get(node.id)}</td>
                    <td className={depth ? "indent-1" : undefined}>
                      <button type="button" className="link-btn" aria-pressed={node.id === selected} onClick={() => onSelect(node.id)}>
                        <Icon name="section" size={16} /><span>{node.title}</span>
                      </button>
                      {node.excluded ? <span className="cell-note">Excluded from the page count</span> : null}
                    </td>
                    <td className="mono-cell">{node.lRef}</td>
                    <td className="mono-cell">{node.mRef}</td>
                    <td>{personName(pursuit, node.ownerId) || <span className="muted">Unassigned</span>}</td>
                    <td>{personName(pursuit, node.reviewerId) || <span className="muted">None</span>}</td>
                    <td className="num mono-cell">{formatPages(pages)}{derived ? <span className="cell-note">Sum</span> : null}</td>
                    <td><StatusWord value={node.status} /></td>
                    <td className="nowrap"><span className="mono-cell">{formatDate(due)}</span>{overdue ? <span className="cell-note"><StatusWord value="Overdue" /></span> : null}</td>
                    <td className="nowrap">
                      <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                        <Button icon="arrow-up" variant="quiet" disabled={index === 0 || filtered} onClick={event => { event.stopPropagation(); update(current => moveNode(current, node.id, -1)); }}>Up</Button>
                        <Button icon="arrow-down" variant="quiet" disabled={index === siblings.length - 1 || filtered} onClick={event => { event.stopPropagation(); update(current => moveNode(current, node.id, 1)); }}>Down</Button>
                      </div>
                    </td>
                  </tr>
                  {node.id === selected ? (
                    <tr className="row-editor" data-editor-row={node.title}>
                      <td colSpan={10}><NodeEditor key={node.id} node={node} onAddChild={() => onAddChild(node)} onDelete={() => onDelete(node)} onClose={() => onSelect(node.id)} /></td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{filtered ? "No sections for this owner in this volume." : "No sections yet. Add the first one, or apply a parsed outline."}</p>}
    </Region>
  );
}

function NodeEditor({ node, onAddChild, onDelete, onClose }: { node: OutlineNode; onAddChild: () => void; onDelete: () => void; onClose: () => void }) {
  const { pursuit, update } = usePursuit();
  const set = (patch: Partial<OutlineNode>) => update(current => updateNode(current, node.id, patch));
  const hasChildren = pursuit.outline.some(item => item.parentId === node.id);
  const childPages = pursuit.outline.filter(item => item.parentId === node.id).reduce((total, child) => total + (child.pages ?? 0), 0);
  const due = sectionDueDate(pursuit, node);
  const live = liveDueMilestone(pursuit.schedule.milestones, node.dueMilestone);
  const dueChoice = node.dueDate ? "date" : node.dueMilestone || "none";
  const icon = statusStyle(node.status).icon as IconName | null;
  return (
    <div className="stack" data-editor="node">
      <div className="form-grid">
        <Field label="Title" className="span-6">{id => <TextInput id={id} value={node.title} onValue={value => set({ title: value })} maxLength={300} autoFocus={node.title === "New section" || node.title === "New subsection"} onFocus={event => { if (/^New (sub)?section$/.test(event.target.value)) event.target.select(); }} />}</Field>
        <Field label="L reference" className="span-3">{id => <TextInput id={id} mono value={node.lRef} onValue={value => set({ lRef: value })} maxLength={80} placeholder="L.4.1" />}</Field>
        <Field label="M reference" className="span-3">{id => <TextInput id={id} mono value={node.mRef} onValue={value => set({ mRef: value })} maxLength={80} placeholder="M.2" />}</Field>
        <Field label="Owner" className="span-3">{id => <Select id={id} value={node.ownerId} onValue={value => set({ ownerId: value })} options={rosterOptions(pursuit)} />}</Field>
        <Field label="Reviewer" className="span-3">{id => <Select id={id} value={node.reviewerId} onValue={value => set({ reviewerId: value })} options={rosterOptions(pursuit, "None")} />}</Field>
        <Field label="Page allocation" className="span-3" hint={hasChildren ? `Subsections allocate ${formatPages(childPages)} ${childPages === 1 ? "page" : "pages"}${node.pages === null ? ". That sum stands in until this section has its own number." : node.pages < childPages ? `, ${formatPages(childPages - node.pages)} more than this section.` : "."}` : undefined}>
          {id => <NumberInput id={id} value={node.pages} step={0.5} placeholder={hasChildren ? "Sum of subsections" : "Pages"} onValue={value => set({ pages: value })} />}
        </Field>
        <Field label="Status" className="span-3">
          {id => (
            <span className="status-edit">
              {icon ? <Icon name={icon} /> : null}
              <Select id={id} value={node.status} onValue={value => set({ status: value as SectionStatus })} options={SECTION_STATUSES.map(status => ({ value: status, label: status }))} />
            </span>
          )}
        </Field>
        <Field label="Due at" className="span-3" hint={dueChoice === "date" ? undefined : due ? `${formatDate(due)}${live && live.id !== node.dueMilestone ? `, moved to ${milestoneDef(live.id).short} because its review was dropped` : ""}` : "Not on the schedule yet. It picks up a date when the schedule is planned."}>
          {id => (
            <Select id={id} value={dueChoice} onValue={value => set(value === "date" ? { dueDate: due || pursuit.dueDate || "" } : value === "none" ? { dueDate: "", dueMilestone: "" } : { dueDate: "", dueMilestone: value as MilestoneId })}
              options={[...DUE_CHOICES.map(choice => ({ value: choice as string, label: milestoneDef(choice).short })), { value: "date", label: "A set date" }, ...(dueChoice === "none" ? [{ value: "none", label: "Not set" }] : [])]} />
          )}
        </Field>
        {dueChoice === "date" ? <Field label="Due date" className="span-3">{id => <DateInput id={id} value={node.dueDate} onValue={value => set({ dueDate: value })} />}</Field> : null}
        <div className="field span-3"><span className="label">Page count</span><Checkbox checked={node.excluded} onValue={value => set({ excluded: value })}>Excluded from the page count</Checkbox></div>
        <Field label="Notes" className="span-12">{id => <TextArea id={id} value={node.notes} onValue={value => set({ notes: value })} maxLength={4000} data-user-text />}</Field>
      </div>
      <div className="row">
        {node.parentId === null ? <Button icon="add" onClick={onAddChild}>Add subsection</Button> : null}
        <Button icon="delete" onClick={onDelete}>Delete</Button>
        <Button icon="close" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function Assignments({ initial, go }: { initial: string; go: (route: string) => void }) {
  const { pursuit, today } = usePursuit();
  const [person, setPerson] = useState(initial && pursuit.roster.some(item => item.id === initial) ? initial : pursuit.roster[0]?.id ?? "");
  if (!pursuit.roster.length) {
    return <EmptyState name="no-roster" title="No one on the roster yet" body="Add the team, then assign owners and reviewers to sections."
      action={<Button variant="primary" icon="team" onClick={() => go("team")}>Open team</Button>} />;
  }
  const rows = assignmentsFor(pursuit, person, today);
  const requirements = pursuit.requirements.filter(item => (person ? item.ownerId === person : !item.ownerId));
  return (
    <Region name="assignments" className="section">
      <div className="toolbar">
        <Field label="Person">{id => <Select id={id} value={person} onValue={setPerson} options={[...pursuit.roster.map(item => ({ value: item.id, label: item.name || item.email || "Unnamed" })), { value: "", label: "Sections with no owner" }]} />}</Field>
        <p className="caption grow">{rows.length} {rows.length === 1 ? "section" : "sections"}, {rows.filter(row => row.overdue).length} overdue, {requirements.length} {requirements.length === 1 ? "requirement" : "requirements"}.</p>
      </div>
      {rows.length ? (
        <div className="stack">
          <span className="table-caption">Table 1: Sections</span>
          <div className="table-wrap">
            <table data-table="assignments">
              <thead><tr><th>No</th><th>Section</th><th>Volume</th><th>Role</th><th>Status</th><th>Due</th><th className="num">Pages</th></tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.node.id}>
                    <td className="mono-cell">{row.number}</td>
                    <td className={row.depth ? "indent-1" : undefined}>{row.node.title}</td>
                    <td>{pursuit.volumes.find(volume => volume.id === row.node.volumeId)?.name}</td>
                    <td>{row.role}</td>
                    <td><StatusWord value={row.node.status} /></td>
                    <td className="nowrap"><span className="mono-cell">{formatDate(row.due)}</span>{row.overdue ? <span className="cell-note"><StatusWord value="Overdue" /></span> : null}</td>
                    <td className="num mono-cell">{formatPages(allocationOf(pursuit, row.node))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p className="muted">No sections are assigned here.</p>}
      {requirements.length ? (
        <div className="stack">
          <span className="table-caption">Table 2: Requirements</span>
          <div className="table-wrap">
            <table className="dense" data-table="assigned-requirements">
              <thead><tr><th>Req ID</th><th>Ref</th><th>Requirement</th><th>Status</th></tr></thead>
              <tbody>
                {requirements.map(item => <tr key={item.id}><td className="mono-cell">{item.reqId}</td><td className="mono-cell">{item.ref}</td><td data-user-text>{item.text}</td><td><StatusWord value={item.status} /></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Region>
  );
}
