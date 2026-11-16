# Privacy, Security & Zero-Training Guarantee

> **Direct Answer:** Open Prompt OS operates under a strict **Privacy by Default** guarantee: your prompt inputs, failed outputs, reference images, and compiled specifications are **never used to train or fine-tune any AI model**. Telemetry is redacted of prompt contents, and saved workspace data is protected by PostgreSQL Row-Level Security (RLS).

---

## Three Pillars of Prompt Privacy

| Pillar | What It Means in Practice |
| :--- | :--- |
| **Zero Model Training** | Prompt drafts, uploaded reference images, and compiled outputs are never routed to model training or fine-tuning datasets. |
| **Redacted Telemetry** | Product analytics record structural metadata only (mode, latency, framework, action type)—never raw prompt text, emails, or API keys. |
| **Isolated Workspaces** | Authenticated libraries and history rows are scoped by tenant `space_id` and enforced at the database layer via PostgreSQL Row-Level Security (`runAsTenant`). |

## Anonymous Browser Storage

When using Open Prompt OS without an account, your latest Composer draft and output stay locally in browser `localStorage` for up to 30 days and are migrated once into your private Workspace if you choose to sign in.
