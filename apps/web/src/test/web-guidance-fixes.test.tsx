import { Dialog, Tooltip } from "@open-prompt-os/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedParameters } from "../components/composer/guided-parameters.js";
import { ModelPicker } from "../components/composer/model-picker.js";
import { PromptComposer } from "../components/composer/prompt-composer.js";
import { AppNavbar, MarketingNavbar } from "../components/navigation/navbar.js";
import { OutputCard } from "../components/output/output-card.js";
import {
  CARD_HOVER_ANIMATION,
  type CardAnimationKey,
  shouldAnimateCard,
  useCardParallax,
} from "../hooks/use-card-parallax.js";
import { useTypingPlaceholder } from "../hooks/use-typing-placeholder.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { orpcClient, resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { clearStorageForTest } from "../lib/storage.js";
import { composerActions } from "../state/composer-store.js";

describe("Modern Web Guidance fixes", () => {
  beforeEach(() => {
    clearStorageForTest();
    resetOrpcTestState();
    composerActions.rehydrateFromStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("1. GuidedParameters IME composition guard", () => {
    it("ignores Enter during IME composition and adds item on non-composing Enter", () => {
      const onUpdateDraft = vi.fn();
      const draft = composerActions.getActiveDraft();

      render(<GuidedParameters draft={draft} onUpdateDraft={onUpdateDraft} />);

      fireEvent.click(screen.getByRole("button", { name: /Constraints/i }));
      const input = screen.getByLabelText("Constraints");

      fireEvent.change(input, { target: { value: "日本語テスト" } });
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      expect(onUpdateDraft).not.toHaveBeenCalled();

      fireEvent.keyDown(input, { key: "Enter", isComposing: false });
      expect(onUpdateDraft).toHaveBeenCalledWith({ constraints: ["日本語テスト"] });
    });
  });

  describe("2. Native <dialog> in Dialog component", () => {
    it("uses native showModal/close when available and propagates onClose", () => {
      const originalShowModal = HTMLDialogElement.prototype.showModal;
      const originalClose = HTMLDialogElement.prototype.close;

      const showModalSpy = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
      const closeSpy = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      });

      HTMLDialogElement.prototype.showModal = showModalSpy;
      HTMLDialogElement.prototype.close = closeSpy;

      try {
        const onOpenChange = vi.fn();
        const { rerender } = render(
          <Dialog
            open={true}
            onOpenChange={onOpenChange}
            title="Native Modal"
            description="Top-layer dialog"
          >
            <button type="button">Action</button>
          </Dialog>,
        );

        expect(showModalSpy).toHaveBeenCalledTimes(1);
        const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Native Modal" });
        expect(dialog.tagName).toBe("DIALOG");
        expect(dialog).toHaveAttribute("closedby", "any");
        expect(dialog).toHaveAccessibleDescription("Top-layer dialog");

        // Simulate native close (e.g. Esc or closedby="any" light dismiss)
        act(() => {
          dialog.close();
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);

        rerender(
          <Dialog
            open={false}
            onOpenChange={onOpenChange}
            title="Native Modal"
            description="Top-layer dialog"
          >
            <button type="button">Action</button>
          </Dialog>,
        );
        expect(closeSpy).toHaveBeenCalled();
      } finally {
        HTMLDialogElement.prototype.showModal = originalShowModal;
        HTMLDialogElement.prototype.close = originalClose;
      }
    });
  });

  describe("3 & 4. ModelPicker popover & listbox keyboard navigation", () => {
    it("renders popover panel and supports ArrowDown/ArrowUp/Home/End/Escape navigation", async () => {
      const qc = createAppQueryClient();
      const onSelectModel = vi.fn();

      render(
        <QueryClientProvider client={qc}>
          <ModelPicker mode="text" selectedModelId={null} onSelectModel={onSelectModel} />
        </QueryClientProvider>,
      );

      const trigger = await screen.findByRole("button", { name: /Target AI model/i });
      expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      // Open via ArrowDown on trigger
      fireEvent.keyDown(trigger, { key: "ArrowDown" });

      const listbox = await screen.findByRole("listbox", { name: "Compatible AI models" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(listbox.closest("[popover]")).not.toBeNull();
      expect(screen.getByText("Text Model Providers")).toBeInTheDocument();

      const options = screen.getAllByRole("option");
      expect(options.length).toBe(7);
      expect(trigger.querySelector("svg")).not.toBeNull();
      for (const opt of options) {
        expect(opt.querySelector("svg")).not.toBeNull();
      }
      expect(options.map((opt) => opt.textContent)).toEqual([
        "OpenAI (ChatGPT, GPT models)",
        "Google (Gemini models)",
        "Anthropic (Claude models)",
        "Alibaba (Qwen models)",
        "MiniMax (M3 model)",
        "xAI (Grok models)",
        "DeepSeek (DeepSeek models)",
      ]);
      expect(listbox.textContent).not.toMatch(/compile/i);
      expect(document.activeElement).toBe(options[0]);

      // Move focus with ArrowDown, End, Home
      fireEvent.keyDown(listbox, { key: "ArrowDown" });
      expect(document.activeElement).toBe(options[1]);

      fireEvent.keyDown(listbox, { key: "End" });
      expect(document.activeElement).toBe(options[options.length - 1]);

      fireEvent.keyDown(listbox, { key: "Home" });
      expect(document.activeElement).toBe(options[0]);

      // Escape closes and returns focus to trigger
      fireEvent.keyDown(listbox, { key: "Escape" });
      await waitFor(() => {
        expect(trigger).toHaveAttribute("aria-expanded", "false");
      });
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe("5. Tooltip aria-describedby, Escape dismissal, and hover grace period", () => {
    it("wires aria-describedby, supports Escape dismissal, and delays mouseLeave close", () => {
      vi.useFakeTimers();

      render(
        <Tooltip content="Helpful keyboard hint">
          <button type="button" aria-describedby="existing-hint">
            Inspect
          </button>
        </Tooltip>,
      );

      const trigger = screen.getByRole("button", { name: "Inspect" });
      expect(trigger).toHaveAttribute("aria-describedby", "existing-hint");
      expect(screen.queryByRole("tooltip")).toBeNull();

      // Hover opens and appends tooltip ID to aria-describedby
      fireEvent.mouseEnter(trigger);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("Helpful keyboard hint");
      const describedBy = trigger.getAttribute("aria-describedby") ?? "";
      expect(describedBy).toContain("existing-hint");
      expect(describedBy).toContain(tooltip.id);

      // Mouse leave keeps tooltip open briefly for diagonal pointer movement
      fireEvent.mouseLeave(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      // Re-entering cancels the pending close
      fireEvent.mouseEnter(tooltip);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      // Escape dismisses immediately
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(trigger).toHaveAttribute("aria-describedby", "existing-hint");

      // Focus opens and mouseLeave after timer closes
      fireEvent.focus(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  describe("6. Theme color meta tag synchronization", () => {
    it("syncs meta[name='theme-color'] when switching between dark and light theme", () => {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", "#0F0F11");
      document.head.appendChild(meta);

      try {
        const qc = createAppQueryClient();
        render(
          <QueryClientProvider client={qc}>
            <MemoryRouter>
              <MarketingNavbar />
            </MemoryRouter>
          </QueryClientProvider>,
        );

        const themeSwitches = screen.getAllByRole("button", { name: /Theme is dark/i });
        const darkSwitch = themeSwitches[0];
        expect(darkSwitch).toBeDefined();
        if (darkSwitch) fireEvent.click(darkSwitch);
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        expect(meta.getAttribute("content")).toBe("#F2F5FA");

        const lightSwitches = screen.getAllByRole("button", { name: /Theme is light/i });
        const lightSwitch = lightSwitches[0];
        expect(lightSwitch).toBeDefined();
        if (lightSwitch) fireEvent.click(lightSwitch);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(meta.getAttribute("content")).toBe("#0F0F11");
      } finally {
        meta.remove();
      }
    });
  });

  describe("7. Dynamic running placeholder", () => {
    it("types, holds, deletes, and cycles across multiple audience prompts, respecting reducedMotion", () => {
      vi.useFakeTimers();
      const prompts = ["For engineers: Ship migrations", "For recruiters: Screen candidates"];

      function Probe({ reducedMotion = false }: { reducedMotion?: boolean }) {
        const text = useTypingPlaceholder(prompts, {
          reducedMotion,
          typeSpeedMs: 10,
          deleteSpeedMs: 10,
          pauseAfterTypeMs: 50,
          pauseBeforeNextMs: 20,
        });
        return <output data-testid="placeholder-output">{text}</output>;
      }

      const { rerender } = render(<Probe />);
      const out = screen.getByTestId("placeholder-output");
      expect(out.textContent).toBe("|");

      // Advance step-by-step through typing first prompt (30 chars)
      for (let i = 0; i < 31; i += 1) {
        act(() => {
          vi.advanceTimersByTime(10);
        });
      }
      expect(out.textContent).toBe("For engineers: Ship migrations|");

      // Advance past hold pause (50ms) and deletion (~15 ticks of 10ms) + pauseBeforeNext (20ms)
      act(() => {
        vi.advanceTimersByTime(50);
      });
      for (let i = 0; i < 16; i += 1) {
        act(() => {
          vi.advanceTimersByTime(10);
        });
      }
      act(() => {
        vi.advanceTimersByTime(20);
      });

      // Now typing the second prompt ("For recruiters...")
      for (let i = 0; i < 15; i += 1) {
        act(() => {
          vi.advanceTimersByTime(10);
        });
      }
      expect(out.textContent).toBe("For recruiters:|");

      // Reduced motion shows full first prompt statically without cursor
      rerender(<Probe reducedMotion={true} />);
      expect(out.textContent).toBe("For engineers: Ship migrations");
    });

    it("renders running placeholder in PromptComposer and pauses cleanly on focus", () => {
      vi.useFakeTimers();
      const qc = createAppQueryClient();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <PromptComposer isPending={false} onSubmitPrompt={vi.fn()} onStopGeneration={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const textarea = screen.getByLabelText<HTMLTextAreaElement>(
        /Prompt intent and instructions/i,
      );

      for (let i = 0; i < 14; i += 1) {
        act(() => {
          vi.advanceTimersByTime(26);
        });
      }
      expect(textarea.placeholder).toMatch(/^Engineers:/);
      expect(textarea.placeholder.endsWith("|")).toBe(true);

      // Focusing pauses animation without trailing cursor
      fireEvent.focus(textarea);
      expect(textarea.placeholder.endsWith("|")).toBe(false);
    });
  });

  describe("8. 3D card parallax tilt and cursor-following spotlight", () => {
    it("updates --rx, --ry, --mx, and --my on mouse pointermove and resets tilt on pointerout", () => {
      function CardHarness() {
        useCardParallax(true);
        return (
          <article data-testid="parallax-card" className="flat-surface">
            <span>Card content</span>
          </article>
        );
      }

      render(<CardHarness />);
      const card = screen.getByTestId("parallax-card");

      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const moveEvent = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 150,
        clientY: 25,
      });
      Object.defineProperty(moveEvent, "pointerType", { value: "mouse" });
      act(() => {
        card.dispatchEvent(moveEvent);
      });

      expect(card.style.getPropertyValue("--rx")).toBe("1.50deg");
      expect(card.style.getPropertyValue("--ry")).toBe("2.00deg");
      expect(card.style.getPropertyValue("--mx")).toBe("75.0%");
      expect(card.style.getPropertyValue("--my")).toBe("25.0%");

      const outEvent = new MouseEvent("pointerout", {
        bubbles: true,
        relatedTarget: document.body,
      });
      act(() => {
        card.dispatchEvent(outEvent);
      });

      expect(card.style.getPropertyValue("--rx")).toBe("0deg");
      expect(card.style.getPropertyValue("--ry")).toBe("0deg");
    });

    it("animates all cards when anonymous, only Templates cards when logged in, and skips parallax when data-animate is false", () => {
      const allKeys = Object.keys(CARD_HOVER_ANIMATION) as CardAnimationKey[];
      for (const key of allKeys) {
        expect(shouldAnimateCard(key, false)).toBe(true);
      }

      const templateKeys: CardAnimationKey[] = [
        "templateGalleryEmpty",
        "templateGalleryItem",
        "templateDetailLoading",
        "templateDetailNotFound",
        "templateDetailMain",
        "templateDetailRelated",
      ];
      for (const key of templateKeys) {
        expect(shouldAnimateCard(key, true)).toBe(true);
      }

      const loggedInDisabledKeys: CardAnimationKey[] = [
        "profileIdentity",
        "profileBilling",
        "outputLoading",
        "outputResult",
        "improveInput",
        "improveOutput",
        "reverseEngineerInput",
        "reverseEngineerOutput",
        "historyLoading",
        "historyEmpty",
        "historyItem",
        "libraryEmpty",
        "libraryItem",
        "pricingPlanCard",
        "pricingPrivacyBanner",
        "docsHubEmpty",
        "docsHubItem",
        "docsArticleNotFound",
        "docsArticleHeader",
        "docsArticleSection",
        "docsArticleRelatedTemplates",
        "docsArticleContinueReading",
        "publicPromptNotFound",
        "publicPromptMain",
        "billingReturnCard",
        "notFoundCard",
      ];
      for (const key of loggedInDisabledKeys) {
        expect(shouldAnimateCard(key, true)).toBe(false);
      }

      function ToggleHarness() {
        useCardParallax(true);
        return (
          <div>
            <article data-testid="static-card" data-animate={false} className="flat-surface">
              <span>Static card</span>
            </article>
            <article data-testid="animated-card" data-animate={true} className="glow-card">
              <span>Animated card</span>
            </article>
          </div>
        );
      }

      render(<ToggleHarness />);
      const staticCard = screen.getByTestId("static-card");
      const animatedCard = screen.getByTestId("animated-card");

      const mockRect = {
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(staticCard, "getBoundingClientRect").mockReturnValue(mockRect);
      vi.spyOn(animatedCard, "getBoundingClientRect").mockReturnValue(mockRect);

      const staticMove = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 150,
        clientY: 25,
      });
      Object.defineProperty(staticMove, "pointerType", { value: "mouse" });
      act(() => {
        staticCard.dispatchEvent(staticMove);
      });

      expect(staticCard.style.getPropertyValue("--rx")).toBe("");
      expect(staticCard.style.getPropertyValue("--ry")).toBe("");
      expect(staticCard.style.getPropertyValue("--mx")).toBe("");
      expect(staticCard.style.getPropertyValue("--my")).toBe("");

      const animatedMove = new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 150,
        clientY: 25,
      });
      Object.defineProperty(animatedMove, "pointerType", { value: "mouse" });
      act(() => {
        animatedCard.dispatchEvent(animatedMove);
      });

      expect(animatedCard.style.getPropertyValue("--rx")).toBe("1.50deg");
      expect(animatedCard.style.getPropertyValue("--ry")).toBe("2.00deg");
    });
  });

  describe("9. AppNavbar workspace badge removal & OutputCard Save to Library fixes", () => {
    it("does not render user.spaceName in AppNavbar menu", async () => {
      await act(async () => {
        setAuthSessionForTest({
          id: "usr_subin",
          email: "subin@example.com",
          name: "Subin C",
          spaceId: "spc_subin",
          spaceName: "subin C's Workspace",
          plan: "free",
          hasPasskey: false,
        });
      });

      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <AppNavbar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByText("subin C's Workspace")).toBeNull();
      expect(screen.getByText("Subin C")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Sign out/i })).toBeNull();
      expect(screen.getByRole("link", { name: "Subin C" })).toHaveAttribute(
        "href",
        "/settings/profile",
      );

      fireEvent.click(screen.getByRole("button", { name: "Open workspace menu" }));
      const mobileNav = screen.getByRole("navigation", { name: "Mobile workspace navigation" });
      expect(mobileNav).not.toHaveTextContent("Settings");
      expect(mobileNav).not.toHaveTextContent("Sign out");
      const mobileProfileLink = screen
        .getAllByRole("link", { name: "Subin C" })
        .find((el) => mobileNav.contains(el));
      expect(mobileProfileLink).toHaveAttribute("href", "/settings/profile");

      await authClient.signOut();
    });

    it("fills the Save to Library ribbon after saving and avoids empty rawInput validation errors", async () => {
      await act(async () => {
        setAuthSessionForTest({
          id: "usr_subin",
          email: "subin@example.com",
          name: "Subin C",
          spaceId: "spc_subin",
          spaceName: "subin C's Workspace",
          plan: "free",
          hasPasskey: false,
        });
      });

      const saveSpy = vi.spyOn(orpcClient.prompts, "save");
      const qc = createAppQueryClient();

      // Simulate switching mode to image (empty active draft) while viewing a compiled video output
      const activeEmptyImageDraft = {
        ...composerActions.getActiveDraft(),
        mode: "image" as const,
        rawInput: "",
      };
      const compiledSourceDraft = {
        ...composerActions.getActiveDraft(),
        mode: "video" as const,
        rawInput: "Continuous 6-second orbital camera shot around a luxury watch",
      };
      const firstOutput = {
        interactionId: "int_save_1",
        compiledPrompt: "High-end cinematic luxury watch orbital video prompt.",
        detectedVariables: [],
        followUpQuestions: [],
        providerId: "gemini",
        modelId: "gemini-3.6-flash",
        latencyMs: 120,
        healedFromFailure: false,
        remainingDailyPrompts: 19,
        requestId: "req_save_1",
      };

      const { rerender } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <OutputCard
              draft={activeEmptyImageDraft}
              sourceDraft={compiledSourceDraft}
              output={firstOutput}
              streamingBuffer={null}
              isPending={false}
              error={null}
              onRetry={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const saveBtn = screen.getByRole("button", { name: /Save to Library/i });
      expect(saveBtn).toHaveAttribute("aria-pressed", "false");
      expect(saveBtn.querySelector("svg")).toHaveAttribute("fill", "none");

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            rawInput: "Continuous 6-second orbital camera shot around a luxury watch",
            mode: "video",
            compiledPrompt: "High-end cinematic luxury watch orbital video prompt.",
          }),
        );
      });

      await waitFor(() => {
        const savedBtn = screen.getByRole("button", { name: /Saved to Library/i });
        expect(savedBtn).toHaveAttribute("aria-pressed", "true");
        expect(savedBtn.querySelector("svg")).toHaveAttribute("fill", "currentColor");
      });

      // Compiling a new prompt resets the saved ribbon state
      rerender(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <OutputCard
              draft={activeEmptyImageDraft}
              sourceDraft={null}
              output={{
                ...firstOutput,
                interactionId: "int_save_2",
                compiledPrompt: "Freshly compiled prompt with empty active draft.",
              }}
              streamingBuffer={null}
              isPending={false}
              error={null}
              onRetry={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const resetBtn = screen.getByRole("button", { name: /Save to Library/i });
      expect(resetBtn).toHaveAttribute("aria-pressed", "false");
      expect(resetBtn.querySelector("svg")).toHaveAttribute("fill", "none");

      // Even with empty draft and no sourceDraft, saving falls back to compiledPrompt so rawInput is non-empty
      fireEvent.click(resetBtn);
      await waitFor(() => {
        expect(saveSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            rawInput: "Freshly compiled prompt with empty active draft.",
          }),
        );
      });

      await authClient.signOut();
    });
  });

  describe("10. PromptComposer quick questions visibility", () => {
    it("hides the quick questions toggle when typing in the prompt composer", () => {
      const qc = createAppQueryClient();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <PromptComposer isPending={false} onSubmitPrompt={vi.fn()} onStopGeneration={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const textarea = screen.getByLabelText<HTMLTextAreaElement>(
        /Prompt intent and instructions/i,
      );
      fireEvent.change(textarea, {
        target: { value: "Design a resilient billing webhook queue" },
      });

      expect(screen.queryByRole("button", { name: /quick question/i })).toBeNull();
      expect(screen.queryByText(/quick question/i)).toBeNull();
    });
  });

  describe("11. PromptComposer Advanced controls & GuidedParameters visibility", () => {
    it("renders Advanced button to switch frameworks and reveals GuidedParameters when typing", () => {
      const qc = createAppQueryClient();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <PromptComposer isPending={false} onSubmitPrompt={vi.fn()} onStopGeneration={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Advanced button is visible right away and opens framework controls
      const advButton = screen.getByRole("button", { name: /Advanced/i });
      fireEvent.click(advButton);
      expect(screen.getByText("Advanced Prompt Settings")).toBeInTheDocument();

      // Switch framework from COSTAR to RISE
      fireEvent.click(screen.getByRole("button", { name: /Inspired by RISE/i }));
      expect(composerActions.getActiveDraft().framework).toBe("rise");
      expect(advButton).toHaveTextContent("RISE");

      // Typing reveals GuidedParameters
      expect(screen.queryByRole("region", { name: /Guided prompt parameters/i })).toBeNull();
      const textarea = screen.getByLabelText<HTMLTextAreaElement>(
        /Prompt intent and instructions/i,
      );
      fireEvent.change(textarea, {
        target: { value: "Draft a rollout checklist for billing alerts" },
      });
      expect(screen.getByRole("button", { name: /Goal/i })).toBeInTheDocument();
    });
  });
});
