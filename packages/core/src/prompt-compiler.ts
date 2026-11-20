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

export interface PromptHealthBreakdown {
  readonly role: number;
  readonly structure: number;
  readonly constraints: number;
  readonly format: number;
  readonly specificity: number;
}

export interface PromptHealthScore {
  readonly score: number;
  readonly breakdown: PromptHealthBreakdown;
}

/**
 * Deterministic 0-100 structural health score for comparing prompts before and after optimization.
 */
export function computePromptHealthScore(text: string): PromptHealthScore {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      score: 0,
      breakdown: { role: 0, structure: 0, constraints: 0, format: 0, specificity: 0 },
    };
  }

  const lower = trimmed.toLowerCase();

  // 1. Role / persona framing (0-20)
  const hasExplicitRole =
    /^role:/im.test(trimmed) ||
    /\byou are (a|an|the)\b/i.test(trimmed) ||
    /\bact as (a|an|the)\b/i.test(trimmed);
  const hasAudience =
    /\b(audience|reader|stakeholder|for [a-z]+ (engineers|teams|founders|users|leads))\b/i.test(
      trimmed,
    );
  const role = Math.min(20, (hasExplicitRole ? 14 : 0) + (hasAudience ? 6 : 0));

  // 2. Structural organization (0-20)
  const headingCount = (trimmed.match(/^#{1,3}\s+.+$/gm) ?? []).length;
  const bulletCount = (trimmed.match(/^\s*[-*•]\s+.+$/gm) ?? []).length;
  const numberedCount = (trimmed.match(/^\s*\d+\.\s+.+$/gm) ?? []).length;
  const structure = Math.min(
    20,
    (headingCount >= 3 ? 12 : headingCount >= 1 ? 7 : 0) +
      (bulletCount + numberedCount >= 3 ? 8 : bulletCount + numberedCount >= 1 ? 4 : 0),
  );

  // 3. Explicit constraints & negative guardrails (0-25)
  const mustCount = (trimmed.match(/\b(MUST NOT|MUST|NEVER|DO NOT|AVOID|STRICTLY)\b/g) ?? [])
    .length;
  const softConstraint =
    /\b(constraint|guardrail|boundary|limit|without|exclude|no hallucination|verify|cite)\b/i.test(
      lower,
    );
  const constraints = Math.min(
    25,
    (mustCount >= 3 ? 18 : mustCount >= 1 ? 11 : 0) + (softConstraint ? 7 : 0),
  );

  // 4. Output format, tone, and acceptance criteria (0-20)
  const hasFormat =
    /\b(json|markdown|table|schema|format|sections?|bullet|checklist|output structure)\b/i.test(
      lower,
    );
  const hasCriteria =
    /\b(objective|goal|criteria|tone|concise|detailed|step-by-step|example)\b/i.test(lower);
  const format = Math.min(20, (hasFormat ? 12 : 0) + (hasCriteria ? 8 : 0));

  // 5. Specificity & reusable parameterization (0-15)
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const varCount = analyzePromptVariables(trimmed).detectedVariables.length;
  const specificity = Math.min(
    15,
    (wordCount >= 60 ? 10 : wordCount >= 25 ? 6 : wordCount >= 10 ? 3 : 1) +
      (varCount >= 1 ? 5 : 0),
  );

  const score = Math.min(100, role + structure + constraints + format + specificity);
  return {
    score,
    breakdown: { role, structure, constraints, format, specificity },
  };
}

export interface LineDiffEntry {
  readonly type: "unchanged" | "added" | "removed";
  readonly line: string;
}

/**
 * Computes a clean line-by-line diff between original and optimized prompts using LCS.
 */
export function computeLineDiff(before: string, after: string): LineDiffEntry[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  const m = a.length;
  const n = b.length;

  // Guard against huge inputs by falling back to a simple block diff above 400 lines
  if (m * n > 160_000) {
    return [
      ...a.map((line) => ({ type: "removed" as const, line })),
      ...b.map((line) => ({ type: "added" as const, line })),
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const nextRow = dp[i + 1];
    if (!row || !nextRow) continue;
    for (let j = n - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const diff: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      diff.push({ type: "unchanged", line: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      diff.push({ type: "removed", line: a[i] ?? "" });
      i += 1;
    } else {
      diff.push({ type: "added", line: b[j] ?? "" });
      j += 1;
    }
  }
  while (i < m) {
    diff.push({ type: "removed", line: a[i] ?? "" });
    i += 1;
  }
  while (j < n) {
    diff.push({ type: "added", line: b[j] ?? "" });
    j += 1;
  }

  return diff;
}
