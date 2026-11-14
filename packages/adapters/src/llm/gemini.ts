import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmImageAttachment,
  LlmProviderAdapter,
  LlmStreamEvent,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { asProviderError, combineSignals } from "./errors.js";
import {
  accountOrder,
  geminiModelChain,
  isDailyQuotaExhaustionError,
  isModelQuotaExhausted,
  isRecoverableModelError,
  markModelQuotaExhausted,
  quotaKey,
} from "./gemini-chain.js";

const DEFAULT_MODEL = "gemini-3.6-flash";

export interface GeminiContentRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly image?: LlmImageAttachment;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly signal: AbortSignal;
}

export interface GeminiContentResponse {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface GeminiClient {
  generateContent(request: GeminiContentRequest): Promise<GeminiContentResponse>;
  generateContentStream(request: GeminiContentRequest): AsyncIterable<{ text: string }>;
}

export interface GeminiAdapterOptions {
  readonly apiKey: string;
  readonly apiKeys?: readonly string[];
  readonly defaultModel?: string;
  readonly client?: GeminiClient;
  readonly clients?: readonly GeminiClient[];
}

async function createDefaultGeminiClient(apiKey: string): Promise<GeminiClient> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const client: GeminiClient = {
    async generateContent(request) {
      const contents = request.image
        ? [
            {
              inlineData: {
                data: request.image.base64,
                mimeType: request.image.mimeType,
              },
            },
            { text: request.userPrompt },
          ]
        : request.userPrompt;
      const response = await ai.models.generateContent({
        model: request.model,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: request.signal,
        },
      });
      return {
        text: response.text ?? "",
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
    async *generateContentStream(request) {
      // generateContentStream does not resolve for current Gemini 3 models.
      // The unary call does, so the SSE route still delivers the provider text.
      const response = await client.generateContent(request);
      if (response.text) yield { text: response.text };
    },
  };
  return client;
}

function toResult(
  request: LlmCompletionRequest,
  response: GeminiContentResponse,
  modelId: string,
  started: number,
): LlmCompletionResult {
  return {
    text: response.text,
    providerId: "gemini",
    modelId,
    usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens },
    latencyMs: Date.now() - started,
  };
}

interface GeminiAccount {
  readonly index: number;
  client(): Promise<GeminiClient>;
}

export function createGeminiAdapter(options: GeminiAdapterOptions): LlmProviderAdapter {
  const keys = [
    ...new Set(
      [options.apiKey, ...(options.apiKeys ?? [])]
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  const clientPromises = new Map<string, Promise<GeminiClient>>();

  function accounts(): readonly GeminiAccount[] {
    if (options.clients && options.clients.length > 0) {
      return options.clients.map((injected, index) => ({
        index,
        client: () => Promise.resolve(injected),
      }));
    }
    if (options.client) {
      return [{ index: 0, client: () => Promise.resolve(options.client as GeminiClient) }];
    }
    return keys.map((key, index) => ({
      index,
      client() {
        const pending = clientPromises.get(key) ?? createDefaultGeminiClient(key);
        clientPromises.set(key, pending);
        return pending;
      },
    }));
  }

  function assertConfigured(): void {
    if (keys.length === 0 && !options.client && !(options.clients && options.clients.length > 0)) {
      throw new LlmProviderError("not_configured", "Gemini is not configured.");
    }
  }

  async function firstSuccess<T>(
    request: LlmCompletionRequest,
    run: (client: GeminiClient, model: string, signal: AbortSignal) => Promise<T>,
  ): Promise<{ model: string; value: T }> {
    const models = geminiModelChain(request.modelId ?? defaultModel);
    const configured = accounts();
    let lastError: unknown;
    for (const model of models) {
      for (const index of accountOrder(configured.length)) {
        const account = configured[index];
        if (!account) continue;
        const key = quotaKey(account.index, model);
        if (isModelQuotaExhausted(key)) continue;
        if (request.signal?.aborted) throw asProviderError(abortError());
        const signal = combineSignals(request.signal, request.timeoutMs);
        try {
          return { model, value: await run(await account.client(), model, signal) };
        } catch (error) {
          lastError = error;
          if (request.signal?.aborted) throw asProviderError(error);
          if (isDailyQuotaExhaustionError(error)) markModelQuotaExhausted(key, error);
          if (!isRecoverableModelError(error)) throw asProviderError(error);
        }
      }
    }
    throw asProviderError(lastError ?? new Error("No Gemini model available."));
  }

  return {
    id: "gemini",
    defaultModel,
    isConfigured() {
      return keys.length > 0 || Boolean(options.client) || Boolean(options.clients?.length);
    },
    async complete(request) {
      assertConfigured();
      const started = Date.now();
      const { model, value } = await firstSuccess(request, (client, modelId, signal) =>
        client.generateContent({
          model: modelId,
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          image: request.image,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          signal,
        }),
      );
      return toResult(request, value, model, started);
    },
    async *stream(request): AsyncIterable<LlmStreamEvent> {
      assertConfigured();
      const started = Date.now();
      const { model, value } = await firstSuccess(request, async (client, modelId, signal) => {
        const chunks: string[] = [];
        for await (const chunk of client.generateContentStream({
          model: modelId,
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          signal,
        })) {
          if (chunk.text) chunks.push(chunk.text);
        }
        return chunks;
      });
      let text = "";
      for (const chunk of value) {
        text += chunk;
        yield { type: "text-delta", text: chunk };
      }
      yield {
        type: "done",
        result: toResult(request, { text, inputTokens: 0, outputTokens: 0 }, model, started),
      };
    },
  };
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}
