import type {
  ComposeStreamEvent,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmImageAttachment,
  LlmProviderAdapter,
  OrchestratorContext,
  PromptOrchestrator,
  ProviderHealthSnapshot,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import type {
  ComposePromptInput,
  ComposePromptOutput,
  ComposerDraft,
  ProviderId,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import {
  RefinePromptOutputSchema,
  ReverseEngineerBreakdownSchema,
  ReverseEngineerOutputSchema,
} from "@open-prompt-os/contracts";
import type { CircuitMemory } from "@open-prompt-os/core";
import {
  analyzePromptVariables,
  assertNoClientSystemPrompt,
  circuitAllows,
  circuitFailureRate,
  circuitRecordFailure,
  circuitRecordSuccess,
  diagnoseAndRefinePrompt,
  generateFollowUpQuestions,
  initialCircuitMemory,
  isInputGuardError,
  redactSecrets,
  sanitizeOptionalUserText,
  sanitizeUserText,
  synthesizeReverseEngineeredPrompt,
} from "@open-prompt-os/core";
import { lookupModel } from "./catalog.js";
import { asProviderError } from "./errors.js";
import {
  buildComposeSystemPrompt,
  buildRefineSystemPrompt,
  buildReverseEngineerSystemPrompt,
} from "./instructions.js";
import type { ProviderRegistry } from "./registry.js";
import type { SynthesizerTask } from "./synthesizer.js";

export interface ProviderFailureEvent {
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly code: LlmProviderError["code"];
  readonly message: string;
  readonly requestId: string;
}

export interface LlmRequestLogEvent {
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly requestId: string;
  readonly streaming: boolean;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs: number;
}

export interface LlmResponseLogEvent {
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly requestId: string;
  readonly streaming: boolean;
  readonly latencyMs: number;
  readonly usage: LlmCompletionResult["usage"];
  readonly text: string;
  readonly healed: boolean;
}

export interface OrchestratorOptions {
  readonly registry: ProviderRegistry;
  readonly timeoutMs: number;
  readonly clock?: () => number;
  readonly disableFailover?: boolean;
  readonly onProviderFailure?: (event: ProviderFailureEvent) => void;
  readonly onLlmRequest?: (event: LlmRequestLogEvent) => void;
  readonly onLlmResponse?: (event: LlmResponseLogEvent) => void;
}

interface PreparedCompose {
  readonly input: ComposePromptInput;
  readonly draft: ComposerDraft;
  readonly followUpAnswers?: Record<string, string>;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

function sanitizeDraft(draft: ComposerDraft): ComposerDraft {
  return {
    ...draft,
    rawInput: sanitizeUserText(draft.rawInput, 8000),
    goal: sanitizeOptionalUserText(draft.goal, 400),
    audience: sanitizeOptionalUserText(draft.audience, 400),
    persona: sanitizeOptionalUserText(draft.persona, 300),
    tone: sanitizeOptionalUserText(draft.tone, 300),
    format: sanitizeOptionalUserText(draft.format, 300),
    constraints: (draft.constraints ?? []).map((item) => sanitizeUserText(item, 300)),
    guardrails: (draft.guardrails ?? []).map((item) => sanitizeUserText(item, 300)),
  };
}

function sanitizeAnswers(
  answers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!answers) return undefined;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    const cleaned = sanitizeOptionalUserText(value, 2000);
    if (!cleaned) continue;
    next[sanitizeUserText(key, 200)] = cleaned;
  }
  return next;
}

function prepareCompose(input: ComposePromptInput): PreparedCompose {
  assertNoClientSystemPrompt(input);
  const draft = sanitizeDraft(input.draft);
  const followUpAnswers = sanitizeAnswers(input.followUpAnswers);
  const targetModelEntry = lookupModel(draft.modelId);
  const targetModel =
    draft.modelId && targetModelEntry.providerId !== "rule-synthesizer"
      ? targetModelEntry.displayName
      : (draft.modelId ?? undefined);
  const userPrompt = JSON.stringify({
    rawInput: draft.rawInput,
    mode: draft.mode,
    modelId: draft.modelId,
    targetModel,
    goal: draft.goal,
    audience: draft.audience,
    constraints: draft.constraints,
    format: draft.format,
    persona: draft.persona,
    tone: draft.tone,
    guardrails: draft.guardrails,
    framework: draft.framework,
    advanced: draft.advanced,
    followUpAnswers,
  });
  return {
    input,
    draft,
    followUpAnswers,
    systemPrompt: buildComposeSystemPrompt(draft.framework, {
      mode: draft.mode,
      modelId: draft.modelId,
    }),
    userPrompt,
  };
}

function toComposeOutput(
  prepared: PreparedCompose,
  result: LlmCompletionResult,
  healed: boolean,
  ctx: OrchestratorContext,
): ComposePromptOutput {
  return {
    interactionId: prepared.input.interactionId,
    compiledPrompt: result.text,
    detectedVariables: analyzePromptVariables(result.text).detectedVariables,
    followUpQuestions: generateFollowUpQuestions(prepared.draft).slice(0, 3),
    providerId: result.providerId,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
    healedFromFailure: healed,
    remainingDailyPrompts: null,
    requestId: ctx.requestId,
  };
}

function unfenceJson(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseRefine(text: string): RefinePromptOutput | null {
  try {
    const parsed = RefinePromptOutputSchema.safeParse(JSON.parse(unfenceJson(text)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseReverseEngineer(
  text: string,
  input: ReverseEngineerInput,
  result: LlmCompletionResult,
  ctx: OrchestratorContext,
): ReverseEngineerOutput | null {
  try {
    const raw = JSON.parse(unfenceJson(text)) as Record<string, unknown>;
    const fullParsed = ReverseEngineerOutputSchema.safeParse(raw);
    if (fullParsed.success) {
      return {
        ...fullParsed.data,
        providerId: result.providerId,
        modelId: result.modelId,
        latencyMs: result.latencyMs,
        remainingDailyRuns: null,
        requestId: ctx.requestId,
      };
    }

    const reconstructedPrompt =
      typeof raw.reconstructedPrompt === "string" ? raw.reconstructedPrompt.trim() : "";
    const breakdownParsed = ReverseEngineerBreakdownSchema.safeParse(raw.breakdown);
    if (!reconstructedPrompt || !breakdownParsed.success) {
      return null;
    }

    const breakdown = breakdownParsed.data;
    const { detectedVariables } = analyzePromptVariables(reconstructedPrompt);

    return {
      reconstructedPrompt,
      detectedVariables,
      breakdown,
      suggestedDraft: {
        rawInput: reconstructedPrompt,
        mode: input.targetMode,
        modelId: result.modelId,
        goal: "Reproduce the visual style, lighting, and composition while customizing detected variables",
        format: breakdown.cameraAndComposition,
        tone: breakdown.lightingAndColor,
        constraints: [breakdown.styleAndMedium],
        guardrails: [breakdown.negativePrompt],
        framework: "costar",
        advanced: { length: "detailed", creativity: 0.5 },
      },
      providerId: result.providerId,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      remainingDailyRuns: null,
      requestId: ctx.requestId,
    };
  } catch {
    return null;
  }
}

function fallbackReverseEngineer(
  input: ReverseEngineerInput,
  ctx: OrchestratorContext,
  latencyMs: number,
): ReverseEngineerOutput {
  const synthesized = synthesizeReverseEngineeredPrompt(input);
  return {
    ...synthesized,
    latencyMs,
    requestId: ctx.requestId,
  };
}

function fallbackRefine(
  input: RefinePromptInput,
  ctx: OrchestratorContext,
  latencyMs: number,
): RefinePromptOutput {
  const refined = diagnoseAndRefinePrompt(input);
  return {
    ...refined,
    providerId: "rule-synthesizer",
    modelId: input.targetModelId ?? "rule-synthesizer",
    latencyMs,
    requestId: ctx.requestId,
  };
}

function resolveAdapterModelId(
  requestedModelId: string | null,
  adapter: LlmProviderAdapter,
): string {
  if (!requestedModelId) return adapter.defaultModel;
  const entry = lookupModel(requestedModelId);
  if (entry.providerId !== adapter.id) return adapter.defaultModel;
  return entry.apiModelId ?? adapter.defaultModel;
}

export function createOrchestrator(options: OrchestratorOptions): PromptOrchestrator {
  const clock = options.clock ?? Date.now;
  const circuits = new Map<ProviderId, CircuitMemory>();

  function acquire(id: ProviderId, now: number): boolean {
    if (id === "rule-synthesizer") return true;
    const current = circuits.get(id) ?? initialCircuitMemory();
    const decision = circuitAllows(current, now);
    circuits.set(id, decision.memory);
    return decision.allowed;
  }

  function succeed(id: ProviderId): void {
    if (id === "rule-synthesizer") return;
    const current = circuits.get(id) ?? initialCircuitMemory();
    circuits.set(id, circuitRecordSuccess(current));
  }

  function fail(
    id: ProviderId,
    now: number,
    error: LlmProviderError,
    meta?: { modelId: string; requestId: string },
  ): void {
    if (id === "rule-synthesizer") return;
    const current = circuits.get(id) ?? initialCircuitMemory();
    const safeMessage = redactSecrets(error.message);
    circuits.set(id, circuitRecordFailure(current, now, safeMessage));
    if (meta) {
      options.onProviderFailure?.({
        providerId: id,
        modelId: meta.modelId,
        code: error.code,
        message: safeMessage,
        requestId: meta.requestId,
      });
    }
  }

  function requestFor(
    adapter: LlmProviderAdapter,
    prepared: PreparedCompose,
    ctx: OrchestratorContext,
  ): LlmCompletionRequest {
    const task: SynthesizerTask = {
      kind: "compose",
      draft: prepared.draft,
      interactionId: prepared.input.interactionId,
      ...(prepared.followUpAnswers ? { followUpAnswers: prepared.followUpAnswers } : {}),
    };
    return {
      requestId: ctx.requestId,
      systemPrompt: prepared.systemPrompt,
      userPrompt: adapter.id === "rule-synthesizer" ? JSON.stringify(task) : prepared.userPrompt,
      modelId: resolveAdapterModelId(prepared.draft.modelId, adapter),
      maxOutputTokens: 2048,
      timeoutMs: options.timeoutMs,
      signal: ctx.signal,
    };
  }

  async function dispatch(
    modelId: string | null,
    live: { systemPrompt: string; userPrompt: string; image?: LlmImageAttachment },
    synthUserPrompt: string,
    ctx: OrchestratorContext,
  ): Promise<{ result: LlmCompletionResult; healed: boolean }> {
    const fullChain = options.registry.failoverChain(modelId);
    const chain = options.disableFailover ? fullChain.slice(0, 1) : fullChain;
    const preferred = chain[0];
    for (const adapter of chain) {
      if (!acquire(adapter.id, clock())) continue;
      const resolvedModelId = resolveAdapterModelId(modelId, adapter);
      const request: LlmCompletionRequest = {
        requestId: ctx.requestId,
        systemPrompt: live.systemPrompt,
        userPrompt: adapter.id === "rule-synthesizer" ? synthUserPrompt : live.userPrompt,
        ...(adapter.id !== "rule-synthesizer" && live.image ? { image: live.image } : {}),
        modelId: resolvedModelId,
        timeoutMs: options.timeoutMs,
        signal: ctx.signal,
      };
      try {
        options.onLlmRequest?.({
          providerId: adapter.id,
          modelId: resolvedModelId,
          requestId: ctx.requestId,
          streaming: false,
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          maxOutputTokens: request.maxOutputTokens,
          timeoutMs: request.timeoutMs,
        });
        const result = await adapter.complete(request);
        succeed(adapter.id);
        const healed = adapter !== preferred;
        options.onLlmResponse?.({
          providerId: result.providerId,
          modelId: result.modelId,
          requestId: ctx.requestId,
          streaming: false,
          latencyMs: result.latencyMs,
          usage: result.usage,
          text: result.text,
          healed,
        });
        return { result, healed };
      } catch (error) {
        if (isInputGuardError(error)) throw error;
        const providerError = asProviderError(error);
        fail(adapter.id, clock(), providerError, {
          modelId: resolvedModelId,
          requestId: ctx.requestId,
        });
        if (options.disableFailover || adapter.id === "rule-synthesizer") throw providerError;
      }
    }
    throw new LlmProviderError("provider_error", "No provider available.");
  }

  return {
    async compose(input, ctx) {
      const prepared = prepareCompose(input);
      const task: SynthesizerTask = {
        kind: "compose",
        draft: prepared.draft,
        interactionId: input.interactionId,
        ...(prepared.followUpAnswers ? { followUpAnswers: prepared.followUpAnswers } : {}),
      };
      const { result, healed } = await dispatch(
        prepared.draft.modelId,
        { systemPrompt: prepared.systemPrompt, userPrompt: prepared.userPrompt },
        JSON.stringify(task),
        ctx,
      );
      return toComposeOutput(prepared, result, healed, ctx);
    },
    async *composeStream(input, ctx): AsyncIterable<ComposeStreamEvent> {
      const prepared = prepareCompose(input);
      const fullChain = options.registry.failoverChain(prepared.draft.modelId);
      const chain = options.disableFailover ? fullChain.slice(0, 1) : fullChain;
      const preferred = chain[0];
      for (const adapter of chain) {
        if (!acquire(adapter.id, clock())) continue;
        let yielded = false;
        const req = requestFor(adapter, prepared, ctx);
        try {
          options.onLlmRequest?.({
            providerId: adapter.id,
            modelId: req.modelId ?? adapter.defaultModel,
            requestId: ctx.requestId,
            streaming: true,
            systemPrompt: req.systemPrompt,
            userPrompt: req.userPrompt,
            maxOutputTokens: req.maxOutputTokens,
            timeoutMs: req.timeoutMs,
          });
          for await (const event of adapter.stream(req)) {
            if (event.type === "text-delta") {
              yielded = true;
              yield event;
              continue;
            }
            succeed(adapter.id);
            const healed = adapter !== preferred;
            options.onLlmResponse?.({
              providerId: event.result.providerId,
              modelId: event.result.modelId,
              requestId: ctx.requestId,
              streaming: true,
              latencyMs: event.result.latencyMs,
              usage: event.result.usage,
              text: event.result.text,
              healed,
            });
            yield {
              type: "done",
              output: toComposeOutput(prepared, event.result, healed, ctx),
            };
            return;
          }
          const providerError = new LlmProviderError(
            "provider_error",
            "Stream ended before completion.",
          );
          if (yielded) throw providerError;
          fail(adapter.id, clock(), providerError, {
            modelId: req.modelId ?? adapter.defaultModel,
            requestId: ctx.requestId,
          });
        } catch (error) {
          if (isInputGuardError(error)) throw error;
          const providerError = asProviderError(error);
          if (yielded) throw providerError;
          fail(adapter.id, clock(), providerError, {
            modelId: req.modelId ?? adapter.defaultModel,
            requestId: ctx.requestId,
          });
          if (options.disableFailover || adapter.id === "rule-synthesizer") throw providerError;
        }
      }
    },
    async refine(input, ctx) {
      assertNoClientSystemPrompt(input);
      const sanitized: RefinePromptInput = {
        ...input,
        originalPrompt: sanitizeUserText(input.originalPrompt, 10000),
        failedOutput: sanitizeOptionalUserText(input.failedOutput, 10000),
        targetTone: sanitizeOptionalUserText(input.targetTone, 200),
      };
      const task: SynthesizerTask = { kind: "refine", input: sanitized };
      try {
        const { result } = await dispatch(
          sanitized.targetModelId ?? null,
          { systemPrompt: buildRefineSystemPrompt(), userPrompt: JSON.stringify(sanitized) },
          JSON.stringify(task),
          ctx,
        );
        const parsed = parseRefine(result.text);
        if (!parsed) return fallbackRefine(sanitized, ctx, result.latencyMs);
        return {
          ...parsed,
          providerId: result.providerId,
          modelId: result.modelId,
          latencyMs: result.latencyMs,
          requestId: ctx.requestId,
        };
      } catch (error) {
        if (isInputGuardError(error)) throw error;
        return fallbackRefine(sanitized, ctx, 0);
      }
    },
    async reverseEngineer(input, ctx) {
      assertNoClientSystemPrompt(input);
      const sanitized: ReverseEngineerInput = {
        ...input,
        focusNotes: sanitizeOptionalUserText(input.focusNotes, 500),
      };
      const task: SynthesizerTask = { kind: "reverse_engineer", input: sanitized };
      try {
        const { result } = await dispatch(
          sanitized.targetModelId ?? "google-image",
          {
            systemPrompt: buildReverseEngineerSystemPrompt(sanitized.targetMode),
            userPrompt: JSON.stringify({
              targetMode: sanitized.targetMode,
              focusNotes: sanitized.focusNotes,
            }),
            image: {
              base64: sanitized.imageBase64,
              mimeType: sanitized.mimeType,
            },
          },
          JSON.stringify(task),
          ctx,
        );
        const parsed = parseReverseEngineer(result.text, sanitized, result, ctx);
        if (!parsed) return fallbackReverseEngineer(sanitized, ctx, result.latencyMs);
        return parsed;
      } catch (error) {
        if (isInputGuardError(error)) throw error;
        return fallbackReverseEngineer(sanitized, ctx, 0);
      }
    },
    healthSnapshot(): readonly ProviderHealthSnapshot[] {
      return options.registry.list().map((adapter) => {
        const memory = circuits.get(adapter.id) ?? initialCircuitMemory();
        return {
          providerId: adapter.id,
          circuit: memory.state,
          recentFailureRate: circuitFailureRate(memory),
          lastErrorAt: memory.lastErrorAt,
        };
      });
    },
  };
}
