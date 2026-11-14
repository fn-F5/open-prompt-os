import type { ReverseEngineerImageMime, ReverseEngineerOutput } from "@open-prompt-os/contracts";
import { Badge, Button, Tabs, Textarea, toast } from "@open-prompt-os/ui-web";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, ImagePlus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { copyTextToClipboard } from "../lib/dispatch.js";
import { orpcClient } from "../lib/orpc.js";
import { composerActions } from "../state/composer-store.js";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIMES = new Set<ReverseEngineerImageMime>(["image/png", "image/jpeg", "image/webp"]);
const SAFE_DATA_URL_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_THUMBNAIL_DATA_URL_LENGTH = 150_000;

function isAllowedMime(type: string): type is ReverseEngineerImageMime {
  return ALLOWED_MIMES.has(type as ReverseEngineerImageMime);
}

async function createThumbnailDataUrl(dataUrl: string): Promise<string | undefined> {
  if (dataUrl.length <= 120_000 && SAFE_DATA_URL_REGEX.test(dataUrl)) {
    return dataUrl;
  }
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return undefined;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const thumb = canvas.toDataURL("image/jpeg", 0.72);
        resolve(
          thumb.length <= MAX_THUMBNAIL_DATA_URL_LENGTH && SAFE_DATA_URL_REGEX.test(thumb)
            ? thumb
            : undefined,
        );
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

export function ReverseEngineerPage() {
  const navigate = useNavigate();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [targetMode, setTargetMode] = React.useState<"image" | "video">("image");
  const [focusNotes, setFocusNotes] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<{
    name: string;
    mimeType: ReverseEngineerImageMime;
    base64: string;
    previewUrl: string;
    thumbnailDataUrl?: string;
  } | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReverseEngineerOutput | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("Upload an image before running analysis.");
      }
      return orpcClient.prompts.reverseEngineer({
        imageBase64: selectedFile.base64,
        mimeType: selectedFile.mimeType,
        targetMode,
        focusNotes: focusNotes.trim() || undefined,
        previewImageDataUrl: selectedFile.thumbnailDataUrl,
      });
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err) => {
      setValidationError(err instanceof Error ? err.message : "Reverse engineering failed.");
    },
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setValidationError(null);
    if (!isAllowedMime(file.type)) {
      setValidationError("Unsupported file type. Upload a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setValidationError("Image exceeds the 4 MB maximum file size.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex === -1) {
        setValidationError("Could not read image data.");
        return;
      }
      const base64 = dataUrl.slice(commaIndex + 1);
      const thumbnailDataUrl = await createThumbnailDataUrl(dataUrl);
      setSelectedFile({
        name: file.name,
        mimeType: file.type as ReverseEngineerImageMime,
        base64,
        previewUrl: dataUrl,
        thumbnailDataUrl,
      });
    };
    reader.onerror = () => {
      setValidationError("Failed to read the selected image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleRun = () => {
    if (!selectedFile) {
      setValidationError("Upload a reference image (PNG, JPEG, or WebP) first.");
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  const breakdownCards = result
    ? [
        { label: "Subject", value: result.breakdown.subject },
        { label: "Style & Medium", value: result.breakdown.styleAndMedium },
        { label: "Lighting & Color", value: result.breakdown.lightingAndColor },
        { label: "Camera & Composition", value: result.breakdown.cameraAndComposition },
        { label: "Mood & Atmosphere", value: result.breakdown.moodAndAtmosphere },
        { label: "Negative Guardrails", value: result.breakdown.negativePrompt },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <Badge variant="framework">Vision Extractor</Badge>
            <span className="text-xs text-[var(--text-secondary)]">
              Image-to-Prompt Reconstruction
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Reverse Engineer</h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Upload any reference image to extract lighting, lens, style, and a reusable prompt.
          </p>
        </div>

        <Tabs
          ariaLabel="Target modality"
          value={targetMode}
          onValueChange={setTargetMode}
          options={[
            { value: "image", label: "Image Prompt" },
            { value: "video", label: "Video Motion Prompt" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section
          aria-label="Reference image upload"
          className="rounded-xl p-5 flat-surface space-y-4"
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
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
              aria-label="Upload reference image"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {selectedFile ? (
              <div className="space-y-3">
                <img
                  src={selectedFile.previewUrl}
                  alt={selectedFile.name}
                  className="max-h-64 mx-auto rounded-lg object-contain border border-[var(--separator-subtle)]"
                />
                <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span className="truncate max-w-[220px] font-medium text-[var(--text-primary)]">
                    {selectedFile.name}
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
                <ImagePlus className="w-8 h-8 mx-auto text-[var(--accent-text)] opacity-80" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Drop a PNG, JPEG, or WebP image here
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">Maximum file size: 4 MB</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Choose Image
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reverse-engineer-focus"
              className="text-xs font-semibold uppercase tracking-wider"
            >
              Focus Notes (Optional)
            </label>
            <Textarea
              id="reverse-engineer-focus"
              value={focusNotes}
              onChange={(e) => setFocusNotes(e.target.value)}
              placeholder="e.g. Emphasize lens focal length, film stock, or color grading..."
              className="min-h-[84px] bg-[var(--surface-2)]"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--separator-subtle)]">
            <span className="text-xs text-[var(--text-secondary)]">
              {result?.remainingDailyRuns !== null && result?.remainingDailyRuns !== undefined
                ? `${result.remainingDailyRuns} reverse-engineer run(s) left today`
                : "Extracts structured [Variable] slots"}
            </span>
            <Button variant="primary-inverse" onClick={handleRun} disabled={mutation.isPending}>
              <Sparkles className="w-4 h-4" />
              <span>{mutation.isPending ? "Analyzing Image..." : "Reverse Engineer Image"}</span>
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

        <section
          aria-label="Visual breakdown and reconstructed prompt"
          className="rounded-xl p-5 flat-surface space-y-5"
        >
          {!result ? (
            <div className="py-12 text-center space-y-2 text-[var(--text-secondary)]">
              <Sparkles className="w-8 h-8 mx-auto opacity-60" />
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Ready to Reconstruct Prompt
              </div>
              <p className="text-xs max-w-sm mx-auto">
                Upload a reference image on the left to inspect its visual anatomy and generate a
                customizable prompt draft.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="framework">6-Axis Visual Breakdown</Badge>
                <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
                  {result.providerId}/{result.modelId} · {result.latencyMs}ms
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {breakdownCards.map((card) => (
                  <div
                    key={card.label}
                    className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-1"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {card.label}
                    </div>
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-3 border-t border-[var(--separator-subtle)]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Reconstructed Prompt
                </div>
                <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)]">
                  <SanitizedPromptRenderer content={result.reconstructedPrompt} />
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Button
                    variant="solid"
                    size="sm"
                    onClick={async () => {
                      const ok = await copyTextToClipboard(result.reconstructedPrompt);
                      if (ok) toast({ title: "Copied reconstructed prompt" });
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Prompt</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      composerActions.applyTemplateDraft(result.suggestedDraft);
                      toast({
                        title: "Loaded into Composer",
                        description: `Switched Composer to ${result.suggestedDraft.mode} mode.`,
                      });
                      navigate("/");
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
    </div>
  );
}
