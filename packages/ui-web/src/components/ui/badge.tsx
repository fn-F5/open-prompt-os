import type * as React from "react";

export type BadgeVariant = "neutral" | "framework" | "diagnostic" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  neutral:
    "bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--separator-subtle)] font-normal",
  framework:
    "bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] border border-[var(--separator-strong)] font-normal",
  diagnostic:
    "bg-[var(--cyan-subtle-bg)] text-[var(--cyan-text)] border border-[var(--accent-cyan)] font-normal",
  danger:
    "bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)] font-normal",
};

export function Badge({ className = "", variant = "neutral", ...props }: BadgeProps) {
  const displayClass = /\bhidden\b/.test(className) ? "" : "inline-flex";
  return (
    <span
      className={`${displayClass} items-center gap-1.5 px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] rounded-full leading-5 ${BADGE_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
