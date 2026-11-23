import { trackAnalyticsEvent } from "./analytics-events.js";

function toSnakeCaseIdentifier(raw: string | null | undefined, maxLength = 48): string | undefined {
  if (!raw) return undefined;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return normalized.length > 0 ? normalized : undefined;
}

function resolveTargetPath(anchor: HTMLAnchorElement): {
  readonly targetPath: string;
  readonly isExternal: boolean;
} {
  const rawHref = anchor.getAttribute("href") ?? "";
  if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) {
    try {
      const url = new URL(rawHref);
      const isExternal =
        typeof window !== "undefined" ? url.origin !== window.location.origin : true;
      return {
        targetPath: isExternal ? `${url.origin}${url.pathname}` : url.pathname,
        isExternal,
      };
    } catch {
      return { targetPath: rawHref.split("?")[0] ?? rawHref, isExternal: true };
    }
  }
  return {
    targetPath: rawHref.split("?")[0] ?? rawHref,
    isExternal: false,
  };
}

export function handleDelegatedClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const interactive = target.closest("button, a[href], [role='button']");
  if (!interactive) return;

  if (interactive.closest("[data-analytics-tracked='true'], [data-analytics-skip='true']")) {
    return;
  }

  const routePath = typeof window !== "undefined" ? window.location.pathname : "/";

  if (interactive instanceof HTMLAnchorElement) {
    const { targetPath, isExternal } = resolveTargetPath(interactive);
    const linkName =
      toSnakeCaseIdentifier(interactive.getAttribute("data-analytics-id")) ??
      toSnakeCaseIdentifier(interactive.getAttribute("aria-label")) ??
      toSnakeCaseIdentifier(targetPath);

    trackAnalyticsEvent("navigation:nav_link_click", {
      link_name: linkName ?? "link",
      target_path: targetPath,
      nav_surface: routePath,
      is_external: isExternal,
    });
    return;
  }

  const buttonId =
    toSnakeCaseIdentifier(interactive.getAttribute("data-analytics-id")) ??
    toSnakeCaseIdentifier(interactive.getAttribute("id")) ??
    toSnakeCaseIdentifier(interactive.getAttribute("aria-label")) ??
    toSnakeCaseIdentifier(interactive.getAttribute("name")) ??
    "button";

  const buttonType =
    interactive instanceof HTMLButtonElement ? interactive.type || "button" : "role_button";

  trackAnalyticsEvent("ui:button_click", {
    button_name: buttonId,
    button_type: buttonType,
    route_path: routePath,
  });
}

let isInstalled = false;

export function installClickAnalytics(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  if (!isInstalled) {
    document.addEventListener("click", handleDelegatedClick, { capture: true });
    isInstalled = true;
  }
  return () => {
    if (isInstalled) {
      document.removeEventListener("click", handleDelegatedClick, { capture: true });
      isInstalled = false;
    }
  };
}
