import { z } from "zod";

export const FeedbackKindSchema = z.enum(["feature_request", "general_feedback", "bug_report"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const FeedbackStatusSchema = z.enum([
  "open",
  "under_review",
  "planned",
  "completed",
  "closed",
]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

export const SubmitFeedbackInputSchema = z.object({
  kind: FeedbackKindSchema.default("feature_request"),
  title: z.string().trim().max(160).optional(),
  message: z
    .string()
    .trim()
    .min(5, "Please provide at least 5 characters of detail.")
    .max(2000, "Feedback message must be 2,000 characters or fewer."),
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid contact email.")
    .max(254)
    .optional()
    .or(z.literal("")),
  pagePath: z.string().trim().max(255).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInputSchema>;

export const FeedbackItemSchema = z.object({
  id: z.string(),
  kind: FeedbackKindSchema,
  title: z.string().nullable(),
  message: z.string(),
  status: FeedbackStatusSchema,
  pagePath: z.string().nullable(),
  createdAt: z.string(),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;
