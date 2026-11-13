import { Badge, Button, Dialog, Input } from "@open-prompt-os/ui-web";
import { ShieldCheck } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { type OAuthProviderStatus, authClient } from "../../lib/auth-client.js";
import {
  type AuthTriggerReason,
  closeAuthDialog,
  consumeSafeReplayAction,
  safeInternalRoute,
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
      "Sync your prompt history, organize templates, and sign in with email or a linked account.",
    badge: "Workspace Sign-In",
  },
};

export function AuthDialog() {
  const { isOpen, reason, intendedRoute } = useAuthDialogStore();
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, signInWithGitHub } = useAuthSession();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [providers, setProviders] = React.useState<OAuthProviderStatus>({
    google: false,
    github: false,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const hasSocial = providers.google || providers.github;
  const copy = REASON_COPY[reason];

  React.useEffect(() => {
    if (!isOpen) return;
    setError(null);
    let active = true;
    void authClient.getOAuthProviders().then((status) => {
      if (active) setProviders(status);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleSuccessPostAuth = () => {
    closeAuthDialog();
    const replay = consumeSafeReplayAction();
    const route = safeInternalRoute(intendedRoute);
    if (replay) {
      replay();
    } else if (route) {
      navigate(route);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (step === "email") {
        await sendEmailCode({ email });
        setStep("code");
        return;
      }
      await verifyEmailCode({ email, otp: code, name: name || undefined });
      setStep("email");
      setCode("");
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

  const handleSocialSignIn = async (provider: "google" | "github") => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else {
        await signInWithGitHub();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not start ${provider} sign-in.`);
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

      {step === "email" && hasSocial ? (
        <div className="mb-4 space-y-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {providers.google ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => void handleSocialSignIn("google")}
              >
                Continue with Google
              </Button>
            ) : null}
            {providers.github ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => void handleSocialSignIn("github")}
              >
                Continue with GitHub
              </Button>
            ) : null}
          </div>

          <div className="my-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>
        </div>
      ) : null}

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-email-input" className="block text-sm font-medium mb-1.5">
            Email address
          </label>
          <Input
            id="auth-email-input"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting || step === "code"}
          />
        </div>

        {step === "code" ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="auth-code-input" className="block text-sm font-medium">
                Sign-in code
              </label>
              <button
                type="button"
                className="text-xs text-[var(--text-secondary)] hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                Use another email
              </button>
            </div>
            <Input
              id="auth-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="auth-name-input" className="block text-sm font-medium mb-1.5">
            Workspace display name <span className="text-[var(--text-secondary)]">(optional)</span>
          </label>
          <Input
            id="auth-name-input"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
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
            variant={hasSocial ? "secondary" : "primary-inverse"}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Working..." : step === "code" ? "Verify code" : "Email me a code"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
