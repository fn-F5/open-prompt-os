import { Dialog, Tooltip } from "@open-prompt-os/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { GuidedParameters } from "../components/composer/guided-parameters.js";
import { ModelPicker } from "../components/composer/model-picker.js";
import { PromptComposer } from "../components/composer/prompt-composer.js";
import { MarketingNavbar } from "../components/navigation/navbar.js";
import { useCardParallax } from "../hooks/use-card-parallax.js";
import { useTypingPlaceholder } from "../hooks/use-typing-placeholder.js";
import { authClient } from "../lib/auth-client.js";
import { clearGuestInteraction } from "../lib/guest-session-manager.js";
import { resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { clearStorageForTest } from "../lib/storage.js";
import { resetAuthDialogStoreForTest } from "../state/auth-dialog-store.js";
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
  });

  describe("9. One-scroll-per-section navigation on landing page", () => {
    it("slides full-viewport track one section per gesture, updates dots/hint, and yields to modals/scrollable textareas", async () => {
      clearGuestInteraction();
      resetAuthDialogStoreForTest();
      await authClient.signOut();

      let now = 10_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);

      const qc = createAppQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/"]}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await screen.findByTestId("anonymous-marketing-content");
      const track = screen.getByTestId("fullpage-track");
      const nav = screen.getByTestId("fullpage-nav");
      const scrollHint = screen.getByTestId("fullpage-scroll-hint");

      // Wait for ModelPicker query to mount .model-picker-popover and simulate native popover="auto" support
      const modelTrigger = await screen.findByRole("button", { name: /Target AI model/i });
      const modelPopover = document.querySelector<HTMLElement>(".model-picker-popover");
      expect(modelPopover).not.toBeNull();
      modelPopover?.removeAttribute("hidden");

      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "landing_workspace",
      );
      expect(track.style.transform).toMatch(/translate3d\(0,\s*-?0%,\s*0(?:px)?\)/);
      expect(scrollHint).toHaveTextContent("See the Difference");

      // Right-hand active nav label stays hidden until hover; dot uses high-contrast --accent-primary
      const firstNavButton = nav.querySelector('button[aria-label="Go to Prompt Compiler"]');
      const firstNavLabel = firstNavButton?.querySelectorAll("span")[0];
      const firstNavDot = firstNavButton?.querySelectorAll("span")[1];
      expect(firstNavLabel?.className).toContain("opacity-0");
      expect(firstNavDot?.className).toContain("bg-[var(--accent-primary)]");

      const dispatchWheel = (deltaY: number, target: EventTarget = window) => {
        const event = new WheelEvent("wheel", {
          deltaY,
          bubbles: true,
          cancelable: true,
        });
        act(() => {
          target.dispatchEvent(event);
        });
        return event;
      };

      // Yield when the model picker listbox trigger is genuinely expanded
      modelTrigger.setAttribute("aria-expanded", "true");
      const expandedModelWheel = dispatchWheel(120);
      expect(expandedModelWheel.defaultPrevented).toBe(false);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "landing_workspace",
      );
      modelTrigger.setAttribute("aria-expanded", "false");

      // 1st scroll down -> See the Difference + continuous inertia stream (dt <= 100ms) does not skip
      const firstDown = dispatchWheel(120);
      expect(firstDown.defaultPrevented).toBe(true);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "before_after_showcase",
      );
      expect(track.style.transform).toBe("translate3d(0, -100%, 0)");
      expect(scrollHint).toHaveTextContent("Built for Everyday Speed");

      // Continuous trackpad inertia stream (dt = 90ms <= 120ms) past cooldown with slight delta fluctuation
      const inertiaDeltas = [64, 32, 16, 12, 8, 9, 10, 8, 6];
      for (const deltaY of inertiaDeltas) {
        now += 90;
        dispatchWheel(deltaY);
      }
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "before_after_showcase",
      );
      expect(track.style.transform).toBe("translate3d(0, -100%, 0)");

      // Brief 140ms pause (stream ended) + total >= 350ms after step -> moves immediately on 1st wheel
      now += 140;
      dispatchWheel(80);
      expect(document.documentElement.getAttribute("data-active-section")).toBe("features_grid");
      expect(track.style.transform).toBe("translate3d(0, -200%, 0)");

      // 3rd scroll down -> Curated Template Gallery (after 350ms idle pause, moves on 1st wheel)
      now += 360;
      dispatchWheel(120);
      expect(document.documentElement.getAttribute("data-active-section")).toBe("use_cases");
      expect(track.style.transform).toBe("translate3d(0, -300%, 0)");

      // 4th scroll down -> Privacy by Default Guarantee
      now += 360;
      dispatchWheel(120);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "privacy_commitment",
      );
      expect(track.style.transform).toBe("translate3d(0, -400%, 0)");

      // 5th scroll down -> Simple, Fair Pricing
      now += 360;
      dispatchWheel(120);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "pricing_options",
      );
      expect(track.style.transform).toBe("translate3d(0, -500%, 0)");
      expect(scrollHint).toHaveTextContent("Prompt Compiler");

      // Yield when an open dialog is present
      const openDialog = document.createElement("dialog");
      openDialog.setAttribute("open", "");
      document.body.appendChild(openDialog);
      now += 800;
      const dialogWheel = dispatchWheel(-120);
      expect(dialogWheel.defaultPrevented).toBe(false);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "pricing_options",
      );
      openDialog.remove();

      // Yield when scrolling inside an overflowing textarea
      const textarea = screen.getByLabelText<HTMLTextAreaElement>(
        /Prompt intent and instructions/i,
      );
      vi.spyOn(textarea, "scrollHeight", "get").mockReturnValue(240);
      vi.spyOn(textarea, "clientHeight", "get").mockReturnValue(120);
      now += 800;
      const textareaWheel = dispatchWheel(-120, textarea);
      expect(textareaWheel.defaultPrevented).toBe(false);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "pricing_options",
      );

      // Scroll up step-by-step in exact reverse order
      const expectedReverse = [
        { id: "privacy_commitment", transform: "translate3d(0, -400%, 0)" },
        { id: "use_cases", transform: "translate3d(0, -300%, 0)" },
        { id: "features_grid", transform: "translate3d(0, -200%, 0)" },
        { id: "before_after_showcase", transform: "translate3d(0, -100%, 0)" },
        { id: "landing_workspace", transform: "translate3d(0, -0%, 0)" },
      ];
      for (const step of expectedReverse) {
        now += 800;
        dispatchWheel(-120);
        expect(document.documentElement.getAttribute("data-active-section")).toBe(step.id);
        expect(track.style.transform).toBe(step.transform);
      }

      // Clicking scroll hint steps to the next section
      now += 800;
      fireEvent.click(scrollHint);
      expect(document.documentElement.getAttribute("data-active-section")).toBe(
        "before_after_showcase",
      );
      expect(track.style.transform).toBe("translate3d(0, -100%, 0)");

      // Clicking a right-hand nav dot jumps directly to the target section
      const galleryDot = nav.querySelector('button[aria-label="Go to Curated Template Gallery"]');
      expect(galleryDot).not.toBeNull();
      now += 800;
      if (galleryDot) fireEvent.click(galleryDot);
      expect(document.documentElement.getAttribute("data-active-section")).toBe("use_cases");
      expect(track.style.transform).toBe("translate3d(0, -300%, 0)");
    });
  });
});
