import { X } from "lucide-react";
import * as React from "react";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: "glass" | "solid";
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "glass",
  children,
  className = "",
}: DialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
      return;
    }

    if (dialog.open || dialog.hasAttribute("open")) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  const surfaceClass = variant === "glass" ? "glass-surface" : "flat-surface bg-[var(--surface-1)]";
  const closedByProps = { closedby: "any" } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={(e) => {
        // Fallback light dismiss for browsers without native closedby="any" support (and jsdom)
        if (!("closedBy" in e.currentTarget) && e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
      className="m-auto w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-[440px] max-h-[calc(100dvh-1.5rem)] bg-transparent border-0 p-0 text-[var(--text-primary)] backdrop:bg-black/75"
      {...closedByProps}
    >
      {open ? (
        <div
          className={`dialog-panel relative overflow-x-hidden overflow-y-auto max-h-[calc(100dvh-1.5rem)] w-full rounded-[22px] p-4 sm:p-6 text-[var(--text-primary)] ${surfaceClass} ${className}`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)]/70 to-transparent"
          />
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <div>
              <h2
                id={titleId}
                className="text-xl sm:text-2xl font-medium tracking-[-0.03em] text-[var(--text-primary)]"
              >
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-[var(--text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center shrink-0 w-9 h-9 min-w-[38px] min-h-[38px] rounded-xl bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] transition-colors focus-ring cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
