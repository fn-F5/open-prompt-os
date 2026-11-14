import type {
  ComposePromptInput,
  ComposePromptOutput,
  ProviderId,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
} from "@open-prompt-os/contracts";

export interface LlmImageAttachment {
  readonly base64: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface LlmCompletionRequest {
  readonly requestId: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly image?: LlmImageAttachment;
  readonly modelId?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmCompletionResult {
  readonly text: string;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly usage: LlmUsage;
  readonly latencyMs: number;
}

export type LlmStreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "done"; readonly result: LlmCompletionResult };

export type LlmProviderErrorCode = "timeout" | "provider_error" | "not_configured";

export class LlmProviderError extends Error {
  readonly code: LlmProviderErrorCode;

  constructor(code: LlmProviderErrorCode, message: string) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
  }
}

export interface LlmProviderAdapter {
  readonly id: ProviderId;
  readonly defaultModel: string;
  isConfigured(): boolean;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
  stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamEvent>;
}

export interface OrchestratorContext {
  readonly requestId: string;
  readonly signal?: AbortSignal;
}

export interface ProviderHealthSnapshot {
  readonly providerId: ProviderId;
  readonly circuit: "closed" | "open" | "half_open";
  readonly recentFailureRate: number;
  readonly lastErrorAt: string | null;
}

export type ComposeStreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "done"; readonly output: ComposePromptOutput };

export interface PromptOrchestrator {
  compose(input: ComposePromptInput, ctx: OrchestratorContext): Promise<ComposePromptOutput>;
  composeStream(
    input: ComposePromptInput,
    ctx: OrchestratorContext,
  ): AsyncIterable<ComposeStreamEvent>;
  refine(input: RefinePromptInput, ctx: OrchestratorContext): Promise<RefinePromptOutput>;
  reverseEngineer(
    input: ReverseEngineerInput,
    ctx: OrchestratorContext,
  ): Promise<ReverseEngineerOutput>;
  healthSnapshot(): readonly ProviderHealthSnapshot[];
}

export interface FakeAdapterOptions {
  readonly id?: ProviderId;
  readonly defaultModel?: string;
  readonly configured?: boolean;
  readonly text?: string;
  readonly latencyMs?: number;
}

export interface FakeAdapter extends LlmProviderAdapter {
  lastRequest: LlmCompletionRequest | null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new LlmProviderError("timeout", "Request aborted");
  }
}

export function createFakeAdapter(options: FakeAdapterOptions = {}): FakeAdapter {
  const text = options.text ?? "compiled prompt";
  const midpoint = Math.ceil(text.length / 2);
  const first = text.slice(0, midpoint);
  const second = text.slice(midpoint);
  let lastRequest: LlmCompletionRequest | null = null;

  const adapter: FakeAdapter = {
    id: options.id ?? "gemini",
    defaultModel: options.defaultModel ?? "fake-model",
    get lastRequest() {
      return lastRequest;
    },
    set lastRequest(request: LlmCompletionRequest | null) {
      lastRequest = request;
    },
    isConfigured() {
      return options.configured ?? true;
    },
    async complete(request) {
      lastRequest = request;
      throwIfAborted(request.signal);
      return {
        text,
        providerId: adapter.id,
        modelId: request.modelId ?? adapter.defaultModel,
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: options.latencyMs ?? 5,
      };
    },
    async *stream(request) {
      lastRequest = request;
      throwIfAborted(request.signal);
      yield { type: "text-delta", text: first };
      throwIfAborted(request.signal);
      yield { type: "text-delta", text: second };
      yield {
        type: "done",
        result: {
          text,
          providerId: adapter.id,
          modelId: request.modelId ?? adapter.defaultModel,
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: options.latencyMs ?? 5,
        },
      };
    },
  };

  return adapter;
}
