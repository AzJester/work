import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSIST_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.ts";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "pwr-auth" },
  });
  return client;
}

export class AssistError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface AssistReply {
  text: string;
  stop_reason: string;
  model: string;
  request_id: string;
}

/**
 * Calls the server-side route that talks to Claude. The browser sends the signed-in account's token and the text to
 * work on. The Anthropic key stays on the server.
 */
export async function callAssist(body: Record<string, unknown>, signal?: AbortSignal): Promise<AssistReply> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AssistError("not_authenticated", "Sign in to use Claude. Device-only pursuits keep every other feature.", 401);
  let response: Response;
  try {
    response = await fetch(ASSIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AssistError("network", "The request did not reach the server. Check the connection and try again.", 0);
  }
  const value: unknown = await response.json().catch(() => null);
  const reply = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new AssistError(typeof reply.code === "string" ? reply.code : "error", typeof reply.error === "string" ? reply.error : "The request failed. Try again.", response.status);
  }
  return {
    text: typeof reply.text === "string" ? reply.text : "",
    stop_reason: typeof reply.stop_reason === "string" ? reply.stop_reason : "",
    model: typeof reply.model === "string" ? reply.model : "",
    request_id: typeof reply.request_id === "string" ? reply.request_id : "",
  };
}
