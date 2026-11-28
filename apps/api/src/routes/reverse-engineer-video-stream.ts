import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type { Auth } from "@open-prompt-os/auth";
import {
  VIDEO_REVERSE_ENGINEER_LIMITS,
  VideoGeneratorTargetSchema,
  VideoReverseEngineerInputSchema,
  VideoReverseEngineerMimeSchema,
} from "@open-prompt-os/contracts";
import { parsePublicVideoUrl } from "@open-prompt-os/core";
import { prisma } from "@open-prompt-os/db";
import type { Context, Hono } from "hono";
import type { ApiEnv } from "../app-env.js";
import { type ResolvedActor, resolveActor } from "../auth/session-resolver.js";
import type { TrustProxyMode } from "../client-key.js";
import { toUserFacingServerError } from "../errors.js";
import { enrichRequestContext, logger } from "../logger.js";
import type { ApiErrorTracker } from "../posthog.js";
import { recordPromptGeneration, releaseQuota, reserveQuota } from "../services/usage-quota.js";

export interface VideoReverseEngineerStreamDeps {
  orchestrator: PromptOrchestrator;
  trustProxy: TrustProxyMode;
  auth?: Auth;
  errorTracker?: ApiErrorTracker;
}

const STAGE_MESSAGES = {
  preparing: "Preparing video clip for multimodal inspection...",
  analyzing: "Analyzing frames, camera motion, and audio (usually 15–45s)...",
  finalizing: "Validating shot timeline, Continuity Bible, and variables...",
} as const;

