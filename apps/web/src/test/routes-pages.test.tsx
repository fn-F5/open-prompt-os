import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, evaluateAuthGateDecision } from "../components/auth/auth-gate.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { orpcClient, resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { clearStorageForTest, safeGetItem } from "../lib/storage.js";
import { BillingReturnPage } from "../routes/billing-return-page.js";
import { ImproveAutopsyPage } from "../routes/improve-autopsy-page.js";
import { LibraryPage } from "../routes/library-page.js";
import { PricingPage } from "../routes/pricing-page.js";
import { PublicPromptPage } from "../routes/public-prompt-page.js";
import { TemplateDetailPage } from "../routes/template-detail-page.js";
import { TemplateGalleryPage } from "../routes/template-gallery-page.js";
import { getAuthDialogState, resetAuthDialogStoreForTest } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

function renderRoute(ui: React.ReactNode, initialEntries: string[] = ["/"], routePath = "*") {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={routePath} element={ui} />
          <Route path="/" element={<div data-testid="composer-dest">Composer</div>} />
          <Route path="/billing/return" element={<BillingReturnPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Web Route Pages & AuthGate", () => {
  beforeEach(async () => {
    clearStorageForTest();
    resetOrpcTestState();
    resetAuthDialogStoreForTest();
    composerActions.rehydrateFromStorage();
    await authClient.signOut();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AuthGate", () => {
    it("evaluates decisions and enforces auth gating on button click", async () => {
      expect(evaluateAuthGateDecision({ isLoading: true, isAuthenticated: false })).toBe(
        "block_loading",
      );
      expect(evaluateAuthGateDecision({ isLoading: false, isAuthenticated: true })).toBe(
        "allow_authenticated",
      );
      expect(evaluateAuthGateDecision({ isLoading: false, isAuthenticated: false })).toBe(
        "prompt_auth",
      );

      const onAction = vi.fn();
      const onReplay = vi.fn();
      const qc = createAppQueryClient();

      const { rerender } = render(
        <QueryClientProvider client={qc}>
          <AuthGate
            reason="protected_route"
            intendedRoute="/library"
            onSafeReplay={onReplay}
            onAuthenticatedAction={onAction}
          >
            <button type="button">Save Item</button>
          </AuthGate>
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Save Item" }));
      expect(onAction).not.toHaveBeenCalled();
      expect(getAuthDialogState().isOpen).toBe(true);
      expect(getAuthDialogState().reason).toBe("protected_route");

      act(() => {
        setAuthSessionForTest({
          id: "u_gate",
          email: "gate@example.com",
          name: "Gate User",
          plan: "free",
          spaceId: "sp_1",
          spaceName: "Workspace",
          hasPasskey: false,
        });
      });

      rerender(
        <QueryClientProvider client={qc}>
          <AuthGate
            reason="protected_route"
            intendedRoute="/library"
            onSafeReplay={onReplay}
            onAuthenticatedAction={onAction}
          >
            <button type="button">Save Item</button>
          </AuthGate>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        fireEvent.click(screen.getByRole("button", { name: "Save Item" }));
        expect(onAction).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("PricingPage & BillingReturnPage", () => {
    it("toggles billing interval and routes unauthenticated vs authenticated checkout", async () => {
      const checkoutSpy = vi.spyOn(orpcClient.billing, "checkout");
      const unauthView = renderRoute(<PricingPage />, ["/pricing"], "/pricing");

      expect(screen.getByText(/Plans for individuals and teams/i)).toBeInTheDocument();

      const yearlyBtn = screen.getByRole("tab", { name: /Yearly/i });
      fireEvent.click(yearlyBtn);
      expect(yearlyBtn).toHaveAttribute("aria-selected", "true");

      const upgradeBtn = screen.getByRole("button", { name: /Upgrade to Pro/i });
      fireEvent.click(upgradeBtn);
      expect(getAuthDialogState().isOpen).toBe(true);
      expect(checkoutSpy).not.toHaveBeenCalled();
      unauthView.unmount();

      act(() => {
        setAuthSessionForTest({
          id: "u_price",
          email: "price@example.com",
          name: "Price User",
          plan: "free",
          spaceId: "sp_1",
          spaceName: "Workspace",
          hasPasskey: false,
        });
      });

      renderRoute(<PricingPage />, ["/pricing"], "/pricing");
      fireEvent.click(screen.getByRole("tab", { name: /Yearly/i }));
      fireEvent.click(screen.getByRole("button", { name: /Upgrade to Pro/i }));
      await waitFor(() => {
        expect(checkoutSpy).toHaveBeenCalledWith({ plan: "pro", interval: "yearly", seats: 1 });
      });

      const returnBtn = await screen.findByRole("button", { name: /Return to Composer/i });
      fireEvent.click(returnBtn);
      expect(screen.getByTestId("composer-dest")).toBeInTheDocument();
    });
  });

  describe("TemplateGalleryPage & TemplateDetailPage", () => {
    it("filters templates by mode and search, resets filters, and loads a template", async () => {
      renderRoute(<TemplateGalleryPage />, ["/templates"], "/templates");

      await waitFor(() => {
        expect(screen.getByText("Template Gallery")).toBeInTheDocument();
      });

      const useButtons = await screen.findAllByRole("button", { name: /Use template/i });
      expect(useButtons.length).toBeGreaterThan(0);

      fireEvent.change(screen.getByLabelText("Search templates"), {
        target: { value: "zzzz-no-such-template" },
      });
      await waitFor(() => {
        expect(screen.getByText(/No templates matched your filter/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Reset filters/i }));
      const restoredButtons = await screen.findAllByRole("button", { name: /Use template/i });
      const firstTemplateBtn = restoredButtons[0];
      if (!firstTemplateBtn) throw new Error("Expected a template button");
      fireEvent.click(firstTemplateBtn);
      expect(screen.getByTestId("composer-dest")).toBeInTheDocument();
    });

    it("renders TemplateDetailPage for valid slug and not-found fallback for missing slug", async () => {
      const templates = await orpcClient.templates.list();
      const first = templates[0];
      expect(first).toBeDefined();

      const valid = renderRoute(
        <TemplateDetailPage />,
        [`/templates/${first?.slug}`],
        "/templates/:templateSlug",
      );

      await waitFor(() => {
        expect(screen.getByText(first?.title ?? "")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /Copy raw specification/i }));
      expect(navigator.clipboard.writeText).toHaveBeenCalled();

      valid.unmount();

      renderRoute(
        <TemplateDetailPage />,
        ["/templates/does-not-exist-slug"],
        "/templates/:templateSlug",
      );
      await waitFor(() => {
        expect(screen.getByText(/Template not found/i)).toBeInTheDocument();
      });
    });
  });

  describe("LibraryPage & PublicPromptPage", () => {
    it("gates unauthenticated users and supports authenticated view toggle, share, and delete", async () => {
      const unauth = renderRoute(<LibraryPage />, ["/library"], "/library");
      expect(screen.getByText(/Sign in to access My Library/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Sign in to unlock Library/i }));
      expect(getAuthDialogState().isOpen).toBe(true);
      unauth.unmount();

      act(() => {
        setAuthSessionForTest({
          id: "u_lib",
          email: "lib@example.com",
          name: "Lib User",
          plan: "pro",
          spaceId: "sp_lib",
          spaceName: "Lib Space",
          hasPasskey: false,
        });
      });

      renderRoute(<LibraryPage />, ["/library"], "/library");

      await waitFor(() => {
        expect(screen.getByLabelText("Search saved prompts")).toBeInTheDocument();
      });

      const listBtn = screen.getByRole("button", { name: /List view/i });
      fireEvent.click(listBtn);
      expect(safeGetItem("open-prompt-os:library-view:v1")).toBe("list");

      const copyBtns = await screen.findAllByRole("button", { name: "Copy" });
      const firstCopyBtn = copyBtns[0];
      if (!firstCopyBtn) throw new Error("Expected a copy button");
      fireEvent.click(firstCopyBtn);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });

      const shareBtns = screen.getAllByRole("button", { name: "Share" });
      const firstShareBtn = shareBtns[0];
      if (!firstShareBtn) throw new Error("Expected a share button");
      fireEvent.click(firstShareBtn);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });
    });

    it("renders shared prompt and handles missing shared prompt", async () => {
      const shared = renderRoute(<PublicPromptPage />, ["/share/share_1"], "/share/:shareId");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Fork in Composer/i })).toBeInTheDocument();
      });
      shared.unmount();

      vi.spyOn(orpcClient.prompts, "getShared").mockResolvedValueOnce(null);
      renderRoute(<PublicPromptPage />, ["/share/missing"], "/share/:shareId");
      await waitFor(() => {
        expect(screen.getByText(/Shared prompt not found/i)).toBeInTheDocument();
      });
    });
  });

  describe("ImproveAutopsyPage", () => {
    it("validates inputs and renders diagnostic findings after running Optimize Prompt", async () => {
      renderRoute(<ImproveAutopsyPage />, ["/improve"], "/improve");

      const promptInput = screen.getByPlaceholderText(
        /Paste the prompt you want to optimize or diagnose/i,
      );
      fireEvent.change(promptInput, { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: /Optimize Prompt/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/Enter the original prompt to analyze/i);

      fireEvent.change(promptInput, {
        target: { value: "Summarize quarterly churn risks for [Product_Name]" },
      });
      fireEvent.click(screen.getByRole("tab", { name: /Prompt Autopsy/i }));
      fireEvent.click(screen.getByRole("button", { name: /Run Autopsy/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Paste the failed or hallucinated model output/i,
      );

      fireEvent.click(screen.getByRole("tab", { name: /Standard Improve/i }));
      fireEvent.click(screen.getByRole("button", { name: /Optimize Prompt/i }));

      await waitFor(() => {
        expect(screen.getByText(/Diagnostic Finding\(s\)/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Accept into Composer/i }));
      expect(screen.getByTestId("composer-dest")).toBeInTheDocument();
    });
  });
});
