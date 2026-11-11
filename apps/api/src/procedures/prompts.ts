import type { OrchestratorContext, PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type {
  ComposePromptInput,
  ComposePromptOutput,
  RefinePromptInput,
  RefinePromptOutput,
} from "@open-prompt-os/contracts";
import { isInputGuardError, redactSecrets } from "@open-prompt-os/core";
import { ORPCError } from "@orpc/server";

function failure(error: unknown, requestId: string): never {
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
  ctx: OrchestratorContext,
): Promise<ComposePromptOutput> {
  try {
    return await orchestrator.compose(input, ctx);
  } catch (error) {
    failure(error, ctx.requestId);
  }
}

export async function executeRefine(
  orchestrator: PromptOrchestrator,
  input: RefinePromptInput,
  ctx: OrchestratorContext,
): Promise<RefinePromptOutput> {
  try {
    return await orchestrator.refine(input, ctx);
  } catch (error) {
    failure(error, ctx.requestId);
  }
}
