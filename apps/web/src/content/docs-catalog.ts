import type { ComposerDraft, ComposerMode, PromptFramework } from "@open-prompt-os/contracts";

export interface DocTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface DocSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly codeBlock?: string;
  readonly table?: DocTable;
}

export interface DocFaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface DocArticle {
  readonly slug: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly category:
    | "Core Concepts"
    | "Prompt Frameworks"
    | "Debugging & Autopsy"
    | "Image & Video Studio"
    | "Privacy & Security";
  readonly description: string;
  readonly tldrAnswer: string;
  readonly readingTimeMinutes: number;
  readonly updatedAt: string;
  readonly keywords: readonly string[];
  readonly sections: readonly DocSection[];
  readonly faqs: readonly DocFaqItem[];
  readonly relatedTemplateSlugs: readonly string[];
  readonly composerAction?: {
    readonly label: string;
    readonly mode: ComposerMode;
    readonly framework?: PromptFramework;
    readonly draft: Partial<ComposerDraft>;
  };
}

export const HOME_AEO_FAQS: readonly DocFaqItem[] = [
  {
    question: "What is Open Prompt OS and how is it different from a basic prompt generator?",
    answer:
      "Open Prompt OS is a full-lifecycle prompt engineering workbench rather than a one-shot generator. It combines a guided multi-modal Prompt Compiler (Text, Image, Video), a root-cause Prompt Autopsy debugger across 8 failure categories, an image-to-prompt Reverse Engineer tool, a reusable [Variable] library, and one-click dispatch to ChatGPT, Claude, and Gemini.",
  },
  {
    question: "Which prompt framework should I choose: CO-STAR, RISE, CARE, or Chain-of-Thought?",
    answer:
      "Use CO-STAR for technical specs and audience-calibrated writing, RISE for step-by-step executive memos and operational workflows, CARE when visual constraints or strict examples drive output accuracy, and Chain-of-Thought for multi-step reasoning, SQL tuning, or continuous 24fps video sequences.",
  },
  {
    question: "What is Prompt Autopsy and how does it stop AI hallucinations?",
    answer:
      "Prompt Autopsy on /improve compares your original prompt against an actual failed or hallucinated AI response. It classifies defects across 8 categories—such as missing_context, conflicting_constraints, weak_output_format, and unsafe_guardrail—and produces a repaired prompt with explicit boundaries and reusable [Variables].",
  },
  {
    question: "Does Open Prompt OS train AI models on my prompts or uploaded images?",
    answer:
      "No. Open Prompt OS operates under a strict Privacy by Default guarantee: your prompt drafts, failed outputs, reference images, and compiled outputs are never used to train or fine-tune any AI model. Analytics strip all prompt text and secrets, and saved workspace data is isolated by PostgreSQL Row-Level Security.",
  },
  {
    question: "Can I use Open Prompt OS for free without creating an account?",
    answer:
      "Yes. Visitors can immediately compose, optimize, diagnose, and reverse-engineer prompts on the site with zero sign-up required under daily anonymous limits. Browser storage keeps your latest work locally for 30 days and migrates it seamlessly if you sign in later.",
  },
];

