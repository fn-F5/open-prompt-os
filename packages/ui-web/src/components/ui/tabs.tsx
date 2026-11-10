import * as React from "react";

export interface TabOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly badge?: string;
}

export interface TabsProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly TabOption<T>[];
  ariaLabel: string;
  className?: string;
}

export function Tabs<T extends string = string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className = "",
}: TabsProps<T>) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + dir + options.length) % options.length;
    const nextOption = options[nextIndex];
    if (nextOption) {
      onValueChange(nextOption.value);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-nowrap overflow-x-auto max-w-full items-center gap-1 p-1 sm:p-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--separator-subtle)] ${className}`}
    >
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onValueChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 focus-ring cursor-pointer inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 sm:gap-2 ${
              isActive
                ? "bg-[var(--surface-1)] text-[var(--text-primary)] font-semibold border border-[var(--accent-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] border border-transparent"
            }`}
          >
            {isActive ? (
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[var(--accent-primary)]"
              />
            ) : null}
            <span>{opt.label}</span>
            {opt.badge ? (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-[var(--accent-subtle-bg)] text-[var(--accent-text)] font-medium">
                {opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
