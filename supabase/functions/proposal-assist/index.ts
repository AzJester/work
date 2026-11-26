import {
  anthropicApiKey,
  authorizeCaller,
  callAnthropic,
  consumeAiQuota,
  earlyResponse,
  errorResponse,
  json,
  quotaExceededResponse,
  quotaSettings,
  readJsonObject,
  RequestError,
  textContent,
  upstreamTimeout,
  usageMetadata,
  type AnthropicResult,
  type EndpointOptions,
  type JsonRecord,
} from "../_shared/ai-edge.ts";
import {
  AssistContractError,
  CONTRACT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  maxTokensFor,
  parseAssistRequest,
} from "./contract.mjs";

// Server-side route for the Proposal War Room. The browser never holds the Anthropic key: it sends text or data
// with the signed-in account's token, and this function calls Claude with the key from the environment.
const OPTIONS: EndpointOptions = {
  envPrefix: "PROPOSAL_ASSIST",
  featureName: "Proposal War Room AI assistance",
};
const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_BODY_BYTES = 96 * 1024;
// A policy decline on the primary model is re-run on a fallback model inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

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
    // One long solicitation is many parts, so the hourly allowance is wider than the other assistants'.
    const settings = quotaSettings(OPTIONS, 120, 3_600);
    const quota = await consumeAiQuota(user, requestId, "proposal-assist", settings);
    if (!quota.allowed) return quotaExceededResponse(req, OPTIONS, requestId, quota, settings);

    const model = Deno.env.get("ANTHROPIC_PROPOSAL_ASSIST_MODEL") || DEFAULT_MODEL;
    const request: JsonRecord = {
      model,
      max_tokens: maxTokensFor(payload),
      system: buildSystemPrompt(payload),
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
    };
    const timeout = upstreamTimeout(OPTIONS, 60_000);

    let result: AnthropicResult;
    try {
      // Extraction and a short email do not need deep reasoning. Low effort keeps each part inside the time limit.
      result = await callAnthropic(
        requestId,
        apiKey,
        { ...request, output_config: { effort: "low" }, fallbacks: "default" },
        timeout,
        { "anthropic-beta": FALLBACK_BETA },
      );
    } catch (error) {
      // When the API turns the request itself down (an option a substituted model does not take, for example),
      // send it once more with the required fields alone. A busy or unreachable API is not retried here.
      if (!(error instanceof RequestError) || error.code !== "upstream_error" || error.status !== 502) throw error;
      result = await callAnthropic(requestId, apiKey, request, timeout);
    }

    const stopReason = typeof result.data.stop_reason === "string" ? result.data.stop_reason : "";
    if (stopReason === "refusal") {
      throw new RequestError(
        422,
        "declined",
        "Claude declined this text. Remove the passage that caused it, or enter these items by hand.",
      );
    }
    const text = textContent(result.data);
    if (!text) {
      throw new RequestError(
        502,
        "invalid_upstream_response",
        "The AI service returned an empty reply. Please try again.",
      );
    }

    return json(req, OPTIONS, {
      contract_version: CONTRACT_VERSION,
      action: payload.action,
      text,
      stop_reason: stopReason,
      model: typeof result.data.model === "string" ? result.data.model : model,
      request_id: requestId,
      usage: {
        ...usageMetadata(result.data, quota, settings, result.upstreamMs),
        action: payload.action,
      },
    }, 200, requestId);
  } catch (error) {
    return errorResponse(req, OPTIONS, requestId, error);
  }
});
