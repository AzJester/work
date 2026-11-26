import { Fragment, useMemo, useState } from "react";
import {
  coverageByVolume, coverageOf, crosswalk, EMPTY_FILTER, filterRequirements, goldGate, isFactor, mappedSectionsText, mappingFlag, matrixCsv, matrixSheet,
  naMissingReason, sortRequirements,
} from "../lib/compliance.ts";
import type { MatrixFilter, SortKey } from "../lib/compliance.ts";
import { newRequirement, nextReqId, nodePath, personName, pursuitFileName, REQ_SOURCES, REQ_STATUSES, REQ_TYPES } from "../lib/model.ts";
import type { ReqSource, ReqStatus, ReqType, Requirement } from "../lib/model.ts";
import { orderedOutline } from "../lib/outline.ts";
import { statusStyle } from "../lib/status.ts";
import { writeXlsx, XLSX_MIME } from "../lib/xlsx.ts";
import { usePursuit } from "../state.tsx";
import { Button, Checkbox, Dialog, downloadFile, EmptyState, Field, Icon, Region, Select, StatusWord, Tabs, TextArea, TextInput, useToast } from "../ui/kit.tsx";
import type { IconName } from "../ui/kit.tsx";
import { rosterOptions } from "./Outline.tsx";

type Tab = "matrix" | "crosswalk";
const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: "reqId", label: "Req ID" }, { key: "source", label: "Source" }, { key: "ref", label: "Ref" }, { key: "text", label: "Requirement" }, { key: "type", label: "Type" },
  { key: "sections", label: "Mapped sections" }, { key: "owner", label: "Owner" }, { key: "status", label: "Status" }, { key: "pageRef", label: "Page ref" },
];

