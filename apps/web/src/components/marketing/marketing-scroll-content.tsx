import type { ComposerMode } from "@open-prompt-os/contracts";
import { Badge, Button } from "@open-prompt-os/ui-web";
import {
  ArrowRight,
  Check,
  Compass,
  Cpu,
  EyeOff,
  FileText,
  Film,
  Image,
  Layers,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { trackEvent } from "../../lib/telemetry.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";
import { composerActions } from "../../state/composer-store.js";

function ObservedSection({
  sectionId,
  children,
  className = "",
}: {
  readonly sectionId: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const viewedRef = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !viewedRef.current) {
            viewedRef.current = true;
            trackEvent("marketing_section_viewed", { sectionId });
          }
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [sectionId]);

  return (
    <section ref={ref} data-section-id={sectionId} className={className}>
      {children}
    </section>
  );
}

const AFTER_HIGHLIGHTS = [
  {
    step: "1",
    label: "Role & Expertise",
    value: "You are a Principal Developer Advocate & Systems Architect.",
  },
  {
    step: "2",
    label: "Clear Audience & Goal",
    value: "Write a rollout guide for senior backend engineers adopting our API.",
  },
  {
    step: "3",
    label: "Reusable Variables",
    value: "Launch [API_Product_Name] highlighting [Latency_Target] and [Migration_Deadline].",
  },
  {
    step: "4",
    label: "Guardrail & Output Format",
    value: "Return a 3-step quickstart + breaking-change table. Do not invent endpoints.",
  },
] as const;

const USE_CASE_SHOWCASE: ReadonlyArray<{
  readonly mode: ComposerMode;
  readonly icon: typeof FileText;
  readonly tabLabel: string;
  readonly modeSummary: string;
  readonly badge: string;
  readonly title: string;
  readonly summary: string;
  readonly rawInput: string;
  readonly highlights: readonly { label: string; text: string }[];
}> = [
  {
    mode: "text",
    icon: FileText,
    tabLabel: "Work & Writing",
    modeSummary: "Architecture docs, executive memos, code specs, and support rubrics.",
    badge: "Docs · Code · Strategy",
    title: "Staff Architecture RFC & Trade-off Matrix",
    summary:
      "Turns quick technical notes into a structured specification with role calibration, comparison tables, and edge-case rules.",
    rawInput:
      "Design a multi-region failover strategy for [Service_Name] with RPO < 30s and RTO < 2m.",
    highlights: [
      { label: "Role", text: "Principal Distributed Systems Architect" },
      { label: "Variables", text: "[Service_Name], [RPO_Budget], [RTO_Budget]" },
      {
        label: "Format",
        text: "Executive Verdict, Active-Active vs. Warm-Standby Matrix, Runbook Steps",
      },
      { label: "Guardrail", text: "Never assume zero replication lag across regions" },
    ],
  },
  {
    mode: "image",
    icon: Image,
    tabLabel: "Image Studio",
    modeSummary: "Product photography, editorial portraits, lens optics, and lighting setups.",
    badge: "Product · Editorial · Brand",
    title: "Industrial Studio Hardware Keyframe",
    summary:
      "Adds focal length, depth of field, lighting mood, and negative prompts automatically so visuals look like real studio photography.",
    rawInput:
      "Macro studio photograph of [Product_Subject] on matte basalt, 85mm f/2.0, rim lighting.",
    highlights: [
      { label: "Subject", text: "[Product_Subject] crafted from [Material_Finish] on matte basalt" },
      { label: "Optics", text: "16:9 widescreen, 85mm prime lens, f/2.0 shallow depth of field" },
      { label: "Lighting", text: "Soft volumetric key light with crisp silver rim highlights" },
      { label: "Negative Guardrail", text: "No neon cast, no distorted text, no plastic sheen" },
    ],
  },
  {
    mode: "video",
    icon: Film,
    tabLabel: "Cinema Video",
    modeSummary: "24fps camera motion, scene transitions, pacing, and physics continuity.",
    badge: "Motion · Storyboards · Reveal",
    title: "Continuous 24fps Orbital Product Reveal",
    summary:
      "Specifies frame rate, camera trajectory, opening/closing beats, and physics guardrails for Veo, Sora, and video models.",
    rawInput:
      "Continuous 6-second orbital tracking shot around [Hero_Subject] as volumetric key light sweeps across the frame.",
    highlights: [
      {
        label: "Scene Arc",
        text: "[Opening_Frame] transitions smoothly around [Hero_Subject] to [Closing_Beat]",
      },
      { label: "Camera", text: "24fps, 16:9 cinema scope, 6-second continuous tracking shot" },
      { label: "Motion Physics", text: "Consistent object geometry with natural 180° shutter blur" },
      { label: "Guardrail", text: "Prevent morphing textures or sudden lighting flicker" },
    ],
  },
];

