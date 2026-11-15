import type { ComposerMode, ModelOption } from "@open-prompt-os/contracts";
import { Button } from "@open-prompt-os/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Cpu } from "lucide-react";
import * as React from "react";
import { orpcClient } from "../../lib/orpc.js";
import { queryKeys } from "../../lib/query-client.js";

export interface ModelPickerProps {
  readonly mode: ComposerMode;
  readonly selectedModelId: string | null;
  readonly onSelectModel: (modelId: string) => void;
  readonly disabled?: boolean;
}

interface ProviderMarkSpec {
  readonly paths: readonly string[];
  readonly stroked?: boolean;
  readonly fillRule?: "evenodd" | "nonzero";
}

const PROVIDER_MARKS: Record<string, ProviderMarkSpec> = {
  openai: {
    paths: [
      "M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z",
    ],
  },
  google: {
    paths: [
      "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
    ],
  },
  anthropic: {
    paths: [
      "M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.369-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z",
    ],
  },
  alibaba: {
    paths: [
      "M17.33 6.2H14.5v2.2h2.83c1.23 0 2.23 1 2.23 2.23v2.74c0 1.23-1 2.23-2.23 2.23H15.4v2.2h1.93c2.44 0 4.43-1.99 4.43-4.43v-2.74c0-2.44-1.99-4.43-4.43-4.43ZM6.67 6.2C4.23 6.2 2.24 8.19 2.24 10.63v2.74c0 2.44 1.99 4.43 4.43 4.43H8.6v-2.2H6.67c-1.23 0-2.23-1-2.23-2.23v-2.74c0-1.23 1-2.23 2.23-2.23H9.5V6.2H6.67ZM9.1 10.9h5.8v2.2H9.1v-2.2Z",
    ],
  },
  minimax: {
    paths: [
      "M2.4 9.6a1.1 1.1 0 0 1 2.2 0v4.8a1.1 1.1 0 0 1-2.2 0V9.6ZM6.65 5.6a1.1 1.1 0 0 1 2.2 0v12.8a1.1 1.1 0 0 1-2.2 0V5.6ZM10.9 8.1a1.1 1.1 0 0 1 2.2 0v7.8a1.1 1.1 0 0 1-2.2 0V8.1ZM15.15 5.6a1.1 1.1 0 0 1 2.2 0v12.8a1.1 1.1 0 0 1-2.2 0V5.6ZM19.4 9.6a1.1 1.1 0 0 1 2.2 0v4.8a1.1 1.1 0 0 1-2.2 0V9.6Z",
    ],
  },
  xai: {
    paths: [
      "M15.4 3h3.2L8.6 21H5.4L15.4 3ZM4.2 5.4h3.3l3.6 5.2-1.7 2.8L4.2 5.4ZM16.4 10.6l3-4.6V21h-3V10.6Z",
    ],
  },
  deepseek: {
    fillRule: "evenodd",
    paths: [
      "M21.2 12.4c0-4.2-3.4-7.4-7.9-7.4-3.2 0-6 1.9-7.2 4.8-.6-.3-1.4-.5-2.2-.3-.9.2-1.6.9-1.9 1.7.8.4 1.5 1.1 1.8 1.9-.6.5-1.2 1-1.8 1.2.8.9 2.1 1.3 3.4 1.2 1.2 2.7 4 4.5 7.4 4.5 4.7 0 8.4-3.4 8.4-7.6Zm-5.1-.1a1.15 1.15 0 1 1 0-2.3 1.15 1.15 0 0 1 0 2.3Z",
    ],
  },
  midjourney: {
    stroked: true,
    paths: [
      "M11.5 3.5v11.5H4.2L11.5 3.5Z",
      "M13.5 5.5l5.8 9.5h-5.8V5.5Z",
      "M3.5 17.2c2.2 1.6 5.1 2.3 8.5 2.3s6.3-.7 8.5-2.3",
      "M3 20.5c1.8-1 3.6-1 5.4 0s3.6 1 5.4 0 3.6-1 5.4 0",
    ],
  },
  adobe: {
    paths: [
      "M14.86 3H22.5v18L14.86 3ZM9.14 3H1.5v18L9.14 3ZM12 9.65l5.18 11.35h-3.4l-1.54-3.6H8.8L12 9.65Z",
    ],
  },
  "black forest labs": {
    paths: ["M12 2.5 5.2 11h3.8L3.8 18h16.4l-5.2-7h3.8L12 2.5Zm-1.5 16h3v3h-3v-3Z"],
  },
  bytedance: {
    paths: [
      "M3.6 8.5 6.4 7.5v8l-2.8 1v-8Zm4.7 2.5 2.8-1v7l-2.8 1v-7Zm4.7-4 2.8-1v9.5l-2.8 1V7Zm4.6-2.5 2.8-1V18l-2.8 1V4.5Z",
    ],
  },
  runway: {
    paths: [
      "M5 19.5V9.8C5 6.6 7.4 4.5 10.8 4.5H18v3.6h-6.6c-1.5 0-2.5.9-2.5 2.4v9H5Zm11.5-2.2a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z",
    ],
  },
};

