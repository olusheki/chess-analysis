import React from "react";
import { BADGE_METADATA, MoveBadge } from "@/lib/analysis/move-classifier";

interface MoveBadgeIconProps {
  badge: MoveBadge;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MoveBadgeIconProps["size"]>, string> = {
  xs: "w-4 h-4 text-[9px]",
  sm: "w-5 h-5 text-[10px]",
  md: "w-6 h-6 text-[11px]",
  lg: "w-8 h-8 text-sm",
};

/**
 * Authentic Chess.com circular move rating badge.
 */
export function MoveBadgeIcon({ badge, size = "md", className = "" }: MoveBadgeIconProps) {
  const meta = BADGE_METADATA[badge];
  const isDarkText = badge === "Inaccuracy";

  return (
    <span
      title={badge}
      aria-label={badge}
      className={`inline-flex items-center justify-center rounded-full font-extrabold leading-none select-none shadow-badge ${SIZE_CLASSES[size]} ${className}`}
      style={{
        backgroundColor: meta.color,
        color: isDarkText ? "#1a1917" : "#ffffff",
      }}
    >
      {meta.symbol}
    </span>
  );
}
