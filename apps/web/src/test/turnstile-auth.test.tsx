import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthDialog } from "../components/auth/auth-dialog.js";
import {
  type TurnstileRenderOptions,
  TurnstileWidget,
} from "../components/auth/turnstile-widget.js";
import { authClient } from "../lib/auth-client.js";
import { createAppQueryClient } from "../lib/query-client.js";
import {
  getAuthDialogState,
  openAuthDialog,
  resetAuthDialogStoreForTest,
} from "../state/auth-dialog-store.js";

function renderAuthDialog(turnstileSiteKey?: string | null) {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/library" element={<div>Library Destination</div>} />
        </Routes>
        <AuthDialog turnstileSiteKey={turnstileSiteKey} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleUser = {
  id: "u_1",
  email: "ada@example.com",
  name: "Ada",
  spaceId: "sp_1",
  spaceName: "Ada's Workspace",
  plan: "free" as const,
  hasPasskey: false,
};

describe("TurnstileWidget script loading and callbacks", () => {
  afterEach(() => {
    window.turnstile = undefined;
    for (const script of document.head.querySelectorAll("script")) {
      script.remove();
    }
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("loads Turnstile script, handles load failures, reuses existing script, and syncs theme", async () => {
    const onSuccess = vi.fn();
    const onExpire = vi.fn();
    const onError = vi.fn();

    // 1. Script error resets singleton promise and calls onError
    const first = render(
      <TurnstileWidget
        siteKey="site-key-1"
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
      />,
    );
    const script1 = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
    );
    expect(script1).not.toBeNull();
    expect(script1?.async).toBe(true);
    expect(script1?.defer).toBe(true);

    act(() => {
      script1?.dispatchEvent(new Event("error"));
    });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    first.unmount();
    script1?.remove();

    // 2. Script loads without window.turnstile -> calls onError
    const second = render(
      <TurnstileWidget siteKey="site-key-1" onSuccess={onSuccess} onError={onError} />,
    );
    const script2 = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
    );
    act(() => {
      script2?.dispatchEvent(new Event("load"));
    });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(2);
    });
    second.unmount();

    // 3. Reuses existing script in document.head and handles unmount before load
    let renderedOpts: TurnstileRenderOptions | undefined;
    const renderSpy = vi.fn((_el: HTMLElement, opts: TurnstileRenderOptions) => {
      renderedOpts = opts;
      return "w-existing";
    });
    const removeSpy = vi.fn();

    const third = render(
      <TurnstileWidget siteKey="site-key-1" onSuccess={onSuccess} onError={onError} />,
    );
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    third.unmount();

    // 4. Light theme and successful load with window.turnstile
    document.documentElement.setAttribute("data-theme", "light");
    const fourth = render(
      <TurnstileWidget
        siteKey="site-key-2"
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
      />,
    );
    window.turnstile = { render: renderSpy, reset: vi.fn(), remove: removeSpy };
    act(() => {
      script2?.dispatchEvent(new Event("load"));
    });

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
    expect(renderedOpts?.sitekey).toBe("site-key-2");
    expect(renderedOpts?.theme).toBe("light");

    act(() => {
      renderedOpts?.callback?.("tok-ok");
      renderedOpts?.["expired-callback"]?.();
      renderedOpts?.["error-callback"]?.();
    });
    expect(onSuccess).toHaveBeenCalledWith("tok-ok");
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(3);

    fourth.unmount();
    expect(removeSpy).toHaveBeenCalledWith("w-existing");

    // 5. Already loaded window.turnstile renders with dark theme and exposes reset()
    document.documentElement.setAttribute("data-theme", "dark");
    const resetSpy = vi.fn();
    const darkRenderSpy = vi.fn((_el: HTMLElement, opts: TurnstileRenderOptions) => {
      renderedOpts = opts;
      return "w-dark";
    });
    window.turnstile = { render: darkRenderSpy, reset: resetSpy, remove: removeSpy };
    const widgetRef = { current: null as { reset: () => void } | null };
    const callsBeforeUnmount = onError.mock.calls.length;
    const sixth = render(
      <TurnstileWidget ref={widgetRef} siteKey="site-key-3" onSuccess={onSuccess} />,
    );
    await waitFor(() => {
      expect(darkRenderSpy).toHaveBeenCalledTimes(1);
    });
    expect(renderedOpts?.theme).toBe("dark");
    widgetRef.current?.reset();
    expect(resetSpy).toHaveBeenCalledWith("w-dark");

    // Changing siteKey tears down the old widget and renders a new one
    sixth.rerender(<TurnstileWidget ref={widgetRef} siteKey="site-key-4" onSuccess={onSuccess} />);
    await waitFor(() => {
      expect(darkRenderSpy).toHaveBeenCalledTimes(2);
    });
    expect(removeSpy).toHaveBeenCalledWith("w-dark");
    expect(renderedOpts?.sitekey).toBe("site-key-4");
    sixth.unmount();
    expect(removeSpy).toHaveBeenCalledTimes(3);

    // Unmounting before script rejects does not invoke onError
    script2?.remove();
    window.turnstile = undefined;
    const seventh = render(
      <TurnstileWidget siteKey="site-key-5" onSuccess={onSuccess} onError={onError} />,
    );
    const script3 = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
    );
    seventh.unmount();
    act(() => {
      script3?.dispatchEvent(new Event("error"));
    });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});

