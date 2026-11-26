import { useState } from "react";
import { uid } from "../lib/model.ts";
import type { Person } from "../lib/model.ts";
import { removePerson } from "../lib/outline.ts";
import { usePursuit } from "../state.tsx";
import { Button, Dialog, EmptyState, Region, TextInput } from "../ui/kit.tsx";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Team({ go }: { go: (route: string) => void }) {
  const { pursuit, update } = usePursuit();
  const [removing, setRemoving] = useState<Person | null>(null);
  const add = () => update(current => ({ ...current, roster: [...current.roster, { id: uid(), name: "", email: "", role: "" }] }));
  const set = (id: string, patch: Partial<Person>) => update(current => ({ ...current, roster: current.roster.map(person => (person.id === id ? { ...person, ...patch } : person)) }));
  const owned = (id: string): number => pursuit.outline.filter(node => node.ownerId === id).length;
  const reviewing = (id: string): number => pursuit.outline.filter(node => node.reviewerId === id).length;
  return (
    <div className="page" data-view="team">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">Team</h1>
          {pursuit.roster.length ? <Region name="team-actions"><Button variant="primary" icon="add" onClick={add}>Add person</Button></Region> : null}
        </div>
        <p className="page-intro">The roster feeds every owner and reviewer list. Names and email addresses stay with this pursuit.</p>
      </header>
      {pursuit.roster.length ? (
        <Region name="team-roster" className="section">
          <div className="table-wrap">
            <table data-table="roster">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num">Owns</th><th className="num">Reviews</th><th>Actions</th></tr></thead>
              <tbody>
                {pursuit.roster.map(person => (
                  <tr key={person.id}>
                    <td><TextInput aria-label="Name" value={person.name} onValue={value => set(person.id, { name: value })} maxLength={120} placeholder="Name" /></td>
                    <td><TextInput aria-label="Email" type="email" value={person.email} onValue={value => set(person.id, { email: value })} maxLength={200} placeholder="name@astrion.us" aria-invalid={person.email !== "" && !EMAIL.test(person.email)} /></td>
                    <td><TextInput aria-label="Role" value={person.role} onValue={value => set(person.id, { role: value })} maxLength={120} placeholder="Volume lead, writer, reviewer" /></td>
                    <td className="num mono-cell">{owned(person.id)}</td>
                    <td className="num mono-cell">{reviewing(person.id)}</td>
                    <td className="nowrap">
                      <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                        <Button variant="quiet" icon="owner" iconSize={20} onClick={() => { try { window.sessionStorage.setItem("pwr:person", person.id); } catch { /* storage is off */ } go("outline"); }}>Assignments</Button>
                        <Button variant="quiet" icon="delete" onClick={() => (owned(person.id) + reviewing(person.id) + pursuit.requirements.filter(item => item.ownerId === person.id).length ? setRemoving(person) : update(current => removePerson(current, person.id)))}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Region>
      ) : (
        <EmptyState name="no-roster" title="No one on the roster yet" body="Add the people who own and review sections, so every section and requirement can carry a name."
          action={<Button variant="primary" icon="add" onClick={add}>Add person</Button>} />
      )}
      {removing ? (
        <Dialog name="remove-person" title="Remove this person" icon="delete" onClose={() => setRemoving(null)}
          footer={<><Button onClick={() => setRemoving(null)}>Cancel</Button><Button variant="primary" icon="delete" onClick={() => { update(current => removePerson(current, removing.id)); setRemoving(null); }}>Remove person</Button></>}>
          <p><span className="strong">{removing.name || removing.email || "This person"}</span> owns {owned(removing.id)} sections and reviews {reviewing(removing.id)}. Those assignments are cleared, and the sections show as unassigned.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
