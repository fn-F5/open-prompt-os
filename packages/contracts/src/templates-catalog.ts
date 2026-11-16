import type { PromptTemplate } from "./prompts.js";

/**
 * Single source of truth for curated prompt blueprints across database seeding,
 * web fallback rendering, sitemap generation, and AEO llms-full.txt indexing.
 */
export const DEFAULT_CURATED_TEMPLATES: readonly PromptTemplate[] = [
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
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: You are a Principal Distributed Systems Architect.\n\n## Context & Objective\nEvaluate [System_Proposal] targeting [Scale_Target] under [Compliance_Regime].\n\n## Required Output\n1. Executive Verdict\n2. Failure Mode & Trade-off Comparison Matrix\n3. Step-by-Step Hardening Plan\n\n## Guardrails\n- Do not recommend unverified managed services without fallback options.",
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
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by RISE)\nRole: Chief Product Strategist.\n\n## Objective\nDraft a high-signal decision brief for [Strategic_Initiative] addressing [Key_Metric_Goal] in [Target_Quarter].\n\n## Required Output\n- Context & Bottom-Line Recommendation\n- Strategic Options Matrix\n- Recommended Path & Open Risks\n\n## Guardrails\n- Flag any metric that requires finance verification as [Verify_Metric].",
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
      "# VISUAL GENERATION SPECIFICATION (Inspired by CARE)\nSubject: [Product_Form] crafted from [Material_Finish] under low-key rim lighting.\n\n## Optics & Format\n85mm prime lens, f/2.0 shallow depth of field, 16:9 aspect ratio, subtle film grain.\n\n## Negative Guardrails\nNo neon colors, no floating artifacts, no deformed typography.",
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
      "# MOTION & TEMPORAL PROMPT SPECIFICATION (Inspired by Chain-of-Thought)\nCamera: Slow 24fps dolly push-in on [Hero_Object] transitioning to [Reveal_State].\n\n## Motion Physics\nSingle continuous 6-second orbital take, 180-degree shutter blur, consistent object geometry.\n\n## Guardrails\nPrevent morphing textures or sudden lighting flicker.",
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
  {
    slug: "sql-query-optimization-and-index-audit",
    title: "PostgreSQL Query & Index Audit Blueprint",
    useCase:
      "Diagnose slow SQL execution plans, N+1 patterns, and missing composite indexes safely.",
    category: "Data & SQL",
    mode: "text",
    framework: "cot",
    frameworkBadge: "Inspired by Chain-of-Thought",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1", "gemini-2.5-pro"],
    preview:
      "Audits [Sql_Query] against [Table_Schema] and [Target_Latency_Ms] SLA without locking writes.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by Chain-of-Thought)\nRole: Staff Database Reliability Engineer.\n\n## Objective\nAnalyze [Sql_Query] running on [Table_Schema] to hit <[Target_Latency_Ms] p95 latency.\n\n## Step-by-Step Analysis\n1. Inspect sequential scans, join cardinality, and sort spills.\n2. Recommend `CREATE INDEX CONCURRENTLY` candidates.\n3. Provide rewritten SQL with zero semantic drift.\n\n## Guardrails\n- Never suggest dropping constraints or running blocking table locks in production.",
    defaultDraft: {
      rawInput:
        "Optimize [Sql_Query] on [Table_Schema] currently taking [Current_Latency_Ms] so it runs under [Target_Latency_Ms] p95 without table locks.",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      goal: "Eliminate sequential scans and high-cost nested loops while preserving exact row semantics",
      audience: "Backend & Data Platform Engineers",
      constraints: [
        "Use CREATE INDEX CONCURRENTLY syntax for production safety",
        "Explain selectivity order for every composite index",
      ],
      format: "Bottleneck Summary, Index DDL, Rewritten SQL, Verification EXPLAIN Checklist",
      persona: "Staff Database Reliability Engineer",
      tone: "Methodical, safety-first, concrete",
      guardrails: ["Never suggest blocking ALTER/REINDEX locks on live hot tables"],
      framework: "cot",
      advanced: { length: "detailed", creativity: 0.15 },
    },
    popularityScore: 87,
    updatedAt: "2026-11-07T11:00:00.000Z",
  },
  {
    slug: "blameless-sre-incident-postmortem",
    title: "Blameless SRE Incident Postmortem & Action Plan",
    useCase: "Convert raw Slack timelines and alert logs into a structured post-incident review.",
    category: "Engineering",
    mode: "text",
    framework: "rise",
    frameworkBadge: "Inspired by RISE",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1", "gemini-2.5-pro"],
    preview:
      "Synthesizes [Incident_Timeline] and [Root_Cause] into SLO impact and owner-assigned actions.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by RISE)\nRole: Principal Site Reliability Engineer.\n\n## Objective\nCompile a blameless postmortem from [Incident_Timeline] quantifying [SLO_Impact] and [Customer_Impact].\n\n## Required Output\n- Executive Summary & Impact Window\n- Chronological Timeline (UTC)\n- Contributing Factors & Root Cause ([Root_Cause])\n- Prioritized Corrective Action Table\n\n## Guardrails\n- Attribute failures to systemic safeguards, never individual engineers.",
    defaultDraft: {
      rawInput:
        "Turn our raw timeline [Incident_Timeline] and contributing factor [Root_Cause] into a blameless postmortem covering [SLO_Impact].",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      goal: "Produce an audit-ready postmortem with measurable preventative controls",
      audience: "Engineering Leadership, SREs, and Enterprise Customers",
      constraints: [
        "Keep every action item bound to a concrete owner role and target SLO",
        "Separate detection time, mitigation time, and full recovery time",
      ],
      format: "Impact Header, UTC Timeline, Root-Cause Analysis, Corrective Action Matrix",
      persona: "Principal Site Reliability Engineer",
      tone: "Blameless, factual, transparent",
      guardrails: ["Never name individuals or speculate about unlogged events"],
      framework: "rise",
      advanced: { length: "detailed", creativity: 0.2 },
    },
    popularityScore: 86,
    updatedAt: "2026-11-08T14:20:00.000Z",
  },
  {
    slug: "technical-product-launch-aeo-brief",
    title: "Technical Launch Page & AEO Answer Brief",
    useCase:
      "Write developer-grade launch copy structured for both human conversion and AI citation.",
    category: "Marketing & Content",
    mode: "text",
    framework: "costar",
    frameworkBadge: "Inspired by COSTAR",
    compatibleModels: ["gpt-4.1", "claude-3-7-sonnet", "gemini-2.5-pro"],
    preview:
      "Positions [Product_Name] for [Target_Persona] with a 50-word canonical definition and FAQ.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: Principal Developer Product Marketer.\n\n## Context & Objective\nWrite an Answer-Engine-Optimized launch brief for [Product_Name] targeting [Target_Persona] solving [Core_Pain_Point].\n\n## Required Output\n1. 50-word Canonical Definition\n2. Before vs. After Comparison Table\n3. Technical Proof Points\n4. 4 High-Intent FAQs\n\n## Guardrails\n- Zero unsubstantiated superlatives or invented benchmark numbers.",
    defaultDraft: {
      rawInput:
        "Create a developer launch page and AEO answer brief for [Product_Name] aimed at [Target_Persona] solving [Core_Pain_Point].",
      mode: "text",
      modelId: "gpt-4.1",
      goal: "Maximize product clarity and AI answer engine citability without marketing fluff",
      audience: "Technical Founders, Staff Engineers, and Product Evaluators",
      constraints: [
        "Open with a self-contained 45-60 word definition paragraph",
        "Include a factual comparison table against status-quo workflows",
      ],
      format: "Canonical Definition, Comparison Table, Core Capabilities, 4-Question FAQ",
      persona: "Principal Developer Product Marketer",
      tone: "Crisp, technical, verifiable",
      guardrails: ["Do not invent customer logos, percentages, or benchmark claims"],
      framework: "costar",
      advanced: { length: "balanced", creativity: 0.35 },
    },
    popularityScore: 85,
    updatedAt: "2026-11-09T09:00:00.000Z",
  },
  {
    slug: "strict-json-schema-extractor",
    title: "Zero-Hallucination JSON Extraction Compiler",
    useCase:
      "Extract structured records from messy support tickets, invoices, or logs into strict JSON.",
    category: "Engineering",
    mode: "text",
    framework: "care",
    frameworkBadge: "Inspired by CARE",
    compatibleModels: ["gpt-4.1", "claude-3-7-sonnet", "gemini-2.5-pro"],
    preview: "Extracts [Target_Fields] from [Raw_Document] with explicit null-on-missing rules.",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by CARE)\nRole: Deterministic Data Extraction Engine.\n\n## Objective\nParse [Raw_Document] and output strict RFC-8259 JSON matching [Target_Schema].\n\n## Rules\n- Set any unverified field to `null` rather than guessing.\n- Output raw JSON only with zero Markdown prose wrappers.\n\n## Guardrails\n- Never infer dates, currencies, or IDs absent from the source text.",
    defaultDraft: {
      rawInput:
        "Extract [Target_Fields] from [Raw_Document] into strict JSON conforming to [Target_Schema], using null when evidence is missing.",
      mode: "text",
      modelId: "gpt-4.1",
      goal: "Achieve deterministic schema conformance and zero fabricated fields",
      audience: "Automated Backend Ingestion Pipelines",
      constraints: [
        "Return valid JSON only—no preamble or trailing commentary",
        "Use null for missing or ambiguous attributes",
      ],
      format: "Single JSON object matching [Target_Schema]",
      persona: "Deterministic Data Extraction Engine",
      tone: "Literal, strict, schema-bound",
      guardrails: ["Never fabricate missing identifiers, dates, or numerical values"],
      framework: "care",
      advanced: { length: "short", creativity: 0.05 },
    },
    popularityScore: 84,
    updatedAt: "2026-11-10T10:30:00.000Z",
  },
  {
    slug: "enterprise-customer-escalation-reply",
    title: "High-Empathy Technical Escalation Response",
    useCase:
      "Draft transparent, ownership-driven replies to frustrated enterprise customers during bugs.",
    category: "Support & Ops",
    mode: "text",
    framework: "costar",
    frameworkBadge: "Inspired by COSTAR",
    compatibleModels: ["claude-3-7-sonnet", "gpt-4.1"],
    preview:
      "Addresses [Customer_Issue] with verified [Workaround_Steps] and exact [Next_Update_Time].",
    compiledTemplate:
      "# OPERATIONAL PROMPT SPECIFICATION (Inspired by COSTAR)\nRole: Head of Technical Support Engineering.\n\n## Objective\nReply to [Customer_Account] regarding [Customer_Issue] without defensive phrasing.\n\n## Structure\n1. Direct acknowledgment of operational impact\n2. Verified root cause / current status\n3. Actionable [Workaround_Steps]\n4. Explicit [Next_Update_Time] commitment\n\n## Guardrails\n- Never promise an unconfirmed ship ETA.",
    defaultDraft: {
      rawInput:
        "Write an escalation response to [Customer_Account] regarding [Customer_Issue], including [Workaround_Steps] and [Next_Update_Time].",
      mode: "text",
      modelId: "claude-3-7-sonnet",
      goal: "De-escalate tension with concrete technical clarity and accountability",
      audience: "Enterprise Engineering & Procurement Stakeholders",
      constraints: [
        "Keep under 220 words",
        "State exact next update timestamp rather than vague 'soon'",
      ],
      format: "Acknowledgment, Technical Status, Workaround Bullet List, Commitment Line",
      persona: "Head of Technical Support Engineering",
      tone: "Calm, accountable, technically precise",
      guardrails: ["Do not blame third-party vendors or promise unverified fix ETAs"],
      framework: "costar",
      advanced: { length: "short", creativity: 0.25 },
    },
    popularityScore: 82,
    updatedAt: "2026-11-11T08:15:00.000Z",
  },
  {
    slug: "editorial-founder-portrait-studio",
    title: "Editorial Magazine Environmental Portrait",
    useCase:
      "Direct natural-light editorial portraits with realistic skin texture and 50mm optics.",
    category: "Design & Visuals",
    mode: "image",
    framework: "care",
    frameworkBadge: "Inspired by CARE",
    compatibleModels: ["flux-1.1-pro", "imagen-3-pro", "midjourney-v6"],
    preview: "50mm f/1.8 natural window portrait of [Subject_Role] inside [Architectural_Setting].",
    compiledTemplate:
      "# VISUAL GENERATION SPECIFICATION (Inspired by CARE)\nSubject: Candid editorial portrait of [Subject_Role] in [Architectural_Setting].\n\n## Optics & Lighting\n50mm f/1.8 prime lens, soft directional north-window key light, subtle Kodak Portra 400 grain, authentic skin texture.\n\n## Negative Guardrails\nNo plastic airbrushed skin, no HDR halo, no extra fingers or distorted eyewear.",
    defaultDraft: {
      rawInput:
        "Editorial magazine portrait of [Subject_Role] standing in [Architectural_Setting] lit by soft north-facing window light.",
      mode: "image",
      modelId: "flux-1.1-pro",
      goal: "Produce an authentic documentary-style portrait free of synthetic AI sheen",
      audience: "Editorial Feature & Company About Page",
      constraints: [
        "50mm prime lens at f/1.8 with natural falloff",
        "Preserve realistic fabric weave and natural skin texture",
      ],
      format: "4:5 vertical editorial frame, muted neutral color grading",
      persona: "Documentary Editorial Photographer",
      tone: "Warm, grounded, candid",
      guardrails: ["No plastic skin smoothing, no oversaturated HDR, no distorted hands"],
      framework: "care",
      advanced: { length: "balanced", creativity: 0.45 },
    },
    popularityScore: 80,
    updatedAt: "2026-11-12T13:45:00.000Z",
  },
  {
    slug: "isometric-saas-architecture-diagram-art",
    title: "Clean Isometric SaaS Infrastructure Keyframe",
    useCase:
      "Generate crisp technical hero illustrations with consistent lighting and minimal clutter.",
    category: "Design & Visuals",
    mode: "image",
    framework: "rise",
    frameworkBadge: "Inspired by RISE",
    compatibleModels: ["imagen-3-pro", "flux-1.1-pro", "gpt-image-1"],
    preview:
      "Minimalist dark-mode isometric glass modules representing [System_Concept] with cyan rim light.",
    compiledTemplate:
      "# VISUAL GENERATION SPECIFICATION (Inspired by RISE)\nSubject: Architectural isometric glass sculpture illustrating [System_Concept] on obsidian #0F0F11 background.\n\n## Surface & Color\nFrosted smoked glass planes, hairline cyan and indigo edge illumination, crisp orthographic geometry.\n\n## Negative Guardrails\nNo random garbled text labels, no cluttered icons, no cartoonish gradients.",
    defaultDraft: {
      rawInput:
        "Minimalist dark-mode isometric frosted glass modules depicting [System_Concept] with hairline cyan edge light on deep obsidian.",
      mode: "image",
      modelId: "imagen-3-pro",
      goal: "Deliver a clean dark-theme technical illustration suitable for developer docs heroes",
      audience: "Developer Product Landing & Architecture Docs",
      constraints: [
        "Zero embedded text or fake UI words",
        "Strict obsidian dark background (#0F0F11) with subtle cyan/indigo highlights",
      ],
      format: "16:9 widescreen hero composition, orthographic isometric projection",
      persona: "Technical Brand Art Director",
      tone: "Precision, architectural, restrained",
      guardrails: ["No garbled text, no busy background noise, no neon rainbow bloom"],
      framework: "rise",
      advanced: { length: "balanced", creativity: 0.35 },
    },
    popularityScore: 79,
    updatedAt: "2026-11-13T16:10:00.000Z",
  },
  {
    slug: "architectural-dolly-interior-walkthrough",
    title: "24fps Architectural Light-Shift Walkthrough",
    useCase:
      "Direct smooth interior camera glides with evolving sunlight and physically stable walls.",
    category: "Motion & Video",
    mode: "video",
    framework: "cot",
    frameworkBadge: "Inspired by Chain-of-Thought",
    compatibleModels: ["veo-2-cinema", "sora-turbo", "runway-gen-4"],
    preview:
      "Smooth 8-second Steadicam glide through [Interior_Space] as golden-hour shadows sweep across concrete.",
    compiledTemplate:
      "# MOTION & TEMPORAL PROMPT SPECIFICATION (Inspired by Chain-of-Thought)\nCamera: Smooth 24fps forward Steadicam glide through [Interior_Space] toward [Focal_Feature].\n\n## Temporal Arc\nSeconds 0–3: Cool ambient shadow entry; Seconds 3–8: Warm golden-hour sunbeam sweeps across [Material_Surface].\n\n## Guardrails\nMaintain straight vertical wall lines, zero lens warping, zero flickering shadows.",
    defaultDraft: {
      rawInput:
        "Smooth 8-second forward Steadicam glide through [Interior_Space] toward [Focal_Feature] as golden sunlight sweeps across [Material_Surface].",
      mode: "video",
      modelId: "veo-2-cinema",
      goal: "Achieve architecturally stable lines and natural light progression across 8 seconds",
      audience: "Architectural Visualization & Spatial Brand Film",
      constraints: [
        "24fps with steady gimbal stabilization",
        "Keep vertical architectural columns strictly parallel",
      ],
      format: "24fps, 16:9 widescreen, 8-second continuous forward glide",
      persona: "Architectural Cinematographer",
      tone: "Serene, tactile, luminous",
      guardrails: ["No melting wall edges, no sudden exposure jumps, no jittery camera shake"],
      framework: "cot",
      advanced: { length: "balanced", creativity: 0.3 },
    },
    popularityScore: 78,
    updatedAt: "2026-11-14T10:00:00.000Z",
  },
];
