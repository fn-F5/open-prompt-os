import type { ComposerMode, GenerationKind, PromptFramework } from "@open-prompt-os/contracts";
import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  prompts: {
    all: ["prompts"] as const,
    history: (filters?: { search?: string; category?: string; mode?: ComposerMode }) =>
      ["prompts", "history", filters ?? {}] as const,
    generations: (filters?: { kind?: GenerationKind; mode?: ComposerMode; search?: string }) =>
      ["prompts", "generations", filters ?? {}] as const,
    library: (filters?: { search?: string; category?: string; mode?: ComposerMode }) =>
      ["prompts", "library", filters ?? {}] as const,
    shared: (shareId: string) => ["prompts", "shared", shareId] as const,
  },
  templates: {
    all: ["templates"] as const,
    list: (filters?: {
      mode?: ComposerMode;
      framework?: PromptFramework;
      category?: string;
      search?: string;
    }) => ["templates", "list", filters ?? {}] as const,
    detail: (slug: string) => ["templates", "detail", slug] as const,
  },
  models: {
    available: (mode?: ComposerMode) => ["models", "available", mode ?? "all"] as const,
    health: () => ["models", "health"] as const,
  },
  billing: {
    status: () => ["billing", "status"] as const,
  },
  preferences: {
    onboarding: () => ["preferences", "onboarding"] as const,
  },
} as const;

export function shouldRetryQueryError(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (
      code === "VALIDATION_ERROR" ||
      code === "UNAUTHENTICATED" ||
      code === "FORBIDDEN" ||
      code === "QUOTA_EXCEEDED"
    ) {
      return false;
    }
  }
  return true;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetryQueryError,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createAppQueryClient();
