import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { todayISO } from "./lib/calendar.ts";
import type { ISODate } from "./lib/calendar.ts";
import { clonePursuit, newPursuit, normalizePursuit } from "./lib/model.ts";
import type { Pursuit } from "./lib/model.ts";
import { supabase } from "./data/cloud.ts";
import { CloudStore, DeviceStore, SaveConflictError } from "./data/store.ts";
import type { PursuitStore, PursuitSummary } from "./data/store.ts";
import type { Theme } from "./ui/kit.tsx";

export type Mode = "cloud" | "device";
export type SaveState = "Saved" | "Saving" | "Not saved";

interface AppValue {
  mode: Mode;
  email: string;
  summaries: PursuitSummary[];
  pursuit: Pursuit | null;
  loading: boolean;
  loadError: string;
  saveState: SaveState;
  saveError: string;
  conflict: boolean;
  today: ISODate;
  theme: Theme;
  setTheme(theme: Theme): void;
  update(change: (pursuit: Pursuit) => Pursuit): void;
  openPursuit(id: string): Promise<void>;
  createPursuit(name: string): Promise<void>;
  addPursuit(pursuit: Pursuit): Promise<void>;
  duplicatePursuit(): Promise<void>;
  deletePursuit(id: string): Promise<void>;
  retrySave(): void;
  resolveConflict(choice: "theirs" | "mine"): Promise<void>;
  leave(): Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp needs the app provider");
  return value;
}

/** The open pursuit. Views that need one are only drawn when one is open. */
export function usePursuit(): { pursuit: Pursuit; update: AppValue["update"]; today: ISODate } {
  const { pursuit, update, today } = useApp();
  if (!pursuit) throw new Error("No pursuit is open");
  return { pursuit, update, today };
}

const now = (): string => new Date().toISOString();
const SAVE_DELAY_MS = 600;
const lastKey = (mode: Mode): string => `pwr:last:${mode}`;

function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string | null): void {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* storage is off */ }
}

export function AppProvider({ mode, email, theme, setTheme, onLeave, children }: { mode: Mode; email: string; theme: Theme; setTheme(theme: Theme): void; onLeave(): Promise<void>; children: ReactNode }) {
  const store: PursuitStore = useMemo(() => (mode === "cloud" ? new CloudStore(supabase()) : new DeviceStore()), [mode]);
  const [summaries, setSummaries] = useState<PursuitSummary[]>([]);
  const [pursuit, setPursuit] = useState<Pursuit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("Saved");
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [today, setToday] = useState<ISODate>(() => todayISO());

  const current = useRef<Pursuit | null>(null);
  const revision = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const blocked = useRef(false);

  const remember = useCallback((next: Pursuit) => {
    setSummaries(list => [{ id: next.id, name: next.name, solicitationNumber: next.solicitationNumber, dueDate: next.dueDate, updatedAt: next.updatedAt }, ...list.filter(item => item.id !== next.id)]);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (saving.current || !dirty.current || blocked.current) return;
    const snapshot = current.current;
    if (!snapshot) return;
    saving.current = true;
    dirty.current = false;
    try {
      revision.current = await store.save(snapshot, revision.current);
      setSaveError("");
      if (!dirty.current) setSaveState("Saved");
    } catch (error) {
      dirty.current = true;
      if (error instanceof SaveConflictError) {
        blocked.current = true;
        setConflict(true);
      } else {
        setSaveError(error instanceof Error ? error.message : "The save failed.");
        timer.current = window.setTimeout(() => void flush(), 8000);
      }
      setSaveState("Not saved");
    } finally {
      saving.current = false;
      if (dirty.current && !blocked.current && !timer.current) timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    }
  }, [store]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = undefined; void flush(); }, SAVE_DELAY_MS);
  }, [flush]);

  const update = useCallback((change: (pursuit: Pursuit) => Pursuit) => {
    const before = current.current;
    if (!before) return;
    const changed = change(before);
    if (changed === before) return;
    const next = { ...changed, updatedAt: now() };
    current.current = next;
    dirty.current = true;
    setPursuit(next);
    remember(next);
    setSaveState("Saving");
    schedule();
  }, [remember, schedule]);

  const show = useCallback((next: Pursuit | null, rev: number) => {
    current.current = next;
    revision.current = rev;
    dirty.current = false;
    blocked.current = false;
    setConflict(false);
    setPursuit(next);
    setSaveState("Saved");
    setSaveError("");
    writeLocal(lastKey(mode), next ? next.id : null);
  }, [mode]);

  const openPursuit = useCallback(async (id: string) => {
    await flush();
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await store.load(id);
      show(loaded ? loaded.pursuit : null, loaded ? loaded.revision : 0);
      if (!loaded) setLoadError("That pursuit is no longer in storage.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The pursuit could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [flush, show, store]);

  const addPursuit = useCallback(async (next: Pursuit) => {
    await flush();
    const rev = await store.create(next);
    remember(next);
    show(next, rev);
  }, [flush, remember, show, store]);

  const createPursuit = useCallback((name: string) => addPursuit(newPursuit(name.trim() || "Untitled pursuit", now())), [addPursuit]);

  const duplicatePursuit = useCallback(async () => {
    const source = current.current;
    if (source) await addPursuit(clonePursuit(source, `${source.name} (copy)`, now()));
  }, [addPursuit]);

  const deletePursuit = useCallback(async (id: string) => {
    window.clearTimeout(timer.current);
    dirty.current = false;
    await store.remove(id);
    const rest = summaries.filter(item => item.id !== id);
    setSummaries(rest);
    if (current.current?.id === id) {
      show(null, 0);
      if (rest[0]) await openPursuit(rest[0].id);
    }
  }, [openPursuit, show, store, summaries]);

  const resolveConflict = useCallback(async (choice: "theirs" | "mine") => {
    const mine = current.current;
    if (!mine) return;
    if (choice === "theirs") {
      dirty.current = false;
      await openPursuit(mine.id);
      return;
    }
    revision.current = await store.save(mine, revision.current, true);
    dirty.current = false;
    blocked.current = false;
    setConflict(false);
    setSaveState("Saved");
  }, [openPursuit, store]);

  // First load: the pursuit this browser had open last, or the newest one.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await store.list();
        if (!alive) return;
        setSummaries(list);
        const last = readLocal(lastKey(mode));
        const pick = list.find(item => item.id === last) ?? list[0];
        if (pick) {
          const loaded = await store.load(pick.id);
          if (alive && loaded) show(loaded.pursuit, loaded.revision);
        }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Pursuits could not be loaded.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [mode, show, store]);

  useEffect(() => {
    const tick = window.setInterval(() => setToday(todayISO()), 60_000);
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { void flush(); event.preventDefault(); } };
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hide);
    return () => { window.clearInterval(tick); window.removeEventListener("beforeunload", warn); document.removeEventListener("visibilitychange", hide); };
  }, [flush]);

  const leave = useCallback(async () => { await flush(); await onLeave(); }, [flush, onLeave]);
  const retrySave = useCallback(() => { void flush(); }, [flush]);

  const value: AppValue = {
    mode, email, summaries, pursuit, loading, loadError, saveState, saveError, conflict, today, theme, setTheme,
    update, openPursuit, createPursuit, addPursuit, duplicatePursuit, deletePursuit, retrySave, resolveConflict, leave,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Reads a pursuit backup file. Throws with a plain message when the file is not one. */
export function parsePursuitFile(textContent: string): Pursuit {
  let raw: unknown;
  try { raw = JSON.parse(textContent); } catch { throw new Error("This file is not valid JSON."); }
  return normalizePursuit(raw, now());
}
