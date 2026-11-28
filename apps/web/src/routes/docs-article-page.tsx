import { DEFAULT_CURATED_TEMPLATES } from "@open-prompt-os/contracts";
import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Sparkles } from "lucide-react";
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { SeoHead } from "../components/seo/seo-head.js";
import { DOCS_CATALOG, findDocBySlug } from "../content/docs-catalog.js";
import { useCardHoverAnimation } from "../hooks/use-card-parallax.js";
import { copyTextToClipboard } from "../lib/dispatch.js";
import { buildDocArticleSeo } from "../lib/seo.js";
import { composerActions } from "../state/composer-store.js";

export function DocsArticlePage() {
  const { docSlug = "" } = useParams();
  const navigate = useNavigate();
  const animateCard = useCardHoverAnimation();
  const doc = findDocBySlug(docSlug);

  if (!doc) {
    return (
      <div
        data-animate={animateCard("docsArticleNotFound")}
        className="rounded-2xl p-8 flat-surface text-center space-y-4 max-w-2xl mx-auto"
      >
        <SeoHead
          meta={{
            title: "Documentation Guide Not Found | Open Prompt OS",
            description: "The requested documentation guide could not be found.",
            canonicalPath: `/docs/${docSlug}`,
            noindex: true,
          }}
        />
        <h1 className="text-xl font-semibold">Guide not found</h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          No documentation guide matched "{docSlug}". Browse all Open Prompt OS guides below.
        </p>
        <Link
          to="/docs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
        >
          Back to Documentation
        </Link>
      </div>
    );
  }

  const seoMeta = React.useMemo(() => buildDocArticleSeo(doc), [doc]);
  const relatedTemplates = DEFAULT_CURATED_TEMPLATES.filter((t) =>
    doc.relatedTemplateSlugs.includes(t.slug),
  );
  const otherDocs = DOCS_CATALOG.filter((d) => d.slug !== doc.slug).slice(0, 3);

  return (
    <article className="max-w-4xl mx-auto space-y-8">
      <SeoHead meta={seoMeta} />

      {/* Semantic Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
      >
        <Link to="/" className="hover:text-[var(--text-primary)] focus-ring rounded">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/docs" className="hover:text-[var(--text-primary)] focus-ring rounded">
          Docs
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--text-primary)] font-medium">{doc.shortTitle}</span>
      </nav>

      {/* Header & Answer-First TL;DR Box */}
      <header
        data-animate={animateCard("docsArticleHeader")}
        className="rounded-2xl p-6 sm:p-8 flat-surface space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="framework">{doc.category}</Badge>
            <span className="text-xs font-mono text-[var(--text-secondary)]">
              {doc.readingTimeMinutes} min read
            </span>
          </div>
          <Link
            to="/docs"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-ring rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All guides</span>
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
            {doc.description}
          </p>
        </div>

        {/* Direct Answer / AEO Callout */}
        <div
          aria-label="Direct Answer Summary"
          className="rounded-xl p-4 sm:p-5 bg-[var(--accent-subtle-bg)] border border-[var(--separator-strong)] space-y-1.5"
        >
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent-text)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Direct Answer</span>
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{doc.tldrAnswer}</p>
        </div>

        {doc.composerAction ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="solid"
              size="sm"
              onClick={() => {
                const action = doc.composerAction;
                if (!action) return;
                composerActions.setMode(action.mode);
                composerActions.updateActiveDraft(action.draft);
                toast({
                  title: "Loaded guide preset in Composer",
                  description: `Switched to ${action.mode} mode.`,
                });
                navigate("/compile");
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{doc.composerAction.label}</span>
            </Button>
          </div>
        ) : null}
      </header>

      {/* Sections */}
      <div className="space-y-6">
        {doc.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            data-animate={animateCard("docsArticleSection")}
            className="rounded-2xl p-6 sm:p-8 flat-surface space-y-4"
          >
            <h2 id={`${section.id}-heading`} className="text-xl font-semibold tracking-tight">
              {section.heading}
            </h2>

            {section.paragraphs.map((p) => (
              <p
                key={p}
                className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed"
              >
                {p}
              </p>
            ))}

            {section.bullets ? (
              <ul className="space-y-2 text-sm text-[var(--text-primary)] list-disc pl-5">
                {section.bullets.map((b) => (
                  <li key={b} className="leading-relaxed">
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}

            {section.table ? (
              <div className="overflow-x-auto rounded-xl border border-[var(--separator-subtle)]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--separator-subtle)]">
                    <tr>
                      {section.table.headers.map((header) => (
                        <th
                          key={header}
                          className="px-4 py-2.5 font-semibold text-[var(--text-primary)]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--separator-subtle)]">
                    {section.table.rows.map((row) => (
                      <tr key={row.join("|")} className="hover:bg-[var(--surface-2)]/50">
                        {row.map((cell, cellIdx) => {
                          const colKey = section.table?.headers[cellIdx] ?? cell;
                          return (
                            <td
                              key={`${colKey}:${cell}`}
                              className={`px-4 py-2.5 align-top ${
                                cellIdx === 0
                                  ? "font-medium text-[var(--text-primary)]"
                                  : "text-[var(--text-secondary)]"
                              }`}
                            >
                              {cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {section.codeBlock ? (
              <div className="relative rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] p-4">
                <div className="flex justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(section.codeBlock ?? "");
                      if (ok) toast({ title: "Copied specification snippet" });
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </Button>
                </div>
                <pre className="font-mono text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                  {section.codeBlock}
                </pre>
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {/* Article FAQs */}
      {doc.faqs.length > 0 ? (
        <section className="rounded-2xl p-6 sm:p-8 glass-surface space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {doc.faqs.map((faq) => (
              <div
                key={faq.question}
                className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1.5"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{faq.question}</h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Related Templates & Next Guides */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relatedTemplates.length > 0 ? (
          <section
            data-animate={animateCard("docsArticleRelatedTemplates")}
            className="rounded-2xl p-5 flat-surface space-y-3"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Related Prompt Blueprints
            </h2>
            <ul className="space-y-2">
              {relatedTemplates.map((tpl) => (
                <li key={tpl.slug}>
                  <Link
                    to={`/templates/${tpl.slug}`}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface-2)] hover:border-[var(--separator-strong)] border border-[var(--separator-subtle)] text-xs font-medium focus-ring"
                  >
                    <span>{tpl.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[var(--accent-text)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          data-animate={animateCard("docsArticleContinueReading")}
          className="rounded-2xl p-5 flat-surface space-y-3"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Continue Reading
          </h2>
          <ul className="space-y-2">
            {otherDocs.map((other) => (
              <li key={other.slug}>
                <Link
                  to={`/docs/${other.slug}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface-2)] hover:border-[var(--separator-strong)] border border-[var(--separator-subtle)] text-xs font-medium focus-ring"
                >
                  <span>{other.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[var(--accent-text)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
