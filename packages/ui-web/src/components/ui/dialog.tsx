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
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent border-0 p-0 text-[var(--text-primary)] backdrop:bg-black/75"
      {...closedByProps}
    >
      {open ? (
        <div
          className={`w-full rounded-xl p-6 text-[var(--text-primary)] ${surfaceClass} ${className}`}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
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
              className="min-h-[36px] min-w-[36px] rounded-md text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] focus-ring"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