export function MarketingScrollContent() {
  const [selectedUseCase, setSelectedUseCase] = React.useState<ComposerMode>("text");
  const activeShowcase =
    USE_CASE_SHOWCASE.find((u) => u.mode === selectedUseCase) ?? USE_CASE_SHOWCASE[0]!;

  return (
    <div
      data-testid="anonymous-marketing-content"
      className="mx-auto max-w-[1360px] px-4 sm:px-8 pt-6 sm:pt-12 pb-12 sm:pb-24 space-y-14 sm:space-y-24"
    >
      {/* SECTION 1: Simplified Before & After Product Showcase */}
      <ObservedSection
        sectionId="before_after_showcase"
        className="relative space-y-6 sm:space-y-10"
      >
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">See the Difference</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
            Why one-line prompts fail—and how Open Prompt OS fixes them
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            When you type a vague sentence into AI, it guesses your tone, audience, and format. We
            turn your rough thought into 4 clear building blocks before it hits the model.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
          {/* Before Card */}
          <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl p-5 sm:p-8 flat-surface flex flex-col justify-between space-y-4 sm:space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-[var(--danger-text)]">
                  Before: Typical 1-Line Prompt
                </span>
                <Badge variant="danger">Unpredictable</Badge>
              </div>
              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--surface-2)] font-mono text-sm sm:text-base text-[var(--text-secondary)]">
                "Write a launch email and rollout plan for our new API."
              </div>
              <ul className="space-y-2.5 text-sm sm:text-base text-[var(--text-secondary)]">
                <li className="flex items-start gap-2.5">
                  <span className="text-[var(--danger-text)] font-bold">✕</span>
                  <span>No target audience—writes generic marketing filler</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[var(--danger-text)] font-bold">✕</span>
                  <span>No output structure or length limits</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[var(--danger-text)] font-bold">✕</span>
                  <span>Invents fake features or pricing details</span>
                </li>
              </ul>
            </div>
            <div className="pt-3.5 border-t border-[var(--separator-subtle)] text-xs sm:text-sm text-[var(--text-muted)]">
              Result: 4–5 rounds of frustrating follow-up edits.
            </div>
          </div>

          {/* After Card: 4 Calm Divided Rows */}
          <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl p-5 sm:p-8 glow-card flex flex-col justify-between space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--separator-subtle)]">
                <span className="inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-text)]">
                  <Sparkles className="w-4 h-4" />
                  After: Structured by Open Prompt OS
                </span>
                <Badge variant="framework">Ready in 1 Click</Badge>
              </div>

              <div className="divide-y divide-[var(--separator-subtle)]">
                {AFTER_HIGHLIGHTS.map((item) => (
                  <div
                    key={item.step}
                    className="py-2.5 sm:py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4"
                  >
                    <div className="inline-flex items-center gap-2 shrink-0 sm:w-52">
                      <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] text-xs font-bold">
                        {item.step}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3.5 border-t border-[var(--separator-subtle)] flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs sm:text-sm font-medium text-[var(--success-text)]">
                ✓ Clear role, reusable [Variables], and anti-hallucination guardrails
              </span>
              <Link
                to="/improve"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-text)] hover:underline focus-ring rounded"
              >
                <span>Fix an existing prompt</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </ObservedSection>

      {/* SECTION 2: Asymmetric Bento Feature Grid with Consistent Centered Header */}
      <ObservedSection sectionId="features_grid" className="space-y-6 sm:space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Built for Everyday Speed</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
            Everything you need to write better prompts, faster
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            No complex syntax to memorize. Pick what you need from visual cards and let the studio
            handle the structure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
          {/* Wide Spotlight 1 (7 cols) */}
          <article className="md:col-span-7 rounded-2xl p-5 sm:p-8 flat-surface flex flex-col justify-between gap-4 sm:gap-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
                  <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
                </span>
                <Badge variant="framework">Text · Image · Video</Badge>
              </div>
              <h3 className="text-lg sm:text-2xl font-bold">
                Guided building blocks instead of blank-page guesswork
              </h3>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                Tap visual cards for Goal, Audience, Format, Persona, Tone, and Guardrails. Each
                mode adapts automatically—whether you are writing an engineering doc, a product
                photo prompt, or a 24fps video shot.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1">
              {["Goal", "Audience", "Constraints", "Output Format", "Persona", "Guardrails"].map(
                (chip) => (
                  <span
                    key={chip}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                  >
                    + {chip}
                  </span>
                ),
              )}
            </div>
          </article>

          {/* Spotlight 2 (5 cols) */}
          <article className="md:col-span-5 rounded-2xl p-5 sm:p-8 flat-surface flex flex-col justify-between gap-4 sm:gap-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[var(--cyan-subtle-bg)] text-[var(--cyan-text)] border border-[var(--accent-cyan)]">
                  <Wrench className="w-5 h-5 sm:w-6 sm:h-6" />
                </span>
                <Badge variant="diagnostic">Prompt Autopsy</Badge>
              </div>
              <h3 className="text-lg sm:text-2xl font-bold">
                Find out why a prompt failed—and fix it in seconds
              </h3>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                Paste your original prompt alongside a bad or hallucinated AI response. Prompt
                Autopsy spots missing context or conflicting rules and writes a corrected version.
              </p>
            </div>
            <Link
              to="/improve"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cyan-text)] hover:underline focus-ring rounded"
            >
              <span>Open Improve & Prompt Autopsy</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </article>

          {/* 4 Focused Cards below */}
          <article className="md:col-span-6 lg:col-span-3 rounded-2xl p-5 sm:p-6 flat-surface space-y-2.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--cyan-subtle-bg)] text-[var(--cyan-text)] border border-[var(--accent-cyan)]">
              <Send className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold">One-Click Send</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Open your finished prompt directly in ChatGPT, Claude, or Gemini, or copy it in a
              single click.
            </p>
          </article>

          <article className="md:col-span-6 lg:col-span-3 rounded-2xl p-5 sm:p-6 flat-surface space-y-2.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold">Proven Frameworks</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Apply techniques inspired by CO-STAR, RISE, CARE, and Chain-of-Thought with one
              toggle.
            </p>
          </article>

          <article className="md:col-span-6 lg:col-span-3 rounded-2xl p-5 sm:p-6 flat-surface space-y-2.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--success-subtle-bg)] text-[var(--success-text)] border border-[var(--separator-subtle)]">
              <Sparkles className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold">Instant Free Use</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Start right on this page without an account. Your latest work saves in your browser
              and syncs when you sign up.
            </p>
          </article>

          <article className="md:col-span-6 lg:col-span-3 rounded-2xl p-5 sm:p-6 flat-surface space-y-2.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Lock className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold">Reusable Library</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Stop hunting through old chat threads. Save your best prompts with custom{" "}
              <code className="font-mono text-[var(--accent-text)]">[Variables]</code> in one place.
            </p>
          </article>
        </div>
      </ObservedSection>

      {/* SECTION 3: Templates Showcase with Non-Duplicated Mode Selector Strip + Detail Inspector */}
      <ObservedSection sectionId="use_cases" className="relative space-y-6 sm:space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Curated Template Gallery</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
            Prompts tuned for writing, images, and video
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Pick a studio mode below to inspect a sample blueprint, or load it straight into the
            composer.
          </p>
        </div>

        {/* 3-Card Mode Selector Strip (Shows mode category & scope without duplicating the template title below) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
          {USE_CASE_SHOWCASE.map((item) => {
            const Icon = item.icon;
            const isSelected = item.mode === selectedUseCase;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => setSelectedUseCase(item.mode)}
                className={`text-left p-4 sm:p-5 rounded-2xl transition-all focus-ring cursor-pointer flex flex-col justify-between gap-2 ${
                  isSelected
                    ? "glow-card"
                    : "flat-surface opacity-85 hover:opacity-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                    <Icon className="w-4 h-4 text-[var(--accent-text)]" />
                    <span>{item.tabLabel}</span>
                  </span>
                  <Badge variant={isSelected ? "framework" : "neutral"}>
                    {item.badge}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{item.modeSummary}</p>
              </button>
            );
          })}
        </div>

        {/* Active Template Detail Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 rounded-2xl sm:rounded-3xl p-5 sm:p-10 glass-surface items-center">
          <div className="lg:col-span-5 space-y-4 sm:space-y-5">
            <Badge variant="framework">Sample {activeShowcase.tabLabel} Blueprint</Badge>
            <h3 className="text-xl sm:text-3xl font-bold leading-snug">{activeShowcase.title}</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              {activeShowcase.summary}
            </p>

            <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--surface-2)] space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                Input prompt:
              </div>
              <p className="text-sm sm:text-base font-medium text-[var(--text-primary)]">
                "{activeShowcase.rawInput}"
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="solid"
                size="md"
                onClick={() => {
                  composerActions.setMode(activeShowcase.mode);
                  composerActions.updateActiveDraft({ rawInput: activeShowcase.rawInput });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <Cpu className="w-4 h-4" />
                <span>Load in {activeShowcase.tabLabel} Composer</span>
              </Button>

              <Link
                to="/templates"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-[var(--accent-text)] hover:underline focus-ring rounded"
              >
                <span>Browse all templates</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 lg:pl-8 lg:border-l lg:border-[var(--separator-subtle)] space-y-3.5 sm:space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--separator-subtle)]">
              <span className="text-sm font-semibold text-[var(--accent-text)]">
                Compiled Specification Structure
              </span>
              <Badge variant="neutral">{activeShowcase.mode.toUpperCase()} MODE</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {activeShowcase.highlights.map((h) => (
                <div
                  key={h.label}
                  className="p-3.5 sm:p-4 rounded-2xl bg-[var(--surface-2)] space-y-1"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--cyan-text)]">
                    {h.label}
                  </div>
                  <div className="text-sm sm:text-base text-[var(--text-primary)] leading-relaxed">
                    {h.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ObservedSection>

      {/* SECTION 4: Privacy & Trust Showcase (Uniform width, clean 3-column divided layout) */}
      <ObservedSection
        sectionId="privacy_commitment"
        className="rounded-2xl sm:rounded-3xl p-6 sm:p-12 glass-surface"
      >
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-10 space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Privacy by Default Guarantee</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
            We never train on your prompts. Period.
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Your prompts contain your company's strategy, code, and creative IP. Every draft and
            compiled output remains strictly yours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-6 border-t border-[var(--separator-subtle)] md:divide-x md:divide-[var(--separator-subtle)]">
          <div className="space-y-1.5 sm:space-y-2 md:pr-6">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-[var(--success-text)]">
              <ShieldCheck className="w-5 h-5" />
              <span>Zero Model Training</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Your inputs and outputs are never used to train or fine-tune any AI model.
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2 md:px-6">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-text)]">
              <EyeOff className="w-5 h-5" />
              <span>Redacted Telemetry</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Analytics track feature performance only—never your prompt text, emails, or API keys.
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2 md:pl-6">
            <div className="inline-flex items-center gap-2 text-base font-semibold text-[var(--cyan-text)]">
              <Lock className="w-5 h-5" />
              <span>Isolated Workspaces</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Saved prompts are protected by tenant-isolated PostgreSQL Row-Level Security.
            </p>
          </div>
        </div>
      </ObservedSection>

      {/* SECTION 5: Pricing with Horizontally Aligned Headers Across All 3 Cards */}
      <ObservedSection sectionId="pricing_options" className="space-y-6 sm:space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Simple, Fair Pricing</Badge>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-balance">
            Start free without an account. Upgrade when you need more volume.
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Only AI-powered compilations count toward your daily limit—editing, copying, and
            browsing templates are always free.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch pt-2">
          {/* Free Tier */}
          <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 flat-surface flex flex-col justify-between gap-6 sm:gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
                <Badge variant="neutral">Free Forever</Badge>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Starter
                </span>
              </div>
              <h3 className="text-2xl font-bold">Instant Guest & Free</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tabular-nums">$0</span>
                <span className="text-sm text-[var(--text-secondary)]">/ forever</span>
              </div>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Everything you need to start writing better prompts right away.
              </p>
              <ul className="space-y-3 text-sm sm:text-base text-[var(--text-secondary)] pt-2">
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>5 daily guest runs · 50/day with free account</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>Text, Image, and Video modes</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>Personal prompt library & auto-sync</span>
                </li>
              </ul>
            </div>
            <Button
              variant="solid"
              size="lg"
              onClick={() => openAuthDialog({ reason: "navbar_signin" })}
            >
              Create Free Account
            </Button>
          </div>

          {/* Recommended Pro Tier */}
          <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 glow-card flex flex-col justify-between gap-6 sm:gap-8 overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
                <Badge variant="framework">Recommended · Most Popular</Badge>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                  Power Users
                </span>
              </div>
              <h3 className="text-2xl font-bold">Pro Studio</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tabular-nums">$19</span>
                <span className="text-sm text-[var(--text-secondary)]">/ month</span>
              </div>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                For builders, writers, and engineers who rely on AI every day.
              </p>
              <ul className="space-y-3 text-sm sm:text-base text-[var(--text-primary)] pt-2">
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                  <span>500 daily AI-compiled prompts & autopsies</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                  <span>Unlimited Prompt Autopsy failure diagnostics</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                  <span>Anti-hallucination guardrail packs</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
                  <span>Passkey hardware security</span>
                </li>
              </ul>
            </div>

            <Link
              to="/pricing"
              className="inline-flex items-center justify-center min-h-[52px] px-7 py-3 text-base font-semibold rounded-xl btn-brand-gradient text-white focus-ring"
            >
              Upgrade to Pro
            </Link>
          </div>

          {/* Team Tier */}
          <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 flat-surface flex flex-col justify-between gap-6 sm:gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
                <Badge variant="neutral">Shared Library</Badge>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Multi-Seat
                </span>
              </div>
              <h3 className="text-2xl font-bold">Team Workspace</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tabular-nums">$49</span>
                <span className="text-sm text-[var(--text-secondary)]">/ seat / mo</span>
              </div>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Standardize prompts and guardrails across your entire team.
              </p>
              <ul className="space-y-3 text-sm sm:text-base text-[var(--text-secondary)] pt-2">
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>Shared team prompt library & templates</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>Strict tenant-isolated database security</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-5 h-5 text-[var(--success-text)] shrink-0" />
                  <span>Automatic multi-provider failover</span>
                </li>
              </ul>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center min-h-[52px] px-7 py-3 text-base font-semibold rounded-xl btn-solid-contrast focus-ring"
            >
              Compare All Plans
            </Link>
          </div>
        </div>
      </ObservedSection>
    </div>
  );
}
