import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { ComposePromptInputSchema } from "@open-prompt-os/contracts";
import { redactSecrets } from "@open-prompt-os/core";
import type { Context, Hono } from "hono";
import type { ApiEnv } from "../app-env.js";
import { clientKey } from "../client-key.js";

export interface ComposeStreamDeps {
  orchestrator: PromptOrchestrator;
  allowRequest: (key: string) => boolean;
  trustProxy: boolean;
}

export function registerComposeStream(app: Hono<ApiEnv>, deps: ComposeStreamDeps): void {
  app.post("/api/prompts/compose/stream", async (c) => {
    const requestId = c.get("requestId");
    if (!deps.allowRequest(clientKey(c, deps.trustProxy))) {
      return c.json({ code: "RATE_LIMITED", message: "Too many requests.", requestId }, 429);
    }
    const parsed = ComposePromptInputSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json(
        { code: "VALIDATION_ERROR", message: "Request failed validation.", requestId },
        400,
      );
    }
    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();
    const iterator = deps.orchestrator
      .composeStream(parsed.data, { requestId, signal })
      [Symbol.asyncIterator]();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
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
              controller.enqueue(
                encoder.encode(`event: done\ndata: ${JSON.stringify(event.output)}\n\n`),
              );
            }
          }
        } catch (error) {
          const message = redactSecrets(error instanceof Error ? error.message : "Internal error");
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ code: "INTERNAL_ERROR", message, requestId })}\n\n`,
            ),
          );
        } finally {
          await iterator.return?.(undefined);
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
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
