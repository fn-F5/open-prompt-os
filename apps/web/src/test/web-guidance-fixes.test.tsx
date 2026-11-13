import { Dialog, Tooltip } from "@open-prompt-os/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedParameters } from "../components/composer/guided-parameters.js";
import { ModelPicker } from "../components/composer/model-picker.js";
import { PromptComposer } from "../components/composer/prompt-composer.js";
import { MarketingNavbar } from "../components/navigation/navbar.js";
import { useTypingPlaceholder } from "../hooks/use-typing-placeholder.js";
import { resetOrpcTestState } from "../lib/orpc.js";
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

      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(1);
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
      meta.setAttribute("content", "#07090E");
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
        expect(meta.getAttribute("content")).toBe("#F1F5F9");

        const lightSwitches = screen.getAllByRole("button", { name: /Theme is light/i });
        const lightSwitch = lightSwitches[0];
        expect(lightSwitch).toBeDefined();
        if (lightSwitch) fireEvent.click(lightSwitch);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(meta.getAttribute("content")).toBe("#07090E");
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
});
