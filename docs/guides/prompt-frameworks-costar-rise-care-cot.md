# Prompt Engineering Frameworks Compared: CO-STAR, RISE, CARE & Chain-of-Thought

> **Direct Answer:** Open Prompt OS supports four proven prompt engineering frameworks—**CO-STAR** for general structured business and technical specs, **RISE** for role-driven iterative workflows, **CARE** for context-and-example grounded outputs (and studio visuals), and **Chain-of-Thought (CoT)** for multi-step reasoning and temporal video sequences.

---

## Framework Decision Matrix

| Framework | Acronym / Structure | Best Used For | Key Strength |
| :--- | :--- | :--- | :--- |
| **CO-STAR** | Context, Objective, Style, Tone, Audience, Response | Architecture RFCs, technical docs, launch plans, product specs | Prevents vague tone and missing audience calibration |
| **RISE** | Role, Input, Steps, Expectation | Executive memos, SOPs, analytical workflows | Enforces deterministic step-by-step execution |
| **CARE** | Context, Action, Result, Example | Visual studio renders, brand copy, rubric-graded tasks | Anchors the model with explicit constraints and examples |
| **Chain-of-Thought** | Sequential reasoning / temporal beats | Complex debugging, trade-off analysis, 24fps video sequences | Surfaces intermediate logic and prevents skipped steps |

## When to Pick Each Framework

### Choose CO-STAR when audience and format drive quality
CO-STAR shines whenever a model tends to write generic filler because it doesn't know *who* is reading or *what* structure to return. For example, combining **Audience: Principal Infrastructure Reviewers** with **Format: Executive Verdict + Failure Mode Matrix** eliminates unfocused prose.

### Choose RISE when process accuracy matters
RISE pairs a sharp **Role** with explicit **Input** boundaries and ordered **Steps**, making it ideal for executive decision briefs, financial summaries, and repeatable operations checklists.

### Choose CARE when visual fidelity or examples are critical
CARE locks down **Context** and **Result** expectations alongside concrete **Examples** or negative guardrails—making it effective for both studio product photography prompts and customer support response templates.

### Choose Chain-of-Thought when multi-step logic or motion continuity is required
Chain-of-Thought instructs the model to reason through constraints or temporal state transitions in sequence before delivering the final verdict or camera beat.

## Frequently Asked Questions

### Can I combine frameworks with custom `[Variables]`?
Yes. Every framework in Open Prompt OS preserves `[Variable_Name]` slots so you can reuse a single CO-STAR or RISE blueprint across different projects, customers, or quarterly cycles.

### Are these frameworks tied to a specific LLM?
No. Open Prompt OS adapts CO-STAR, RISE, CARE, and Chain-of-Thought specifications cleanly for OpenAI GPT models, Anthropic Claude, and Google Gemini.
