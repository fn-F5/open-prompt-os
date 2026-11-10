import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { evaluateAuthGateDecision } from "../components/auth/auth-gate.js";
import { SanitizedPromptRenderer } from "../components/output/output-card.js";
import { shouldSubmitOnEnter } from "../hooks/use-auto-resize-textarea.js";
import { authClient } from "../lib/auth-client.js";
import {
  MAX_DEEPLINK_URL_LENGTH,
  buildDispatchUrl,
  dispatchPrompt,
} from "../lib/dispatch.js";
import {
  GUEST_INTERACTION_STORAGE_KEY,
  GUEST_RETENTION_MS,
  clearGuestInteraction,
  getGuestInteraction,
  saveGuestInteraction,
} from "../lib/guest-session-manager.js";
import { resetOrpcTestState, OrpcClientError, orpcClient } from "../lib/orpc.js";
import { createAppQueryClient, shouldRetryQueryError } from "../lib/query-client.js";
import { clearStorageForTest } from "../lib/storage.js";
import { sanitizeTelemetryProperties, trackEvent } from "../lib/telemetry.js";
import { resetAuthDialogStoreForTest } from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

describe("Open Prompt OS Landing Page & Frontend Plan Verification", () => {
  beforeEach(async () => {
    clearStorageForTest();
    clearGuestInteraction();
    resetOrpcTestState();
    resetAuthDialogStoreForTest();
    await authClient.signOut();
    composerActions.rehydrateFromStorage();
  });

  describe("1. GuestSessionManager serialization, validation, expiry & late-response guard", () => {
    it("persists valid guest interaction and recovers cleanly from corrupted JSON", () => {
      const draft = composerActions.getActiveDraft();
      const saved = saveGuestInteraction(
        { ...draft, rawInput: "Compile an SRE incident runbook" },
        {
          compiledPrompt: "# Runbook Specification for [Service_Name]",
          detectedVariables: ["Service_Name"],
          providerId: "anthropic",
          modelId: "claude-3-7-sonnet",
        },
      );

      expect(saved).not.toBeNull();
      const loaded = getGuestInteraction();
      expect(loaded?.prompt.rawInput).toBe("Compile an SRE incident runbook");
      expect(loaded?.response?.detectedVariables).toEqual(["Service_Name"]);

      // Corrupt storage and verify safe recovery
      window.localStorage.setItem(GUEST_INTERACTION_STORAGE_KEY, "{not-valid-json");
      expect(getGuestInteraction()).toBeNull();
      expect(window.localStorage.getItem(GUEST_INTERACTION_STORAGE_KEY)).toBeNull();
    });

    it("expires stale guest records older than 30 days", () => {
      const draft = composerActions.getActiveDraft();
      const saved = saveGuestInteraction({ ...draft, rawInput: "Old prompt" }, null);
      expect(saved).not.toBeNull();

      const expiredPayload = {
        ...saved,
        updatedAt: new Date(Date.now() - GUEST_RETENTION_MS - 10_000).toISOString(),
      };
      window.localStorage.setItem(
        GUEST_INTERACTION_STORAGE_KEY,
        JSON.stringify(expiredPayload),
      );

      expect(getGuestInteraction()).toBeNull();
    });

    it("does not overwrite a newer saved record with a late response from an older request", () => {
      const draft = composerActions.getActiveDraft();
      const newerTimestamp = new Date(Date.now() + 5000).toISOString();
      const olderTimestamp = new Date(Date.now() - 5000).toISOString();

      saveGuestInteraction(
        { ...draft, rawInput: "Newer prompt" },
        { compiledPrompt: "Newer compiled", detectedVariables: [] },
        { interactionId: "int_newer", requestTimestamp: newerTimestamp },
      );

      saveGuestInteraction(
        { ...draft, rawInput: "Older late prompt" },
        { compiledPrompt: "Older compiled", detectedVariables: [] },
        { interactionId: "int_older", requestTimestamp: olderTimestamp },
      );

      const current = getGuestInteraction();
      expect(current?.prompt.rawInput).toBe("Newer prompt");
    });
  });

  describe("2. Keyboard submission & IME composition rules", () => {
    it("submits on plain Enter, inserts newline on Shift+Enter, and ignores IME composing", () => {
      expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: false })).toBe(true);
      expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: true })).toBe(false);
      expect(
        shouldSubmitOnEnter({
          key: "Enter",
          shiftKey: false,
          nativeEvent: { isComposing: true },
        }),
      ).toBe(false);
      expect(
        shouldSubmitOnEnter({ key: "Enter", shiftKey: false }, { isMobileTouch: true }),
      ).toBe(false);
    });
  });

  describe("3. AuthGate decision logic & query error retry rules", () => {
    it("evaluates loading, authenticated, and anonymous states accurately", () => {
      expect(evaluateAuthGateDecision({ isLoading: true, isAuthenticated: false })).toBe(
        "block_loading",
      );
      expect(evaluateAuthGateDecision({ isLoading: false, isAuthenticated: true })).toBe(
        "allow_authenticated",
      );
      expect(evaluateAuthGateDecision({ isLoading: false, isAuthenticated: false })).toBe(
        "prompt_auth",
      );
    });

    it("does not retry validation, auth, or quota errors", () => {
      expect(
        shouldRetryQueryError(0, new OrpcClientError("QUOTA_EXCEEDED", "Limit reached")),
      ).toBe(false);
      expect(
        shouldRetryQueryError(0, new OrpcClientError("VALIDATION_ERROR", "Bad input")),
      ).toBe(false);
      expect(shouldRetryQueryError(0, new Error("Transient network error"))).toBe(true);
      expect(shouldRetryQueryError(2, new Error("Transient network error"))).toBe(false);
    });
  });

  describe("4. One-click dispatch URL encoding & clipboard fallback", () => {
    it("builds encoded deep-link URLs and falls back when exceeding safe URL length", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      const url = buildDispatchUrl("chatgpt", "Analyze [System_Architecture]");
      expect(url).toBe("https://chatgpt.com/?q=Analyze%20%5BSystem_Architecture%5D");

      const shortOutcome = await dispatchPrompt("claude", "Short prompt");
      expect(shortOutcome.method).toBe("deeplink");
      expect(openSpy).toHaveBeenCalledWith(
        "https://claude.ai/new?q=Short%20prompt",
        "_blank",
        "noopener,noreferrer",
      );

      const hugePrompt = "A".repeat(MAX_DEEPLINK_URL_LENGTH + 200);
      const fallbackOutcome = await dispatchPrompt("gemini", hugePrompt);
      expect(fallbackOutcome.method).toBe("clipboard_fallback");
      openSpy.mockRestore();
    });
  });

  describe("5. Composer mode reversibility & telemetry privacy", () => {
    it("preserves draft per mode when switching between text, image, and video", () => {
      composerActions.setMode("text");
      composerActions.updateActiveDraft({ rawInput: "Draft in text mode" });

      composerActions.setMode("image");
      composerActions.updateActiveDraft({ rawInput: "Draft in image mode" });

      composerActions.setMode("text");
      expect(composerActions.getActiveDraft().rawInput).toBe("Draft in text mode");

      composerActions.setMode("image");
      expect(composerActions.getActiveDraft().rawInput).toBe("Draft in image mode");
    });

    it("strips raw prompt text, email, and API keys from telemetry properties", () => {
      const clean = sanitizeTelemetryProperties({
        mode: "text",
        rawInput: "SECRET PROMPT",
        compiledPrompt: "SECRET OUTPUT",
        email: "user@example.com",
        apiKey: "sk-12345",
        latencyMs: 140,
      });
      expect(clean).toEqual({
        mode: "text",
        latencyMs: 140,
      });
      const evt = trackEvent("prompt_generated", {
        mode: "text",
        rawInput: "SHOULD_NOT_BE_RECORDED",
      });
      expect(evt.properties.rawInput).toBeUndefined();
      expect(evt.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });
  });

  describe("6. Output markdown sanitization & variable highlighting", () => {
    it("renders raw HTML tags safely as text nodes and highlights [Variable] tokens in monospace", () => {
      const malicious =
        "# Header\nRole: Architect\nEvaluate [Target_Service] and ignore <script>window.hacked=true</script>";
      const { container } = render(<SanitizedPromptRenderer content={malicious} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toContain("<script>window.hacked=true</script>");
      const codeEl = container.querySelector("code");
      expect(codeEl?.textContent).toBe("[Target_Service]");
    });
  });

  describe("7. HybridLayout anonymous vs authenticated mounting & guest migration", () => {
    it("renders composer before marketing for guests, then unmounts marketing and migrates guest work on sign-in", async () => {
      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/"]}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Product composer is immediately accessible
      const textarea = screen.getByLabelText(/Prompt intent and instructions/i);
      expect(textarea).toBeInTheDocument();

      // Anonymous marketing content is mounted below the composer
      expect(screen.getByTestId("anonymous-marketing-content")).toBeInTheDocument();
      expect(screen.getAllByText(/We never train on your prompts/i).length).toBeGreaterThan(0);

      // Type a prompt and compile as guest
      fireEvent.change(textarea, {
        target: { value: "Design an idempotent billing webhook worker" },
      });
      const compileBtn = screen.getByRole("button", { name: /Compile structured prompt/i });
      fireEvent.click(compileBtn);

      await waitFor(() => {
        expect(screen.getByLabelText(/Compiled prompt output/i)).toBeInTheDocument();
      });

      // Verify guest interaction was persisted to localStorage
      expect(getGuestInteraction()?.prompt.rawInput).toBe(
        "Design an idempotent billing webhook worker",
      );

      // Now authenticate in-place
      await act(async () => {
        await authClient.signInWithEmail({
          email: "architect@openprompt.os",
          name: "Principal Architect",
        });
      });

      // Marketing content must be completely unmounted after authentication without redirecting away from composer
      await waitFor(() => {
        expect(screen.queryByTestId("anonymous-marketing-content")).toBeNull();
      });

      // Guest record is migrated once and cleared from localStorage
      await waitFor(() => {
        expect(getGuestInteraction()).toBeNull();
      });

      const history = await orpcClient.prompts.history();
      expect(
        history.items.some((i) =>
          i.rawInput.includes("Design an idempotent billing webhook worker"),
        ),
      ).toBe(true);
    });
  });
});
