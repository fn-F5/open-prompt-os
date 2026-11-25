import type { PromptLength, RefinePromptOutput } from "@open-prompt-os/contracts";
import {
  computeLineDiff,
  computePromptHealthScore,
  evaluatePromptQuality,
} from "@open-prompt-os/core";
import { Badge, Button, Tabs, Textarea, toast } from "@open-prompt-os/ui-web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { AuthGate } from "../components/auth/auth-gate.js";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { useAutoResizeTextarea } from "../hooks/use-auto-resize-textarea.js";
import { useCardHoverAnimation } from "../hooks/use-card-parallax.js";
import { copyTextToClipboard, dispatchPrompt } from "../lib/dispatch.js";
import { OrpcClientError, orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";
import { STATIC_ROUTE_SEO } from "../lib/seo.js";
import { trackEvent } from "../lib/telemetry.js";
import { openAuthDialog } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

const TARGET_MODEL_OPTIONS = [
  { id: "openai-text", label: "OpenAI (ChatGPT / GPT)" },
  { id: "anthropic-text", label: "Anthropic (Claude)" },
  { id: "google-text", label: "Google (Gemini)" },
  { id: "deepseek-text", label: "DeepSeek" },
  { id: "alibaba-text", label: "Alibaba (Qwen)" },
  { id: "xai-text", label: "xAI (Grok)" },
] as const;

const AUTOPSY_SYMPTOMS = [
  "Hallucinated facts",
  "Wrong format",
  "Ignored constraints",
  "Too verbose",
  "Wrong tone",
] as const;

const IMPROVE_EXAMPLES = [
  {
    label: "Vague Architecture Doc",
    prompt:
      "Write a technical architecture doc for our Node.js payment service targeting backend engineers using Stripe.",
  },
  {
    label: "Generic Cold Outreach",
    prompt:
      "Write a cold email to a VP of Engineering pitching our DevOps monitoring tool and ask for a 15 minute call.",
  },
] as const;

const AUTOPSY_EXAMPLES = [
  {
    label: "Hallucinated API Citation",
    prompt: "Give me a migration guide to move our Node.js app from Stripe v12 to v14.",
    failedOutput:
      "Run `stripe.autoMigrate({ zeroDowntime: true })` and call the new `POST /v2/instant-upgrade` endpoint introduced in v14 to automatically convert all webhook schemas.",
    symptoms: ["Hallucinated facts"] as readonly string[],
  },
  {
    label: "Broken JSON Format",
    prompt: "Summarize these customer support tickets into JSON with severity and owner.",
    failedOutput:
      "Sure! Here is a helpful summary of your tickets:\n1. Billing timeout (High priority) - assign to payments team.\n2. Login issue - probably auth team.\nLet me know if you want me to format this differently!",
    symptoms: ["Wrong format", "Too verbose"] as readonly string[],
  },
  {
    label: "Scope & Tone Drift",
    prompt: "Write a concise 3-bullet executive update on our Q3 Postgres latency incident.",
    failedOutput:
      "Database performance is a fascinating topic in modern distributed systems! Before diving into Q3, let's explore how B-tree indexes work in PostgreSQL and why write-ahead logging matters...",
    symptoms: ["Too verbose", "Wrong tone", "Ignored constraints"] as readonly string[],
  },
] as const;

export function ImproveAutopsyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const animateCard = useCardHoverAnimation();
  const { isAuthenticated } = useAuthSession();
  const preload = (location.state as { preloadPrompt?: string } | null)?.preloadPrompt ?? "";

  const requireAuth = () => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "action_required", intendedRoute: location.pathname });
      return false;
    }
    return true;
  };

  const [mode, setMode] = React.useState<"improve" | "autopsy">("improve");
  const [originalPrompt, setOriginalPrompt] = React.useState(
    preload ||
      "Write a technical architecture doc for our Node.js payment service targeting backend engineers using Stripe.",
  );
  const [failedOutput, setFailedOutput] = React.useState("");
  const [targetLength, setTargetLength] = React.useState<PromptLength>("balanced");
  const [targetModelId, setTargetModelId] = React.useState<string>("openai-text");
  const [selectedSymptoms, setSelectedSymptoms] = React.useState<string[]>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RefinePromptOutput | null>(null);
  const [analyzedPrompt, setAnalyzedPrompt] = React.useState<string>("");
  const [outputView, setOutputView] = React.useState<"optimized" | "diff">("optimized");
  const [mobilePane, setMobilePane] = React.useState<"input" | "diagnosis">("input");
  const [copied, setCopied] = React.useState(false);
  const [savedKey, setSavedKey] = React.useState<string | null>(null);

  const promptRef = useAutoResizeTextarea(originalPrompt, { minHeightPx: 120, maxHeightPx: 280 });
  const failedRef = useAutoResizeTextarea(failedOutput, { minHeightPx: 100, maxHeightPx: 240 });

  const liveHealth = React.useMemo(
    () => computePromptHealthScore(originalPrompt),
    [originalPrompt],
  );
  const beforeHealth = React.useMemo(
    () => computePromptHealthScore(analyzedPrompt || originalPrompt),
    [analyzedPrompt, originalPrompt],
  );
  const afterHealth = React.useMemo(
    () => (result ? computePromptHealthScore(result.optimizedPrompt) : null),
    [result],
  );
  const diffLines = React.useMemo(
    () => (result ? computeLineDiff(analyzedPrompt, result.optimizedPrompt) : []),
    [analyzedPrompt, result],
  );

  const currentResultKey = result ? `${result.requestId}:${result.optimizedPrompt}` : null;
  const isSaved = Boolean(currentResultKey && savedKey === currentResultKey);

  const refineMutation = useMutation({
    mutationFn: async () => {
      const symptomTone =
        mode === "autopsy" && selectedSymptoms.length > 0
          ? `Address observed failure symptoms: ${selectedSymptoms.join(", ")}`
          : undefined;
      const payload = {
        originalPrompt,
        mode,
        failedOutput: mode === "autopsy" ? failedOutput : undefined,
        targetLength,
        targetModelId,
        targetTone: symptomTone,
      };
      const snapshotPrompt = originalPrompt;
      const data =
        mode === "autopsy"
          ? await orpcClient.prompts.autopsy(payload)
          : await orpcClient.prompts.refine(payload);
      return { data, snapshotPrompt };
    },
    onSuccess: ({ data, snapshotPrompt }) => {
      setAnalyzedPrompt(snapshotPrompt);
      setResult(data);
      setOutputView("optimized");
      setMobilePane("diagnosis");
      qc.invalidateQueries({ queryKey: queryKeys.billing.status() });
    },
    onError: (err) => {
      if (err instanceof OrpcClientError && err.code === "QUOTA_EXCEEDED") {
        openAuthDialog({ reason: "quota_limit" });
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No optimized prompt to save.");
      const targetKey = `${result.requestId}:${result.optimizedPrompt}`;
      const rawInput = (analyzedPrompt || originalPrompt).trim().slice(0, 8000);
      const compiledPrompt = result.optimizedPrompt.trim().slice(0, 16000);
      const saved = await orpcClient.prompts.save({
        title: rawInput.slice(0, 80) || "Optimized Prompt Specification",
        rawInput: rawInput || compiledPrompt.slice(0, 8000),
        compiledPrompt,
        mode: "text",
        framework: "costar",
        modelId: result.modelId || targetModelId || "gpt-4.1",
        category: mode === "autopsy" ? "Autopsy Remediation" : "Optimized Prompts",
        tags: [mode, "optimized"],
      });
      return { saved, targetKey };
    },
    onSuccess: ({ targetKey }) => {
      setSavedKey(targetKey);
      trackEvent("prompt_saved", { mode: "text" });
      qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({
        title: "Saved to My Library",
        description: "Your optimized prompt is now saved in your workspace.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not save prompt",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const handleRun = () => {
    if (!requireAuth()) return;
    if (!originalPrompt.trim()) {
      setValidationError("Enter the original prompt to analyze.");
      return;
    }
    const quality = evaluatePromptQuality(originalPrompt);
    if (!quality.ok) {
      setValidationError(quality.message);
      return;
    }
    if (mode === "autopsy" && !failedOutput.trim()) {
      setValidationError(
        "Paste the failed or hallucinated model output so Autopsy can diagnose the root cause.",
      );
      return;
    }
    setValidationError(null);
    refineMutation.mutate();
  };

  const toggleSymptom = (symptom: string) => {
    if (!requireAuth()) return;
    setSelectedSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((item) => item !== symptom) : [...prev, symptom],
    );
  };

  const handleCopy = async (text: string) => {
    if (!requireAuth()) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied optimized prompt" });
    }
  };

  const seoMeta = React.useMemo(() => STATIC_ROUTE_SEO.improve(), []);
  const healthDelta = afterHealth ? afterHealth.score - beforeHealth.score : 0;

  return (
    <div className="space-y-6">
      <SeoHead meta={seoMeta} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Improve & Prompt Autopsy</h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Optimize prompt structure or paste a failed model output to diagnose why it drifted.
          </p>
        </div>

        <Tabs
          ariaLabel="Optimization mode"
          value={mode}
          onValueChange={(next) => {
            setValidationError(null);
            setMode(next);
          }}
          options={[
            { value: "improve", label: "Standard Improve" },
            { value: "autopsy", label: "Prompt Autopsy" },
          ]}
        />
      </div>

      {/* One-Click Example Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)]" />
          <span>{mode === "autopsy" ? "Try an Autopsy example:" : "Examples:"}</span>
        </span>
        {mode === "autopsy"
          ? AUTOPSY_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  if (!requireAuth()) return;
                  setValidationError(null);
                  setOriginalPrompt(example.prompt);
                  setFailedOutput(example.failedOutput);
                  setSelectedSymptoms([...example.symptoms]);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] transition-colors cursor-pointer"
              >
                {example.label}
              </button>
            ))
          : IMPROVE_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  if (!requireAuth()) return;
                  setValidationError(null);
                  setOriginalPrompt(example.prompt);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] transition-colors cursor-pointer"
              >
                {example.label}
              </button>
            ))}
      </div>

      {/* Mobile Step Switcher (Section 12.1, 21) */}
      <div className="lg:hidden">
        <Tabs
          ariaLabel="Workspace pane"
          value={mobilePane}
          onValueChange={setMobilePane}
          options={[
            { value: "input", label: "1. Input" },
            {
              value: "diagnosis",
              label: `2. Diagnosis & Output${result ? ` (${result.findings.length})` : ""}`,
            },
          ]}
          className="w-full justify-between"
        />
      </div>

      {/* Dual-Pane Workspace (Section 12.1) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Pane: Original Prompt & Failed Output */}
        <section
          aria-label="Original prompt and failed output input"
          data-animate={animateCard("improveInput")}
          className={`rounded-xl p-5 flat-surface space-y-4 ${
            mobilePane === "diagnosis" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="autopsy-original-prompt"
                className="text-xs font-semibold uppercase tracking-wider"
              >
                Original Prompt
              </label>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                <span className="font-mono font-medium text-[var(--text-primary)]">
                  Health {liveHealth.score}/100
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] p-2">
              <Textarea
                id="autopsy-original-prompt"
                ref={promptRef}
                value={originalPrompt}
                onChange={(e) => setOriginalPrompt(e.target.value)}
                placeholder="Paste the prompt you want to optimize or diagnose..."
              />
            </div>
          </div>

          {/* Failed Output Input + Quick Symptom Tags for Autopsy Mode */}
          {mode === "autopsy" ? (
            <div className="space-y-3 rounded-xl p-3.5 bg-[var(--danger-bg)] border border-[var(--danger-text)]/30">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="autopsy-failed-output"
                  className="text-xs font-semibold text-[var(--danger-text)] flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Failed or Hallucinated Model Output (Required for Autopsy)</span>
                </label>
              </div>
              <Textarea
                id="autopsy-failed-output"
                ref={failedRef}
                value={failedOutput}
                onChange={(e) => setFailedOutput(e.target.value)}
                placeholder="Paste the bad response, hallucination, or broken format that the model produced..."
                className="bg-[var(--surface-1)] text-[var(--text-primary)]"
              />
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  What went wrong? (optional)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AUTOPSY_SYMPTOMS.map((symptom) => {
                    const active = selectedSymptoms.includes(symptom);
                    return (
                      <button
                        key={symptom}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleSymptom(symptom)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? "bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border-[var(--separator-strong)] font-medium"
                            : "bg-[var(--surface-1)] text-[var(--text-secondary)] border-[var(--separator-subtle)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {symptom}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Target Model & Density Controls */}
          <div className="space-y-3 pt-2 border-t border-[var(--separator-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="autopsy-target-model"
                  className="text-xs text-[var(--text-secondary)] whitespace-nowrap"
                >
                  Target model:
                </label>
                <select
                  id="autopsy-target-model"
                  value={targetModelId}
                  onChange={(e) => setTargetModelId(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
                >
                  {TARGET_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <span className="text-xs text-[var(--text-secondary)]">Target density:</span>
                <Tabs
                  ariaLabel="Target prompt length"
                  value={targetLength}
                  onValueChange={setTargetLength}
                  options={[
                    { value: "short", label: "Short" },
                    { value: "balanced", label: "Balanced" },
                    { value: "detailed", label: "Detailed" },
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary-inverse"
                onClick={handleRun}
                disabled={refineMutation.isPending}
              >
                {mode === "autopsy" ? (
                  <>
                    <Stethoscope className="w-4 h-4" />
                    <span>{refineMutation.isPending ? "Running Autopsy..." : "Run Autopsy"}</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4" />
                    <span>{refineMutation.isPending ? "Optimizing..." : "Optimize Prompt"}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {validationError ? (
            <div
              role="alert"
              className="rounded-lg p-3 text-xs bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/30"
            >
              {validationError}
            </div>
          ) : null}
        </section>

        {/* Right Pane: Diagnosis & Optimized Prompt */}
        <section
          aria-label="Diagnostic findings and optimized prompt"
          data-animate={animateCard("improveOutput")}
          className={`rounded-xl p-5 flat-surface space-y-5 ${
            mobilePane === "input" ? "hidden lg:block" : "block"
          }`}
        >
          {refineMutation.isPending ? (
            <div aria-busy="true" className="space-y-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {mode === "autopsy"
                    ? "Running forensic autopsy on failed output..."
                    : "Auditing prompt structure & guardrails..."}
                </span>
              </div>
              <div className="space-y-3 animate-pulse">
                <div className="h-16 w-full rounded-lg bg-[var(--surface-2)]" />
                <div className="h-16 w-full rounded-lg bg-[var(--surface-2)]" />
                <div className="h-32 w-full rounded-xl bg-[var(--surface-2)]" />
              </div>
            </div>
          ) : refineMutation.error ? (
            <div
              role="alert"
              className="rounded-xl p-4 bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/40 space-y-3"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Could not complete analysis</span>
              </div>
              <p className="text-xs opacity-90">{refineMutation.error.message}</p>
              <Button variant="solid" size="sm" onClick={handleRun}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </Button>
            </div>
          ) : !result ? (
            <div className="py-12 text-center space-y-2 text-[var(--text-secondary)]">
              <Stethoscope className="w-8 h-8 mx-auto opacity-60" />
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Ready for Structural Analysis
              </div>
              <p className="text-xs max-w-sm mx-auto">
                Run Improve or Autopsy on the left to inspect missing context, ambiguous goals, and
                remediated specification output.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="framework">
                      {result.findings.length} Diagnostic Finding(s)
                    </Badge>
                    {afterHealth ? (
                      <span
                        aria-label="Prompt health score change"
                        className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-0.5 rounded-full bg-[var(--success-subtle-bg)] text-[var(--success-text)] border border-[var(--separator-subtle)] font-semibold tabular-nums"
                      >
                        <span>
                          Health {beforeHealth.score} → {afterHealth.score}
                        </span>
                        {healthDelta > 0 ? <span>(+{healthDelta})</span> : null}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                    {result.latencyMs}ms
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">{result.summary}</p>

                <div className="space-y-2.5">
                  {result.findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="p-3.5 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{finding.title}</span>
                        <Badge variant={finding.severity === "critical" ? "danger" : "diagnostic"}>
                          {finding.severity.toUpperCase()} · {finding.category.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        <strong>Evidence:</strong> {finding.evidence}
                      </p>
                      <p className="text-xs text-[var(--text-primary)]">
                        <strong>Fix:</strong> {finding.recommendation}
                      </p>
                      <div className="text-xs font-mono text-[var(--text-secondary)]">
                        Updated section: {finding.changedSection}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-[var(--separator-subtle)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Optimized Specification
                  </div>
                  <Tabs
                    ariaLabel="Output view mode"
                    value={outputView}
                    onValueChange={setOutputView}
                    options={[
                      { value: "optimized", label: "Optimized" },
                      { value: "diff", label: "Before / After Diff" },
                    ]}
                  />
                </div>

                {outputView === "diff" ? (
                  <div
                    aria-label="Prompt diff comparison"
                    className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] font-mono text-xs leading-relaxed overflow-x-auto space-y-0.5"
                  >
                    {diffLines.map((entry, idx) => (
                      <div
                        key={`${entry.type}-${idx}`}
                        className={`px-2 py-0.5 rounded whitespace-pre-wrap break-words ${
                          entry.type === "added"
                            ? "bg-[var(--success-subtle-bg)] text-[var(--success-text)]"
                            : entry.type === "removed"
                              ? "bg-[var(--danger-bg)] text-[var(--danger-text)] line-through opacity-85"
                              : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <span className="select-none mr-2 opacity-70">
                          {entry.type === "added" ? "+" : entry.type === "removed" ? "-" : " "}
                        </span>
                        {entry.line || " "}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] overflow-x-auto">
                    <SanitizedPromptRenderer content={result.optimizedPrompt} />
                  </div>
                )}

                {/* Action & Dispatch Bar */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="solid"
                      size="sm"
                      onClick={() => handleCopy(result.optimizedPrompt)}
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </Button>

                    <AuthGate
                      reason="save_prompt"
                      onSafeReplay={() => saveMutation.mutate()}
                      onAuthenticatedAction={() => saveMutation.mutate()}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={saveMutation.isPending || isSaved}
                        aria-pressed={isSaved}
                      >
                        <Bookmark
                          className={`w-3.5 h-3.5 text-[var(--accent-text)] ${isSaved ? "fill-current" : ""}`}
                          fill={isSaved ? "currentColor" : "none"}
                        />
                        <span>
                          {saveMutation.isPending
                            ? "Saving..."
                            : isSaved
                              ? "Saved"
                              : "Save to Library"}
                        </span>
                      </Button>
                    </AuthGate>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!requireAuth()) return;
                        setOriginalPrompt(result.optimizedPrompt);
                        setValidationError(null);
                        setMobilePane("input");
                        toast({
                          title: "Loaded into input",
                          description: "You can now run another optimization or autopsy pass.",
                        });
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-run on Optimized</span>
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!requireAuth()) return;
                        composerActions.updateActiveDraft({ rawInput: result.optimizedPrompt });
                        toast({
                          title: "Accepted into Composer",
                          description: "Loaded optimized prompt into your active workspace.",
                        });
                        navigate("/compile");
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept into Composer</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!requireAuth()) return;
                        dispatchPrompt("chatgpt", result.optimizedPrompt);
                      }}
                    >
                      <span>ChatGPT</span>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!requireAuth()) return;
                        dispatchPrompt("claude", result.optimizedPrompt);
                      }}
                    >
                      <span>Claude</span>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!requireAuth()) return;
                        dispatchPrompt("gemini", result.optimizedPrompt);
                      }}
                    >
                      <span>Gemini</span>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
