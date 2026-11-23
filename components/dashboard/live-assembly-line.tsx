"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, GitCommitHorizontal, ChevronRight, ChevronDown, Calendar } from "lucide-react";

export interface SeriesStageBucket {
  taskName: string;
  color: string;
  activeHereCount: number;
  delayedCount: number;
  nearCount: number;
  onTrackCount: number;
  reviewCount: number;
}

export interface SeriesUpcomingSlot {
  dateKey: string;
  publishDate: string;
  title: string | null;
  uniqueContentId: string | null;
  status: "ready" | "delayed" | "near" | "on_track" | "open_slot";
  currentStage: string | null;
}

export interface SeriesPipelineSummary {
  id: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  cadenceSummary: string;
  activeCount: number;
  readyRunwayCount: number;
  delayedCount: number;
  nearCount: number;
  stages: SeriesStageBucket[];
  upcomingSlots: SeriesUpcomingSlot[];
  indexUrl: string;
}

interface LiveAssemblyLineProps {
  pipelines: SeriesPipelineSummary[];
}

function formatSlotDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LiveAssemblyLine({ pipelines }: LiveAssemblyLineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!pipelines || pipelines.length === 0) {
    return null;
  }

  const totalActive = pipelines.reduce((sum, s) => sum + s.activeCount, 0);
  const totalDelayed = pipelines.reduce((sum, s) => sum + s.delayedCount, 0);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full card-theme px-4 py-3 rounded-2xl flex items-center justify-between gap-2 text-left hover:border-primary/45 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GitCommitHorizontal className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-sm font-bold tracking-tight">Production Line</h2>
          <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline truncate">
            • Where active videos sit right now per series
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded-full glass-subtle text-muted-foreground">
            {pipelines.length} {pipelines.length === 1 ? "series" : "series"} • {totalActive} active
          </span>
          {totalDelayed > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-semibold">
              {totalDelayed} late
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isExpanded && (
      <div className="grid grid-cols-1 gap-3.5">
        {pipelines.map((series) => (
          <div
            key={series.id}
            className="card-theme p-3.5 sm:p-5 rounded-2xl space-y-3 sm:space-y-3.5"
          >
            {/* Series Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                {series.brandName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono glass-subtle text-muted-foreground">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: series.brandColor || "#6366f1" }}
                    />
                    <span className="text-foreground/85">{series.brandName}</span>
                  </span>
                )}
                <h3 className="font-bold text-sm text-foreground">{series.name}</h3>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {series.cadenceSummary}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded-full glass-subtle text-muted-foreground">
                  {series.activeCount} active
                </span>
                {series.readyRunwayCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold">
                    {series.readyRunwayCount} ready
                  </span>
                )}
                <Link
                  href={series.indexUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full glass-subtle hover:bg-primary hover:text-primary-foreground text-foreground font-semibold transition-colors"
                >
                  <span>Tracker</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Horizontal Stage Funnel (Exact Active Stage Counts) */}
            <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory no-scrollbar">
              {series.stages.map((stage, idx) => {
                const hasDelayed = stage.delayedCount > 0;
                const hasNear = stage.nearCount > 0;
                const isEmpty = stage.activeHereCount === 0;

                return (
                  <React.Fragment key={stage.taskName}>
                    <Link
                      href={series.indexUrl}
                      className={`min-w-[96px] p-2 md:min-w-[108px] md:p-2.5 flex-1 snap-start rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${
                        hasDelayed
                          ? "bg-red-500/10 border-red-500/35 hover:border-red-500/60"
                          : hasNear
                          ? "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/55"
                          : isEmpty
                          ? "glass-subtle border-border/50 opacity-60 hover:opacity-90"
                          : "glass-subtle border-border hover:border-primary/45"
                      }`}
                      title={`${stage.taskName}: ${stage.activeHereCount} currently here`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="truncate">{stage.taskName}</span>
                        </span>
                        <span
                          className={`text-sm font-bold font-mono leading-none ${
                            hasDelayed
                              ? "text-red-400"
                              : hasNear
                              ? "text-orange-400"
                              : isEmpty
                              ? "text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {stage.activeHereCount}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap min-h-[16px]">
                        {stage.delayedCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-red-600 text-white">
                            {stage.delayedCount} late
                          </span>
                        )}
                        {stage.nearCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-orange-500 text-white">
                            {stage.nearCount} near
                          </span>
                        )}
                        {stage.reviewCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {stage.reviewCount} rev
                          </span>
                        )}
                        {stage.delayedCount === 0 &&
                          stage.nearCount === 0 &&
                          stage.reviewCount === 0 &&
                          stage.onTrackCount > 0 && (
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {stage.onTrackCount} on track
                            </span>
                          )}
                      </div>
                    </Link>

                    {idx < series.stages.length - 1 && (
                      <div className="flex items-center text-muted-foreground/40 shrink-0">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Compact Upcoming Cadence Slots Strip */}
            {series.upcomingSlots.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50 overflow-x-auto no-scrollbar">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
                  <Calendar className="w-3 h-3" />
                  <span>Next Slots:</span>
                </span>
                {series.upcomingSlots.map((slot) => {
                  const pillStyle =
                    slot.status === "ready"
                      ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/30"
                      : slot.status === "delayed"
                      ? "bg-red-500/12 text-red-400 border-red-500/30"
                      : slot.status === "near"
                      ? "bg-orange-500/12 text-orange-400 border-orange-500/30"
                      : slot.status === "open_slot"
                      ? "border-dashed border-amber-500/45 text-amber-400 bg-amber-500/5"
                      : "glass-subtle text-muted-foreground border-border";

                  const statusLabel =
                    slot.status === "ready"
                      ? "Ready"
                      : slot.status === "open_slot"
                      ? "Open Slot"
                      : slot.currentStage || "Active";

                  return (
                    <Link
                      key={slot.dateKey}
                      href={series.indexUrl}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border shrink-0 transition-opacity hover:opacity-85 ${pillStyle}`}
                      title={
                        slot.title
                          ? `${formatSlotDate(slot.publishDate)}: ${slot.title} (${statusLabel})`
                          : `${formatSlotDate(slot.publishDate)}: Empty slot needing an idea`
                      }
                    >
                      <span className="font-bold">{formatSlotDate(slot.publishDate)}</span>
                      <span className="opacity-70">•</span>
                      <span className="max-w-[110px] truncate">{statusLabel}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
