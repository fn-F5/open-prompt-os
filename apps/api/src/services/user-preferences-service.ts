import {
  type OnboardingPreferences,
  OnboardingPreferencesSchema,
  type UpdateOnboardingInput,
} from "@open-prompt-os/contracts";
import { prisma } from "@open-prompt-os/db";
import type { ResolvedActor } from "../auth/session-resolver.js";

const EMPTY_PREFERENCES: OnboardingPreferences = {
  dismissedHotspots: {},
  completedTours: {},
};

function parsePreferences(val: unknown): OnboardingPreferences {
  const result = OnboardingPreferencesSchema.safeParse(val);
  return result.success ? result.data : EMPTY_PREFERENCES;
}

export async function getUserPreferences(actor: ResolvedActor): Promise<OnboardingPreferences> {
  if (!actor.userId) {
    return EMPTY_PREFERENCES;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { preferences: true },
  });

  return user ? parsePreferences(user.preferences) : EMPTY_PREFERENCES;
}

export async function updateUserPreferences(
  actor: ResolvedActor,
  input: UpdateOnboardingInput,
): Promise<OnboardingPreferences> {
  if (!actor.userId) {
    return {
      dismissedHotspots: input.hotspotId ? { [input.hotspotId]: input.timestamp } : {},
      completedTours: input.tourId ? { [input.tourId]: input.timestamp } : {},
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { preferences: true },
  });

  const current = user ? parsePreferences(user.preferences) : EMPTY_PREFERENCES;
  const updated: OnboardingPreferences = {
    dismissedHotspots: {
      ...current.dismissedHotspots,
      ...(input.hotspotId ? { [input.hotspotId]: input.timestamp } : {}),
    },
    completedTours: {
      ...current.completedTours,
      ...(input.tourId ? { [input.tourId]: input.timestamp } : {}),
    },
  };

  await prisma.user.update({
    where: { id: actor.userId },
    data: { preferences: updated },
  });

  return updated;
}
