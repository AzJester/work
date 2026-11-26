import { useRef, useState } from "react";
import { formatDate, formatDateLong, offDayReason } from "../lib/calendar.ts";
import { formatTime } from "../lib/exports.ts";
import { exportPursuitJson, newVolume, pursuitFileName, SUBMISSION_METHODS, TIME_ZONES, timeZoneLabel } from "../lib/model.ts";
import type { Pursuit, SubmissionMethod } from "../lib/model.ts";
import { calendarFor, internalSubmitDate } from "../lib/scheduler.ts";
import { useScheduleActions } from "../schedule-actions.tsx";
import { parsePursuitFile, useApp, usePursuit } from "../state.tsx";
import { Button, DateInput, Dialog, downloadFile, EmptyState, Field, Icon, NumberInput, Region, Select, TextInput, TimeInput, useToast } from "../ui/kit.tsx";

const move = <T,>(list: readonly T[], index: number, by: number): T[] => {
  const next = [...list];
  const target = index + by;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export function Setup({ go }: { go: (route: string) => void }) {
  const { pursuit, update } = usePursuit();
  const app = useApp();
  const actions = useScheduleActions();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<"pursuit" | string | null>(null);
  const [incoming, setIncoming] = useState<Pursuit | null>(null);
  const set = <K extends keyof Pursuit>(key: K, value: Pursuit[K]) => update(current => ({ ...current, [key]: value }));

  const calendar = calendarFor(pursuit.schedule.settings);
  const internal = pursuit.dueDate ? internalSubmitDate(pursuit.dueDate, pursuit.schedule.settings, calendar) : "";
  const dueOffDay = pursuit.dueDate ? offDayReason(pursuit.dueDate, calendar) : null;
  const volumeToDelete = typeof confirmDelete === "string" && confirmDelete !== "pursuit" ? pursuit.volumes.find(volume => volume.id === confirmDelete) : undefined;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parsePursuitFile(await file.text());
      if (app.summaries.some(item => item.id === parsed.id)) setIncoming(parsed);
      else { await app.addPursuit(parsed); toast("Pursuit imported", parsed.name); }
    } catch (error) {
      toast("Import failed", error instanceof Error ? error.message : "The file could not be read.");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="page" data-view="setup">
      <header className="page-head">
        <h1 className="page-title">Pursuit setup</h1>
        <p className="page-intro">The due date drives the schedule. Enter it once and every review date is planned back from it.</p>
      </header>

      <Region name="setup-identity" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="rfp" /><span>Solicitation</span></h2></div>
        <div className="form-grid">
          <Field label="Pursuit name" className="span-6">{id => <TextInput id={id} value={pursuit.name} onValue={value => set("name", value)} maxLength={160} />}</Field>
          <Field label="Agency" className="span-3">{id => <TextInput id={id} value={pursuit.agency} onValue={value => set("agency", value)} maxLength={160} />}</Field>
          <Field label="Solicitation number" className="span-3">{id => <TextInput id={id} mono value={pursuit.solicitationNumber} onValue={value => set("solicitationNumber", value)} maxLength={80} />}</Field>
          <Field label="RFP release date" className="span-3">{id => <DateInput id={id} value={pursuit.rfpReleaseDate} onValue={value => set("rfpReleaseDate", value)} />}</Field>
          <Field label="Q&A deadline" className="span-3">{id => <DateInput id={id} value={pursuit.qaDeadline} onValue={value => set("qaDeadline", value)} />}</Field>
          <Field label="Submission method" className="span-3">{id => <Select id={id} value={pursuit.submissionMethod} onValue={value => set("submissionMethod", value as SubmissionMethod)} options={SUBMISSION_METHODS} />}</Field>
          <div className="span-3" />
          <Field label="Capture manager" className="span-3">{id => <TextInput id={id} value={pursuit.captureManager} onValue={value => set("captureManager", value)} maxLength={120} />}</Field>
          <Field label="Proposal manager" className="span-3">{id => <TextInput id={id} value={pursuit.proposalManager} onValue={value => set("proposalManager", value)} maxLength={120} />}</Field>
        </div>
      </Region>

      <Region name="setup-due" className="section">
        <div className="section-head">
          <h2 className="panel-title"><Icon name="deadline" /><span>Due date</span></h2>
          {pursuit.dueDate ? <Button icon="schedule" iconSize={20} variant="primary" onClick={() => go("schedule")}>Open schedule</Button> : null}
        </div>
        <div className="form-grid">
          <Field label="Proposal due date" className="span-3" hint={pursuit.schedule.milestones.length ? "A new date is an amendment. You confirm the change before it applies." : "Setting the date plans the schedule."}>
            {id => <DateInput id={id} value={pursuit.dueDate} onValue={value => actions.requestDueDate(value)} data-field="due-date" />}
          </Field>
          <Field label="Due time" className="span-3">{id => <TimeInput id={id} value={pursuit.dueTime} onValue={value => set("dueTime", value || "14:00")} />}</Field>
          <Field label="Time zone" className="span-3">{id => <Select id={id} value={pursuit.timeZone} onValue={value => set("timeZone", value)} options={TIME_ZONES.some(zone => zone.value === pursuit.timeZone) ? TIME_ZONES : [...TIME_ZONES, { value: pursuit.timeZone, label: pursuit.timeZone }]} />}</Field>
        </div>
        {pursuit.dueDate ? (
          <dl className="spec" data-spec="due">
            <dt>Due</dt><dd data-value="due">{formatDateLong(pursuit.dueDate)}, {formatTime(pursuit.dueTime)} {timeZoneLabel(pursuit.timeZone)}</dd>
            <dt>Internal submit</dt>
            <dd data-value="internal-submit">{formatDateLong(internal)}{pursuit.schedule.settings.bufferEnabled ? `, ${pursuit.schedule.settings.bufferDays} business ${pursuit.schedule.settings.bufferDays === 1 ? "day" : "days"} before the due date` : ", the buffer is off"}</dd>
            {dueOffDay ? <><dt>Note</dt><dd>The due date falls on {dueOffDay === "Weekend" ? "a weekend" : dueOffDay}.</dd></> : null}
          </dl>
        ) : null}
        {pursuit.keyDates.length ? (
          <div className="stack">
            <span className="table-caption">Table 1: Key dates from the solicitation</span>
            <div className="table-wrap">
              <table className="dense" data-table="key-dates">
                <thead><tr><th>Date</th><th>Time</th><th>What</th><th>Ref</th></tr></thead>
                <tbody>
                  {pursuit.keyDates.map(item => (
                    <tr key={item.id}><td className="mono-cell">{formatDate(item.date) || "Not stated"}</td><td className="mono-cell">{[item.time, item.timeZone].filter(Boolean).join(" ")}</td><td>{item.label}</td><td className="mono-cell">{item.sourceRef}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Region>

      <Region name="setup-volumes" className="section">
        <div className="section-head">
          <h2 className="panel-title"><Icon name="volume" /><span>Volumes</span></h2>
          <Button icon="add" variant="primary" onClick={() => update(current => ({ ...current, volumes: [...current.volumes, newVolume(`Volume ${current.volumes.length + 1}`)] }))}>Add volume</Button>
        </div>
        {pursuit.volumes.length ? (
          <div className="table-wrap">
            <table data-table="volumes">
              <thead><tr><th>Volume</th><th className="num">Page limit</th><th>Excluded from the count</th><th className="num">Sections</th><th>Actions</th></tr></thead>
              <tbody>
                {pursuit.volumes.map((volume, index) => (
                  <tr key={volume.id} data-volume={volume.name}>
                    <td><TextInput aria-label="Volume name" value={volume.name} onValue={value => update(current => ({ ...current, volumes: current.volumes.map(item => (item.id === volume.id ? { ...item, name: value } : item)) }))} maxLength={160} /></td>
                    <td className="num" style={{ width: 120 }}><NumberInput aria-label={`Page limit for ${volume.name}`} value={volume.pageLimit} placeholder="None" onValue={value => update(current => ({ ...current, volumes: current.volumes.map(item => (item.id === volume.id ? { ...item, pageLimit: value } : item)) }))} /></td>
                    <td><TextInput aria-label={`Exclusions for ${volume.name}`} value={volume.exclusions.join("; ")} placeholder="Cover; table of contents" onValue={value => update(current => ({ ...current, volumes: current.volumes.map(item => (item.id === volume.id ? { ...item, exclusions: value.split(";").map(entry => entry.trimStart()).filter((entry, i, all) => entry || i === all.length - 1) } : item)) }))} /></td>
                    <td className="num mono-cell">{pursuit.outline.filter(node => node.volumeId === volume.id).length}</td>
                    <td className="nowrap">
                      <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                        <Button icon="arrow-up" variant="quiet" disabled={index === 0} onClick={() => update(current => ({ ...current, volumes: move(current.volumes, index, -1) }))}>Up</Button>
                        <Button icon="arrow-down" variant="quiet" disabled={index === pursuit.volumes.length - 1} onClick={() => update(current => ({ ...current, volumes: move(current.volumes, index, 1) }))}>Down</Button>
                        <Button icon="delete" variant="quiet" onClick={() => setConfirmDelete(volume.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No volumes yet. Add them here, or run the Section L and M parser to read them from the solicitation.</p>
        )}
      </Region>

      <Region name="setup-file" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="download" size={16} /><span>Pursuit file</span></h2></div>
        <p className="muted">The backup file holds the whole pursuit: setup, schedule, outline, page budget, compliance matrix and change log.</p>
        <div className="row">
          <Button icon="download" onClick={() => downloadFile(pursuitFileName(pursuit, "json", "pursuit"), exportPursuitJson(pursuit), "application/json")}>Export pursuit JSON</Button>
          <Button icon="upload" onClick={() => fileInput.current?.click()}>Import pursuit JSON</Button>
          <Button icon="copy" onClick={() => void app.duplicatePursuit().then(() => toast("Pursuit duplicated"))}>Duplicate pursuit</Button>
          <Button icon="delete" onClick={() => setConfirmDelete("pursuit")}>Delete pursuit</Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Pursuit file to import" data-input="import-pursuit" onChange={event => void readFile(event.target.files?.[0])} />
        </div>
      </Region>

      {confirmDelete === "pursuit" ? (
        <Dialog name="delete-pursuit" title="Delete this pursuit" icon="delete" onClose={() => setConfirmDelete(null)}
          footer={<><Button onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="primary" icon="delete" onClick={() => { setConfirmDelete(null); void app.deletePursuit(pursuit.id).then(() => toast("Pursuit deleted")); }}>Delete pursuit</Button></>}>
          <p><span className="strong">{pursuit.name}</span> and everything in it will be removed from storage. Export the pursuit file first if you may need it again.</p>
        </Dialog>
      ) : null}
      {volumeToDelete ? (
        <Dialog name="delete-volume" title="Delete this volume" icon="delete" onClose={() => setConfirmDelete(null)}
          footer={<><Button onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="primary" icon="delete" onClick={() => {
            update(current => {
              const gone = new Set(current.outline.filter(node => node.volumeId === volumeToDelete.id).map(node => node.id));
              return { ...current, volumes: current.volumes.filter(item => item.id !== volumeToDelete.id), outline: current.outline.filter(node => !gone.has(node.id)), requirements: current.requirements.map(item => ({ ...item, sectionIds: item.sectionIds.filter(id => !gone.has(id)) })) };
            });
            setConfirmDelete(null);
          }}>Delete volume</Button></>}>
          <p><span className="strong">{volumeToDelete.name}</span> has {pursuit.outline.filter(node => node.volumeId === volumeToDelete.id).length} sections. They are deleted with it, and requirements mapped to them lose that mapping.</p>
        </Dialog>
      ) : null}
      {incoming ? (
        <Dialog name="import-conflict" title="This pursuit is already here" icon="upload" onClose={() => setIncoming(null)}
          footer={<>
            <Button onClick={() => setIncoming(null)}>Cancel</Button>
            <Button onClick={() => { const copy = { ...incoming, id: crypto.randomUUID(), name: `${incoming.name} (imported)` }; setIncoming(null); void app.addPursuit(copy).then(() => toast("Pursuit imported as a copy")); }}>Add as a copy</Button>
            <Button variant="primary" onClick={() => { const file = incoming; setIncoming(null); void app.openPursuit(file.id).then(() => { app.update(() => file); toast("Pursuit replaced from the file"); }); }}>Replace the saved one</Button>
          </>}>
          <p>The file holds <span className="strong">{incoming.name}</span>, last changed {formatDate(incoming.updatedAt.slice(0, 10))}. A pursuit with the same identity is already saved. Replacing overwrites the saved one with the file.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

export function NoPursuit({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="page" data-view="no-pursuit">
      <header className="page-head"><h1 className="page-title">Proposal war room</h1></header>
      <EmptyState name="no-pursuit" title="No pursuit yet" body="Create a pursuit, enter its due date, and the review schedule is planned back from it."
        action={<Button variant="primary" icon="add" onClick={onCreate}>New pursuit</Button>} />
    </div>
  );
}
