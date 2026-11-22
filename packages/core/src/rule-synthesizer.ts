import type {
  ComposePromptOutput,
  ComposerDraft,
  DiagnosticFinding,
  RefinePromptInput,
  RefinePromptOutput,
  ReverseEngineerInput,
  ReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import { analyzePromptVariables } from "./prompt-compiler.js";

const FRAMEWORK_LABELS: Record<string, string> = {
  costar: "Inspired by CO-STAR (Context, Objective, Style, Tone, Audience, Response)",
  rise: "Inspired by RISE (Role, Input, Steps, Expectation)",
  care: "Inspired by CARE (Context, Action, Result, Example)",
  cot: "Inspired by Structured Chain-of-Thought",
  none: "Direct Operational Specification",
};

export function describeFramework(framework: string | undefined): string {
  return FRAMEWORK_LABELS[framework ?? "costar"] ?? FRAMEWORK_LABELS.none ?? "Direct";
}

export function generateFollowUpQuestions(draft: ComposerDraft): string[] {
  const questions: string[] = [];
  if (!draft.goal && draft.rawInput.trim().length < 50) {
    questions.push("What is the specific measurable outcome or decision this output should drive?");
  }
  if (!draft.audience && draft.mode === "text") {
    questions.push("Who is the primary reader or target system consuming this response?");
  }
  if (!draft.format) {
    if (draft.mode === "image") {
      questions.push("What aspect ratio, lens focal length, and lighting mood should be enforced?");
    } else if (draft.mode === "video") {
      questions.push("What camera movement, shot duration, and pacing style do you need?");
    } else {
      questions.push(
        "Should the output be structured as a Markdown table, JSON schema, or executive memo?",
      );
    }
  }
  return questions.slice(0, 3);
}

export function synthesizeCompiledPrompt(
  draft: ComposerDraft,
  interactionId: string,
  followUpAnswers?: Record<string, string>,
): ComposePromptOutput {
  const framework = draft.framework ?? "costar";
  const modelId =
    draft.modelId ??
    (draft.mode === "image"
      ? "imagen-3-pro"
      : draft.mode === "video"
        ? "veo-2-cinema"
        : "claude-3-7-sonnet");
  const providerId = modelId.startsWith("claude")
    ? "anthropic"
    : modelId.startsWith("gpt") || modelId.startsWith("o3")
      ? "openai"
      : modelId.startsWith("gemini") || modelId.startsWith("imagen") || modelId.startsWith("veo")
        ? "gemini"
        : "rule-synthesizer";

  const persona =
    draft.persona ||
    (draft.mode === "image"
      ? " Principal Visual Director & Photographic Composition Specialist"
      : draft.mode === "video"
        ? "Senior Cinematographer & Motion Continuity Director"
        : "Staff Systems Architect & Domain Strategist");

  const goal =
    draft.goal || `Execute the primary instruction with high precision: "${draft.rawInput.trim()}"`;

  const audience =
    draft.audience ||
    (draft.mode === "text"
      ? "Technical decision-makers and practitioners requiring immediately actionable output"
      : "High-resolution production pipeline");

  const tone =
    draft.tone ||
    (draft.mode === "text"
      ? "Analytical, direct, zero-fluff"
      : "Photorealistic, high dynamic range");

  const format =
    draft.format ||
    (draft.mode === "image"
      ? "16:9 widescreen composition, 50mm prime lens, f/2.8, natural volumetric key lighting"
      : draft.mode === "video"
        ? "24fps cinematic tracking shot, 6-second continuous take, subtle motion blur"
        : "Structured Markdown with executive summary, actionable implementation steps, and verification checklist");

  const constraints =
    draft.constraints.length > 0
      ? draft.constraints
      : [
          "Avoid generic filler, hedging language, or unverified assumptions",
          "Use concrete, immediately actionable specifics throughout the response",
        ];

  const guardrails =
    draft.guardrails.length > 0
      ? draft.guardrails
      : [
          "Do not fabricate citations, metrics, or undocumented APIs",
          "Explicitly flag missing inputs before proceeding with edge-case assumptions",
        ];

  const lengthDirective =
    draft.advanced.length === "short"
      ? "Keep output concise and dense (under 250 words)."
      : draft.advanced.length === "detailed"
        ? "Provide exhaustive, production-ready depth with concrete edge cases."
        : "Maintain balanced depth optimized for clarity and immediate execution.";

  const answerLines = followUpAnswers
    ? Object.entries(followUpAnswers)
        .filter(([, val]) => val.trim().length > 0)
        .map(([q, val]) => `- **Clarification (${q})**: ${val.trim()}`)
    : [];

  let sections: string[] = [];

  if (draft.mode === "image") {
    sections = [
      `${draft.rawInput.trim()} — rendered with crisp physical materiality, clean foreground-to-background separation, and studio-grade detail.`,
      "",
      `Framing & Optics: ${format}. Tonal Palette & Lighting: ${tone}. Visual Focus: ${goal}.`,
      "",
      `Requirements: ${constraints.join("; ")}.`,
      `Avoid ${guardrails.join("; ")}.`,
    ];
  } else if (draft.mode === "video") {
    sections = [
      `Continuous 24fps shot capturing ${draft.rawInput.trim()} with smooth natural camera movement, grounded environmental physics, and steady lighting continuity from opening settle to closing beat.`,
      "",
      `Camera & Format: ${format}. Atmosphere & Tone: ${tone}. Director Focus: ${goal}.`,
      "",
      `Continuity: ${constraints.join("; ")}.`,
      `Avoid ${guardrails.join("; ")}.`,
    ];
  } else {
    sections = [
      `You are a ${persona.trim()}.`,
      "",
      "## Context & Objective",
      `- **Primary Objective**: ${goal}`,
      `- **Target Audience**: ${audience}`,
      `- **Core Task**: ${draft.rawInput.trim()}`,
      ...(answerLines.length > 0 ? ["", "## Clarified Context", ...answerLines] : []),
      "",
      "## Execution Constraints",
      ...constraints.map((c) => `- MUST adhere to: ${c}`),
      `- **Length & Density**: ${lengthDirective}`,
      "",
      "## Safety & Quality Guardrails",
      ...guardrails.map((g) => `- MUST NOT violate: ${g}`),
      "",
      "## Output Format & Tone",
      `- **Tone**: ${tone}`,
      `- **Required Output Structure**: ${format}`,
    ];
  }

  const compiledPrompt = sections.join("\n");
  const { detectedVariables } = analyzePromptVariables(compiledPrompt);
  const followUpQuestions = generateFollowUpQuestions(draft);

  return {
    interactionId,
    compiledPrompt,
    detectedVariables,
    followUpQuestions,
    providerId,
    modelId,
    latencyMs: 142,
    healedFromFailure: false,
    remainingDailyPrompts: 4,
    requestId: `req_${interactionId.slice(0, 10)}`,
  };
}

export function diagnoseAndRefinePrompt(input: RefinePromptInput): RefinePromptOutput {
  const raw = input.originalPrompt.trim();
  const findings: DiagnosticFinding[] = [];
  const lower = raw.toLowerCase();

  if (!lower.includes("role") && !lower.includes("you are")) {
    findings.push({
      id: "find-context",
      category: "missing_context",
      title: "Missing Role & Operational Context",
      severity: "warning",
      evidence: raw.slice(0, 90) + (raw.length > 90 ? "..." : ""),
      recommendation:
        "Anchor the model with an explicit domain persona and system boundaries before stating the task.",
      changedSection: "## Role & Operational Context",
    });
  }

  if (raw.length < 120 || (!lower.includes("objective") && !lower.includes("goal"))) {
    findings.push({
      id: "find-goal",
      category: "ambiguous_goal",
      title: "Ambiguous Success Criteria",
      severity: "critical",
      evidence: "No explicit measurable deliverable or acceptance criteria detected.",
      recommendation:
        "Define what a complete, high-signal response looks like and what failure modes to reject.",
      changedSection: "## Objective & Acceptance Criteria",
    });
  }

  if (!lower.includes("format") && !lower.includes("json") && !lower.includes("markdown")) {
    findings.push({
      id: "find-format",
      category: "weak_output_format",
      title: "Weak Output Format Specification",
      severity: "warning",
      evidence: "Output structure is left to model defaults, causing inconsistent formatting.",
      recommendation: "Specify exact section headers, schema keys, or Markdown layout constraints.",
      changedSection: "## Output Schema",
    });
  }

  if (!lower.includes("audience") && !lower.includes("reader")) {
    findings.push({
      id: "find-audience",
      category: "undefined_audience",
      title: "Undefined Target Audience",
      severity: "suggestion",
      evidence: "No calibration for reader expertise level.",
      recommendation: "Specify the target reader profile so depth and terminology stay calibrated.",
      changedSection: "## Audience Calibration",
    });
  }

  if (input.mode === "autopsy" && input.failedOutput && input.failedOutput.trim().length > 0) {
    findings.push({
      id: "find-guardrail",
      category: "unsafe_guardrail",
      title: "Failed Output Drift Detected in Autopsy",
      severity: "critical",
      evidence: `Failed output excerpt: "${input.failedOutput.trim().slice(0, 100)}"`,
      recommendation:
        "Add an explicit negative constraint preventing the observed hallucination or structural drift.",
      changedSection: "## Hard Guardrails (Autopsy Remediation)",
    });
  }

  const optimizedSections = [
    "You are a Senior Domain Specialist operating under strict verification constraints.",
    "",
    "## Task & Operational Context",
    `${raw}`,
    "",
    "## Objective & Acceptance Criteria",
    "- Deliver direct, verifiable, ready-to-use output addressing every explicit requirement above.",
    `- Maintain a ${input.targetTone || "precise, analytical"} tone and ${input.targetLength} density.`,
    "",
    "## Hard Guardrails (Autopsy Remediation)",
    "- MUST NOT invent unsupported facts, placeholder APIs, or generic filler.",
    ...(input.failedOutput?.trim()
      ? [
          `- MUST NOT repeat prior failure pattern: Avoid producing output resembling "${input.failedOutput
            .trim()
            .slice(0, 70)}..."`,
        ]
      : []),
    "",
    "## Output Schema",
    "- Return structured Markdown with explicit sections, concrete examples, and a verification summary.",
  ];

  const optimizedPrompt = optimizedSections.join("\n");
  const varAnalysis = analyzePromptVariables(optimizedPrompt);

  return {
    optimizedPrompt,
    detectedVariables: varAnalysis.detectedVariables,
    unresolvedVariables: varAnalysis.unresolvedVariables,
    duplicateVariables: varAnalysis.duplicateVariables,
    findings,
    summary:
      input.mode === "autopsy"
        ? `Diagnosed ${findings.length} structural failure vectors from prompt + failed output and synthesized remediation guardrails.`
        : `Resolved ${findings.length} structural gaps and standardized variables for deterministic execution.`,
    providerId: "anthropic",
    modelId: input.targetModelId || "claude-3-7-sonnet",
    latencyMs: 168,
    requestId: `req_autopsy_${Date.now().toString(36)}`,
  };
}

/** Synthesizes a deterministic visual or video motion prompt when no live vision model responds. */
export function synthesizeReverseEngineeredPrompt(
  input: ReverseEngineerInput,
): ReverseEngineerOutput {
  const isVideo = input.targetMode === "video";
  const focusClause = input.focusNotes?.trim()
    ? ` Additional focus: ${input.focusNotes.trim()}.`
    : "";

  const breakdown = {
    subject:
      "Primary focal subject positioned with crisp foreground separation, authentic surface textures, and natural proportions",
    styleAndMedium: isVideo
      ? "Cinematic 24fps digital film capture, anamorphic lens characteristics, subtle film grain"
      : "High-detail editorial photography / digital concept render with crisp micro-textures",
    lightingAndColor:
      "Directional volumetric key light, soft rim lighting, and balanced warm-to-cool color contrast",
    cameraAndComposition: isVideo
      ? "Smooth dolly push-in, 35mm prime lens, f/2.8 shallow depth of field, rule-of-thirds framing"
      : "50mm prime lens, f/2.8 aperture, eye-level perspective, balanced negative space",
    moodAndAtmosphere: `Immersive, high-contrast atmospheric depth.${focusClause}`,
    negativePrompt:
      "blurry, low-resolution, overexposed highlights, deformed anatomy, watermark, text overlay, compression artifacts",
  };

  const reconstructedPrompt = isVideo
    ? [
        `Continuous 24fps shot anchored on the ${breakdown.subject.toLowerCase()}, captured as ${breakdown.styleAndMedium.toLowerCase()} with ${breakdown.cameraAndComposition.toLowerCase()}.`,
        "",
        `Lighting & Atmosphere: ${breakdown.lightingAndColor}. ${breakdown.moodAndAtmosphere}`,
        "",
        `Preserve subject geometry, lighting continuity, and physical motion stability across all frames. Avoid ${breakdown.negativePrompt}.`,
      ].join("\n")
    : [
        `${breakdown.styleAndMedium} of the ${breakdown.subject.toLowerCase()}, framed with ${breakdown.cameraAndComposition.toLowerCase()}.`,
        "",
        `Lighting & Atmosphere: ${breakdown.lightingAndColor}. ${breakdown.moodAndAtmosphere}`,
        "",
        `Maintain physically coherent lighting, surface materiality, and perspective geometry. Avoid ${breakdown.negativePrompt}.`,
      ].join("\n");

  const { detectedVariables } = analyzePromptVariables(reconstructedPrompt);
  const modelId = input.targetModelId ?? (isVideo ? "veo-2-cinema" : "imagen-3-pro");

  return {
    reconstructedPrompt,
    detectedVariables,
    breakdown,
    suggestedDraft: {
      rawInput: reconstructedPrompt,
      mode: input.targetMode,
      modelId,
      goal: "Reproduce the reference image's visual style, lighting, lens optics, and composition",
      format: breakdown.cameraAndComposition,
      tone: breakdown.lightingAndColor,
      constraints: [breakdown.styleAndMedium],
      guardrails: [breakdown.negativePrompt],
      framework: "costar",
      advanced: { length: "detailed", creativity: 0.5 },
    },
    providerId: "rule-synthesizer",
    modelId,
    latencyMs: 95,
    remainingDailyRuns: null,
    requestId: `req_rev_${Date.now().toString(36)}`,
  };
}
