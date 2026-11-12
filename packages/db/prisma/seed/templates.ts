import type { PromptTemplate } from "@open-prompt-os/contracts";

/** Curated gallery templates (mirrors the web mock data in apps/web/src/lib/orpc.ts). */
export const CURATED_TEMPLATES: PromptTemplate[] = [
  {
    slug: "staff-architecture-rfc-review",
    title: "Staff Architecture RFC & Trade-off Matrix",
    useCase:
      "Stress-test system designs for failure modes, data consistency, and operational cost.",
    category: "Engineering",
    mode: "text",
    framework: "costar",
    frameworkBadge: "Inspired by COSTAR",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1", "gemini-2.5-pro"],
    preview:
      "Evaluates [System_Proposal] across latency budgets, multi-region failover, and blast radius.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: You are a Principal Distributed Systems Architect.\n\n## Context & Objective\nEvaluate [System_Proposal] targeting [Scale_Target] under [Compliance_Regime].",
    defaultDraft: {
      rawInput:
        "Review our distributed architecture proposal for [System_Proposal] handling [Scale_Target] requests per second and identify failure modes.",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      goal: "Surface single points of failure, tail-latency bottlenecks, and migration risks",
      audience: "Principal Engineers & Staff Infrastructure Reviewers",
      constraints: [
        "Quantify trade-offs in a Markdown comparison matrix",
        "Propose concrete mitigation for every high-severity risk",
      ],
      format: "Executive Verdict, Failure Mode Matrix, Step-by-Step Hardening Plan",
      persona: "Principal Distributed Systems Architect",
      tone: "Rigorous, objective, zero-fluff",
      guardrails: ["Do not recommend unverified managed services without fallback options"],
      framework: "costar",
      advanced: { length: "detailed", creativity: 0.2 },
    },
    popularityScore: 98,
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
  {
    slug: "executive-board-memo-synthesizer",
    title: "6-Page Narrative Memo & Decision Brief",
    useCase: "Transform raw product metrics and scattered notes into a crisp leadership narrative.",
    category: "Product & Strategy",
    mode: "text",
    framework: "rise",
    frameworkBadge: "Inspired by RISE",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1"],
    preview:
      "Synthesizes [Strategic_Initiative] with clear counter-arguments, unit economics, and ask.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by RISE)\nRole: Chief Product Strategist.\n\n## Objective\nDraft a high-signal decision brief for [Strategic_Initiative] addressing [Key_Metric_Goal].",
    defaultDraft: {
      rawInput:
        "Draft an executive decision memo for [Strategic_Initiative] aimed at improving [Key_Metric_Goal] in [Target_Quarter].",
      mode: "text",
      modelId: "gpt-4.1",
      goal: "Secure alignment on resource allocation with transparent trade-offs",
      audience: "Executive Leadership & Product Directors",
      constraints: ["Lead with the bottom-line recommendation in paragraph one"],
      format: "Context, Strategic Options Table, Recommended Path, Open Risks",
      persona: "Chief Product Strategist",
      tone: "Decisive, evidence-backed, concise",
      guardrails: ["Flag any metric that requires finance verification as [Verify_Metric]"],
      framework: "rise",
      advanced: { length: "balanced", creativity: 0.3 },
    },
    popularityScore: 94,
    updatedAt: "2026-11-03T12:00:00.000Z",
  },
  {
    slug: "editorial-monochrome-product-keyframe",
    title: "Industrial Monochrome Hardware Keyframe",
    useCase:
      "Generate studio-grade architectural and industrial design renders with physical optics.",
    category: "Design & Visuals",
    mode: "image",
    framework: "care",
    frameworkBadge: "Inspired by CARE",
    compatibleModels: ["imagen-3-pro", "flux-1.1-pro", "gemini-2.5-pro"],
    preview: "Brushed anodized aluminum [Product_Form] on matte basalt surface with rim lighting.",
    compiledTemplate:
      "# VISUAL GENERATION SPECIFICATION (Inspired by CARE)\nSubject: [Product_Form] crafted from [Material_Finish] under low-key rim lighting.",
    defaultDraft: {
      rawInput:
        "Macro studio photograph of [Product_Form] crafted from [Material_Finish] resting on a dark architectural monolith.",
      mode: "image",
      modelId: "imagen-3-pro",
      goal: "Create a hero keyframe with physical lens accuracy and zero visual clutter",
      audience: "Brand Design System & Launch Campaign",
      constraints: ["Strict monochrome tonal range", "85mm f/2.0 shallow depth of field"],
      format: "16:9 aspect ratio, 8K studio lighting, subtle film grain",
      persona: "Industrial Product Photographer",
      tone: "Minimalist, tactile, high contrast",
      guardrails: ["No neon colors, no floating artifacts, no deformed typography"],
      framework: "care",
      advanced: { length: "balanced", creativity: 0.4 },
    },
    popularityScore: 91,
    updatedAt: "2026-11-05T15:00:00.000Z",
  },
  {
    slug: "cinematic-orbital-product-reveal",
    title: "Continuous 24fps Orbital Tracking Shot",
    useCase:
      "Direct temporally coherent AI video prompts with explicit camera physics and lighting cues.",
    category: "Motion & Video",
    mode: "video",
    framework: "cot",
    frameworkBadge: "Inspired by Chain-of-Thought",
    compatibleModels: ["veo-2-cinema", "sora-turbo", "gemini-2.5-pro"],
    preview: "Slow dolly push-in toward [Hero_Object] as volumetric light sweeps across the frame.",
    compiledTemplate:
      "# MOTION & TEMPORAL PROMPT SPECIFICATION (Inspired by Chain-of-Thought)\nCamera: Slow 24fps dolly push-in on [Hero_Object] transitioning to [Reveal_State].",
    defaultDraft: {
      rawInput:
        "Continuous orbital camera movement around [Hero_Object] inside a minimalist gallery space as rim light reveals [Reveal_State].",
      mode: "video",
      modelId: "veo-2-cinema",
      goal: "Maintain consistent object geometry and smooth inertia across 6 seconds",
      audience: "Launch Film & Social Motion Pipeline",
      constraints: [
        "Single continuous take without jump cuts",
        "Realistic motion blur at 180-degree shutter",
      ],
      format: "24fps, 16:9 cinema scope, 6-second continuous tracking shot",
      persona: "Director of Photography",
      tone: "Atmospheric, deliberate, architectural",
      guardrails: ["Prevent morphing textures or sudden lighting flicker"],
      framework: "cot",
      advanced: { length: "balanced", creativity: 0.35 },
    },
    popularityScore: 89,
    updatedAt: "2026-11-06T09:30:00.000Z",
  },
];
