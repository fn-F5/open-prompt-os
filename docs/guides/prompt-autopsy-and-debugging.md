# Prompt Autopsy & Debugging Guide

> **Direct Answer:** **Prompt Autopsy** is Open Prompt OS's root-cause diagnostic mode on `/improve` that compares your original prompt against a failed or hallucinated AI response, classifies failures across 8 structural categories, and generates a corrected prompt with explicit guardrails and `[Variables]`.

---

## Standard Improve vs. Prompt Autopsy

| Mode | Required Inputs | Best For |
| :--- | :--- | :--- |
| **Standard Improve** | Original prompt + target density (`short`, `balanced`, `detailed`) | Tightening wordy drafts, adding missing structure, standardizing variables |
| **Prompt Autopsy** | Original prompt + **Failed or Hallucinated Output** | Diagnosing *why* a model ignored constraints, invented facts, or broke formatting |

## The 8 Diagnostic Categories

1. **`missing_context`** — The prompt omits environment, domain constraints, or background facts the model needed.
2. **`ambiguous_goal`** — The objective allows multiple interpretations, causing unfocused or hedged answers.
3. **`conflicting_constraints`** — Two rules contradict each other (e.g., requesting exhaustive depth inside a 50-word limit).
4. **`undefined_audience`** — No target reader expertise level is specified, leading to mismatched depth or tone.
5. **`weak_output_format`** — Missing schema, Markdown table layout, or JSON keys causes inconsistent formatting.
6. **`missing_examples`** — Complex style or classification tasks lack few-shot anchors.
7. **`unsafe_guardrail`** — Missing anti-hallucination boundaries (e.g., `"Do not invent API endpoints or metrics"`).
8. **`model_mismatch`** — Prompt idioms or modality assumptions do not match the selected target model.

## Step-by-Step: Running a Prompt Autopsy

1. Open `/improve` and switch the mode tab to **Prompt Autopsy**.
2. Paste your **Original Prompt** in the primary editor—Open Prompt OS immediately scans `[Variable]` inventory, duplicates, and unresolved placeholders locally.
3. Paste the **Failed or Hallucinated Model Output** into the diagnostic input box.
4. Select your target density (**Short**, **Balanced**, or **Detailed**) and click **Run Autopsy**.
5. Review each finding's **Severity** (`critical`, `warning`, `suggestion`), **Evidence**, **Recommended Fix**, and **Updated Section**, then click **Accept into Composer** or **Send to ChatGPT**.

## Frequently Asked Questions

### Why does Prompt Autopsy require the failed output?
Without seeing the actual failure mode, an optimizer can only guess what went wrong. Comparing the prompt against the broken response exposes exact mismatches—such as missing JSON schema rules or ungrounded facts.
