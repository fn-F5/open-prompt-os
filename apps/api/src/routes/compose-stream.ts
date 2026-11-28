import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import type { Auth } from "@open-prompt-os/auth";
import { ComposePromptInputSchema } from "@open-prompt-os/contracts";
import { evaluatePromptQuality, extractDraftSupplementalText } from "@open-prompt-os/core";
import type { Context, Hono } from "hono";
import type { ApiEnv } from "../app-env.js";
import { resolveActor } from "../auth/session-resolver.js";
import type { TrustProxyMode } from "../client-key.js";
import { toUserFacingServerError } from "../errors.js";
import { enrichRequestContext, logger } from "../logger.js";
import type { ApiErrorTracker } from "../posthog.js";
import { recordPromptGeneration, releaseQuota, reserveQuota } from "../services/usage-quota.js";

export interface ComposeStreamDeps {
  orchestrator: PromptOrchestrator;
  allowRequest: (key: string) => boolean;
  trustProxy: TrustProxyMode;
  auth?: Auth;
  errorTracker?: ApiErrorTracker;
}

export function registerComposeStream(app: Hono<ApiEnv>, deps: ComposeStreamDeps): void {
  app.post("/api/prompts/compose/stream", async (c) => {
    const requestId = c.get("requestId");
    const actor = await resolveActor(c, deps.trustProxy, deps.auth);
    enrichRequestContext({
      userId: actor.userId,
      spaceId: actor.spaceId,
      rpcProcedure: "prompts.composeStream",
    });

    if (!actor.userId || !actor.spaceId) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Please sign in to compile prompts.",
          },
        },
        401,
      );
    }

    if (!deps.allowRequest(actor.clientKey)) {
      return c.json({ code: "RATE_LIMITED", message: "Too many requests.", requestId }, 429);
    }

    const parsed = ComposePromptInputSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json(
        { code: "VALIDATION_ERROR", message: "Request failed validation.", requestId },
        400,
      );
    }

    const quality = evaluatePromptQuality(parsed.data.draft.rawInput, {
      supplementalText: extractDraftSupplementalText(parsed.data.draft),
    });
    if (!quality.ok) {
      return c.json({ code: "VALIDATION_ERROR", message: quality.message, requestId }, 400);
    }

    const quota = await reserveQuota(actor, "compose");
    if (!quota.allowed) {
      return c.json(
        {
          code: "QUOTA_EXCEEDED",
          message:
            "Daily limit reached for prompt composition. Upgrade your plan or try again tomorrow.",
          requestId,
        },
        403,
      );
    }

    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();
    const started = Date.now();
    const iterator = deps.orchestrator
      .composeStream(parsed.data, { requestId, signal })
      [Symbol.asyncIterator]();
    let iteratorClosed = false;
    const closeIterator = async () => {
      if (iteratorClosed) return;
      iteratorClosed = true;
      await iterator.return?.(undefined);
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Flush SSE headers immediately through dev/reverse proxies before awaiting the first token.
          controller.enqueue(encoder.encode(": stream-open\n\n"));
          let completed = false;

          while (!signal.aborted) {
            const next = await iterator.next();
            if (next.done) break;
            const event = next.value;
            if (event.type === "text-delta") {
              controller.enqueue(
                encoder.encode(
                  `event: text-delta\ndata: ${JSON.stringify({ text: event.text })}\n\n`,
                ),
              );
            } else {
              const latencyMs = event.output.latencyMs ?? Date.now() - started;

              await recordPromptGeneration(actor, {
                kind: "compose",
                rawInput: parsed.data.draft.rawInput,
                compiledPrompt: event.output.compiledPrompt,
                draft: parsed.data.draft,
                mode: parsed.data.draft.mode,
                framework: parsed.data.draft.framework ?? "costar",
                modelId: parsed.data.draft.modelId,
                providerId: event.output.providerId,
                latencyMs,
              });

              if (actor.userId) {
                deps.errorTracker?.captureEvent?.({
                  distinctId: actor.userId,
                  event: "api:prompt_compose",
                  properties: {
                    space_id: actor.spaceId,
                    mode: parsed.data.draft.mode,
                    framework: parsed.data.draft.framework ?? "costar",
                    model_id: parsed.data.draft.modelId,
                    provider_id: event.output.providerId,
                    latency_ms: latencyMs,
                    streaming: true,
                  },
                });
              }

              event.output.remainingDailyPrompts = quota.remainingDaily;
              completed = true;

              controller.enqueue(
                encoder.encode(`event: done\ndata: ${JSON.stringify(event.output)}\n\n`),
              );
            }
          }

          if (!signal.aborted && !completed) {
            throw new Error("Compose stream ended without a completion event.");
          }
          if (signal.aborted && !completed && quota.reserved) {
            await releaseQuota(actor, "compose");
          }
        } catch (error) {
          if (quota.reserved) {
            await releaseQuota(actor, "compose");
          }
          logger.error("Compose stream failed", {
            event: "prompt.stream_failed",
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
            source: "prompt.stream_failed",
          });
          const safe = toUserFacingServerError(error);
          try {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ code: safe.code, message: safe.message, requestId })}\n\n`,
              ),
            );
          } catch {
            // Stream controller may already be closed if client disconnected.
          }
        } finally {
          await closeIterator();
          try {
            controller.close();
          } catch {
            // Controller may already be closed after cancellation.
          }
        }
      },
      async cancel() {
        await closeIterator();
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

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
