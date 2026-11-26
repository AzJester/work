import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./data/cloud.ts";
import { formatPages, volumesOverLimit } from "./lib/pagebudget.ts";
import { ScheduleActionsProvider } from "./schedule-actions.tsx";
import { AppProvider, parsePursuitFile, useApp } from "./state.tsx";
import type { Mode } from "./state.tsx";
import { Button, Dialog, Field, Icon, IconSprite, ScreenIonContext, Select, StatusWord, TextInput, ThemeContext, ToastHost, useToast, Wordmark } from "./ui/kit.tsx";
import type { IconName, Theme } from "./ui/kit.tsx";
import { Compliance } from "./views/Compliance.tsx";
import { Dashboard } from "./views/Dashboard.tsx";
import { Outline } from "./views/Outline.tsx";
import { PageBudget } from "./views/PageBudget.tsx";
import { Parser, ParserSessionProvider } from "./views/Parser.tsx";
import { Schedule } from "./views/Schedule.tsx";
import { Settings } from "./views/Settings.tsx";
import { NoPursuit, Setup } from "./views/Setup.tsx";
import { SignIn } from "./views/SignIn.tsx";
import { StyleCheck } from "./views/StyleCheck.tsx";
import { Team } from "./views/Team.tsx";

type Route = "dashboard" | "setup" | "schedule" | "outline" | "budget" | "compliance" | "parser" | "team" | "settings" | "style";

const NAV: readonly { route: Route; label: string; icon: IconName }[] = [
  { route: "dashboard", label: "Dashboard", icon: "home" },
  { route: "setup", label: "Pursuit setup", icon: "rfp" },
  { route: "schedule", label: "Schedule", icon: "schedule" },
  { route: "outline", label: "Outline", icon: "outline" },
  { route: "budget", label: "Page budget", icon: "page-limit" },
  { route: "compliance", label: "Compliance", icon: "compliance-matrix" },
  { route: "parser", label: "L/M parser", icon: "agent" },
  { route: "team", label: "Team", icon: "team" },
  { route: "settings", label: "Settings", icon: "settings" },
];
const ROUTES = new Set<string>([...NAV.map(item => item.route), "style"]);

function readLocal(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function writeLocal(key: string, value: string | null): void { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage is off */ } }

