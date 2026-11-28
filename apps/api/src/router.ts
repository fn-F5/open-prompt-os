import type { BillingProvider, PromptOrchestrator } from "@open-prompt-os/adapter-kit";
import { MODEL_CATALOG } from "@open-prompt-os/adapters";
import { appContract } from "@open-prompt-os/contracts";
import type { ComposerMode } from "@open-prompt-os/contracts";
import { prisma } from "@open-prompt-os/db";
import { implement } from "@orpc/server";
import type { ResolvedActor } from "./auth/session-resolver.js";
import { logger } from "./logger.js";
import type { ApiErrorTracker } from "./posthog.js";
import { executeCompose, executeRefine, executeReverseEngineer } from "./procedures/prompts.js";
import {
  createCustomerPortalSession,
  refreshBillingStatus,
  startCheckoutSession,
  switchEmulatedPlan,
} from "./services/billing-service.js";
import { listMyFeedback, submitFeedback } from "./services/feedback-service.js";
import { registerPlanInterest } from "./services/plan-interest-service.js";
import {
  deletePrompt,
  getSharedPrompt,
  importGuestInteraction,
  listPromptGenerations,
  listPromptHistory,
  savePrompt,
  sharePrompt,
} from "./services/prompt-library-service.js";
import { getTemplateBySlug, listTemplates } from "./services/template-service.js";
import { getBillingStatus } from "./services/usage-quota.js";
import {
  getUserPreferences,
  recordSignupAttribution,
  updateUserPreferences,
} from "./services/user-preferences-service.js";

export interface RequestContext {
  requestId: string;
  actor: ResolvedActor;
  signal?: AbortSignal;
}

export interface RouterDeps {
  orchestrator: PromptOrchestrator;
  billingProvider: BillingProvider;
  webOrigins?: readonly string[];
  errorTracker?: ApiErrorTracker;
}

function modesFor(modelId: string): ComposerMode[] {
  if (modelId.endsWith("-image") || modelId.includes("imagen") || modelId.includes("flux")) {
    return ["image"];
  }
  if (modelId.endsWith("-video") || modelId.includes("veo") || modelId.includes("sora")) {
    return ["video"];
  }
  return ["text"];
}

const os = implement(appContract).$context<RequestContext>();

