# Open Prompt OS

> **The Operating System for Prompts**
>
> A freemium platform for creating, improving, analyzing, managing, sharing, and operationalizing AI prompts across any major AI model.

---

## Overview

### The Problem
Today, users struggle with prompt engineering because prompts are scattered across notes, chats, documents, screenshots, and social posts. They also lack visibility into why a prompt works, why it fails, or how to adapt and optimize it for different AI models.

### The Solution
**Open Prompt OS** solves this fragmentation by serving as a complete prompt lifecycle platform. Rather than functioning merely as a prompt generator, Open Prompt OS provides a complete ecosystem where prompts are created, analyzed, managed, shared, and executed.

---

## Product Vision

Open Prompt OS aims to become the definitive **system of record for prompts**.

* **Unified Lifecycle Platform:** Users can create, improve, analyze, organize, share, deploy, and monitor prompts from a single platform regardless of the underlying AI model.
* **Asset Operationalization:** Establishes an ecosystem where prompts evolve from simple one-off instructions into reusable, measurable, and operationalized AI assets.

---

## Core Capabilities

1. **Create prompts** using guided workflows and proven frameworks.
2. **Improve prompts** through optimization and prompt autopsy.
3. **Reverse engineer prompts** from outputs and images.
4. **Store and organize prompts** in a searchable library.
5. **Share prompts and outputs** publicly.
6. **Deploy prompts as mini apps.**
7. **Monitor prompt drift and performance over time.**

---

## Feature Roadmap & Backlog

### P0: Launch Version (Build First)

| Feature | Description & Scope | Strategic Notes & Absorbed Items |
| :--- | :--- | :--- |
| **Guided Builder with Modes** | Text/work, image, and video modes with goal, audience, constraints, format, persona, tone, and guardrails as tappable cards, plus at most three follow-up questions. Includes an integrated model picker so prompts are model-specific by default. | *Absorbs:* prompt generation for work/image/video, guided builder, model-specific prompts. |
| **Frameworks & Expert Templates** | COSTAR and similar techniques, plus "expert-style" templates applied directly inside the builder. Labeled as "inspired by" rather than endorsed to avoid name association risks. | Embeds proven prompt engineering methodologies without brand friction. |
| **Improve Tool** | Length and tone optimization combined with a prompt autopsy mode: paste a prompt alongside its failed output to receive an actionable diagnosis. | *Absorbs:* optimizer, prompt autopsy. |
| **One-Click Send** | Direct dispatch to ChatGPT, Claude, or Gemini via deep link or one-click copy. | Inexpensive to build and removes the friction point where users drop off. |
| **Instant Free Use** | Immediate access with no sign-up requirement and a daily usage limit. Metering is restricted strictly to LLM-powered actions. | Core growth lever allowing visitors to experience product value within seconds of landing. |
| **Privacy by Default** | A transparent, plainly stated "we never train on your prompts" commitment. | Pure policy commitment requiring zero engineering overhead while establishing trust. |

---

### P1: Post-Launch (First Weeks After Launch)

| Feature | Description & Scope | Strategic Notes & Absorbed Items |
| :--- | :--- | :--- |
| **Template Gallery** | Curated catalog featuring in-house templates alongside permissively licensed community templates. Each template receives a dedicated indexable page. | Primary driver of organic search traffic and discovery. |
| **My Library** | Private, categorized, and searchable repository. Triggers an account sign-up prompt after the first prompt is saved. | *Absorbs:* private prompt manager, user-generated library. |
| **Sharing** | Public link generation for prompts and generated outputs, accompanied by social sharing tools for prompt libraries. | *Absorbs:* share output, share libraries on social. |
| **Browser Extension** | Injects the builder directly into AI chat boxes, featuring an integrated clipboard scratchpad to gather thoughts prior to generation. | *Absorbs:* browser extension, clipboard. |
| **Reverse Engineer** | Image-to-prompt tool that analyzes an uploaded image to reconstruct the prompt that could produce it. | Highly shareable and viral; kept behind daily limits due to higher vision API costs. |
| **Bring Your Own Key (BYOK)** | Enables power users to input their own API keys to lift platform limits. | Unlocks unlimited power usage at zero compute cost to the platform. |

---

### P2: Scaling & Future Horizons (Once Traction is Established)

