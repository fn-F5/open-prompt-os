#!/usr/bin/env node
/**
 * Anti-tampering guard for E2E verification suites.
 * Ensures PRs and agent runs cannot silently weaken or bypass E2E tests via
 * test.skip, test.fixme, test.only, or deleting core user-journey specs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const e2eDir = resolve(process.cwd(), "apps/web/e2e");
const specFiles = readdirSync(e2eDir)
  .filter((name) => /^0\d-.*\.spec\.ts$/.test(name))
  .sort();

const MIN_CORE_SPECS = 8;
const FORBIDDEN_PATTERNS = [
  { regex: /\btest\.skip\s*\(/, label: "test.skip(" },
  { regex: /\btest\.fixme\s*\(/, label: "test.fixme(" },
  { regex: /\btest\.only\s*\(/, label: "test.only(" },
  { regex: /\bdescribe\.skip\s*\(/, label: "describe.skip(" },
  { regex: /\bdescribe\.only\s*\(/, label: "describe.only(" },
];

const violations = [];

if (specFiles.length < MIN_CORE_SPECS) {
  violations.push(
    `Expected at least ${MIN_CORE_SPECS} core E2E spec files in apps/web/e2e/, found ${specFiles.length}.`,
  );
}

for (const file of specFiles) {
  const fullPath = join(e2eDir, file);
  const lines = readFileSync(fullPath, "utf8").split("\n");
  lines.forEach((line, idx) => {
    if (line.includes("allow-e2e-skip:")) return;
    for (const { regex, label } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push(`apps/web/e2e/${file}:${idx + 1} contains forbidden "${label}"`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("E2E integrity check FAILED:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `E2E integrity check passed (${specFiles.length} core specs verified, 0 skipped/only).`,
);
