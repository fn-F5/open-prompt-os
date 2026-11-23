import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppNavbar } from "../components/navigation/navbar.js";
import { authClient, setAuthSessionForTest } from "../lib/auth-client.js";
import { createAppQueryClient } from "../lib/query-client.js";
import { PricingPage } from "../routes/pricing-page.js";

describe("AppNavbar user profile dropdown & Plans & Pricing navigation", () => {
  beforeEach(async () => {
    await act(async () => {
      setAuthSessionForTest({
        id: "usr_dropdown_test",
        email: "dropdown@example.com",
        name: "Alex Rivera",
        spaceId: "spc_dropdown_test",
        spaceName: "Alex's Workspace",
        plan: "free",
        hasPasskey: false,
      });
    });
  });

  afterEach(async () => {
    await authClient.signOut();
  });

  function renderNavbarWithRoutes(initialPath = "/") {
    const qc = createAppQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppNavbar />
          <Routes>
            <Route path="/" element={<div data-testid="composer-home">Home</div>} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route
              path="/settings/profile"
              element={<div data-testid="profile-dest">Profile</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("opens dropdown, navigates to /pricing and renders pricing cards, and closes menu", async () => {
    renderNavbarWithRoutes("/");

    const trigger = screen.getByRole("button", { name: "Alex Rivera" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu", { name: "User profile menu" })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "User profile menu" })).toBeInTheDocument();

    const pricingItem = screen.getByRole("menuitem", { name: "Plans & Pricing" });
    expect(pricingItem).toHaveAttribute("href", "/pricing");

    fireEvent.click(pricingItem);

    // Dropdown closes after navigation and PricingPage renders plan cards
    expect(screen.queryByRole("menu", { name: "User profile menu" })).toBeNull();
    expect(
      await screen.findByRole("heading", { name: /Plans for individuals and teams/i }),
    ).toBeInTheDocument();
  });

  it("closes the user profile dropdown on Escape key and outside click", () => {
    renderNavbarWithRoutes("/");

    const trigger = screen.getByRole("button", { name: "Alex Rivera" });

    // Close via Escape
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "User profile menu" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "User profile menu" })).toBeNull();

    // Close via outside click
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "User profile menu" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu", { name: "User profile menu" })).toBeNull();
  });

  it("includes Plans & Pricing link in the mobile workspace navigation menu", () => {
    renderNavbarWithRoutes("/");

    fireEvent.click(screen.getByRole("button", { name: "Open workspace menu" }));
    const mobileNav = screen.getByRole("navigation", { name: "Mobile workspace navigation" });
    const mobilePricingLink = Array.from(mobileNav.querySelectorAll("a")).find(
      (anchor) => anchor.getAttribute("href") === "/pricing",
    );
    expect(mobilePricingLink).toBeDefined();
    expect(mobilePricingLink?.textContent).toContain("Plans & Pricing");
  });
});
