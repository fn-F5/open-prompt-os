import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProviderAdapter,
  LlmStreamEvent,
} from "@open-prompt-os/adapter-kit";
import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import type { ComposerDraft, RefinePromptInput } from "@open-prompt-os/contracts";
import { diagnoseAndRefinePrompt, synthesizeCompiledPrompt } from "@open-prompt-os/core";

export interface SynthesizerComposeTask {
  readonly kind: "compose";
  readonly draft: ComposerDraft;
  readonly interactionId: string;
  readonly followUpAnswers?: Record<string, string>;
}

export interface SynthesizerRefineTask {
  readonly kind: "refine";
  readonly input: RefinePromptInput;
}

export type SynthesizerTask = SynthesizerComposeTask | SynthesizerRefineTask;

function parseTask(userPrompt: string): SynthesizerTask {
  try {
    const parsed = JSON.parse(userPrompt) as SynthesizerTask;
    if (parsed.kind === "compose" || parsed.kind === "refine") return parsed;
  } catch {
    // Fall through to the provider error below.
  }
  throw new LlmProviderError("provider_error", "Synthesizer task payload is invalid.");
}

function resultFromText(
  request: LlmCompletionRequest,
  text: string,
  modelId: string,
  latencyMs: number,
): LlmCompletionResult {
  return {
    text,
    providerId: "rule-synthesizer",
    modelId,
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs,
  };
}

async function completeTask(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
  const started = Date.now();
  const task = parseTask(request.userPrompt);
  if (task.kind === "compose") {
    const synthesized = synthesizeCompiledPrompt(
      task.draft,
      task.interactionId,
      task.followUpAnswers,
    );
    return resultFromText(
      request,
      synthesized.compiledPrompt,
      task.draft.modelId ?? "rule-synthesizer",
      Date.now() - started,
    );
  }
  const refined = diagnoseAndRefinePrompt(task.input);
  return resultFromText(
    request,
    JSON.stringify(refined),
    task.input.targetModelId ?? "rule-synthesizer",
    Date.now() - started,
  );
}

export function createSynthesizerAdapter(): LlmProviderAdapter {
  return {
    id: "rule-synthesizer",
    defaultModel: "rule-synthesizer",
    isConfigured() {
      return true;
    },
    complete: completeTask,
    async *stream(request): AsyncIterable<LlmStreamEvent> {
      const result = await completeTask(request);
      const lines = result.text.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        const text = index === 0 ? line : `\n${line}`;
        if (request.signal?.aborted) {
          throw new LlmProviderError("timeout", "Request aborted");
        }
        yield { type: "text-delta", text };
      }
      yield { type: "done", result };
    },
  };
}
