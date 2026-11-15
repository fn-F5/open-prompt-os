import { randomUUID } from "node:crypto";
import {
  ComposerDraftSchema,
  type ComposerMode,
  type GenerationKind,
  type ImportGuestInteractionInput,
  type ImportGuestInteractionOutput,
  type PromptFramework,
  type PromptGenerationItem,
  SafeImageDataUrlSchema,
  type SavePromptInput,
  type SavedPromptItem,
} from "@open-prompt-os/contracts";
import { analyzePromptVariables } from "@open-prompt-os/core";
import { type Prisma, prisma, runAsTenant } from "@open-prompt-os/db";
import { ORPCError } from "@orpc/server";
import type { ResolvedActor } from "../auth/session-resolver.js";

export function formatSavedPrompt(row: {
  id: string;
  title: string;
  rawInput: string;
  compiledPrompt: string;
  mode: string;
  framework: string;
  modelId: string;
  category: string;
  tags: string[];
  detectedVariables: string[];
  isShared: boolean;
  shareId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SavedPromptItem {
  return {
    id: row.id,
    title: row.title,
    rawInput: row.rawInput,
    compiledPrompt: row.compiledPrompt,
    mode: row.mode as ComposerMode,
    framework: row.framework as PromptFramework,
    modelId: row.modelId,
    category: row.category,
    tags: row.tags,
    detectedVariables: row.detectedVariables,
    isShared: row.isShared,
    shareId: row.shareId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Saves a prompt to the tenant's library.
 */
export async function savePrompt(
  actor: ResolvedActor,
  input: SavePromptInput,
): Promise<SavedPromptItem> {
  if (!actor.spaceId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "UNAUTHENTICATED: Sign in to save prompts to your private library.",
    });
  }

  const spaceId = actor.spaceId;
  const { detectedVariables } = analyzePromptVariables(input.compiledPrompt);
  const id = `prm_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const saved = await tx.savedPrompt.create({
      data: {
        id,
        spaceId,
        authorId: actor.userId ?? null,
        title: input.title.trim(),
        rawInput: input.rawInput,
        compiledPrompt: input.compiledPrompt,
        mode: input.mode,
        framework: input.framework,
        modelId: input.modelId,
        category: input.category,
        tags: input.tags,
        detectedVariables,
        isShared: false,
        shareId: null,
      },
    });

    return formatSavedPrompt(saved);
  });
}

/**
 * Deletes a prompt from the tenant's library.
 */
export async function deletePrompt(
  actor: ResolvedActor,
  id: string,
): Promise<{ deleted: boolean }> {
  if (!actor.spaceId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "UNAUTHENTICATED: Sign in to delete prompts from your library.",
    });
  }

  const spaceId = actor.spaceId;

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const existing = await tx.savedPrompt.findFirst({
      where: { id, spaceId },
      select: { id: true },
    });

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Prompt not found in your library.",
      });
    }

    await tx.savedPrompt.delete({
      where: { id },
    });

    return { deleted: true };
  });
}

/**
 * Toggles a prompt's public sharing status and generates a public shareId and shareUrl.
 */
export async function sharePrompt(
  actor: ResolvedActor,
  id: string,
  webOrigin = "http://localhost:5173",
): Promise<{ shareId: string; shareUrl: string }> {
  if (!actor.spaceId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "UNAUTHENTICATED: Sign in to share prompts from your library.",
    });
  }

  const spaceId = actor.spaceId;

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const existing = await tx.savedPrompt.findFirst({
      where: { id, spaceId },
      select: { id: true, isShared: true, shareId: true },
    });

    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Prompt not found in your library.",
      });
    }

    if (existing.isShared && existing.shareId) {
      return {
        shareId: existing.shareId,
        shareUrl: `${webOrigin.replace(/\/$/, "")}/share/${existing.shareId}`,
      };
    }

    const shareId = `shr_${id.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}_${randomUUID().slice(0, 6)}`;
    await tx.savedPrompt.update({
      where: { id },
      data: {
        isShared: true,
        shareId,
      },
    });

    return {
      shareId,
      shareUrl: `${webOrigin.replace(/\/$/, "")}/share/${shareId}`,
    };
  });
}

/**
 * Idempotently imports a guest interaction into prompt_generations and saves it to the library.
 */
export async function importGuestInteraction(
  actor: ResolvedActor,
  input: ImportGuestInteractionInput,
): Promise<ImportGuestInteractionOutput> {
  if (!actor.spaceId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "UNAUTHENTICATED: Sign in to import guest interactions to your workspace.",
    });
  }

  const spaceId = actor.spaceId;

  // 1. Idempotency check: see if this interaction was already imported for this space
  const existingGeneration = await runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    return tx.promptGeneration.findUnique({
      where: {
        spaceId_guestInteractionId: {
          spaceId,
          guestInteractionId: input.interactionId,
        },
      },
      select: { id: true },
    });
  });

  if (existingGeneration) {
    return {
      imported: false,
      promptGenerationId: existingGeneration.id,
    };
  }

  const compiledPrompt = input.response?.compiledPrompt ?? input.prompt.rawInput;
  const { detectedVariables } = analyzePromptVariables(compiledPrompt);

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    // Record into prompt_generations
    const generation = await tx.promptGeneration.create({
      data: {
        spaceId,
        userId: actor.userId ?? null,
        kind: "guest_import",
        rawInput: input.prompt.rawInput,
        compiledPrompt,
        draft: input.prompt as unknown as Prisma.InputJsonValue,
        mode: input.prompt.mode,
        framework: input.prompt.framework ?? "costar",
        modelId: input.response?.modelId ?? input.prompt.modelId ?? null,
        providerId: input.response?.providerId ?? "guest-import",
        latencyMs: 0,
        guestInteractionId: input.interactionId,
      },
      select: { id: true },
    });

    // Also persist into saved_prompts so it appears in My Library
    const promptId = `prm_migrated_${input.interactionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
    await tx.savedPrompt.upsert({
      where: { id: promptId },
      create: {
        id: promptId,
        spaceId,
        authorId: actor.userId ?? null,
        sourceGenerationId: generation.id,
        title: input.prompt.rawInput.trim().slice(0, 64) || "Migrated Guest Prompt",
        rawInput: input.prompt.rawInput,
        compiledPrompt,
        mode: input.prompt.mode,
        framework: input.prompt.framework ?? "costar",
        modelId: input.response?.modelId ?? input.prompt.modelId ?? "gpt-4.1",
        category: "Migrated Workspace",
        tags: ["migrated", input.prompt.mode],
        detectedVariables: input.response?.detectedVariables ?? detectedVariables,
        isShared: false,
        shareId: null,
      },
      update: {},
    });

    return {
      imported: true,
      promptGenerationId: generation.id,
    };
  });
}

/**
 * Retrieves a publicly shared prompt by its unique `shareId`.
 * Protected by PostgreSQL RLS policy `public_shared_read` (is_shared = true).
 */
export async function getSharedPrompt(shareId: string): Promise<SavedPromptItem | null> {
  const row = await prisma.savedPrompt.findFirst({
    where: {
      shareId,
      isShared: true,
    },
  });

  return row ? formatSavedPrompt(row) : null;
}

export interface ListHistoryParams {
  readonly category?: string;
  readonly mode?: ComposerMode;
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * Lists saved prompts for the actor's space with cursor pagination.
 */
export async function listPromptHistory(
  actor: ResolvedActor,
  params?: ListHistoryParams,
): Promise<{ items: SavedPromptItem[]; nextCursor: string | null }> {
  if (!actor.spaceId) {
    return { items: [], nextCursor: null };
  }
  const spaceId = actor.spaceId;

  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50);

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const where: Prisma.SavedPromptWhereInput = {
      spaceId,
    };

    if (params?.category) {
      where.category = params.category;
    }
    if (params?.mode) {
      where.mode = params.mode;
    }
    if (params?.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { rawInput: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await tx.savedPrompt.findMany({
      where,
      take: limit + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(formatSavedPrompt);
    const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null;

    return { items, nextCursor };
  });
}

export interface ListGenerationsParams {
  readonly kind?: GenerationKind;
  readonly mode?: ComposerMode;
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * Lists past prompt generation interactions (compose, refine, autopsy, reverse_engineer, guest_import)
 * for the actor's space with cursor pagination.
 */
export async function listPromptGenerations(
  actor: ResolvedActor,
  params?: ListGenerationsParams,
): Promise<{ items: PromptGenerationItem[]; nextCursor: string | null }> {
  if (!actor.spaceId) {
    return { items: [], nextCursor: null };
  }
  const spaceId = actor.spaceId;
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50);

  return runAsTenant({ spaceId, userId: actor.userId }, async (tx) => {
    const where: Prisma.PromptGenerationWhereInput = {
      spaceId,
    };

    if (params?.kind) {
      where.kind = params.kind;
    }
    if (params?.mode) {
      where.mode = params.mode;
    }
    if (params?.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { rawInput: { contains: q, mode: "insensitive" } },
        { compiledPrompt: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await tx.promptGeneration.findMany({
      where,
      take: limit + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items: PromptGenerationItem[] = pageRows.map((row) => {
      const parsedDraft = row.draft ? ComposerDraftSchema.safeParse(row.draft) : null;
      const rawPreview =
        row.draft && typeof row.draft === "object" && !Array.isArray(row.draft)
          ? (row.draft as Record<string, unknown>).sourcePreviewDataUrl
          : undefined;
      const parsedPreview = SafeImageDataUrlSchema.safeParse(rawPreview);
      return {
        id: row.id,
        kind: row.kind as GenerationKind,
        rawInput: row.rawInput,
        compiledPrompt: row.compiledPrompt,
        draft: parsedDraft?.success ? parsedDraft.data : null,
        inputImageUrl: parsedPreview.success ? parsedPreview.data : null,
        mode: row.mode as ComposerMode,
        framework: row.framework as PromptFramework,
        modelId: row.modelId,
        providerId: row.providerId,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.toISOString(),
      };
    });
    const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null;

    return { items, nextCursor };
  });
}
