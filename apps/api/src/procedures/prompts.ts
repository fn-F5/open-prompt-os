import type { OrchestratorContext, PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type {
  ComposePromptInput,
  ComposePromptOutput,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import { isInputGuardError, redactSecrets } from "@open-prompt-os/core";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";
import { checkQuota, recordPromptGeneration, recordUsage } from "../services/usage-quota.js";

function failure(error: unknown, requestId: string): never {
  if (error instanceof ORPCError) {
    throw error;
  }
  if (isInputGuardError(error)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `VALIDATION_ERROR: ${redactSecrets(error.message)}`,
      data: { requestId },
    });
  }
  const message = redactSecrets(error instanceof Error ? error.message : "Internal error");
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: `INTERNAL_ERROR: ${message}`,
    data: { requestId },
  });
}

export async function executeCompose(
  orchestrator: PromptOrchestrator,
  input: ComposePromptInput,
  ctx: OrchestratorContext & { actor: ResolvedActor },
): Promise<ComposePromptOutput> {
  const quota = await checkQuota(ctx.actor, "compose");
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

    // Atomically increment daily usage counter
    await recordUsage(ctx.actor, "compose");

    // Persist to prompt_generations if in a tenant workspace
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
      remainingDailyPrompts: Math.max(0, quota.remainingDaily - 1),
    };
  } catch (error) {
    failure(error, ctx.requestId);
  }
}

export async function executeRefine(
  orchestrator: PromptOrchestrator,
  input: RefinePromptInput,
  ctx: OrchestratorContext & { actor: ResolvedActor; kind?: "refine" | "autopsy" },
): Promise<RefinePromptOutput> {
  const action = ctx.kind === "autopsy" ? "autopsy" : "refine";
  const quota = await checkQuota(ctx.actor, action);
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

    // Atomically increment daily usage counter
    await recordUsage(ctx.actor, action);

    // Persist to prompt_generations if in a tenant workspace
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
    failure(error, ctx.requestId);
  }
}

export async function executeReverseEngineer(
  orchestrator: PromptOrchestrator,
  input: ReverseEngineerInput,
  ctx: OrchestratorContext & { actor: ResolvedActor },
): Promise<ReverseEngineerOutput> {
  const quota = await checkQuota(ctx.actor, "reverse_engineer");
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

    await recordUsage(ctx.actor, "reverse_engineer");

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
      remainingDailyRuns: Math.max(0, quota.remainingDaily - 1),
    };
  } catch (error) {
    failure(error, ctx.requestId);
  }
}
