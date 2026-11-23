import { type PlanTier, type UsageAction, prisma } from "../src/index.js";
import { CURATED_TEMPLATES } from "./seed/templates.js";

/** Daily limits per plan/action. Guest = anonymous visitor (no account). */
const PLAN_LIMITS: Array<{
  plan: PlanTier;
  isGuest: boolean;
  limits: Record<UsageAction, number>;
}> = [
  {
    plan: "free",
    isGuest: true,
    limits: { compose: 5, refine: 5, autopsy: 2, reverse_engineer: 2 },
  },
  {
    plan: "free",
    isGuest: false,
    limits: { compose: 5, refine: 5, autopsy: 2, reverse_engineer: 2 },
  },
  {
    plan: "pro",
    isGuest: false,
    limits: { compose: 20, refine: 20, autopsy: 10, reverse_engineer: 5 },
  },
  {
    plan: "team",
    isGuest: false,
    limits: { compose: 30, refine: 30, autopsy: 20, reverse_engineer: 10 },
  },
];

async function main() {
  for (const { plan, isGuest, limits } of PLAN_LIMITS) {
    for (const [action, dailyLimit] of Object.entries(limits) as [UsageAction, number][]) {
      await prisma.planLimit.upsert({
        where: { plan_action_isGuest: { plan, action, isGuest } },
        update: { dailyLimit },
        create: { plan, action, isGuest, dailyLimit },
      });
    }
  }

  for (const t of CURATED_TEMPLATES) {
    const data = {
      title: t.title,
      useCase: t.useCase,
      category: t.category,
      mode: t.mode,
      framework: t.framework,
      frameworkBadge: t.frameworkBadge,
      compatibleModels: t.compatibleModels,
      preview: t.preview,
      compiledTemplate: t.compiledTemplate,
      defaultDraft: t.defaultDraft,
      popularityScore: t.popularityScore,
    };
    await prisma.promptTemplate.upsert({
      where: { slug: t.slug },
      update: data,
      create: { slug: t.slug, ...data },
    });
  }

  console.log(
    `Seeded ${PLAN_LIMITS.length * 4} plan limits and ${CURATED_TEMPLATES.length} templates.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
