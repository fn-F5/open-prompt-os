import { QueryClientProvider } from "@tanstack/react-query";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "../components/auth/auth-gate.js";
import { useAuthSession } from "../hooks/use-auth-session.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { createAppQueryClient, queryKeys } from "../lib/query-client.js";
import {
  consumeSafeReplayAction,
  getAuthDialogState,
  resetAuthDialogStoreForTest,
} from "../state/auth-dialog-store.js";

function renderGate(
  props: Partial<React.ComponentProps<typeof AuthGate>> & {
    childOnClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
  } = {},
) {
  const onAuthenticatedAction = props.onAuthenticatedAction ?? vi.fn();
  const qc = createAppQueryClient();
  const view = render(
    <QueryClientProvider client={qc}>
      <AuthGate
        reason={props.reason ?? "save_prompt"}
        intendedRoute={props.intendedRoute}
        onSafeReplay={props.onSafeReplay}
        onAuthenticatedAction={onAuthenticatedAction}
      >
        <button type="button" onClick={props.childOnClick} disabled={props.disabled}>
          Save prompt
        </button>
      </AuthGate>
    </QueryClientProvider>,
  );
  return { ...view, onAuthenticatedAction };
}

describe("AuthGate", () => {
  beforeEach(() => {
    resetAuthDialogStoreForTest();
    setAuthSessionForTest(null);
    authClient.setLoading(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks clicks and marks button busy while loading", () => {
    authClient.setLoading(true);
    const { onAuthenticatedAction } = renderGate();
    const button = screen.getByRole("button", { name: "Save prompt" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    fireEvent.click(button);
    expect(onAuthenticatedAction).not.toHaveBeenCalled();
    expect(getAuthDialogState().isOpen).toBe(false);

    // Non-native button wrapper still triggers AuthGate click handler while loading
    const divGate = render(
      <QueryClientProvider client={createAppQueryClient()}>
        <AuthGate reason="save_prompt" onAuthenticatedAction={onAuthenticatedAction}>
          <div data-testid="loading-div">Div trigger</div>
        </AuthGate>
      </QueryClientProvider>,
    );
    const loadingEvent = createEvent.click(screen.getByTestId("loading-div"));
    fireEvent(screen.getByTestId("loading-div"), loadingEvent);
    expect(loadingEvent.defaultPrevented).toBe(true);
    expect(onAuthenticatedAction).not.toHaveBeenCalled();
    divGate.unmount();
  });

  it("runs onAuthenticatedAction when signed in", () => {
    setAuthSessionForTest({
      id: "u_1",
      email: "ada@example.com",
      name: "Ada",
      spaceId: "sp_1",
      spaceName: "Ada's Workspace",
      plan: "free",
      hasPasskey: false,
    });

    const childOnClick = vi.fn();
    const { onAuthenticatedAction } = renderGate({ childOnClick });
    const button = screen.getByRole("button", { name: "Save prompt" });

    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");

    fireEvent.click(button);
    expect(childOnClick).toHaveBeenCalledTimes(1);
    expect(onAuthenticatedAction).toHaveBeenCalledTimes(1);
    expect(getAuthDialogState().isOpen).toBe(false);
  });

  it("opens AuthDialog with reason, intendedRoute, and safeReplayAction for guests", () => {
    const replay = vi.fn();
    const first = renderGate({
      reason: "protected_route",
      intendedRoute: "/library",
      onSafeReplay: replay,
    });

    const firstBtn = screen.getByRole("button", { name: "Save prompt" });
    const clickEvent = createEvent.click(firstBtn);
    fireEvent(firstBtn, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);

    expect(first.onAuthenticatedAction).not.toHaveBeenCalled();
    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "protected_route",
      intendedRoute: "/library",
    });
    expect(consumeSafeReplayAction()).toBe(replay);
    first.unmount();

    resetAuthDialogStoreForTest();
    renderGate({ reason: "save_prompt" });
    fireEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(consumeSafeReplayAction()).toBeNull();
  });

  it("respects child defaultPrevented and disabled prop independently", () => {
    const first = renderGate({
      disabled: false,
      childOnClick: (e) => e.preventDefault(),
    });
    const button = screen.getByRole("button", { name: "Save prompt" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(first.onAuthenticatedAction).not.toHaveBeenCalled();
    expect(getAuthDialogState().isOpen).toBe(false);
    first.unmount();

    renderGate({ disabled: true });
    expect(screen.getByRole("button", { name: "Save prompt" })).toBeDisabled();
  });

  it("exposes authClient methods and clears user-scoped caches on signOut via useAuthSession", async () => {
    const qc = createAppQueryClient();
    const removeSpy = vi.spyOn(qc, "removeQueries");
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const initSpy = vi.spyOn(authClient, "ensureInitialized");
    const signOutSpy = vi.spyOn(authClient, "signOut").mockResolvedValue();
    const sendSpy = vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
    const verifySpy = vi.spyOn(authClient, "verifyEmailCode").mockResolvedValue({
      id: "u_1",
      email: "ada@example.com",
      name: "Ada",
      spaceId: "sp_1",
      spaceName: "Ada's Workspace",
      plan: "free",
      hasPasskey: false,
    });
    const googleSpy = vi.spyOn(authClient, "signInWithGoogle").mockResolvedValue();
    const githubSpy = vi.spyOn(authClient, "signInWithGitHub").mockResolvedValue();

    let latestSession: ReturnType<typeof useAuthSession> | undefined;
    function Harness() {
      latestSession = useAuthSession();
      return null;
    }

    render(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>,
    );

    expect(initSpy).toHaveBeenCalled();
    await latestSession?.sendEmailCode({ email: "ada@example.com", captchaToken: "tok" });
    await latestSession?.verifyEmailCode({ email: "ada@example.com", otp: "123456" });
    await latestSession?.signInWithGoogle();
    await latestSession?.signInWithGitHub();
    expect(sendSpy).toHaveBeenCalledWith({ email: "ada@example.com", captchaToken: "tok" });
    expect(verifySpy).toHaveBeenCalledWith({ email: "ada@example.com", otp: "123456" });
    expect(googleSpy).toHaveBeenCalledTimes(1);
    expect(githubSpy).toHaveBeenCalledTimes(1);

    await latestSession?.signOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: queryKeys.prompts.all });
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: queryKeys.preferences.onboarding() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.billing.status() });
  });
});
