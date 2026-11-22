"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, Archive, PlusCircle } from "lucide-react";
import { RadarTabKey } from "./production-pulse-strip";
import { StageUrgency, UrgencyBadge } from "./urgency-badge";

export interface AttentionRegisterRow {
  id: string;
  uniqueContentId: string | null;
  title: string;
  publishDate: string;
  seriesId: string;
  seriesName: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  currentStage: string;
  stageStatus: "not_done" | "under_review" | "revision_needed" | "done";
  stageTargetDate: string | null;
  urgency: StageUrgency;
  delayDays: number;
  daysUntilDue: number | null;
  publishUrgency?: StageUrgency;
  publishDelayDays?: number;
  publishDaysUntilDue?: number | null;
  isPublishReady: boolean;
  isArchiveEligible: boolean;
  reviewInfo: {
    taskName: string;
    version: string;
    submitterName: string;
    roleTitle: string;
    submittedAt: string;
    targetUrl: string;
  } | null;
  workspaceUrl: string;
  indexUrl: string;
}

export interface OpenSlotRow {
  id: string;
  publishDate: string;
  ideationTargetDate: string | null;
  seriesId: string;
  seriesName: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  urgency: StageUrgency;
  delayDays: number;
  daysUntilDue: number | null;
  hasPlaceholderRow: boolean;
  indexUrl: string;
}

