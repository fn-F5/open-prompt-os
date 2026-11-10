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
  const [open, setOpen] = React.useState(false);

  const modelsQuery = useQuery({
    queryKey: queryKeys.models.available(mode),
    queryFn: () => orpcClient.models.listProviders({ mode }),
  });

  const models = modelsQuery.data ?? [];
  const activeModel: ModelOption | undefined =
    models.find((m) => m.id === selectedModelId) ?? models[0];

  React.useEffect(() => {
    if (models.length > 0 && (!selectedModelId || !models.some((m) => m.id === selectedModelId))) {
      const firstAvailable = models[0];
      if (firstAvailable) {
        onSelectModel(firstAvailable.id);
      }
    }
  }, [models, selectedModelId, onSelectModel]);

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
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Target AI model"
        onClick={() => setOpen((o) => !o)}
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

      {open ? (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            aria-label="Compatible AI models"
            className="fixed bottom-0 left-0 right-0 z-50 sm:absolute sm:bottom-auto sm:top-full sm:left-0 sm:right-auto sm:mt-2 sm:w-96 rounded-t-2xl sm:rounded-2xl p-4 glass-surface shadow-2xl max-h-[75dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--separator-subtle)]">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Target AI Model ({mode})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="sm:hidden"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
            <div className="space-y-1.5">
              {models.map((model) => {
                const isSelected = model.id === activeModel?.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectModel(model.id);
                      setOpen(false);
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
        </>
      ) : null}
    </div>
  );
}
