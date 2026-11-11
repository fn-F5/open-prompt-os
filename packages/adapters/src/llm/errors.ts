import { LlmProviderError } from "@open-prompt-os/adapter-kit";
import { redactSecrets } from "@open-prompt-os/core";

export function asProviderError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) {
    return new LlmProviderError(error.code, redactSecrets(error.message));
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new LlmProviderError("timeout", "The provider request timed out.");
  }
  const message = error instanceof Error ? error.message : "Provider request failed.";
  return new LlmProviderError("provider_error", redactSecrets(message));
}

export function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}
