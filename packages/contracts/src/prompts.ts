import { z } from "zod";

export const ComposerModeSchema = z.enum(["text", "image", "video"]);
export type ComposerMode = z.infer<typeof ComposerModeSchema>;

export const PromptFrameworkSchema = z.enum(["costar", "rise", "care", "cot", "none"]);
export type PromptFramework = z.infer<typeof PromptFrameworkSchema>;

export const PromptLengthSchema = z.enum(["short", "balanced", "detailed"]);
export type PromptLength = z.infer<typeof PromptLengthSchema>;

export const ComposerAdvancedSchema = z.object({
  length: PromptLengthSchema.optional(),
  creativity: z.number().min(0).max(1).optional(),
});
export type ComposerAdvanced = z.infer<typeof ComposerAdvancedSchema>;

export const ComposerDraftSchema = z.object({
  rawInput: z.string().max(8000),
  mode: ComposerModeSchema,
  modelId: z.string().nullable(),
  goal: z.string().max(400).optional(),
  audience: z.string().max(400).optional(),
  constraints: z.array(z.string().max(300)).max(15).default([]),
  format: z.string().max(300).optional(),
  persona: z.string().max(300).optional(),
  tone: z.string().max(300).optional(),
  guardrails: z.array(z.string().max(300)).max(15).default([]),
  framework: PromptFrameworkSchema.optional(),
  advanced: ComposerAdvancedSchema.default({}),
});
export type ComposerDraft = z.infer<typeof ComposerDraftSchema>;

export const ProOptionsSchema = ComposerDraftSchema.omit({ rawInput: true });
export type ProOptions = z.infer<typeof ProOptionsSchema>;

export const ComposePromptInputSchema = z.object({
  interactionId: z.string().min(1),
  draft: ComposerDraftSchema.refine((d) => d.rawInput.trim().length > 0, {
    message: "Prompt instruction cannot be empty or whitespace only.",
    path: ["rawInput"],
  }),
  followUpAnswers: z.record(z.string(), z.string()).optional(),
});
export type ComposePromptInput = z.infer<typeof ComposePromptInputSchema>;

export const ComposePromptOutputSchema = z.object({
  interactionId: z.string(),
  compiledPrompt: z.string(),
  detectedVariables: z.array(z.string()),
  followUpQuestions: z.array(z.string()).max(3),
  providerId: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
  healedFromFailure: z.boolean(),
  remainingDailyPrompts: z.number().nullable(),
  requestId: z.string(),
});
export type ComposePromptOutput = z.infer<typeof ComposePromptOutputSchema>;

export const DiagnosticCategorySchema = z.enum([
  "missing_context",
  "ambiguous_goal",
  "conflicting_constraints",
  "undefined_audience",
  "weak_output_format",
  "missing_examples",
  "unsafe_guardrail",
  "model_mismatch",
]);
export type DiagnosticCategory = z.infer<typeof DiagnosticCategorySchema>;

export const DiagnosticSeveritySchema = z.enum(["critical", "warning", "suggestion"]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

export const DiagnosticFindingSchema = z.object({
  id: z.string(),
  category: DiagnosticCategorySchema,
  title: z.string(),
  severity: DiagnosticSeveritySchema,
  evidence: z.string(),
  recommendation: z.string(),
  changedSection: z.string(),
});
export type DiagnosticFinding = z.infer<typeof DiagnosticFindingSchema>;

export const RefinePromptInputSchema = z.object({
  originalPrompt: z.string().trim().min(1, "Original prompt is required.").max(10000),
  mode: z.enum(["improve", "autopsy"]).default("improve"),
  failedOutput: z.string().max(10000).optional(),
  targetLength: PromptLengthSchema.default("balanced"),
  targetTone: z.string().max(200).optional(),
  targetModelId: z.string().optional(),
});
export type RefinePromptInput = z.infer<typeof RefinePromptInputSchema>;

export const RefinePromptOutputSchema = z.object({
  optimizedPrompt: z.string(),
  detectedVariables: z.array(z.string()),
  unresolvedVariables: z.array(z.string()),
  duplicateVariables: z.array(z.string()),
  findings: z.array(DiagnosticFindingSchema),
  summary: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
  requestId: z.string(),
});
export type RefinePromptOutput = z.infer<typeof RefinePromptOutputSchema>;

export const GuestResponseSnapshotSchema = z.object({
  compiledPrompt: z.string(),
  detectedVariables: z.array(z.string()),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GuestResponseSnapshot = z.infer<typeof GuestResponseSnapshotSchema>;

export const GuestMigrationStatusSchema = z.enum(["pending", "migrating", "failed"]);
export type GuestMigrationStatus = z.infer<typeof GuestMigrationStatusSchema>;

export const GuestInteractionV1Schema = z.object({
  version: z.literal(1),
  interactionId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  prompt: ComposerDraftSchema,
  response: GuestResponseSnapshotSchema.nullable(),
  migrationStatus: GuestMigrationStatusSchema,
});
export type GuestInteractionV1 = z.infer<typeof GuestInteractionV1Schema>;

export const ImportGuestInteractionInputSchema = z.object({
  interactionId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  prompt: ComposerDraftSchema,
  response: GuestResponseSnapshotSchema.nullable(),
});
export type ImportGuestInteractionInput = z.infer<typeof ImportGuestInteractionInputSchema>;

export const ImportGuestInteractionOutputSchema = z.object({
  imported: z.boolean(),
  promptGenerationId: z.string(),
});
export type ImportGuestInteractionOutput = z.infer<typeof ImportGuestInteractionOutputSchema>;

export const SavedPromptItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  rawInput: z.string(),
  compiledPrompt: z.string(),
  mode: ComposerModeSchema,
  framework: PromptFrameworkSchema,
  modelId: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  detectedVariables: z.array(z.string()),
  isShared: z.boolean(),
  shareId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedPromptItem = z.infer<typeof SavedPromptItemSchema>;

export const SavePromptInputSchema = z.object({
  title: z.string().min(1).max(160),
  rawInput: z.string().min(1).max(8000),
  compiledPrompt: z.string().min(1).max(16000),
  mode: ComposerModeSchema,
  framework: PromptFrameworkSchema.default("costar"),
  modelId: z.string().default("gpt-4.1"),
  category: z.string().default("General"),
  tags: z.array(z.string()).default([]),
});
export type SavePromptInput = z.infer<typeof SavePromptInputSchema>;

export const PromptTemplateSchema = z.object({
  slug: z.string(),
  title: z.string(),
  useCase: z.string(),
  category: z.string(),
  mode: ComposerModeSchema,
  framework: PromptFrameworkSchema,
  frameworkBadge: z.string(),
  compatibleModels: z.array(z.string()),
  preview: z.string(),
  compiledTemplate: z.string(),
  defaultDraft: ComposerDraftSchema,
  popularityScore: z.number(),
  updatedAt: z.string(),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;
