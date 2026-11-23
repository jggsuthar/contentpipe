"use client";

import React from "react";
import { ShieldCheck, AlertOctagon, Flame, Inbox } from "lucide-react";

export type RadarTabKey =
  | "focus"
  | "delayed"
  | "near"
  | "review"
  | "archive"
  | "open_slots"
  | "all";

export interface PulseSummary {
  readyRunwayCount: number;
  safeUntilDate: string | null;
  delayedCount: number;
  nearCount: number;
  underReviewCount: number;
  readyToArchiveCount: number;
  openSlotsSoonCount: number;
  openSlotsUrgentCount: number;
  totalActiveCount: number;
}

interface ProductionPulseStripProps {
  summary: PulseSummary;
  activeTab: RadarTabKey;
  onSelectTab: (tab: RadarTabKey) => void;
}

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ProductionPulseStrip({
  summary,
  activeTab,
  onSelectTab,
}: ProductionPulseStripProps) {
  const safeUntilLabel = formatShortDate(summary.safeUntilDate);

  const cards = [
    {
      key: "all" as RadarTabKey,
      targetTab: summary.openSlotsUrgentCount > 0 ? ("open_slots" as RadarTabKey) : ("all" as RadarTabKey),
      label: "Ready Runway",
      value: summary.readyRunwayCount,
      unit: summary.readyRunwayCount === 1 ? "video" : "videos",
      subtext: safeUntilLabel
        ? `Covered thru ${safeUntilLabel}`
        : summary.openSlotsSoonCount > 0
        ? `${summary.openSlotsSoonCount} open slot${summary.openSlotsSoonCount === 1 ? "" : "s"} in 30d`
        : "No upcoming ready buffer",
      accentClass:
        summary.readyRunwayCount > 0
          ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/25"
          : "text-muted-foreground bg-muted/40 border-border",
      ringClass: "border-emerald-500/35",
      icon: ShieldCheck,
    },
    {
      key: "delayed" as RadarTabKey,
      targetTab: "delayed" as RadarTabKey,
      label: "Delayed",
      value: summary.delayedCount,
      unit: summary.delayedCount === 1 ? "video" : "videos",
      subtext:
        summary.delayedCount > 0
          ? "Past active stage target"
          : "Zero delayed stages",
      accentClass:
        summary.delayedCount > 0
          ? "text-red-400 bg-red-500/15 border-red-500/30"
          : "text-muted-foreground bg-muted/40 border-border",
      ringClass: summary.delayedCount > 0 ? "border-red-500/45" : "border-border",
      icon: AlertOctagon,
    },
    {
      key: "near" as RadarTabKey,
      targetTab: "near" as RadarTabKey,
      label: "Near Target (7d)",
      value: summary.nearCount,
      unit: summary.nearCount === 1 ? "video" : "videos",
      subtext:
        summary.nearCount > 0
          ? "Due within coming week"
          : "Clear for next 7 days",
      accentClass:
        summary.nearCount > 0
          ? "text-orange-400 bg-orange-500/15 border-orange-500/30"
          : "text-muted-foreground bg-muted/40 border-border",
      ringClass: summary.nearCount > 0 ? "border-orange-500/40" : "border-border",
      icon: Flame,
    },
    {
      key: "review" as RadarTabKey,
      targetTab:
        summary.underReviewCount > 0
          ? ("review" as RadarTabKey)
          : summary.readyToArchiveCount > 0
          ? ("archive" as RadarTabKey)
          : ("review" as RadarTabKey),
      label: "Needs Decision",
      value: summary.underReviewCount,
      unit: "reviews",
      subtext:
        summary.readyToArchiveCount > 0
          ? `+ ${summary.readyToArchiveCount} ready to archive`
          : summary.underReviewCount > 0
          ? "Team cuts waiting signoff"
          : "Inbox clear",
      accentClass:
        summary.underReviewCount > 0
          ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
          : "text-muted-foreground bg-muted/40 border-border",
      ringClass: summary.underReviewCount > 0 ? "border-amber-500/40" : "border-border",
      icon: Inbox,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeTab === card.targetTab;
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => onSelectTab(card.targetTab)}
            className={`card-theme p-3 md:p-4 rounded-2xl text-left flex items-center justify-between gap-2 md:gap-3 transition-all duration-200 cursor-pointer hover:border-primary/45 ${
              isSelected ? "ring-1 ring-primary/60 border-primary/50" : card.ringClass
            }`}
          >
            <div className="min-w-0 space-y-1">
              <span className="text-[10px] md:text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground block truncate">
                {card.label}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl md:text-2xl font-bold font-mono text-foreground leading-none">
                  {card.value}
                </span>
                <span className="text-[10px] md:text-[11px] font-mono text-muted-foreground">
                  {card.unit}
                </span>
              </div>
              <p className="text-[10px] md:text-[11px] text-muted-foreground truncate">
                {card.subtext}
              </p>
            </div>
            <div
              className={`w-8 h-8 md:w-10 md:h-10 rounded-xl border flex items-center justify-center shrink-0 ${card.accentClass}`}
            >
              <Icon className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
