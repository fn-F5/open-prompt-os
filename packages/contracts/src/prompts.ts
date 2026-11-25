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

export const ReverseEngineerImageMimeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
export type ReverseEngineerImageMime = z.infer<typeof ReverseEngineerImageMimeSchema>;

// 4 MB binary image ~= 5.33 MB in base64 characters
const MAX_BASE64_LENGTH = 5_600_000;

export const SafeImageDataUrlSchema = z
  .string()
  .max(150_000, "Thumbnail preview exceeds maximum size.")
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: "Thumbnail must be a base64-encoded PNG, JPEG, or WebP data URL.",
  });

export const ReverseEngineerInputSchema = z.object({
  imageBase64: z
    .string()
    .trim()
    .min(32, "Image payload is required.")
    .max(MAX_BASE64_LENGTH, "Image exceeds maximum size of 4MB.")
    .refine((val) => !val.startsWith("data:"), {
      message: "Pass raw base64 without the data:...;base64, prefix.",
    }),
  mimeType: ReverseEngineerImageMimeSchema,
  targetMode: z.enum(["image", "video"]).default("image"),
  targetModelId: z.string().optional(),
  focusNotes: z.string().max(500).optional(),
  previewImageDataUrl: SafeImageDataUrlSchema.optional(),
});
export type ReverseEngineerInput = z.infer<typeof ReverseEngineerInputSchema>;

export const ReverseEngineerBreakdownSchema = z.object({
  subject: z.string(),
  styleAndMedium: z.string(),
  lightingAndColor: z.string(),
  cameraAndComposition: z.string(),
  moodAndAtmosphere: z.string(),
  negativePrompt: z.string(),
});
export type ReverseEngineerBreakdown = z.infer<typeof ReverseEngineerBreakdownSchema>;

export const ReverseEngineerOutputSchema = z.object({
  reconstructedPrompt: z.string(),
  detectedVariables: z.array(z.string()),
  breakdown: ReverseEngineerBreakdownSchema,
  suggestedDraft: ComposerDraftSchema,
  providerId: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
  remainingDailyRuns: z.number().nullable(),
  requestId: z.string(),
});
export type ReverseEngineerOutput = z.infer<typeof ReverseEngineerOutputSchema>;

export const GenerationKindSchema = z.enum([
  "compose",
  "refine",
  "autopsy",
  "reverse_engineer",
  "guest_import",
]);
export type GenerationKind = z.infer<typeof GenerationKindSchema>;

export const PromptGenerationItemSchema = z.object({
  id: z.string(),
  kind: GenerationKindSchema,
  rawInput: z.string(),
  compiledPrompt: z.string(),
  draft: ComposerDraftSchema.nullable(),
  inputImageUrl: SafeImageDataUrlSchema.nullable().default(null),
  mode: ComposerModeSchema,
  framework: PromptFrameworkSchema,
  modelId: z.string().nullable(),
  providerId: z.string(),
  latencyMs: z.number(),
  createdAt: z.string(),
});
export type PromptGenerationItem = z.infer<typeof PromptGenerationItemSchema>;

export const VideoGeneratorTargetSchema = z.enum(["veo", "sora", "runway", "kling_wan", "general"]);
export type VideoGeneratorTarget = z.infer<typeof VideoGeneratorTargetSchema>;

export const VideoReverseEngineerMimeSchema = z.enum([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
export type VideoReverseEngineerMime = z.infer<typeof VideoReverseEngineerMimeSchema>;

export const VideoShotSchema = z.object({
  shotNumber: z.number().int().min(1).max(8),
  startTime: z.string().min(1).max(16),
  endTime: z.string().min(1).max(16),
  transitionIn: z.string().min(1).max(120),
  firstFramePrompt: z.string().min(1).max(1500),
  motionAndCamera: z.string().min(1).max(1500),
  audioCue: z.string().max(1000),
  shotPrompt: z.string().min(1).max(2000),
});
export type VideoShot = z.infer<typeof VideoShotSchema>;

export const VideoContinuityBibleSchema = z.object({
  subjectAndWardrobe: z.string().min(1),
  environmentAndSet: z.string().min(1),
  lightingAndColorGrade: z.string().min(1),
  lensAndOpticalDna: z.string().min(1),
  audioAndMusicDna: z.string(),
  negativeGuardrails: z.string().min(1),
});
export type VideoContinuityBible = z.infer<typeof VideoContinuityBibleSchema>;

export const VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC = 30;

export const VideoReverseEngineerInputSchema = z
  .object({
    sourceType: z.enum(["upload", "youtube"]),
    youtubeUrl: z.string().url().max(500).optional(),
    mimeType: VideoReverseEngineerMimeSchema.optional(),
    durationSeconds: z.number().positive().max(3600).optional(),
    startOffsetSec: z.number().min(0).max(3600).default(0),
    endOffsetSec: z.number().positive().max(3600).optional(),
    targetGenerator: VideoGeneratorTargetSchema.default("veo"),
    focusNotes: z.string().max(500).optional(),
  })
  .refine((v) => v.endOffsetSec === undefined || v.endOffsetSec > v.startOffsetSec, {
    message: "End time must be greater than start time.",
    path: ["endOffsetSec"],
  })
  .refine(
    (v) =>
      v.endOffsetSec === undefined ||
      v.endOffsetSec - v.startOffsetSec <= VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC,
    {
      message: `Selected clip segment cannot exceed the ${VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC}s limit.`,
      path: ["endOffsetSec"],
    },
  )
  .refine((v) => v.durationSeconds === undefined || v.startOffsetSec < v.durationSeconds, {
    message: "Start time must be less than video duration.",
    path: ["startOffsetSec"],
  })
  .refine(
    (v) =>
      v.durationSeconds === undefined ||
      v.endOffsetSec === undefined ||
      v.endOffsetSec <= v.durationSeconds,
    {
      message: "End time cannot exceed video duration.",
      path: ["endOffsetSec"],
    },
  );
export type VideoReverseEngineerInput = z.infer<typeof VideoReverseEngineerInputSchema>;

export const VideoReverseEngineerOutputSchema = z.object({
  overview: z.object({
    durationSeconds: z.number().min(0),
    aspectRatio: z.string(),
    pacingStyle: z.string(),
    isSingleTake: z.boolean(),
    timestampsAreEstimated: z.literal(true),
  }),
  continuityBible: VideoContinuityBibleSchema,
  shots: z.array(VideoShotSchema).min(1).max(8),
  targetGenerator: VideoGeneratorTargetSchema,
  masterPrompt: z.string().min(1),
  detectedVariables: z.array(z.string()),
  suggestedDraft: ComposerDraftSchema,
  providerId: z.string(),
  modelId: z.string(),
  latencyMs: z.number(),
  remainingDailyRuns: z.number().nullable(),
  requestId: z.string(),
});
export type VideoReverseEngineerOutput = z.infer<typeof VideoReverseEngineerOutputSchema>;

export const VIDEO_REVERSE_ENGINEER_LIMITS = {
  guest: { maxDurationSec: VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC, maxBytes: 20 * 1024 * 1024 },
  free: { maxDurationSec: VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC, maxBytes: 50 * 1024 * 1024 },
  pro: { maxDurationSec: VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC, maxBytes: 100 * 1024 * 1024 },
  team: { maxDurationSec: VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC, maxBytes: 100 * 1024 * 1024 },
} as const;
