import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluatePromptQuality, parsePublicVideoUrl, redactSecrets } from "./input-guard.js";

describe("input-guard property invariants", () => {
  it("parsePublicVideoUrl never accepts non-HTTPS schemes or private network hosts", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("http:", "file:", "ftp:", "javascript:", "data:"),
        fc.string({ minLength: 1, maxLength: 60 }),
        (scheme, rest) => {
          const result = parsePublicVideoUrl(`${scheme}//${rest}`);
          expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 200 },
    );

    fc.assert(
      fc.property(
        fc.constantFrom("127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1", "192.168.1.1"),
        fc.string({ minLength: 0, maxLength: 30 }),
        (host, path) => {
          const result = parsePublicVideoUrl(`https://${host}/${path}`);
          expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("parsePublicVideoUrl always canonicalizes valid 11-char YouTube IDs", () => {
    const ytIdArb = fc.stringMatching(/^[A-Za-z0-9_-]{11}$/);
    const hostFormatArb = fc.constantFrom(
      (id: string) => `https://www.youtube.com/watch?v=${id}`,
      (id: string) => `https://youtu.be/${id}`,
      (id: string) => `https://m.youtube.com/shorts/${id}`,
      (id: string) => `https://www.youtube.com/embed/${id}`,
    );

    fc.assert(
      fc.property(ytIdArb, hostFormatArb, (id, formatUrl) => {
        const result = parsePublicVideoUrl(formatUrl(id));
        expect(result).toEqual({
          ok: true,
          kind: "youtube",
          canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          videoId: id,
        });
      }),
      { numRuns: 200 },
    );
  });

  it("redactSecrets never leaks generated sk- or Bearer secrets", () => {
    const secretTokenArb = fc.stringMatching(/^[A-Za-z0-9]{20,40}$/);
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), secretTokenArb, (prefix, token) => {
        const raw = `${prefix} sk-${token} Authorization: Bearer ${token}`;
        const cleaned = redactSecrets(raw);
        expect(cleaned).not.toContain(`sk-${token}`);
        expect(cleaned).not.toContain(`Bearer ${token}`);
      }),
      { numRuns: 150 },
    );
  });

  it("evaluatePromptQuality never throws on arbitrary Unicode strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (input) => {
        const verdict = evaluatePromptQuality(input);
        expect(typeof verdict.ok).toBe("boolean");
        if (!verdict.ok) {
          expect(verdict.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
