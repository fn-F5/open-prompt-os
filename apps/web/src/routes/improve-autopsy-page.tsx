import type { PromptLength, RefinePromptOutput } from "@open-prompt-os/contracts";
import { analyzePromptVariables } from "@open-prompt-os/core";
import { Badge, Button, Tabs, Textarea, toast } from "@open-prompt-os/ui-web";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Stethoscope,
  Wrench,
} from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { useAutoResizeTextarea } from "../hooks/use-auto-resize-textarea.js";
import { copyTextToClipboard, dispatchPrompt } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { composerActions } from "../state/composer-store.js";

export function ImproveAutopsyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const preload = (location.state as { preloadPrompt?: string } | null)?.preloadPrompt ?? "";

  const [mode, setMode] = React.useState<"improve" | "autopsy">("improve");
  const [originalPrompt, setOriginalPrompt] = React.useState(
    preload ||
      "Write a technical architecture doc for our payment service for [Target_Audience] using [Payment_Provider].",
  );
  const [failedOutput, setFailedOutput] = React.useState("");
  const [targetLength, setTargetLength] = React.useState<PromptLength>("balanced");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RefinePromptOutput | null>(null);
  const [mobilePane, setMobilePane] = React.useState<"input" | "diagnosis">("input");

  const promptRef = useAutoResizeTextarea(originalPrompt, { minHeightPx: 120, maxHeightPx: 280 });
  const failedRef = useAutoResizeTextarea(failedOutput, { minHeightPx: 100, maxHeightPx: 240 });

  const liveVarAnalysis = React.useMemo(
    () => analyzePromptVariables(originalPrompt),
    [originalPrompt],
  );

  const refineMutation = useMutation({
    mutationFn: async () => {
      return orpcClient.prompts.refine({
        originalPrompt,
        mode,
        failedOutput: mode === "autopsy" ? failedOutput : undefined,
        targetLength,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setMobilePane("diagnosis");
    },
  });

  const handleRun = () => {
    if (!originalPrompt.trim()) {
      setValidationError("Enter the original prompt to analyze.");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <Badge variant="framework">Diagnostic Engine</Badge>
            <span className="text-xs text-[var(--text-secondary)]">
              Structural Optimization & Root-Cause Autopsy
            </span>
          </div>
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

      {/* Mobile Step Switcher (Section 12.1, 21) */}
      <div className="lg:hidden">
        <Tabs
          ariaLabel="Workspace pane"
          value={mobilePane}
          onValueChange={setMobilePane}
          options={[
            { value: "input", label: "1. Input & Variables" },
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
          className={`rounded-xl p-5 flat-surface space-y-4 ${
            mobilePane === "diagnosis" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="autopsy-original-prompt" className="text-xs font-semibold uppercase tracking-wider">
                Original Prompt
              </label>
              <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                {liveVarAnalysis.detectedVariables.length} variable(s)
              </span>
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

          {/* Live Variable Inventory & Unresolved/Duplicate Flags (Section 12.3) */}
          <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-2">
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              Variable Inventory (parsed via <code className="font-mono">@open-prompt-os/core</code>)
            </div>
            {liveVarAnalysis.detectedVariables.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {liveVarAnalysis.detectedVariables.map((v) => (
                  <code
                    key={v}
                    className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                  >
                    [{v}]
                  </code>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                No <code className="font-mono">[Variable]</code> slots detected yet.
              </p>
            )}
            {liveVarAnalysis.duplicateVariables.length > 0 ? (
              <div className="text-xs text-[var(--text-primary)]">
                Duplicate tokens reused: {liveVarAnalysis.duplicateVariables.join(", ")}
              </div>
            ) : null}
            {liveVarAnalysis.unresolvedVariables.length > 0 ? (
              <div className="text-xs text-[var(--danger-text)] font-medium">
                Unresolved/placeholder variable warning:{" "}
                {liveVarAnalysis.unresolvedVariables.join(", ")}
              </div>
            ) : null}
          </div>

          {/* Failed Output Input for Autopsy Mode (Section 12.2) */}
          {mode === "autopsy" ? (
            <div className="space-y-1.5 rounded-xl p-3.5 bg-[var(--danger-bg)] border border-[var(--danger-text)]/30">
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
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--separator-subtle)]">
            <div className="flex items-center gap-2">
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

          {validationError ? (
            <div
              role="alert"
              className="rounded-lg p-3 text-xs bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/30"
            >
              {validationError}
            </div>
          ) : null}
        </section>

        {/* Right Pane: Diagnosis & Optimized Prompt (Section 12.4) */}
        <section
          aria-label="Diagnostic findings and optimized prompt"
          className={`rounded-xl p-5 flat-surface space-y-5 ${
            mobilePane === "input" ? "hidden lg:block" : "block"
          }`}
        >
          {!result ? (
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
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="framework">
                    {result.findings.length} Diagnostic Finding(s)
                  </Badge>
                  <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                    {result.providerId}/{result.modelId} · {result.latencyMs}ms
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
                        <Badge
                          variant={finding.severity === "critical" ? "danger" : "diagnostic"}
                        >
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

              <div className="space-y-2 pt-3 border-t border-[var(--separator-subtle)]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Optimized Specification
                </div>
                <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
                  <SanitizedPromptRenderer content={result.optimizedPrompt} />
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="solid"
                      size="sm"
                      onClick={async () => {
                        const ok = await copyTextToClipboard(result.optimizedPrompt);
                        if (ok) toast({ title: "Copied optimized prompt" });
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        composerActions.updateActiveDraft({ rawInput: result.optimizedPrompt });
                        toast({
                          title: "Accepted into Composer",
                          description: "Loaded optimized prompt into your active workspace.",
                        });
                        navigate("/");
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept into Composer</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => dispatchPrompt("chatgpt", result.optimizedPrompt)}
                  >
                    <span>Send to ChatGPT</span>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
