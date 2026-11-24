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
  absoluteBlack: "#0f0f11",
  starkWhite: "#ffffff",
  darkElevatedSurface: "#1a1a1c",
  lightCanvas: "#f2f5fa",
} as const;

export const darkThemeTokens: SemanticTokenSet = {
  "--page-bg": "#0f0f11",
  "--surface-1": "#1a1a1c",
  "--surface-2": "#232326",
  "--surface-3": "#2e2e32",
  "--surface-inverse": "#ffffff",
  "--text-primary": "#f9fafb",
  "--text-secondary": "#d1d5db",
  "--text-muted": "#9ca3af",
  "--text-placeholder": "#6b7280",
  "--text-inverse": "#1a1a1c",
  "--separator-subtle": "rgba(255, 255, 255, 0.1)",
  "--separator-strong": "rgba(255, 120, 0, 0.48)",
  "--focus-ring": "#ff7800",
  "--accent-primary": "#ff7800",
  "--accent-cyan": "#ff6b35",
  "--accent-text": "#ffa040",
  "--cyan-text": "#ffcb90",
  "--success-text": "#34d399",
  "--accent-gradient": "linear-gradient(135deg, #ff7800 0%, #ff6b35 100%)",
  "--accent-glow": "rgba(255, 120, 0, 0.22)",
  "--accent-subtle-bg": "rgba(255, 120, 0, 0.14)",
  "--cyan-subtle-bg": "rgba(255, 107, 53, 0.14)",
  "--success-subtle-bg": "rgba(16, 185, 129, 0.14)",
  "--danger-bg": "rgba(239, 68, 68, 0.16)",
  "--danger-text": "#fca5a5",
  "--glass-bg": "rgba(26, 26, 28, 0.84)",
  "--glass-border": "rgba(255, 255, 255, 0.12)",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 120, 0, 0.04) 50%, rgba(255, 107, 53, 0.03) 100%)",
} as const;

export const lightThemeTokens: SemanticTokenSet = {
  "--page-bg": "#f2f5fa",
  "--surface-1": "#ffffff",
  "--surface-2": "#f2f5fa",
  "--surface-3": "#e1e6ef",
  "--surface-inverse": "#1a1a1c",
  "--text-primary": "#1a1a1c",
  "--text-secondary": "#4b5563",
  "--text-muted": "#6b7280",
  "--text-placeholder": "#9ca3af",
  "--text-inverse": "#ffffff",
  "--separator-subtle": "#d7dde5",
  "--separator-strong": "rgba(255, 120, 0, 0.45)",
  "--focus-ring": "#ff7800",
  "--accent-primary": "#ff7800",
  "--accent-cyan": "#ff6b35",
  "--accent-text": "#c05800",
  "--cyan-text": "#9a3412",
  "--success-text": "#047857",
  "--accent-gradient": "linear-gradient(135deg, #ff7800 0%, #ff6b35 100%)",
  "--accent-glow": "rgba(255, 120, 0, 0.18)",
  "--accent-subtle-bg": "#fff2e9",
  "--cyan-subtle-bg": "rgba(255, 107, 53, 0.12)",
  "--success-subtle-bg": "rgba(4, 120, 87, 0.1)",
  "--danger-bg": "rgba(220, 38, 38, 0.1)",
  "--danger-text": "#b91c1c",
  "--glass-bg": "rgba(255, 255, 255, 0.9)",
  "--glass-border": "#d7dde5",
  "--glass-blur": "24px",
  "--glass-highlight":
    "linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 249, 247, 0.85) 100%)",
} as const;

export const typographyScale = {
  fontSans:
    '"Geist", "Geist Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontMono: '"Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
  fontSerif: '"Instrument Serif", "Times New Roman", serif',
} as const;
