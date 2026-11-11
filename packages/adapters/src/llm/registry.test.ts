import { createFakeAdapter } from "@open-prompt-os/adapter-kit";
import { describe, expect, it } from "vitest";
import { createRegistry } from "./registry.js";
import { createSynthesizerAdapter } from "./synthesizer.js";

describe("createRegistry", () => {
  it("resolves known and unknown models to the synthesizer when no live adapter is registered", () => {
    const registry = createRegistry([createSynthesizerAdapter()]);
    expect(registry.resolve("gemini-2.5-pro").id).toBe("rule-synthesizer");
    expect(registry.resolve("not-a-model").id).toBe("rule-synthesizer");
    expect(registry.resolve("gpt-4.1").id).toBe("rule-synthesizer");
  });

  it("prefers a configured Gemini adapter for Gemini models", () => {
    const gemini = createFakeAdapter({ id: "gemini", defaultModel: "gemini-2.5-flash" });
    const registry = createRegistry([createSynthesizerAdapter(), gemini]);
    expect(registry.resolve("gemini-2.5-pro")).toBe(gemini);
    expect(registry.resolve("not-a-model").id).toBe("rule-synthesizer");
  });
});
