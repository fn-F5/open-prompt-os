import { createFakeAdapter } from "@open-prompt-os/adapter-kit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createOrchestrator } from "./gateway.js";
import { createRegistry } from "./registry.js";
import { createSynthesizerAdapter } from "./synthesizer.js";

describe("video reverse engineer property invariants", () => {
  it("always preserves every shot label and strips meta-spec wrappers for any 2..6 shot storyboard", async () => {
    const shotCountArb = fc.integer({ min: 2, max: 6 });
    const textSnippetArb = fc
      .stringMatching(/^[A-Za-z0-9 ,.-]{12,60}$/)
      .filter((s) => s.trim().length >= 8);

    await fc.assert(
      fc.asyncProperty(shotCountArb, textSnippetArb, async (shotCount, snippet) => {
        const shots = Array.from({ length: shotCount }, (_, idx) => ({
          shotNumber: idx + 1,
          startTime: `00:${String(idx * 2).padStart(2, "0")}`,
          endTime: `00:${String((idx + 1) * 2).padStart(2, "0")}`,
          transitionIn: idx === 0 ? "Fade in" : "Hard Cut",
          firstFramePrompt: `Frame ${idx + 1}: ${snippet}`,
          motionAndCamera: `Camera beat ${idx + 1}: ${snippet}`,
          audioCue: `SFX ${idx + 1}: ${snippet}`,
          shotPrompt: `Generate video following the specification.\nShot visual ${idx + 1}: ${snippet}`,
        }));

        const payload = JSON.stringify({
          overview: {
            durationSeconds: shotCount * 2,
            aspectRatio: "16:9",
            pacingStyle: "24fps multi-shot",
            isSingleTake: false,
          },
          continuityBible: {
            subjectAndWardrobe: `Subject ${snippet}`,
            environmentAndSet: `Set ${snippet}`,
            lightingAndColorGrade: `Lighting ${snippet}`,
            lensAndOpticalDna: "50mm f/1.8",
            audioAndMusicDna: `Audio ${snippet}`,
            negativeGuardrails: "morphing geometry, flicker",
          },
          shots,
          masterPrompt: `Generate video following the specification.\nRole: You are a Director.\n\n# MOTION & TEMPORAL PROMPT SPECIFICATION\nBrief overview: ${snippet}`,
        });

        const gemini = createFakeAdapter({ id: "gemini", text: payload });
        const orchestrator = createOrchestrator({
          registry: createRegistry([createSynthesizerAdapter(), gemini]),
          timeoutMs: 1000,
        });

        const out = await orchestrator.reverseEngineerVideo(
          {
            sourceType: "youtube",
            youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            startOffsetSec: 0,
            targetGenerator: "veo",
          },
          { requestId: "req_prop_video" },
        );

        expect(out.detectedVariables).toEqual([]);
        expect(out.masterPrompt).not.toMatch(/^Generate video following the specification\./i);
        expect(out.masterPrompt).not.toMatch(/^Role:\s*You are/i);
        for (let i = 1; i <= shotCount; i += 1) {
          expect(out.masterPrompt).toContain(`Shot ${i} (`);
        }
      }),
      { numRuns: 25 },
    );
  });
});
