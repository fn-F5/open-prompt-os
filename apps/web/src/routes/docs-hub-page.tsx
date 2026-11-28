import { Badge, Button, Input } from "@open-prompt-os/ui-web";
import { ArrowRight, BookOpen, Compass, Search, Sparkles } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router";
import { SeoHead } from "../components/seo/seo-head.js";
import { DOCS_CATALOG, type DocArticle, HOME_AEO_FAQS } from "../content/docs-catalog.js";
import { useCardHoverAnimation } from "../hooks/use-card-parallax.js";
import { STATIC_ROUTE_SEO } from "../lib/seo.js";
import { composerActions } from "../state/composer-store.js";

const CATEGORIES: ReadonlyArray<"All" | DocArticle["category"]> = [
  "All",
  "Core Concepts",
  "Prompt Frameworks",
  "Debugging & Autopsy",
  "Image & Video Studio",
  "Privacy & Security",
];

export function DocsHubPage() {
  const navigate = useNavigate();
  const animateCard = useCardHoverAnimation();
  const [category, setCategory] = React.useState<"All" | DocArticle["category"]>("All");
  const [query, setQuery] = React.useState("");

  const filteredDocs = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOCS_CATALOG.filter((doc) => {
      if (category !== "All" && doc.category !== category) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        doc.tldrAnswer.toLowerCase().includes(q) ||
        doc.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    });
  }, [category, query]);

  const seoMeta = React.useMemo(() => STATIC_ROUTE_SEO.docsHub(DOCS_CATALOG), []);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <SeoHead meta={seoMeta} />

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="framework">Documentation & Guides</Badge>
          <span className="text-xs text-[var(--text-secondary)]">
            Answer-First Prompt Engineering Reference
          </span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">
              Open Prompt OS Documentation
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Learn how to compile structured prompts with CO-STAR, RISE, CARE, and
              Chain-of-Thought, debug hallucinations with Prompt Autopsy, and extract optics from
              reference images.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/llms.txt"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>llms.txt</span>
            </a>
            <Button
              variant="solid"
              size="sm"
              onClick={() => {
                navigate("/compile");
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Open Composer</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Search & Category Filter */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            aria-label="Search documentation"
            placeholder="Search guides, CO-STAR, Autopsy, optics, privacy..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <fieldset
          aria-label="Filter docs by category"
          className="flex flex-wrap gap-1.5 border-0 p-0 m-0"
        >
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer focus-ring ${
                  active
                    ? "bg-[var(--accent-subtle-bg)] text-[var(--text-primary)] border border-[var(--separator-strong)]"
                    : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </fieldset>
      </div>

      {/* Guides Grid */}
      {filteredDocs.length === 0 ? (
        <div
          data-animate={animateCard("docsHubEmpty")}
          className="rounded-xl p-10 flat-surface text-center space-y-3"
        >
          <div className="text-sm font-medium">No documentation guides matched "{query}"</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCategory("All");
              setQuery("");
            }}
          >
            Reset docs filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((doc) => (
            <article
              key={doc.slug}
              data-animate={animateCard("docsHubItem")}
              className="rounded-2xl p-6 flat-surface flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="framework">{doc.category}</Badge>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {doc.readingTimeMinutes} min read
                  </span>
                </div>

                <div>
                  <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
                    <Link to={`/docs/${doc.slug}`} className="hover:underline focus-ring rounded">
                      {doc.title}
                    </Link>
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    {doc.description}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                  <span className="font-semibold text-[var(--accent-text)]">TL;DR: </span>
                  {doc.tldrAnswer}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--separator-subtle)] flex items-center justify-between gap-2">
                <Link
                  to={`/docs/${doc.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] hover:underline focus-ring rounded py-1"
                >
                  <span>Read full guide</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {doc.composerAction ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const action = doc.composerAction;
                      if (!action) return;
                      composerActions.setMode(action.mode);
                      composerActions.updateActiveDraft(action.draft);
                      navigate("/compile");
                    }}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Try in Composer</span>
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Quick Answers / AEO FAQ Block */}
      <section
        aria-labelledby="docs-faq-heading"
        className="rounded-2xl p-6 sm:p-8 glass-surface space-y-5"
      >
        <div className="space-y-1">
          <Badge variant="framework">Quick Answers</Badge>
          <h2 id="docs-faq-heading" className="text-xl sm:text-2xl font-semibold tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HOME_AEO_FAQS.map((faq) => (
            <div
              key={faq.question}
              className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-2"
            >
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{faq.question}</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
