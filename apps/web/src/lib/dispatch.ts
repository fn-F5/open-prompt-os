import { toast } from "@open-prompt-os/ui-web";
import { trackEvent } from "./telemetry.js";

export type DispatchTarget = "chatgpt" | "claude" | "gemini" | "clipboard";

export const MAX_DEEPLINK_URL_LENGTH = 1800;

export interface DispatchOutcome {
  readonly target: DispatchTarget;
  readonly method: "deeplink" | "clipboard_fallback" | "clipboard";
  readonly success: boolean;
  readonly url?: string;
}

const TARGET_LABELS: Record<DispatchTarget, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  clipboard: "Clipboard",
};

export function buildDispatchUrl(target: Exclude<DispatchTarget, "clipboard">, promptText: string): string {
  const encoded = encodeURIComponent(promptText);
  switch (target) {
    case "chatgpt":
      return `https://chatgpt.com/?q=${encoded}`;
    case "claude":
      return `https://claude.ai/new?q=${encoded}`;
    case "gemini":
      return `https://gemini.google.com/app?q=${encoded}`;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function dispatchPrompt(
  target: DispatchTarget,
  promptText: string,
): Promise<DispatchOutcome> {
  const trimmed = promptText.trim();
  trackEvent("dispatch_attempted", { target, lengthChars: trimmed.length });

  if (!trimmed) {
    return { target, method: "clipboard", success: false };
  }

  if (target === "clipboard") {
    const copied = await copyTextToClipboard(trimmed);
    if (copied) {
      toast({
        title: "Copied to clipboard",
        description: "Prompt specification is ready to paste.",
      });
      trackEvent("dispatch_succeeded", { target, method: "clipboard" });
    } else {
      toast({
        title: "Clipboard permission denied",
        description: "Select the prompt text manually and press Cmd/Ctrl+C.",
        tone: "error",
      });
    }
    return { target, method: "clipboard", success: copied };
  }

  const deepLinkUrl = buildDispatchUrl(target, trimmed);

  // Enforce practical URL-length limits; fall back to clipboard copy when too long
  if (deepLinkUrl.length > MAX_DEEPLINK_URL_LENGTH) {
    const copied = await copyTextToClipboard(trimmed);
    if (typeof window !== "undefined") {
      const baseOrigin =
        target === "chatgpt"
          ? "https://chatgpt.com/"
          : target === "claude"
            ? "https://claude.ai/new"
            : "https://gemini.google.com/app";
      window.open(baseOrigin, "_blank", "noopener,noreferrer");
    }
    toast({
      title: copied
        ? `Copied & opened ${TARGET_LABELS[target]}`
        : `Opened ${TARGET_LABELS[target]}`,
      description: copied
        ? "Prompt exceeded safe URL length, so we copied it to your clipboard for pasting."
        : "Prompt exceeded safe URL length. Copy it from the output card.",
    });
    trackEvent("dispatch_succeeded", { target, method: "clipboard_fallback" });
    return {
      target,
      method: "clipboard_fallback",
      success: true,
      url: deepLinkUrl,
    };
  }

  if (typeof window !== "undefined") {
    window.open(deepLinkUrl, "_blank", "noopener,noreferrer");
  }

  toast({
    title: `Opened in ${TARGET_LABELS[target]}`,
    description: "Dispatched structured prompt via secure deep link.",
  });
  trackEvent("dispatch_succeeded", { target, method: "deeplink" });

  return {
    target,
    method: "deeplink",
    success: true,
    url: deepLinkUrl,
  };
}
