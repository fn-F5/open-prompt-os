import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { darkThemeTokens, lightThemeTokens } from "@open-prompt-os/ui-tokens";
import { Input, Textarea } from "@open-prompt-os/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { AuthDialog } from "../components/auth/auth-dialog.js";
import { type AuthSessionState, useAuthSession } from "../hooks/use-auth-session.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { createAppQueryClient } from "../lib/query-client.js";
import {
  getAuthDialogState,
  openAuthDialog,
  resetAuthDialogStoreForTest,
} from "../state/auth-dialog-store.js";

function renderWithRouter(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Auth UI, Passkey removal, Settings & Placeholder tokens", () => {
  beforeEach(async () => {
    resetAuthDialogStoreForTest();
    await authClient.signOut();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AuthDialog", () => {
    it("uses John Doe and 6-digit code placeholders and omits Passkey option even when WebAuthn exists", async () => {
      Object.defineProperty(window, "PublicKeyCredential", {
        value: function MockPublicKeyCredential() {},
        configurable: true,
      });
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      const sendEmailCodeSpy = vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();

      openAuthDialog({ reason: "navbar_signin" });
      renderWithRouter(<AuthDialog />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
      });
      expect(screen.queryByPlaceholderText("Alex Rivera")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue with Passkey/i })).toBeNull();
      expect(screen.queryByText(/hardware passkey/i)).toBeNull();
      expect(screen.queryByText(/or continue with email/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /Continue with Google/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Continue with GitHub/i })).toBeNull();

      const emailInput = screen.getByPlaceholderText("you@company.com");
      fireEvent.change(emailInput, { target: { value: "user@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: /Email me a code/i }));

      await waitFor(() => {
        expect(sendEmailCodeSpy).toHaveBeenCalledWith({ email: "user@example.com" });
        expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
      });
      expect(screen.queryByPlaceholderText("123456")).not.toBeInTheDocument();
    });

    it("renders Google and GitHub buttons when enabled and triggers OAuth sign-in", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: true,
        github: true,
      });
      const googleSpy = vi.spyOn(authClient, "signInWithGoogle").mockResolvedValue();
      const githubSpy = vi.spyOn(authClient, "signInWithGitHub").mockResolvedValue();

      openAuthDialog({ reason: "navbar_signin" });
      const firstRender = renderWithRouter(<AuthDialog />);

      const googleBtn = await screen.findByRole("button", { name: /Continue with Google/i });
      expect(screen.getByRole("button", { name: /Continue with GitHub/i })).toBeInTheDocument();
      expect(screen.getByText(/or continue with email/i)).toBeInTheDocument();

      fireEvent.click(googleBtn);
      await waitFor(() => expect(googleSpy).toHaveBeenCalledTimes(1));
      expect(googleBtn).toBeDisabled();

      firstRender.unmount();
      renderWithRouter(<AuthDialog />);
      const githubBtn = await screen.findByRole("button", { name: /Continue with GitHub/i });
      fireEvent.click(githubBtn);
      await waitFor(() => expect(githubSpy).toHaveBeenCalledTimes(1));
    });

    it("completes email OTP verification, supports switching email, and surfaces errors", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
      const verifySpy = vi
        .spyOn(authClient, "verifyEmailCode")
        .mockRejectedValueOnce(new Error("Invalid code"))
        .mockResolvedValueOnce({
          id: "u1",
          email: "user@example.com",
          name: "John Doe",
          spaceId: "s1",
          spaceName: "John Doe's Workspace",
          plan: "free",
          hasPasskey: false,
        });

      openAuthDialog({ reason: "save_prompt" });
      renderWithRouter(<AuthDialog />);

      fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("John Doe"), {
        target: { value: "John Doe" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Email me a code/i }));

      const codeInput = await screen.findByPlaceholderText("6-digit code");
      fireEvent.change(codeInput, { target: { value: "111111" } });
      fireEvent.click(screen.getByRole("button", { name: /Verify code/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Invalid code");
      });

      // Switch email clears code and error
      fireEvent.click(screen.getByRole("button", { name: /Use another email/i }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByPlaceholderText("6-digit code")).toBeNull();

      // Re-submit and succeed
      fireEvent.click(screen.getByRole("button", { name: /Email me a code/i }));
      const nextCodeInput = await screen.findByPlaceholderText("6-digit code");
      fireEvent.change(nextCodeInput, { target: { value: "654321" } });
      fireEvent.click(screen.getByRole("button", { name: /Verify code/i }));

      await waitFor(() => {
        expect(verifySpy).toHaveBeenLastCalledWith({
          email: "user@example.com",
          otp: "654321",
          name: "John Doe",
        });
        expect(getAuthDialogState().isOpen).toBe(false);
      });
    });
  });

  describe("Settings routes without Passkeys", () => {
    it("hides Passkeys & Security tab and redirects /settings/security to /settings/profile", async () => {
      setAuthSessionForTest({
        id: "u1",
        email: "john@example.com",
        name: "John Doe",
        spaceId: "s1",
        spaceName: "John's Workspace",
        plan: "free",
        hasPasskey: false,
      });

      renderWithRouter(<AppRoutes />, ["/settings/security"]);

      await waitFor(() => {
        expect(screen.getByText("Profile & Workspace")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Passkeys & Security/i)).toBeNull();
      expect(screen.queryByText(/Register Passkey/i)).toBeNull();
      expect(screen.getByText("Profile & Space")).toBeInTheDocument();
    });

    it("does not mention passkeys on the unauthenticated settings gate", () => {
      renderWithRouter(<AppRoutes />, ["/settings/profile"]);
      expect(screen.getByText("Sign in to manage Workspace Settings")).toBeInTheDocument();
      expect(screen.queryByText(/passkey/i)).toBeNull();
    });
  });

  describe("useAuthSession reference stability", () => {
    it("returns stable action callbacks across re-renders", () => {
      const captured: AuthSessionState[] = [];
      function Probe({ count }: { count: number }) {
        const session = useAuthSession();
        captured.push(session);
        return <span data-count={count} />;
      }

      const { rerender } = renderWithRouter(<Probe count={1} />);
      rerender(
        <QueryClientProvider client={createAppQueryClient()}>
          <MemoryRouter>
            <Probe count={2} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(captured.length).toBeGreaterThanOrEqual(2);
      const first = captured[0];
      const second = captured[captured.length - 1];
      expect(second?.sendEmailCode).toBe(first?.sendEmailCode);
      expect(second?.verifyEmailCode).toBe(first?.verifyEmailCode);
      expect(second?.signInWithGoogle).toBe(first?.signInWithGoogle);
      expect(second?.signInWithGitHub).toBe(first?.signInWithGitHub);
    });
  });

  describe("Placeholder tokens & Input components", () => {
    it("uses --text-placeholder on Input and Textarea and defines distinct dark/light token values", () => {
      render(
        <div>
          <Input placeholder="John Doe" />
          <Textarea placeholder="Prompt intent" />
        </div>,
      );

      const input = screen.getByPlaceholderText("John Doe");
      const textarea = screen.getByPlaceholderText("Prompt intent");
      expect(input.className).toContain("placeholder:text-[var(--text-placeholder)]");
      expect(textarea.className).toContain("placeholder:text-[var(--text-placeholder)]");

      expect(darkThemeTokens["--text-placeholder"]).not.toBe(darkThemeTokens["--text-primary"]);
      expect(darkThemeTokens["--text-placeholder"]).not.toBe(darkThemeTokens["--text-muted"]);
      expect(lightThemeTokens["--text-placeholder"]).not.toBe(lightThemeTokens["--text-primary"]);
      expect(lightThemeTokens["--text-placeholder"]).not.toBe(lightThemeTokens["--text-muted"]);

      const css = readFileSync(
        resolve(process.cwd(), "../../packages/ui-web/src/styles.css"),
        "utf8",
      );
      expect(css).toContain(`--text-placeholder: ${darkThemeTokens["--text-placeholder"]};`);
      expect(css).toContain(`--text-placeholder: ${lightThemeTokens["--text-placeholder"]};`);
    });
  });
});
