export interface SemanticTokenSet {
  readonly "--page-bg": string;
  readonly "--surface-1": string;
  readonly "--surface-2": string;
  readonly "--surface-3": string;
  readonly "--surface-inverse": string;
  readonly "--text-primary": string;
  readonly "--text-secondary": string;
  readonly "--text-muted": string;
  readonly "--text-inverse": string;
  readonly "--separator-subtle": string;
  readonly "--separator-strong": string;
  readonly "--focus-ring": string;
  readonly "--accent-primary": string;
  readonly "--accent-cyan": string;
  readonly "--accent-text": string;
  readonly "--cyan-text": string;
  readonly "--success-text": string;
  readonly "--accent-gradient": string;
  readonly "--accent-glow": string;
  readonly "--accent-subtle-bg": string;
  readonly "--cyan-subtle-bg": string;
  readonly "--success-subtle-bg": string;
  readonly "--danger-bg": string;
  readonly "--danger-text": string;
  readonly "--glass-bg": string;
  readonly "--glass-border": string;
  readonly "--glass-blur": string;
  readonly "--glass-highlight": string;
}

export const monochromeFoundations = {
  absoluteBlack: "#07090E",
  starkWhite: "#FFFFFF",
  darkElevatedSurface: "#111522",
  lightCanvas: "#F1F5F9",
} as const;

export const darkThemeTokens: SemanticTokenSet = {
  "--page-bg": "#07090E",
  "--surface-1": "#111522",
  "--surface-2": "#181F32",
  "--surface-3": "#232C46",
  "--surface-inverse": "#F8FAFC",
  "--text-primary": "#F8FAFC",
  "--text-secondary": "#E2E8F0",
  "--text-muted": "#CBD5E1",
  "--text-inverse": "#090D16",
  "--separator-subtle": "rgba(148, 163, 184, 0.20)",
  "--separator-strong": "rgba(99, 102, 241, 0.52)",
  "--focus-ring": "#818CF8",
  "--accent-primary": "#6366F1",
  "--accent-cyan": "#06B6D4",
  "--accent-text": "#A5B4FC",
  "--cyan-text": "#67E8F9",
  "--success-text": "#6EE7B7",
  "--accent-gradient": "linear-gradient(135deg, #4F46E5 0%, #0284C7 100%)",
  "--accent-glow": "rgba(99, 102, 241, 0.34)",
  "--accent-subtle-bg": "rgba(99, 102, 241, 0.16)",
  "--cyan-subtle-bg": "rgba(6, 182, 212, 0.15)",
  "--success-subtle-bg": "rgba(16, 185, 129, 0.15)",
  "--danger-bg": "rgba(239, 68, 68, 0.16)",
  "--danger-text": "#FCA5A5",
  "--glass-bg": "rgba(17, 21, 34, 0.74)",
  "--glass-border": "rgba(165, 180, 252, 0.26)",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(99, 102, 241, 0.06) 50%, rgba(6, 182, 212, 0.05) 100%)",
} as const;

export const lightThemeTokens: SemanticTokenSet = {
  "--page-bg": "#F1F5F9",
  "--surface-1": "#FFFFFF",
  "--surface-2": "#F8FAFC",
  "--surface-3": "#E2E8F0",
  "--surface-inverse": "#0F172A",
  "--text-primary": "#0F172A",
  "--text-secondary": "#1E293B",
  "--text-muted": "#475569",
  "--text-inverse": "#FFFFFF",
  "--separator-subtle": "rgba(15, 23, 42, 0.18)",
  "--separator-strong": "rgba(67, 56, 202, 0.52)",
  "--focus-ring": "#4338CA",
  "--accent-primary": "#4338CA",
  "--accent-cyan": "#0E7490",
  "--accent-text": "#3730A3",
  "--cyan-text": "#155E75",
  "--success-text": "#047857",
  "--accent-gradient": "linear-gradient(135deg, #4338CA 0%, #0369A1 100%)",
  "--accent-glow": "rgba(67, 56, 202, 0.24)",
  "--accent-subtle-bg": "rgba(67, 56, 202, 0.12)",
  "--cyan-subtle-bg": "rgba(14, 116, 144, 0.12)",
  "--success-subtle-bg": "rgba(4, 120, 87, 0.12)",
  "--danger-bg": "rgba(220, 38, 38, 0.10)",
  "--danger-text": "#B91C1C",
  "--glass-bg": "rgba(255, 255, 255, 0.86)",
  "--glass-border": "rgba(67, 56, 202, 0.30)",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(238, 242, 255, 0.72) 100%)",
} as const;

export const typographyScale = {
  fontSans: '"Geist Sans", "SF Pro Display", system-ui, -apple-system, sans-serif',
  fontMono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;
