import type { ComposerMode, ModelOption } from "@open-prompt-os/contracts";
import { Badge, Button } from "@open-prompt-os/ui-web";
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
          className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)] font-mono text-xs font-bold"
        >
          {activeModel?.glyph ?? "M"}
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
            Target AI Model ({mode})
          </span>
          <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => closePicker(true)}>
            Done
          </Button>
        </div>
        <div
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: rich multi-badge model cards require custom listbox/option rather than native <select>
          role="listbox"
          tabIndex={-1}
          aria-label="Compatible AI models"
          onKeyDown={handleListboxKeyDown}
          className="space-y-1.5"
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
                // biome-ignore lint/a11y/useSemanticElements: rich option card inside custom listbox
                role="option"
                tabIndex={index === focusedIndex ? 0 : -1}
                aria-selected={isSelected}
                onFocus={() => setFocusedIndex(index)}
                onClick={() => {
                  onSelectModel(model.id);
                  closePicker(true);
                }}
                className={`w-full text-left p-3 rounded-xl transition-colors focus-ring cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent-subtle-bg)] border border-[var(--accent-primary)] text-[var(--text-primary)]"
                    : "hover:bg-[var(--surface-2)] text-[var(--text-primary)] border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-mono text-xs font-bold ${
                        isSelected
                          ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                          : "bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)]"
                      }`}
                    >
                      {model.glyph}
                    </span>
                    <span className="text-sm font-semibold">{model.name}</span>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                    {model.latencyLabel}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {model.providerName} ·
                  </span>
                  {model.capabilities.map((cap) => (
                    <Badge key={cap} variant="neutral" className="text-xs py-0.5">
                      {cap}
                    </Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
