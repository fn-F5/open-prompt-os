import * as React from "react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

const HOVER_CLOSE_DELAY_MS = 150;

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const showTooltip = React.useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleCloseTooltip = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearCloseTimer();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, clearCloseTimer]);

  const trigger = React.isValidElement<{ "aria-describedby"?: string }>(children) ? (
    React.cloneElement(children, {
      "aria-describedby": open
        ? [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
        : children.props["aria-describedby"],
    })
  ) : (
    <span aria-describedby={open ? tooltipId : undefined}>{children}</span>
  );

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={showTooltip}
      onMouseLeave={scheduleCloseTooltip}
      onFocus={showTooltip}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearCloseTimer();
          setOpen(false);
        }
      }}
    >
      {trigger}
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-xs rounded-md px-2.5 py-1.5 text-xs bg-[var(--surface-inverse)] text-[var(--text-inverse)] shadow-sm"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
