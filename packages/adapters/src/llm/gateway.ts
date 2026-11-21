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
  VideoReverseEngineerInput,
  VideoReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import {
  DiagnosticCategorySchema,
  DiagnosticFindingSchema,
  DiagnosticSeveritySchema,
  RefinePromptOutputSchema,
  ReverseEngineerBreakdownSchema,
  ReverseEngineerOutputSchema,
  VideoContinuityBibleSchema,
  VideoShotSchema,
} from "@open-prompt-os/contracts";
import type { CircuitMemory } from "@open-prompt-os/core";
import {
  InputGuardError,
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
  buildVideoReverseEngineerSystemPrompt,
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

/** Strip accidental meta-directive / specification headers so video prompts are ready to paste. */
function stripVideoSpecWrapper(text: string): string {
  return text
    .replace(/^Generate (?:video|image) following the specification\.\s*\n?/i, "")
    .replace(/^Role:\s*You are [^\n]*\n+/i, "")
    .replace(/^#\s*MOTION\s*&\s*TEMPORAL\s*PROMPT\s*SPECIFICATION[^\n]*\n+/i, "")
    .trim();
}

function parseVideoReverseEngineer(
  text: string,
  input: VideoReverseEngineerInput,
  result: LlmCompletionResult,
  ctx: OrchestratorContext,
): VideoReverseEngineerOutput | null {
  try {
    const raw = JSON.parse(unfenceJson(text)) as Record<string, unknown>;
    const overviewRaw = raw.overview as Record<string, unknown> | undefined;
    const bibleParsed = VideoContinuityBibleSchema.safeParse(raw.continuityBible);
    const rawShots = Array.isArray(raw.shots) ? raw.shots.slice(0, 8) : [];
    const shotsParsed = rawShots
      .map((item, idx) =>
        VideoShotSchema.safeParse({
          ...(item && typeof item === "object" ? item : {}),
          shotNumber:
            item &&
            typeof item === "object" &&
            typeof (item as { shotNumber?: unknown }).shotNumber === "number"
              ? (item as { shotNumber: number }).shotNumber
              : idx + 1,
        }),
      )
      .filter(
        (parsed): parsed is { success: true; data: VideoReverseEngineerOutput["shots"][number] } =>
          parsed.success,
      )
      .map((parsed) => ({
        ...parsed.data,
        firstFramePrompt: stripVideoSpecWrapper(parsed.data.firstFramePrompt),
        shotPrompt: stripVideoSpecWrapper(parsed.data.shotPrompt),
      }));

    const masterPrompt =
      typeof raw.masterPrompt === "string" ? stripVideoSpecWrapper(raw.masterPrompt) : "";
    if (!overviewRaw || !bibleParsed.success || shotsParsed.length === 0 || !masterPrompt) {
      return null;
    }

    const durationSeconds =
      typeof overviewRaw.durationSeconds === "number" &&
      Number.isFinite(overviewRaw.durationSeconds)
        ? Math.max(0, overviewRaw.durationSeconds)
        : (input.endOffsetSec ?? input.durationSeconds ?? 15) - input.startOffsetSec;
    const aspectRatio =
      typeof overviewRaw.aspectRatio === "string" && overviewRaw.aspectRatio.trim().length > 0
        ? overviewRaw.aspectRatio.trim()
        : "16:9";
    const pacingStyle =
      typeof overviewRaw.pacingStyle === "string" && overviewRaw.pacingStyle.trim().length > 0
        ? overviewRaw.pacingStyle.trim()
        : "24fps cinematic";
    const isSingleTake =
      typeof overviewRaw.isSingleTake === "boolean"
        ? overviewRaw.isSingleTake
        : shotsParsed.length === 1;

    const bible = bibleParsed.data;
    const draftModelId =
      input.targetGenerator === "runway"
        ? "runway-video"
        : input.targetGenerator === "sora"
          ? "sora-turbo"
          : "google-video";

    return {
      overview: {
        durationSeconds,
        aspectRatio,
        pacingStyle,
        isSingleTake,
        timestampsAreEstimated: true,
      },
      continuityBible: bible,
      shots: shotsParsed,
      targetGenerator: input.targetGenerator,
      masterPrompt,
      detectedVariables: [],
      suggestedDraft: {
        rawInput: masterPrompt,
        mode: "video",
        modelId: draftModelId,
        goal: "Recreate the reference video's visual continuity, camera choreography, lighting, and audio pacing.",
        format: bible.lensAndOpticalDna,
        tone: bible.lightingAndColorGrade,
        constraints: [bible.subjectAndWardrobe, bible.audioAndMusicDna].filter(Boolean),
        guardrails: [bible.negativeGuardrails],
        framework: "costar",
        advanced: { length: "detailed", creativity: 0.4 },
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
    async reverseEngineerVideo(input, ctx) {
      assertNoClientSystemPrompt(input);
      const focusNotes = sanitizeOptionalUserText(input.focusNotes, 500);
      const gemini = options.registry
        .list()
        .find((adapter) => adapter.id === "gemini" && adapter.isConfigured());
      if (!gemini) {
        throw new LlmProviderError(
          "not_configured",
          "Video reverse engineering requires a configured Gemini provider.",
        );
      }
      if (!acquire("gemini", clock())) {
        throw new LlmProviderError(
          "provider_error",
          "Gemini video analyzer is temporarily cooling down. Please try again shortly.",
        );
      }

      const videoTimeoutMs = Math.max(options.timeoutMs, 120_000);
      ctx.onStage?.("preparing");

      const videoAttachment =
        input.sourceType === "youtube"
          ? {
              fileUri: input.youtubeUrl,
              mimeType: "video/mp4" as const,
              startOffsetSec: input.startOffsetSec,
              endOffsetSec: input.endOffsetSec,
            }
          : {
              bytes: input.fileBytes,
              mimeType: input.mimeType ?? ("video/mp4" as const),
              startOffsetSec: input.startOffsetSec > 0 ? input.startOffsetSec : undefined,
              endOffsetSec: input.endOffsetSec,
            };

      if (input.sourceType === "youtube" && !videoAttachment.fileUri) {
        throw new InputGuardError("A valid YouTube URL is required.");
      }
      if (
        input.sourceType === "upload" &&
        (!videoAttachment.bytes || videoAttachment.bytes.length === 0)
      ) {
        throw new InputGuardError("A video file is required.");
      }

      ctx.onStage?.("analyzing");
      let result: LlmCompletionResult;
      try {
        result = await gemini.complete({
          requestId: ctx.requestId,
          systemPrompt: buildVideoReverseEngineerSystemPrompt(input.targetGenerator),
          userPrompt: JSON.stringify({
            sourceType: input.sourceType,
            targetGenerator: input.targetGenerator,
            startOffsetSec: input.startOffsetSec,
            endOffsetSec: input.endOffsetSec,
            durationSeconds: input.durationSeconds,
            focusNotes,
          }),
          video: videoAttachment,
          responseMimeType: "application/json",
          modelId: "gemini-3.6-flash",
          timeoutMs: videoTimeoutMs,
          signal: ctx.signal,
        });
        succeed("gemini");
      } catch (error) {
        if (isInputGuardError(error)) throw error;
        const providerError = asProviderError(error);
        fail("gemini", clock(), providerError);
        throw providerError;
      }

      ctx.onStage?.("finalizing");
      const parsed = parseVideoReverseEngineer(result.text, input, result, ctx);
      if (!parsed) {
        throw new LlmProviderError(
          "provider_error",
          "Could not parse structured video analysis. Please retry.",
        );
      }
      return parsed;
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