| Feature | Description & Scope | Strategic Notes & Absorbed Items |
| :--- | :--- | :--- |
| **Prompt-to-Mini-App** | Transforms prompts and user variables into shareable web form links branded with a "Made with Open Prompt OS" badge. | High-leverage viral loop; deferred until an established user base is present. |
| **Voice-to-Prompt** | Voice input and transcription interface for prompt drafting. | Helpful secondary input modality, but not a primary user acquisition driver. |
| **Multilingual Support** | Builder authors prompts in the optimal language for target models, accompanied by site-wide localization. Built translation-ready from day one, launched later. | *Absorbs:* multilingual builder, multi-language site, locality-based prompts (treated as a language/region setting). |
| **Ratings & Comments** | Community feedback system rolling out star/quality ratings first, followed by comment threads. | Ratings are low-cost and enhance gallery quality; comments require active moderation. |
| **MCP Server & Desktop App** | Model Context Protocol (MCP) server for developer workflows, alongside a dedicated desktop utility with global keyboard shortcuts. | *Absorbs:* MCP server, desktop app (MCP is lightweight for developers; desktop app secondary to extension). |
| **Drift Alarm** | Weekly scheduled automated re-runs of saved test prompts with alerts when output behavior shifts. | Strong retention hook; requires underlying automated testing ("Test Drive") infrastructure as a prerequisite. |

---

## Local Development Setup

### PostgreSQL Database

1. Install PostgreSQL (macOS, via Homebrew) and start the service:

   ```bash
   brew install postgres
   brew services start postgresql
   ```

2. Open the default `postgres` database as your superuser:

   ```bash
   psql postgres
   ```

3. Create the application user and database (replace `*******` with your own password):

   ```sql
   CREATE USER admin WITH PASSWORD '*******';
   ALTER USER admin CREATEDB;
   CREATE DATABASE open_prompt_os OWNER admin;
   GRANT ALL PRIVILEGES ON DATABASE open_prompt_os TO admin;
   \q
   ```

4. Verify you can connect as the new user:

   ```bash
   psql -U admin -d open_prompt_os
   ```

### Database Schema, Migrations & Seed

```bash
cp .env.example .env                            # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET
pnpm --filter @open-prompt-os/db db:migrate     # create tables (prisma migrate dev)
pnpm --filter @open-prompt-os/db db:rls         # row-level security + extra constraints
pnpm --filter @open-prompt-os/db db:seed        # plan limits + gallery templates
```

> **Using Docker for PostgreSQL?** You can run a container instead of Homebrew Postgres:
>
> ```bash
> docker run -d \
>   --name open-prompt-os-db \
>   -e POSTGRES_USER=admin \
>   -e POSTGRES_PASSWORD=yourpassword \
>   -e POSTGRES_DB=open_prompt_os \
>   -p 5432:5432 \
>   postgres:16
> ```
>
> If port `5432` is already in use locally, map another host port (for example `-p 5433:5432`) and set `POSTGRES_PORT=5433` in `.env`.

### Environment & Auth Configuration

1. Generate a Better Auth secret (minimum 32 characters) and set `BETTER_AUTH_SECRET` in `.env`:

   ```bash
   openssl rand -hex 32
   ```

2. Optionally add one or more LLM provider keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `OLLAMA_BASE_URL`). Without external keys, the API boots with the built-in synthesizer adapter.
3. For email OTP sign-in in local development, keep `MAIL_PROVIDER=console` — sign-in codes are printed to the API terminal.

### Running the Application

Root `pnpm dev` starts only the web frontend (`@open-prompt-os/web`), which proxies `/api` and `/rpc` to `API_PROXY_TARGET` (default `http://127.0.0.1:3001`). Start both the API and web apps together:

```bash
pnpm install
pnpm exec turbo run dev
```

Or run them in separate terminals:

```bash
pnpm --filter @open-prompt-os/api dev
pnpm --filter @open-prompt-os/web dev
```

Open **http://localhost:5173** in your browser.

### Social OAuth (Google & GitHub)

Social sign-in buttons are hidden in the UI until their credentials are configured in `.env`.

> [!IMPORTANT]
> Better Auth builds OAuth `redirect_uri` values from `BETTER_AUTH_URL`. Make sure `BETTER_AUTH_URL` points to an active local origin (for example `http://localhost:5173` via the Vite `/api` proxy, or your API URL such as `http://localhost:3001`) and matches your provider callback URLs **exactly** to avoid `redirect_uri_mismatch` or connection errors. If you change `PORT`, also update `API_PROXY_TARGET` in `.env` so Vite proxies to the right API port.

1. **Google OAuth:**
   - In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** (**Web application**).
   - Add your local origin under **Authorized JavaScript origins** (e.g. `http://localhost:5173`).
   - Add `${BETTER_AUTH_URL}/api/auth/callback/google` under **Authorized redirect URIs** (e.g. `http://localhost:5173/api/auth/callback/google`).
2. **GitHub OAuth:**
   - In [GitHub → Developer settings → OAuth Apps](https://github.com/settings/developers), create a **New OAuth App**.
   - Set **Homepage URL** to `http://localhost:5173`.
   - Set **Authorization callback URL** to `${BETTER_AUTH_URL}/api/auth/callback/github` (e.g. `http://localhost:5173/api/auth/callback/github`).
3. **Update `.env` and restart the dev server:**

   ```env
   BETTER_AUTH_URL=http://localhost:5173
   PASSKEY_ORIGIN=http://localhost:5173
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```
