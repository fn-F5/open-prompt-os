import * as React from "react";

export type ToastTone = "neutral" | "error";

export interface ToastItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

type ToastListener = (toasts: readonly ToastItem[]) => void;

let activeToasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  for (const listener of listeners) {
    listener(activeToasts);
  }
}

export function toast(input: Omit<ToastItem, "id">): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item: ToastItem = { tone: "neutral", ...input, id };
  activeToasts = [...activeToasts, item];
  notify();

  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      dismissToast(id);
    }, 4500);
  }
  return id;
}

export function dismissToast(id: string): void {
  activeToasts = activeToasts.filter((t) => t.id !== id);
  notify();
}

export function clearToasts(): void {
  activeToasts = [];
  notify();
}

export function ToastViewport() {
  const [items, setItems] = React.useState<readonly ToastItem[]>(activeToasts);

  React.useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {items.map((item) => {
        const isError = item.tone === "error";
        return (
          <output
            key={item.id}
            role={isError ? "alert" : "status"}
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg p-3.5 text-xs sm:text-sm border ${
              isError
                ? "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-text)]/40"
                : "bg-[var(--surface-1)] text-[var(--text-primary)] border-[var(--separator-subtle)]"
            }`}
          >
            <div className="flex-1">
              <div className="font-medium">{item.title}</div>
              {item.description ? (
                <div className="mt-1 text-xs opacity-85">{item.description}</div>
              ) : null}
              {item.actionLabel && item.onAction ? (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    dismissToast(item.id);
                  }}
                  className="mt-2 inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-[var(--surface-inverse)] text-[var(--text-inverse)] focus-ring"
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(item.id)}
              className="text-xs opacity-70 hover:opacity-100 px-1.5 py-0.5 rounded focus-ring"
            >
              ✕
            </button>
          </output>
        );
      })}
    </section>
  );
}
