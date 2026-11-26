import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePursuit } from "../lib/model.ts";
import type { Pursuit } from "../lib/model.ts";
import { PURSUITS_TABLE } from "./config.ts";

export interface PursuitSummary {
  id: string;
  name: string;
  solicitationNumber: string;
  dueDate: string;
  updatedAt: string;
}

export interface Loaded { pursuit: Pursuit; revision: number }

/** The copy in storage is newer than the one this window started from. */
export class SaveConflictError extends Error {
  constructor() { super("This pursuit was changed somewhere else."); }
}

export interface PursuitStore {
  /** "cloud": saved to the signed-in account. "device": saved in this browser only. */
  kind: "cloud" | "device";
  list(): Promise<PursuitSummary[]>;
  load(id: string): Promise<Loaded | null>;
  create(pursuit: Pursuit): Promise<number>;
  /** Saves over the given revision and returns the new one. Rejects with SaveConflictError when storage has moved on. */
  save(pursuit: Pursuit, revision: number, force?: boolean): Promise<number>;
  remove(id: string): Promise<void>;
}

const summaryOf = (pursuit: Pursuit): PursuitSummary => ({
  id: pursuit.id, name: pursuit.name, solicitationNumber: pursuit.solicitationNumber, dueDate: pursuit.dueDate, updatedAt: pursuit.updatedAt,
});

/* ---------- This browser only ---------- */

const INDEX_KEY = "pwr:index";
const itemKey = (id: string): string => `pwr:pursuit:${id}`;

export class DeviceStore implements PursuitStore {
  readonly kind = "device" as const;
  private readonly storage: Storage;
  constructor(storage: Storage = window.localStorage) { this.storage = storage; }

  private index(): PursuitSummary[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(INDEX_KEY) ?? "[]");
      return Array.isArray(value) ? (value as PursuitSummary[]).filter(item => item && typeof item.id === "string") : [];
    } catch {
      return [];
    }
  }

  private writeIndex(pursuit: Pursuit): void {
    const rest = this.index().filter(item => item.id !== pursuit.id);
    this.storage.setItem(INDEX_KEY, JSON.stringify([summaryOf(pursuit), ...rest]));
  }

  async list(): Promise<PursuitSummary[]> {
    return this.index().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async load(id: string): Promise<Loaded | null> {
    const raw = this.storage.getItem(itemKey(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as { revision?: number; pursuit?: unknown };
    return { pursuit: normalizePursuit(value.pursuit, new Date().toISOString()), revision: Number(value.revision) || 1 };
  }

  async create(pursuit: Pursuit): Promise<number> {
    this.storage.setItem(itemKey(pursuit.id), JSON.stringify({ revision: 1, pursuit }));
    this.writeIndex(pursuit);
    return 1;
  }

  async save(pursuit: Pursuit, revision: number, force = false): Promise<number> {
    const raw = this.storage.getItem(itemKey(pursuit.id));
    const stored = raw ? Number((JSON.parse(raw) as { revision?: number }).revision) || 1 : 0;
    if (!force && stored > revision) throw new SaveConflictError();
    const next = Math.max(stored, revision) + 1;
    this.storage.setItem(itemKey(pursuit.id), JSON.stringify({ revision: next, pursuit }));
    this.writeIndex(pursuit);
    return next;
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(itemKey(id));
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.index().filter(item => item.id !== id)));
  }
}

/* ---------- The signed-in account, in Supabase ---------- */

interface Row { id: string; name: string; solicitation_number: string; due_date: string | null; updated_at: string; revision: number; data: unknown }

export class CloudStore implements PursuitStore {
  readonly kind = "cloud" as const;
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) { this.client = client; }

  async list(): Promise<PursuitSummary[]> {
    const { data, error } = await this.client.from(PURSUITS_TABLE).select("id,name,solicitation_number,due_date,updated_at").order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(row => ({ id: row.id, name: row.name, solicitationNumber: row.solicitation_number ?? "", dueDate: row.due_date ?? "", updatedAt: row.updated_at }));
  }

  async load(id: string): Promise<Loaded | null> {
    const { data, error } = await this.client.from(PURSUITS_TABLE).select("data,revision").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Pick<Row, "data" | "revision">;
    return { pursuit: normalizePursuit(row.data, new Date().toISOString()), revision: row.revision };
  }

  private columns(pursuit: Pursuit) {
    return { name: pursuit.name, solicitation_number: pursuit.solicitationNumber, due_date: pursuit.dueDate || null, data: pursuit };
  }

  async create(pursuit: Pursuit): Promise<number> {
    const { error } = await this.client.from(PURSUITS_TABLE).insert({ id: pursuit.id, ...this.columns(pursuit), revision: 1 });
    if (error) throw new Error(error.message);
    return 1;
  }

  async save(pursuit: Pursuit, revision: number, force = false): Promise<number> {
    let from = revision;
    if (force) {
      const current = await this.client.from(PURSUITS_TABLE).select("revision").eq("id", pursuit.id).maybeSingle();
      if (current.error) throw new Error(current.error.message);
      if (!current.data) return this.create(pursuit);
      from = (current.data as { revision: number }).revision;
    }
    const { data, error } = await this.client.from(PURSUITS_TABLE).update({ ...this.columns(pursuit), revision: from + 1 }).eq("id", pursuit.id).eq("revision", from).select("revision");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new SaveConflictError();
    return (data[0] as { revision: number }).revision;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from(PURSUITS_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
