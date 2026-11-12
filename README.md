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
cp .env.example .env                            # set POSTGRES_PASSWORD
pnpm --filter @open-prompt-os/db db:migrate     # create tables (prisma migrate dev)
pnpm --filter @open-prompt-os/db db:rls         # row-level security + extra constraints
pnpm --filter @open-prompt-os/db db:seed        # plan limits + gallery templates
```
