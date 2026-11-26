import { Button, Checkbox, CountdownBlock, DateInput, Field, Icon, Region, Select, StatusWord, TextInput } from "../ui/kit.tsx";
import { useState } from "react";

/** One screen that shows every brand decision the app makes: type, a table, buttons, statuses, Gantt bar styles. */
export function StyleCheck() {
  const [text, setText] = useState("W91CRB-27-R-0007");
  const [date, setDate] = useState("2027-01-19");
  const [pick, setPick] = useState("portal");
  const [checked, setChecked] = useState(true);
  return (
    <div className="page" data-view="style-check">
      <header className="page-head">
        <h1 className="page-title">Style check</h1>
        <p className="mono muted">Astrion brand kit v1.0 / icons: provisional Astrion set</p>
      </header>

      <Region name="style-type" className="section">
        <div className="section-head"><h2 className="panel-title">Type scale</h2></div>
        <div className="stack loose">
          <div className="stack tight"><span className="label">Page title, Archivo 700, 24 px, uppercase</span><p className="page-title">Proposal war room</p></div>
          <div className="stack tight"><span className="label">Panel title, Archivo 700, 16 px</span><p className="panel-title">Page budget by volume</p></div>
          <div className="stack tight"><span className="label">Body, Archivo 400, 14 px / 1.5</span><p>Every review date is planned back from internal submit and counted in business days.</p></div>
          <div className="stack tight"><span className="label">Mono label, JetBrains Mono 500, 11 px, 0.18em</span><p className="mono">L.3.1 / Req L-004 / 19 Jan 2027</p></div>
        </div>
      </Region>

      <div className="grid cols-2">
        <Region name="style-countdown" ion className="panel">
          <div className="panel-head"><h2 className="panel-title">Countdown</h2></div>
          <CountdownBlock name="style" value="6" caption="Business days to Red team" signal />
        </Region>
        <Region name="style-buttons" className="panel">
          <div className="panel-head"><h2 className="panel-title">Buttons</h2></div>
          <div className="row">
            <Button variant="primary" icon="add">Add section</Button>
            <Button icon="download">Export CSV</Button>
            <Button variant="strong">Apply plan</Button>
            <Button variant="quiet" icon="edit">Edit</Button>
            <Button icon="delete" iconOnly>Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Region>
      </div>

      <Region name="style-fields" className="section">
        <div className="section-head"><h2 className="panel-title">Fields</h2></div>
        <div className="form-grid">
          <Field label="Solicitation number" className="span-3">{id => <TextInput id={id} value={text} onValue={setText} mono />}</Field>
          <Field label="Proposal due date" className="span-3">{id => <DateInput id={id} value={date} onValue={setDate} />}</Field>
          <Field label="Submission method" className="span-3">{id => <Select id={id} value={pick} onValue={setPick} options={[{ value: "portal", label: "Portal" }, { value: "email", label: "Email" }, { value: "hand", label: "Hand delivery" }]} />}</Field>
          <div className="field span-3"><span className="label">Page count</span><Checkbox checked={checked} onValue={setChecked}>Excluded from the page count</Checkbox></div>
        </div>
      </Region>

      <Region name="style-status" className="section">
        <div className="section-head"><h2 className="panel-title">Status words and icons</h2></div>
        <div className="row" style={{ gap: 24 }}>
          {["Within", "Near limit", "Over", "Not started", "Outlining", "Drafting", "In review", "Final", "Open", "Addressed", "Verified compliant", "Gap", "N/A", "Ready", "Not ready"].map(word => <StatusWord key={word} value={word} />)}
        </div>
        <div className="row" style={{ gap: 24 }}>
          <span className="status"><Icon name="color-review" /><span>Pink team</span></span>
          <span className="status"><Icon name="color-review" /><span>Red team</span></span>
          <span className="status"><Icon name="color-review" /><span>Gold team</span></span>
          <span className="status"><Icon name="lock" size={16} /><span>Locked date</span></span>
        </div>
      </Region>

      <Region name="style-table" className="section">
        <div className="section-head"><h2 className="panel-title">Table 1: Sample compliance rows</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Req ID</th><th>Ref</th><th>Requirement</th><th>Status</th><th className="num">Pages</th></tr></thead>
            <tbody>
              <tr><td className="mono-cell">L-001</td><td className="mono-cell">L.4.1</td><td>The offeror shall describe its technical approach to SOW tasks 3.1 through 3.4.</td><td><StatusWord value="Addressed" /></td><td className="num mono-cell">12</td></tr>
              <tr className="is-selected"><td className="mono-cell">L-002</td><td className="mono-cell">L.4.2</td><td>The offeror shall describe its approach to identifying and mitigating technical and schedule risk.</td><td><StatusWord value="Gap" /></td><td className="num mono-cell">6</td></tr>
              <tr><td className="mono-cell">M-001</td><td className="mono-cell">M.2</td><td>Factor 1, Technical<span className="cell-note">Source: M.2, quoted on the parser review screen.</span></td><td><StatusWord value="Open" /></td><td className="num mono-cell">0</td></tr>
            </tbody>
          </table>
        </div>
      </Region>

      <Region name="style-gantt" ion className="section">
        <div className="section-head"><h2 className="panel-title">Gantt bar styles</h2></div>
        <div className="gantt-wrap">
          <div className="gantt" style={{ minWidth: 640 }}>
            <div className="gantt-body">
              <div className="gantt-offdays"><div className="gantt-offday" style={{ left: 264, width: 48 }} title="Weekend" /></div>
              {[{ label: "Red team review", kind: "review", left: 96, width: 48 }, { label: "Red recovery", kind: "work", left: 144, width: 120 }, { label: "Internal submit", kind: "point", left: 336, width: 0 }].map(row => (
                <div className="gantt-row" key={row.label}>
                  <div className="gantt-label"><Icon name={row.kind === "review" ? "color-review" : row.kind === "point" ? "milestone" : "schedule"} size={row.kind === "point" ? 16 : 20} /><span>{row.label}</span>{row.kind === "point" ? <Icon name="lock" size={16} label="Locked" /> : null}</div>
                  <div className="gantt-track">
                    {row.kind === "point"
                      ? <div className="gantt-point" style={{ left: row.left }}><Icon name="milestone" size={16} /></div>
                      : <div className={`gantt-bar ${row.kind === "review" ? "is-review" : "is-work"}`} style={{ left: row.left, width: row.width }} />}
                  </div>
                </div>
              ))}
              <div className="gantt-today" style={{ left: 248 + 60 }}><span className="gantt-today-label">Today</span></div>
            </div>
          </div>
        </div>
        <div className="gantt-legend">
          <span><span className="swatch is-review" />Review session</span>
          <span><span className="swatch is-work" />Recovery and production</span>
          <span><span className="swatch is-off" />Weekend, federal holiday or blackout</span>
        </div>
      </Region>
    </div>
  );
}
