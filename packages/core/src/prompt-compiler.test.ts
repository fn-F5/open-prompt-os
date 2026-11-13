import { describe, expect, it } from "vitest";
import { analyzePromptVariables, tokenizePromptSyntax } from "./prompt-compiler.js";

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
