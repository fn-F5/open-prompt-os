import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type { createCaptureMailer } from "@open-prompt-os/auth";
import type { VideoReverseEngineerOutput } from "@open-prompt-os/contracts";
import {
  assertMeaningfulPrompt,
  assertNoClientSystemPrompt,
  diagnoseAndRefinePrompt,
  extractDraftSupplementalText,
  synthesizeCompiledPrompt,
  synthesizeReverseEngineeredPrompt,
} from "@open-prompt-os/core";
import { type UsageAction, prisma, runAsSystem } from "@open-prompt-os/db";
import type { Hono } from "hono";
import type { ApiEnv } from "./app-env.js";
import { getTodayUtcDate } from "./services/usage-quota.js";

export interface E2eHarnessOptions {
  readonly mailer: ReturnType<typeof createCaptureMailer>;
}

/**
 * Deterministic orchestrator for full-stack Playwright E2E runs (`NODE_ENV=test` + `E2E_TEST_MODE=1`).
 * Runs real input guards and schema contracts while avoiding live external LLM network calls.
 */
export function createE2eOrchestrator(): PromptOrchestrator {
  return {
    async compose(input, ctx) {
      assertNoClientSystemPrompt(input.draft);
      assertMeaningfulPrompt(input.draft.rawInput, {
        supplementalText: extractDraftSupplementalText(input.draft),
      });
      const synthesized = synthesizeCompiledPrompt(input.draft, input.interactionId);
      return {
        ...synthesized,
        providerId: "rule-synthesizer",
        modelId: input.draft.modelId ?? "e2e-deterministic",
        latencyMs: 12,
        healedFromFailure: false,
        remainingDailyPrompts: null,
        requestId: ctx.requestId,
      };
    },

    async *composeStream(input, ctx) {
      assertNoClientSystemPrompt(input.draft);
      assertMeaningfulPrompt(input.draft.rawInput, {
        supplementalText: extractDraftSupplementalText(input.draft),
      });
      const synthesized = synthesizeCompiledPrompt(input.draft, input.interactionId);
      const text = synthesized.compiledPrompt;
      const chunkSize = Math.max(24, Math.ceil(text.length / 4));
      for (let i = 0; i < text.length; i += chunkSize) {
        if (ctx.signal?.aborted) return;
        yield { type: "text-delta", text: text.slice(i, i + chunkSize) };
      }
      yield {
        type: "done",
        output: {
          ...synthesized,
          providerId: "rule-synthesizer",
          modelId: input.draft.modelId ?? "e2e-deterministic",
          latencyMs: 15,
          healedFromFailure: false,
          remainingDailyPrompts: null,
          requestId: ctx.requestId,
        },
      };
    },

    async refine(input, ctx) {
      assertNoClientSystemPrompt(input);
      assertMeaningfulPrompt(input.originalPrompt);
      const refined = diagnoseAndRefinePrompt(input);
      return {
        ...refined,
        providerId: "e2e-deterministic",
        modelId: input.targetModelId ?? "e2e-deterministic",
        latencyMs: 18,
        requestId: ctx.requestId,
      };
    },

    async reverseEngineer(input, ctx) {
      assertNoClientSystemPrompt(input);
      const synthesized = synthesizeReverseEngineeredPrompt(input);
      return {
        ...synthesized,
        providerId: "e2e-deterministic",
        modelId: "e2e-vision",
        latencyMs: 22,
        requestId: ctx.requestId,
      };
    },

    async reverseEngineerVideo(input, ctx): Promise<VideoReverseEngineerOutput> {
      assertNoClientSystemPrompt(input);
      ctx.onStage?.("preparing");
      ctx.onStage?.("analyzing");
      ctx.onStage?.("finalizing");

      const clipEnd = Math.min(
        59,
        Math.max(4, Math.round((input.endOffsetSec ?? 10) - input.startOffsetSec)),
      );
      const midSec = Math.max(2, Math.floor(clipEnd / 2));
      const midTs = `00:${String(midSec).padStart(2, "0")}`;
      const endTs = `00:${String(clipEnd).padStart(2, "0")}`;
      const sourceNote =
        input.sourceType === "youtube"
          ? `YouTube clip ${input.youtubeUrl ?? ""}`
          : "uploaded studio video clip";

      const masterPrompt = [
        `Eye-level 50mm 24fps recreation of ${sourceNote}${input.focusNotes?.trim() ? ` focusing on ${input.focusNotes.trim()}` : ""}.`,
        "Visual & Optical Locks: Matte-black espresso machine on a warm walnut countertop in a sunlit minimalist kitchen; golden morning side-light casting clean soft shadows, 50mm f/1.8 shallow depth of field with gently blurred ceramic cups in the background.",
        `Shot 1 (00:00–${midTs}, Fade in): Locked-off 50mm medium-wide frame of the walnut counter as a barista hand enters from the right, rotates the stainless portafilter clockwise until it clicks firmly into the matte-black group head, and presses the top brew button with steady natural lighting.`,
        `Shot 2 (${midTs}–${endTs}, Hard Cut): Tight macro close-up angled 20 degrees downward on the bottomless portafilter basket as dark tiger-striped espresso crema curls smoothly into a pre-warmed white ceramic cup while fine wisps of steam rise cleanly through the sunlit side beam.`,
        "Audio & Soundscape: Crisp metallic portafilter lock click at 00:01, steady low espresso pump hum building into rich liquid pour fizz, layered over a soft acoustic lo-fi guitar rhythm.",
        "Avoid morphing portafilter geometry, flickering exposure, distorted steam particles, or melting ceramic edges.",
      ].join("\n\n");

      return {
        overview: {
          durationSeconds: clipEnd,
          aspectRatio: "16:9",
          pacingStyle: "Crisp 2-shot 24fps tabletop commercial",
          isSingleTake: false,
          timestampsAreEstimated: true,
        },
        continuityBible: {
          subjectAndWardrobe:
            "Matte-black espresso machine with brushed steel group head and barista hand in rolled navy cuff.",
          environmentAndSet:
            "Sunlit minimalist kitchen with warm walnut countertop and out-of-focus white ceramic cups on a rear shelf.",
          lightingAndColorGrade:
            "Warm golden morning side-light from camera-left with soft fill shadows and rich amber-brown contrast.",
          lensAndOpticalDna:
            "50mm f/1.8 prime lens, shallow depth of field, natural 180-degree shutter 24fps motion cadence.",
          audioAndMusicDna:
            "Mechanical portafilter click, steady espresso pump hum, liquid crema pour, and gentle lo-fi acoustic guitar.",
          negativeGuardrails:
            "morphing portafilter geometry, flickering exposure, distorted steam, melting cup edges",
        },
        shots: [
          {
            shotNumber: 1,
            startTime: "00:00",
            endTime: midTs,
            transitionIn: "Fade in",
            firstFramePrompt:
              "Eye-level 50mm f/1.8 medium-wide frame of a matte-black espresso machine resting on a warm walnut counter under golden morning side-light, with white ceramic cups softly blurred on a rear shelf.",
            motionAndCamera:
              "Locked-off tripod shot as a barista hand enters from camera-right, seats the stainless portafilter into the group head, twists clockwise until locked, and presses the top brew switch.",
            audioCue:
              "Crisp metallic click as the portafilter locks followed by a soft button press and gentle acoustic guitar.",
            shotPrompt:
              "Locked-off 50mm f/1.8 24fps medium-wide shot of a matte-black espresso machine on a warm walnut counter in golden morning side-light as a barista hand locks in the stainless portafilter and starts extraction, crisp metallic click and soft acoustic guitar.",
          },
          {
            shotNumber: 2,
            startTime: midTs,
            endTime: endTs,
            transitionIn: "Hard Cut",
            firstFramePrompt:
              "Tight macro 50mm close-up angled 20 degrees down toward a bottomless espresso portafilter hovering above a white ceramic cup, warm side-light catching metallic rim highlights.",
            motionAndCamera:
              "Subtle slow dolly push-in as tiger-striped espresso crema forms and pours in a smooth ribbon into the cup while delicate steam wisps drift upward.",
            audioCue:
              "Steady low pump hum blending into rich liquid pour fizz as the acoustic guitar melody resolves.",
            shotPrompt:
              "Slow 24fps macro dolly push-in on a bottomless espresso portafilter pouring tiger-striped crema into a white ceramic cup under golden side-light with rising steam wisps, steady pump hum, and crisp pour foley.",
          },
        ],
        targetGenerator: input.targetGenerator,
        masterPrompt,
        detectedVariables: [],
        suggestedDraft: {
          rawInput: masterPrompt,
          mode: "video",
          modelId:
            input.targetGenerator === "runway"
              ? "runway-video"
              : input.targetGenerator === "sora"
                ? "sora-turbo"
                : "google-video",
          goal: "Recreate the reference video's visual continuity, camera choreography, lighting, and audio pacing.",
          format: "50mm f/1.8 prime lens, 24fps motion cadence",
          tone: "Warm golden morning side-light",
          constraints: ["Matte-black espresso machine on walnut counter"],
          guardrails: ["morphing portafilter geometry, flickering exposure"],
          framework: "costar",
          advanced: { length: "detailed", creativity: 0.4 },
        },
        providerId: "e2e-deterministic",
        modelId: "e2e-video",
        latencyMs: 28,
        remainingDailyRuns: null,
        requestId: ctx.requestId,
      };
    },

    healthSnapshot: () => [
      {
        providerId: "rule-synthesizer",
        circuit: "closed",
        recentFailureRate: 0,
        lastErrorAt: null,
      },
    ],
  };
}

