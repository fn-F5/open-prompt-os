import { Badge } from "@open-prompt-os/ui-web";
import {
  ArrowRight,
  Compass,
  EyeOff,
  Layers,
  Lock,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { HOME_AEO_FAQS } from "../../content/docs-catalog.js";
import { CARD_HOVER_ANIMATION } from "../../hooks/use-card-parallax.js";
import { trackEvent } from "../../lib/telemetry.js";
import { PricingPlansSection } from "../pricing/pricing-plans-section.js";

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
    label: "Concrete Details",
    value:
      "Launch the Realtime Analytics API highlighting p99 < 40ms latency and the June 30 migration deadline.",
  },
  {
    step: "4",
    label: "Guardrail & Output Format",
    value: "Return a 3-step quickstart + breaking-change table. Do not invent endpoints.",
  },
] as const;

export function MarketingScrollContent() {
  return (
    <div
      data-testid="anonymous-marketing-content"
      className="mx-auto max-w-[1360px] px-4 sm:px-8 pt-4 sm:pt-8 pb-12 sm:pb-24 space-y-14 sm:space-y-24"
    >
      {/* SECTION 1: Simplified Before & After Product Showcase */}
      <ObservedSection
        sectionId="before_after_showcase"
        className="relative space-y-6 sm:space-y-10"
      >
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">See the Difference</Badge>
          <h2 className="text-2xl sm:text-4xl font-medium tracking-[-0.025em] text-balance">
            Why one-line prompts fail—and how Open Prompt OS{" "}
            <span className="text-gradient-brand">fixes them</span>
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            When you type a vague sentence into AI, it guesses your tone, audience, and format. We
            turn your rough thought into 4 clear building blocks before it hits the model.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
          {/* Before Card */}
          <div
            data-animate={CARD_HOVER_ANIMATION.marketingBeforeCard}
            className="lg:col-span-5 p-5 sm:p-8 flat-surface flex flex-col justify-between space-y-4 sm:space-y-6"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-medium text-[var(--danger-text)]">
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
            <div className="pt-3.5 border-t border-[var(--separator-subtle)] font-mono text-[13px] leading-[1.4] text-[var(--text-muted)]">
              Result: 4–5 rounds of frustrating follow-up edits.
            </div>
          </div>

          {/* After Card: 4 Calm Divided Rows */}
          <div
            data-animate={CARD_HOVER_ANIMATION.marketingAfterCard}
            className="lg:col-span-7 p-5 sm:p-8 glow-card flex flex-col justify-between space-y-4 sm:space-y-6"
          >
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
          <h2 className="text-2xl sm:text-4xl font-medium tracking-[-0.025em] text-balance">
            Everything you need to write better prompts,{" "}
            <span className="text-gradient-brand">faster</span>
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            No complex syntax to memorize. Pick what you need from visual cards and let the studio
            handle the structure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
          {/* Wide Spotlight 1 (7 cols) */}
          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-7 p-5 sm:p-8 flat-surface flex flex-col justify-between gap-4 sm:gap-6"
          >
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-[10px] bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
                  <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
                </span>
                <Badge variant="framework">Text · Image · Video</Badge>
              </div>
              <h3 className="text-xl sm:text-2xl font-medium tracking-[-0.02em]">
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
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg font-mono text-xs font-normal bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                  >
                    + {chip}
                  </span>
                ),
              )}
            </div>
          </article>

          {/* Spotlight 2 (5 cols) */}
          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-5 p-5 sm:p-8 flat-surface flex flex-col justify-between gap-4 sm:gap-6"
          >
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-[10px] bg-[var(--cyan-subtle-bg)] text-[var(--cyan-text)] border border-[var(--accent-cyan)]">
                  <Wrench className="w-5 h-5 sm:w-6 sm:h-6" />
                </span>
                <Badge variant="diagnostic">Prompt Autopsy</Badge>
              </div>
              <h3 className="text-xl sm:text-2xl font-medium tracking-[-0.02em]">
                Find out why a prompt failed—and fix it in seconds
              </h3>
              <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                Paste your original prompt alongside a bad or hallucinated AI response. Prompt
                Autopsy spots missing context or conflicting rules and writes a corrected version.
              </p>
            </div>
            <Link
              to="/improve"
              className="inline-flex items-center gap-2 font-mono text-[13px] font-normal text-[var(--cyan-text)] hover:underline focus-ring rounded"
            >
              <span>Open Improve & Prompt Autopsy</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </article>

          {/* 4 Focused Cards below */}
          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-6 lg:col-span-3 p-5 sm:p-6 flat-surface space-y-2.5"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[var(--cyan-subtle-bg)] text-[var(--cyan-text)] border border-[var(--accent-cyan)]">
              <Send className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-medium tracking-[-0.02em]">One-Click Send</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Open your finished prompt directly in ChatGPT, Claude, or Gemini, or copy it in a
              single click.
            </p>
          </article>

          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-6 lg:col-span-3 p-5 sm:p-6 flat-surface space-y-2.5"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-medium tracking-[-0.02em]">Proven Frameworks</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Apply techniques inspired by CO-STAR, RISE, CARE, and Chain-of-Thought with one
              toggle.{" "}
              <Link
                to="/docs/prompt-frameworks-costar-rise-care-cot"
                className="text-[var(--accent-text)] font-medium hover:underline focus-ring rounded"
              >
                Compare frameworks →
              </Link>
            </p>
          </article>

          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-6 lg:col-span-3 p-5 sm:p-6 flat-surface space-y-2.5"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[var(--success-subtle-bg)] text-[var(--success-text)] border border-[var(--separator-subtle)]">
              <Sparkles className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-medium tracking-[-0.02em]">Instant Free Use</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Start right on this page without an account. Your latest work saves in your browser
              and syncs when you sign up.
            </p>
          </article>

          <article
            data-animate={CARD_HOVER_ANIMATION.marketingBentoCard}
            className="md:col-span-6 lg:col-span-3 p-5 sm:p-6 flat-surface space-y-2.5"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]">
              <Lock className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-medium tracking-[-0.02em]">Prompt Library</h3>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Stop hunting through old chat threads. Save and organize your best ready-to-paste
              prompts in one place.
            </p>
          </article>
        </div>
      </ObservedSection>

      {/* SECTION 4: Privacy & Trust Showcase (Uniform width, clean 3-column divided layout) */}
      <ObservedSection sectionId="privacy_commitment" className="p-6 sm:p-12 glass-surface">
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-10 space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Privacy by Default Guarantee</Badge>
          <h2 className="text-2xl sm:text-4xl font-medium tracking-[-0.025em] text-balance">
            We never train on your prompts. <span className="text-gradient-brand">Period.</span>
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Your prompts contain your company's strategy, code, and creative IP. Every draft and
            compiled output remains strictly yours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-6 border-t border-[var(--separator-subtle)] md:divide-x md:divide-[var(--separator-subtle)]">
          <div className="space-y-1.5 sm:space-y-2 md:pr-6">
            <div className="inline-flex items-center gap-2 text-base font-medium text-[var(--success-text)]">
              <ShieldCheck className="w-5 h-5" />
              <span>Zero Model Training</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Your inputs and outputs are never used to train or fine-tune any AI model.
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2 md:px-6">
            <div className="inline-flex items-center gap-2 text-base font-medium text-[var(--accent-text)]">
              <EyeOff className="w-5 h-5" />
              <span>Redacted Telemetry</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Analytics track feature performance only—never your prompt text, emails, or API keys.
            </p>
          </div>

          <div className="space-y-1.5 sm:space-y-2 md:pl-6">
            <div className="inline-flex items-center gap-2 text-base font-medium text-[var(--cyan-text)]">
              <Lock className="w-5 h-5" />
              <span>Isolated Workspaces</span>
            </div>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Saved prompts are protected by tenant-isolated PostgreSQL Row-Level Security.
            </p>
          </div>
        </div>
      </ObservedSection>

      {/* SECTION 5: Shared Stripe-backed Pricing Section */}
      <ObservedSection sectionId="pricing_options">
        <PricingPlansSection headingAs="h2" />
      </ObservedSection>

      {/* SECTION 6: Answer-First FAQ Section (SEO / AEO) */}
      <ObservedSection sectionId="faq_section" className="space-y-6 sm:space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <Badge variant="framework">Documentation & Quick Answers</Badge>
          <h2 className="text-2xl sm:text-4xl font-medium tracking-[-0.025em] text-balance">
            Frequently asked <span className="text-gradient-brand">questions</span>
          </h2>
          <p className="text-sm sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Direct answers about prompt compilation, frameworks, Prompt Autopsy, and privacy.{" "}
            <Link
              to="/docs"
              className="text-[var(--accent-text)] font-medium hover:underline focus-ring rounded"
            >
              Read full docs →
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HOME_AEO_FAQS.map((faq) => (
            <article
              key={faq.question}
              data-animate={CARD_HOVER_ANIMATION.marketingFaqCard}
              className="p-5 sm:p-6 rounded-2xl flat-surface space-y-2"
            >
              <h3 className="text-base sm:text-lg font-medium tracking-[-0.015em] text-[var(--text-primary)]">
                {faq.question}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{faq.answer}</p>
            </article>
          ))}
        </div>
      </ObservedSection>
    </div>
  );
}
