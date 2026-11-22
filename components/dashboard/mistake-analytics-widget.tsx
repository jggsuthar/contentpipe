"use client";

import React from "react";
import { BarChart3, TrendingUp, RefreshCw, ShieldAlert } from "lucide-react";

export interface MistakeAnalyticsData {
  breakdown: {
    tag: string;
    count: number;
    percentage: number;
  }[];
  firstPassRate: number;
  avgIterations: number;
  totalMistakes: number;
  teamMembers: { email: string; name: string; role_title: string }[];
}

interface MistakeAnalyticsWidgetProps {
  analytics: MistakeAnalyticsData;
  timeframe: string;
  memberFilter: string;
  activeBrand?: { id: string; name: string; color?: string | null } | null;
  onChangeTimeframe: (tf: string) => void;
  onChangeMember: (email: string) => void;
}

export function MistakeAnalyticsWidget({
  analytics,
  timeframe,
  memberFilter,
  activeBrand = null,
  onChangeTimeframe,
  onChangeMember,
}: MistakeAnalyticsWidgetProps) {
  const TAG_COLORS: Record<string, string> = {
    "Pacing / Dead Air": "bg-amber-500",
    "Audio / SFX": "bg-purple-500",
    "B-Roll / Visuals": "bg-sky-500",
    "Typography / Text": "bg-emerald-500",
    "Retention Hook": "bg-rose-500",
    "Brand SOP Miss": "bg-orange-500",
  };

  return (
    <div className="card-theme p-6 rounded-2xl space-y-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold border border-primary/25">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm">Team Mistake & Rework Analytics</h3>
              {activeBrand && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeBrand.color || "#6366f1" }}
                  />
                  <span>{activeBrand.name}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Categorized quality feedback & First-Pass efficiency (SPEC.md Section 7.1.3)
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* Timeframe Toggle */}
          <div className="flex items-center p-1 rounded-full glass-subtle gap-0.5">
            <button
              type="button"
              onClick={() => onChangeTimeframe("30d")}
              className={`px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer ${
                timeframe === "30d"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => onChangeTimeframe("all")}
              className={`px-2.5 py-1 rounded-full transition-all duration-200 cursor-pointer ${
                timeframe === "all"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Time
            </button>
          </div>

          {/* Member Selector */}
          <select
            value={memberFilter}
            onChange={(e) => onChangeMember(e.target.value)}
            className="h-8 px-3 text-[11px] rounded-full glass-input cursor-pointer font-mono"
          >
            <option value="all">All Specialists</option>
            {analytics.teamMembers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name} ({m.role_title})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* High-Level Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Metric 1: First-Pass Acceptance Rate */}
        <div className="p-4 rounded-xl glass-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-muted-foreground">First-Pass Approval</span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {analytics.firstPassRate}%
            </div>
            <p className="text-[10px] text-muted-foreground">Approved at V1 without rework</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Avg Iterations */}
        <div className="p-4 rounded-xl glass-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-muted-foreground">Avg Iterations / Video</span>
            <div className="text-xl font-bold font-mono text-primary mt-0.5">
              {analytics.avgIterations}
            </div>
            <p className="text-[10px] text-muted-foreground">Cuts required until final signoff</p>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: Total Mistake Points */}
        <div className="p-4 rounded-xl glass-subtle flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-muted-foreground">Total Feedback Tags</span>
            <div className="text-xl font-bold font-mono text-foreground mt-0.5">
              {analytics.totalMistakes}
            </div>
            <p className="text-[10px] text-muted-foreground">Categorized review notes recorded</p>
          </div>
          <div className="p-2.5 rounded-xl glass-subtle text-muted-foreground">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Mistake Category Pareto Breakdown */}
      <div className="p-4 rounded-xl glass-subtle space-y-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block">
          Mistake Distribution Breakdown (Pareto Order)
        </span>

        {analytics.breakdown.length === 0 || analytics.totalMistakes === 0 ? (
          <div className="text-center py-6 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl bg-muted/10">
            Zero categorized mistakes recorded for this period.
          </div>
        ) : (
          <div className="space-y-2.5">
            {analytics.breakdown.map((item) => {
              const barColor = TAG_COLORS[item.tag] || "bg-primary";

              return (
                <div key={item.tag} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-medium text-foreground">{item.tag}</span>
                    <span className="text-muted-foreground text-[11px]">
                      <strong>{item.count}</strong> notes ({item.percentage}%)
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-muted/70 overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
