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
