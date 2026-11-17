import type { FeedbackKind } from "@open-prompt-os/contracts";
import { Button, Dialog, Input, Tabs, Textarea, toast } from "@open-prompt-os/ui-web";
import * as React from "react";
import { useLocation } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { orpcClient } from "../../lib/orpc.js";
import { trackEvent } from "../../lib/telemetry.js";
import { closeFeedbackDialog, useFeedbackDialogStore } from "../../state/feedback-dialog-store.js";

const KIND_OPTIONS: ReadonlyArray<{ readonly value: FeedbackKind; readonly label: string }> = [
  { value: "feature_request", label: "Feature Request" },
  { value: "general_feedback", label: "Feedback" },
  { value: "bug_report", label: "Bug Report" },
];

const PLACEHOLDERS: Record<FeedbackKind, { title: string; message: string }> = {
  feature_request: {
    title: "e.g., Add side-by-side model output comparison",
    message: "Describe the feature or workflow improvement you'd like to see...",
  },
  general_feedback: {
    title: "e.g., Thoughts on the prompt compiler workflow",
    message: "Share what's working well or what we can make better...",
  },
  bug_report: {
    title: "e.g., Streaming output stalls on Safari",
    message: "Tell us what happened and what you expected to see...",
  },
};

export function FeedbackDialog() {
  const { isOpen, defaultKind } = useFeedbackDialogStore();
  const { isAuthenticated } = useAuthSession();
  const location = useLocation();

  const [kind, setKind] = React.useState<FeedbackKind>(defaultKind);
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setKind(defaultKind);
    setError(null);
  }, [isOpen, defaultKind]);

  const handleClose = () => {
    if (isSubmitting) return;
    closeFeedbackDialog();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 5) {
      setError("Please provide at least 5 characters of detail.");
      return;
    }

    setIsSubmitting(true);
    try {
      await orpcClient.feedback.submit({
        kind,
        title: title.trim() || undefined,
        message: trimmedMessage,
        contactEmail: !isAuthenticated ? contactEmail.trim() || undefined : undefined,
        pagePath: location.pathname,
      });

      trackEvent("feedback_submitted", {
        kind,
        authenticated: isAuthenticated,
      });

      setTitle("");
      setMessage("");
      setContactEmail("");
      closeFeedbackDialog();

      toast({
        title: "Thank you for your feedback!",
        description:
          kind === "feature_request"
            ? "Your feature request has been logged for our product roadmap."
            : "Your feedback has been received by the Open Prompt OS team.",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit your feedback. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const placeholder = PLACEHOLDERS[kind];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      title="Feedback & Feature Requests"
      description="Help shape Open Prompt OS. Submit ideas, product feedback, or bug reports anytime."
      variant="glass"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            Category
          </span>
          <Tabs
            ariaLabel="Feedback category"
            value={kind}
            onValueChange={setKind}
            options={KIND_OPTIONS}
            className="w-full !flex-nowrap justify-between [&>button]:flex-1 [&>button]:justify-center [&>button]:!px-2 [&>button]:!tracking-[0.02em]"
          />
        </div>

        <div>
          <label htmlFor="feedback-title-input" className="block text-sm font-medium mb-1">
            Short summary <span className="text-[var(--text-secondary)]">(optional)</span>
          </label>
          <Input
            id="feedback-title-input"
            type="text"
            maxLength={160}
            placeholder={placeholder.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="feedback-message-input" className="block text-sm font-medium mb-1">
            Details
          </label>
          <Textarea
            id="feedback-message-input"
            rows={4}
            required
            maxLength={2000}
            placeholder={placeholder.message}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSubmitting}
            className="!text-sm sm:!text-base !bg-[var(--surface-2)] !border !border-[var(--separator-subtle)] focus:!border-[var(--focus-ring)] focus-ring"
          />
        </div>

        {!isAuthenticated ? (
          <div>
            <label htmlFor="feedback-email-input" className="block text-sm font-medium mb-1">
              Email for follow-up <span className="text-[var(--text-secondary)]">(optional)</span>
            </label>
            <Input
              id="feedback-email-input"
              type="email"
              maxLength={254}
              placeholder="you@company.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-xl p-3 text-sm bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/30"
          >
            {error}
          </div>
        ) : null}

        <div className="pt-1.5 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary-inverse" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Submit feedback"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
