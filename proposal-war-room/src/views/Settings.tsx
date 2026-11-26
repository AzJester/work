import { useApp, usePursuit } from "../state.tsx";
import { Button, Field, Icon, NumberInput, Region } from "../ui/kit.tsx";

export function Settings({ go }: { go: (route: string) => void }) {
  const app = useApp();
  const { pursuit, update } = usePursuit();
  return (
    <div className="page" data-view="settings">
      <header className="page-head"><h1 className="page-title">Settings</h1></header>

      <Region name="settings-display" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="visible" size={16} /><span>Display</span></h2></div>
        <div className="field">
          <span className="label">Theme</span>
          <div className="seg" role="group" aria-label="Theme">
            <Button on={app.theme === "dark"} onClick={() => app.setTheme("dark")}>Dark</Button>
            <Button on={app.theme === "light"} onClick={() => app.setTheme("light")}>Light</Button>
          </div>
          <span className="hint">Dark is the default. Light is for printing and projection.</span>
        </div>
        <dl className="spec" data-spec="brand">
          <dt>Brand</dt><dd>Astrion Brand Kit v1.0 palette, Archivo and JetBrains Mono</dd>
          <dt>Icons</dt><dd data-value="icons">Icons: provisional Astrion set</dd>
          <dt>Status</dt><dd>Every status is a word, with an icon where the set has one. Astrion has no status colors, so the app uses none.</dd>
        </dl>
        <div className="row"><Button onClick={() => go("style")}>Open the style check</Button></div>
      </Region>

      <Region name="settings-pursuit" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="page-limit" /><span>This pursuit</span></h2></div>
        <div className="form-grid">
          <Field label="Words per page" className="span-3" hint="Turns a word count into pages on the page budget.">{id => <NumberInput id={id} min={100} max={1500} step={10} value={pursuit.wordsPerPage} onValue={value => update(current => ({ ...current, wordsPerPage: Math.max(100, Math.min(1500, value ?? 500)) }))} />}</Field>
        </div>
        <p className="caption">The scheduling mode, the internal submit buffer and company blackout days are on the Schedule screen, under Planning rules.</p>
      </Region>

      <Region name="settings-storage" className="section">
        <div className="section-head"><h2 className="panel-title"><Icon name="user" size={16} /><span>Account and storage</span></h2></div>
        <dl className="spec" data-spec="storage">
          <dt>Signed in</dt><dd>{app.mode === "cloud" ? app.email : "No. This device only"}</dd>
          <dt>Saved to</dt><dd>{app.mode === "cloud" ? "This account. Only this account can read or change its pursuits." : "This browser. Clearing site data removes it, so export the pursuit file as a backup."}</dd>
          <dt>Autosave</dt><dd>Every change, a moment after you make it</dd>
          <dt>Claude</dt><dd>{app.mode === "cloud" ? "The Section L/M parser and the status update call Claude through a server route. The key stays on the server." : "Off until you sign in."}</dd>
        </dl>
        <p className="caption">Keep to released solicitation text and planning data. Nothing classified, controlled unclassified, export controlled or proprietary belongs here.</p>
      </Region>
    </div>
  );
}