export function Compliance() {
  const { pursuit, update } = usePursuit();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("matrix");
  const [filter, setFilter] = useState<MatrixFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "reqId", descending: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Requirement | null>(null);

  const gate = goldGate(pursuit);
  const overall = coverageOf(pursuit.requirements);
  const volumes = coverageByVolume(pursuit);
  const rows = useMemo(() => sortRequirements(pursuit, filterRequirements(pursuit, filter), sort.key, sort.descending), [pursuit, filter, sort]);
  const set = <K extends keyof MatrixFilter>(key: K, value: MatrixFilter[K]) => setFilter(previous => ({ ...previous, [key]: value }));
  const add = (source: ReqSource = "L") => {
    let made = "";
    update(next => { const item = newRequirement(source, nextReqId(next.requirements, source)); made = item.id; return { ...next, requirements: [...next.requirements, item] }; });
    setFilter(EMPTY_FILTER);
    setSelected(made);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const exportXlsx = async () => {
    const bytes = await writeXlsx(matrixSheet(pursuit, rows, stamp));
    downloadFile(pursuitFileName(pursuit, "xlsx", "compliance-matrix"), bytes, XLSX_MIME);
    toast("Compliance matrix exported", `${rows.length} ${rows.length === 1 ? "row" : "rows"} in the workbook.`);
  };

  if (!pursuit.requirements.length) {
    return (
      <div className="page" data-view="compliance">
        <header className="page-head"><h1 className="page-title">Compliance matrix</h1></header>
        <EmptyState name="no-requirements" title="No requirements yet" body="Add the first requirement by hand, or run the Section L and M parser and apply what it finds."
          action={<Button variant="primary" icon="add" onClick={() => add("L")}>Add requirement</Button>} />
      </div>
    );
  }

  return (
    <div className="page" data-view="compliance">
      <header className="page-head">
        <h1 className="page-title">Compliance matrix</h1>
        <p className="page-intro">Every Section L requirement maps to a section. Every Section M factor and subfactor traces to one. Gold team waits until no item is Open or a Gap.</p>
      </header>

      <div className="grid cols-2">
        <Region name="compliance-gate" className="panel">
          <div className="panel-head">
            <h2 className="panel-title"><Icon name="gate-review" /><span>Gold team readiness</span></h2>
            <span data-gate={gate.ready ? "ready" : "not-ready"}><StatusWord value={gate.ready ? "Ready" : "Not ready"} /></span>
          </div>
          <p>{gate.reason}</p>
          <dl className="spec" data-spec="gate">
            <dt>Open</dt><dd data-value="open">{gate.open}</dd>
            <dt>Gap</dt><dd data-value="gap">{gate.gap}</dd>
            <dt>Unmapped L</dt><dd data-value="unmapped">{gate.unmapped}</dd>
            <dt>Untraced M</dt><dd data-value="untraced">{gate.untraced}</dd>
          </dl>
        </Region>
        <Region name="compliance-coverage" className="panel">
          <div className="panel-head">
            <h2 className="panel-title"><Icon name="compliance-matrix" /><span>Figure 1: Coverage by volume</span></h2>
            <span className="mono muted" data-value="coverage">{overall.percent === null ? "No applicable items" : `${overall.percent}% overall`}</span>
          </div>
          <div className="bar-chart" data-chart="coverage">
            {volumes.map(row => (
              <div className="bar-row" key={row.label} data-chart-row={row.label}>
                <span>{row.label}</span>
                <div className="bar-track" role="img" aria-label={`${row.label}: ${row.covered} of ${row.applicable} addressed or verified`}><div className="bar-fill" style={{ width: `${row.percent ?? 0}%` }} /></div>
                <span className="bar-value">{row.percent === null ? "No items" : `${row.percent}%, ${row.covered} of ${row.applicable}`}</span>
              </div>
            ))}
          </div>
          <p className="caption">Coverage counts items Addressed or Verified compliant. Items marked N/A with a reason are left out.</p>
        </Region>
      </div>

      <Tabs label="Compliance views" value={tab} onValue={setTab} tabs={[{ value: "matrix", label: "Matrix", icon: "compliance-matrix" }, { value: "crosswalk", label: "L-to-M crosswalk", icon: "cross-reference" }]} />

      {tab === "crosswalk" ? <Crosswalk /> : (
        <>
          <Region name="compliance-toolbar" className="section">
            <div className="toolbar">
              <Field label="Search" className="grow">{id => (
                <span className="date-wrap"><TextInput id={id} type="search" value={filter.search} onValue={value => set("search", value)} placeholder="Requirement text, ID, reference, owner" /><Icon name="search" size={16} /></span>
              )}</Field>
              <Field label="Source">{id => <Select id={id} value={filter.source} onValue={value => set("source", value as MatrixFilter["source"])} options={[{ value: "all", label: "All sources" }, ...REQ_SOURCES.map(value => ({ value, label: value }))]} />}</Field>
              <Field label="Status">{id => <Select id={id} value={filter.status} onValue={value => set("status", value as MatrixFilter["status"])} options={[{ value: "all", label: "All statuses" }, ...REQ_STATUSES.map(value => ({ value, label: value }))]} />}</Field>
              <Field label="Type">{id => <Select id={id} value={filter.type} onValue={value => set("type", value as MatrixFilter["type"])} options={[{ value: "all", label: "All types" }, ...REQ_TYPES.map(value => ({ value, label: value }))]} />}</Field>
              <Field label="Volume">{id => <Select id={id} value={filter.volumeId} onValue={value => set("volumeId", value)} options={[{ value: "all", label: "All volumes" }, ...pursuit.volumes.map(volume => ({ value: volume.id, label: volume.name }))]} />}</Field>
              <Field label="Owner">{id => <Select id={id} value={filter.ownerId} onValue={value => set("ownerId", value)} options={[{ value: "all", label: "All owners" }, ...rosterOptions(pursuit)]} />}</Field>
            </div>
            <div className="row between">
              <div className="row">
                <Checkbox checked={filter.flaggedOnly} onValue={value => set("flaggedOnly", value)}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="filter" size={16} />Flagged only</span></Checkbox>
                <span className="caption" data-value="row-count">{rows.length} of {pursuit.requirements.length} shown</span>
              </div>
              <div className="row">
                <Button variant="primary" icon="add" onClick={() => add("L")}>Add requirement</Button>
                <Button icon="download" onClick={() => void exportXlsx()} data-action="export-xlsx">Export .xlsx</Button>
                <Button icon="download" onClick={() => downloadFile(pursuitFileName(pursuit, "csv", "compliance-matrix"), matrixCsv(pursuit, rows), "text/csv")} data-action="export-csv">Export CSV</Button>
              </div>
            </div>
          </Region>

          <div className="table-wrap">
            <table className="dense" data-table="matrix">
              <thead>
                <tr>
                  {COLUMNS.map(column => (
                    <th key={column.key} aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : undefined}>
                      <button type="button" className="th-btn" onClick={() => setSort(previous => ({ key: column.key, descending: previous.key === column.key ? !previous.descending : false }))}>
                        <span>{column.label}</span>{sort.key === column.key ? <Icon name={sort.descending ? "arrow-down" : "arrow-up"} size={16} label={sort.descending ? "Sorted descending" : "Sorted ascending"} /> : <Icon name="sort" size={16} />}
                      </button>
                    </th>
                  ))}
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => {
                  const flag = mappingFlag(item);
                  const open = item.id === selected;
                  return (
                    <Fragment key={item.id}>
                      <tr className={["is-clickable", open ? "is-selected" : ""].join(" ").trim()} data-req={item.reqId} onClick={() => setSelected(open ? null : item.id)}>
                        <td><button type="button" className="link-btn mono-cell" aria-pressed={open} onClick={event => { event.stopPropagation(); setSelected(open ? null : item.id); }}>{item.reqId || "No ID"}</button></td>
                        <td className="mono-cell">{item.source}</td>
                        <td className="mono-cell">{item.ref}</td>
                        <td style={{ minWidth: 280 }} data-user-text>{item.text || <span className="muted">No text yet</span>}</td>
                        <td>{item.type}</td>
                        <td style={{ minWidth: 160 }}>{item.sectionIds.length ? <span data-user-text>{mappedSectionsText(pursuit, item)}</span> : flag ? <StatusWord value={flag} /> : <span className="muted">None</span>}</td>
                        <td>{personName(pursuit, item.ownerId) || <span className="muted">Unassigned</span>}</td>
                        <td><StatusWord value={item.status} />{naMissingReason(item) ? <span className="cell-note">Needs a reason. Counts as Open until it has one.</span> : item.status === "N/A" ? <span className="cell-note" data-user-text>{item.naReason}</span> : null}</td>
                        <td className="mono-cell" data-user-text>{item.pageRef}</td>
                        <td style={{ minWidth: 160 }} data-user-text>{item.comment}</td>
                      </tr>
                      {open ? (
                        <tr className="row-editor" data-editor-row={item.reqId}>
                          <td colSpan={10}><RequirementEditor key={item.id} item={item} onDelete={() => setDeleting(item)} onClose={() => setSelected(null)} /></td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!rows.length ? <p className="muted" style={{ padding: "12px 0" }}>No requirement matches these filters.</p> : null}
          </div>
        </>
      )}

      {deleting ? (
        <Dialog name="delete-requirement" title="Delete this requirement" icon="delete" onClose={() => setDeleting(null)}
          footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="primary" icon="delete" onClick={() => { update(next => ({ ...next, requirements: next.requirements.filter(item => item.id !== deleting.id).map(item => (item.parentId === deleting.id ? { ...item, parentId: "" } : item)) })); setSelected(null); setDeleting(null); }}>Delete requirement</Button></>}>
          <p><span className="strong mono-value">{deleting.reqId}</span> leaves the matrix. Mark it N/A with a reason instead if the record of the decision matters.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function RequirementEditor({ item, onDelete, onClose }: { item: Requirement; onDelete: () => void; onClose: () => void }) {
  const { pursuit, update } = usePursuit();
  const set = (patch: Partial<Requirement>) => update(next => ({ ...next, requirements: next.requirements.map(entry => (entry.id === item.id ? { ...entry, ...patch } : entry)) }));
  const icon = statusStyle(item.status).icon as IconName | null;
  const outline = orderedOutline(pursuit);
  const toggle = (id: string, on: boolean) => set({ sectionIds: on ? [...item.sectionIds, id] : item.sectionIds.filter(entry => entry !== id) });
  // An id the app numbered follows its source. An id typed by hand is left alone.
  const setSource = (source: ReqSource) => update(next => ({
    ...next,
    requirements: next.requirements.map(entry => (entry.id === item.id
      ? { ...entry, source, reqId: /^[LMSO](OW)?-\d{3}$/.test(entry.reqId) ? nextReqId(next.requirements.filter(other => other.id !== item.id), source) : entry.reqId, type: source === "M" && !isFactor(entry) ? "evaluation factor" : entry.type }
      : entry)),
  }));
  return (
    <div className="stack" data-editor="requirement">
      <div className="form-grid">
        <Field label="Req ID" className="span-2">{id => <TextInput id={id} mono value={item.reqId} onValue={value => set({ reqId: value })} maxLength={40} />}</Field>
        <Field label="Source" className="span-2">{id => <Select id={id} value={item.source} onValue={value => setSource(value as ReqSource)} options={REQ_SOURCES.map(value => ({ value, label: value }))} />}</Field>
        <Field label="Paragraph ref" className="span-2">{id => <TextInput id={id} mono value={item.ref} onValue={value => set({ ref: value })} maxLength={80} placeholder="L.4.1" />}</Field>
        <Field label="Type" className="span-3">{id => <Select id={id} value={item.type} onValue={value => set({ type: value as ReqType })} options={REQ_TYPES.map(value => ({ value, label: value }))} />}</Field>
        <Field label="Owner" className="span-3">{id => <Select id={id} value={item.ownerId} onValue={value => set({ ownerId: value })} options={rosterOptions(pursuit)} />}</Field>
        <Field label="Requirement text" className="span-6" hint="Verbatim from the solicitation.">{id => <TextArea id={id} value={item.text} onValue={value => set({ text: value })} maxLength={6000} data-user-text autoFocus={!item.text} />}</Field>
        <div className="field span-6">
          <span className="label">Mapped sections</span>
          {outline.length ? (
            <ul className="stack tight" style={{ maxHeight: 132, overflowY: "auto", border: "1px solid var(--hairline)", padding: 8 }} data-list="section-map">
              {outline.map(({ node, depth, number }) => (
                <li key={node.id} className={depth ? "indent-1" : undefined}>
                  <Checkbox checked={item.sectionIds.includes(node.id)} onValue={value => toggle(node.id, value)}><span className="mono-cell">{number}</span> <span title={nodePath(pursuit, node)} data-user-text>{node.title}</span></Checkbox>
                </li>
              ))}
            </ul>
          ) : <span className="hint">The outline has no sections yet.</span>}
        </div>
        <Field label="Status" className="span-3">
          {id => (
            <span className="status-edit">
              {icon ? <Icon name={icon} /> : null}
              <Select id={id} value={item.status} onValue={value => set({ status: value as ReqStatus })} options={REQ_STATUSES.map(value => ({ value, label: value }))} />
            </span>
          )}
        </Field>
        {item.status === "N/A" ? <Field label="Reason for N/A" className="span-6" hint="Required. Without a reason the item still counts as Open.">{id => <TextInput id={id} value={item.naReason} onValue={value => set({ naReason: value })} maxLength={600} aria-invalid={naMissingReason(item)} required />}</Field> : null}
        <Field label="Proposal page ref" className="span-3">{id => <TextInput id={id} mono value={item.pageRef} onValue={value => set({ pageRef: value })} maxLength={80} placeholder="I-12" />}</Field>
        <Field label="Reviewer comment" className="span-12">{id => <TextArea id={id} value={item.comment} onValue={value => set({ comment: value })} maxLength={2000} data-user-text />}</Field>
      </div>
      <div className="row">
        <Button icon="delete" onClick={onDelete}>Delete</Button>
        <Button icon="close" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function Crosswalk() {
  const { pursuit } = usePursuit();
  const rows = crosswalk(pursuit);
  if (!rows.length) return <p className="muted">The crosswalk fills in once the matrix holds Section L requirements or Section M factors.</p>;
  return (
    <Region name="compliance-crosswalk" className="section">
      <p className="caption">Section L requirements meet Section M factors through the sections they share. Factors that no Section L requirement reaches are listed last.</p>
      <div className="table-wrap">
        <table className="dense" data-table="crosswalk">
          <thead><tr><th>L ref</th><th>Section L requirement</th><th>Sections</th><th>Section M factor or subfactor</th><th>Trace</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} data-crosswalk={row.l?.reqId ?? row.m[0]?.reqId}>
                <td className="mono-cell">{row.l ? `${row.l.reqId} ${row.l.ref}`.trim() : ""}</td>
                <td data-user-text>{row.l ? row.l.text : <span className="muted">No Section L requirement reaches this factor</span>}</td>
                <td data-user-text>{row.sections.map(node => node.title).join("; ")}</td>
                <td>{row.m.length ? row.m.map(factor => <span key={factor.id} style={{ display: "block" }}><span className="mono-cell">{`${factor.reqId} ${factor.ref}`.trim()}</span> <span data-user-text>{factor.text}</span></span>) : <span className="muted">None</span>}</td>
                <td><StatusWord value={row.flag === "No factor" ? "Mapped" : row.flag} />{row.flag === "No factor" ? <span className="cell-note">No factor traces to these sections</span> : row.flag === "N/A" ? <span className="cell-note" data-user-text>{row.l?.naReason}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Region>
  );
}
