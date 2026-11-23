# AGENTS.md

Guidance for AI coding agents working in **Open Prompt OS**.

---

## Mandatory First Rule

- **NEVER modify, update, weaken, or delete any existing test case (unit, integration, or E2E) without explicitly asking the human and receiving approval first.** If a test fails after a code change, report the failure and ask the user whether to update the test or fix the implementation.

---

## Repository Structure

pnpm monorepo orchestrated with Turborepo (`pnpm@12`, TypeScript ESM with `.js` relative imports, Biome for lint/format).

- **`apps/web`** — React + Vite + React Router + TanStack Query frontend (`http://localhost:5173`).
- **`apps/api`** — Hono HTTP API + oRPC procedures (`/rpc/*`) + SSE streaming routes (`/api/prompts/compose/stream`, `/api/prompts/reverse-engineer-video/stream`) + Better Auth (`/api/auth/*`) + SEO sitemap (`/api/seo/sitemap.xml`).
- **`packages/contracts`** — Shared Zod schemas, oRPC contracts, billing plans, curated template catalog, and limits (`VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC`, `VIDEO_REVERSE_ENGINEER_LIMITS`).
- **`packages/core`** — Pure domain logic: prompt quality guard, variable/health analysis, diffing, public video URL validation, and secret redaction.
- **`packages/adapter-kit`** — Interfaces and error types (`LlmProviderError`, `PromptOrchestrator`, `BillingProvider`).
- **`packages/adapters`** — LLM provider adapters (`gemini`, `openai-compatible`, `anthropic`, `ollama`), prompt orchestrator/failover gateway, system prompts (`prompt-config.ts`), and Stripe/local billing adapters.
- **`packages/auth`** — Better Auth configuration and email OTP delivery.
- **`packages/db`** — Prisma schema, PostgreSQL migrations, Row-Level Security (`runAsTenant`, `runAsSystem`), and seed scripts.
- **`packages/ui-tokens` & `packages/ui-web`** — Design tokens and shared React UI primitives.

---

## Essential Commands

```bash
# Development (runs API + Web)
pnpm dev

# Database setup
pnpm db:migrate          # Prisma migrate + apply RLS policies
pnpm db:seed             # Seed plan limits + curated templates

# Verification
pnpm typecheck           # TypeScript checks across all packages
pnpm lint                # Biome lint & format check (use `pnpm exec biome check --write <files>` to fix)
pnpm test                # Vitest unit & integration tests across workspaces
pnpm test:e2e            # Full Playwright E2E suite (requires Postgres)
pnpm test:e2e:smoke      # Fast smoke E2E subset
pnpm verify:e2e-integrity # Anti-tampering check on apps/web/e2e/0*.spec.ts
pnpm verify              # Full pre-merge gate: e2e-integrity + typecheck + test + test:e2e

# Targeted checks
pnpm --filter @open-prompt-os/web test
pnpm --filter @open-prompt-os/adapters test
pnpm --filter @open-prompt-os/api typecheck
pnpm --filter @open-prompt-os/web typecheck
```

---

## Product & Engineering Invariants

1. **Ready-to-Copy-Paste Outputs (No Unrequested Placeholders)**
   - Generated prompts from Compiler, Improve/Autopsy, and Image/Video Reverse Engineer must be complete and directly copy-pasteable with zero invented `[Variable_Name]` placeholders.
   - Do not re-add `[Variable]` slot panels or placeholder examples to the Improve & Prompt Autopsy page or `OutputCard`.
   - Keep the browsable **Template Gallery** (`/templates` and `/templates/:templateSlug`) intact unless explicitly asked to change it.

2. **Video Reverse Engineer 30-Second Hard Cap**
   - `VIDEO_REVERSE_ENGINEER_MAX_DURATION_SEC` is `30` across all tiers (`guest`, `free`, `pro`, `team`).
   - Start/End trim inputs (`0–29s` / `1–30s`), Zod contracts, API validation, and Gemini `videoMetadata` (`startOffset` / `endOffset`) must all enforce the 30s cap so Gemini only tokenizes the selected clip window.

3. **Unified Quota Accounting & Guest Sign-In Gate**
   - `checkQuota` in `apps/api/src/services/usage-quota.ts` counts today's usage across **all** AI actions (`compose`, `refine`, `autopsy`, `reverse_engineer`) against the daily pool while still enforcing per-action sub-limits.
   - Every AI mutation on the frontend must invalidate `queryKeys.billing.status()` on success.
   - When an unauthenticated guest hits `QUOTA_EXCEEDED` (including oRPC `FORBIDDEN` envelopes carrying `data.code = "QUOTA_EXCEEDED"`), open the sign-in dialog (`openAuthDialog({ reason: "quota_limit" })`) instead of showing a raw error banner.

4. **Graceful Server Errors & Detailed Structured Logging**
   - Never leak raw upstream provider JSON (e.g. Gemini 429 `RESOURCE_EXHAUSTED`), database errors, or stack traces to clients.
   - Always log the full redacted error on the server via `logger.error(...)` / `logger.warn(...)` with an `event` name and `err`, and return a user-friendly message via `toUserFacingServerError` (`apps/api/src/errors.ts`).
   - Avoid silent `catch {}` blocks for DB, auth, quota, or provider calls.
   - Streaming endpoints (`composeStream`, `reverseEngineerVideoStream`) must always throw or emit an `event: error` if no `done` event is produced—never close an SSE stream silently with HTTP 200.

5. **Security, Privacy & Multi-Tenancy**
   - All tenant-scoped DB queries must run inside `runAsTenant(...)` (never bypass PostgreSQL RLS unless intentionally using `runAsSystem`).
   - Never log or send secrets, API keys, prompt text, or PII to PostHog/telemetry. Use internal UUIDs for PostHog user identification.
   - Preserve the zero-training privacy commitment across UI copy and telemetry.

6. **Testing & E2E Integrity**
   - Never add `test.skip`, `test.fixme`, or `test.only` to `apps/web/e2e/0*.spec.ts` (`pnpm verify:e2e-integrity` enforces this).
   - Run targeted `biome check`, `typecheck`, and Vitest suites after edits before reporting completion.
