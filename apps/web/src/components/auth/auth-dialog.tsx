import { DEFAULT_PRICING_PLANS } from "@open-prompt-os/contracts";
import { Button, Dialog, Input } from "@open-prompt-os/ui-web";
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
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget.js";

function resolveTurnstileSiteKey(): string | undefined {
  const value = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
      />
    </svg>
  );
}

const FREE_DAILY_LIMIT =
  DEFAULT_PRICING_PLANS.find((plan) => plan.id === "free")?.dailyPromptLimit ?? 20;

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
    description: `You have used today's anonymous runs. Sign in for free to unlock ${FREE_DAILY_LIMIT} daily prompts and keep your current draft.`,
    badge: "Daily Limit Reached",
  },
  protected_route: {
    title: "Sign in to access your Workspace",
    description:
      "Your personal prompt library and workspace settings require an authenticated session.",
    badge: "Protected Workspace",
  },
  navbar_signin: {
    title: "Sign In to Open Prompt OS",
    description:
      "Sync your prompt history, organize templates, and sign in with email or a linked account.",
    badge: "Workspace Sign-In",
  },
};

export function AuthDialog({ turnstileSiteKey }: { turnstileSiteKey?: string | null } = {}) {
  const { isOpen, reason, intendedRoute } = useAuthDialogStore();
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, signInWithGitHub } = useAuthSession();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileWidgetHandle | null>(null);
  const [providers, setProviders] = React.useState<OAuthProviderStatus>({
    google: true,
    github: true,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const siteKey =
    turnstileSiteKey !== undefined
      ? turnstileSiteKey?.trim() || undefined
      : resolveTurnstileSiteKey();
  const hasSocial = providers.google || providers.github;
  const copy = REASON_COPY[reason];

  React.useEffect(() => {
    if (!isOpen) {
      setCaptchaToken(null);
      return;
    }
    setError(null);
    setCaptchaToken(null);
    setProviders({ google: true, github: true });
    let active = true;
    void authClient.getOAuthProviders().then((status) => {
      if (active && (status.google || status.github)) {
        setProviders(status);
      }
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
    if (step === "email" && siteKey && !captchaToken) {
      setError("Please complete the verification check before continuing.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (step === "email") {
        await sendEmailCode({ email, captchaToken: captchaToken ?? undefined });
        setCaptchaToken(null);
        setStep("code");
        return;
      }
      await verifyEmailCode({ email, otp: code, name: name || undefined });
      setStep("email");
      setCode("");
      handleSuccessPostAuth();
    } catch (err) {
      if (step === "email") {
        setCaptchaToken(null);
        turnstileRef.current?.reset();
      }
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
      {step === "email" && hasSocial ? (
        <div className="mb-3 space-y-2">
          <div className="flex flex-col gap-2">
            {providers.google ? (
              <button
                type="button"
                className="w-full min-h-[40px] sm:min-h-[44px] px-4 py-2 rounded-xl inline-flex items-center justify-center gap-3 text-sm font-medium bg-white hover:bg-[#F8FAFC] text-[#1F1F1F] border border-[#D7DDE5] shadow-xs transition-all duration-150 focus-ring disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                disabled={isSubmitting}
                onClick={() => void handleSocialSignIn("google")}
              >
                <GoogleLogo />
                <span>Continue with Google</span>
              </button>
            ) : null}
            {providers.github ? (
              <button
                type="button"
                className="w-full min-h-[40px] sm:min-h-[44px] px-4 py-2 rounded-xl inline-flex items-center justify-center gap-3 text-sm font-medium bg-[#24292F] hover:bg-[#1B1F24] text-white border border-white/12 shadow-xs transition-all duration-150 focus-ring disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                disabled={isSubmitting}
                onClick={() => void handleSocialSignIn("github")}
              >
                <GitHubLogo />
                <span>Continue with GitHub</span>
              </button>
            ) : null}
          </div>

          <div className="my-2.5 sm:my-3 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--separator-subtle)]" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-[var(--separator-subtle)]" />
          </div>
        </div>
      ) : null}

      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <div>
          <label htmlFor="auth-email-input" className="block text-sm font-medium mb-1">
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
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="auth-code-input" className="block text-sm font-medium">
                Sign-in code
              </label>
              <button
                type="button"
                className="text-xs text-[var(--text-secondary)] hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setCaptchaToken(null);
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
          <label htmlFor="auth-name-input" className="block text-sm font-medium mb-1">
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

        {step === "email" && siteKey && isOpen ? (
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={siteKey}
            onSuccess={(token) => {
              setCaptchaToken(token);
              setError(null);
            }}
            onExpire={() => setCaptchaToken(null)}
            onError={() => {
              setCaptchaToken(null);
              setError("Human verification could not load. Please refresh or disable blockers.");
            }}
          />
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
            onClick={() => closeAuthDialog()}
            disabled={isSubmitting}
          >
            Keep working as guest
          </Button>
          <Button
            type="submit"
            variant="primary-inverse"
            size="sm"
            disabled={isSubmitting || (step === "email" && Boolean(siteKey) && !captchaToken)}
          >
            {isSubmitting ? "Working..." : step === "code" ? "Verify code" : "Email me a code"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
