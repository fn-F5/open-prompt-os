import { describe, expect, it } from "vitest";
import {
  analyzePromptVariables,
  computeLineDiff,
  computePromptHealthScore,
  tokenizePromptSyntax,
} from "./prompt-compiler.js";

describe("analyzePromptVariables", () => {
  it("detects unique, duplicate, and unresolved variables including unclosed brackets", () => {
    const text =
      "Target [Audience] using [TODO_Metric], [TBD_Owner], [Insert_Date], and [Audience] with [unclosed";
    const result = analyzePromptVariables(text);

    expect(result.detectedVariables).toEqual([
      "Audience",
      "TODO_Metric",
      "TBD_Owner",
      "Insert_Date",
    ]);
    expect(result.duplicateVariables).toEqual(["Audience"]);
    expect(result.unresolvedVariables).toEqual([
      "TODO_Metric",
      "TBD_Owner",
      "Insert_Date",
      "UNCLOSED_BRACKET",
    ]);
  });

  it("deduplicates unresolved variable names and ignores whitespace-only brackets", () => {
    const result = analyzePromptVariables("Use [   ] and [TODO_Item] twice: [TODO_Item]");
    expect(result.detectedVariables).toEqual(["TODO_Item"]);
    expect(result.unresolvedVariables).toEqual(["TODO_Item"]);
    expect(result.duplicateVariables).toEqual(["TODO_Item"]);
  });
});

describe("tokenizePromptSyntax", () => {
  it("tokenizes headers, personas, constraints, variables, and plain text losslessly", () => {
    const source = [
      "# Main Header",
      "Role: Staff Architect",
      "- MUST keep [Service_Name] reliable",
      "Plain trailing note.",
    ].join("\n");

    const tokens = tokenizePromptSyntax(source);

    expect(tokens.map((t) => t.type)).toEqual([
      "section_header",
      "text",
      "persona",
      "text",
      "constraint",
      "text",
    ]);
    expect(tokens.map((t) => t.value).join("")).toBe(source);

    const inlineTokens = tokenizePromptSyntax("Deploy [Service_Name] to [Region] now");
    expect(inlineTokens).toEqual([
      { type: "text", value: "Deploy " },
      { type: "variable", value: "[Service_Name]" },
      { type: "text", value: " to " },
      { type: "variable", value: "[Region]" },
      { type: "text", value: " now" },
    ]);
  });
});

describe("computePromptHealthScore & computeLineDiff", () => {
  it("scores structured guardrail-hardened prompts significantly higher than vague one-liners", () => {
    const weak = computePromptHealthScore("Write a blog post about AI.");
    const strong = computePromptHealthScore(
      [
        "Role: You are a Principal AI Systems Architect writing for engineering leads.",
        "# OPERATIONAL PROMPT SPECIFICATION",
        "## Objective & Audience",
        "- Synthesize [Topic_Area] into a concrete technical brief.",
        "## Constraints & Guardrails",
        "- MUST cite verifiable primary benchmarks.",
        "- MUST NOT fabricate metrics or APIs.",
        "- NEVER include generic filler.",
        "## Output Format",
        "- Return structured Markdown with a comparison table and concrete examples.",
      ].join("\n"),
    );

    expect(weak.score).toBeLessThan(35);
    expect(strong.score).toBeGreaterThanOrEqual(85);
    expect(strong.score).toBeGreaterThan(weak.score + 50);
  });

  it("computes accurate unchanged, removed, and added diff lines", () => {
    const diff = computeLineDiff("Line A\nOld Line\nLine C", "Line A\nNew Line\nLine C\nLine D");
    expect(diff).toEqual([
      { type: "unchanged", line: "Line A" },
      { type: "removed", line: "Old Line" },
      { type: "added", line: "New Line" },
      { type: "unchanged", line: "Line C" },
      { type: "added", line: "Line D" },
    ]);
  });
});
