import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProviderAdapter,
  LlmStreamEvent,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { asProviderError, combineSignals } from "./errors.js";
import { readSseData } from "./sse.js";

const DEFAULT_MODEL = "claude-3-7-sonnet";
const DEFAULT_BASE = "https://api.anthropic.com";

export interface AnthropicAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface AnthropicMessage {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  delta?: { type?: string; text?: string };
  type?: string;
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions): LlmProviderAdapter {
  const apiKey = options.apiKey.trim();
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function post(request: LlmCompletionRequest, stream: boolean, signal: AbortSignal) {
    const model = request.modelId ?? defaultModel;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxOutputTokens ?? 2048,
          system: request.systemPrompt,
          messages: [{ role: "user", content: request.userPrompt }],
          temperature: request.temperature,
          stream,
        }),
        signal,
      });
    } catch (error) {
      throw asProviderError(error);
    }
    if (!response.ok) {
      throw new LlmProviderError(
        "provider_error",
        `Provider request failed with status ${response.status}.`,
      );
    }
    return { response, model };
  }

  return {
    id: "anthropic",
    defaultModel,
    isConfigured() {
      return apiKey.length > 0;
    },
    async complete(request) {
      if (apiKey.length === 0) {
        throw new LlmProviderError("not_configured", "Anthropic is not configured.");
      }
      const started = Date.now();
      const signal = combineSignals(request.signal, request.timeoutMs);
      const { response, model } = await post(request, false, signal);
      const payload = (await response.json()) as AnthropicMessage;
      const text = (payload.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return {
        text,
        providerId: "anthropic",
        modelId: payload.model ?? model,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
        },
        latencyMs: Date.now() - started,
      } satisfies LlmCompletionResult;
    },
    async *stream(request): AsyncIterable<LlmStreamEvent> {
      if (apiKey.length === 0) {
        throw new LlmProviderError("not_configured", "Anthropic is not configured.");
      }
      const started = Date.now();
      const signal = combineSignals(request.signal, request.timeoutMs);
      const { response, model } = await post(request, true, signal);
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        for await (const data of readSseData(response, signal)) {
          const payload = JSON.parse(data) as AnthropicMessage;
          if (payload.type === "content_block_delta" && payload.delta?.text) {
            text += payload.delta.text;
            yield { type: "text-delta", text: payload.delta.text };
          }
          if (payload.type === "message_start") {
            inputTokens = payload.usage?.input_tokens ?? inputTokens;
          }
          if (payload.usage?.output_tokens) outputTokens = payload.usage.output_tokens;
        }
      } catch (error) {
        throw asProviderError(error);
      }
      yield {
        type: "done",
        result: {
          text,
          providerId: "anthropic",
          modelId: model,
          usage: { inputTokens, outputTokens },
          latencyMs: Date.now() - started,
        },
      };
    },
  };
}