function resolveProviderMark(model: ModelOption): ProviderMarkSpec | undefined {
  const normalized = model.providerName.toLowerCase().trim();
  if (normalized === "black forest") return PROVIDER_MARKS["black forest labs"];
  return PROVIDER_MARKS[normalized];
}

function ProviderLogo({ model }: { readonly model: ModelOption }) {
  const spec = resolveProviderMark(model);
  if (!spec) {
    return <Cpu className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4 shrink-0"
      aria-hidden="true"
      fill={spec.stroked ? "none" : "currentColor"}
      stroke={spec.stroked ? "currentColor" : "none"}
      strokeWidth={spec.stroked ? 1.7 : undefined}
      strokeLinecap={spec.stroked ? "round" : undefined}
      strokeLinejoin={spec.stroked ? "round" : undefined}
    >
      {spec.paths.map((d) => (
        <path key={d} d={d} fillRule={spec.fillRule} clipRule={spec.fillRule} />
      ))}
    </svg>
  );
}

export function ModelPicker({
  mode,
  selectedModelId,
  onSelectModel,
  disabled = false,
}: ModelPickerProps) {
  const reactId = React.useId();
  const sanitizedId = reactId.replace(/:/g, "");
  const listboxId = `model-picker-listbox-${sanitizedId}`;
  const anchorName = `--model-picker-${sanitizedId}`;

  const [open, setOpen] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const [fallbackPosition, setFallbackPosition] = React.useState<React.CSSProperties | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndexRef = React.useRef<number | null>(null);

  const supportsPopover =
    typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
  const supportsAnchorPositioning =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("position-anchor: --a") &&
    CSS.supports("position-area: block-end span-inline-end") &&
    CSS.supports("position-try-fallbacks: flip-block");

  const modelsQuery = useQuery({
    queryKey: queryKeys.models.available(mode),
    queryFn: () => orpcClient.models.listProviders({ mode }),
  });

  const models = modelsQuery.data ?? [];
  const activeModel: ModelOption | undefined =
    models.find((m) => m.id === selectedModelId) ?? models[0];
  const selectedIndex = Math.max(
    0,
    models.findIndex((m) => m.id === activeModel?.id),
  );

  React.useEffect(() => {
    if (models.length > 0 && (!selectedModelId || !models.some((m) => m.id === selectedModelId))) {
      const firstAvailable = models[0];
      if (firstAvailable) {
        onSelectModel(firstAvailable.id);
      }
    }
  }, [models, selectedModelId, onSelectModel]);

  const updateFallbackPosition = React.useCallback(() => {
    if (supportsAnchorPositioning || typeof window === "undefined") {
      setFallbackPosition(null);
      return;
    }
    if (window.innerWidth < 640) {
      setFallbackPosition(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const panelWidth = 384;
    const gap = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flipAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
    const clampedLeft = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));

    setFallbackPosition(
      flipAbove
        ? {
            left: `${clampedLeft}px`,
            bottom: `${window.innerHeight - rect.top + gap}px`,
            top: "auto",
          }
        : {
            left: `${clampedLeft}px`,
            top: `${rect.bottom + gap}px`,
            bottom: "auto",
          },
    );
  }, [supportsAnchorPositioning]);

  const openPicker = React.useCallback(
    (target: "selected" | "first" | "last" = "selected") => {
      if (models.length === 0) return;
      const targetIndex =
        target === "first" ? 0 : target === "last" ? models.length - 1 : selectedIndex;
      setFocusedIndex(targetIndex);
      pendingFocusIndexRef.current = targetIndex;

      if (supportsPopover) {
        const popoverEl = popoverRef.current as
          | (HTMLDivElement & { showPopover?: () => void })
          | null;
        if (popoverEl && typeof popoverEl.showPopover === "function") {
          try {
            popoverEl.showPopover();
            return;
          } catch {
            // Fall through if popover is already open or unsupported in environment
          }
        }
      }
      setOpen(true);
      updateFallbackPosition();
    },
    [models.length, selectedIndex, supportsPopover, updateFallbackPosition],
  );

  const closePicker = React.useCallback(
    (returnFocus = false) => {
      if (supportsPopover) {
        const popoverEl = popoverRef.current as
          | (HTMLDivElement & { hidePopover?: () => void })
          | null;
        if (popoverEl && typeof popoverEl.hidePopover === "function") {
          try {
            popoverEl.hidePopover();
          } catch {
            setOpen(false);
          }
        } else {
          setOpen(false);
        }
      } else {
        setOpen(false);
      }
      if (returnFocus) {
        triggerRef.current?.focus();
      }
    },
    [supportsPopover],
  );

  React.useEffect(() => {
    if (open && pendingFocusIndexRef.current !== null) {
      const idx = pendingFocusIndexRef.current;
      pendingFocusIndexRef.current = null;
      optionRefs.current[idx]?.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || supportsAnchorPositioning) return;
    updateFallbackPosition();
    window.addEventListener("resize", updateFallbackPosition);
    window.addEventListener("scroll", updateFallbackPosition, true);
    return () => {
      window.removeEventListener("resize", updateFallbackPosition);
      window.removeEventListener("scroll", updateFallbackPosition, true);
    };
  }, [open, supportsAnchorPositioning, updateFallbackPosition]);

  // Light-dismiss and Escape fallback for environments without native Popover API (e.g. jsdom)
  React.useEffect(() => {
    if (!open || supportsPopover) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closePicker(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker(true);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, supportsPopover, closePicker]);

  const moveFocus = (nextIndex: number) => {
    if (models.length === 0) return;
    const bounded = ((nextIndex % models.length) + models.length) % models.length;
    setFocusedIndex(bounded);
    optionRefs.current[bounded]?.focus();
  };

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(focusedIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(focusedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(models.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closePicker(true);
        break;
      case "Tab":
        closePicker(false);
        break;
    }
  };

  if (modelsQuery.isPending) {
    return (
      <div
        aria-busy="true"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-2)] text-sm text-[var(--text-secondary)]"
      >
        <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
        <span>Loading models...</span>
      </div>
    );
  }

  if (modelsQuery.isError || models.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-2)] text-sm text-[var(--text-secondary)]">
        <Cpu className="w-4 h-4 text-[var(--accent-text)]" />
        <span>Smart Model Router</span>
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label="Target AI model"
        style={{ anchorName } as React.CSSProperties}
        onClick={() => {
          if (open) {
            closePicker(false);
          } else {
            openPicker("selected");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openPicker(selectedIndex >= 0 ? "selected" : "first");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openPicker(selectedIndex >= 0 ? "selected" : "last");
          }
        }}
        className="min-h-[44px] inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] text-sm font-medium focus-ring cursor-pointer disabled:opacity-40"
      >
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-lg bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)]"
        >
          {activeModel ? (
            <ProviderLogo model={activeModel} />
          ) : (
            <Cpu className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </span>
        <span>{activeModel?.name ?? "Select model"}</span>
        <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
      </button>

      <div
        ref={popoverRef}
        popover="auto"
        hidden={!supportsPopover && !open}
        onToggle={(e) => {
          const isNowOpen = (e.nativeEvent as ToggleEvent).newState === "open";
          setOpen(isNowOpen);
          if (isNowOpen) {
            updateFallbackPosition();
          }
        }}
        style={
          {
            positionAnchor: anchorName,
            ...(fallbackPosition ?? {}),
          } as React.CSSProperties
        }
        className="model-picker-popover rounded-t-2xl sm:rounded-2xl p-4 glass-surface shadow-2xl overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--separator-subtle)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {mode === "text"
              ? "Text Model Providers"
              : mode === "image"
                ? "Image Model Providers"
                : "Video Model Providers"}
          </span>
          <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => closePicker(true)}>
            Done
          </Button>
        </div>
        <div
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: custom option layout requires custom listbox/option rather than native <select>
          role="listbox"
          tabIndex={-1}
          aria-label="Compatible AI models"
          onKeyDown={handleListboxKeyDown}
          className="space-y-1"
        >
          {models.map((model, index) => {
            const isSelected = model.id === activeModel?.id;
            return (
              <button
                key={model.id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: option item inside custom listbox
                role="option"
                tabIndex={index === focusedIndex ? 0 : -1}
                aria-selected={isSelected}
                onFocus={() => setFocusedIndex(index)}
                onClick={() => {
                  onSelectModel(model.id);
                  closePicker(true);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors focus-ring cursor-pointer flex items-center gap-2.5 ${
                  isSelected
                    ? "bg-[var(--accent-subtle-bg)] border border-[var(--accent-primary)] text-[var(--text-primary)]"
                    : "hover:bg-[var(--surface-2)] text-[var(--text-primary)] border border-transparent"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-lg ${
                    isSelected
                      ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                      : "bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                  }`}
                >
                  <ProviderLogo model={model} />
                </span>
                <span className="text-sm font-medium">{model.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
