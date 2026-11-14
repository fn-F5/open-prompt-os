import type { ComposerDraft } from "@open-prompt-os/contracts";
import { describe, expect, it } from "vitest";
import {
  describeFramework,
  diagnoseAndRefinePrompt,
  generateFollowUpQuestions,
  synthesizeCompiledPrompt,
  synthesizeReverseEngineeredPrompt,
} from "./rule-synthesizer.js";

function makeDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return {
    rawInput: "Design rollout",
    mode: "text",
    framework: "costar",
    modelId: "claude-3-7-sonnet",
    constraints: [],
    guardrails: [],
    advanced: {},
    ...overrides,
  };
}

describe("describeFramework", () => {
  it("returns labels for known frameworks and falls back cleanly", () => {
    expect(describeFramework(undefined)).toContain("CO-STAR");
    expect(describeFramework("rise")).toContain("RISE");
    expect(describeFramework("care")).toContain("CARE");
    expect(describeFramework("cot")).toContain("Chain-of-Thought");
    expect(describeFramework("unknown")).toBe("Direct Operational Specification");
  });
});

describe("generateFollowUpQuestions", () => {
  it("generates up to 3 mode-specific follow-up questions when fields are missing", () => {
    expect(generateFollowUpQuestions(makeDraft({ mode: "text" }))).toHaveLength(3);
    expect(generateFollowUpQuestions(makeDraft({ mode: "image" }))[1]).toContain("aspect ratio");
    expect(generateFollowUpQuestions(makeDraft({ mode: "video" }))[1]).toContain("camera movement");
    expect(
      generateFollowUpQuestions(
        makeDraft({
          rawInput: "A".repeat(60),
          goal: "Ship safely",
          audience: "Engineers",
          format: "Checklist",
        }),
      ),
    ).toEqual([]);
  });
});

describe("synthesizeCompiledPrompt", () => {
  it("synthesizes text prompts with provider detection, length directives, and clarification answers", () => {
    const out = synthesizeCompiledPrompt(
      makeDraft({
        modelId: "gpt-4.1",
        constraints: ["Keep under 10 bullets"],
        guardrails: ["No fabricated metrics"],
        advanced: { length: "short" },
      }),
      "int_1234567890",
      { "Who is the audience?": "Platform SREs", Empty: "   " },
    );

    expect(out.providerId).toBe("openai");
    expect(out.requestId).toBe("req_int_123456");
    expect(out.compiledPrompt).toContain("## Clarified Context");
    expect(out.compiledPrompt).toContain("Platform SREs");
    expect(out.compiledPrompt).toContain("under 250 words");
    expect(out.compiledPrompt).toContain("MUST adhere to: Keep under 10 bullets");
    expect(out.compiledPrompt).toContain("GUARDRAIL: No fabricated metrics");
    expect(out.detectedVariables).toEqual(["Project_Context", "Target_Constraint"]);
  });

  it("synthesizes image and video prompts with appropriate defaults and provider mapping", () => {
    const img = synthesizeCompiledPrompt(
      makeDraft({
        mode: "image",
        modelId: undefined,
        rawInput: "Brushed steel watch on slate",
        advanced: { length: "detailed" },
      }),
      "int_img",
    );
    expect(img.providerId).toBe("gemini");
    expect(img.modelId).toBe("imagen-3-pro");
    expect(img.compiledPrompt).toContain("VISUAL GENERATION SPECIFICATION");
    expect(img.detectedVariables).toEqual(["Primary_Subject", "Key_Detail_Focus", "Variable"]);

    const vid = synthesizeCompiledPrompt(
      makeDraft({
        mode: "video",
        modelId: "custom-local",
        rawInput: "camera sweeps across a misty valley",
      }),
      "int_vid",
    );
    expect(vid.providerId).toBe("rule-synthesizer");
    expect(vid.compiledPrompt).toContain("MOTION & TEMPORAL PROMPT SPECIFICATION");
    expect(vid.detectedVariables).toEqual(["Opening_Frame", "Closing_Beat", "Variable"]);
  });
});

describe("diagnoseAndRefinePrompt", () => {
  it("identifies structural findings in improve mode and autopsy remediation findings", () => {
    const improve = diagnoseAndRefinePrompt({
      originalPrompt: "Write a release announcement for our API.",
      mode: "improve",
      targetLength: "balanced",
    });

    expect(improve.findings.map((f) => f.category)).toEqual([
      "missing_context",
      "ambiguous_goal",
      "weak_output_format",
      "undefined_audience",
    ]);
    expect(improve.summary).toContain("Resolved 4 structural gaps");

    const autopsy = diagnoseAndRefinePrompt({
      originalPrompt:
        "Role: You are an SRE. Objective: produce a Markdown incident report for the target audience with strict formatting and zero fluff over 120 characters total.",
      mode: "autopsy",
      failedOutput: "Here is a made-up outage timeline with fake timestamps.",
      targetTone: "crisp",
      targetLength: "short",
      targetModelId: "gpt-4.1",
    });

    expect(autopsy.findings).toHaveLength(1);
    expect(autopsy.findings[0]?.category).toBe("unsafe_guardrail");
    expect(autopsy.optimizedPrompt).toContain("REJECT prior failure pattern");
    expect(autopsy.modelId).toBe("gpt-4.1");
    expect(autopsy.summary).toContain("Diagnosed 1 structural failure vectors");
  });
});

describe("synthesizeReverseEngineeredPrompt", () => {
  it("builds structured visual and video motion prompts with breakdown and suggestedDraft", () => {
    const baseInput = {
      imageBase64: "A".repeat(64),
      mimeType: "image/png" as const,
      focusNotes: "Emphasize chiaroscuro shadows",
    };

    const imageOut = synthesizeReverseEngineeredPrompt({
      ...baseInput,
      targetMode: "image",
    });
    expect(imageOut.providerId).toBe("rule-synthesizer");
    expect(imageOut.modelId).toBe("imagen-3-pro");
    expect(imageOut.reconstructedPrompt).toContain("RECONSTRUCTED VISUAL PROMPT");
    expect(imageOut.reconstructedPrompt).toContain("Emphasize chiaroscuro shadows");
    expect(imageOut.detectedVariables).toEqual(["Primary_Subject", "Color_Palette"]);
    expect(imageOut.breakdown.subject).toContain("[Primary_Subject]");
    expect(imageOut.breakdown.negativePrompt.length).toBeGreaterThan(0);
    expect(imageOut.suggestedDraft.mode).toBe("image");
    expect(imageOut.suggestedDraft.rawInput).toBe(imageOut.reconstructedPrompt);

    const videoOut = synthesizeReverseEngineeredPrompt({
      ...baseInput,
      targetMode: "video",
      targetModelId: "sora-turbo",
    });
    expect(videoOut.modelId).toBe("sora-turbo");
    expect(videoOut.reconstructedPrompt).toContain("RECONSTRUCTED VIDEO MOTION PROMPT");
    expect(videoOut.suggestedDraft.mode).toBe("video");
    expect(videoOut.suggestedDraft.modelId).toBe("sora-turbo");
  });
});
