import {
  VIDEO_REVERSE_ENGINEER_LIMITS,
  type VideoGeneratorTarget,
  type VideoReverseEngineerMime,
  type VideoReverseEngineerOutput,
} from "@open-prompt-os/contracts";
import { parsePublicVideoUrl } from "@open-prompt-os/core";
import { Badge, Button, Tabs, Textarea, toast } from "@open-prompt-os/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Film,
  Link2,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { useCardHoverAnimation } from "../../hooks/use-card-parallax.js";
import { copyTextToClipboard } from "../../lib/dispatch.js";
import { OrpcClientError, orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";
import { trackEvent } from "../../lib/telemetry.js";
import { extractShotThumbnails, parseTimecodeToSeconds } from "../../lib/video-thumbnails.js";
import { openAuthDialog } from "../../state/auth-dialog-store.js";
import { composerActions } from "../../state/composer-store.js";
import { AuthGate } from "../auth/auth-gate.js";
import { SanitizedPromptRenderer } from "../output/output-card.js";

const MAX_TRIM_START_FALLBACK = 3600;

const ALLOWED_VIDEO_MIMES = new Set<VideoReverseEngineerMime>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const GENERATOR_OPTIONS: ReadonlyArray<{
  readonly id: VideoGeneratorTarget;
  readonly label: string;
}> = [
  { id: "veo", label: "Google Veo (Single-take + Audio)" },
  { id: "sora", label: "OpenAI Sora (Physics + Temporal)" },
  { id: "runway", label: "Runway Gen (Camera Controls)" },
  { id: "kling_wan", label: "Kling / Alibaba Wan" },
  { id: "general", label: "General Cinema Spec" },
];

export function VideoReverseEngineerPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const animateCard = useCardHoverAnimation();
  const { isAuthenticated } = useAuthSession();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const requireAuth = () => {
    if (!isAuthenticated) {
      openAuthDialog({ reason: "action_required", intendedRoute: location.pathname });
      return false;
    }
    return true;
  };

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: () => orpcClient.billing.status(),
    enabled: isAuthenticated,
  });

  const tier = !isAuthenticated
    ? "guest"
    : billingQuery.data?.plan === "pro"
      ? "pro"
      : billingQuery.data?.plan === "team"
        ? "team"
        : "free";
  const limits = VIDEO_REVERSE_ENGINEER_LIMITS[tier];
  const maxMb = Math.round(limits.maxBytes / (1024 * 1024));

  const [inputMode, setInputMode] = React.useState<"upload" | "youtube">("upload");
  const [selectedFile, setSelectedFile] = React.useState<{
    file: File;
    previewUrl: string;
    durationSec?: number;
  } | null>(null);
  const [youtubeUrl, setYoutubeUrl] = React.useState("");
  const [startOffsetSec, setStartOffsetSec] = React.useState("0");
  const [endOffsetSec, setEndOffsetSec] = React.useState(String(limits.maxDurationSec));
  const [targetGenerator, setTargetGenerator] = React.useState<VideoGeneratorTarget>("veo");
  const [focusNotes, setFocusNotes] = React.useState("");
  const [isDragging, setIsDragging] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [stageMessage, setStageMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<VideoReverseEngineerOutput | null>(null);
  const [shotThumbnails, setShotThumbnails] = React.useState<Record<number, string>>({});
  const [expandedShots, setExpandedShots] = React.useState<Record<number, boolean>>({ 1: true });
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [savedPromptKey, setSavedPromptKey] = React.useState<string | null>(null);

  const knownUploadDuration =
    inputMode === "upload" &&
    selectedFile?.durationSec !== undefined &&
    Number.isFinite(selectedFile.durationSec) &&
    selectedFile.durationSec > 0
      ? selectedFile.durationSec
      : undefined;
  const parsedStartNum = Number.parseFloat(startOffsetSec);
  const parsedStart = Number.isFinite(parsedStartNum) && parsedStartNum >= 0 ? parsedStartNum : 0;
  const maxAllowedStart =
    knownUploadDuration !== undefined
      ? Math.max(0, Math.floor(knownUploadDuration) - 1)
      : MAX_TRIM_START_FALLBACK;
  const maxAllowedEnd =
    knownUploadDuration !== undefined
      ? Math.min(Math.ceil(knownUploadDuration), parsedStart + limits.maxDurationSec)
      : parsedStart + limits.maxDurationSec;

  React.useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(selectedFile.previewUrl);
      }
    };
  }, [selectedFile]);

  const mutation = useMutation({
    mutationFn: async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const parsedStartVal = Number.parseFloat(startOffsetSec);
      const start = Number.isFinite(parsedStartVal) ? Math.max(0, parsedStartVal) : 0;
      const maxWindowEnd = start + limits.maxDurationSec;
      const durationCap =
        inputMode === "upload" && selectedFile?.durationSec ? selectedFile.durationSec : undefined;
      const defaultEnd =
        durationCap !== undefined ? Math.min(durationCap, maxWindowEnd) : maxWindowEnd;
      const parsedEnd = Number.parseFloat(endOffsetSec);
      const rawEnd = Number.isFinite(parsedEnd) ? parsedEnd : defaultEnd;
      const end =
        durationCap !== undefined
          ? Math.min(rawEnd, maxWindowEnd, durationCap)
          : Math.min(rawEnd, maxWindowEnd);

      if (inputMode === "upload") {
        if (!selectedFile) throw new Error("Upload an MP4, WebM, or MOV video first.");
        return {
          output: await orpcClient.prompts.reverseEngineerVideo(
            {
              sourceType: "upload",
              file: selectedFile.file,
              durationSeconds: selectedFile.durationSec,
              startOffsetSec: start,
              endOffsetSec: end,
              targetGenerator,
              focusNotes: focusNotes.trim() || undefined,
            },
            {
              signal: controller.signal,
              onStage: (_stage, msg) => setStageMessage(msg),
            },
          ),
          uploadedFile: selectedFile.file,
        };
      }

      return {
        output: await orpcClient.prompts.reverseEngineerVideo(
          {
            sourceType: "youtube",
            youtubeUrl: youtubeUrl.trim(),
            startOffsetSec: start,
            endOffsetSec: end,
            targetGenerator,
            focusNotes: focusNotes.trim() || undefined,
          },
          {
            signal: controller.signal,
            onStage: (_stage, msg) => setStageMessage(msg),
          },
        ),
        uploadedFile: null,
      };
    },
    onSuccess: async ({ output, uploadedFile }) => {
      setStageMessage(null);
      setResult(output);
      setExpandedShots({ 1: true });
      setShotThumbnails({});
      qc.invalidateQueries({ queryKey: queryKeys.billing.status() });
      if (uploadedFile) {
        const timestamps = output.shots.map((s) => parseTimecodeToSeconds(s.startTime));
        const thumbs = await extractShotThumbnails(uploadedFile, timestamps);
        setShotThumbnails(thumbs);
      }
    },
    onError: (err) => {
      setStageMessage(null);
      if (err instanceof OrpcClientError && err.code === "QUOTA_EXCEEDED") {
        if (!isAuthenticated) {
          setValidationError(null);
          openAuthDialog({ reason: "quota_limit" });
          return;
        }
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setValidationError(err instanceof Error ? err.message : "Video reverse engineering failed.");
    },
  });

  const currentSaveKey = result ? `${result.requestId}:${result.masterPrompt}` : null;
  const isSaved = Boolean(currentSaveKey && savedPromptKey === currentSaveKey);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No video prompt to save.");
      const key = `${result.requestId}:${result.masterPrompt}`;
      const rawInput =
        focusNotes.trim() ||
        (inputMode === "youtube" ? youtubeUrl.trim() : selectedFile?.file.name) ||
        "Reverse-Engineered Video Prompt";
      await orpcClient.prompts.save({
        title: rawInput.slice(0, 80),
        rawInput: rawInput.slice(0, 8000),
        compiledPrompt: result.masterPrompt.trim().slice(0, 16000),
        mode: "video",
        framework: "costar",
        modelId: result.suggestedDraft.modelId || "google-video",
        category: "Motion",
        tags: ["video", "reverse-engineer", result.targetGenerator],
      });
      return key;
    },
    onSuccess: (key) => {
      setSavedPromptKey(key);
      trackEvent("prompt_saved", { mode: "video" });
      qc.invalidateQueries({ queryKey: queryKeys.prompts.all });
      toast({
        title: "Saved to My Library",
        description: "Your reverse-engineered video prompt is saved in your workspace.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not save prompt",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const handleVideoFile = (file: File | undefined) => {
    if (!file) return;
    setValidationError(null);
    if (!ALLOWED_VIDEO_MIMES.has(file.type as VideoReverseEngineerMime)) {
      setValidationError("Unsupported video format. Upload an MP4, WebM, or MOV clip.");
      return;
    }
    if (file.size > limits.maxBytes) {
      setValidationError(`Video exceeds the ${maxMb} MB limit for your current plan.`);
      return;
    }

    const previewUrl =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : "";
    setSelectedFile({ file, previewUrl });
  };

  const handleRun = () => {
    if (!requireAuth()) return;
    const start = Number.parseFloat(startOffsetSec);
    const end = endOffsetSec.trim() ? Number.parseFloat(endOffsetSec) : undefined;

    if (!Number.isFinite(start) || start < 0) {
      setValidationError("Start time must be 0 or greater.");
      return;
    }
    if (end !== undefined && (!Number.isFinite(end) || end <= start)) {
      setValidationError("End time must be greater than start time.");
      return;
    }
    if (end !== undefined && end - start > limits.maxDurationSec) {
      setValidationError(
        `Selected segment exceeds the ${limits.maxDurationSec}s limit. Trim Start/End within ${limits.maxDurationSec}s.`,
      );
      return;
    }

    if (inputMode === "upload") {
      if (!selectedFile) {
        setValidationError("Upload an MP4, WebM, or MOV clip first.");
        return;
      }
      if (selectedFile.durationSec !== undefined) {
        if (start >= selectedFile.durationSec) {
          setValidationError(
            `Start time must be less than the video duration (${selectedFile.durationSec}s).`,
          );
          return;
        }
        if (end !== undefined && end > Math.ceil(selectedFile.durationSec)) {
          setValidationError(
            `End time cannot exceed the video duration (${selectedFile.durationSec}s).`,
          );
          return;
        }
      }
      const effectiveEnd = end ?? selectedFile.durationSec;
      if (effectiveEnd !== undefined && effectiveEnd - start > limits.maxDurationSec) {
        setValidationError(
          `Selected segment exceeds the ${limits.maxDurationSec}s limit. Trim Start/End within ${limits.maxDurationSec}s.`,
        );
        return;
      }
    } else {
      const check = parsePublicVideoUrl(youtubeUrl);
      if (!check.ok) {
        setValidationError(check.message);
        return;
      }
      const effectiveEnd = end ?? start + limits.maxDurationSec;
      if (effectiveEnd - start > limits.maxDurationSec) {
        setValidationError(
          `Selected YouTube segment exceeds the ${limits.maxDurationSec}s limit. Trim Start/End within ${limits.maxDurationSec}s.`,
        );
        return;
      }
    }

    setValidationError(null);
    setStageMessage("Connecting to video analyzer...");
    mutation.mutate();
  };

  const handleCopy = async (key: string, text: string, label = "Copied to clipboard") => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
      toast({ title: label });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Left Pane: Video Upload / YouTube URL + Trim + Target Generator */}
      <section
        aria-label="Reference video input"
        data-animate={animateCard("reverseEngineerInput")}
        className="rounded-xl p-5 flat-surface space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs
            ariaLabel="Video source type"
            value={inputMode}
            onValueChange={(next) => {
              setValidationError(null);
              setInputMode(next);
            }}
            options={[
              { value: "upload", label: "Upload Video" },
              { value: "youtube", label: "YouTube Link" },
            ]}
          />
          <span className="text-xs text-[var(--text-secondary)]">
            Max {limits.maxDurationSec}s · {maxMb} MB
          </span>
        </div>

        {inputMode === "upload" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleVideoFile(e.dataTransfer.files?.[0]);
            }}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? "border-[var(--accent-primary)] bg-[var(--accent-subtle-bg)]"
                : "border-[var(--separator-strong)] bg-[var(--surface-2)]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload reference video"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => handleVideoFile(e.target.files?.[0])}
            />

            {selectedFile ? (
              <div className="space-y-3">
                {selectedFile.previewUrl ? (
                  <video
                    src={selectedFile.previewUrl}
                    controls
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      const dur = Math.round(e.currentTarget.duration * 10) / 10;
                      if (Number.isFinite(dur) && dur > 0) {
                        setSelectedFile((prev) => (prev ? { ...prev, durationSec: dur } : prev));
                        const nextStart = parsedStart >= dur ? 0 : parsedStart;
                        if (nextStart !== parsedStart) {
                          setStartOffsetSec(String(nextStart));
                        }
                        setEndOffsetSec(
                          String(Math.min(Math.ceil(dur), nextStart + limits.maxDurationSec)),
                        );
                      }
                    }}
                    className="max-h-56 w-full mx-auto rounded-lg bg-black border border-[var(--separator-subtle)]"
                  />
                ) : null}
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span className="truncate max-w-[200px] font-medium text-[var(--text-primary)]">
                    {selectedFile.file.name}
                  </span>
                  <span>
                    {(selectedFile.file.size / (1024 * 1024)).toFixed(1)} MB
                    {selectedFile.durationSec ? ` · ${selectedFile.durationSec}s` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                <Upload className="w-8 h-8 mx-auto text-[var(--accent-text)] opacity-80" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Drop an MP4, WebM, or MOV clip here
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Up to {limits.maxDurationSec}s and {maxMb} MB · Deleted immediately after
                    analysis
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  Choose Video
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl p-4 bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
            <label
              htmlFor="video-re-youtube-url"
              className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5 text-[var(--accent-text)]" />
              <span>Public YouTube / Shorts URL</span>
            </label>
            <input
              id="video-re-youtube-url"
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or /shorts/..."
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
            />
            <p className="text-xs text-[var(--text-secondary)]">
              For longer YouTube videos, use Start/End trim below to select any{" "}
              {limits.maxDurationSec}s window. For TikTok/Instagram Reels, download the MP4 and use
              Upload Video.
            </p>
          </div>
        )}

        {/* Trim & Target Generator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="video-re-start"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              Start (sec)
            </label>
            <input
              id="video-re-start"
              type="number"
              min={0}
              max={maxAllowedStart}
              step={1}
              value={startOffsetSec}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setStartOffsetSec("");
                  return;
                }
                const num = Number.parseFloat(raw);
                if (!Number.isFinite(num)) return;
                const newStart = Math.max(0, Math.min(num, maxAllowedStart));
                setStartOffsetSec(String(newStart));

                const curEnd = Number.parseFloat(endOffsetSec);
                if (Number.isFinite(curEnd)) {
                  const maxUploadEnd =
                    knownUploadDuration !== undefined
                      ? Math.ceil(knownUploadDuration)
                      : newStart + limits.maxDurationSec;
                  if (curEnd > newStart + limits.maxDurationSec || curEnd <= newStart) {
                    setEndOffsetSec(
                      String(Math.min(newStart + limits.maxDurationSec, maxUploadEnd)),
                    );
                  }
                }
              }}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="video-re-end"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              End (sec)
            </label>
            <input
              id="video-re-end"
              type="number"
              min={parsedStart + 1}
              max={maxAllowedEnd}
              step={1}
              placeholder={`max ${maxAllowedEnd}s`}
              value={endOffsetSec}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setEndOffsetSec("");
                  return;
                }
                const num = Number.parseFloat(raw);
                if (!Number.isFinite(num)) return;
                if (num < 0) {
                  setEndOffsetSec("0");
                  return;
                }
                const clamped = Math.min(num, maxAllowedEnd);
                setEndOffsetSec(String(clamped));
              }}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
            />
            <p className="text-[11px] text-[var(--text-secondary)]">
              Max {maxAllowedEnd}s (up to {limits.maxDurationSec}s clip)
            </p>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="video-re-generator"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              Target Generator
            </label>
            <select
              id="video-re-generator"
              value={targetGenerator}
              onChange={(e) => setTargetGenerator(e.target.value as VideoGeneratorTarget)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] focus-ring"
            >
              {GENERATOR_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="video-re-focus"
            className="text-xs font-semibold uppercase tracking-wider"
          >
            Focus Notes (Optional)
          </label>
          <Textarea
            id="video-re-focus"
            value={focusNotes}
            onChange={(e) => setFocusNotes(e.target.value)}
            placeholder="e.g. Match the whip-pan transition and rim lighting, swap product to a matte black espresso machine..."
            className="min-h-[76px] bg-[var(--surface-2)]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--separator-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">
            {result?.remainingDailyRuns !== null && result?.remainingDailyRuns !== undefined
              ? `${result.remainingDailyRuns} reverse-engineer run(s) left today`
              : "Extracts Continuity Bible, shots & audio cues"}
          </span>

          <div className="flex items-center gap-2">
            {mutation.isPending ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  abortRef.current?.abort();
                  setStageMessage(null);
                }}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </Button>
            ) : null}
            <Button variant="primary-inverse" onClick={handleRun} disabled={mutation.isPending}>
              <Clapperboard className="w-4 h-4" />
              <span>{mutation.isPending ? "Analyzing Video..." : "Reverse Engineer Video"}</span>
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

      {/* Right Pane: Progress / Continuity Bible / Shot-by-Shot Storyboard / Master Prompt */}
      <section
        aria-label="Video storyboard and reconstructed prompt"
        data-animate={animateCard("reverseEngineerOutput")}
        className="rounded-xl p-5 flat-surface space-y-5"
      >
        {mutation.isPending ? (
          <div aria-busy="true" className="py-8 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {stageMessage ?? "Analyzing video frames, motion & audio (usually 15–45s)..."}
              </span>
            </div>
            <div className="space-y-3 animate-pulse">
              <div className="h-20 w-full rounded-lg bg-[var(--surface-2)]" />
              <div className="h-24 w-full rounded-lg bg-[var(--surface-2)]" />
              <div className="h-32 w-full rounded-xl bg-[var(--surface-2)]" />
            </div>
          </div>
        ) : !result ? (
          <div className="py-12 text-center space-y-2 text-[var(--text-secondary)]">
            <Film className="w-8 h-8 mx-auto opacity-60" />
            <div className="text-sm font-medium text-[var(--text-primary)]">
              Ready for Video Breakdown
            </div>
            <p className="text-xs max-w-sm mx-auto">
              Upload a video clip or paste a public YouTube link to extract a Continuity Bible,
              shot-by-shot camera choreography, audio cues, and a ready-to-run prompt.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="framework">
                  {result.shots.length} Shot{result.shots.length === 1 ? "" : "s"} ·{" "}
                  {result.overview.aspectRatio}
                </Badge>
                <span className="text-xs text-[var(--text-secondary)]">
                  {result.overview.pacingStyle}
                </span>
              </div>
              <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                {result.latencyMs}ms
              </span>
            </div>

            {/* Continuity Bible Summary */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Continuity Bible (Visual & Audio Locks)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { label: "Subject & Wardrobe", value: result.continuityBible.subjectAndWardrobe },
                  { label: "Environment & Set", value: result.continuityBible.environmentAndSet },
                  {
                    label: "Lighting & Color",
                    value: result.continuityBible.lightingAndColorGrade,
                  },
                  { label: "Lens & Optics", value: result.continuityBible.lensAndOpticalDna },
                  { label: "Audio & Music DNA", value: result.continuityBible.audioAndMusicDna },
                  {
                    label: "Negative Guardrails",
                    value: result.continuityBible.negativeGuardrails,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {item.label}
                    </div>
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Shot-by-Shot Storyboard (Estimated Timestamps) */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--separator-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Shot-by-Shot Storyboard
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Estimated timestamps
                </span>
              </div>

              <div className="space-y-2">
                {result.shots.map((shot, idx) => {
                  const isExpanded = Boolean(expandedShots[shot.shotNumber]);
                  const thumb = shotThumbnails[idx];
                  return (
                    <article
                      key={shot.shotNumber}
                      className="rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] overflow-hidden"
                    >
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedShots((prev) => ({
                            ...prev,
                            [shot.shotNumber]: !isExpanded,
                          }))
                        }
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={`Shot ${shot.shotNumber} keyframe`}
                              className="w-16 h-10 rounded object-cover shrink-0 border border-[var(--separator-subtle)]"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">
                              Shot {shot.shotNumber} · ~{shot.startTime}–{shot.endTime} (est.)
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] truncate">
                              {shot.transitionIn} · {shot.motionAndCamera}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
                        )}
                      </button>

                      {isExpanded ? (
                        <div className="px-3.5 pb-3.5 pt-2 border-t border-[var(--separator-subtle)] space-y-2.5 text-xs">
                          <div>
                            <div className="font-semibold text-[var(--text-secondary)] mb-0.5">
                              Motion & Camera
                            </div>
                            <p className="text-[var(--text-primary)]">{shot.motionAndCamera}</p>
                          </div>
                          {shot.audioCue ? (
                            <div>
                              <div className="font-semibold text-[var(--text-secondary)] mb-0.5">
                                Audio / Dialogue Cue
                              </div>
                              <p className="text-[var(--text-primary)]">{shot.audioCue}</p>
                            </div>
                          ) : null}
                          <div className="p-2.5 rounded bg-[var(--surface-1)] border border-[var(--separator-subtle)] space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--text-secondary)]">
                                First-Frame Image Prompt (I2V Anchor)
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleCopy(
                                    `ff-${shot.shotNumber}`,
                                    shot.firstFramePrompt,
                                    "Copied first-frame prompt",
                                  )
                                }
                              >
                                {copiedKey === `ff-${shot.shotNumber}` ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>Copy</span>
                              </Button>
                            </div>
                            <p className="text-[var(--text-primary)]">{shot.firstFramePrompt}</p>
                          </div>
                          <div className="p-2.5 rounded bg-[var(--surface-1)] border border-[var(--separator-subtle)] space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--text-secondary)]">
                                Shot Video Prompt
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleCopy(
                                    `sp-${shot.shotNumber}`,
                                    shot.shotPrompt,
                                    "Copied shot video prompt",
                                  )
                                }
                              >
                                {copiedKey === `sp-${shot.shotNumber}` ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>Copy</span>
                              </Button>
                            </div>
                            <p className="text-[var(--text-primary)] whitespace-pre-wrap">
                              {shot.shotPrompt}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Master Prompt */}
            <div className="space-y-2 pt-3 border-t border-[var(--separator-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Master Video Prompt
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Shot-by-shot recreation · Ready to paste
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] overflow-x-auto">
                <SanitizedPromptRenderer content={result.masterPrompt} />
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="solid"
                  size="sm"
                  onClick={() =>
                    handleCopy("master", result.masterPrompt, "Copied master video prompt")
                  }
                >
                  {copiedKey === "master" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy Master Prompt</span>
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
                      {saveMutation.isPending ? "Saving..." : isSaved ? "Saved" : "Save to Library"}
                    </span>
                  </Button>
                </AuthGate>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    composerActions.applyTemplateDraft(result.suggestedDraft);
                    toast({
                      title: "Loaded into Composer",
                      description: "Switched Composer to video mode.",
                    });
                    navigate("/compile");
                  }}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept into Composer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
