import {
  anthropicApiKey,
  authorizeCaller,
  callAnthropic,
  consumeAiQuota,
  earlyResponse,
  errorResponse,
  isRecord,
  json,
  quotaExceededResponse,
  quotaSettings,
  readJsonObject,
  RequestError,
  toolInput,
  upstreamTimeout,
  usageMetadata,
  type EndpointOptions,
} from "../_shared/ai-edge.ts";
import {
  ASSIST_TOOL,
  AssistContractError,
  CONTRACT_VERSION,
  TOOL_NAME,
  buildSystemPrompt,
  buildUserPrompt,
  normalizeAssistOutput,
  parseAssistRequest,
} from "./contract.mjs";

const OPTIONS: EndpointOptions = {
  envPrefix: "SOLUTION_ASSIST",
  featureName: "Solution Architect AI assistance",
};
const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_BODY_BYTES = 128 * 1024;

function asRequestError(error: unknown): never {
  if (error instanceof AssistContractError) {
    throw new RequestError(error.status, error.code, error.message);
  }
  throw error;
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const early = earlyResponse(req, OPTIONS, requestId);
  if (early) return early;

  try {
    const user = await authorizeCaller(req, OPTIONS, requestId);
    let payload;
    try {
      payload = parseAssistRequest(await readJsonObject(req, MAX_BODY_BYTES));
    } catch (error) {
      asRequestError(error);
    }

    const apiKey = anthropicApiKey(requestId);
    const settings = quotaSettings(OPTIONS, 10, 3_600);
    const quota = await consumeAiQuota(user, requestId, "solution-assist", settings);
    if (!quota.allowed) return quotaExceededResponse(req, OPTIONS, requestId, quota, settings);

    const model = Deno.env.get("ANTHROPIC_SOLUTION_ASSIST_MODEL") ||
      Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
    const result = await callAnthropic(requestId, apiKey, {
      model,
      max_tokens: 4_096,
      system: buildSystemPrompt(payload),
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
      tools: [ASSIST_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }, upstreamTimeout(OPTIONS, 60_000));

    const input = toolInput(result.data, TOOL_NAME);
    if (!input || !isRecord(input)) {
      throw new RequestError(
        502,
        "invalid_upstream_response",
        "The AI service returned invalid Solution Architect assistance. Please try again.",
      );
    }

    let normalized;
    try {
      normalized = normalizeAssistOutput(input, payload);
    } catch (error) {
      asRequestError(error);
    }
    const generatedItems = normalized.drafts.length + normalized.findings.length +
      normalized.review_questions.length + normalized.architecture_views.length +
      normalized.assumptions.length + normalized.warnings.length;

    return json(req, OPTIONS, {
      contract_version: CONTRACT_VERSION,
      action: payload.action,
      solution_id: payload.solution_id,
      result: normalized,
      model,
      request_id: requestId,
      usage: {
        ...usageMetadata(result.data, quota, settings, result.upstreamMs),
        action: payload.action,
        fact_count: payload.facts.length,
        source_characters: payload.source_characters,
        generated_item_count: generatedItems,
      },
    }, 200, requestId);
  } catch (error) {
    return errorResponse(req, OPTIONS, requestId, error);
  }
});
