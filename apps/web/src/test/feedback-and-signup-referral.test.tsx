import { ToastViewport, clearToasts } from "@open-prompt-os/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { AuthDialog } from "../components/auth/auth-dialog.js";
import { FeedbackDialog } from "../components/feedback/feedback-dialog.js";
import { AppNavbar, MarketingNavbar } from "../components/navigation/navbar.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { orpcClient, resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { PENDING_REFERRAL_STORAGE_KEY } from "../lib/signup-referral.js";
import { clearStorageForTest } from "../lib/storage.js";
import { getTelemetryHistory, sanitizeTelemetryProperties } from "../lib/telemetry.js";
import {
  getAuthDialogState,
  openAuthDialog,
  resetAuthDialogStoreForTest,
} from "../state/auth-dialog-store.js";
import {
  getFeedbackDialogState,
  openFeedbackDialog,
  resetFeedbackDialogStoreForTest,
} from "../state/feedback-dialog-store.js";

function renderWithApp(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Anytime Feedback / Feature Requests & Signup Attribution", () => {
  beforeEach(async () => {
    clearStorageForTest();
    clearToasts();
    window.sessionStorage.clear();
    resetOrpcTestState();
    resetAuthDialogStoreForTest();
    resetFeedbackDialogStoreForTest();
    await authClient.signOut();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Anytime Feedback & Feature Request Dialog + Triggers", () => {
    it("opens FeedbackDialog from MarketingNavbar (desktop & mobile) and HybridLayout footer for guests", async () => {
      renderWithApp(<AppRoutes />, ["/"]);

      // Desktop navbar Feedback button
      const navBtn = screen.getByRole("button", { name: "Send feedback or feature request" });
      fireEvent.click(navBtn);

      expect(getFeedbackDialogState()).toMatchObject({
        isOpen: true,
        defaultKind: "feature_request",
        source: "navbar",
      });
      expect(
        screen.getByRole("heading", { name: "Feedback & Feature Requests" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Email for follow-up/i)).toBeInTheDocument();

      // Close via Cancel
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(getFeedbackDialogState().isOpen).toBe(false);

      // Mobile menu Feedback trigger
      fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
      const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
      const mobileFeedbackBtn = Array.from(mobileNav.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Feedback & Feature Requests"),
      );
      expect(mobileFeedbackBtn).toBeDefined();
      if (mobileFeedbackBtn) fireEvent.click(mobileFeedbackBtn);
      expect(getFeedbackDialogState().isOpen).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      // Footer Feedback trigger
      const footer = screen.getByRole("contentinfo", { name: "Site footer" });
      const footerBtn = Array.from(footer.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Feedback & Feature Requests"),
      );
      expect(footerBtn).toBeDefined();
      if (footerBtn) fireEvent.click(footerBtn);
      expect(getFeedbackDialogState()).toMatchObject({
        isOpen: true,
        source: "footer",
      });
    });

    it("opens FeedbackDialog from AppNavbar and authenticated workspace footer", async () => {
      await act(async () => {
        setAuthSessionForTest({
          id: "usr_auth_1",
          email: "ada@example.com",
          name: "Ada",
          spaceId: "spc_auth_1",
          spaceName: "Ada's Workspace",
          plan: "free",
          hasPasskey: false,
        });
      });

      renderWithApp(<AppRoutes />, ["/"]);

      const navBtn = screen.getByRole("button", { name: "Send feedback or feature request" });
      fireEvent.click(navBtn);
      expect(getFeedbackDialogState().isOpen).toBe(true);
      // Follow-up email field is omitted for authenticated users
      expect(screen.queryByLabelText(/Email for follow-up/i)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      const authFooter = screen.getByRole("contentinfo", { name: "Site footer" });
      const footerBtn = Array.from(authFooter.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Feedback & Feature Requests"),
      );
      expect(footerBtn).toBeDefined();
      if (footerBtn) fireEvent.click(footerBtn);
      expect(getFeedbackDialogState()).toMatchObject({
        isOpen: true,
        source: "footer",
      });
    });

    it("validates minimum message length, switches categories, submits feedback, and shows toast", async () => {
      const submitSpy = vi.spyOn(orpcClient.feedback, "submit");
      openFeedbackDialog({ defaultKind: "feature_request", source: "navbar" });

      renderWithApp(
        <>
          <MarketingNavbar />
          <FeedbackDialog />
          <ToastViewport />
        </>,
        ["/templates"],
      );

      // Too-short message triggers client validation without calling API
      fireEvent.change(screen.getByLabelText("Details"), { target: { value: "abc" } });
      fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Please provide at least 5 characters of detail.",
      );
      expect(submitSpy).not.toHaveBeenCalled();

      // Switch to Bug Report tab
      const bugTab = screen.getByRole("tab", { name: "Bug Report" });
      fireEvent.click(bugTab);
      expect(bugTab).toHaveAttribute("aria-selected", "true");

      // Fill summary, details, and guest email
      fireEvent.change(screen.getByLabelText(/Short summary/i), {
        target: { value: "Mobile dialog scroll" },
      });
      fireEvent.change(screen.getByLabelText("Details"), {
        target: { value: "When keyboard opens on iOS Safari, footer button clips slightly." },
      });
      fireEvent.change(screen.getByLabelText(/Email for follow-up/i), {
        target: { value: "reporter@example.com" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledWith({
          kind: "bug_report",
          title: "Mobile dialog scroll",
          message: "When keyboard opens on iOS Safari, footer button clips slightly.",
          contactEmail: "reporter@example.com",
          pagePath: "/templates",
        });
        expect(getFeedbackDialogState().isOpen).toBe(false);
      });

      expect(await screen.findByText("Thank you for your feedback!")).toBeInTheDocument();

      const lastEvent = getTelemetryHistory().at(-1);
      expect(lastEvent?.event).toBe("feedback_submitted");
      expect(lastEvent?.properties).toEqual({
        kind: "bug_report",
        authenticated: false,
      });

      // Verify telemetry sanitizer strips sensitive feedback fields
      const sanitized = sanitizeTelemetryProperties({
        kind: "bug_report",
        message: "SECRET",
        contactEmail: "reporter@example.com",
      });
      expect(sanitized).toEqual({ kind: "bug_report" });
    });

    it("keeps FeedbackDialog open and displays an error alert if submission fails", async () => {
      vi.spyOn(orpcClient.feedback, "submit").mockRejectedValueOnce(
        new Error("Server temporarily unavailable"),
      );
      openFeedbackDialog();

      renderWithApp(<FeedbackDialog />);

      fireEvent.change(screen.getByLabelText("Details"), {
        target: { value: "Add team shared prompt folders." },
      });
      fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Server temporarily unavailable");
      expect(getFeedbackDialogState().isOpen).toBe(true);
    });

    it("supports standalone listMine and feedback validation in orpcClient", async () => {
      // Guest listMine returns empty
      expect(await orpcClient.feedback.listMine()).toEqual([]);

      await expect(
        orpcClient.feedback.submit({ kind: "general_feedback", message: "no" }),
      ).rejects.toThrow(/between 5 and 2,000 characters/i);

      await act(async () => {
        setAuthSessionForTest({
          id: "usr_fb",
          email: "fb@example.com",
          name: "FB User",
          spaceId: "spc_fb",
          spaceName: "FB Space",
          plan: "free",
          hasPasskey: false,
        });
      });

      await orpcClient.feedback.submit({
        kind: "feature_request",
        title: "CSV export",
        message: "Export prompt history as CSV.",
      });
      const list = await orpcClient.feedback.listMine();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        kind: "feature_request",
        title: "CSV export",
        status: "open",
      });
    });
  });

  describe("2. Signup-Only 'How did you come to know about us? (optional)'", () => {
    it("hides referral question on Sign In mode and shows it on Get Started / signup mode", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });

      renderWithApp(
        <>
          <MarketingNavbar />
          <AuthDialog />
        </>,
      );

      // Clicking "Sign In" opens signin mode -> referral question MUST NOT appear
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      expect(getAuthDialogState().mode).toBe("signin");
      expect(screen.getByText("Sign In to Open Prompt OS")).toBeInTheDocument();
      expect(screen.queryByLabelText(/How did you come to know about us/i)).toBeNull();

      // User can switch to the Sign Up tab inside the dialog
      fireEvent.click(screen.getByRole("tab", { name: "Sign Up" }));
      expect(screen.getByText("Create your Open Prompt OS Workspace")).toBeInTheDocument();
      expect(screen.getByLabelText(/How did you come to know about us/i)).toBeInTheDocument();

      // Close and click "Get Started" -> opens directly in signup mode
      fireEvent.click(screen.getByRole("button", { name: "Keep working as guest" }));
      fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
      expect(getAuthDialogState().mode).toBe("signup");
      expect(screen.getByLabelText(/How did you come to know about us/i)).toBeInTheDocument();
    });

    it("reveals custom detail input only when 'other' is selected and records attribution on OTP signup", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
      vi.spyOn(authClient, "checkSignupStatus").mockResolvedValue(true);
      vi.spyOn(authClient, "verifyEmailCode").mockResolvedValue({
        id: "usr_new_1",
        email: "newuser@example.com",
        name: "New User",
        spaceId: "spc_new_1",
        spaceName: "New User's Workspace",
        plan: "free",
        hasPasskey: false,
      });
      const recordSpy = vi
        .spyOn(orpcClient.userPreferences, "recordSignupAttribution")
        .mockResolvedValue({ recorded: true, referralSource: "other" });

      openAuthDialog({ reason: "save_prompt" });
      renderWithApp(<AuthDialog />);

      const select = await screen.findByLabelText(/How did you come to know about us/i);
      expect(screen.queryByPlaceholderText("Please specify (optional)")).toBeNull();

      fireEvent.change(select, { target: { value: "other" } });
      const detailInput = screen.getByPlaceholderText("Please specify (optional)");
      expect(detailInput).toBeInTheDocument();
      fireEvent.change(detailInput, { target: { value: "Tech conference talk" } });

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "newuser@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

      const codeInput = await screen.findByLabelText("Sign-in code");
      fireEvent.change(codeInput, { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

      await waitFor(() => {
        expect(recordSpy).toHaveBeenCalledWith({
          referralSource: "other",
          referralDetail: "Tech conference talk",
        });
        expect(getAuthDialogState().isOpen).toBe(false);
      });

      const lastEvent = getTelemetryHistory().at(-1);
      expect(lastEvent?.event).toBe("signup_attribution_recorded");
      expect(lastEvent?.properties).toEqual({ referralSource: "other" });
    });

    it("hides attribution on OTP code step when checkSignupStatus detects an existing user, and shows it if a Sign-In user is actually new", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
      const statusSpy = vi
        .spyOn(authClient, "checkSignupStatus")
        .mockResolvedValueOnce(false) // Case 1: existing user clicked Get Started
        .mockResolvedValueOnce(true); // Case 2: brand new user clicked Sign In

      // Case 1: started in signup mode, but email already exists
      openAuthDialog({ reason: "navbar_signin", mode: "signup" });
      const first = renderWithApp(<AuthDialog />);
      expect(screen.getByLabelText(/How did you come to know about us/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "existing@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

      await screen.findByLabelText("Sign-in code");
      expect(statusSpy).toHaveBeenCalledWith("existing@example.com");
      expect(screen.queryByLabelText(/How did you come to know about us/i)).toBeNull();
      first.unmount();

      // Case 2: started in signin mode, but email is a brand-new user
      openAuthDialog({ reason: "navbar_signin", mode: "signin" });
      renderWithApp(<AuthDialog />);
      expect(screen.queryByLabelText(/How did you come to know about us/i)).toBeNull();

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "brandnew@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

      await screen.findByLabelText("Sign-in code");
      expect(screen.getByLabelText(/How did you come to know about us/i)).toBeInTheDocument();
    });

    it("does not call recordSignupAttribution when optional dropdown is left unselected", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
      vi.spyOn(authClient, "checkSignupStatus").mockResolvedValue(true);
      vi.spyOn(authClient, "verifyEmailCode").mockResolvedValue({
        id: "usr_skip",
        email: "skip@example.com",
        name: "Skip User",
        spaceId: "spc_skip",
        spaceName: "Skip's Workspace",
        plan: "free",
        hasPasskey: false,
      });
      const recordSpy = vi.spyOn(orpcClient.userPreferences, "recordSignupAttribution");

      openAuthDialog({ reason: "quota_limit" });
      renderWithApp(<AuthDialog />);

      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "skip@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
      fireEvent.change(await screen.findByLabelText("Sign-in code"), {
        target: { value: "654321" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

      await waitFor(() => {
        expect(getAuthDialogState().isOpen).toBe(false);
      });
      expect(recordSpy).not.toHaveBeenCalled();
    });

    it("stores pending referral in sessionStorage for OAuth signup and flushes it once authenticated", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: true,
        github: true,
      });
      const googleSpy = vi
        .spyOn(authClient, "signInWithGoogle")
        .mockRejectedValueOnce(new Error("Popup closed"))
        .mockResolvedValueOnce();

      openAuthDialog({ reason: "navbar_signin", mode: "signup" });
      const dialogView = renderWithApp(<AuthDialog />);

      const select = await screen.findByLabelText(/How did you come to know about us/i);
      fireEvent.change(select, { target: { value: "ai_assistant" } });

      // Failed OAuth clears pending referral so it doesn't linger
      const googleBtn = await screen.findByRole("button", { name: /Continue with Google/i });
      fireEvent.click(googleBtn);
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Popup closed");
      });
      expect(window.sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)).toBeNull();

      // Successful OAuth redirect stores pending referral
      fireEvent.click(googleBtn);
      await waitFor(() => {
        expect(googleSpy).toHaveBeenCalledTimes(2);
      });
      expect(window.sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)).toBe(
        JSON.stringify({ referralSource: "ai_assistant" }),
      );
      dialogView.unmount();

      // Simulate returning from OAuth callback into HybridLayout with active session
      const recordSpy = vi.spyOn(orpcClient.userPreferences, "recordSignupAttribution");
      await act(async () => {
        setAuthSessionForTest({
          id: "usr_oauth_1",
          email: "oauth@example.com",
          name: "OAuth User",
          spaceId: "spc_oauth_1",
          spaceName: "OAuth Workspace",
          plan: "free",
          hasPasskey: false,
        });
      });

      renderWithApp(<AppRoutes />, ["/"]);

      await waitFor(() => {
        expect(recordSpy).toHaveBeenCalledWith({ referralSource: "ai_assistant" });
      });
      expect(window.sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY)).toBeNull();
    });

    it("enforces write-once semantics in standalone orpcClient.userPreferences.recordSignupAttribution", async () => {
      // Unauthenticated returns recorded: false
      expect(
        await orpcClient.userPreferences.recordSignupAttribution({
          referralSource: "search_engine",
        }),
      ).toEqual({ recorded: false, referralSource: null });

      await act(async () => {
        setAuthSessionForTest({
          id: "usr_once",
          email: "once@example.com",
          name: "Once",
          spaceId: "spc_once",
          spaceName: "Once Space",
          plan: "free",
          hasPasskey: false,
        });
      });

      expect(
        await orpcClient.userPreferences.recordSignupAttribution({
          referralSource: "github_or_open_source",
        }),
      ).toEqual({ recorded: true, referralSource: "github_or_open_source" });

      expect(
        await orpcClient.userPreferences.recordSignupAttribution({
          referralSource: "social_media",
        }),
      ).toEqual({ recorded: false, referralSource: "github_or_open_source" });
    });

    it("still closes AuthDialog cleanly if recordSignupAttribution rejects", async () => {
      vi.spyOn(authClient, "getOAuthProviders").mockResolvedValue({
        google: false,
        github: false,
      });
      vi.spyOn(authClient, "sendEmailCode").mockResolvedValue();
      vi.spyOn(authClient, "checkSignupStatus").mockResolvedValue(true);
      vi.spyOn(authClient, "verifyEmailCode").mockResolvedValue({
        id: "usr_err",
        email: "err@example.com",
        name: "Err",
        spaceId: "spc_err",
        spaceName: "Err Space",
        plan: "free",
        hasPasskey: false,
      });
      vi.spyOn(orpcClient.userPreferences, "recordSignupAttribution").mockRejectedValueOnce(
        new Error("Network error"),
      );

      openAuthDialog({ reason: "save_prompt" });
      renderWithApp(<AuthDialog />);

      fireEvent.change(await screen.findByLabelText(/How did you come to know about us/i), {
        target: { value: "blog_or_newsletter" },
      });
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "err@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
      fireEvent.change(await screen.findByLabelText("Sign-in code"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

      await waitFor(() => {
        expect(getAuthDialogState().isOpen).toBe(false);
      });
    });
  });
});
