import type { OrchestratorContext, PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type {
  ComposePromptInput,
  ComposePromptOutput,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import {
  assertMeaningfulPrompt,
  extractDraftSupplementalText,
  isInputGuardError,
  redactSecrets,
} from "@open-prompt-os/core";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { toUserFacingServerError } from "../errors.js";
import { logger } from "../logger.js";
import { recordPromptGeneration, releaseQuota, reserveQuota } from "../services/usage-quota.js";

function failure(error: unknown, requestId: string): never {
  if (error instanceof ORPCError) {
    throw error;
  }
  if (isInputGuardError(error)) {
    logger.warn("Prompt input rejected by guard", {
      event: "prompt.validation_error",
      requestId,
      err: error,
    });
    throw new ORPCError("BAD_REQUEST", {
      message: `VALIDATION_ERROR: ${redactSecrets(error.message)}`,
      data: { requestId },
    });
  }
  logger.error("Prompt procedure execution failed", {
    event: "prompt.execution_failed",
    requestId,
    err: error,
  });
  const safe = toUserFacingServerError(error);
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: safe.message,
    data: { requestId, code: safe.code },
  });
}

export async function executeCompose(
  orchestrator: PromptOrchestrator,
  input: ComposePromptInput,
  ctx: OrchestratorContext & { actor: ResolvedActor },
): Promise<ComposePromptOutput> {
  try {
    assertMeaningfulPrompt(input.draft.rawInput, {
      supplementalText: extractDraftSupplementalText(input.draft),
    });
  } catch (error) {
    failure(error, ctx.requestId);
  }

  const quota = await reserveQuota(ctx.actor, "compose");
  if (!quota.allowed) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "QUOTA_EXCEEDED: Daily limit reached for prompt composition. Upgrade your plan or try again tomorrow.",
      data: { requestId: ctx.requestId, code: "QUOTA_EXCEEDED" },
    });
  }

  try {
    const started = Date.now();
    const result = await orchestrator.compose(input, ctx);
    const latencyMs = result.latencyMs || Date.now() - started;

    // Persist to prompt_generations
    await recordPromptGeneration(ctx.actor, {
      kind: "compose",
      rawInput: input.draft.rawInput,
      compiledPrompt: result.compiledPrompt,
      draft: input.draft,
      mode: input.draft.mode,
      framework: input.draft.framework ?? "costar",
      modelId: input.draft.modelId,
      providerId: result.providerId,
      latencyMs,
    });

    return {
      ...result,
      remainingDailyPrompts: quota.remainingDaily,
    };
  } catch (error) {
    if (quota.reserved) {
      await releaseQuota(ctx.actor, "compose");
    }
    failure(error, ctx.requestId);
  }
}

export async function executeRefine(
  orchestrator: PromptOrchestrator,
  input: RefinePromptInput,
  ctx: OrchestratorContext & { actor: ResolvedActor; kind?: "refine" | "autopsy" },
): Promise<RefinePromptOutput> {
  try {
    assertMeaningfulPrompt(input.originalPrompt);
  } catch (error) {
    failure(error, ctx.requestId);
  }

  const action = ctx.kind === "autopsy" ? "autopsy" : "refine";
  const quota = await reserveQuota(ctx.actor, action);
  if (!quota.allowed) {
    throw new ORPCError("FORBIDDEN", {
      message: `QUOTA_EXCEEDED: Daily limit reached for ${action}. Upgrade your plan or try again tomorrow.`,
      data: { requestId: ctx.requestId, code: "QUOTA_EXCEEDED" },
    });
  }

  try {
    const started = Date.now();
    const result = await orchestrator.refine(input, ctx);
    const latencyMs = result.latencyMs || Date.now() - started;

    // Persist to prompt_generations
    await recordPromptGeneration(ctx.actor, {
      kind: action,
      rawInput: input.originalPrompt,
      compiledPrompt: result.optimizedPrompt,
      mode: "text",
      framework: "costar",
      modelId: result.modelId,
      providerId: result.providerId,
      latencyMs,
    });

    return result;
  } catch (error) {
    if (quota.reserved) {
      await releaseQuota(ctx.actor, action);
    }
    failure(error, ctx.requestId);
  }
}

export async function executeReverseEngineer(
  orchestrator: PromptOrchestrator,
  input: ReverseEngineerInput,
  ctx: OrchestratorContext & { actor: ResolvedActor },
): Promise<ReverseEngineerOutput> {
  const quota = await reserveQuota(ctx.actor, "reverse_engineer");
  if (!quota.allowed) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "QUOTA_EXCEEDED: Daily limit reached for Reverse Engineer. Upgrade your plan or try again tomorrow.",
      data: { requestId: ctx.requestId, code: "QUOTA_EXCEEDED" },
    });
  }

  try {
    const started = Date.now();
    const result = await orchestrator.reverseEngineer(input, ctx);
    const latencyMs = result.latencyMs || Date.now() - started;

    const fallbackPreview =
      input.imageBase64.length <= 120_000
        ? `data:${input.mimeType};base64,${input.imageBase64}`
        : undefined;
    const sourcePreviewDataUrl = input.previewImageDataUrl ?? fallbackPreview;

    await recordPromptGeneration(ctx.actor, {
      kind: "reverse_engineer",
      rawInput: input.focusNotes?.trim() || `[Image Upload: ${input.mimeType}]`,
      compiledPrompt: result.reconstructedPrompt,
      draft: sourcePreviewDataUrl
        ? { ...result.suggestedDraft, sourcePreviewDataUrl }
        : result.suggestedDraft,
      mode: input.targetMode,
      framework: "costar",
      modelId: result.modelId,
      providerId: result.providerId,
      latencyMs,
    });

    return {
      ...result,
      remainingDailyRuns: quota.remainingDaily,
    };
  } catch (error) {
    if (quota.reserved) {
      await releaseQuota(ctx.actor, "reverse_engineer");
    }
    failure(error, ctx.requestId);
  }
}
