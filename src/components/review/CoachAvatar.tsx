"use client";

import React, { useId } from "react";
import type { CoachPersonaId } from "@/lib/ai/coach-personas";

export interface CoachAvatarProps {
  personaId: CoachPersonaId;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<CoachAvatarProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

/**
 * Renders distinct bespoke vector portraits for each coach persona:
 * - Danny: tilted flat-cap, warm grin, collared polo
 * - Sage: spectacles, silver-streaked hair, goatee, turtleneck & lapel
 * - Blaze: angular visor shades, spiky cut, high-collar tactical jacket
 */
export function CoachAvatar({
  personaId,
  color,
  size = "md",
  className = "",
}: CoachAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `coach-bg-${personaId}-${uid}`;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      data-coach-avatar={personaId}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 shadow-md ${sizeClass} ${className}`.trim()}
      style={{ borderColor: color, boxShadow: `0 0 0 2px ${color}24, 0 6px 14px rgba(0,0,0,0.45)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-full w-full">
        <defs>
          <radialGradient id={gradId} cx="35%" cy="28%" r="75%">
            {personaId === "danny" && (
              <>
                <stop offset="0%" stopColor="#3e5929" />
                <stop offset="100%" stopColor="#1e2a15" />
              </>
            )}
            {personaId === "sage" && (
              <>
                <stop offset="0%" stopColor="#2c4760" />
                <stop offset="100%" stopColor="#162330" />
              </>
            )}
            {personaId === "drillmaster" && (
              <>
                <stop offset="0%" stopColor="#5a2f12" />
                <stop offset="100%" stopColor="#241309" />
              </>
            )}
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="64" height="64" fill={`url(#${gradId})`} />

        {personaId === "danny" && (
          <g data-portrait="danny">
            {/* Subtle warm ring behind coach */}
            <circle cx="32" cy="32" r="28" fill="none" stroke="#96bc4b" strokeOpacity="0.25" strokeWidth="1.5" />
            {/* Shoulders & emerald coach polo */}
            <path d="M10 64c2-13 10-19 22-19s20 6 22 19z" fill="#7da338" />
            <path d="M23 46l9 9 9-9" fill="#f3f5ef" />
            <path d="M22 46l10 11 10-11" fill="none" stroke="#53721f" strokeWidth="1.6" strokeLinejoin="round" />
            {/* Neck & warm face */}
            <rect x="27" y="38" width="10" height="8" rx="3" fill="#e6b892" />
            <circle cx="32" cy="28" r="12" fill="#f2cba8" />
            {/* Ears */}
            <circle cx="20" cy="29" r="2.6" fill="#e6b892" />
            <circle cx="44" cy="29" r="2.6" fill="#e6b892" />
            {/* Tilted flat-cap */}
            <path d="M17 21c3-9 25-11 31-2l-2 4H18z" fill="#4f6d24" />
            <path d="M19 22c7-3 22-3 30 1-5 2-20 3-30-1z" fill="#2e4214" />
            {/* Hair tufts & friendly brows */}
            <path d="M20 22c1 2 2 3 3 3m20-3c-1 2-2 3-3 3" stroke="#533827" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M24 25.5c1.5-1.2 3.5-1.2 4.8 0m6.4 0c1.3-1.2 3.3-1.2 4.8 0" stroke="#4a3122" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            {/* Expressive warm eyes & cheerful grin */}
            <circle cx="26.5" cy="29" r="1.7" fill="#1e1b18" />
            <circle cx="37.5" cy="29" r="1.7" fill="#1e1b18" />
            <circle cx="27" cy="28.4" r="0.55" fill="#ffffff" />
            <circle cx="38" cy="28.4" r="0.55" fill="#ffffff" />
            <path d="M26.5 34.2c3.2 3.2 7.8 3.2 11 0" stroke="#7a3e28" strokeWidth="1.7" fill="#ffffff" strokeLinecap="round" />
          </g>
        )}

        {personaId === "sage" && (
          <g data-portrait="sage">
            {/* Classical subtle arch */}
            <circle cx="32" cy="32" r="27" fill="none" stroke="#9ec4e4" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="3 3" />
            {/* Blazer lapels & navy turtleneck */}
            <path d="M10 64c2-12 9-19 22-19s20 7 22 19z" fill="#203447" />
            <path d="M24 44h16v14H24z" fill="#3b5e7c" />
            <path d="M16 48l10 16M48 48L38 64" stroke="#5c8bb0" strokeWidth="2.2" strokeLinecap="round" />
            {/* Face & sculpted silver hair */}
            <rect x="27.5" y="38" width="9" height="8" rx="3" fill="#dec0a5" />
            <path d="M21 28c0-8 22-8 22 0v3c0 7-5 11-11 11s-11-4-11-11z" fill="#edd2b8" />
            {/* Silver-streaked professorial hair */}
            <path d="M19.5 26c0-11 25-11 25 0-2-5-7-7-12.5-7s-10.5 2-12.5 7z" fill="#708090" />
            <path d="M23 19c4-2 10-2 14 0" stroke="#dbe6f0" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            {/* Arched contemplative brows */}
            <path d="M24 25.5l4.8-1m6.4 0l4.8 1" stroke="#4f5b66" strokeWidth="1.5" strokeLinecap="round" />
            {/* Steel/tortoise spectacles */}
            <circle cx="26.5" cy="29.2" r="4.1" fill="#9ec4e4" fillOpacity="0.16" stroke="#dce5ee" strokeWidth="1.4" />
            <circle cx="37.5" cy="29.2" r="4.1" fill="#9ec4e4" fillOpacity="0.16" stroke="#dce5ee" strokeWidth="1.4" />
            <line x1="30.6" y1="29.2" x2="33.4" y2="29.2" stroke="#dce5ee" strokeWidth="1.4" />
            <circle cx="26.5" cy="29.3" r="1.4" fill="#18222c" />
            <circle cx="37.5" cy="29.3" r="1.4" fill="#18222c" />
            {/* Calm mouth + silver goatee */}
            <path d="M28.5 36.2c2.2 1.2 4.8 1.2 7 0" stroke="#7c5646" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M28 38.5c2 3.2 6 3.2 8 0" fill="#8999a8" />
          </g>
        )}

        {personaId === "drillmaster" && (
          <g data-portrait="drillmaster">
            {/* Kinetic diagonal speed streaks */}
            <path d="M10 18L24 6M42 58l14-14" stroke="#e58f2a" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
            {/* High-collar tactical jacket + amber trim */}
            <path d="M8 64l5-17 19-4 19 4 5 17z" fill="#1b1918" />
            <path d="M17 47l5 17M47 47l-5 17" stroke="#e58f2a" strokeWidth="2.2" />
            <path d="M23 44l9 11 9-11" fill="#352014" stroke="#e58f2a" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Sharp jawline & neck */}
            <rect x="27.5" y="38" width="9" height="8" rx="2" fill="#d9a67d" />
            <path d="M21 26c0-8 22-8 22 0v5c0 6-6 10-11 10s-11-4-11-10z" fill="#e6b892" />
            {/* Spiky swept-back tactical cut */}
            <path d="M19 25l3-10 6 4 4-7 5 6 6-4 2 11c-4-4-22-4-26 0z" fill="#2c1d18" />
            {/* Fierce angled brows */}
            <path d="M23 24.5l6.5 1.8m5 0l6.5-1.8" stroke="#1e1410" strokeWidth="1.9" strokeLinecap="round" />
            {/* Angular crimson-amber visor shades */}
            <path d="M20.5 26.5h23l-2.2 5.2-7.2-.8-2.1 1.4-2.1-1.4-7.2.8z" fill="#e58f2a" stroke="#fff3d6" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M23 28.2l5 2.4M36 28.2l4 1.8" stroke="#fff6df" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
            {/* Determined smirk */}
            <path d="M28 35.8c3 1.4 6.5.6 8.5-1.2" stroke="#6b341e" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}
