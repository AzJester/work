import { FORMAT_CATEGORIES, uid } from "../lib/model.ts";
import type { FormatCategory, FormatRule, OutlineNode, Volume } from "../lib/model.ts";
import { orderedOutline, updateNode } from "../lib/outline.ts";
import { allVolumeBudgets, formatPages } from "../lib/pagebudget.ts";
import type { NodeBudget, VolumeBudget } from "../lib/pagebudget.ts";
import { usePursuit } from "../state.tsx";
import { Button, Checkbox, EmptyState, Field, Icon, NumberInput, Region, Select, StatusWord, TextInput } from "../ui/kit.tsx";

const pages = (value: number): string => `${formatPages(value)} ${value === 1 ? "page" : "pages"}`;

export function PageBudget({ go }: { go: (route: string) => void }) {
  const { pursuit, update } = usePursuit();
  if (!pursuit.volumes.length) {
    return (
      <div className="page" data-view="budget">
        <header className="page-head"><h1 className="page-title">Page budget</h1></header>
        <EmptyState name="no-volumes" title="No volumes yet" body="Add the volumes and their Section L page limits on the setup screen, then allocate pages to sections here."
          action={<Button variant="primary" icon="rfp" iconSize={20} onClick={() => go("setup")}>Open pursuit setup</Button>} />
      </div>
    );
  }
  const budgets = allVolumeBudgets(pursuit);
  const numbers = new Map(orderedOutline(pursuit).map(row => [row.node.id, row.number]));
  return (
    <div className="page" data-view="budget">
      <header className="page-head">
        <h1 className="page-title">Page budget</h1>
        <p className="page-intro">Allocate pages against each Section L limit, then track the current count. A volume past its limit raises the alert at the top of every screen.</p>
      </header>

      <Region name="budget-chart" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="page-limit" /><span>Figure 1: Current pages against the limit, by volume</span></h2></div>
        <div className="bar-chart" data-chart="page-budget">
          {budgets.map(budget => {
            const scale = Math.max(budget.limit ?? 0, budget.current, budget.allocated, 1);
            return (
              <div className="bar-row" key={budget.volume.id} data-chart-row={budget.volume.name}>
                <span>{budget.volume.name}</span>
                <div className="bar-track" role="img" aria-label={`${budget.volume.name}: ${pages(budget.current)}${budget.limit === null ? ", no limit" : ` of ${budget.limit}`}`}>
                  <div className="bar-fill" style={{ width: `${Math.min(100, (budget.current / scale) * 100)}%` }} />
                  {budget.limit !== null ? <div className="bar-mark" style={{ left: `${(budget.limit / scale) * 100}%` }} title={`Limit: ${budget.limit}`} /> : null}
                </div>
                <span className="bar-value">{budget.limit === null ? `${formatPages(budget.current)} pages, no limit` : `${formatPages(budget.current)} of ${formatPages(budget.limit)} pages, ${budget.percent}%`}</span>
              </div>
            );
          })}
        </div>
        <div className="toolbar">
          <Field label="Words per page" hint="Used when a section is counted by words.">{id => <NumberInput id={id} min={100} max={1500} step={10} value={pursuit.wordsPerPage} onValue={value => update(current => ({ ...current, wordsPerPage: Math.max(100, Math.min(1500, value ?? 500)) }))} />}</Field>
          <p className="caption grow">The vertical mark on each bar is the Section L limit. Excluded sections never count toward it.</p>
        </div>
      </Region>

      {budgets.map(budget => <VolumeBudgetSection key={budget.volume.id} budget={budget} numbers={numbers} />)}
      <FormatRules />
    </div>
  );
}

