# Reusable `[Variables]` & Prompt Templates

> **Direct Answer:** Open Prompt OS treats `[Square_Bracket_Variables]` as first-class reusable parameters across the Composer, Improve & Prompt Autopsy, Template Gallery, and My Library—automatically detecting variables, flagging duplicate or unresolved placeholders, and letting teams share parameterized blueprints via `/share/:shareId`.

---

## Variable Syntax & Live Linting

Use PascalCase or snake_case tokens inside square brackets:

```text
Evaluate [System_Proposal] targeting [Scale_Target] under [Compliance_Regime].
```

The `@open-prompt-os/core` variable analyzer inspects your prompt in real time to report:
- **Detected Variables:** Unique parameter slots extracted in order of appearance.
- **Duplicate Tokens:** Variables referenced multiple times so you know which inputs propagate across sections.
- **Unresolved Placeholder Warnings:** Generic or leftover placeholders like `[TODO]`, `[TBD]`, or `[INSERT_HERE]` that should be replaced before execution.

## Sharing & Forking Templates

- **Curated Blueprints (`/templates/:slug`):** Every curated template includes its framework badge, compatible models, compiled specification, and a one-click **Use template in Composer** button.
- **Public Share Links (`/share/:shareId`):** Saved prompts in **My Library** can be published to a read-only public link where teammates or readers can copy the specification, open it directly in ChatGPT, or **Fork in Composer**.
