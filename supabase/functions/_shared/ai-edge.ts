const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ALLOWED_ORIGINS = ["https://azjester.github.io"];

export type JsonRecord = Record<string, unknown>;

export interface EndpointOptions {
  envPrefix: string;
  featureName: string;
  defaultOrigins?: string[];
}

export interface VerifiedUser {
  id: string;
  email: string;
  authorization: string;
}

export interface QuotaSettings {
  limit: number;
  windowSeconds: number;
}

export interface QuotaResult {
  allowed: boolean;
  remaining: number | null;
  resetAt: string | null;
}

export interface AnthropicResult {
  data: JsonRecord;
  upstreamMs: number;
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(Deno.env.get(name) || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function configuredList(...names: string[]): string[] {
  for (const name of names) {
    const value = Deno.env.get(name) || "";
    const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (entries.length) return entries;
  }
  return [];
}

function configuredOrigins(options: EndpointOptions): string[] {
  const requested = configuredList(
    `${options.envPrefix}_ALLOWED_ORIGINS`,
    "AI_ALLOWED_ORIGINS",
    "ALLOWED_ORIGINS",
  );
  const origins = requested.length ? requested : (options.defaultOrigins || DEFAULT_ALLOWED_ORIGINS);
  return [...new Set(origins.flatMap((origin) => {
    try {
      return [new URL(origin).origin];
    } catch {
      return [];
    }
  }))];
}

function originAllowed(req: Request, options: EndpointOptions): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  try {
    return configuredOrigins(options).includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

function corsHeaders(req: Request, options: EndpointOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  const origin = req.headers.get("Origin");
  if (origin && originAllowed(req, options)) headers["Access-Control-Allow-Origin"] = new URL(origin).origin;
  return headers;
}

export function json(
  req: Request,
  options: EndpointOptions,
  body: unknown,
  status = 200,
  requestId?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req, options),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
      ...extraHeaders,
    },
  });
}

export function safeLog(requestId: string, event: string, detail: JsonRecord = {}): void {
  console.error(JSON.stringify({ request_id: requestId, event, ...detail }));
}

export function earlyResponse(
  req: Request,
  options: EndpointOptions,
  requestId: string,
): Response | null {
  if (!originAllowed(req, options)) {
    return json(
      req,
      options,
      { error: "Origin is not allowed.", code: "origin_not_allowed", request_id: requestId },
      403,
      requestId,
    );
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders(req, options), "X-Request-Id": requestId },
    });
  }
  if (req.method !== "POST") {
    return json(
      req,
      options,
      { error: "Method not allowed.", code: "method_not_allowed", request_id: requestId },
      405,
      requestId,
      { Allow: "POST, OPTIONS" },
    );
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function allowedEmails(options: EndpointOptions): string[] {
  return configuredList(
    `${options.envPrefix}_ALLOWED_EMAILS`,
    "AI_ALLOWED_EMAILS",
    "ALLOWED_EMAILS",
  ).map((email) => email.toLowerCase());
}

export async function authorizeCaller(
  req: Request,
  options: EndpointOptions,
  requestId: string,
): Promise<VerifiedUser> {
  const token = bearerToken(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!token) throw new RequestError(401, "not_authenticated", `Please sign in to use ${options.featureName}.`);
  if (!supabaseUrl || !anonKey) {
    safeLog(requestId, "auth_configuration_missing");
    throw new RequestError(503, "service_unavailable", `${options.featureName} is temporarily unavailable.`);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    }, 7_000);
  } catch (error) {
    safeLog(requestId, "auth_verification_failed", { timeout: isAbortError(error) });
    throw new RequestError(503, "auth_unavailable", "Sign-in verification is temporarily unavailable. Please try again.");
  }
  if (!response.ok) throw new RequestError(401, "not_authenticated", `Please sign in to use ${options.featureName}.`);

  const value: unknown = await response.json().catch(() => null);
  const id = isRecord(value) && typeof value.id === "string" ? value.id.trim() : "";
  const email = isRecord(value) && typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const role = isRecord(value) && typeof value.role === "string" ? value.role : "";
  if (!id || role === "anon") throw new RequestError(401, "not_authenticated", `Please sign in to use ${options.featureName}.`);

  const allowlist = allowedEmails(options);
  if (!allowlist.length) {
    safeLog(requestId, "email_allowlist_missing");
    throw new RequestError(503, "service_unavailable", `${options.featureName} is temporarily unavailable.`);
  }
  if (!email || !allowlist.includes(email)) {
    throw new RequestError(403, "not_allowed", `This account is not allowed to use ${options.featureName}.`);
  }
  return { id, email, authorization: `Bearer ${token}` };
}

