import * as React from "react";

export type ButtonVariant =
  | "primary-inverse"
  | "solid"
  | "secondary"
  | "ghost"
  | "destructive"
  | "icon";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  "primary-inverse": "btn-brand-gradient font-semibold border border-transparent",
  solid: "btn-solid-contrast font-semibold",
  secondary:
    "bg-[var(--surface-2)] text-[var(--text-primary)] font-medium border border-[var(--separator-subtle)] hover:border-[var(--separator-strong)] hover:bg-[var(--surface-3)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] border border-transparent font-medium",
  destructive:
    "bg-[var(--danger-bg)] text-[var(--danger-text)] font-medium border border-[var(--danger-text)]/35 hover:opacity-90",
  icon: "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--separator-strong)] border border-[var(--separator-subtle)] p-2.5 aspect-square",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[38px] px-3.5 py-1.5 text-sm rounded-lg",
  md: "min-h-[44px] px-5 py-2.5 text-sm sm:text-base rounded-xl",
  lg: "min-h-[52px] px-7 py-3 text-base rounded-xl",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary-inverse", size = "md", type = "button", ...props }, ref) => {
    const sizeClass = variant === "icon" ? "min-h-[42px] min-w-[42px] rounded-xl" : SIZE_CLASSES[size];
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex shrink-0 whitespace-nowrap items-center justify-center gap-2 transition-all duration-150 focus-ring disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none ${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
