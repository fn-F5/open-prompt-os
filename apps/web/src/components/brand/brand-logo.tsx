import * as React from "react";

export interface BrandLogoProps {
  readonly className?: string;
  readonly variant?: "badge" | "mark";
}

/**
 * Open Prompt OS geometric brand mark: a 45-degree open orbital portal
 * with a faceted solar-orange prompt spear launching forward.
 */
export function BrandLogo({ className = "w-9 h-9", variant = "badge" }: BrandLogoProps) {
  const uid = React.useId().replace(/:/g, "");
  const bgId = `opos-bg-${uid}`;
  const glowId = `opos-glow-${uid}`;
  const rimId = `opos-rim-${uid}`;
  const ringId = `opos-ring-${uid}`;
  const spearTopId = `opos-spear-top-${uid}`;
  const spearBotId = `opos-spear-bot-${uid}`;

  const markGeometry = (
    <>
      <path
        d="M35.2 10.6C23.4 8.7 12.2 16.7 10.3 28.5C8.4 40.3 16.4 51.5 28.2 53.4C40 55.3 51.2 47.3 53.1 35.5C53.5 32.8 53.4 30.2 52.8 27.7L43.2 30.5C43.5 31.6 43.5 32.8 43.3 34C42.2 40.6 36.1 45 29.5 43.9C22.9 42.8 18.5 36.7 19.6 30.1C20.7 23.5 26.8 19.1 33.4 20.2C34.5 20.4 35.5 20.7 36.4 21.2L41.8 12.9C39.7 11.8 37.5 11 35.2 10.6Z"
        fill={variant === "badge" ? `url(#${ringId})` : "currentColor"}
      />
      <path d="M23.5 29.8L54.5 9.5L39.5 30L23.5 29.8Z" fill={`url(#${spearTopId})`} />
      <path d="M34 40.5L54.5 9.5L39.5 30L34 40.5Z" fill={`url(#${spearBotId})`} />
    </>
  );

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        {variant === "badge" ? (
          <>
            <linearGradient id={bgId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1E1E24" />
              <stop offset="100%" stopColor="#0B0B0E" />
            </linearGradient>
            <radialGradient id={glowId} cx="62%" cy="34%" r="58%">
              <stop offset="0%" stopColor="#FF7800" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#FF6B35" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#0B0B0E" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={rimId} x1="56" y1="8" x2="8" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFA040" stopOpacity="0.62" />
              <stop offset="50%" stopColor="#FF7800" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.14" />
            </linearGradient>
            <linearGradient
              id={ringId}
              x1="10"
              y1="14"
              x2="46"
              y2="54"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>
          </>
        ) : null}
        <linearGradient
          id={spearTopId}
          x1="22"
          y1="36"
          x2="54"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FF7800" />
          <stop offset="100%" stopColor="#FFE0B5" />
        </linearGradient>
        <linearGradient
          id={spearBotId}
          x1="26"
          y1="42"
          x2="54"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FF3B28" />
          <stop offset="100%" stopColor="#FF7800" />
        </linearGradient>
      </defs>

      {variant === "badge" ? (
        <>
          <rect width="64" height="64" rx="16" fill={`url(#${bgId})`} />
          <rect width="64" height="64" rx="16" fill={`url(#${glowId})`} />
          <rect
            x="0.75"
            y="0.75"
            width="62.5"
            height="62.5"
            rx="15.25"
            stroke={`url(#${rimId})`}
            strokeWidth="1.5"
          />
          <g transform="translate(8, 8) scale(0.75)">{markGeometry}</g>
        </>
      ) : (
        markGeometry
      )}
    </svg>
  );
}
