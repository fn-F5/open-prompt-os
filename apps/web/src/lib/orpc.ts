import type {
  ApiErrorCode,
  BillingStatus,
  CheckoutInput,
  ComposePromptInput,
  ComposePromptOutput,
  ComposerMode,
  EmulatePlanSwitchInput,
  GenerationKind,
  ImportGuestInteractionInput,
  ImportGuestInteractionOutput,
  ModelOption,
  OnboardingPreferences,
  PromptFramework,
  PromptGenerationItem,
  PromptTemplate,
  ProviderHealth,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
  SavePromptInput,
  SavedPromptItem,
  SystemHealth,
  UpdateOnboardingInput,
} from "@open-prompt-os/contracts";
import {
  analyzePromptVariables,
  diagnoseAndRefinePrompt,
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
    id: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    providerId: "anthropic",
    providerName: "Anthropic",
    glyph: "A",
    modes: ["text"],
    capabilities: ["Reasoning", "CO-STAR", "Long Context"],
    status: "available",
    latencyLabel: "~140ms compile",
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    providerId: "openai",
    providerName: "OpenAI",
    glyph: "O",
    modes: ["text"],
    capabilities: ["Structured Outputs", "JSON Schema", "Code"],
    status: "available",
    latencyLabel: "~150ms compile",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    providerId: "gemini",
    providerName: "Google",
    glyph: "G",
    modes: ["text", "image", "video"],
    capabilities: ["Multimodal", "2M Context", "Grounding"],
    status: "available",
    latencyLabel: "~130ms compile",
  },
  {
    id: "imagen-3-pro",
    name: "Imagen 3 Studio",
    providerId: "gemini",
    providerName: "Google",
    glyph: "I",
    modes: ["image"],
    capabilities: ["Photorealistic", "Typography", "Lighting Control"],
    status: "available",
    latencyLabel: "~120ms compile",
  },
  {
    id: "flux-1.1-pro",
    name: "FLUX 1.1 Pro Ultra",
    providerId: "openrouter",
    providerName: "Black Forest",
    glyph: "F",
    modes: ["image"],
    capabilities: ["Raw Composition", "Cinematic Grain", "High Ratio"],
    status: "available",
    latencyLabel: "~135ms compile",
  },
  {
    id: "veo-2-cinema",
    name: "Veo 2 Cinema",
    providerId: "gemini",
    providerName: "Google",
    glyph: "V",
    modes: ["video"],
    capabilities: ["24fps Motion", "Camera Physics", "Temporal Coherence"],
    status: "available",
    latencyLabel: "~160ms compile",
  },
  {
    id: "sora-turbo",
    name: "Sora Turbo",
    providerId: "openai",
    providerName: "OpenAI",
    glyph: "S",
    modes: ["video"],
    capabilities: ["Multi-Shot Storyboard", "World Simulation"],
    status: "available",
    latencyLabel: "~175ms compile",
  },
];