export function createRouter(deps: RouterDeps) {
  function trackUserActivity(
    actor: ResolvedActor,
    event: string,
    properties?: Record<string, string | number | boolean | null | undefined>,
  ): void {
    if (!actor.userId) return;
    deps.errorTracker?.captureEvent?.({
      distinctId: actor.userId,
      event,
      properties: {
        ...(actor.spaceId ? { space_id: actor.spaceId } : {}),
        ...properties,
      },
    });
  }

  return os.router({
    health: os.health.handler(async () => {
      const snapshot = deps.orchestrator.healthSnapshot();
      const degradedCircuit = snapshot.some((item) => item.circuit !== "closed");
      const active = snapshot.find(
        (item) => item.circuit === "closed" && item.providerId !== "rule-synthesizer",
      );

      let dbHealthy = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        logger.error("Health check database ping failed", {
          event: "health.db_failed",
          err: error,
        });
        dbHealthy = false;
      }

      const isDegraded = degradedCircuit || !dbHealthy;

      return {
        status: isDegraded ? "degraded" : "ok",
        activeProvider: active?.providerId ?? "rule-synthesizer",
        selfHealingActive: true,
        timestamp: new Date().toISOString(),
      };
    }),
    prompts: {
      compose: os.prompts.compose.handler(async ({ input, context, signal }) => {
        const result = await executeCompose(deps.orchestrator, input, {
          requestId: context.requestId,
          actor: context.actor,
          signal: signal ?? context.signal,
        });
        trackUserActivity(context.actor, "api:prompt_compose", {
          mode: input.draft.mode,
          framework: input.draft.framework ?? "costar",
          model_id: input.draft.modelId,
          provider_id: result.providerId,
          latency_ms: result.latencyMs,
          streaming: false,
        });
        return result;
      }),
      refine: os.prompts.refine.handler(async ({ input, context, signal }) => {
        const result = await executeRefine(deps.orchestrator, input, {
          requestId: context.requestId,
          actor: context.actor,
          kind: "refine",
          signal: signal ?? context.signal,
        });
        trackUserActivity(context.actor, "api:prompt_refine", {
          model_id: result.modelId,
          provider_id: result.providerId,
          latency_ms: result.latencyMs,
        });
        return result;
      }),
      autopsy: os.prompts.autopsy.handler(async ({ input, context, signal }) => {
        const result = await executeRefine(
          deps.orchestrator,
          { ...input, mode: "autopsy" },
          {
            requestId: context.requestId,
            actor: context.actor,
            kind: "autopsy",
            signal: signal ?? context.signal,
          },
        );
        trackUserActivity(context.actor, "api:prompt_autopsy", {
          model_id: result.modelId,
          provider_id: result.providerId,
          latency_ms: result.latencyMs,
        });
        return result;
      }),
      reverseEngineer: os.prompts.reverseEngineer.handler(async ({ input, context, signal }) => {
        const result = await executeReverseEngineer(deps.orchestrator, input, {
          requestId: context.requestId,
          actor: context.actor,
          signal: signal ?? context.signal,
        });
        trackUserActivity(context.actor, "api:reverse_engineer_image", {
          target_mode: input.targetMode,
          model_id: result.modelId,
          provider_id: result.providerId,
          latency_ms: result.latencyMs,
        });
        return result;
      }),
      importGuestInteraction: os.prompts.importGuestInteraction.handler(
        async ({ input, context }) => {
          return importGuestInteraction(context.actor, input);
        },
      ),
      history: os.prompts.history.handler(async ({ input, context }) => {
        return listPromptHistory(context.actor, input);
      }),
      generations: os.prompts.generations.handler(async ({ input, context }) => {
        return listPromptGenerations(context.actor, input);
      }),
      save: os.prompts.save.handler(async ({ input, context }) => {
        const result = await savePrompt(context.actor, input);
        trackUserActivity(context.actor, "api:prompt_save", {
          mode: input.mode,
          framework: input.framework,
          model_id: input.modelId,
        });
        return result;
      }),
      delete: os.prompts.delete.handler(async ({ input, context }) => {
        const result = await deletePrompt(context.actor, input.id);
        if (result.deleted) {
          trackUserActivity(context.actor, "api:prompt_delete");
        }
        return result;
      }),
      share: os.prompts.share.handler(async ({ input, context }) => {
        const origin = deps.webOrigins?.[0] ?? "http://localhost:5173";
        const result = await sharePrompt(context.actor, input.id, origin);
        trackUserActivity(context.actor, "api:prompt_share");
        return result;
      }),
      getShared: os.prompts.getShared.handler(async ({ input }) => {
        return getSharedPrompt(input.shareId);
      }),
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
      list: os.templates.list.handler(async ({ input }) => {
        return listTemplates(input);
      }),
      getBySlug: os.templates.getBySlug.handler(async ({ input }) => {
        return getTemplateBySlug(input.slug);
      }),
    },
    userPreferences: {
      get: os.userPreferences.get.handler(async ({ context }) => {
        return getUserPreferences(context.actor);
      }),
      updateOnboarding: os.userPreferences.updateOnboarding.handler(async ({ input, context }) => {
        return updateUserPreferences(context.actor, input);
      }),
      recordSignupAttribution: os.userPreferences.recordSignupAttribution.handler(
        async ({ input, context }) => {
          const result = await recordSignupAttribution(context.actor, input);
          if (result.recorded && context.actor.userId) {
            deps.errorTracker?.identifyUser?.({
              distinctId: context.actor.userId,
              spaceId: context.actor.spaceId,
            });
            trackUserActivity(context.actor, "api:signup_attribution_record", {
              referral_source: input.referralSource,
            });
          }
          return result;
        },
      ),
    },
    feedback: {
      submit: os.feedback.submit.handler(async ({ input, context }) => {
        const result = await submitFeedback(context.actor, input);
        trackUserActivity(context.actor, "api:feedback_submit", {
          kind: input.kind,
        });
        return result;
      }),
      listMine: os.feedback.listMine.handler(async ({ input, context }) => {
        return listMyFeedback(context.actor, input?.limit);
      }),
    },
    billing: {
      plans: os.billing.plans.handler(async () => {
        return deps.billingProvider.listPlans();
      }),
      status: os.billing.status.handler(async ({ context }) => {
        return getBillingStatus(context.actor);
      }),
      refresh: os.billing.refresh.handler(async ({ context }) => {
        return refreshBillingStatus(context.actor, deps.billingProvider);
      }),
      checkout: os.billing.checkout.handler(async ({ input, context }) => {
        const origin = deps.webOrigins?.[0] ?? "http://localhost:5173";
        const result = await startCheckoutSession(
          context.actor,
          input,
          deps.billingProvider,
          origin,
        );
        trackUserActivity(context.actor, "api:billing_checkout", {
          plan: input.plan,
          interval: input.interval,
          seats: input.seats,
        });
        return result;
      }),
      portal: os.billing.portal.handler(async ({ context }) => {
        const origin = deps.webOrigins?.[0] ?? "http://localhost:5173";
        return createCustomerPortalSession(context.actor, deps.billingProvider, origin);
      }),
      emulatePlan: os.billing.emulatePlan.handler(async ({ input, context }) => {
        return switchEmulatedPlan(context.actor, input, deps.billingProvider);
      }),
      registerInterest: os.billing.registerInterest.handler(async ({ input, context }) => {
        return registerPlanInterest(context.actor, input);
      }),
    },
  });
}