describe("Cloudflare Turnstile in AuthDialog", () => {
  beforeEach(() => {
    resetAuthDialogStoreForTest();
    openAuthDialog({ reason: "navbar_signin" });
    vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({ google: false, github: false });
  });

  afterEach(() => {
    window.turnstile = undefined;
    Reflect.deleteProperty(window, "PublicKeyCredential");
    import.meta.env.VITE_TURNSTILE_SITE_KEY = "";
    vi.restoreAllMocks();
  });

  it("omits Turnstile widget when no site key is configured", async () => {
    const sendSpy = vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
    renderAuthDialog(null);

    await waitFor(() => {
      expect(authClient.getOAuthProviders).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Email me a code" });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith({ email: "ada@example.com", captchaToken: undefined });
    });
  });

  it("resolves site key from VITE_TURNSTILE_SITE_KEY and guards unverified submit", async () => {
    import.meta.env.VITE_TURNSTILE_SITE_KEY = "  1x00000000000000000000BB  ";
    let capturedOptions: TurnstileRenderOptions | undefined;
    window.turnstile = {
      render: vi.fn((_c, opts) => {
        capturedOptions = opts;
        return "w-env";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    const sendSpy = vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();

    renderAuthDialog();

    await waitFor(() => {
      expect(capturedOptions?.sitekey).toBe("1x00000000000000000000BB");
    });

    const form = screen.getByLabelText("Email address").closest("form");
    if (!form) throw new Error("Expected auth form");
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please complete the verification check before continuing.",
    );
    expect(sendSpy).not.toHaveBeenCalled();

    // Error callback clears token and displays blocker message
    act(() => {
      capturedOptions?.["error-callback"]?.();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Human verification could not load. Please refresh or disable blockers.",
    );

    // Whitespace-only env var is treated as unconfigured
    import.meta.env.VITE_TURNSTILE_SITE_KEY = "   ";
    const second = renderAuthDialog();
    expect(second.container.querySelectorAll('[data-testid="turnstile-widget"]')).toHaveLength(0);
  });

  it("requires Turnstile token, handles expire/reset/switch-email, and completes OTP sign-in", async () => {
    let capturedOptions: TurnstileRenderOptions | undefined;
    const renderSpy = vi.fn((_container: HTMLElement, options: TurnstileRenderOptions) => {
      capturedOptions = options;
      return "widget-1";
    });
    const resetSpy = vi.fn();
    const removeSpy = vi.fn();
    window.turnstile = {
      render: renderSpy,
      reset: resetSpy,
      remove: removeSpy,
    };

    const sendSpy = vi
      .spyOn(authClient, "sendEmailCode")
      .mockRejectedValueOnce("non-error-string")
      .mockResolvedValue();
    const verifySpy = vi.spyOn(authClient, "verifyEmailCode").mockResolvedValue(sampleUser);
    const replaySpy = vi.fn();

    openAuthDialog({
      reason: "save_prompt",
      intendedRoute: "/library",
      safeReplayAction: replaySpy,
    });

    renderAuthDialog("1x00000000000000000000AA");

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    const submit = screen.getByRole("button", { name: "Email me a code" });
    expect(submit).toBeDisabled();

    // Grant then expire token
    act(() => {
      capturedOptions?.callback?.("cf-token-123");
    });
    expect(submit).toBeEnabled();

    act(() => {
      capturedOptions?.["expired-callback"]?.();
    });
    expect(submit).toBeDisabled();

    // Re-grant token and submit with non-Error failure
    act(() => {
      capturedOptions?.callback?.("cf-token-123");
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Authentication failed. Please verify your email and try again.",
      );
    });
    expect(resetSpy).toHaveBeenCalledWith("widget-1");
    expect(submit).toBeDisabled();

    // Grant fresh token and succeed to "code" step
    act(() => {
      capturedOptions?.callback?.("cf-token-456");
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();
    expect(removeSpy).toHaveBeenCalledWith("widget-1");

    // Switch back via "Use another email" and confirm Turnstile re-mounts cleanly
    fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    act(() => {
      capturedOptions?.callback?.("cf-token-789");
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Sign-in code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/Workspace display name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith({
        email: "ada@example.com",
        otp: "123456",
        name: "Ada Lovelace",
      });
    });
    expect(replaySpy).toHaveBeenCalledTimes(1);
    expect(getAuthDialogState().isOpen).toBe(false);
  });

  it("supports OAuth providers, intendedRoute navigation, and guest dismiss", async () => {
    vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({ google: true, github: true });
    const googleSpy = vi
      .spyOn(authClient, "signInWithGoogle")
      .mockRejectedValueOnce(new Error("Google popup blocked"))
      .mockResolvedValueOnce();
    const githubSpy = vi
      .spyOn(authClient, "signInWithGitHub")
      .mockRejectedValueOnce("raw-error")
      .mockResolvedValueOnce();
    vi.spyOn(authClient, "sendEmailCode").mockResolvedValueOnce();
    const verifySpy = vi.spyOn(authClient, "verifyEmailCode").mockResolvedValueOnce(sampleUser);

    openAuthDialog({ reason: "protected_route", intendedRoute: "/library" });
    renderAuthDialog(null);
    expect(screen.getByText("Sign in to access your Workspace")).toBeInTheDocument();
    expect(screen.getByText("Protected Workspace")).toBeInTheDocument();

    const googleBtn = await screen.findByRole("button", { name: "Continue with Google" });
    const githubBtn = screen.getByRole("button", { name: "Continue with GitHub" });
    expect(screen.queryByRole("button", { name: "Continue with Passkey" })).toBeNull();

    fireEvent.click(googleBtn);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Google popup blocked");
    });
    expect(googleSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(githubBtn);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not start github sign-in.");
    });
    expect(githubSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    const codeInput = await screen.findByLabelText("Sign-in code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith({
        email: "ada@example.com",
        otp: "123456",
        name: undefined,
      });
    });
    expect(await screen.findByText("Library Destination")).toBeInTheDocument();
    expect(getAuthDialogState().isOpen).toBe(false);

    // Reopen and dismiss via guest button and native dialog close
    act(() => {
      openAuthDialog({ reason: "quota_limit" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Keep working as guest" }));
    expect(getAuthDialogState().isOpen).toBe(false);

    act(() => {
      openAuthDialog({ reason: "advanced_controls" });
    });
    const dialog = await screen.findByRole<HTMLDialogElement>("dialog");
    act(() => {
      dialog.dispatchEvent(new Event("close"));
    });
    expect(getAuthDialogState().isOpen).toBe(false);
  });

  it("renders single OAuth provider buttons independently and handles verify code failure", async () => {
    vi.spyOn(authClient, "getOAuthProviders").mockResolvedValueOnce({
      google: true,
      github: false,
    });
    const firstView = renderAuthDialog(null);
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with GitHub" })).not.toBeInTheDocument();
    firstView.unmount();

    vi.spyOn(authClient, "getOAuthProviders").mockResolvedValueOnce({
      google: false,
      github: true,
    });
    vi.spyOn(authClient, "sendEmailCode").mockResolvedValueOnce();
    vi.spyOn(authClient, "verifyEmailCode").mockRejectedValueOnce(new Error("Invalid OTP"));
    renderAuthDialog(null);

    expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Sign-in code")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid OTP");
    });
  });
});