export const DOCS_CATALOG: readonly DocArticle[] = [
  {
    slug: "getting-started",
    title: "Getting Started with Open Prompt OS",
    shortTitle: "60-Second Quickstart",
    category: "Core Concepts",
    description:
      "Learn how to compile structured, model-calibrated prompts for ChatGPT, Claude, Gemini, Imagen, FLUX, and Veo in 60 seconds with zero sign-up.",
    tldrAnswer:
      "Open Prompt OS turns rough one-line ideas into structured, model-calibrated prompt specifications across Text, Image, and Video modes. Enter your intent in the Composer, tap visual parameter cards (Goal, Audience, Constraints, Format, Guardrails), pick a target AI model, and dispatch directly to ChatGPT, Claude, or Gemini in one click.",
    readingTimeMinutes: 3,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "open prompt os",
      "prompt engineering workbench",
      "ai prompt compiler",
      "chatgpt prompt builder",
      "claude prompt optimizer",
    ],
    sections: [
      {
        id: "quickstart-workflow",
        heading: "The 5-Step Compilation Workflow",
        paragraphs: [
          "Most one-line prompts fail because the model has to guess your reader, output schema, and edge-case boundaries. Open Prompt OS removes that guesswork before the request ever reaches the model.",
        ],
        bullets: [
          "1. Select your studio mode: Text / Work (code, RFCs, memos), Image (optics, lighting, materials), or Video (24fps camera motion).",
          "2. Write a plain-language draft and optionally parameterize changing parts using [Square_Bracket_Variables].",
          "3. Apply guided parameters (Goal, Audience, Constraints, Format, Persona, Tone, Guardrails) and a proven framework.",
          "4. Pick your target model provider so prompt structure matches ChatGPT, Claude, Gemini, FLUX, or Veo conventions.",
          "5. Click Compile structured prompt, then send directly via One-Click Send or copy to clipboard.",
        ],
      },
      {
        id: "platform-surfaces",
        heading: "Platform Surfaces & Routes",
        paragraphs: [
          "Every stage of the prompt lifecycle lives on a dedicated, keyboard-accessible surface:",
        ],
        table: {
          headers: ["Surface", "Route", "Primary Purpose"],
          rows: [
            ["Prompt Compiler", "/", "Build structured prompts from scratch with live streaming"],
            [
              "Improve & Prompt Autopsy",
              "/improve",
              "Optimize drafts or diagnose failed outputs across 8 root causes",
            ],
            [
              "Reverse Engineer",
              "/reverse-engineer",
              "Extract a 6-axis visual prompt from any PNG, JPEG, or WebP image",
            ],
            [
              "Template Gallery",
              "/templates",
              "Browse curated blueprints and load them into the Composer in one click",
            ],
            [
              "Library & History",
              "/library, /history",
              "Search, tag, and publish shareable prompt links (/share/:shareId)",
            ],
          ],
        },
      },
    ],
    faqs: [
      {
        question: "Do I need an account before compiling prompts?",
        answer:
          "No. Instant Free Use lets you compile, improve, and reverse-engineer prompts right away with daily guest limits. Creating a free account unlocks persistent History, My Library, and public share links.",
      },
      {
        question: "How does One-Click Send dispatch prompts to ChatGPT, Claude, and Gemini?",
        answer:
          "When your compiled specification fits safely inside URL length limits, One-Click Send opens the target AI chat pre-filled with your prompt. For longer specifications, it automatically copies the prompt to your clipboard so nothing is truncated.",
      },
    ],
    relatedTemplateSlugs: ["staff-architecture-rfc-review", "technical-product-launch-aeo-brief"],
    composerAction: {
      label: "Try Quickstart Draft in Composer",
      mode: "text",
      framework: "costar",
      draft: {
        rawInput:
          "Write an onboarding checklist and rollout email for [Product_Name] launching to [Target_Audience].",
        goal: "Maximize adoption clarity with zero marketing fluff",
        audience: "Engineering & Product Leads",
        format: "3-Step Quickstart + Launch Email Draft",
        framework: "costar",
      },
    },
  },
  {
    slug: "prompt-frameworks-costar-rise-care-cot",
    title: "Prompt Frameworks Compared: CO-STAR, RISE, CARE & Chain-of-Thought",
    shortTitle: "CO-STAR vs RISE vs CARE vs CoT",
    category: "Prompt Frameworks",
    description:
      "Compare CO-STAR, RISE, CARE, and Chain-of-Thought prompt engineering frameworks with a decision matrix and ready-to-run specifications.",
    tldrAnswer:
      "CO-STAR (Context, Objective, Style, Tone, Audience, Response) is best for audience-calibrated writing and technical specs; RISE (Role, Input, Steps, Expectation) excels at deterministic workflows and executive memos; CARE (Context, Action, Result, Example) anchors strict schemas and studio visuals; Chain-of-Thought (CoT) enforces sequential reasoning for complex debugging and 24fps video trajectories.",
    readingTimeMinutes: 5,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "CO-STAR prompt framework",
      "RISE prompt engineering",
      "CARE framework AI",
      "Chain-of-Thought prompting",
      "prompt framework comparison",
    ],
    sections: [
      {
        id: "comparison-matrix",
        heading: "Framework Decision Matrix",
        paragraphs: [
          "Selecting the right structural scaffold eliminates 80% of iterative prompt tweaking. Use the matrix below to match your task to the best framework in Open Prompt OS:",
        ],
        table: {
          headers: ["Framework", "Components", "Best For", "Avoid When"],
          rows: [
            [
              "CO-STAR",
              "Context, Objective, Style, Tone, Audience, Response",
              "RFCs, product copy, technical docs, stakeholder emails",
              "Purely deterministic JSON extraction with no prose",
            ],
            [
              "RISE",
              "Role, Input, Steps, Expectation",
              "Executive briefs, SRE postmortems, multi-step checklists",
              "Open-ended creative brainstorming",
            ],
            [
              "CARE",
              "Context, Action, Result, Example",
              "Product photography, strict JSON parsing, rubric grading",
              "Tasks where few-shot examples bias creative variety",
            ],
            [
              "Chain-of-Thought",
              "Ordered reasoning steps & state transitions",
              "SQL optimization, architecture trade-offs, 24fps video arcs",
              "Ultra-short 1-sentence classifications",
            ],
          ],
        },
      },
      {
        id: "example-costar",
        heading: "Example: CO-STAR Specification Pattern",
        paragraphs: [
          "Notice how combining a concrete Role, Audience, Format, and anti-hallucination Guardrail produces predictable first-try output across Claude, GPT, and Gemini:",
        ],
        codeBlock: `# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)
Role: Principal Distributed Systems Architect
Audience: Staff Infrastructure Reviewers
Objective: Evaluate [System_Proposal] at [Scale_Target] under [Compliance_Regime]
Format: Executive Verdict, Failure Mode Matrix, Hardening Plan
Guardrail: Do not recommend unverified managed services without fallback options.`,
      },
    ],
    faqs: [
      {
        question: "Which prompt framework works best for ChatGPT vs. Claude?",
        answer:
          "Both ChatGPT (GPT-4.1+) and Claude (Claude 3.7 Sonnet+) respond strongly to CO-STAR and RISE because both models separate role, context, formatting schema, and negative guardrails cleanly.",
      },
      {
        question: "Can I switch frameworks without rewriting my prompt draft?",
        answer:
          "Yes. In the Open Prompt OS Composer, changing the framework toggle preserves your raw input, variables, constraints, and guardrails while recompiling the structural wrapper.",
      },
    ],
    relatedTemplateSlugs: [
      "staff-architecture-rfc-review",
      "executive-board-memo-synthesizer",
      "strict-json-schema-extractor",
    ],
    composerAction: {
      label: "Load CO-STAR Architecture Template",
      mode: "text",
      framework: "costar",
      draft: {
        rawInput:
          "Evaluate [System_Proposal] handling [Scale_Target] requests/sec and produce a failure mode trade-off matrix.",
        persona: "Principal Distributed Systems Architect",
        audience: "Staff Infrastructure Reviewers",
        format: "Executive Verdict, Trade-off Matrix, Hardening Steps",
        framework: "costar",
      },
    },
  },
  {
    slug: "prompt-autopsy-and-debugging",
    title: "Prompt Autopsy: Diagnosing & Fixing Failed AI Outputs",
    shortTitle: "Prompt Autopsy Guide",
    category: "Debugging & Autopsy",
    description:
      "Learn how Prompt Autopsy diagnoses hallucinated, off-tone, or malformed AI responses across 8 root-cause categories and generates a repaired prompt.",
    tldrAnswer:
      "Prompt Autopsy on /improve compares your original prompt against the failed or hallucinated AI response to pinpoint why the model drifted. It classifies defects across 8 diagnostic categories (missing_context, ambiguous_goal, conflicting_constraints, undefined_audience, weak_output_format, missing_examples, unsafe_guardrail, model_mismatch) and emits a corrected prompt.",
    readingTimeMinutes: 4,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "prompt autopsy",
      "debug ai prompts",
      "fix chatgpt hallucinations",
      "prompt optimizer",
      "diagnose failed prompt",
    ],
    sections: [
      {
        id: "improve-vs-autopsy",
        heading: "Standard Improve vs. Prompt Autopsy",
        paragraphs: [
          "Standard Improve refines a prompt draft on its own for clarity and target density (Short, Balanced, Detailed). Prompt Autopsy goes further by inspecting the actual broken output alongside your prompt.",
        ],
        table: {
          headers: ["Diagnostic Category", "Symptom in Model Output", "Automated Remediation"],
          rows: [
            [
              "missing_context",
              "Generic advice ignoring your stack or domain",
              "Adds explicit environment & system [Variables]",
            ],
            [
              "ambiguous_goal",
              "Rambling answer covering irrelevant angles",
              "Narrows primary deliverable into one testable objective",
            ],
            [
              "conflicting_constraints",
              "Model silently drops half your rules",
              "Resolves contradictory length/depth instructions",
            ],
            [
              "undefined_audience",
              "Too basic for experts or too dense for execs",
              "Injects explicit reader persona and depth calibration",
            ],
            [
              "weak_output_format",
              "Prose wall instead of JSON or Markdown table",
              "Specifies exact section headers or JSON keys",
            ],
            [
              "missing_examples",
              "Inconsistent tone or edge-case classification",
              "Recommends canonical anchor examples",
            ],
            [
              "unsafe_guardrail",
              "Invented APIs, fake metrics, or assumptions",
              "Appends strict anti-hallucination boundaries",
            ],
            [
              "model_mismatch",
              "Syntax tuned for a different modality or model",
              "Realigns phrasing for target text/image/video model",
            ],
          ],
        },
      },
    ],
    faqs: [
      {
        question: "Why do I need to paste the failed output for Prompt Autopsy?",
        answer:
          "Seeing the actual hallucination or formatting failure reveals which constraint the model ignored or misinterpreted, allowing Autopsy to target the exact broken section instead of guessing.",
      },
    ],
    relatedTemplateSlugs: ["strict-json-schema-extractor", "blameless-sre-incident-postmortem"],
    composerAction: {
      label: "Open Improve & Autopsy Tool",
      mode: "text",
      framework: "care",
      draft: {
        rawInput:
          "Summarize [Support_Thread] into valid JSON with keys summary, severity, and action_owner. Use null if missing.",
        guardrails: ["Never invent action owners or severity levels absent from source text"],
        framework: "care",
      },
    },
  },
  {
    slug: "image-and-video-prompt-engineering",
    title: "Studio Image & 24fps Cinema Video Prompt Engineering",
    shortTitle: "Image & Video Studio Guide",
    category: "Image & Video Studio",
    description:
      "Write physically grounded prompts for Imagen, FLUX, Midjourney, Veo, Sora, and Runway using lens optics, volumetric lighting, and 24fps camera motion.",
    tldrAnswer:
      "High-performing image and video prompts replace vague quality buzzwords ('8k masterpiece') with physical camera optics (focal length, aperture, shutter angle), lighting geometry (volumetric key, rim light), surface materials, temporal scene arcs, and explicit negative guardrails.",
    readingTimeMinutes: 4,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "ai image prompt engineering",
      "veo 2 video prompt",
      "sora camera prompt",
      "flux pro prompt guide",
      "imagen 3 optics",
    ],
    sections: [
      {
        id: "optics-and-motion",
        heading: "Replacing Adjectives with Camera Physics",
        paragraphs: [
          "Visual and video models are trained on cinematography and photography metadata. Specifying exact focal lengths, aperture falloff, lighting direction, and continuous camera motion gives dramatically higher consistency.",
        ],
        table: {
          headers: ["Dimension", "Weak Prompt", "Open Prompt OS Specification"],
          rows: [
            [
              "Optics",
              "High quality close-up photo",
              "85mm prime lens, f/2.0 shallow depth of field, 16:9",
            ],
            [
              "Lighting",
              "Nice studio lights",
              "Soft volumetric key light with crisp silver rim highlight on matte basalt",
            ],
            [
              "Video Motion",
              "Cool camera movement around product",
              "24fps, 6-second continuous orbital tracking shot, 180° shutter blur",
            ],
            [
              "Guardrails",
              "Make it look real",
              "No neon cast, no distorted text, no morphing textures or lighting flicker",
            ],
          ],
        },
      },
    ],
    faqs: [
      {
        question: "How do I prevent flickering or morphing in AI video prompts?",
        answer:
          "Use Open Prompt OS Video mode to lock frame rate (24fps), specify a single continuous camera trajectory rather than multiple cuts, define [Opening_Frame] and [Reveal_State], and include temporal stability guardrails.",
      },
    ],
    relatedTemplateSlugs: [
      "editorial-monochrome-product-keyframe",
      "cinematic-orbital-product-reveal",
      "architectural-dolly-interior-walkthrough",
    ],
    composerAction: {
      label: "Load Image Studio Keyframe in Composer",
      mode: "image",
      framework: "care",
      draft: {
        rawInput:
          "Macro studio photograph of [Product_Form] crafted from [Material_Finish] on matte basalt, 85mm f/2.0, volumetric rim light.",
        constraints: ["85mm f/2.0 shallow depth of field", "Strict monochrome tonal range"],
        guardrails: ["No neon cast, no floating artifacts, no deformed typography"],
        framework: "care",
      },
    },
  },
  {
    slug: "reverse-engineering-prompts",
    title: "Reverse Engineering Reference Images into Prompt Blueprints",
    shortTitle: "Reverse Engineer Guide",
    category: "Image & Video Studio",
    description:
      "Turn any PNG, JPEG, or WebP reference image into a 6-axis visual breakdown and parameterized prompt draft for Imagen, FLUX, Veo, or Sora.",
    tldrAnswer:
      "Upload any PNG, JPEG, or WebP image (up to 4 MB) at /reverse-engineer to extract a structured 6-axis breakdown—Subject, Style & Medium, Lighting & Color, Camera & Composition, Mood & Atmosphere, and Negative Guardrails—alongside a parameterized prompt ready to swap with your own [Variables].",
    readingTimeMinutes: 3,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "image to prompt",
      "reverse engineer ai image",
      "extract prompt from photo",
      "visual anatomy prompt",
    ],
    sections: [
      {
        id: "six-axis-anatomy",
        heading: "The 6-Axis Visual Anatomy",
        paragraphs: [
          "Rather than outputting a flat caption, Reverse Engineer decomposes your reference image into six controllable axes so you can keep the lighting and lens while swapping the subject:",
        ],
        bullets: [
          "Subject — Core object, material finish, and foreground placement",
          "Style & Medium — Photography stock, editorial look, or architectural render",
          "Lighting & Color — Key/fill/rim ratios and color temperature",
          "Camera & Composition — Framing, focal length, depth of field, aspect ratio",
          "Mood & Atmosphere — Tonal feel, haze, grain, and surface texture",
          "Negative Guardrails — Artifacts to suppress in downstream image/video generation",
        ],
      },
    ],
    faqs: [
      {
        question: "Can Reverse Engineer output a video motion prompt from a still image?",
        answer:
          "Yes. Toggle the target modality to 'Video Motion Prompt' on /reverse-engineer before running analysis to extrapolate camera motion and temporal beats from your reference keyframe.",
      },
    ],
    relatedTemplateSlugs: [
      "editorial-founder-portrait-studio",
      "isometric-saas-architecture-diagram-art",
    ],
  },
  {
    slug: "variables-and-reusable-templates",
    title: "Reusable [Variables], Libraries & Public Share Links",
    shortTitle: "Variables & Templates",
    category: "Core Concepts",
    description:
      "Parameterize prompts with [Square_Bracket_Variables], catch unresolved placeholders automatically, and share specs via /share/:shareId.",
    tldrAnswer:
      "Wrap changing inputs in [Square_Brackets] (such as [System_Proposal] or [Target_Audience]) to turn one-off prompts into reusable templates. Open Prompt OS automatically parses variable inventories, warns on duplicates or [TODO]/[TBD] placeholders, and lets you share read-only prompt links that teammates can fork in one click.",
    readingTimeMinutes: 3,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "reusable prompt variables",
      "prompt template library",
      "share ai prompts",
      "parameterized prompts",
    ],
    sections: [
      {
        id: "variable-linting",
        heading: "Automatic Variable Detection & Linting",
        paragraphs: [
          "Every editor surface runs live variable analysis powered by @open-prompt-os/core:",
        ],
        bullets: [
          "Detected Variables: Extracted automatically from [Variable_Name] tokens for quick inspection.",
          "Duplicate Variable Tracking: Highlights tokens referenced multiple times across sections.",
          "Unresolved Placeholder Warnings: Flags forgotten [TODO], [TBD], or [INSERT] tokens before you send.",
        ],
      },
    ],
    faqs: [
      {
        question: "What happens when someone opens my /share/:shareId link?",
        answer:
          "Recipients see the clean compiled specification, target model badge, one-click Copy, Open in ChatGPT, and Fork in Composer so they can customize your blueprint without modifying your saved original.",
      },
    ],
    relatedTemplateSlugs: [
      "sql-query-optimization-and-index-audit",
      "enterprise-customer-escalation-reply",
    ],
  },
  {
    slug: "privacy-and-security",
    title: "Privacy by Default, Zero Training & Workspace Isolation",
    shortTitle: "Privacy & Security",
    category: "Privacy & Security",
    description:
      "How Open Prompt OS protects prompt IP with a strict zero-training policy, redacted telemetry, and tenant-isolated PostgreSQL Row-Level Security.",
    tldrAnswer:
      "Open Prompt OS never trains or fine-tunes any AI model on your prompts, failed outputs, or uploaded images. Product telemetry redacts all prompt text, emails, and API keys, and saved workspace prompts are isolated at the database layer using PostgreSQL Row-Level Security (RLS).",
    readingTimeMinutes: 3,
    updatedAt: "2026-11-15T10:00:00.000Z",
    keywords: [
      "ai prompt privacy",
      "zero model training",
      "row level security prompts",
      "enterprise prompt security",
    ],
    sections: [
      {
        id: "privacy-architecture",
        heading: "Three-Layer IP Protection",
        paragraphs: [
          "Prompts often contain product roadmaps, proprietary SQL schemas, and unreleased brand messaging. Privacy is enforced architecturally, not just in policy copy:",
        ],
        table: {
          headers: ["Layer", "Control", "Verification"],
          rows: [
            [
              "Model Execution",
              "Zero model training on user drafts, images, or outputs",
              "No training opt-in or dataset harvesting pipelines",
            ],
            [
              "Telemetry & Logs",
              "Redacts rawInput, compiledPrompt, emails, and tokens",
              "Structural metrics only (mode, latency, provider)",
            ],
            [
              "Database Tenancy",
              "PostgreSQL Row-Level Security bound to app.space_id",
              "Isolated per-workspace transactions via runAsTenant",
            ],
          ],
        },
      },
    ],
    faqs: [
      {
        question: "Where are my prompts stored when I am not signed in?",
        answer:
          "Anonymous drafts and last compiled outputs are stored strictly in your own browser localStorage for up to 30 days and are cleared/migrated once if you choose to sign in.",
      },
    ],
    relatedTemplateSlugs: ["blameless-sre-incident-postmortem"],
  },
];

export function findDocBySlug(slug: string): DocArticle | undefined {
  return DOCS_CATALOG.find((doc) => doc.slug === slug);
}
