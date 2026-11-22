"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import {
  Clapperboard,
  Sliders,
  LogOut,
  HardDrive,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CreatorReviewInbox } from "@/components/dashboard/creator-review-inbox";
import { PipelineHealthMatrix } from "@/components/dashboard/pipeline-health-matrix";
import { CreatorAgenda } from "@/components/dashboard/creator-agenda";
import { MistakeAnalyticsWidget } from "@/components/dashboard/mistake-analytics-widget";
import { ActionItemsWidget } from "@/components/dashboard/action-items-widget";

export default function CreatorDashboardPage() {
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Filters for analytics & brand scoping
  const [timeframe, setTimeframe] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [brandsList, setBrandsList] = useState<
    { id: string; name: string; color?: string | null; is_default?: boolean }[]
  >([]);

  const fetchDashboardData = async (
    tf = timeframe,
    mem = memberFilter,
    brandId = brandFilter
  ) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/dashboard/creator?timeframe=${tf}&member=${mem}&brandId=${encodeURIComponent(brandId)}`
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to load Creator Command Center");
      }
      const data = await res.json();
      setDashboardData(data);
      if (Array.isArray(data.brands)) {
        setBrandsList(data.brands);
      }
    } catch (err: any) {
      console.error("Dashboard error:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(timeframe, memberFilter, brandFilter);
  }, [timeframe, memberFilter, brandFilter]);

  const handleToggleActionItem = async (itemId: string, actionItemId: string) => {
    try {
      const res = await fetch("/api/tracker/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, toggle_id: actionItemId }),
      });
      if (res.ok) {
        await fetchDashboardData(timeframe, memberFilter, brandFilter);
      }
    } catch (err) {
      console.error("Error toggling action item:", err);
    }
  };

  const activeBrandObj =
    brandFilter === "all" ? null : brandsList.find((b) => b.id === brandFilter) || null;

  return (
    <div className="flex-1 flex flex-col justify-between p-6 md:p-10">
      {/* Main Command Center Body */}
      <main className="w-full max-w-7xl mx-auto my-2 flex-1 space-y-8">
        {/* Frosted Brand Filter Pill Bar */}
        {brandsList.length > 0 && (
          <div className="glass-nav rounded-2xl border border-border px-3.5 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Brand:
            </span>
            <button
              type="button"
              onClick={() => setBrandFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer ${
                brandFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "glass-subtle text-muted-foreground hover:text-foreground"
              }`}
            >
              All Brands
            </button>
            {brandsList.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => setBrandFilter(brand.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer ${
                  brandFilter === brand.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "glass-subtle text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: brand.color || "#6366f1" }}
                />
                <span>{brand.name}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="glass-floating rounded-3xl p-16 text-center flex flex-col items-center justify-center gap-3 max-w-xl mx-auto my-12">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <span className="font-mono text-xs text-muted-foreground">
              Aggregating production velocity, review inbox, and mistake analytics...
            </span>
          </div>
        ) : error ? (
          <div className="glass-floating rounded-3xl p-8 text-center max-w-md mx-auto my-12 space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h3 className="font-bold text-sm">Dashboard Error</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : dashboardData ? (
          <>
            {/* Section 1: "Needs Your Review" Inbox */}
            <CreatorReviewInbox items={dashboardData.inbox || []} />

            {/* Section 2: Task Health & Production Velocity Matrix */}
            <PipelineHealthMatrix pipelines={dashboardData.pipelineHealth || []} />

            {/* Section 3: Today & This Week's Focus (Creator Agenda) */}
            <CreatorAgenda agenda={dashboardData.creatorAgenda} />

            {/* Section 4: Team Mistake & Rework Analytics (Quality Control) */}
            <MistakeAnalyticsWidget
              analytics={dashboardData.mistakeAnalytics}
              timeframe={timeframe}
              memberFilter={memberFilter}
              activeBrand={activeBrandObj}
              onChangeTimeframe={(tf) => setTimeframe(tf)}
              onChangeMember={(mem) => setMemberFilter(mem)}
            />

            {/* Section 5: Open Action Items & Remarks Widget */}
            <ActionItemsWidget
              openItems={dashboardData.actionItems.open || []}
              closedItems={dashboardData.actionItems.closed || []}
              onToggleActionItem={handleToggleActionItem}
            />
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-7xl mx-auto">
        ContentPipe • Creator Command Center (SPEC.md Section 7.1)
      </footer>
    </div>
  );
}
