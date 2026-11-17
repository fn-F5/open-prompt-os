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

  it("routes frontend platform model IDs and null targets to configured live adapters instead of rule-synthesizer", () => {
    const gemini = createFakeAdapter({ id: "gemini", defaultModel: "gemini-3.6-flash" });
    const registry = createRegistry([createSynthesizerAdapter(), gemini]);

    expect(registry.resolve("openai-text")).toBe(gemini);
    expect(registry.resolve("google-text")).toBe(gemini);
    expect(registry.resolve("anthropic-text")).toBe(gemini);
    expect(registry.resolve("alibaba-text")).toBe(gemini);
    expect(registry.resolve("openai-image")).toBe(gemini);
    expect(registry.resolve("google-video")).toBe(gemini);
    expect(registry.resolve(null)).toBe(gemini);

    const openai = createFakeAdapter({ id: "openai", defaultModel: "gpt-4.1" });
    const withOpenAi = createRegistry([createSynthesizerAdapter(), gemini, openai]);
    expect(withOpenAi.resolve("openai-text")).toBe(openai);
    expect(withOpenAi.resolve("google-text")).toBe(gemini);
  });
});
