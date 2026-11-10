import { Badge, Button, Dialog, Input } from "@open-prompt-os/ui-web";
import { KeyRound, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { isPasskeySupported } from "../../lib/auth-client.js";
import {
  type AuthTriggerReason,
  closeAuthDialog,
  consumeSafeReplayAction,
  useAuthDialogStore,
} from "../../state/auth-dialog-store.js";

const REASON_COPY: Record<
  AuthTriggerReason,
  { title: string; description: string; badge: string }
> = {
  save_prompt: {
    title: "Save this prompt to your Library",
    description:
      "Create a free workspace in seconds. Your active prompt and generated output stay right here and sync automatically.",
    badge: "Zero Data Loss Sync",
  },
  advanced_controls: {
    title: "Unlock Pro Prompt Controls",
    description:
      "Sign in to configure custom guardrails, reusable persona presets, and model-specific settings.",
    badge: "Pro Controls",
  },
  quota_limit: {
    title: "Continue with a Free Workspace",
    description:
      "You have used today's anonymous runs. Sign in for free to unlock 50 daily prompts and keep your current draft.",
    badge: "Daily Limit Reached",
  },
  protected_route: {
    title: "Sign in to access your Workspace",
    description:
      "Your personal prompt library and workspace settings require an authenticated session.",
    badge: "Protected Workspace",
  },
  navbar_signin: {
    title: "Sign in to Open Prompt OS",
    description:
      "Sync your prompt history, organize templates, and sign in with email or a hardware passkey.",
    badge: "Passkey Ready",
  },
};

export function AuthDialog() {
  const { isOpen, reason, intendedRoute } = useAuthDialogStore();
  const { signInWithEmail, signInWithPasskey } = useAuthSession();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const passkeyAvailable = isPasskeySupported();
  const copy = REASON_COPY[reason];

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const handleSuccessPostAuth = () => {
    closeAuthDialog();
    const replay = consumeSafeReplayAction();
    if (replay) {
      replay();
    } else if (intendedRoute) {
      navigate(intendedRoute);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail({ email, name: name || undefined });
      handleSuccessPostAuth();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authentication failed. Please verify your email and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithPasskey();
      handleSuccessPostAuth();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Passkey verification was canceled or unavailable.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeAuthDialog();
      }}
      title={copy.title}
      description={copy.description}
      variant="glass"
    >
      <div className="mb-5 flex items-center justify-between">
        <Badge variant="framework">{copy.badge}</Badge>
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--success-text)] font-medium">
          <ShieldCheck className="w-4 h-4" />
          We never train on your prompts
        </span>
      </div>

      {passkeyAvailable ? (
        <div className="mb-4">
          <Button
            type="button"
            variant="solid"
            className="w-full"
            disabled={isSubmitting}
            onClick={handlePasskeySignIn}
          >
            <KeyRound className="w-4 h-4" />
            <span>Continue with Passkey</span>
          </Button>
          <div className="my-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="h-px flex-1 bg-[var(--separator-subtle)]" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-[var(--separator-subtle)]" />
          </div>
        </div>
      ) : null}

      <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="auth-email-input" className="block text-sm font-medium mb-1.5">
            Email address
          </label>
          <Input
            id="auth-email-input"
            type="email"
            required
            autoComplete="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="auth-name-input" className="block text-sm font-medium mb-1.5">
            Workspace display name <span className="text-[var(--text-secondary)]">(optional)</span>
          </label>
          <Input
            id="auth-name-input"
            type="text"
            autoComplete="name"
            placeholder="Alex Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl p-3 text-sm bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/30"
          >
            {error}
          </div>
        ) : null}

        <div className="pt-2 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => closeAuthDialog()}
            disabled={isSubmitting}
          >
            Keep working as guest
          </Button>
          <Button
            type="submit"
            variant={passkeyAvailable ? "secondary" : "primary-inverse"}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Continue with Email"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