async function readBoundedBody(req: Request, maxBytes: number): Promise<string> {
  const declared = Number.parseInt(req.headers.get("Content-Length") || "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestError(413, "body_too_large", `Request body must be at most ${maxBytes} bytes.`);
  }
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestError(413, "body_too_large", `Request body must be at most ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    throw new RequestError(400, "invalid_encoding", "Request body must be valid UTF-8 JSON.");
  }
}

export async function readJsonObject(req: Request, maxBytes: number): Promise<JsonRecord> {
  const contentType = req.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const raw = await readBoundedBody(req, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestError(400, "invalid_json", "Request body must contain valid JSON.");
  }
  if (!isRecord(value)) throw new RequestError(400, "invalid_request", "Request body must be a JSON object.");
  return value;
}

export function boundedString(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) throw new RequestError(400, "invalid_request", `${label} is required.`);
    return "";
  }
  if (typeof value !== "string") throw new RequestError(400, "invalid_request", `${label} must be a string.`);
  const clean = value.trim();
  if (required && !clean) throw new RequestError(400, "invalid_request", `${label} is required.`);
  if (clean.length > max) throw new RequestError(400, "invalid_request", `${label} must be ${max} characters or fewer.`);
  return clean;
}

export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function dateField(value: unknown, label: string, required = false): string {
  const date = boundedString(value, label, 10, required);
  if (date && !validIsoDate(date)) {
    throw new RequestError(400, "invalid_request", `${label} must be a valid YYYY-MM-DD date.`);
  }
  return date;
}

export function quotaSettings(
  options: EndpointOptions,
  defaultLimit = 20,
  defaultWindowSeconds = 3_600,
): QuotaSettings {
  const requestedWindow = envInt(`${options.envPrefix}_QUOTA_WINDOW_SECONDS`, defaultWindowSeconds, 60, 86_400);
  const approvedWindows = new Set([60, 300, 900, 3_600, 21_600, 86_400]);
  return {
    limit: envInt(`${options.envPrefix}_QUOTA_LIMIT`, defaultLimit, 1, 1_000),
    windowSeconds: approvedWindows.has(requestedWindow) ? requestedWindow : defaultWindowSeconds,
  };
}

function parseQuotaResult(value: unknown): QuotaResult | null {
  if (typeof value === "boolean") return { allowed: value, remaining: null, resetAt: null };
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return null;
  const allowedValue = typeof row.allowed === "boolean"
    ? row.allowed
    : typeof row.consume_ai_quota === "boolean"
    ? row.consume_ai_quota
    : null;
  if (allowedValue === null) return null;
  const remaining = typeof row.remaining === "number" && Number.isFinite(row.remaining)
    ? Math.max(0, Math.floor(row.remaining))
    : null;
  const resetAt = typeof row.reset_at === "string" ? row.reset_at : null;
  return { allowed: allowedValue, remaining, resetAt };
}

export async function consumeAiQuota(
  user: VerifiedUser,
  requestId: string,
  functionName: string,
  settings: QuotaSettings,
): Promise<QuotaResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  let response: Response;
  try {
    response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
      method: "POST",
      headers: {
        Authorization: user.authorization,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_function: functionName,
        p_limit: settings.limit,
        p_window_seconds: settings.windowSeconds,
      }),
    }, 7_000);
  } catch (error) {
    safeLog(requestId, "quota_check_failed", { timeout: isAbortError(error) });
    throw new RequestError(503, "quota_unavailable", "This AI feature is temporarily unavailable because usage limits could not be verified.");
  }
  if (!response.ok) {
    safeLog(requestId, "quota_check_rejected", { status: response.status });
    throw new RequestError(503, "quota_unavailable", "This AI feature is temporarily unavailable because usage limits could not be verified.");
  }

  const value: unknown = await response.json().catch(() => null);
  const quota = parseQuotaResult(value);
  if (!quota) {
    safeLog(requestId, "quota_response_invalid");
    throw new RequestError(503, "quota_unavailable", "This AI feature is temporarily unavailable because usage limits could not be verified.");
  }
  return quota;
}

export function quotaExceededResponse(
  req: Request,
  options: EndpointOptions,
  requestId: string,
  quota: QuotaResult,
  settings: QuotaSettings,
): Response {
  let retryAfter = settings.windowSeconds;
  if (quota.resetAt) {
    const resetMs = Date.parse(quota.resetAt);
    if (Number.isFinite(resetMs)) retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1_000));
  }
  return json(
    req,
    options,
    { error: "AI usage limit reached. Please try again later.", code: "quota_exhausted", request_id: requestId },
    429,
    requestId,
    { "Retry-After": String(retryAfter) },
  );
}

export function anthropicApiKey(requestId: string): string {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!apiKey) {
    safeLog(requestId, "anthropic_configuration_missing");
    throw new RequestError(503, "service_unavailable", "This AI feature is not configured.");
  }
  return apiKey;
}

export function upstreamTimeout(options: EndpointOptions): number {
  return envInt(`${options.envPrefix}_UPSTREAM_TIMEOUT_MS`, 25_000, 5_000, 60_000);
}

export async function callAnthropic(
  requestId: string,
  apiKey: string,
  body: JsonRecord,
  timeoutMs: number,
): Promise<AnthropicResult> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    }, timeoutMs);
  } catch (error) {
    if (isAbortError(error)) {
      safeLog(requestId, "anthropic_timeout", { timeout_ms: timeoutMs });
      throw new RequestError(504, "upstream_timeout", "The AI request timed out. Please try again.");
    }
    safeLog(requestId, "anthropic_network_error");
    throw new RequestError(502, "upstream_unavailable", "The AI service could not be reached. Please try again.");
  }

  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const providerType = isRecord(value) && isRecord(value.error) && typeof value.error.type === "string"
      ? value.error.type
      : "unknown";
    safeLog(requestId, "anthropic_rejected", { status: response.status, type: providerType });
    const busy = response.status === 429 || response.status >= 500;
    throw new RequestError(
      busy ? 503 : 502,
      "upstream_error",
      busy ? "The AI service is temporarily busy. Please try again shortly." : "The AI request could not be completed. Please try again.",
    );
  }
  if (!isRecord(value)) {
    throw new RequestError(502, "invalid_upstream_response", "The AI service returned an invalid response. Please try again.");
  }
  return { data: value, upstreamMs: Date.now() - startedAt };
}

export function textContent(data: JsonRecord): string {
  const content = Array.isArray(data.content) ? data.content : [];
  return content
    .filter((item: unknown): item is JsonRecord => isRecord(item) && item.type === "text")
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join("")
    .trim();
}

export function toolInput(data: JsonRecord, toolName: string): JsonRecord | null {
  const content = Array.isArray(data.content) ? data.content : [];
  const tool = content.find((item: unknown) =>
    isRecord(item) && item.type === "tool_use" && item.name === toolName && isRecord(item.input)
  );
  return isRecord(tool) && isRecord(tool.input) ? tool.input : null;
}

export function usageMetadata(
  data: JsonRecord,
  quota: QuotaResult,
  settings: QuotaSettings,
  upstreamMs: number,
): JsonRecord {
  const usage = isRecord(data.usage) ? data.usage : {};
  const token = (name: string): number =>
    typeof usage[name] === "number" && Number.isFinite(usage[name])
      ? Math.max(0, Math.floor(usage[name] as number))
      : 0;
  const inputTokens = token("input_tokens");
  const outputTokens = token("output_tokens");
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cache_creation_input_tokens: token("cache_creation_input_tokens"),
    cache_read_input_tokens: token("cache_read_input_tokens"),
    upstream_ms: upstreamMs,
    quota_limit: settings.limit,
    quota_window_seconds: settings.windowSeconds,
    quota_remaining: quota.remaining,
    quota_reset_at: quota.resetAt,
  };
}

export function errorResponse(
  req: Request,
  options: EndpointOptions,
  requestId: string,
  error: unknown,
): Response {
  if (error instanceof RequestError) {
    return json(
      req,
      options,
      { error: error.message, code: error.code, request_id: requestId },
      error.status,
      requestId,
    );
  }
  safeLog(requestId, "unexpected_error");
  return json(
    req,
    options,
    { error: "This AI feature failed unexpectedly. Please try again.", code: "internal_error", request_id: requestId },
    500,
    requestId,
  );
}