function VolumeBudgetSection({ budget, numbers }: { budget: VolumeBudget; numbers: Map<string, string> }) {
  const { pursuit, update } = usePursuit();
  const { volume } = budget;
  const setVolume = (patch: Partial<Volume>) => update(current => ({ ...current, volumes: current.volumes.map(item => (item.id === volume.id ? { ...item, ...patch } : item)) }));
  const setNode = (id: string, patch: Partial<OutlineNode>) => update(current => updateNode(current, id, patch));
  const checked = pursuit.formatRules.filter(rule => volume.formatChecks[rule.id]).length;
  return (
    <Region name={`budget-volume-${volume.id}`} className="section">
      <div className="section-head" data-volume-head={volume.name}>
        <div className="stack tight">
          <h2 className="panel-title"><Icon name="volume" /><span>{volume.name}</span></h2>
          <span className="mono muted" data-volume-count>{budget.limit === null ? `${formatPages(budget.current)} pages / no limit` : `${formatPages(budget.current)} of ${formatPages(budget.limit)} pages`}</span>
        </div>
        <span data-volume-status={volume.name}><StatusWord value={budget.status} detail={budget.percent === null ? undefined : `${budget.percent}%`} /></span>
      </div>

      <div className="form-grid">
        <Field label="Page limit from Section L" className="span-3">{id => <NumberInput id={id} value={volume.pageLimit} placeholder="None stated" onValue={value => setVolume({ pageLimit: value })} />}</Field>
        <Field label="Excluded by Section L" className="span-6" hint={volume.sourceRef ? `Source: ${volume.sourceRef}` : undefined}>{id => <TextInput id={id} value={volume.exclusions.join("; ")} placeholder="Cover; table of contents; acronym list" onValue={value => setVolume({ exclusions: value.split(";").map(entry => entry.trimStart()).filter((entry, index, all) => entry || index === all.length - 1) })} />}</Field>
        {budget.manual ? <Field label="Current pages" className="span-3" hint="For a volume with no counted sections yet.">{id => <NumberInput id={id} step={0.5} value={volume.manualPages} onValue={value => setVolume({ manualPages: value })} data-field="volume-pages" />}</Field> : null}
      </div>

      {budget.overAllocatedBy > 0 ? (
        <div className="notice" data-notice="over-allocated">
          <div className="notice-head"><Icon name="status-attention" /><span>Allocations exceed the limit</span></div>
          <p>Sections are allocated {pages(budget.allocated)}, {formatPages(budget.overAllocatedBy)} more than the {budget.limit}-page limit.</p>
        </div>
      ) : null}

      {budget.rows.length ? (
        <div className="table-wrap">
          <table className="dense" data-table="budget" data-volume={volume.name}>
            <thead>
              <tr><th>No</th><th>Section</th><th className="num">Allocated</th><th>Count by</th><th className="num">Pages</th><th className="num">Words</th><th className="num">Graphics pages</th><th className="num">Of allocation</th><th>Status</th><th>Counted</th></tr>
            </thead>
            <tbody>
              {budget.rows.map(row => <BudgetRow key={row.node.id} row={row} number={numbers.get(row.node.id) ?? ""} onNode={patch => setNode(row.node.id, patch)} parentExcluded={row.depth === 1 && Boolean(pursuit.outline.find(item => item.id === row.node.parentId)?.excluded)} />)}
            </tbody>
            <tfoot>
              <tr data-row="volume-total">
                <td /><td>Counted toward the limit{budget.excludedCurrent ? `. Excluded sections hold ${pages(budget.excludedCurrent)} more.` : ""}</td>
                <td className="num">{formatPages(budget.allocated)}</td><td /><td className="num">{formatPages(budget.current)}</td><td /><td />
                <td className="num">{budget.percent === null ? "" : `${budget.percent}% of limit`}</td><td>{budget.status}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : <p className="muted">No sections in this volume yet. Enter a current page count above, or add sections on the Outline screen.</p>}

      {pursuit.formatRules.length ? (
        <div className="stack" data-format-checklist={volume.name}>
          <h3 className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="format-check" /><span>Format check</span><span className="mono muted">{checked} of {pursuit.formatRules.length} checked</span></h3>
          <ul className="stack tight">
            {pursuit.formatRules.map(rule => (
              <li key={rule.id}>
                <Checkbox checked={Boolean(volume.formatChecks[rule.id])} onValue={value => setVolume({ formatChecks: { ...volume.formatChecks, [rule.id]: value } })}>
                  <span data-user-text>{rule.rule}</span> <span className="mono muted">{[rule.category, rule.sourceRef].filter(Boolean).join(" / ")}</span>
                </Checkbox>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Region>
  );
}

function BudgetRow({ row, number, onNode, parentExcluded }: { row: NodeBudget; number: string; onNode: (patch: Partial<OutlineNode>) => void; parentExcluded: boolean }) {
  const { node } = row;
  const estimate = node.countMode === "estimate";
  return (
    <tr data-node={node.title} className={row.excluded ? "is-muted" : undefined}>
      <td className="mono-cell">{number}</td>
      <td className={row.depth ? "indent-1" : undefined}>
        <span data-user-text>{node.title}</span>
        {row.childrenOverBy > 0 ? <span className="cell-note">Subsections allocate {formatPages(row.childrenOverBy)} more than this section.</span> : null}
      </td>
      <td className="num" style={{ width: 96 }}><NumberInput aria-label={`Allocated pages for ${node.title}`} step={0.5} value={node.pages} placeholder={row.allocationDerived ? formatPages(row.allocation) : ""} onValue={value => onNode({ pages: value })} /></td>
      <td style={{ width: 132 }}>{row.rollup ? <span className="muted">Subsections</span> : <Select aria-label={`Count method for ${node.title}`} value={node.countMode} onValue={value => onNode({ countMode: value === "estimate" ? "estimate" : "manual" })} options={[{ value: "manual", label: "Pages" }, { value: "estimate", label: "Word count" }]} />}</td>
      <td className="num" style={{ width: 96 }}>
        {row.rollup || estimate ? <span className="mono-cell" data-cell="pages">{formatPages(row.current === null ? null : Math.round(row.current * 10) / 10)}</span>
          : <NumberInput aria-label={`Current pages for ${node.title}`} step={0.5} value={node.currentPages} onValue={value => onNode({ currentPages: value })} />}
      </td>
      <td className="num" style={{ width: 104 }}>{!row.rollup && estimate ? <NumberInput aria-label={`Word count for ${node.title}`} step={50} max={10000000} value={node.wordCount} onValue={value => onNode({ wordCount: value })} /> : null}</td>
      <td className="num" style={{ width: 96 }}>{!row.rollup && estimate ? <NumberInput aria-label={`Graphics pages for ${node.title}`} step={0.5} value={node.graphicsPages} onValue={value => onNode({ graphicsPages: value })} /> : null}</td>
      <td className="num mono-cell">{row.percent === null ? "" : `${row.percent}%`}</td>
      <td><StatusWord value={row.status} /></td>
      <td>{parentExcluded ? <span className="muted">With its section</span> : <Checkbox checked={!node.excluded} label={`Count ${node.title} toward the page limit`} onValue={value => onNode({ excluded: !value })} />}</td>
    </tr>
  );
}

function FormatRules() {
  const { pursuit, update } = usePursuit();
  const set = (id: string, patch: Partial<FormatRule>) => update(current => ({ ...current, formatRules: current.formatRules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)) }));
  return (
    <Region name="budget-format-rules" className="section">
      <div className="section-head">
        <h2 className="panel-title"><Icon name="format-check" /><span>Format rules from Section L</span></h2>
        <Button icon="add" variant="primary" onClick={() => update(current => ({ ...current, formatRules: [...current.formatRules, { id: uid(), category: "Other", rule: "", sourceRef: "", quote: "" }] }))}>Add format rule</Button>
      </div>
      {pursuit.formatRules.length ? (
        <div className="table-wrap">
          <table className="dense" data-table="format-rules">
            <thead><tr><th>Kind</th><th>Rule</th><th>Ref</th><th>Actions</th></tr></thead>
            <tbody>
              {pursuit.formatRules.map(rule => (
                <tr key={rule.id}>
                  <td style={{ width: 176 }}><Select aria-label="Kind of rule" value={rule.category} onValue={value => set(rule.id, { category: value as FormatCategory })} options={FORMAT_CATEGORIES.map(category => ({ value: category, label: category }))} /></td>
                  <td><TextInput aria-label="Format rule" value={rule.rule} onValue={value => set(rule.id, { rule: value })} maxLength={600} placeholder="Pages shall be 8.5 x 11 inches with 1-inch margins" />{rule.quote && rule.quote !== rule.rule ? <span className="cell-note quote" data-user-text>{rule.quote}</span> : null}</td>
                  <td style={{ width: 112 }}><TextInput aria-label="Source reference" mono value={rule.sourceRef} onValue={value => set(rule.id, { sourceRef: value })} maxLength={80} placeholder="L.3.2" /></td>
                  <td><Button variant="quiet" icon="delete" onClick={() => update(current => ({ ...current, formatRules: current.formatRules.filter(item => item.id !== rule.id), volumes: current.volumes.map(volume => { const { [rule.id]: _removed, ...rest } = volume.formatChecks; return { ...volume, formatChecks: rest }; }) }))}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No format rules yet. Add page size, margins, font, spacing, graphics text size and header or footer rules, or apply them from the parser. Each volume then shows them as a checklist.</p>}
    </Region>
  );
}
