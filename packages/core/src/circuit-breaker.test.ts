import { describe, expect, it } from "vitest";
import {
  circuitAllows,
  circuitFailureRate,
  circuitRecordFailure,
  circuitRecordSuccess,
  initialCircuitMemory,
} from "./circuit-breaker.js";

describe("circuit breaker", () => {
  it("opens after three failures and allows one probe after the cooldown", () => {
    let memory = initialCircuitMemory();
    memory = circuitRecordFailure(memory, 1_000, "one");
    memory = circuitRecordFailure(memory, 2_000, "two");
    expect(circuitAllows(memory, 2_500).allowed).toBe(true);
    memory = circuitRecordFailure(memory, 3_000, "three");
    expect(memory.state).toBe("open");
    expect(circuitAllows(memory, 3_000).allowed).toBe(false);

    const probe = circuitAllows(memory, 33_000);
    expect(probe.allowed).toBe(true);
    expect(probe.memory.state).toBe("half_open");
    expect(circuitAllows(probe.memory, 33_100).allowed).toBe(false);

    const closed = circuitRecordSuccess(probe.memory);
    expect(closed.state).toBe("closed");
    expect(closed.consecutiveErrors).toBe(0);
    expect(circuitFailureRate(closed)).toBeGreaterThan(0);
    expect(closed.lastError).toBe("three");
  });
});
