export interface SemanticTokenSet {
  readonly "--page-bg": string;
  readonly "--surface-1": string;
  readonly "--surface-2": string;
  readonly "--surface-3": string;
  readonly "--surface-inverse": string;
  readonly "--text-primary": string;
  readonly "--text-secondary": string;
  readonly "--text-muted": string;
  readonly "--text-placeholder": string;
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
  absoluteBlack: "#0F0F11",
  starkWhite: "#FFFFFF",
  darkElevatedSurface: "#1A1A1C",
  lightCanvas: "#F2F5FA",
} as const;

export const darkThemeTokens: SemanticTokenSet = {
  "--page-bg": "#0F0F11",
  "--surface-1": "#1A1A1C",
  "--surface-2": "#232326",
  "--surface-3": "#2E2E32",
  "--surface-inverse": "#FFFFFF",
  "--text-primary": "#F9FAFB",
  "--text-secondary": "#D1D5DB",
  "--text-muted": "#9CA3AF",
  "--text-placeholder": "#6B7280",
  "--text-inverse": "#1A1A1C",
  "--separator-subtle": "rgba(255, 255, 255, 0.10)",
  "--separator-strong": "rgba(255, 120, 0, 0.48)",
  "--focus-ring": "#FF7800",
  "--accent-primary": "#FF7800",
  "--accent-cyan": "#FF6B35",
  "--accent-text": "#FFA040",
  "--cyan-text": "#FFCB90",
  "--success-text": "#34D399",
  "--accent-gradient": "linear-gradient(135deg, #FF7800 0%, #FF6B35 100%)",
  "--accent-glow": "rgba(255, 120, 0, 0.22)",
  "--accent-subtle-bg": "rgba(255, 120, 0, 0.14)",
  "--cyan-subtle-bg": "rgba(255, 107, 53, 0.14)",
  "--success-subtle-bg": "rgba(16, 185, 129, 0.14)",
  "--danger-bg": "rgba(239, 68, 68, 0.16)",
  "--danger-text": "#FCA5A5",
  "--glass-bg": "rgba(26, 26, 28, 0.84)",
  "--glass-border": "rgba(255, 255, 255, 0.12)",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 120, 0, 0.04) 50%, rgba(255, 107, 53, 0.03) 100%)",
} as const;

export const lightThemeTokens: SemanticTokenSet = {
  "--page-bg": "#F2F5FA",
  "--surface-1": "#FFFFFF",
  "--surface-2": "#F2F5FA",
  "--surface-3": "#E1E6EF",
  "--surface-inverse": "#1A1A1C",
  "--text-primary": "#1A1A1C",
  "--text-secondary": "#4B5563",
  "--text-muted": "#6B7280",
  "--text-placeholder": "#9CA3AF",
  "--text-inverse": "#FFFFFF",
  "--separator-subtle": "#D7DDE5",
  "--separator-strong": "rgba(255, 120, 0, 0.45)",
  "--focus-ring": "#FF7800",
  "--accent-primary": "#FF7800",
  "--accent-cyan": "#FF6B35",
  "--accent-text": "#C05800",
  "--cyan-text": "#9A3412",
  "--success-text": "#047857",
  "--accent-gradient": "linear-gradient(135deg, #FF7800 0%, #FF6B35 100%)",
  "--accent-glow": "rgba(255, 120, 0, 0.18)",
  "--accent-subtle-bg": "#FFF2E9",
  "--cyan-subtle-bg": "rgba(255, 107, 53, 0.12)",
  "--success-subtle-bg": "rgba(4, 120, 87, 0.10)",
  "--danger-bg": "rgba(220, 38, 38, 0.10)",
  "--danger-text": "#B91C1C",
  "--glass-bg": "rgba(255, 255, 255, 0.90)",
  "--glass-border": "#D7DDE5",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 249, 247, 0.85) 100%)",
} as const;

export const typographyScale = {
  fontSans: '"Geist", "Geist Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '"Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
  fontSerif: '"Instrument Serif", "Times New Roman", serif',
} as const;
