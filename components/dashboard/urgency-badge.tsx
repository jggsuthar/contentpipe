"use client";

import React from "react";

export type StageUrgency = "delayed" | "near" | "on_track";

interface UrgencyBadgeProps {
  urgency: StageUrgency;
  delayDays?: number;
  daysUntilDue?: number | null;
  isPublishReady?: boolean;
}

export function UrgencyBadge({
  urgency,
  delayDays = 0,
  daysUntilDue = null,
  isPublishReady = false,
}: UrgencyBadgeProps) {
  if (urgency === "delayed" && delayDays > 0) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-600 text-white border border-red-400/50 shadow-xs whitespace-nowrap"
        title={`Overdue by ${delayDays} day${delayDays === 1 ? "" : "s"}`}
      >
        Delay: {delayDays}d
      </span>
    );
  }

  if (urgency === "near") {
    const clampedDays = Math.max(0, Math.min(7, daysUntilDue ?? 0));
    const t = (7 - clampedDays) / 7;
    const r = Math.round(249 + (239 - 249) * t);
    const g = Math.round(138 + (68 - 138) * t);
    const b = Math.round(22 + (68 - 22) * t);
    const endR = Math.round(234 + (210 - 234) * t);
    const endG = Math.round(88 + (38 - 88) * t);
    const endB = Math.round(12 + (38 - 12) * t);

    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-white border border-white/25 shadow-xs whitespace-nowrap"
        style={{
          background: `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgb(${endR}, ${endG}, ${endB}))`,
        }}
        title={clampedDays === 0 ? "Target date is today" : `Target date in ${clampedDays}d`}
      >
        {clampedDays === 0 ? "Near • Today" : `Near • ${clampedDays}d`}
      </span>
    );
  }

  if (isPublishReady) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium glass-subtle text-muted-foreground whitespace-nowrap">
      {daysUntilDue !== null && daysUntilDue > 0 ? `In ${daysUntilDue}d` : "On Track"}
    </span>
  );
}