function useRoute(): [Route, (route: string) => void] {
  const read = (): Route => { const hash = window.location.hash.replace(/^#\/?/, ""); return (ROUTES.has(hash) ? hash : "dashboard") as Route; };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => { const on = () => setRoute(read()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const go = useCallback((next: string) => { window.location.hash = `/${next}`; window.scrollTo(0, 0); }, []);
  return [route, go];
}

type Session = { mode: Mode; email: string } | null | "loading";

export function App() {
  const [theme, setThemeState] = useState<Theme>(() => (readLocal("pwr:theme") === "light" ? "light" : "dark"));
  const [session, setSession] = useState<Session>("loading");
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const setTheme = useCallback((next: Theme) => { setThemeState(next); writeLocal("pwr:theme", next); }, []);

  useEffect(() => {
    if (readLocal("pwr:mode") === "device") { setSession({ mode: "device", email: "" }); return; }
    let alive = true;
    void supabase().auth.getSession().then(({ data }) => { if (alive) setSession(data.session ? { mode: "cloud", email: data.session.user.email ?? "" } : null); });
    const { data } = supabase().auth.onAuthStateChange((_event, next) => {
      if (!alive || readLocal("pwr:mode") === "device") return;
      setSession(current => {
        if (!next) return null;
        const email = next.user.email ?? "";
        return current && current !== "loading" && current.mode === "cloud" && current.email === email ? current : { mode: "cloud", email };
      });
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const leave = useCallback(async () => {
    if (readLocal("pwr:mode") === "device") { writeLocal("pwr:mode", null); setSession(null); return; }
    await supabase().auth.signOut();
    setSession(null);
  }, []);

  return (
    <ThemeContext.Provider value={theme}>
      <IconSprite />
      <ToastHost>
        {session === "loading" ? <div className="signin"><p className="mono muted">Loading</p></div>
          : session === null ? <SignIn onDevice={() => { writeLocal("pwr:mode", "device"); setSession({ mode: "device", email: "" }); }} />
          : <AppProvider key={`${session.mode}:${session.email}`} mode={session.mode} email={session.email} theme={theme} setTheme={setTheme} onLeave={leave}><Shell /></AppProvider>}
      </ToastHost>
    </ThemeContext.Provider>
  );
}

function Shell() {
  const app = useApp();
  const toast = useToast();
  const [route, go] = useRoute();
  const [creating, setCreating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const over = app.pursuit ? volumesOverLimit(app.pursuit) : [];
  const alertOn = over.length > 0;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parsePursuitFile(await file.text());
      const exists = app.summaries.some(item => item.id === parsed.id);
      await app.addPursuit(exists ? { ...parsed, id: crypto.randomUUID(), name: `${parsed.name} (imported)` } : parsed);
      toast("Pursuit imported", exists ? "A pursuit with the same identity was already saved, so the file came in as a copy." : parsed.name);
      go("setup");
    } catch (error) {
      toast("Import failed", error instanceof Error ? error.message : "The file could not be read.");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  let view: ReactNode;
  if (route === "style") view = <StyleCheck />;
  else if (app.loading) view = <div className="page"><p className="mono muted">Loading</p></div>;
  else if (!app.pursuit) view = <NoPursuit onCreate={() => setCreating(true)} />;
  else view = <ScheduleActionsProvider><ParserSessionProvider key={app.pursuit.id}><PursuitView route={route} go={go} /></ParserSessionProvider></ScheduleActionsProvider>;

  return (
    <div className="shell">
      <nav className="nav" data-region="nav" aria-label="Main">
        <div className="nav-brand">
          <Wordmark />
          <p className="mono muted nav-app">Proposal war room</p>
        </div>
        <div className="nav-section stack">
          <div className="field">
            <label className="label" htmlFor="pursuit-switcher" style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="opportunity" /><span>Pursuit</span></label>
            {app.summaries.length ? (
              <Select id="pursuit-switcher" value={app.pursuit?.id ?? ""} onValue={id => void app.openPursuit(id)}
                options={app.summaries.map(item => ({ value: item.id, label: item.solicitationNumber ? `${item.name} (${item.solicitationNumber})` : item.name }))} />
            ) : <p className="caption" id="pursuit-switcher">None yet</p>}
          </div>
          <div className="row">
            <Button icon="add" onClick={() => setCreating(true)}>New pursuit</Button>
            <Button icon="upload" iconOnly onClick={() => fileInput.current?.click()}>Import a pursuit file</Button>
            <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Pursuit file to import" data-input="nav-import" onChange={event => void importFile(event.target.files?.[0])} />
          </div>
        </div>
        <div className="nav-section">
          <ul className="nav-list">
            {NAV.map(item => (
              <li key={item.route}>
                <a className="nav-item" href={`#/${item.route}`} aria-current={route === item.route ? "page" : undefined} data-nav={item.route}>
                  <Icon name={item.icon} /><span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="nav-foot">
          <div className="stack tight" data-save-state={app.saveState}>
            <StatusWord value={app.saveState} size={16} />
            <span className="caption">{app.mode === "device" ? "This device only" : app.email}</span>
            {app.saveState === "Not saved" && !app.conflict ? <span className="caption">{app.saveError || "The last change is not saved."}</span> : null}
            {app.saveState === "Not saved" && !app.conflict ? <Button icon="refresh" onClick={app.retrySave}>Save again</Button> : null}
          </div>
          <Button onClick={() => app.setTheme(app.theme === "dark" ? "light" : "dark")} data-action="theme">{app.theme === "dark" ? "Light theme" : "Dark theme"}</Button>
          <Button onClick={() => void app.leave()}>{app.mode === "device" ? "Sign in" : "Sign out"}</Button>
        </div>
      </nav>
      <main className="main">
        {alertOn && route !== "style" ? (
          <div className="top-alert" role="alert" data-region="alert" data-alert="page-limit">
            <Icon name="status-blocked" />
            <span className="alert-title">{over.length === 1 ? `${over[0].volume.name} is over its page limit` : `${over.length} volumes are over their page limits`}</span>
            <span>{over.map(item => `${over.length > 1 ? `${item.volume.name}: ` : ""}${formatPages(item.current)} of ${formatPages(item.limit)} pages, ${item.percent}%`).join(". ")}.</span>
            {route !== "budget" ? <Button onClick={() => go("budget")}>Open page budget</Button> : null}
          </div>
        ) : null}
        {app.loadError ? <div className="page"><div className="notice" role="alert"><div className="notice-head"><Icon name="issue" /><span>Storage problem</span></div><p>{app.loadError}</p></div></div> : null}
        <ScreenIonContext.Provider value={alertOn && route === "dashboard"}>{view}</ScreenIonContext.Provider>
      </main>
      {creating ? <NewPursuitDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); go("setup"); }} /> : null}
      {app.conflict ? (
        <Dialog name="save-conflict" title="This pursuit changed somewhere else" icon="issue" onClose={() => undefined}
          footer={<><Button onClick={() => void app.resolveConflict("theirs")}>Load the other version</Button><Button variant="primary" onClick={() => void app.resolveConflict("mine")}>Keep this version</Button></>}>
          <p>Another window or device saved this pursuit after this one opened it. Loading the other version drops the changes made here since the last save. Keeping this version overwrites the other one.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function NewPursuitDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const app = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    setBusy(true);
    try { await app.createPursuit(name); onCreated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The pursuit could not be created."); setBusy(false); }
  };
  return (
    <Dialog name="new-pursuit" title="New pursuit" icon="opportunity" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="add" disabled={busy} onClick={() => void create()}>Create pursuit</Button></>}>
      <Field label="Pursuit name">{id => <TextInput id={id} value={name} onValue={setName} autoFocus maxLength={160} placeholder="Program or opportunity name" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void create(); } }} />}</Field>
      {error ? <p role="alert">{error}</p> : null}
    </Dialog>
  );
}

function PursuitView({ route, go }: { route: Route; go: (route: string) => void }) {
  switch (route) {
    case "setup": return <Setup go={go} />;
    case "schedule": return <Schedule go={go} />;
    case "outline": return <Outline go={go} />;
    case "team": return <Team go={go} />;
    case "budget": return <PageBudget go={go} />;
    case "compliance": return <Compliance />;
    case "parser": return <Parser go={go} />;
    case "settings": return <Settings go={go} />;
    default: return <Dashboard go={go} />;
  }
}
