import type * as React from "react";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  ariaLabel: string;
}

export function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  className = "",
  ...props
}: SelectProps) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={`min-h-[42px] px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--separator-subtle)] hover:border-[var(--text-secondary)] focus-ring cursor-pointer ${className}`}
      {...props}
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          disabled={opt.disabled}
          className="bg-[var(--surface-1)] text-[var(--text-primary)]"
        >
          {opt.label}
        </option>
      ))}
    </select>
  );
}
