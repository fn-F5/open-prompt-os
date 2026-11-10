import {
  type ComposerDraft,
  ComposerDraftSchema,
  type GuestInteractionV1,
  GuestInteractionV1Schema,
  type GuestMigrationStatus,
  type GuestResponseSnapshot,
} from "@open-prompt-os/contracts";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage.js";

export const GUEST_INTERACTION_STORAGE_KEY = "open-prompt-os:guest-interaction:v1";
export const GUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sanitizeDraft(draft: ComposerDraft): ComposerDraft {
  return ComposerDraftSchema.parse({
    rawInput: draft.rawInput,
    mode: draft.mode,
    modelId: draft.modelId,
    goal: draft.goal,
    audience: draft.audience,
    constraints: draft.constraints ?? [],
    format: draft.format,
    persona: draft.persona,
    tone: draft.tone,
    guardrails: draft.guardrails ?? [],
    framework: draft.framework,
    advanced: {
      length: draft.advanced?.length,
      creativity: draft.advanced?.creativity,
    },
  });
}

export function getGuestInteraction(): GuestInteractionV1 | null {
  const raw = safeGetItem(GUEST_INTERACTION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsedJson: unknown = JSON.parse(raw);
    const result = GuestInteractionV1Schema.safeParse(parsedJson);
    if (!result.success) {
      safeRemoveItem(GUEST_INTERACTION_STORAGE_KEY);
      return null;
    }

    const record = result.data;
    const updatedTime = Date.parse(record.updatedAt);
    if (Number.isNaN(updatedTime) || Date.now() - updatedTime > GUEST_RETENTION_MS) {
      safeRemoveItem(GUEST_INTERACTION_STORAGE_KEY);
      return null;
    }

    return record;
  } catch {
    safeRemoveItem(GUEST_INTERACTION_STORAGE_KEY);
    return null;
  }
}

export interface SaveGuestInteractionOptions {
  readonly interactionId?: string;
  readonly requestTimestamp?: string;
}

export function saveGuestInteraction(
  prompt: ComposerDraft,
  response: GuestResponseSnapshot | null,
  options?: SaveGuestInteractionOptions,
): GuestInteractionV1 | null {
  try {
    const existing = getGuestInteraction();
    const nowIso = options?.requestTimestamp ?? new Date().toISOString();

    // Prevent an older late response from overwriting a newer saved record (Section 10.8)
    if (existing && options?.requestTimestamp) {
      const existingTime = Date.parse(existing.updatedAt);
      const incomingTime = Date.parse(options.requestTimestamp);
      if (!Number.isNaN(existingTime) && !Number.isNaN(incomingTime) && incomingTime < existingTime) {
        return existing;
      }
    }

    const sanitizedPrompt = sanitizeDraft(prompt);
    const record: GuestInteractionV1 = GuestInteractionV1Schema.parse({
      version: 1,
      interactionId:
        options?.interactionId ??
        existing?.interactionId ??
        `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: new Date().toISOString(),
      prompt: sanitizedPrompt,
      response: response
        ? {
            compiledPrompt: response.compiledPrompt,
            detectedVariables: response.detectedVariables,
            providerId: response.providerId,
            modelId: response.modelId,
          }
        : null,
      migrationStatus: "pending",
    });

    safeSetItem(GUEST_INTERACTION_STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export function markGuestMigration(status: GuestMigrationStatus): GuestInteractionV1 | null {
  const existing = getGuestInteraction();
  if (!existing) return null;

  const updated: GuestInteractionV1 = {
    ...existing,
    migrationStatus: status,
    updatedAt: new Date().toISOString(),
  };
  safeSetItem(GUEST_INTERACTION_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearGuestInteraction(): void {
  safeRemoveItem(GUEST_INTERACTION_STORAGE_KEY);
}
