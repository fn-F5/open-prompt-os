import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProviderAdapter,
  LlmStreamEvent,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import type { ProviderId } from "@open-prompt-os/contracts";
import { asProviderError, combineSignals } from "./errors.js";
import { readSseData } from "./sse.js";

export interface OpenAiCompatibleOptions {
  readonly id: Extract<ProviderId, "openai" | "groq" | "openrouter" | "ollama">;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null }; delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

function completionBody(request: LlmCompletionRequest, model: string, stream: boolean) {
  return {
    model,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
    temperature: request.temperature,
    max_tokens: request.maxOutputTokens,
    stream,
  };
}

export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleOptions,
): LlmProviderAdapter {
  const apiKey = options.apiKey.trim();
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const configured = options.id === "ollama" ? baseUrl.length > 0 : apiKey.length > 0;

  async function post(request: LlmCompletionRequest, stream: boolean, signal: AbortSignal) {
    const model = request.modelId ?? options.defaultModel;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey.length > 0) headers.authorization = `Bearer ${apiKey}`;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(completionBody(request, model, stream)),
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
    id: options.id,
    defaultModel: options.defaultModel,
    isConfigured() {
      return configured;
    },
    async complete(request) {
      if (!configured) {
        throw new LlmProviderError("not_configured", `${options.id} is not configured.`);
      }
      const started = Date.now();
      const signal = combineSignals(request.signal, request.timeoutMs);
      const { response, model } = await post(request, false, signal);
      let payload: ChatCompletion;
      try {
        payload = (await response.json()) as ChatCompletion;
      } catch (error) {
        throw asProviderError(error);
      }
      const text = payload.choices?.[0]?.message?.content ?? "";
      return {
        text,
        providerId: options.id,
        modelId: payload.model ?? model,
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - started,
      } satisfies LlmCompletionResult;
    },
    async *stream(request): AsyncIterable<LlmStreamEvent> {
      if (!configured) {
        throw new LlmProviderError("not_configured", `${options.id} is not configured.`);
      }
      const started = Date.now();
      const signal = combineSignals(request.signal, request.timeoutMs);
      const { response, model } = await post(request, true, signal);
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        for await (const data of readSseData(response, signal)) {
          if (data === "[DONE]") break;
          const payload = JSON.parse(data) as ChatCompletion;
          const delta = payload.choices?.[0]?.delta?.content ?? "";
          if (delta.length > 0) {
            text += delta;
            yield { type: "text-delta", text: delta };
          }
          if (payload.usage) {
            inputTokens = payload.usage.prompt_tokens ?? inputTokens;
            outputTokens = payload.usage.completion_tokens ?? outputTokens;
          }
        }
      } catch (error) {
        throw asProviderError(error);
      }
      yield {
        type: "done",
        result: {
          text,
          providerId: options.id,
          modelId: model,
          usage: { inputTokens, outputTokens },
          latencyMs: Date.now() - started,
        },
      };
    },
  };
}
