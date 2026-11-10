import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "QUOTA_EXCEEDED",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const SystemHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  activeProvider: z.string(),
  selfHealingActive: z.boolean(),
  timestamp: z.string(),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;
