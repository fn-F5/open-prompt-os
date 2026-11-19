import type { BillingInterval } from "@open-prompt-os/contracts";
import { Button, Dialog, Input } from "@open-prompt-os/ui-web";
import { CheckCircle2, Sparkles } from "lucide-react";
import type * as React from "react";

export interface PlanInterestDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly planName?: string;
  readonly interval?: BillingInterval;
  readonly confirmedEmail: string | null;
  readonly email: string;
  readonly onEmailChange: (value: string) => void;
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (event: React.FormEvent) => void;
}

export function PlanInterestDialog({
  open,
  onOpenChange,
  planName,
  interval = "yearly",
  confirmedEmail,
  email,
  onEmailChange,
  error,
  isSubmitting,
  onSubmit,
}: PlanInterestDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onOpenChange(false);
        }
      }}
      title="Thanks for the interest"
      description={
        planName ? `${planName} (${interval === "yearly" ? "Yearly" : "Monthly"})` : undefined
      }
      variant="solid"
    >
      <div className="rounded-2xl p-5 bg-[var(--surface-2)] border border-[var(--separator-subtle)] space-y-4">
        {confirmedEmail ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[var(--success-text)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  We will notify you soon!
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  We&apos;ve saved{" "}
                  <span className="font-medium text-[var(--text-primary)]">{confirmedEmail}</span>{" "}
                  and will email you as soon as upgrades go live.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary-inverse" size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--text-secondary)]">
                We will notify you soon when upgrades launch. Enter your email so we can reach out
                as soon as it&apos;s ready.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="plan-interest-email"
                className="block text-sm font-medium text-[var(--text-primary)]"
              >
                Email address
              </label>
              <Input
                id="plan-interest-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-[var(--danger-text)]">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary-inverse" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Notify Me"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
