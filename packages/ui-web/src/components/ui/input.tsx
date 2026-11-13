import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full min-h-[44px] px-4 py-2.5 text-sm sm:text-base rounded-xl bg-[var(--surface-2)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--separator-subtle)] focus:border-[var(--focus-ring)] focus-ring transition-colors duration-150 disabled:opacity-40 ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full px-4 py-3 text-base sm:text-lg rounded-xl bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-transparent focus-ring transition-colors duration-150 resize-none disabled:opacity-40 ${className}`}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
