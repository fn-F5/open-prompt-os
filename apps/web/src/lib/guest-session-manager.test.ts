import type { ComposerDraft } from "@open-prompt-os/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_INTERACTION_STORAGE_KEY,
  GUEST_RETENTION_MS,
  clearGuestInteraction,
  getGuestInteraction,
  markGuestMigration,
  saveGuestInteraction,
} from "./guest-session-manager.js";

const SAMPLE_DRAFT: ComposerDraft = {
  rawInput: "Design an idempotent webhook ingestion worker",
  mode: "text",
  modelId: "gpt-4.1",
  constraints: ["Must handle duplicate deliveries"],
  guardrails: ["Never log raw secrets"],
  framework: "costar",
  advanced: { length: "balanced", creativity: 0.3 },
};

describe("guest-session-manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
    clearGuestInteraction();
  });

  afterEach(() => {
    clearGuestInteraction();
    vi.useRealTimers();
  });

  it("saves, reads, and preserves interactionId and createdAt across updates", () => {
    const first = saveGuestInteraction(SAMPLE_DRAFT, null, { interactionId: "guest_fixed_1" });
    expect(first).not.toBeNull();
    expect(first?.interactionId).toBe("guest_fixed_1");
    expect(first?.migrationStatus).toBe("pending");

    vi.advanceTimersByTime(60_000);
    const second = saveGuestInteraction(
      { ...SAMPLE_DRAFT, rawInput: "Updated prompt input" },
      { compiledPrompt: "Compiled output", detectedVariables: [] },
    );

    expect(second?.interactionId).toBe("guest_fixed_1");
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.response?.compiledPrompt).toBe("Compiled output");
    expect(getGuestInteraction()?.prompt.rawInput).toBe("Updated prompt input");
  });

  it("ignores stale out-of-order responses whose requestTimestamp precedes the saved record", () => {
    const newer = saveGuestInteraction(
      { ...SAMPLE_DRAFT, rawInput: "Newer prompt" },
      { compiledPrompt: "Newer output", detectedVariables: [] },
    );
    expect(newer).not.toBeNull();

    const staleTimestamp = new Date(Date.now() - 10_000).toISOString();
    const afterStale = saveGuestInteraction(
      { ...SAMPLE_DRAFT, rawInput: "Older prompt" },
      { compiledPrompt: "Older output", detectedVariables: [] },
      { requestTimestamp: staleTimestamp },
    );

    expect(afterStale?.prompt.rawInput).toBe("Newer prompt");
    expect(getGuestInteraction()?.response?.compiledPrompt).toBe("Newer output");
  });

  it("enforces the 30-day retention window and purges expired records", () => {
    saveGuestInteraction(SAMPLE_DRAFT, null);

    // Exactly at retention boundary -> still valid
    vi.advanceTimersByTime(GUEST_RETENTION_MS);
    expect(getGuestInteraction()).not.toBeNull();

    // 1ms past retention -> purged
    vi.advanceTimersByTime(1);
    expect(getGuestInteraction()).toBeNull();
    expect(window.localStorage.getItem(GUEST_INTERACTION_STORAGE_KEY)).toBeNull();
  });

  it("auto-purges corrupt JSON, schema-invalid payloads, and unparseable timestamps", () => {
    window.localStorage.setItem(GUEST_INTERACTION_STORAGE_KEY, "{not-valid-json");
    expect(getGuestInteraction()).toBeNull();
    expect(window.localStorage.getItem(GUEST_INTERACTION_STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(
      GUEST_INTERACTION_STORAGE_KEY,
      JSON.stringify({ version: 999, interactionId: "bad" }),
    );
    expect(getGuestInteraction()).toBeNull();
    expect(window.localStorage.getItem(GUEST_INTERACTION_STORAGE_KEY)).toBeNull();

    const valid = saveGuestInteraction(SAMPLE_DRAFT, null);
    window.localStorage.setItem(
      GUEST_INTERACTION_STORAGE_KEY,
      JSON.stringify({ ...valid, updatedAt: "not-a-date" }),
    );
    expect(getGuestInteraction()).toBeNull();
    expect(window.localStorage.getItem(GUEST_INTERACTION_STORAGE_KEY)).toBeNull();
  });

  it("updates migrationStatus and returns null when no guest record exists", () => {
    expect(markGuestMigration("migrating")).toBeNull();

    saveGuestInteraction(SAMPLE_DRAFT, null);
    const migrating = markGuestMigration("migrating");
    expect(migrating?.migrationStatus).toBe("migrating");

    const failed = markGuestMigration("failed");
    expect(failed?.migrationStatus).toBe("failed");
    expect(getGuestInteraction()?.migrationStatus).toBe("failed");
  });
});
