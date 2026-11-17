import { z } from "zod";

export const AuthenticatedUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  spaceId: z.string(),
  spaceName: z.string(),
  plan: z.enum(["free", "pro", "team"]),
  hasPasskey: z.boolean(),
});
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

export const OnboardingPreferencesSchema = z.object({
  dismissedHotspots: z.record(z.string(), z.string()),
  completedTours: z.record(z.string(), z.string()),
});
export type OnboardingPreferences = z.infer<typeof OnboardingPreferencesSchema>;

export const UpdateOnboardingInputSchema = z.object({
  hotspotId: z.string().optional(),
  tourId: z.string().optional(),
  timestamp: z.string(),
});
export type UpdateOnboardingInput = z.infer<typeof UpdateOnboardingInputSchema>;

export const ReferralSourceSchema = z.enum([
  "search_engine",
  "social_media",
  "friend_or_colleague",
  "github_or_open_source",
  "blog_or_newsletter",
  "ai_assistant",
  "other",
]);
export type ReferralSource = z.infer<typeof ReferralSourceSchema>;

export const REFERRAL_SOURCE_OPTIONS: ReadonlyArray<{
  readonly value: ReferralSource;
  readonly label: string;
}> = [
  { value: "search_engine", label: "Search Engine (Google, Bing)" },
  { value: "social_media", label: "Social Media (X, LinkedIn, Reddit, YouTube)" },
  { value: "friend_or_colleague", label: "Friend, Colleague, or Word of Mouth" },
  { value: "github_or_open_source", label: "GitHub / Open Source Community" },
  { value: "blog_or_newsletter", label: "Blog Post, Article, or Newsletter" },
  { value: "ai_assistant", label: "AI Assistant (ChatGPT, Claude, Perplexity, Gemini)" },
  { value: "other", label: "Other" },
] as const;

export const RecordSignupAttributionInputSchema = z.object({
  referralSource: ReferralSourceSchema,
  referralDetail: z.string().trim().max(200).optional(),
});
export type RecordSignupAttributionInput = z.infer<typeof RecordSignupAttributionInputSchema>;

export const RecordSignupAttributionOutputSchema = z.object({
  recorded: z.boolean(),
  referralSource: ReferralSourceSchema.nullable(),
});
export type RecordSignupAttributionOutput = z.infer<typeof RecordSignupAttributionOutputSchema>;
