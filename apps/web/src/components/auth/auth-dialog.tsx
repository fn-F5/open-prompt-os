import {
  DEFAULT_PRICING_PLANS,
  REFERRAL_SOURCE_OPTIONS,
  type ReferralSource,
} from "@open-prompt-os/contracts";
import { Button, Dialog, Input, Select, Tabs } from "@open-prompt-os/ui-web";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { type OAuthProviderStatus, authClient } from "../../lib/auth-client.js";
import {
  clearPendingSignupReferral,
  recordSignupReferral,
  savePendingSignupReferral,
} from "../../lib/signup-referral.js";
import {
  type AuthDialogMode,
  type AuthTriggerReason,
  closeAuthDialog,
  consumeSafeReplayAction,
  safeInternalRoute,
  useAuthDialogStore,
} from "../../state/auth-dialog-store.js";
import { GitHubLogo } from "../brand/github-logo.js";
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
      "Sync your prompt history, organize your prompt library, and sign in with email or a linked account.",
    badge: "Workspace Sign-In",
  },
};

export function AuthDialog({ turnstileSiteKey }: { turnstileSiteKey?: string | null } = {}) {
  const { isOpen, reason, mode, intendedRoute } = useAuthDialogStore();
  const { sendEmailCode, verifyEmailCode, signInWithGoogle, signInWithGitHub } = useAuthSession();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [authMode, setAuthMode] = React.useState<AuthDialogMode>(mode);
  const [isKnownExistingUser, setIsKnownExistingUser] = React.useState(false);
  const [referralSource, setReferralSource] = React.useState<ReferralSource | "">("");
  const [referralDetail, setReferralDetail] = React.useState("");
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
  const baseCopy = REASON_COPY[reason];
  const copy =
    reason === "navbar_signin" && authMode === "signup"
      ? {
          title: "Create your Open Prompt OS Workspace",
          description:
            "Set up a free workspace to sync your prompt history, organize your library, and save prompts.",
          badge: "Free Workspace",
        }
      : baseCopy;
  const showSignupAttribution = authMode === "signup" && !isKnownExistingUser;

  React.useEffect(() => {
    if (!isOpen) {
      setCaptchaToken(null);
      return;
    }
    setError(null);
    setCaptchaToken(null);
    setAuthMode(mode);
    setIsKnownExistingUser(false);
    setReferralSource("");
    setReferralDetail("");
    setProviders({ google: true, github: true });
    let active = true;
    void authClient.getOAuthProviders().then((status) => {
      if (active) {
        setProviders(status);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, mode]);

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
        const isNewUser = await authClient.checkSignupStatus(email);
        if (isNewUser === false) {
          setIsKnownExistingUser(true);
          setReferralSource("");
          setReferralDetail("");
        } else if (isNewUser === true) {
          setIsKnownExistingUser(false);
          setAuthMode("signup");
        }
        setCaptchaToken(null);
        setStep("code");
        return;
      }
      await verifyEmailCode({ email, otp: code, name: name || undefined });
      if (showSignupAttribution && referralSource) {
        await recordSignupReferral({
          referralSource,
          referralDetail:
            referralSource === "other" ? referralDetail.trim() || undefined : undefined,
        });
      }
      setStep("email");
      setCode("");
      setReferralSource("");
      setReferralDetail("");
      setIsKnownExistingUser(false);
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
    if (showSignupAttribution && referralSource) {
      savePendingSignupReferral({
        referralSource,
        referralDetail: referralSource === "other" ? referralDetail.trim() || undefined : undefined,
      });
    } else {
      clearPendingSignupReferral();
    }
    try {
      const route = safeInternalRoute(intendedRoute);
      if (provider === "google") {
        await (route ? signInWithGoogle({ callbackURL: route }) : signInWithGoogle());
      } else {
        await (route ? signInWithGitHub({ callbackURL: route }) : signInWithGitHub());
      }
    } catch (err) {
      clearPendingSignupReferral();
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
      {step === "email" ? (
        <div className="mb-3">
          <Tabs
            ariaLabel="Authentication mode"
            value={authMode}
            onValueChange={(nextMode) => {
              setAuthMode(nextMode);
              setIsKnownExistingUser(false);
              if (nextMode === "signin") {
                setReferralSource("");
                setReferralDetail("");
              }
            }}
            options={[
              { value: "signin", label: "Sign In" },
              { value: "signup", label: "Sign Up" },
            ]}
            className="w-full !flex-nowrap [&>button]:flex-1 [&>button]:justify-center"
          />
        </div>
      ) : null}

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
            maxLength={254}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting || step === "code"}
          />
        </div>

        <div>
          <label htmlFor="auth-name-input" className="block text-sm font-medium mb-1">
            Name <span className="text-[var(--text-secondary)]">(optional)</span>
          </label>
          <Input
            id="auth-name-input"
            type="text"
            autoComplete="name"
            maxLength={120}
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {showSignupAttribution ? (
          <div className="space-y-2">
            <div>
              <label htmlFor="auth-referral-select" className="block text-sm font-medium mb-1">
                How did you come to know about us?{" "}
                <span className="text-[var(--text-secondary)]">(optional)</span>
              </label>
              <Select
                id="auth-referral-select"
                ariaLabel="How did you come to know about us (optional)"
                value={referralSource}
                onValueChange={(val) => {
                  setReferralSource(val as ReferralSource | "");
                  if (val !== "other") {
                    setReferralDetail("");
                  }
                }}
                options={[
                  { value: "", label: "Select an option (optional)" },
                  ...REFERRAL_SOURCE_OPTIONS,
                ]}
                className="w-full"
                disabled={isSubmitting}
              />
            </div>
            {referralSource === "other" ? (
              <div>
                <Input
                  id="auth-referral-detail-input"
                  aria-label="Other referral source details (optional)"
                  type="text"
                  maxLength={200}
                  placeholder="Please specify (optional)"
                  value={referralDetail}
                  onChange={(e) => setReferralDetail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            ) : null}
          </div>
        ) : null}

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
                  setIsKnownExistingUser(false);
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
