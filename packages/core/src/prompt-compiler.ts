export interface VariableAnalysis {
  readonly detectedVariables: string[];
  readonly unresolvedVariables: string[];
  readonly duplicateVariables: string[];
}

export type PromptSyntaxTokenType =
  | "text"
  | "variable"
  | "section_header"
  | "constraint"
  | "persona";

export interface PromptSyntaxToken {
  readonly type: PromptSyntaxTokenType;
  readonly value: string;
}

const VARIABLE_REGEX = /\[([A-Za-z0-9_ -]{1,48})\]/g;

/**
 * Canonical [Variable] parser shared between server compiler and browser syntax decorator.
 */
export function analyzePromptVariables(text: string): VariableAnalysis {
  const counts = new Map<string, number>();
  const unresolved: string[] = [];

  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const rawName = (match[1] ?? "").trim();
    if (!rawName) continue;
    counts.set(rawName, (counts.get(rawName) ?? 0) + 1);
    if (
      rawName.toLowerCase().includes("todo") ||
      rawName.toLowerCase().includes("tbd") ||
      rawName.toLowerCase().includes("insert")
    ) {
      if (!unresolved.includes(rawName)) {
        unresolved.push(rawName);
      }
    }
  }

  // Also check unclosed brackets as unresolved indicators
  const openCount = (text.match(/\[/g) ?? []).length;
  const closeCount = (text.match(/\]/g) ?? []).length;
  if (openCount > closeCount) {
    unresolved.push("UNCLOSED_BRACKET");
  }

  const detectedVariables = Array.from(counts.keys());
  const duplicateVariables = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  return {
    detectedVariables,
    unresolvedVariables: unresolved,
    duplicateVariables,
  };
}

/**
 * Tokenizes prompt text into monochrome-decoratable segments without altering text content.
 */
export function tokenizePromptSyntax(text: string): PromptSyntaxToken[] {
  const tokens: PromptSyntaxToken[] = [];
  const pattern = /(\[[A-Za-z0-9_ -]{1,48}\]|^#{1,3}\s+[^\n]+|^-\s+MUST[^\n]*|^Role:[^\n]*)/gm;

  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      tokens.push({
        type: "text",
        value: text.slice(lastIndex, matchIndex),
      });
    }
    const val = match[0];
    if (val.startsWith("[") && val.endsWith("]")) {
      tokens.push({ type: "variable", value: val });
    } else if (val.startsWith("#")) {
      tokens.push({ type: "section_header", value: val });
    } else if (val.startsWith("Role:")) {
      tokens.push({ type: "persona", value: val });
    } else {
      tokens.push({ type: "constraint", value: val });
    }
    lastIndex = matchIndex + val.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return tokens;
}
