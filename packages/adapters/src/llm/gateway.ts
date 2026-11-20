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
  DiagnosticCategorySchema,
  DiagnosticFindingSchema,
  DiagnosticSeveritySchema,
  RefinePromptOutputSchema,
  ReverseEngineerBreakdownSchema,
  ReverseEngineerOutputSchema,
} from "@open-prompt-os/contracts";
import type { CircuitMemory } from "@open-prompt-os/core";
import {
  analyzePromptVariables,
  assertMeaningfulPrompt,
  assertNoClientSystemPrompt,
  circuitAllows,
  circuitFailureRate,
  circuitRecordFailure,
  circuitRecordSuccess,
  diagnoseAndRefinePrompt,
  extractDraftSupplementalText,
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
  assertMeaningfulPrompt(draft.rawInput, {
    supplementalText: extractDraftSupplementalText(draft),
  });
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

function parseRefine(
  text: string,
  result: LlmCompletionResult,
  ctx: OrchestratorContext,
): RefinePromptOutput | null {
  try {
    const raw = JSON.parse(unfenceJson(text)) as Record<string, unknown>;
    const fullParsed = RefinePromptOutputSchema.safeParse(raw);
    if (fullParsed.success) {
      return {
        ...fullParsed.data,
        providerId: result.providerId,
        modelId: result.modelId,
        latencyMs: result.latencyMs,
        requestId: ctx.requestId,
      };
    }

    const optimizedPrompt =
      typeof raw.optimizedPrompt === "string" ? raw.optimizedPrompt.trim() : "";
    if (!optimizedPrompt) return null;

    const rawFindings = Array.isArray(raw.findings) ? raw.findings : [];
    const findings: RefinePromptOutput["findings"] = [];
    for (let index = 0; index < rawFindings.length; index += 1) {
      const item = rawFindings[index];
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const categoryParsed = DiagnosticCategorySchema.safeParse(
        typeof record.category === "string" ? record.category.trim().toLowerCase() : "",
      );
      const severityParsed = DiagnosticSeveritySchema.safeParse(
        typeof record.severity === "string" ? record.severity.trim().toLowerCase() : "",
      );
      const candidate = DiagnosticFindingSchema.safeParse({
        id:
          typeof record.id === "string" && record.id.trim().length > 0
            ? record.id.trim()
            : `finding-${index + 1}`,
        category: categoryParsed.success ? categoryParsed.data : "missing_context",
        title: typeof record.title === "string" ? record.title.trim() : "",
        severity: severityParsed.success ? severityParsed.data : "warning",
        evidence: typeof record.evidence === "string" ? record.evidence.trim() : "",
        recommendation:
          typeof record.recommendation === "string" ? record.recommendation.trim() : "",
        changedSection:
          typeof record.changedSection === "string" && record.changedSection.trim().length > 0
            ? record.changedSection.trim()
            : "## Optimized Specification",
      });
      if (candidate.success && candidate.data.title.length > 0) {
        findings.push(candidate.data);
      }
    }

    const varAnalysis = analyzePromptVariables(optimizedPrompt);
    const summary =
      typeof raw.summary === "string" && raw.summary.trim().length > 0
        ? raw.summary.trim()
        : `Identified ${findings.length} structural improvement(s) and synthesized a hardened prompt specification.`;

    return {
      optimizedPrompt,
      detectedVariables: varAnalysis.detectedVariables,
      unresolvedVariables: varAnalysis.unresolvedVariables,
      duplicateVariables: varAnalysis.duplicateVariables,
      findings,
      summary,
      providerId: result.providerId,
      modelId: result.modelId,
      latencyMs: result.latencyMs,
      requestId: ctx.requestId,
    };
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
      modelId: resolveAdapterModelId(prepared.draft.modelId, adapter),
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
    const chain = options.registry.failoverChain(modelId);
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
      assertMeaningfulPrompt(sanitized.originalPrompt);
      const task: SynthesizerTask = { kind: "refine", input: sanitized };
      try {
        const { result } = await dispatch(
          sanitized.targetModelId ?? null,
          {
            systemPrompt: buildRefineSystemPrompt({
              mode: sanitized.mode,
              targetModelId: sanitized.targetModelId,
            }),
            userPrompt: JSON.stringify(sanitized),
          },
          JSON.stringify(task),
          ctx,
        );
        const parsed = parseRefine(result.text, result, ctx);
        if (!parsed) return fallbackRefine(sanitized, ctx, result.latencyMs);
        return parsed;
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
          sanitized.targetModelId ?? "gemini-2.5-pro",
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
