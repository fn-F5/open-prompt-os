import {
  type ApiErrorCode,
  type BillingStatus,
  type CheckoutInput,
  type ComposePromptInput,
  type ComposePromptOutput,
  type ComposerMode,
  DEFAULT_CURATED_TEMPLATES,
  DEFAULT_PRICING_PLANS,
  type EmulatePlanSwitchInput,
  type FeedbackItem,
  type GenerationKind,
  type ImportGuestInteractionInput,
  type ImportGuestInteractionOutput,
  type ModelOption,
  type OnboardingPreferences,
  type PlanInterestItem,
  type PricingPlanItem,
  type PromptFramework,
  type PromptGenerationItem,
  type PromptTemplate,
  type ProviderHealth,
  type RecordSignupAttributionInput,
  type RecordSignupAttributionOutput,
  type ReferralSource,
  type RefinePromptInput,
  type RefinePromptOutput,
  type RegisterPlanInterestInput,
  RegisterPlanInterestInputSchema,
  type ReverseEngineerInput,
  type ReverseEngineerOutput,
  type SavePromptInput,
  type SavedPromptItem,
  type SubmitFeedbackInput,
  type SystemHealth,
  type UpdateOnboardingInput,
  type VideoGeneratorTarget,
  type VideoReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import {
  analyzePromptVariables,
  diagnoseAndRefinePrompt,
  evaluatePromptQuality,
  extractDraftSupplementalText,
  parsePublicVideoUrl,
  synthesizeCompiledPrompt,
  synthesizeReverseEngineeredPrompt,
} from "@open-prompt-os/core";
import { authClient } from "./auth-client.js";
import { createCorrelationHeaders } from "./telemetry.js";

export class OrpcClientError extends Error {
  readonly code: ApiErrorCode;
  readonly requestId: string;

  constructor(code: ApiErrorCode, message: string, requestId?: string) {
    super(message);
    this.name = "OrpcClientError";
    this.code = code;
    this.requestId = requestId ?? createCorrelationHeaders()["x-request-id"];
  }
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: "openai-text",
    name: "OpenAI (ChatGPT, GPT models)",
    providerId: "openai",
    providerName: "OpenAI",
    glyph: "O",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "google-text",
    name: "Google (Gemini models)",
    providerId: "gemini",
    providerName: "Google",
    glyph: "G",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "anthropic-text",
    name: "Anthropic (Claude models)",
    providerId: "anthropic",
    providerName: "Anthropic",
    glyph: "A",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "alibaba-text",
    name: "Alibaba (Qwen models)",
    providerId: "openrouter",
    providerName: "Alibaba",
    glyph: "A",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "minimax-text",
    name: "MiniMax (M3 model)",
    providerId: "openrouter",
    providerName: "MiniMax",
    glyph: "M",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "xai-text",
    name: "xAI (Grok models)",
    providerId: "openrouter",
    providerName: "xAI",
    glyph: "X",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "deepseek-text",
    name: "DeepSeek (DeepSeek models)",
    providerId: "openrouter",
    providerName: "DeepSeek",
    glyph: "D",
    modes: ["text"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "openai-image",
    name: "OpenAI (GPT-image, DALL-E)",
    providerId: "openai",
    providerName: "OpenAI",
    glyph: "O",
    modes: ["image"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "google-image",
    name: "Google (Imagen, Gemini)",
    providerId: "gemini",
    providerName: "Google",
    glyph: "G",
    modes: ["image"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "midjourney-image",
    name: "Midjourney (Midjourney models)",
    providerId: "openrouter",
    providerName: "Midjourney",
    glyph: "M",
    modes: ["image"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "adobe-image",
    name: "Adobe (Firefly)",
    providerId: "openrouter",
    providerName: "Adobe",
    glyph: "A",
    modes: ["image"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "bfl-image",
    name: "Black Forest Labs (FLUX models)",
    providerId: "openrouter",
    providerName: "Black Forest Labs",
    glyph: "B",
    modes: ["image"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "google-video",
    name: "Google (Veo, Gemini Omni Flash)",
    providerId: "gemini",
    providerName: "Google",
    glyph: "G",
    modes: ["video"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "alibaba-video",
    name: "Alibaba (Wan)",
    providerId: "openrouter",
    providerName: "Alibaba",
    glyph: "A",
    modes: ["video"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "minimax-video",
    name: "MiniMax (H3)",
    providerId: "openrouter",
    providerName: "MiniMax",
    glyph: "M",
    modes: ["video"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "bytedance-video",
    name: "ByteDance (Seedance)",
    providerId: "openrouter",
    providerName: "ByteDance",
    glyph: "B",
    modes: ["video"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
  {
    id: "runway-video",
    name: "Runway (Gen models)",
    providerId: "openrouter",
    providerName: "Runway",
    glyph: "R",
    modes: ["video"],
    capabilities: [],
    status: "available",
    latencyLabel: "",
  },
];

const CURATED_TEMPLATES: readonly PromptTemplate[] = DEFAULT_CURATED_TEMPLATES;

// In-memory idempotency and library state for standalone execution
const importedInteractionIds = new Map<string, string>();
let guestRemainingQuota = 5;
const GUEST_DAILY_LIMIT = 5;

let savedPromptsStore: SavedPromptItem[] = [
  {
    id: "prm_seed_arch_review",
    title: "Production Incident Postmortem Compiler",
    rawInput: "Compile a blameless postmortem from timeline notes and root cause analysis.",
    compiledPrompt:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: Principal Site Reliability Engineer.\n\n## Objective\nSynthesize [Incident_Timeline] and [Root_Cause] into an actionable remediation plan with [SLO_Impact] metrics.",
    mode: "text",
    framework: "costar",
    modelId: "claude-3-7-sonnet",
    category: "Engineering",
    tags: ["sre", "postmortem", "reliability"],
    detectedVariables: ["Incident_Timeline", "Root_Cause", "SLO_Impact"],
    isShared: true,
    shareId: "shr_postmortem_v1",
    createdAt: "2026-11-08T14:20:00.000Z",
    updatedAt: "2026-11-09T09:15:00.000Z",
  },
];

const SAMPLE_THUMB_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SEED_GENERATIONS: PromptGenerationItem[] = [
  {
    id: "gen_seed_compose_1",
    kind: "compose",
    rawInput: "Design a resilient webhook delivery pipeline for [Tenant_Scale] events per minute.",
    compiledPrompt:
      "# OPERATIONAL PROMPT SPECIFICATION\nRole: Principal Backend Engineer.\n\nArchitect an idempotent webhook dispatcher handling [Tenant_Scale] events/min with exponential backoff and dead-letter replay.",
    draft: {
      rawInput:
        "Design a resilient webhook delivery pipeline for [Tenant_Scale] events per minute.",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      framework: "costar",
      constraints: ["Bounded retry budget"],
      guardrails: [],
      advanced: {},
    },
    inputImageUrl: null,
    mode: "text",
    framework: "costar",
    modelId: "claude-3-7-sonnet",
    providerId: "anthropic",
    latencyMs: 148,
    createdAt: "2026-11-10T10:15:00.000Z",
  },
  {
    id: "gen_seed_reveng_1",
    kind: "reverse_engineer",
    rawInput: "Match editorial rim lighting and moody cyberpunk street composition",
    compiledPrompt:
      "# RECONSTRUCTED VISUAL PROMPT\nSubject: Rain-slicked neon alley with lone courier silhouette.\nLighting: Cool cyan fill with sharp amber rim light.",
    draft: {
      rawInput:
        "Rain-slicked neon alley with lone courier silhouette, cool cyan fill with sharp amber rim light.",
      mode: "image",
      modelId: "imagen-3-pro",
      framework: "costar",
      constraints: [],
      guardrails: [],
      advanced: {},
    },
    inputImageUrl: SAMPLE_THUMB_DATA_URL,
    mode: "image",
    framework: "costar",
    modelId: "imagen-3-pro",
    providerId: "gemini",
    latencyMs: 312,
    createdAt: "2026-11-11T16:40:00.000Z",
  },
  {
    id: "gen_seed_autopsy_1",
    kind: "autopsy",
    rawInput: "Summarize support tickets into JSON.",
    compiledPrompt:
      "# OPTIMIZED SPECIFICATION\nReturn valid JSON matching `{ summary: string, severity: 'low' | 'medium' | 'high' }` for [Support_Thread].",
    draft: null,
    inputImageUrl: null,
    mode: "text",
    framework: "costar",
    modelId: "gpt-4.1",
    providerId: "openai",
    latencyMs: 195,
    createdAt: "2026-11-12T08:25:00.000Z",
  },
];

let generationsStore: PromptGenerationItem[] = [...SEED_GENERATIONS];

let onboardingPrefsStore: OnboardingPreferences = {
  dismissedHotspots: {},
  completedTours: {},
};

let feedbackStore: FeedbackItem[] = [];

let signupReferralStore: {
  referralSource: ReferralSource | null;
  referralDetail: string | null;
} = {
  referralSource: null,
  referralDetail: null,
};

export function resetOrpcTestState(): void {
  importedInteractionIds.clear();
  guestRemainingQuota = 5;
  generationsStore = [...SEED_GENERATIONS];
  onboardingPrefsStore = {
    dismissedHotspots: {},
    completedTours: {},
  };
  feedbackStore = [];
  signupReferralStore = {
    referralSource: null,
    referralDetail: null,
  };
}

export function setGuestRemainingQuotaForTest(remaining: number): void {
  guestRemainingQuota = remaining;
}

function remoteApiUrl(): string | undefined {
  const value = import.meta.env.VITE_API_URL;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\/$/, "");
    if (trimmed === "same-origin") return "";
    if (trimmed.length > 0) return trimmed;
  }
  // Outside Vitest unit tests, use same-origin (proxied by Vite in dev, direct in production)
  if (typeof window !== "undefined" && !import.meta.env.VITEST) {
    return "";
  }
  return undefined;
}

function apiErrorCode(status: number, code: string | undefined): ApiErrorCode {
  if (
    code === "VALIDATION_ERROR" ||
    code === "UNAUTHENTICATED" ||
    code === "FORBIDDEN" ||
    code === "QUOTA_EXCEEDED" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "RATE_LIMITED" ||
    code === "INTERNAL_ERROR"
  ) {
    return code;
  }
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

async function throwApiError(response: Response, fallbackRequestId: string): Promise<never> {
  let payload: {
    code?: string;
    message?: string;
    requestId?: string;
    json?: { code?: string; message?: string; status?: number };
  } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }
  const err = payload.json ?? payload;
  throw new OrpcClientError(
    apiErrorCode(response.status, err.code ?? payload.code),
    err.message ?? payload.message ?? "Request failed",
    payload.requestId ?? response.headers.get("x-request-id") ?? fallbackRequestId,
  );
}

async function postRpc<T>(
  path: string,
  input: unknown,
  signal: AbortSignal | undefined,
  headers: { readonly "x-request-id": string; readonly traceparent: string },
): Promise<T> {
  const base = remoteApiUrl() ?? "";
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-request-id": headers["x-request-id"],
      traceparent: headers.traceparent,
    },
    body: JSON.stringify({ json: input }),
    signal,
  });
  if (!response.ok) await throwApiError(response, headers["x-request-id"]);
  const payload = (await response.json()) as { json?: T };
  if (payload.json === undefined) {
    throw new OrpcClientError("INTERNAL_ERROR", "Response was empty", headers["x-request-id"]);
  }
  return payload.json;
}

function emitSseChunk(chunk: string, onEvent: (event: string, data: string) => void): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length > 0) onEvent(event, dataLines.join("\n"));
}

async function readServerSentEvents(
  response: Response,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      emitSseChunk(chunk, onEvent);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    emitSseChunk(buffer, onEvent);
  }
}

let emulatedPlanOverride: BillingStatus["plan"] | null = null;
authClient.subscribe(() => {
  emulatedPlanOverride = null;
});

function emulatedLimitFor(plan: BillingStatus["plan"]): number {
  return (
    DEFAULT_PRICING_PLANS.find((item) => item.id === plan)?.dailyPromptLimit ??
    DEFAULT_PRICING_PLANS[0]?.dailyPromptLimit ??
    20
  );
}

export const orpcClient = {
  health: {
    async call() {
      return {
        status: "ok" as const,
        activeProvider: "anthropic",
        selfHealingActive: true,
        timestamp: new Date().toISOString(),
      };
    },
  },

  prompts: {
    async compose(
      input: ComposePromptInput,
      options?: { signal?: AbortSignal; onChunk?: (partialText: string) => void },
    ): Promise<ComposePromptOutput> {
      const headers = createCorrelationHeaders();
      const session = authClient.getSession();

      if (!input.draft.rawInput || input.draft.rawInput.trim().length === 0) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Prompt instruction cannot be empty or whitespace only.",
          headers["x-request-id"],
        );
      }

      const quality = evaluatePromptQuality(input.draft.rawInput, {
        supplementalText: extractDraftSupplementalText(input.draft),
      });
      if (!quality.ok) {
        throw new OrpcClientError("VALIDATION_ERROR", quality.message, headers["x-request-id"]);
      }

      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const remote = remoteApiUrl();
      if (remote !== undefined) {
        const result = options?.onChunk
          ? await (async () => {
              const response = await fetch(`${remote}/api/prompts/compose/stream`, {
                method: "POST",
                credentials: "include",
                headers: {
                  "content-type": "application/json",
                  "x-request-id": headers["x-request-id"],
                  traceparent: headers.traceparent,
                },
                body: JSON.stringify(input),
                signal: options.signal,
              });
              if (!response.ok) await throwApiError(response, headers["x-request-id"]);
              let accumulated = "";
              let done: ComposePromptOutput | undefined;
              let streamError: { code?: string; message?: string; requestId?: string } | undefined;
              await readServerSentEvents(response, (event, data) => {
                if (event === "text-delta") {
                  const payload = JSON.parse(data) as { text?: string };
                  accumulated += payload.text ?? "";
                  options.onChunk?.(accumulated);
                } else if (event === "done") {
                  done = JSON.parse(data) as ComposePromptOutput;
                } else if (event === "error") {
                  streamError = JSON.parse(data) as {
                    code?: string;
                    message?: string;
                    requestId?: string;
                  };
                }
              });
              if (streamError) {
                throw new OrpcClientError(
                  apiErrorCode(500, streamError.code),
                  streamError.message ?? "Prompt compilation failed",
                  streamError.requestId ?? headers["x-request-id"],
                );
              }
              if (!done) {
                throw new OrpcClientError(
                  "INTERNAL_ERROR",
                  "Stream ended before completion",
                  headers["x-request-id"],
                );
              }
              return done;
            })()
          : await postRpc<ComposePromptOutput>(
              "/rpc/prompts/compose",
              input,
              options?.signal,
              headers,
            );
        return {
          ...result,
          requestId: result.requestId || headers["x-request-id"],
        };
      }

      if (!session.isAuthenticated && guestRemainingQuota <= 0) {
        throw new OrpcClientError(
          "QUOTA_EXCEEDED",
          "Daily anonymous generation limit reached. Sign in for free to unlock higher daily capacity and save your work.",
          headers["x-request-id"],
        );
      }

      const synthesized = synthesizeCompiledPrompt(
        input.draft,
        input.interactionId,
        input.followUpAnswers,
      );

      // Progressive streaming simulation if caller provides an onChunk callback
      if (options?.onChunk) {
        const lines = synthesized.compiledPrompt.split("\n");
        let acc = "";
        for (const line of lines) {
          if (options.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          acc += (acc ? "\n" : "") + line;
          options.onChunk(acc);
          await new Promise((r) => setTimeout(r, 12));
        }
      }

      if (!session.isAuthenticated) {
        guestRemainingQuota = Math.max(0, guestRemainingQuota - 1);
      } else {
        generationsStore = [
          {
            id: `gen_compose_${Date.now().toString(36)}`,
            kind: "compose",
            rawInput: input.draft.rawInput,
            compiledPrompt: synthesized.compiledPrompt,
            draft: input.draft,
            inputImageUrl: null,
            mode: input.draft.mode,
            framework: input.draft.framework ?? "costar",
            modelId: input.draft.modelId,
            providerId: synthesized.providerId,
            latencyMs: synthesized.latencyMs,
            createdAt: new Date().toISOString(),
          },
          ...generationsStore,
        ];
      }

      return {
        ...synthesized,
        remainingDailyPrompts: session.isAuthenticated ? 48 : guestRemainingQuota,
        requestId: headers["x-request-id"],
      };
    },

    async refine(input: RefinePromptInput): Promise<RefinePromptOutput> {
      const headers = createCorrelationHeaders();
      if (!input.originalPrompt.trim()) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Original prompt is required for optimization.",
          headers["x-request-id"],
        );
      }
      const quality = evaluatePromptQuality(input.originalPrompt);
      if (!quality.ok) {
        throw new OrpcClientError("VALIDATION_ERROR", quality.message, headers["x-request-id"]);
      }
      if (input.mode === "autopsy" && (!input.failedOutput || !input.failedOutput.trim())) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Failed output is required in Autopsy mode so we can diagnose structural drift.",
          headers["x-request-id"],
        );
      }
      if (remoteApiUrl() !== undefined) {
        return postRpc<RefinePromptOutput>("/rpc/prompts/refine", input, undefined, headers);
      }
      const res = diagnoseAndRefinePrompt(input);
      generationsStore = [
        {
          id: `gen_${input.mode === "autopsy" ? "autopsy" : "refine"}_${Date.now().toString(36)}`,
          kind: input.mode === "autopsy" ? "autopsy" : "refine",
          rawInput: input.originalPrompt,
          compiledPrompt: res.optimizedPrompt,
          draft: null,
          inputImageUrl: null,
          mode: "text",
          framework: "costar",
          modelId: res.modelId,
          providerId: res.providerId,
          latencyMs: res.latencyMs,
          createdAt: new Date().toISOString(),
        },
        ...generationsStore,
      ];
      return {
        ...res,
        requestId: headers["x-request-id"],
      };
    },

    async autopsy(input: RefinePromptInput): Promise<RefinePromptOutput> {
      const headers = createCorrelationHeaders();
      const enriched = { ...input, mode: "autopsy" as const };
      if (!enriched.originalPrompt.trim()) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Original prompt is required for optimization.",
          headers["x-request-id"],
        );
      }
      const quality = evaluatePromptQuality(enriched.originalPrompt);
      if (!quality.ok) {
        throw new OrpcClientError("VALIDATION_ERROR", quality.message, headers["x-request-id"]);
      }
      if (!enriched.failedOutput || !enriched.failedOutput.trim()) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Failed output is required in Autopsy mode so we can diagnose structural drift.",
          headers["x-request-id"],
        );
      }
      if (remoteApiUrl() !== undefined) {
        return postRpc<RefinePromptOutput>("/rpc/prompts/autopsy", enriched, undefined, headers);
      }
      return orpcClient.prompts.refine(enriched);
    },

    async reverseEngineer(input: ReverseEngineerInput): Promise<ReverseEngineerOutput> {
      const headers = createCorrelationHeaders();
      if (!input.imageBase64.trim()) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Image payload is required for reverse engineering.",
          headers["x-request-id"],
        );
      }
      if (remoteApiUrl() !== undefined) {
        return postRpc<ReverseEngineerOutput>(
          "/rpc/prompts/reverseEngineer",
          input,
          undefined,
          headers,
        );
      }
      const res = synthesizeReverseEngineeredPrompt(input);
      const offlinePreview =
        input.previewImageDataUrl ??
        (input.imageBase64.length <= 120_000
          ? `data:${input.mimeType};base64,${input.imageBase64}`
          : null);
      generationsStore = [
        {
          id: `gen_reveng_${Date.now().toString(36)}`,
          kind: "reverse_engineer",
          rawInput: input.focusNotes?.trim() || `[Image Upload: ${input.mimeType}]`,
          compiledPrompt: res.reconstructedPrompt,
          draft: res.suggestedDraft,
          inputImageUrl: offlinePreview,
          mode: input.targetMode,
          framework: "costar",
          modelId: res.modelId,
          providerId: res.providerId,
          latencyMs: res.latencyMs,
          createdAt: new Date().toISOString(),
        },
        ...generationsStore,
      ];
      return {
        ...res,
        remainingDailyRuns: 2,
        requestId: headers["x-request-id"],
      };
    },

    async reverseEngineerVideo(
      input:
        | {
            readonly sourceType: "upload";
            readonly file: File;
            readonly durationSeconds?: number;
            readonly startOffsetSec: number;
            readonly endOffsetSec?: number;
            readonly targetGenerator: VideoGeneratorTarget;
            readonly focusNotes?: string;
          }
        | {
            readonly sourceType: "youtube";
            readonly youtubeUrl: string;
            readonly startOffsetSec: number;
            readonly endOffsetSec?: number;
            readonly targetGenerator: VideoGeneratorTarget;
            readonly focusNotes?: string;
          },
      options?: {
        readonly signal?: AbortSignal;
        readonly onStage?: (
          stage: "preparing" | "analyzing" | "finalizing",
          message: string,
        ) => void;
      },
    ): Promise<VideoReverseEngineerOutput> {
      const headers = createCorrelationHeaders();
      if (input.sourceType === "youtube") {
        const urlCheck = parsePublicVideoUrl(input.youtubeUrl);
        if (!urlCheck.ok) {
          throw new OrpcClientError("VALIDATION_ERROR", urlCheck.message, headers["x-request-id"]);
        }
      }

      const remote = remoteApiUrl();
      if (remote !== undefined) {
        let response: Response;
        if (input.sourceType === "upload") {
          const form = new FormData();
          form.append("file", input.file);
          form.append("targetGenerator", input.targetGenerator);
          form.append("startOffsetSec", String(input.startOffsetSec));
          if (input.endOffsetSec !== undefined) {
            form.append("endOffsetSec", String(input.endOffsetSec));
          }
          if (input.durationSeconds !== undefined) {
            form.append("durationSeconds", String(input.durationSeconds));
          }
          if (input.focusNotes?.trim()) {
            form.append("focusNotes", input.focusNotes.trim());
          }
          response = await fetch(`${remote}/api/prompts/reverse-engineer-video/stream`, {
            method: "POST",
            credentials: "include",
            headers: {
              "x-request-id": headers["x-request-id"],
              traceparent: headers.traceparent,
            },
            body: form,
            signal: options?.signal,
          });
        } else {
          response = await fetch(`${remote}/api/prompts/reverse-engineer-video/stream`, {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              "x-request-id": headers["x-request-id"],
              traceparent: headers.traceparent,
            },
            body: JSON.stringify({
              sourceType: "youtube",
              youtubeUrl: input.youtubeUrl,
              startOffsetSec: input.startOffsetSec,
              endOffsetSec: input.endOffsetSec,
              targetGenerator: input.targetGenerator,
              focusNotes: input.focusNotes?.trim() || undefined,
            }),
            signal: options?.signal,
          });
        }

        if (!response.ok) await throwApiError(response, headers["x-request-id"]);
        let done: VideoReverseEngineerOutput | undefined;
        let streamError: { code?: string; message?: string; requestId?: string } | undefined;
        await readServerSentEvents(response, (event, data) => {
          if (event === "stage") {
            const payload = JSON.parse(data) as {
              stage?: "preparing" | "analyzing" | "finalizing";
              message?: string;
            };
            if (payload.stage && payload.message) {
              options?.onStage?.(payload.stage, payload.message);
            }
          } else if (event === "done") {
            done = JSON.parse(data) as VideoReverseEngineerOutput;
          } else if (event === "error") {
            streamError = JSON.parse(data) as {
              code?: string;
              message?: string;
              requestId?: string;
            };
          }
        });
        if (streamError) {
          throw new OrpcClientError(
            apiErrorCode(500, streamError.code),
            streamError.message ?? "Video reverse engineering failed.",
            streamError.requestId ?? headers["x-request-id"],
          );
        }
        if (!done) {
          throw new OrpcClientError(
            "INTERNAL_ERROR",
            "Video analysis stream ended before completion.",
            headers["x-request-id"],
          );
        }
        return done;
      }

      options?.onStage?.("preparing", "Preparing video clip for multimodal inspection...");
      options?.onStage?.("analyzing", "Analyzing frames, camera motion, and audio...");
      options?.onStage?.(
        "finalizing",
        "Validating shot timeline, Continuity Bible, and variables...",
      );

      const duration =
        input.sourceType === "upload"
          ? Math.round((input.endOffsetSec ?? input.durationSeconds ?? 12) - input.startOffsetSec)
          : Math.round((input.endOffsetSec ?? input.startOffsetSec + 12) - input.startOffsetSec);
      const sourceDescriptor =
        input.sourceType === "upload"
          ? `the uploaded clip "${input.file.name}"`
          : "the reference YouTube clip";
      const clippedEndSec = Math.min(59, Math.max(1, duration));
      const endTimeStr = `00:${String(clippedEndSec).padStart(2, "0")}`;
      const masterPrompt = [
        `A continuous ${Math.max(1, duration)}-second 24fps shot recreating the exact visual style, lighting, optical framing, camera trajectory, and audio atmosphere of ${sourceDescriptor}${input.focusNotes?.trim() ? `, emphasizing ${input.focusNotes.trim()}` : ""}.`,
        "Visual & Optical Lock: Shot on a 35mm prime lens at f/2.8 with natural 24fps motion blur, directional volumetric key lighting with clean rim highlights, sharp foreground materiality, and gently separated background depth.",
        `Shot 1 (00:00–${endTimeStr}, Fade in): Smooth 24fps dolly push-in keeping the primary subject and surrounding environment physically grounded with natural secondary motion and stable exposure throughout the beat.`,
        "Audio & Soundscape: Natural ambient room tone paired with subtle synchronized foley matching subject and camera movement.",
        "Avoid morphing geometry, temporal flicker, melted textures, or sudden exposure shifts.",
      ].join("\n\n");

      const output: VideoReverseEngineerOutput = {
        overview: {
          durationSeconds: Math.max(1, duration),
          aspectRatio: "16:9",
          pacingStyle: "Steady 24fps single-take",
          isSingleTake: true,
          timestampsAreEstimated: true,
        },
        continuityBible: {
          subjectAndWardrobe:
            "Primary subject with consistent facial structure, surface texture, and wardrobe details across frames",
          environmentAndSet:
            "Grounded real-world location with distinct foreground, midground, and background depth separation",
          lightingAndColorGrade: "Directional volumetric key light with subtle rim highlights",
          lensAndOpticalDna: "35mm prime lens, f/2.8 shallow depth of field, 24fps motion cadence",
          audioAndMusicDna: "Natural ambient room tone and subtle foley aligned to motion",
          negativeGuardrails: "morphing geometry, temporal flicker, sudden exposure shifts",
        },
        shots: [
          {
            shotNumber: 1,
            startTime: "00:00",
            endTime: `00:${String(Math.min(59, Math.max(1, duration))).padStart(2, "0")}`,
            transitionIn: "Fade in",
            firstFramePrompt:
              "Opening medium-wide 35mm frame showing the primary subject anchored clearly in the environment under directional volumetric key lighting.",
            motionAndCamera: "Smooth 24fps dolly push-in with natural secondary motion.",
            audioCue: "Subtle ambient soundscape matching camera movement.",
            shotPrompt:
              "Continuous 24fps 35mm dolly push-in on the primary subject within the sunlit scene, steady volumetric key lighting, subtle rim highlights, natural ambient soundscape, no temporal flicker.",
          },
        ],
        targetGenerator: input.targetGenerator,
        masterPrompt,
        detectedVariables: [],
        suggestedDraft: {
          rawInput: masterPrompt,
          mode: "video",
          modelId: input.targetGenerator === "runway" ? "runway-video" : "google-video",
          goal: "Recreate the reference video's camera choreography, lighting, and audio cadence",
          format: "35mm prime lens, 24fps motion cadence",
          tone: "Directional volumetric key light",
          constraints: ["Preserve subject continuity across frames"],
          guardrails: ["morphing geometry, temporal flicker"],
          framework: "costar",
          advanced: { length: "detailed", creativity: 0.4 },
        },
        providerId: "gemini",
        modelId: "gemini-3.6-flash",
        latencyMs: 120,
        remainingDailyRuns: 2,
        requestId: headers["x-request-id"],
      };
      return output;
    },

    async importGuestInteraction(
      input: ImportGuestInteractionInput,
    ): Promise<ImportGuestInteractionOutput> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<ImportGuestInteractionOutput>(
          "/rpc/prompts/importGuestInteraction",
          input,
          undefined,
          headers,
        );
      }

      const session = authClient.getSession();
      const userId = session.user?.id ?? "anonymous";
      const idempotencyKey = `${userId}:${input.interactionId}`;

      const existingId = importedInteractionIds.get(idempotencyKey);
      if (existingId) {
        return {
          imported: false,
          promptGenerationId: existingId,
        };
      }

      const newId = `prm_migrated_${input.interactionId}`;
      importedInteractionIds.set(idempotencyKey, newId);

      const compiled =
        input.response?.compiledPrompt ??
        synthesizeCompiledPrompt(input.prompt, input.interactionId).compiledPrompt;
      const vars =
        input.response?.detectedVariables ?? analyzePromptVariables(compiled).detectedVariables;

      const newItem: SavedPromptItem = {
        id: newId,
        title: input.prompt.rawInput.trim().slice(0, 64) || "Migrated Guest Prompt",
        rawInput: input.prompt.rawInput,
        compiledPrompt: compiled,
        mode: input.prompt.mode,
        framework: input.prompt.framework ?? "costar",
        modelId: input.response?.modelId ?? input.prompt.modelId ?? "claude-3-7-sonnet",
        category: "Migrated Workspace",
        tags: ["migrated", input.prompt.mode],
        detectedVariables: vars,
        isShared: false,
        shareId: null,
        createdAt: input.createdAt,
        updatedAt: new Date().toISOString(),
      };

      savedPromptsStore = [newItem, ...savedPromptsStore.filter((i) => i.id !== newId)];

      return {
        imported: true,
        promptGenerationId: newId,
      };
    },

    async history(filters?: {
      search?: string;
      category?: string;
      mode?: ComposerMode;
      cursor?: string;
      limit?: number;
    }): Promise<{ items: SavedPromptItem[]; nextCursor: string | null }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ items: SavedPromptItem[]; nextCursor: string | null }>(
          "/rpc/prompts/history",
          filters ?? {},
          undefined,
          headers,
        );
      }

      let items = [...savedPromptsStore];
      if (filters?.mode) {
        items = items.filter((item) => item.mode === filters.mode);
      }
      if (filters?.category && filters.category !== "All") {
        items = items.filter((item) => item.category === filters.category);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        items = items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.rawInput.toLowerCase().includes(q) ||
            item.compiledPrompt.toLowerCase().includes(q) ||
            item.tags.some((t) => t.toLowerCase().includes(q)),
        );
      }
      return {
        items,
        nextCursor: null,
      };
    },

    async generations(filters?: {
      kind?: GenerationKind;
      mode?: ComposerMode;
      search?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ items: PromptGenerationItem[]; nextCursor: string | null }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ items: PromptGenerationItem[]; nextCursor: string | null }>(
          "/rpc/prompts/generations",
          filters ?? {},
          undefined,
          headers,
        );
      }

      let items = [...generationsStore];
      if (filters?.kind) {
        items = items.filter((item) => item.kind === filters.kind);
      }
      if (filters?.mode) {
        items = items.filter((item) => item.mode === filters.mode);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        items = items.filter(
          (item) =>
            item.rawInput.toLowerCase().includes(q) ||
            item.compiledPrompt.toLowerCase().includes(q),
        );
      }
      return {
        items,
        nextCursor: null,
      };
    },

    async save(input: SavePromptInput): Promise<SavedPromptItem> {
      const headers = createCorrelationHeaders();
      const session = authClient.getSession();
      if (!session.isAuthenticated) {
        throw new OrpcClientError(
          "UNAUTHENTICATED",
          "Sign in to save prompts to your private library.",
          headers["x-request-id"],
        );
      }
      if (remoteApiUrl() !== undefined) {
        return postRpc<SavedPromptItem>("/rpc/prompts/save", input, undefined, headers);
      }
      const vars = analyzePromptVariables(input.compiledPrompt).detectedVariables;
      const now = new Date().toISOString();
      const created: SavedPromptItem = {
        id: `prm_${Date.now().toString(36)}`,
        title: input.title.trim(),
        rawInput: input.rawInput,
        compiledPrompt: input.compiledPrompt,
        mode: input.mode,
        framework: input.framework,
        modelId: input.modelId,
        category: input.category,
        tags: input.tags,
        detectedVariables: vars,
        isShared: false,
        shareId: null,
        createdAt: now,
        updatedAt: now,
      };
      savedPromptsStore = [created, ...savedPromptsStore];
      return created;
    },

    async delete(input: { id: string }): Promise<{ deleted: boolean }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ deleted: boolean }>("/rpc/prompts/delete", input, undefined, headers);
      }
      savedPromptsStore = savedPromptsStore.filter((i) => i.id !== input.id);
      return { deleted: true };
    },

    async share(input: { id: string }): Promise<{ shareId: string; shareUrl: string }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ shareId: string; shareUrl: string }>(
          "/rpc/prompts/share",
          input,
          undefined,
          headers,
        );
      }
      const shareId = `shr_${input.id.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}`;
      savedPromptsStore = savedPromptsStore.map((item) =>
        item.id === input.id ? { ...item, isShared: true, shareId } : item,
      );
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://openprompt.os";
      return {
        shareId,
        shareUrl: `${origin}/share/${shareId}`,
      };
    },

    async getShared(input: { shareId: string }): Promise<SavedPromptItem | null> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<SavedPromptItem | null>("/rpc/prompts/getShared", input, undefined, headers);
      }
      return (
        savedPromptsStore.find((item) => item.shareId === input.shareId) ??
        savedPromptsStore[0] ??
        null
      );
    },
  },

  models: {
    async listProviders(input?: { mode?: ComposerMode }): Promise<ModelOption[]> {
      const requestedMode = input?.mode;
      if (!requestedMode) return DEFAULT_MODELS;
      return DEFAULT_MODELS.filter((m) => m.modes.includes(requestedMode));
    },

    async healthStatus(): Promise<ProviderHealth[]> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        try {
          return await postRpc<ProviderHealth[]>(
            "/rpc/models/healthStatus",
            {},
            undefined,
            headers,
          );
        } catch {
          // fallback
        }
      }
      return [
        { providerId: "anthropic", circuit: "closed", recentFailureRate: 0.002, lastErrorAt: null },
        { providerId: "openai", circuit: "closed", recentFailureRate: 0.004, lastErrorAt: null },
        { providerId: "gemini", circuit: "closed", recentFailureRate: 0.001, lastErrorAt: null },
        {
          providerId: "rule-synthesizer",
          circuit: "closed",
          recentFailureRate: 0,
          lastErrorAt: null,
        },
      ];
    },
  },

  templates: {
    async list(filters?: {
      mode?: ComposerMode;
      framework?: PromptFramework;
      category?: string;
      search?: string;
    }): Promise<PromptTemplate[]> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<PromptTemplate[]>("/rpc/templates/list", filters ?? {}, undefined, headers);
      }
      let list = [...CURATED_TEMPLATES];
      if (filters?.mode) {
        list = list.filter((t) => t.mode === filters.mode);
      }
      if (filters?.framework && filters.framework !== "none") {
        list = list.filter((t) => t.framework === filters.framework);
      }
      if (filters?.category && filters.category !== "All") {
        list = list.filter((t) => t.category === filters.category);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.useCase.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q),
        );
      }
      return list;
    },

    async getBySlug(input: { slug: string }): Promise<PromptTemplate | null> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<PromptTemplate | null>(
          "/rpc/templates/getBySlug",
          input,
          undefined,
          headers,
        );
      }
      return CURATED_TEMPLATES.find((t) => t.slug === input.slug) ?? null;
    },
  },

  userPreferences: {
    async get(): Promise<OnboardingPreferences> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<OnboardingPreferences>("/rpc/userPreferences/get", {}, undefined, headers);
      }
      return onboardingPrefsStore;
    },

    async updateOnboarding(input: UpdateOnboardingInput): Promise<OnboardingPreferences> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<OnboardingPreferences>(
          "/rpc/userPreferences/updateOnboarding",
          input,
          undefined,
          headers,
        );
      }
      onboardingPrefsStore = {
        dismissedHotspots: input.hotspotId
          ? { ...onboardingPrefsStore.dismissedHotspots, [input.hotspotId]: input.timestamp }
          : onboardingPrefsStore.dismissedHotspots,
        completedTours: input.tourId
          ? { ...onboardingPrefsStore.completedTours, [input.tourId]: input.timestamp }
          : onboardingPrefsStore.completedTours,
      };
      return onboardingPrefsStore;
    },

    async recordSignupAttribution(
      input: RecordSignupAttributionInput,
    ): Promise<RecordSignupAttributionOutput> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<RecordSignupAttributionOutput>(
          "/rpc/userPreferences/recordSignupAttribution",
          input,
          undefined,
          headers,
        );
      }
      const session = authClient.getSession();
      if (!session.isAuthenticated) {
        return { recorded: false, referralSource: null };
      }
      if (signupReferralStore.referralSource !== null) {
        return { recorded: false, referralSource: signupReferralStore.referralSource };
      }
      signupReferralStore = {
        referralSource: input.referralSource,
        referralDetail: input.referralDetail?.trim() || null,
      };
      return {
        recorded: true,
        referralSource: signupReferralStore.referralSource,
      };
    },
  },

  feedback: {
    async submit(input: SubmitFeedbackInput): Promise<FeedbackItem> {
      const headers = createCorrelationHeaders();
      const trimmedMessage = input.message.trim();
      if (trimmedMessage.length < 5 || trimmedMessage.length > 2000) {
        throw new OrpcClientError(
          "VALIDATION_ERROR",
          "Feedback message must be between 5 and 2,000 characters.",
          headers["x-request-id"],
        );
      }
      if (remoteApiUrl() !== undefined) {
        return postRpc<FeedbackItem>("/rpc/feedback/submit", input, undefined, headers);
      }
      const item: FeedbackItem = {
        id: `fbk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        kind: input.kind ?? "feature_request",
        title: input.title?.trim() || null,
        message: trimmedMessage,
        status: "open",
        pagePath: input.pagePath?.trim() || null,
        createdAt: new Date().toISOString(),
      };
      feedbackStore = [item, ...feedbackStore];
      return item;
    },

    async listMine(input?: { limit?: number }): Promise<FeedbackItem[]> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<FeedbackItem[]>("/rpc/feedback/listMine", input ?? {}, undefined, headers);
      }
      const session = authClient.getSession();
      if (!session.isAuthenticated) return [];
      const limit = Math.min(Math.max(input?.limit ?? 20, 1), 50);
      return feedbackStore.slice(0, limit);
    },
  },

  billing: {
    async plans(): Promise<PricingPlanItem[]> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        try {
          return await postRpc<PricingPlanItem[]>("/rpc/billing/plans", {}, undefined, headers);
        } catch {
          // fallback to canonical plan defaults when offline or unstarted
        }
      }
      return DEFAULT_PRICING_PLANS.map((plan) => ({
        ...plan,
        features: [...plan.features],
      }));
    },

    async status(): Promise<BillingStatus> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<BillingStatus>("/rpc/billing/status", {}, undefined, headers);
      }
      const session = authClient.getSession();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      if (session.isAuthenticated) {
        const plan = emulatedPlanOverride ?? session.user?.plan ?? "free";
        const limit = emulatedLimitFor(plan);
        return {
          plan,
          status: "active",
          remainingDailyPrompts: limit,
          dailyLimit: limit,
          resetAt: tomorrow,
          seats: 1,
          currentPeriodEnd: plan === "free" ? null : tomorrow,
        };
      }
      return {
        plan: "free",
        status: "active",
        remainingDailyPrompts: guestRemainingQuota,
        dailyLimit: GUEST_DAILY_LIMIT,
        resetAt: tomorrow,
        seats: 1,
        currentPeriodEnd: null,
      };
    },

    async refresh(): Promise<BillingStatus> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<BillingStatus>("/rpc/billing/refresh", {}, undefined, headers);
      }
      return orpcClient.billing.status();
    },

    async checkout(input: CheckoutInput): Promise<{ url: string }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ url: string }>("/rpc/billing/checkout", input, undefined, headers);
      }
      emulatedPlanOverride = input.plan;
      return {
        url: `/billing/return?plan=${input.plan}&emulated=1`,
      };
    },

    async portal(): Promise<{ url: string }> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<{ url: string }>("/rpc/billing/portal", {}, undefined, headers);
      }
      return {
        url: "/settings/profile?portal=emulated",
      };
    },

    async emulatePlan(input: EmulatePlanSwitchInput): Promise<BillingStatus> {
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        return postRpc<BillingStatus>("/rpc/billing/emulatePlan", input, undefined, headers);
      }
      emulatedPlanOverride = input.plan;
      return orpcClient.billing.status();
    },

    async registerInterest(input: RegisterPlanInterestInput): Promise<PlanInterestItem> {
      const headers = createCorrelationHeaders();
      const parsed = RegisterPlanInterestInputSchema.parse(input);
      if (remoteApiUrl() !== undefined) {
        return postRpc<PlanInterestItem>(
          "/rpc/billing/registerInterest",
          parsed,
          undefined,
          headers,
        );
      }
      const session = authClient.getSession();
      const resolvedEmail = session.isAuthenticated
        ? (session.user?.email ?? parsed.email)
        : parsed.email;
      if (!resolvedEmail) {
        throw new Error("Please enter your email address so we can notify you.");
      }
      return {
        id: `int_local_${Date.now().toString(36)}`,
        email: resolvedEmail,
        plan: parsed.plan,
        interval: parsed.interval,
        createdAt: new Date().toISOString(),
      };
    },
  },
};
