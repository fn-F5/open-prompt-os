import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../app-routes.js";
import { setAuthSessionForTest } from "../lib/auth-client.js";
import { resetOrpcTestState } from "../lib/orpc.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { clearStorageForTest } from "../lib/storage.js";

function renderWithApp(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = createAppQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Footer GitHub Project Link", () => {
  beforeEach(() => {
    clearStorageForTest();
    resetOrpcTestState();
    setAuthSessionForTest(null);
  });

  afterEach(() => {
    setAuthSessionForTest(null);
  });

  it("renders the GitHub project link with logo in the anonymous site footer", () => {
    renderWithApp(<AppRoutes />, ["/"]);

    const footer = screen.getByRole("contentinfo", { name: "Site footer" });
    const githubLink = within(footer).getByRole("link", { name: /Open Source on GitHub/i });

    expect(githubLink).toHaveAttribute("href", "https://github.com/fn-F5/open-prompt-os");
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(githubLink.querySelector("svg")).not.toBeNull();
  });

  it("renders the GitHub project link with logo in the authenticated workspace footer", async () => {
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

    const authFooter = screen.getByRole("contentinfo", { name: "Site footer" });
    const githubLink = within(authFooter).getByRole("link", { name: /Open Source on GitHub/i });

    expect(githubLink).toHaveAttribute("href", "https://github.com/fn-F5/open-prompt-os");
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(githubLink.querySelector("svg")).not.toBeNull();
  });
});
