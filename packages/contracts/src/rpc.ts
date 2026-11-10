import { oc } from "@orpc/contract";
import { z } from "zod";
import { OnboardingPreferencesSchema, UpdateOnboardingInputSchema } from "./auth.js";
import { BillingStatusSchema, CheckoutInputSchema } from "./billing.js";
import { ModelOptionSchema, ProviderHealthSchema } from "./models.js";
import {
  ComposePromptInputSchema,
  ComposePromptOutputSchema,
  ComposerModeSchema,
  ImportGuestInteractionInputSchema,
  ImportGuestInteractionOutputSchema,
  PromptFrameworkSchema,
  PromptTemplateSchema,
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
  SavePromptInputSchema,
  SavedPromptItemSchema,
} from "./prompts.js";
import { SystemHealthSchema } from "./telemetry.js";

export const appContract = {
  health: oc.output(SystemHealthSchema),
  prompts: {
    compose: oc.input(ComposePromptInputSchema).output(ComposePromptOutputSchema),
    refine: oc.input(RefinePromptInputSchema).output(RefinePromptOutputSchema),
    autopsy: oc.input(RefinePromptInputSchema).output(RefinePromptOutputSchema),
    importGuestInteraction: oc
      .input(ImportGuestInteractionInputSchema)
      .output(ImportGuestInteractionOutputSchema),
    history: oc
      .input(
        z
          .object({
            search: z.string().optional(),
            category: z.string().optional(),
            mode: ComposerModeSchema.optional(),
            cursor: z.string().optional(),
            limit: z.number().int().min(1).max(50).default(20),
          })
          .optional(),
      )
      .output(
        z.object({
          items: z.array(SavedPromptItemSchema),
          nextCursor: z.string().nullable(),
        }),
      ),
    save: oc.input(SavePromptInputSchema).output(SavedPromptItemSchema),
    delete: oc.input(z.object({ id: z.string() })).output(z.object({ deleted: z.boolean() })),
    share: oc
      .input(z.object({ id: z.string() }))
      .output(z.object({ shareId: z.string(), shareUrl: z.string() })),
    getShared: oc
      .input(z.object({ shareId: z.string() }))
      .output(SavedPromptItemSchema.nullable()),
  },
  models: {
    listProviders: oc
      .input(z.object({ mode: ComposerModeSchema.optional() }).optional())
      .output(z.array(ModelOptionSchema)),
    healthStatus: oc.output(z.array(ProviderHealthSchema)),
  },
  templates: {
    list: oc
      .input(
        z
          .object({
            mode: ComposerModeSchema.optional(),
            framework: PromptFrameworkSchema.optional(),
            category: z.string().optional(),
            search: z.string().optional(),
          })
          .optional(),
      )
      .output(z.array(PromptTemplateSchema)),
    getBySlug: oc
      .input(z.object({ slug: z.string() }))
      .output(PromptTemplateSchema.nullable()),
  },
  userPreferences: {
    get: oc.output(OnboardingPreferencesSchema),
    updateOnboarding: oc.input(UpdateOnboardingInputSchema).output(OnboardingPreferencesSchema),
  },
  billing: {
    status: oc.output(BillingStatusSchema),
    refresh: oc.output(BillingStatusSchema),
    checkout: oc.input(CheckoutInputSchema).output(z.object({ url: z.string() })),
    portal: oc.output(z.object({ url: z.string() })),
  },
} as const;
