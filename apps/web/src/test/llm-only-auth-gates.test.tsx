import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "../lib/auth-client.js";
import { resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { clearStorageForTest } from "../lib/storage.js";
import { ImproveAutopsyPage } from "../routes/improve-autopsy-page.js";
import { ReverseEngineerPage } from "../routes/reverse-engineer-page.js";
import { TemplateGalleryPage } from "../routes/template-gallery-page.js";
import {
  closeAuthDialog,
  getAuthDialogState,
  resetAuthDialogStoreForTest,
} from "../state/auth-dialog-store.js";
import { composerActions } from "../state/composer-store.js";

function renderRoute(ui: React.ReactNode, initialEntries: string[] = ["/"], routePath = "*") {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={routePath} element={ui} />
          <Route path="/compile" element={<div data-testid="composer-dest">Composer</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LLM-only auth gates", () => {
  const originalCreateObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectUrlDesc = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  beforeEach(async () => {
    clearStorageForTest();
    resetOrpcTestState();
    resetAuthDialogStoreForTest();
    composerActions.rehydrateFromStorage();
    await authClient.signOut();
    closeAuthDialog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectUrlDesc) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrlDesc);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectUrlDesc) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrlDesc);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("allows image selection and drop without auth, but gates Reverse Engineer Image", async () => {
    renderRoute(<ReverseEngineerPage />, ["/"], "/");

    const fileInput = screen.getByLabelText<HTMLInputElement>("Upload reference image");
    const inputClickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Choose Image" }));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    expect(getAuthDialogState().isOpen).toBe(false);

    const sampleFile = new File(["fake-png"], "sample.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    expect(await screen.findByAltText("sample.png")).toBeInTheDocument();
    expect(getAuthDialogState().isOpen).toBe(false);

    // Clear and test drag-and-drop without auth as well
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByAltText("sample.png")).not.toBeInTheDocument();

    const dropSection = screen.getByLabelText("Reference image upload");
    const dropZone = dropSection.querySelector("div.border-dashed");
    expect(dropZone).not.toBeNull();
    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [sampleFile] },
      });
    }

    expect(await screen.findByAltText("sample.png")).toBeInTheDocument();
    expect(getAuthDialogState().isOpen).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reverse Engineer Image" }));
    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "action_required",
    });
  });

  it("allows video selection and drop without auth, but gates Reverse Engineer Video", async () => {
    const createObjectUrlMock = vi.fn(() => "blob:mock-video-url");
    const revokeObjectUrlMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectUrlMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectUrlMock,
      configurable: true,
      writable: true,
    });

    renderRoute(<ReverseEngineerPage />, ["/"], "/");

    fireEvent.click(screen.getByRole("tab", { name: "Video" }));

    const fileInput = screen.getByLabelText<HTMLInputElement>("Upload reference video");
    const inputClickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Choose Video" }));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    expect(getAuthDialogState().isOpen).toBe(false);

    const videoFile = new File(["fake-mp4"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [videoFile] } });

    expect(await screen.findByText("clip.mp4")).toBeInTheDocument();
    expect(createObjectUrlMock).toHaveBeenCalledWith(videoFile);
    expect(getAuthDialogState().isOpen).toBe(false);

    // Clear and test drag-and-drop without auth as well
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();

    const dropSection = screen.getByLabelText("Reference video input");
    const dropZone = dropSection.querySelector("div.border-dashed");
    expect(dropZone).not.toBeNull();
    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [videoFile] },
      });
    }

    expect(await screen.findByText("clip.mp4")).toBeInTheDocument();
    expect(getAuthDialogState().isOpen).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reverse Engineer Video" }));
    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "action_required",
    });
  });

  it("allows Improve presets and Autopsy symptom toggles without auth, but gates Optimize Prompt and Run Autopsy", () => {
    renderRoute(<ImproveAutopsyPage />, ["/improve"], "/improve");

    fireEvent.click(screen.getByRole("button", { name: "Generic Cold Outreach" }));
    expect(getAuthDialogState().isOpen).toBe(false);
    expect(screen.getByLabelText("Original Prompt")).toHaveValue(
      "Write a cold email to a VP of Engineering pitching our DevOps monitoring tool and ask for a 15 minute call.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Optimize Prompt" }));
    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "action_required",
    });

    closeAuthDialog();
    expect(getAuthDialogState().isOpen).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "Prompt Autopsy" }));
    const symptomButton = screen.getByRole("button", { name: "Hallucinated facts" });
    fireEvent.click(symptomButton);
    expect(symptomButton).toHaveAttribute("aria-pressed", "true");
    expect(getAuthDialogState().isOpen).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Run Autopsy" }));
    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "action_required",
    });
  });

  it("gates using a template in TemplateGalleryPage when unauthenticated and does not navigate to /compile", async () => {
    renderRoute(<TemplateGalleryPage />, ["/templates"], "/templates");

    const useButtons = await screen.findAllByRole("button", { name: /^Use template:/i });
    const firstUseButton = useButtons[0];
    expect(firstUseButton).toBeDefined();
    if (firstUseButton) {
      fireEvent.click(firstUseButton);
    }

    expect(getAuthDialogState()).toMatchObject({
      isOpen: true,
      reason: "navbar_signin",
      mode: "signin",
    });
    expect(screen.queryByTestId("composer-dest")).not.toBeInTheDocument();
  });
});
