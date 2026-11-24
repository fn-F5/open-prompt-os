import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmImageAttachment,
  LlmProviderAdapter,
  LlmStreamEvent,
  LlmVideoAttachment,
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

const DEFAULT_MODEL = "gemini-4-hydrogen";

export interface GeminiContentRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly image?: LlmImageAttachment;
  readonly video?: LlmVideoAttachment;
  readonly responseMimeType?: "application/json";
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly signal: AbortSignal;
}

export interface GeminiContentResponse {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface GeminiStreamChunk {
  readonly text: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface GeminiUploadedFile {
  readonly name: string;
  readonly uri: string;
  readonly mimeType: string;
  readonly state?: string;
}

export interface GeminiClient {
  generateContent(request: GeminiContentRequest): Promise<GeminiContentResponse>;
  generateContentStream(request: GeminiContentRequest): AsyncIterable<GeminiStreamChunk>;
  uploadFile?(
    bytes: Uint8Array,
    mimeType: string,
    signal: AbortSignal,
  ): Promise<GeminiUploadedFile>;
  getFile?(name: string, signal: AbortSignal): Promise<GeminiUploadedFile>;
  deleteFile?(name: string): Promise<void>;
}

export interface GeminiAdapterOptions {
  readonly apiKey: string;
  readonly apiKeys?: readonly string[];
  readonly defaultModel?: string;
  readonly client?: GeminiClient;
  readonly clients?: readonly GeminiClient[];
  readonly filePollIntervalMs?: number;
}

function buildContents(request: GeminiContentRequest) {
  if (request.video?.fileUri) {
    const videoPart: {
      fileData: { fileUri: string; mimeType: string };
      videoMetadata?: { startOffset?: string; endOffset?: string };
    } = {
      fileData: {
        fileUri: request.video.fileUri,
        mimeType: request.video.mimeType,
      },
    };
    if (request.video.startOffsetSec !== undefined || request.video.endOffsetSec !== undefined) {
      const startSec =
        request.video.startOffsetSec !== undefined
          ? Math.max(0, Math.floor(request.video.startOffsetSec))
          : undefined;
      const baseStart = startSec ?? 0;
      const endSec =
        request.video.endOffsetSec !== undefined
          ? Math.min(baseStart + 30, Math.max(baseStart + 1, Math.ceil(request.video.endOffsetSec)))
          : undefined;
      videoPart.videoMetadata = {
        ...(startSec !== undefined ? { startOffset: `${startSec}s` } : {}),
        ...(endSec !== undefined ? { endOffset: `${endSec}s` } : {}),
      };
    }
    return [videoPart, { text: request.userPrompt }];
  }
  return request.image
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
}

function thinkingConfigFor(model: string): { thinkingBudget: number } | undefined {
  // Disable dynamic thinking on Gemini 4+ non-pro models so streaming starts immediately.
  if (/^gemini-[4-9]\d*(?:\.\d+)?(?:-|$)/.test(model) && !model.includes("-pro")) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

async function createDefaultGeminiClient(apiKey: string): Promise<GeminiClient> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateContent(request) {
      const thinkingConfig = thinkingConfigFor(request.model);
      const response = await ai.models.generateContent({
        model: request.model,
        contents: buildContents(request),
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {}),
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
      const thinkingConfig = thinkingConfigFor(request.model);
      const responseStream = await ai.models.generateContentStream({
        model: request.model,
        contents: buildContents(request),
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {}),
          abortSignal: request.signal,
        },
      });
      for await (const chunk of responseStream) {
        const text = chunk.text ?? "";
        const inputTokens = chunk.usageMetadata?.promptTokenCount;
        const outputTokens = chunk.usageMetadata?.candidatesTokenCount;
        if (text || inputTokens !== undefined || outputTokens !== undefined) {
          yield { text, inputTokens, outputTokens };
        }
      }
    },
    async uploadFile(bytes, mimeType, signal) {
      const blob = new Blob([bytes.slice()], { type: mimeType });
      const uploaded = await ai.files.upload({
        file: blob,
        config: {
          mimeType,
          abortSignal: signal,
        },
      });
      if (!uploaded.name || !uploaded.uri) {
        throw new LlmProviderError("provider_error", "Gemini did not return an uploaded file URI.");
      }
      return {
        name: uploaded.name,
        uri: uploaded.uri,
        mimeType: uploaded.mimeType ?? mimeType,
        state: uploaded.state,
      };
    },
    async getFile(name, signal) {
      const file = await ai.files.get({
        name,
        config: { abortSignal: signal },
      });
      if (!file.name || !file.uri) {
        throw new LlmProviderError("provider_error", "Gemini file metadata was incomplete.");
      }
      return {
        name: file.name,
        uri: file.uri,
        mimeType: file.mimeType ?? "video/mp4",
        state: file.state,
      };
    },
    async deleteFile(name) {
      try {
        await ai.files.delete({ name });
      } catch {
        // Best-effort cleanup of ephemeral uploaded files.
      }
    },
  };
}

