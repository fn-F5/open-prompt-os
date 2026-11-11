import type {
  ComposeStreamEvent,
  LlmCompletionRequest,
  LlmCompletionResult,
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
} from "@open-prompt-os/contracts";
import { RefinePromptOutputSchema } from "@open-prompt-os/contracts";
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
} from "@open-prompt-os/core";
import { asProviderError } from "./errors.js";
import { buildComposeSystemPrompt, buildRefineSystemPrompt } from "./instructions.js";
import type { ProviderRegistry } from "./registry.js";
import type { SynthesizerTask } from "./synthesizer.js";

export interface OrchestratorOptions {
  readonly registry: ProviderRegistry;
  readonly timeoutMs: number;
  readonly clock?: () => number;
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
  const userPrompt = JSON.stringify({
    rawInput: draft.rawInput,
    mode: draft.mode,
    goal: draft.goal,
    audience: draft.audience,
    constraints: draft.constraints,
    format: draft.format,
    persona: draft.persona,
    tone: draft.tone,
    guardrails: draft.guardrails,
    framework: draft.framework,
    followUpAnswers,
  });
  return {
    input,
    draft,
    followUpAnswers,
    systemPrompt: buildComposeSystemPrompt(draft.framework),
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

function parseRefine(text: string): RefinePromptOutput | null {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = RefinePromptOutputSchema.safeParse(JSON.parse(unfenced));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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

  function fail(id: ProviderId, now: number, error: LlmProviderError): void {
    if (id === "rule-synthesizer") return;
    const current = circuits.get(id) ?? initialCircuitMemory();
    circuits.set(id, circuitRecordFailure(current, now, redactSecrets(error.message)));
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
      modelId: prepared.draft.modelId ?? adapter.defaultModel,
      timeoutMs: options.timeoutMs,
      signal: ctx.signal,
    };
  }

  async function dispatch(
    modelId: string | null,
    live: { systemPrompt: string; userPrompt: string },
    synthUserPrompt: string,
    ctx: OrchestratorContext,
  ): Promise<{ result: LlmCompletionResult; healed: boolean }> {
    const chain = options.registry.failoverChain(modelId);
    const preferred = chain[0];
    for (const adapter of chain) {
      if (!acquire(adapter.id, clock())) continue;
      const request: LlmCompletionRequest = {
        requestId: ctx.requestId,
        systemPrompt: live.systemPrompt,
        userPrompt: adapter.id === "rule-synthesizer" ? synthUserPrompt : live.userPrompt,
        modelId: modelId ?? adapter.defaultModel,
        timeoutMs: options.timeoutMs,
        signal: ctx.signal,
      };
      try {
        const result = await adapter.complete(request);
        succeed(adapter.id);
        return { result, healed: adapter !== preferred };
      } catch (error) {
        if (isInputGuardError(error)) throw error;
        const providerError = asProviderError(error);
        fail(adapter.id, clock(), providerError);
        if (adapter.id === "rule-synthesizer") throw providerError;
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
      const chain = options.registry.failoverChain(prepared.draft.modelId);
      const preferred = chain[0];
      for (const adapter of chain) {
        if (!acquire(adapter.id, clock())) continue;
        let yielded = false;
        try {
          for await (const event of adapter.stream(requestFor(adapter, prepared, ctx))) {
            if (event.type === "text-delta") {
              yielded = true;
              yield event;
              continue;
            }
            succeed(adapter.id);
            yield {
              type: "done",
              output: toComposeOutput(prepared, event.result, adapter !== preferred, ctx),
            };
            return;
          }
          const providerError = new LlmProviderError(
            "provider_error",
            "Stream ended before completion.",
          );
          if (yielded) throw providerError;
          fail(adapter.id, clock(), providerError);
        } catch (error) {
          if (isInputGuardError(error)) throw error;
          const providerError = asProviderError(error);
          if (yielded) throw providerError;
          fail(adapter.id, clock(), providerError);
          if (adapter.id === "rule-synthesizer") throw providerError;
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