/**
 * Registers test-only control routes under `/api/__e2e__/*`.
 * Caller MUST verify `NODE_ENV === "test" && E2E_TEST_MODE === "1"` before mounting.
 */
export function registerE2eRoutes(app: Hono<ApiEnv>, options: E2eHarnessOptions) {
  app.get("/api/__e2e__/otp", (c) => {
    const email = c.req.query("email")?.trim().toLowerCase();
    if (!email) {
      return c.json({ error: "email query param required" }, 400);
    }
    const code = options.mailer.take(email);
    if (!code) {
      return c.json({ error: "No OTP captured for email" }, 404);
    }
    return c.json({ email, code });
  });

  app.post("/api/__e2e__/reset-quota", async (c) => {
    let body: { action?: UsageAction } = {};
    try {
      body = (await c.req.json()) as { action?: UsageAction };
    } catch {
      // empty body resets all actions for today
    }
    const today = getTodayUtcDate();
    const updated = await runAsSystem(async (tx) =>
      tx.usageCounter.updateMany({
        where: {
          usageDate: today,
          ...(body.action ? { action: body.action } : {}),
        },
        data: { count: 0 },
      }),
    );
    return c.json({ updatedCount: updated.count });
  });

  app.post("/api/__e2e__/cleanup-user", async (c) => {
    const body = (await c.req.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) return c.json({ error: "email required" }, 400);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, memberships: { select: { spaceId: true } } },
    });
    if (user) {
      const spaceIds = user.memberships.map((m) => m.spaceId);
      await runAsSystem(async (tx) => {
        for (const spaceId of spaceIds) {
          await tx.savedPrompt.deleteMany({ where: { spaceId } });
          await tx.promptGeneration.deleteMany({ where: { spaceId } });
          await tx.usageCounter.deleteMany({ where: { spaceId } });
          await tx.spaceMember.deleteMany({ where: { spaceId } });
        }
      });
      if (spaceIds.length > 0) {
        await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
      }
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.account.deleteMany({ where: { userId: user.id } });
      await prisma.passkey.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    await prisma.verification.deleteMany({ where: { identifier: { contains: email } } });
    return c.json({ cleaned: true });
  });
}