function toResult(
  request: LlmCompletionRequest,
  response: GeminiContentResponse,
  modelId: string,
  started: number,
  latencyMs?: number,
): LlmCompletionResult {
  return {
    text: response.text,
    providerId: "gemini",
    modelId,
    usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens },
    latencyMs: latencyMs ?? Date.now() - started,
  };
}

interface GeminiAccount {
  readonly index: number;
  client(): Promise<GeminiClient>;
}

async function waitUntilFileActive(
  client: GeminiClient,
  initial: GeminiUploadedFile,
  signal: AbortSignal,
  pollIntervalMs: number,
): Promise<GeminiUploadedFile> {
  if (initial.state === "ACTIVE" || !initial.state || !client.getFile) {
    if (initial.state === "FAILED") {
      throw new LlmProviderError("provider_error", "Gemini failed to process the uploaded video.");
    }
    return initial;
  }

  let current = initial;
  while (current.state !== "ACTIVE") {
    if (current.state === "FAILED") {
      throw new LlmProviderError("provider_error", "Gemini failed to process the uploaded video.");
    }
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, pollIntervalMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    if (signal.aborted) throw abortError();
    current = await client.getFile(current.name, signal);
  }
  return current;
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
  const pollIntervalMs = options.filePollIntervalMs ?? 1500;
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
      const { model, value } = await firstSuccess(request, async (client, modelId, signal) => {
        let uploadedName: string | undefined;
        let video = request.video;
        try {
          if (video?.bytes) {
            if (!client.uploadFile) {
              throw new LlmProviderError(
                "provider_error",
                "Gemini file upload is unavailable on this client.",
              );
            }
            const uploaded = await client.uploadFile(video.bytes, video.mimeType, signal);
            uploadedName = uploaded.name;
            const active = await waitUntilFileActive(client, uploaded, signal, pollIntervalMs);
            video = {
              ...video,
              fileUri: active.uri,
              bytes: undefined,
            };
          }
          return await client.generateContent({
            model: modelId,
            systemPrompt: request.systemPrompt,
            userPrompt: request.userPrompt,
            image: request.image,
            video,
            responseMimeType: request.responseMimeType,
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            signal,
          });
        } finally {
          if (uploadedName) {
            await client.deleteFile?.(uploadedName);
          }
        }
      });
      return toResult(request, value, model, started);
    },
    async *stream(request): AsyncIterable<LlmStreamEvent> {
      assertConfigured();
      const started = Date.now();
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
          let yielded = false;
          let firstTokenLatencyMs: number | undefined;
          let text = "";
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            const client = await account.client();
            for await (const chunk of client.generateContentStream({
              model,
              systemPrompt: request.systemPrompt,
              userPrompt: request.userPrompt,
              image: request.image,
              temperature: request.temperature,
              maxOutputTokens: request.maxOutputTokens,
              signal,
            })) {
              if (chunk.inputTokens !== undefined) inputTokens = chunk.inputTokens;
              if (chunk.outputTokens !== undefined) outputTokens = chunk.outputTokens;
              if (chunk.text) {
                if (!yielded) {
                  firstTokenLatencyMs = Date.now() - started;
                  yielded = true;
                }
                text += chunk.text;
                yield { type: "text-delta", text: chunk.text };
              }
            }
            yield {
              type: "done",
              result: toResult(
                request,
                { text, inputTokens, outputTokens },
                model,
                started,
                firstTokenLatencyMs,
              ),
            };
            return;
          } catch (error) {
            lastError = error;
            if (request.signal?.aborted) throw asProviderError(error);
            if (yielded) throw asProviderError(error);
            if (isDailyQuotaExhaustionError(error)) markModelQuotaExhausted(key, error);
            if (!isRecoverableModelError(error)) throw asProviderError(error);
          }
        }
      }
      throw asProviderError(lastError ?? new Error("No Gemini model available."));
    },
  };
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}
