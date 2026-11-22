---
name: verify
description: Evidence-based full-stack verification loop for Open Prompt OS. Run before claiming any feature, bug fix, or refactor is complete.
---

# Open Prompt OS Verification Loop (`verify`)

Follow this repeatable verification protocol before reporting any task complete:

1. **Anti-Tampering Diff Check**
   - Run `pnpm verify:e2e-integrity` to confirm no E2E spec was skipped, marked `.only`, or deleted.
   - Review `git diff` to ensure existing assertions were not weakened to make tests pass.

2. **Static & Unit/Property Verification**
   - Run `pnpm typecheck` across all workspace packages.
   - Run `pnpm test` (Vitest unit, API DB integration, and `fast-check` property suites).

3. **Full-Stack E2E Verification**
   - Run `pnpm test:e2e` (Chromium driving real Vite Web + Hono API in `E2E_TEST_MODE=1` + PostgreSQL 16 with RLS).
   - For rapid iteration on a single journey, run `pnpm test:e2e:smoke` first, then full `pnpm test:e2e` before finishing.
   - When verifying flakiness on new or modified E2E specs, run with `--repeat-each=3`.

4. **Evidence Output (Required)**
   - Report exact observed pass/fail counts for `typecheck`, `test`, `verify:e2e-integrity`, and `test:e2e`.
   - If any E2E test fails, inspect `reports/playwright-results/` traces and screenshots before editing code.

5. **3-Attempt Escalation Rule**
   - If verification fails across **3 consecutive fix rounds**, stop autonomous retries and escalate to the user with the exact failing test, error output, and trace/screenshot path.
