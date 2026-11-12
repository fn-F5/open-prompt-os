import type {
  ComposerDraft,
  ComposerMode,
  PromptFramework,
  PromptTemplate,
} from "@open-prompt-os/contracts";
import { type Prisma, prisma } from "@open-prompt-os/db";

export interface ListTemplatesFilter {
  readonly mode?: ComposerMode;
  readonly framework?: PromptFramework;
  readonly category?: string;
  readonly search?: string;
}

export function formatPromptTemplate(row: {
  slug: string;
  title: string;
  useCase: string;
  category: string;
  mode: string;
  framework: string;
  frameworkBadge: string;
  compatibleModels: string[];
  preview: string;
  compiledTemplate: string;
  defaultDraft: unknown;
  popularityScore: number;
  updatedAt: Date;
}): PromptTemplate {
  return {
    slug: row.slug,
    title: row.title,
    useCase: row.useCase,
    category: row.category,
    mode: row.mode as ComposerMode,
    framework: row.framework as PromptFramework,
    frameworkBadge: row.frameworkBadge,
    compatibleModels: row.compatibleModels,
    preview: row.preview,
    compiledTemplate: row.compiledTemplate,
    defaultDraft: row.defaultDraft as ComposerDraft,
    popularityScore: row.popularityScore,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTemplates(filters?: ListTemplatesFilter): Promise<PromptTemplate[]> {
  const where: Prisma.PromptTemplateWhereInput = {
    isPublished: true,
  };

  if (filters?.mode) {
    where.mode = filters.mode;
  }
  if (filters?.framework) {
    where.framework = filters.framework;
  }
  if (filters?.category) {
    where.category = filters.category;
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { useCase: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.promptTemplate.findMany({
    where,
    orderBy: { popularityScore: "desc" },
  });

  return rows.map(formatPromptTemplate);
}

export async function getTemplateBySlug(slug: string): Promise<PromptTemplate | null> {
  const row = await prisma.promptTemplate.findFirst({
    where: {
      slug,
      isPublished: true,
    },
  });

  return row ? formatPromptTemplate(row) : null;
}
