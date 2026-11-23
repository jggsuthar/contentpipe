"use client";

import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ProductionPulseStrip, RadarTabKey } from "@/components/dashboard/production-pulse-strip";
import { LiveAssemblyLine } from "@/components/dashboard/live-assembly-line";
import { FocusRadarTable } from "@/components/dashboard/focus-radar-table";
import { MistakeAnalyticsWidget } from "@/components/dashboard/mistake-analytics-widget";
import { ActionItemsWidget } from "@/components/dashboard/action-items-widget";
import {
  getSessionCache,
  hydrateSessionCacheFromStorage,
  setSessionCache,
} from "@/lib/session-cache";

function getCreatorDashboardCacheKey(tf: string, mem: string, brandId: string) {
  return `creator-dashboard-v3:${tf}:${mem}:${brandId}`;
}

export default function CreatorDashboardPage() {
  const initialCache = getSessionCache<any>(
    getCreatorDashboardCacheKey("all", "all", "all")
  );

  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(initialCache);

  const [timeframe, setTimeframe] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [radarTab, setRadarTab] = useState<RadarTabKey>("focus");
  const [brandsList, setBrandsList] = useState<
    { id: string; name: string; color?: string | null; is_default?: boolean }[]
  >(Array.isArray(initialCache?.brands) ? initialCache.brands : []);

  const fetchDashboardData = async (
    tf = timeframe,
    mem = memberFilter,
    brandId = brandFilter,
    options?: { silent?: boolean }
  ) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch(
        `/api/dashboard/creator?timeframe=${tf}&member=${mem}&brandId=${encodeURIComponent(brandId)}`
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to load Creator Dashboard");
      }
      const data = await res.json();
      setDashboardData(data);
      if (Array.isArray(data.brands)) {
        setBrandsList(data.brands);
      }
      setSessionCache(getCreatorDashboardCacheKey(tf, mem, brandId), data);
    } catch (err: any) {
      console.error("Dashboard error:", err);
      if (!options?.silent) {
        setError(err.message || "Failed to load dashboard data");
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const key = getCreatorDashboardCacheKey(timeframe, memberFilter, brandFilter);
    const cached =
      getSessionCache<any>(key) || hydrateSessionCacheFromStorage<any>(key);
    if (cached) {
      setDashboardData(cached);
      if (Array.isArray(cached.brands)) setBrandsList(cached.brands);
      setLoading(false);
      fetchDashboardData(timeframe, memberFilter, brandFilter, { silent: true });
    } else {
      fetchDashboardData(timeframe, memberFilter, brandFilter);
    }
  }, [timeframe, memberFilter, brandFilter]);

  const handleToggleActionItem = async (itemId: string, actionItemId: string) => {
    try {
      const res = await fetch("/api/tracker/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, toggle_id: actionItemId }),
      });
      if (res.ok) {
        await fetchDashboardData(timeframe, memberFilter, brandFilter, { silent: true });
      }
    } catch (err) {
      console.error("Error toggling action item:", err);
    }
  };

  const activeBrandObj =
    brandFilter === "all" ? null : brandsList.find((b) => b.id === brandFilter) || null;

  return (
    <div className="flex-1 flex flex-col justify-between px-3 py-3 pb-24 md:p-10 md:pb-10">
      <main className="w-full max-w-7xl mx-auto my-1 md:my-2 flex-1 space-y-4 md:space-y-6">
        {/* Brand Filter Bar */}
        {brandsList.length > 0 && (
          <div className="glass-nav rounded-2xl border border-border px-3 py-2 md:px-3.5 md:py-2.5 flex items-center gap-2 flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap shadow-sm">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
              Brand:
            </span>
            <button
              type="button"
              onClick={() => setBrandFilter("all")}
              className={`px-3 py-1.5 md:py-1 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer shrink-0 ${
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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 md:py-1 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer shrink-0 ${
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
              Loading production runway, active stages, and focus register...
            </span>
          </div>
        ) : error ? (
          <div className="glass-floating rounded-3xl p-8 text-center max-w-md mx-auto my-12 space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h3 className="font-bold text-sm">Dashboard Error</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : dashboardData?.pulseSummary ? (
          <>
            {/* Zone 1: Production Runway & Exception Pulse */}
            <ProductionPulseStrip
              summary={dashboardData.pulseSummary}
              activeTab={radarTab}
              onSelectTab={(tab) => setRadarTab(tab)}
            />

            {/* Zone 2: Live Assembly Line (Per-Series Bottleneck Funnel) */}
            <LiveAssemblyLine pipelines={dashboardData.seriesPipelines || []} />

            {/* Zone 3: Unified Production Focus Radar (Zero Redundancy) */}
            <FocusRadarTable
              rows={dashboardData.attentionRegister || []}
              openSlots={dashboardData.openSlotsSoon || []}
              activeTab={radarTab}
              onSelectTab={(tab) => setRadarTab(tab)}
            />

            {/* Zone 4: Compact Utility Strip (Custom Action Items + Quality Control) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-5">
                <ActionItemsWidget
                  openItems={dashboardData.actionItems?.open || []}
                  closedItems={dashboardData.actionItems?.closed || []}
                  onToggleActionItem={handleToggleActionItem}
                />
              </div>
              <div className="xl:col-span-7">
                <MistakeAnalyticsWidget
                  analytics={dashboardData.mistakeAnalytics}
                  timeframe={timeframe}
                  memberFilter={memberFilter}
                  activeBrand={activeBrandObj}
                  onChangeTimeframe={(tf) => setTimeframe(tf)}
                  onChangeMember={(mem) => setMemberFilter(mem)}
                />
              </div>
            </div>
          </>
        ) : null}
      </main>

      <footer className="hidden md:block w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-7xl mx-auto">
        ContentPipe • Production &amp; Register Monitor
      </footer>
    </div>
  );
}
