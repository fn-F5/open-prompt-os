import type { PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { MODEL_CATALOG } from "@open-prompt-os/adapters";
import { appContract } from "@open-prompt-os/contracts";
import type { BillingStatus, ComposerMode } from "@open-prompt-os/contracts";
import { ORPCError, implement } from "@orpc/server";
import { executeCompose, executeRefine } from "./procedures/prompts.js";

export interface RequestContext {
  requestId: string;
  clientKey: string;
  signal?: AbortSignal;
}

export interface RouterDeps {
  orchestrator: PromptOrchestrator;
}

const billingStub: BillingStatus = {
  plan: "free",
  status: "active",
  remainingDailyPrompts: 0,
  dailyLimit: 0,
  resetAt: new Date(0).toISOString(),
  seats: 1,
  currentPeriodEnd: null,
};

function modesFor(modelId: string): ComposerMode[] {
  if (modelId.includes("imagen") || modelId.includes("flux")) return ["image"];
  if (modelId.includes("veo") || modelId.includes("sora")) return ["video"];
  return ["text"];
}

const os = implement(appContract).$context<RequestContext>();

export function createRouter(deps: RouterDeps) {
  return os.router({
    health: os.health.handler(async () => {
      const snapshot = deps.orchestrator.healthSnapshot();
      const degraded = snapshot.some((item) => item.circuit !== "closed");
      const active = snapshot.find(
        (item) => item.circuit === "closed" && item.providerId !== "rule-synthesizer",
      );
      return {
        status: degraded ? "degraded" : "ok",
        activeProvider: active?.providerId ?? "rule-synthesizer",
        selfHealingActive: true,
        timestamp: new Date().toISOString(),
      };
    }),
    prompts: {
      compose: os.prompts.compose.handler(async ({ input, context, signal }) => {
        return executeCompose(deps.orchestrator, input, {
          requestId: context.requestId,
          signal: signal ?? context.signal,
        });
      }),
      refine: os.prompts.refine.handler(async ({ input, context, signal }) => {
        return executeRefine(deps.orchestrator, input, {
          requestId: context.requestId,
          signal: signal ?? context.signal,
        });
      }),
      autopsy: os.prompts.autopsy.handler(async ({ input, context, signal }) => {
        return executeRefine(
          deps.orchestrator,
          { ...input, mode: "autopsy" },
          { requestId: context.requestId, signal: signal ?? context.signal },
        );
      }),
      importGuestInteraction: os.prompts.importGuestInteraction.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Not implemented" });
      }),
      history: os.prompts.history.handler(async () => ({ items: [], nextCursor: null })),
      save: os.prompts.save.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Not implemented" });
      }),
      delete: os.prompts.delete.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Not implemented" });
      }),
      share: os.prompts.share.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Not implemented" });
      }),
      getShared: os.prompts.getShared.handler(async () => null),
    },
    models: {
      listProviders: os.models.listProviders.handler(async ({ input }) => {
        return MODEL_CATALOG.filter(
          (entry) => !input?.mode || modesFor(entry.modelId).includes(input.mode),
        ).map((entry) => ({
          id: entry.modelId,
          name: entry.displayName,
          providerId: entry.providerId,
          providerName: entry.displayName,
          glyph: entry.providerId.slice(0, 1).toUpperCase(),
          modes: modesFor(entry.modelId),
          capabilities: [],
          status: "available" as const,
          latencyLabel: "live",
        }));
      }),
      healthStatus: os.models.healthStatus.handler(async () => {
        return deps.orchestrator.healthSnapshot().map((item) => ({
          providerId: item.providerId,
          circuit: item.circuit,
          recentFailureRate: item.recentFailureRate,
          lastErrorAt: item.lastErrorAt,
        }));
      }),
    },
    templates: {
      list: os.templates.list.handler(async () => []),
      getBySlug: os.templates.getBySlug.handler(async () => null),
    },
    userPreferences: {
      get: os.userPreferences.get.handler(async () => ({
        dismissedHotspots: {},
        completedTours: {},
      })),
      updateOnboarding: os.userPreferences.updateOnboarding.handler(async () => ({
        dismissedHotspots: {},
        completedTours: {},
      })),
    },
    billing: {
      status: os.billing.status.handler(async () => billingStub),
      refresh: os.billing.refresh.handler(async () => billingStub),
      checkout: os.billing.checkout.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Billing is not enabled." });
      }),
      portal: os.billing.portal.handler(async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Billing is not enabled." });
      }),
    },
  });
}