const CURATED_TEMPLATES: PromptTemplate[] = [
  {
    slug: "staff-architecture-rfc-review",
    title: "Staff Architecture RFC & Trade-off Matrix",
    useCase:
      "Stress-test system designs for failure modes, data consistency, and operational cost.",
    category: "Engineering",
    mode: "text",
    framework: "costar",
    frameworkBadge: "Inspired by COSTAR",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1", "gemini-2.5-pro"],
    preview:
      "Evaluates [System_Proposal] across latency budgets, multi-region failover, and blast radius.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: You are a Principal Distributed Systems Architect.\n\n## Context & Objective\nEvaluate [System_Proposal] targeting [Scale_Target] under [Compliance_Regime].",
    defaultDraft: {
      rawInput:
        "Review our distributed architecture proposal for [System_Proposal] handling [Scale_Target] requests per second and identify failure modes.",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      goal: "Surface single points of failure, tail-latency bottlenecks, and migration risks",
      audience: "Principal Engineers & Staff Infrastructure Reviewers",
      constraints: [
        "Quantify trade-offs in a Markdown comparison matrix",
        "Propose concrete mitigation for every high-severity risk",
      ],
      format: "Executive Verdict, Failure Mode Matrix, Step-by-Step Hardening Plan",
      persona: "Principal Distributed Systems Architect",
      tone: "Rigorous, objective, zero-fluff",
      guardrails: ["Do not recommend unverified managed services without fallback options"],
      framework: "costar",
      advanced: { length: "detailed", creativity: 0.2 },
    },
    popularityScore: 98,
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
  {
    slug: "executive-board-memo-synthesizer",
    title: "6-Page Narrative Memo & Decision Brief",
    useCase: "Transform raw product metrics and scattered notes into a crisp leadership narrative.",
    category: "Product & Strategy",
    mode: "text",
    framework: "rise",
    frameworkBadge: "Inspired by RISE",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1"],
    preview:
      "Synthesizes [Strategic_Initiative] with clear counter-arguments, unit economics, and ask.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by RISE)\nRole: Chief Product Strategist.\n\n## Objective\nDraft a high-signal decision brief for [Strategic_Initiative] addressing [Key_Metric_Goal].",
    defaultDraft: {
      rawInput:
        "Draft an executive decision memo for [Strategic_Initiative] aimed at improving [Key_Metric_Goal] in [Target_Quarter].",
      mode: "text",
      modelId: "gpt-4.1",
      goal: "Secure alignment on resource allocation with transparent trade-offs",
      audience: "Executive Leadership & Product Directors",
      constraints: ["Lead with the bottom-line recommendation in paragraph one"],
      format: "Context, Strategic Options Table, Recommended Path, Open Risks",
      persona: "Chief Product Strategist",
      tone: "Decisive, evidence-backed, concise",
      guardrails: ["Flag any metric that requires finance verification as [Verify_Metric]"],
      framework: "rise",
      advanced: { length: "balanced", creativity: 0.3 },
    },
    popularityScore: 94,
    updatedAt: "2026-11-03T12:00:00.000Z",
  },
  {
    slug: "editorial-monochrome-product-keyframe",
    title: "Industrial Monochrome Hardware Keyframe",
    useCase:
      "Generate studio-grade architectural and industrial design renders with physical optics.",
    category: "Design & Visuals",
    mode: "image",
    framework: "care",
    frameworkBadge: "Inspired by CARE",
    compatibleModels: ["imagen-3-pro", "flux-1.1-pro", "gemini-2.5-pro"],
    preview: "Brushed anodized aluminum [Product_Form] on matte basalt surface with rim lighting.",
    compiledTemplate:
      "# VISUAL GENERATION SPECIFICATION (Inspired by CARE)\nSubject: [Product_Form] crafted from [Material_Finish] under low-key rim lighting.",
    defaultDraft: {
      rawInput:
        "Macro studio photograph of [Product_Form] crafted from [Material_Finish] resting on a dark architectural monolith.",
      mode: "image",
      modelId: "imagen-3-pro",
      goal: "Create a hero keyframe with physical lens accuracy and zero visual clutter",
      audience: "Brand Design System & Launch Campaign",
      constraints: ["Strict monochrome tonal range", "85mm f/2.0 shallow depth of field"],
      format: "16:9 aspect ratio, 8K studio lighting, subtle film grain",
      persona: "Industrial Product Photographer",
      tone: "Minimalist, tactile, high contrast",
      guardrails: ["No neon colors, no floating artifacts, no deformed typography"],
      framework: "care",
      advanced: { length: "balanced", creativity: 0.4 },
    },
    popularityScore: 91,
    updatedAt: "2026-11-05T15:00:00.000Z",
  },
  {
    slug: "cinematic-orbital-product-reveal",
    title: "Continuous 24fps Orbital Tracking Shot",
    useCase:
      "Direct temporally coherent AI video prompts with explicit camera physics and lighting cues.",
    category: "Motion & Video",
    mode: "video",
    framework: "cot",
    frameworkBadge: "Inspired by Chain-of-Thought",
    compatibleModels: ["veo-2-cinema", "sora-turbo", "gemini-2.5-pro"],
    preview: "Slow dolly push-in toward [Hero_Object] as volumetric light sweeps across the frame.",
    compiledTemplate:
      "# MOTION & TEMPORAL PROMPT SPECIFICATION (Inspired by Chain-of-Thought)\nCamera: Slow 24fps dolly push-in on [Hero_Object] transitioning to [Reveal_State].",
    defaultDraft: {
      rawInput:
        "Continuous orbital camera movement around [Hero_Object] inside a minimalist gallery space as rim light reveals [Reveal_State].",
      mode: "video",
      modelId: "veo-2-cinema",
      goal: "Maintain consistent object geometry and smooth inertia across 6 seconds",
      audience: "Launch Film & Social Motion Pipeline",
      constraints: [
        "Single continuous take without jump cuts",
        "Realistic motion blur at 180-degree shutter",
      ],
      format: "24fps, 16:9 cinema scope, 6-second continuous tracking shot",
      persona: "Director of Photography",
      tone: "Atmospheric, deliberate, architectural",
      guardrails: ["Prevent morphing textures or sudden lighting flicker"],
      framework: "cot",
      advanced: { length: "balanced", creativity: 0.35 },
    },
    popularityScore: 89,
    updatedAt: "2026-11-06T09:30:00.000Z",
  },
];

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

export function resetOrpcTestState(): void {
  importedInteractionIds.clear();
  guestRemainingQuota = 5;
  generationsStore = [...SEED_GENERATIONS];
  onboardingPrefsStore = {
    dismissedHotspots: {},
    completedTours: {},
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
  // Outside Vitest unit tests, talk to local API in dev or same-origin in production
  if (typeof window !== "undefined" && !import.meta.env.VITEST) {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" ? "http://localhost:3001" : "";
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
  let payload: { code?: string; message?: string; requestId?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }
  throw new OrpcClientError(
    apiErrorCode(response.status, payload.code),
    payload.message ?? "Request failed",
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
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) onEvent(event, dataLines.join("\n"));
    }
  }
}

let emulatedPlanOverride: BillingStatus["plan"] | null = null;
authClient.subscribe(() => {
  emulatedPlanOverride = null;
});

function emulatedLimitFor(plan: BillingStatus["plan"]): number {
  if (plan === "team") return 2000;
  if (plan === "pro") return 500;
  return 50;
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

      if (!session.isAuthenticated && guestRemainingQuota <= 0) {
        throw new OrpcClientError(
          "QUOTA_EXCEEDED",
          "Daily anonymous generation limit reached. Sign in for free to unlock higher daily capacity and save your work.",
          headers["x-request-id"],
        );
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
              await readServerSentEvents(response, (event, data) => {
                if (event === "text-delta") {
                  const payload = JSON.parse(data) as { text?: string };
                  accumulated += payload.text ?? "";
                  options.onChunk?.(accumulated);
                } else if (event === "done") {
                  done = JSON.parse(data) as ComposePromptOutput;
                }
              });
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
      const headers = createCorrelationHeaders();
      if (remoteApiUrl() !== undefined) {
        try {
          const remoteList = await postRpc<ModelOption[]>(
            "/rpc/models/listProviders",
            input ?? {},
            undefined,
            headers,
          );
          if (remoteList && remoteList.length > 0) {
            return remoteList.map((remoteModel) => {
              const matched = DEFAULT_MODELS.find((m) => m.id === remoteModel.id);
              return {
                ...remoteModel,
                capabilities: matched?.capabilities ?? remoteModel.capabilities ?? [],
                latencyLabel: matched?.latencyLabel ?? remoteModel.latencyLabel ?? "live",
              };
            });
          }
        } catch {
          // fallback to DEFAULT_MODELS
        }
      }
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
  },

  billing: {
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
  },
};
