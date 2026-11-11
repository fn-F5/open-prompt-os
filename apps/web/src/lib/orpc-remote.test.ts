import type { ComposePromptOutput } from "@open-prompt-os/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orpcClient, resetOrpcTestState } from "./orpc.js";

const input = {
  interactionId: "int_remote",
  draft: {
    rawInput: "Write a checklist for [Service_Name]",
    mode: "text" as const,
    modelId: "gemini-2.5-pro",
    constraints: [] as string[],
    guardrails: [] as string[],
    advanced: {},
  },
};

const output: ComposePromptOutput = {
  interactionId: "int_remote",
  compiledPrompt: "Hello world",
  detectedVariables: [],
  followUpQuestions: [],
  providerId: "rule-synthesizer",
  modelId: "rule-synthesizer",
  latencyMs: 4,
  healedFromFailure: false,
  remainingDailyPrompts: null,
  requestId: "req_remote",
};

describe("remote compose client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetOrpcTestState();
  });

  it("keeps the local synthesizer when VITE_API_URL is unset", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await orpcClient.prompts.compose(input);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.compiledPrompt.length).toBeGreaterThan(0);
    expect(result.providerId).not.toBe("");
  });

  it("streams deltas from the API and forwards the abort signal", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:3001");
    const controller = new AbortController();
    const chunks: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      const body = [
        `event: text-delta\ndata: ${JSON.stringify({ text: "Hello" })}\n\n`,
        `event: text-delta\ndata: ${JSON.stringify({ text: " world" })}\n\n`,
        `event: done\ndata: ${JSON.stringify(output)}\n\n`,
      ].join("");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const result = await orpcClient.prompts.compose(input, {
      signal: controller.signal,
      onChunk: (partial) => chunks.push(partial),
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/prompts/compose/stream");
    expect(chunks).toEqual(["Hello", "Hello world"]);
    expect(result.compiledPrompt).toBe("Hello world");
    expect(result.providerId).toBe("rule-synthesizer");
  });
});