interface FocusRadarTableProps {
  rows: AttentionRegisterRow[];
  openSlots: OpenSlotRow[];
  activeTab: RadarTabKey;
  onSelectTab: (tab: RadarTabKey) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function FocusRadarTable({
  rows,
  openSlots,
  activeTab,
  onSelectTab,
}: FocusRadarTableProps) {
  const delayedRows = rows.filter((r) => r.urgency === "delayed");
  const nearRows = rows.filter((r) => r.urgency === "near");
  const reviewRows = rows.filter((r) => Boolean(r.reviewInfo));
  const archiveRows = rows.filter((r) => r.isArchiveEligible);

  const focusVideoRows = rows.filter(
    (r) =>
      r.urgency === "delayed" ||
      r.urgency === "near" ||
      Boolean(r.reviewInfo) ||
      r.stageStatus === "revision_needed" ||
      r.isArchiveEligible
  );
  const urgentOpenSlots = openSlots.filter((s) => s.urgency !== "on_track");

  const tabs: { key: RadarTabKey; label: string; count: number }[] = [
    {
      key: "focus",
      label: "Needs Focus",
      count: focusVideoRows.length + urgentOpenSlots.length,
    },
    { key: "delayed", label: "Delayed", count: delayedRows.length },
    { key: "near", label: "Near (7d)", count: nearRows.length },
    { key: "review", label: "Review", count: reviewRows.length },
    { key: "archive", label: "To Archive", count: archiveRows.length },
    { key: "open_slots", label: "Open Slots", count: openSlots.length },
    { key: "all", label: "All Active", count: rows.length },
  ];

  const displayedVideos: AttentionRegisterRow[] = (() => {
    switch (activeTab) {
      case "focus":
        return focusVideoRows;
      case "delayed":
        return delayedRows;
      case "near":
        return nearRows;
      case "review":
        return reviewRows;
      case "archive":
        return archiveRows;
      case "all":
        return rows;
      case "open_slots":
        return [];
    }
  })();

  const displayedOpenSlots: OpenSlotRow[] =
    activeTab === "open_slots"
      ? openSlots
      : activeTab === "focus"
      ? urgentOpenSlots
      : [];

  const totalDisplayed = displayedVideos.length + displayedOpenSlots.length;

  return (
    <section className="card-theme p-4 sm:p-5 rounded-2xl space-y-4">
      {/* Header & Single-Source Filter Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Production Focus Radar</h2>
          <p className="text-[11px] font-mono text-muted-foreground">
            One unified register sorted by soonest target publish date — exceptions surfaced first
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "glass-subtle text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive
                      ? "bg-white/20 text-primary-foreground"
                      : "bg-muted/60 text-foreground/80"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Register List */}
      {totalDisplayed === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-border/80 glass-subtle space-y-1.5">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
          <p className="text-xs font-semibold text-foreground">
            {activeTab === "focus"
              ? "Production is running cleanly — zero delayed, near-due, or unreviewed items!"
              : "No items match this filter."}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            Switch to &quot;All Active&quot; to inspect your full upcoming register.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Content</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">Publish Date</th>
                <th className="py-2 px-3 font-semibold">Current Stage</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">Timing</th>
                <th className="py-2 pl-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {displayedVideos.map((row) => {
                const actionLabel = row.reviewInfo
                  ? `Review ${row.reviewInfo.version}`
                  : row.isArchiveEligible
                  ? "Archive"
                  : row.currentStage.toLowerCase().includes("script")
                  ? "Script"
                  : row.workspaceUrl.startsWith("/content/")
                  ? "Content"
                  : "Tracker";

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/25 transition-colors group"
                  >
                    {/* ID, Brand/Series, Title */}
                    <td className="py-2.5 pr-3 max-w-[340px]">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 shrink-0">
                          {row.uniqueContentId || "Slot"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          {row.brandName && (
                            <>
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: row.brandColor || "#6366f1" }}
                              />
                              <span>{row.brandName}</span>
                              <span>•</span>
                            </>
                          )}
                          <span>{row.seriesName}</span>
                        </span>
                      </div>
                      <Link
                        href={row.indexUrl}
                        className="font-semibold text-foreground hover:text-primary transition-colors line-clamp-1"
                      >
                        {row.title}
                      </Link>
                    </td>

                    {/* Target Publish Date + Own Urgency Card (only when Delayed or Near) */}
                    <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap text-foreground/90">
                      <div className="flex flex-col items-start gap-1">
                        <span>{formatDate(row.publishDate)}</span>
                        {(row.publishUrgency === "delayed" || row.publishUrgency === "near") && (
                          <UrgencyBadge
                            urgency={row.publishUrgency}
                            delayDays={row.publishDelayDays}
                            daysUntilDue={row.publishDaysUntilDue}
                          />
                        )}
                      </div>
                    </td>

                    {/* Current Active Stage & Sub-detail */}
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground">
                            {row.currentStage}
                          </span>
                          {row.reviewInfo && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-status-review/20 text-status-review border border-status-review/30">
                              Review • {row.reviewInfo.submitterName}
                            </span>
                          )}
                          {row.stageStatus === "revision_needed" && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-status-revision/20 text-status-revision border border-status-revision/30">
                              Revision Needed
                            </span>
                          )}
                          {row.isArchiveEligible && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <Archive className="w-2.5 h-2.5" />
                              Ready to Archive
                            </span>
                          )}
                        </div>
                        {row.stageTargetDate && !row.isArchiveEligible && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Target: {formatDate(row.stageTargetDate)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Timing Badge (Delay: Xd / Near / Ready) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <UrgencyBadge
                        urgency={row.urgency}
                        delayDays={row.delayDays}
                        daysUntilDue={row.daysUntilDue}
                        isPublishReady={row.isPublishReady}
                      />
                    </td>

                    {/* 1-Click Deep Link */}
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <Link
                        href={row.isArchiveEligible ? row.indexUrl : row.workspaceUrl}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          row.reviewInfo
                            ? "bg-primary text-primary-foreground hover:opacity-90 shadow-xs"
                            : "glass-subtle hover:bg-primary hover:text-primary-foreground text-foreground"
                        }`}
                      >
                        {row.reviewInfo && <Sparkles className="w-3 h-3" />}
                        <span>{actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {displayedOpenSlots.map((slot) => (
                <tr
                  key={slot.id}
                  className="hover:bg-muted/25 transition-colors bg-amber-500/[0.03]"
                >
                  <td className="py-2.5 pr-3 max-w-[340px]">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border border-dashed border-amber-500/50 text-amber-400 bg-amber-500/10 shrink-0">
                        Open Slot
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        {slot.brandName && (
                          <>
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: slot.brandColor || "#6366f1" }}
                            />
                            <span>{slot.brandName}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>{slot.seriesName}</span>
                      </span>
                    </div>
                    <span className="text-muted-foreground italic">
                      No video title or idea assigned yet
                    </span>
                  </td>

                  <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap text-foreground/90">
                    {formatDate(slot.publishDate)}
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-amber-400">Ideation Needed</span>
                      {slot.ideationTargetDate && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Ideation Target: {formatDate(slot.ideationTargetDate)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <UrgencyBadge
                      urgency={slot.urgency}
                      delayDays={slot.delayDays}
                      daysUntilDue={slot.daysUntilDue}
                    />
                  </td>

                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                    <Link
                      href={slot.indexUrl}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-subtle hover:bg-primary hover:text-primary-foreground text-foreground transition-all"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>Assign Idea</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