async function resolveActorLimits(actor: ResolvedActor) {
  if (!actor.spaceId) {
    return { tier: "guest" as const, ...VIDEO_REVERSE_ENGINEER_LIMITS.guest };
  }
  try {
    const space = await prisma.space.findUnique({
      where: { id: actor.spaceId },
      include: {
        subscriptions: {
          where: { status: { in: ["active", "trialing", "past_due"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const plan = space?.subscriptions[0]?.plan ?? space?.plan ?? "free";
    return { tier: plan, ...VIDEO_REVERSE_ENGINEER_LIMITS[plan] };
  } catch (error) {
    logger.warn("Failed to resolve video tier limits; falling back to free", {
      event: "video.limits_lookup_failed",
      err: error,
    });
    return { tier: "free" as const, ...VIDEO_REVERSE_ENGINEER_LIMITS.free };
  }
}

function parseOptionalNumber(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function formatBytesMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function registerVideoReverseEngineerStream(
  app: Hono<ApiEnv>,
  deps: VideoReverseEngineerStreamDeps,
): void {
  app.post("/api/prompts/reverse-engineer-video/stream", async (c) => {
    const requestId = c.get("requestId");
    const actor = await resolveActor(c, deps.trustProxy, deps.auth);
    enrichRequestContext({
      userId: actor.userId,
      spaceId: actor.spaceId,
      rpcProcedure: "prompts.reverseEngineerVideoStream",
    });

    if (!actor.userId || !actor.spaceId) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Please sign in to reverse-engineer videos.",
          },
        },
        401,
      );
    }

    const limits = await resolveActorLimits(actor);
    const contentType = c.req.header("content-type")?.toLowerCase() ?? "";

    let inputPayload: ReturnType<typeof VideoReverseEngineerInputSchema.parse>;
    let fileBytes: Uint8Array | undefined;
    let rawSourceLabel = "";

    if (contentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json(
          { code: "VALIDATION_ERROR", message: "Invalid multipart form upload.", requestId },
          400,
        );
      }

      const fileEntry = form.get("file");
      if (
        !fileEntry ||
        typeof fileEntry !== "object" ||
        !("arrayBuffer" in fileEntry) ||
        typeof fileEntry.size !== "number"
      ) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: "Upload an MP4, WebM, or MOV video file.",
            requestId,
          },
          400,
        );
      }

      const rawMime =
        typeof fileEntry.type === "string" ? fileEntry.type.split(";")[0]?.trim() : "";
      const mimeParsed = VideoReverseEngineerMimeSchema.safeParse(rawMime);
      if (!mimeParsed.success) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: "Unsupported video format. Upload an MP4, WebM, or MOV clip.",
            requestId,
          },
          400,
        );
      }

      if (fileEntry.size <= 0) {
        return c.json(
          { code: "VALIDATION_ERROR", message: "Uploaded video file is empty.", requestId },
          400,
        );
      }

      if (fileEntry.size > limits.maxBytes) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: `Video exceeds the ${formatBytesMb(limits.maxBytes)} limit for the ${limits.tier} tier.`,
            requestId,
          },
          400,
        );
      }

      const startOffsetSec = parseOptionalNumber(form.get("startOffsetSec")) ?? 0;
      const endOffsetSec = parseOptionalNumber(form.get("endOffsetSec"));
      const durationSeconds = parseOptionalNumber(form.get("durationSeconds"));
      const targetGeneratorRaw = form.get("targetGenerator");
      const targetGeneratorParsed = VideoGeneratorTargetSchema.safeParse(
        typeof targetGeneratorRaw === "string" ? targetGeneratorRaw : "veo",
      );
      const focusNotesRaw = form.get("focusNotes");
      const focusNotes =
        typeof focusNotesRaw === "string" && focusNotesRaw.trim().length > 0
          ? focusNotesRaw.trim()
          : undefined;

      const parsed = VideoReverseEngineerInputSchema.safeParse({
        sourceType: "upload",
        mimeType: mimeParsed.data,
        durationSeconds,
        startOffsetSec,
        endOffsetSec,
        targetGenerator: targetGeneratorParsed.success ? targetGeneratorParsed.data : "veo",
        focusNotes,
      });
      if (!parsed.success) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Video parameters failed validation.",
            requestId,
          },
          400,
        );
      }

      if (
        parsed.data.durationSeconds !== undefined &&
        parsed.data.startOffsetSec >= parsed.data.durationSeconds
      ) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: "Start time must be less than video duration.",
            requestId,
          },
          400,
        );
      }
      if (
        parsed.data.durationSeconds !== undefined &&
        parsed.data.endOffsetSec !== undefined &&
        parsed.data.endOffsetSec > parsed.data.durationSeconds
      ) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: "End time cannot exceed video duration.",
            requestId,
          },
          400,
        );
      }

      const rawEffectiveEnd = parsed.data.endOffsetSec ?? parsed.data.durationSeconds;
      if (rawEffectiveEnd !== undefined && rawEffectiveEnd <= parsed.data.startOffsetSec) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: "End time must be greater than start time.",
            requestId,
          },
          400,
        );
      }
      if (
        rawEffectiveEnd !== undefined &&
        rawEffectiveEnd - parsed.data.startOffsetSec > limits.maxDurationSec
      ) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: `Selected clip segment exceeds the ${limits.maxDurationSec}s limit for the ${limits.tier} tier. Adjust Start/End trim offsets.`,
            requestId,
          },
          400,
        );
      }

      const effectiveEnd = Math.min(
        rawEffectiveEnd ?? parsed.data.startOffsetSec + limits.maxDurationSec,
        parsed.data.startOffsetSec + limits.maxDurationSec,
        ...(parsed.data.durationSeconds !== undefined ? [parsed.data.durationSeconds] : []),
      );
      inputPayload = {
        ...parsed.data,
        endOffsetSec: effectiveEnd,
      };
      fileBytes = new Uint8Array(await fileEntry.arrayBuffer());
      rawSourceLabel = parsed.data.focusNotes || `[Video Upload: ${parsed.data.mimeType}]`;
    } else {
      const body = await readJson(c);
      const parsed = VideoReverseEngineerInputSchema.safeParse(body);
      if (!parsed.success || parsed.data.sourceType !== "youtube" || !parsed.data.youtubeUrl) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: parsed.success
              ? "Provide a public YouTube URL or upload an MP4, WebM, or MOV file."
              : (parsed.error.issues[0]?.message ?? "Request failed validation."),
            requestId,
          },
          400,
        );
      }

      const urlCheck = parsePublicVideoUrl(parsed.data.youtubeUrl);
      if (!urlCheck.ok) {
        return c.json({ code: "VALIDATION_ERROR", message: urlCheck.message, requestId }, 400);
      }

      const effectiveEnd =
        parsed.data.endOffsetSec ?? parsed.data.startOffsetSec + limits.maxDurationSec;
      if (effectiveEnd - parsed.data.startOffsetSec > limits.maxDurationSec) {
        return c.json(
          {
            code: "VALIDATION_ERROR",
            message: `Selected segment exceeds the ${limits.maxDurationSec}s limit for the ${limits.tier} tier. Trim Start/End within ${limits.maxDurationSec}s.`,
            requestId,
          },
          400,
        );
      }

      inputPayload = {
        ...parsed.data,
        youtubeUrl: urlCheck.canonicalUrl,
        endOffsetSec: effectiveEnd,
      };
      rawSourceLabel = parsed.data.focusNotes || urlCheck.canonicalUrl;
    }

    const quota = await reserveQuota(actor, "reverse_engineer");
    if (!quota.allowed) {
      return c.json(
        {
          code: "QUOTA_EXCEEDED",
          message:
            "Daily limit reached for Reverse Engineer. Upgrade your plan or try again tomorrow.",
          requestId,
        },
        403,
      );
    }

    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();
    const started = Date.now();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Stream controller may already be closed if client disconnected.
          }
        };

        try {
          controller.enqueue(encoder.encode(": stream-open\n\n"));

          const output = await deps.orchestrator.reverseEngineerVideo(
            {
              ...inputPayload,
              fileBytes,
            },
            {
              requestId,
              signal,
              onStage: (stage) => {
                sendEvent("stage", { stage, message: STAGE_MESSAGES[stage] });
              },
            },
          );

          const latencyMs = output.latencyMs || Date.now() - started;
          await recordPromptGeneration(actor, {
            kind: "reverse_engineer",
            rawInput: rawSourceLabel.slice(0, 8000),
            compiledPrompt: output.masterPrompt,
            draft: output.suggestedDraft,
            mode: "video",
            framework: "costar",
            modelId: output.modelId,
            providerId: output.providerId,
            latencyMs,
          });

          if (actor.userId) {
            deps.errorTracker?.captureEvent?.({
              distinctId: actor.userId,
              event: "api:reverse_engineer_video",
              properties: {
                space_id: actor.spaceId,
                source_type: inputPayload.sourceType,
                target_generator: inputPayload.targetGenerator,
                model_id: output.modelId,
                provider_id: output.providerId,
                latency_ms: latencyMs,
              },
            });
          }

          output.remainingDailyRuns = quota.remainingDaily;
          sendEvent("done", output);
        } catch (error) {
          if (quota.reserved) {
            await releaseQuota(actor, "reverse_engineer");
          }
          logger.error("Video reverse engineer stream failed", {
            event: "prompt.video_reverse_engineer_failed",
            requestId,
            err: error,
          });
          deps.errorTracker?.captureException(error, {
            distinctId: actor.userId,
            spaceId: actor.spaceId,
            requestId,
            path: c.req.path,
            method: c.req.method,
            status: 500,
            source: "prompt.video_reverse_engineer_failed",
          });
          const safe = toUserFacingServerError(error);
          sendEvent("error", { code: safe.code, message: safe.message, requestId });
        } finally {
          try {
            controller.close();
          } catch {
            // Controller may already be closed.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-request-id": requestId,
      },
    });
  });
}
