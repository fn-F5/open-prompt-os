import type { ComposerMode } from "@open-prompt-os/contracts";
import { describeFramework } from "@open-prompt-os/core";
import {
  COMPOSE_MODE_PROMPTS,
  COMPOSE_SYSTEM_PREAMBLE,
  REFINE_SYSTEM_PREAMBLE,
  REVERSE_ENGINEER_SYSTEM_PREAMBLE,
  TARGET_MODEL_GUIDANCE,
  describeTargetModel,
} from "./prompt-config.js";

export {
  COMPOSE_MODE_PROMPTS,
  COMPOSE_SYSTEM_PREAMBLE,
  REFINE_SYSTEM_PREAMBLE,
  REVERSE_ENGINEER_SYSTEM_PREAMBLE,
  TARGET_MODEL_GUIDANCE,
  describeTargetModel,
};

export interface BuildComposeSystemPromptOptions {
  readonly mode?: ComposerMode;
  readonly modelId?: string | null;
}

export function buildComposeSystemPrompt(
  framework: string | undefined,
  options?: BuildComposeSystemPromptOptions,
): string {
  const mode: ComposerMode = options?.mode ?? "text";
  const modePrompt = COMPOSE_MODE_PROMPTS[mode] ?? COMPOSE_MODE_PROMPTS.text;

  return [
    COMPOSE_SYSTEM_PREAMBLE,
    modePrompt,
    `Active Framework: ${describeFramework(framework)}`,
    `Target Model (where the user will run this compiled prompt): ${describeTargetModel(options?.modelId, mode)}`,
    "Return only the compiled prompt.",
  ].join("\n\n");
}

export function buildRefineSystemPrompt(): string {
  return `${REFINE_SYSTEM_PREAMBLE}\nFramework: ${describeFramework("costar")}`;
}

export function buildReverseEngineerSystemPrompt(targetMode: "image" | "video"): string {
  return `${REVERSE_ENGINEER_SYSTEM_PREAMBLE}\nTarget modality: ${targetMode}. Do not wrap in markdown code fences.`;
}
