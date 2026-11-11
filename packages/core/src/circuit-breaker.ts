/**
 * In-process circuit memory for LLM providers.
 * A later worker can persist this shape as ProviderCircuitState in Postgres.
 * This module does not open a database connection.
 */

export type CircuitStateName = "closed" | "open" | "half_open";

export interface CircuitMemory {
  readonly state: CircuitStateName;
  readonly consecutiveErrors: number;
  readonly nextProbeAt: number | null;
  readonly lastErrorAt: string | null;
  /** Redacted diagnostic. Not part of the public health snapshot. */
  readonly lastError: string | null;
  readonly recentFailures: readonly boolean[];
  readonly probeInFlight: boolean;
}

export const CIRCUIT_FAILURE_THRESHOLD = 3;
export const CIRCUIT_COOLDOWN_MS = 30_000;
const WINDOW = 10;

export function initialCircuitMemory(): CircuitMemory {
  return {
    state: "closed",
    consecutiveErrors: 0,
    nextProbeAt: null,
    lastErrorAt: null,
    lastError: null,
    recentFailures: [],
    probeInFlight: false,
  };
}

export function circuitAllows(
  memory: CircuitMemory,
  now: number,
): { memory: CircuitMemory; allowed: boolean } {
  if (memory.state === "open") {
    if (memory.nextProbeAt !== null && now >= memory.nextProbeAt) {
      return {
        allowed: true,
        memory: { ...memory, state: "half_open", probeInFlight: true },
      };
    }
    return { memory, allowed: false };
  }
  if (memory.state === "half_open") {
    if (memory.probeInFlight) return { memory, allowed: false };
    return { allowed: true, memory: { ...memory, probeInFlight: true } };
  }
  return { memory, allowed: true };
}

export function circuitRecordSuccess(memory: CircuitMemory): CircuitMemory {
  return {
    state: "closed",
    consecutiveErrors: 0,
    nextProbeAt: null,
    lastErrorAt: memory.lastErrorAt,
    lastError: memory.lastError,
    recentFailures: [...memory.recentFailures, false].slice(-WINDOW),
    probeInFlight: false,
  };
}

export function circuitRecordFailure(
  memory: CircuitMemory,
  now: number,
  redactedReason: string,
  threshold = CIRCUIT_FAILURE_THRESHOLD,
  cooldownMs = CIRCUIT_COOLDOWN_MS,
): CircuitMemory {
  const consecutiveErrors = memory.consecutiveErrors + 1;
  const open = consecutiveErrors >= threshold || memory.state === "half_open";
  return {
    state: open ? "open" : "closed",
    consecutiveErrors,
    nextProbeAt: open ? now + cooldownMs : null,
    lastErrorAt: new Date(now).toISOString(),
    lastError: redactedReason,
    recentFailures: [...memory.recentFailures, true].slice(-WINDOW),
    probeInFlight: false,
  };
}

export function circuitFailureRate(memory: CircuitMemory): number {
  if (memory.recentFailures.length === 0) return 0;
  const failures = memory.recentFailures.filter(Boolean).length;
  return failures / memory.recentFailures.length;
}
