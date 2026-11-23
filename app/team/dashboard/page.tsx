"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import {
  Clapperboard,
  RotateCcw,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Calendar,
  LogOut,
  Loader2,
  FileText,
  FileVideo,
  Sparkles,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UrgencyBadge } from "@/components/dashboard/urgency-badge";
import {
  getSessionCache,
  hydrateSessionCacheFromStorage,
  setSessionCache,
} from "@/lib/session-cache";

function getTeamDashboardCacheKey(brandId: string) {
  return `team-dashboard-v2:${brandId}`;
}

export default function TeamDashboardPage() {
  const { data: session, status } = useSession();

  const initialCache = getSessionCache<any>(getTeamDashboardCacheKey("all"));

  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<any>(initialCache);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [brandsList, setBrandsList] = useState<
    { id: string; name: string; color?: string | null; is_default?: boolean }[]
  >(Array.isArray(initialCache?.brands) ? initialCache.brands : []);

  const fetchTeamDashboard = async (
    brandId = brandFilter,
    options?: { silent?: boolean }
  ) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch(
        `/api/dashboard/team?brandId=${encodeURIComponent(brandId)}`
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to load Team Dashboard");
      }
      const data = await res.json();
      setTeamData(data);
      if (Array.isArray(data.brands)) {
        setBrandsList(data.brands);
      }
      setSessionCache(getTeamDashboardCacheKey(brandId), data);
    } catch (err: any) {
      console.error("Team dashboard error:", err);
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
    const key = getTeamDashboardCacheKey(brandFilter);
    const cached =
      getSessionCache<any>(key) || hydrateSessionCacheFromStorage<any>(key);
    if (cached) {
      setTeamData(cached);
      if (Array.isArray(cached.brands)) setBrandsList(cached.brands);
      setLoading(false);
      fetchTeamDashboard(brandFilter, { silent: true });
    } else {
      fetchTeamDashboard(brandFilter);
    }
  }, [brandFilter]);

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-3 py-3 pb-24 md:p-10 md:pb-10">
      {/* Main Content Area */}
      <main className="w-full max-w-6xl mx-auto my-1 md:my-2 flex-1 space-y-4 md:space-y-8">
        {/* Frosted Brand Filter Pill Bar */}
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
              Loading your assigned tasks, revision requests, and focus reminders...
            </span>
          </div>
        ) : error ? (
          <div className="glass-floating rounded-3xl p-8 text-center max-w-md mx-auto my-12 space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h3 className="font-bold text-sm">Dashboard Notice</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : teamData ? (
          <>
            {/* Section 3: Personal Focus Reminder */}
            <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md flex items-start gap-3.5 shadow-sm">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold font-mono text-amber-500 uppercase tracking-wider">
                  Quality Focus Reminder
                </h4>
                <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                  {teamData.focusReminder.text}
                </p>
              </div>
            </div>

            {/* Section 1: "Changes Requested" (Immediate Action Required) */}
            <div className="card-theme p-4 sm:p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-status-revision/15 text-status-revision flex items-center justify-center">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm">Changes Requested</h3>
                      {teamData.changesRequested.length > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-status-revision text-status-revision-foreground shadow-xs">
                          {teamData.changesRequested.length} Action Needed
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Deliverables returned by Creator with notes. Prepare your next cut!
                    </p>
                  </div>
                </div>
              </div>

              {teamData.changesRequested.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl glass-subtle">
                  Zero pending revision requests. Great work!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {teamData.changesRequested.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-status-revision/35 glass-subtle space-y-3 flex flex-col justify-between transition-all duration-250 hover:border-status-revision/60"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                            {item.uniqueContentId || "Slot"}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono glass-subtle text-muted-foreground max-w-[180px] truncate">
                            {item.brandName && (
                              <>
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: item.brandColor || "#6366f1" }}
                                />
                                <span className="text-foreground/80 truncate">{item.brandName}</span>
                                <span>•</span>
                              </>
                            )}
                            <span className="truncate">{item.contentTypeName}</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4 className="font-bold text-xs">{item.title}</h4>
                          {item.urgency && (
                            <UrgencyBadge
                              urgency={item.urgency}
                              delayDays={item.delayDays}
                              daysUntilDue={item.daysUntilDue}
                            />
                          )}
                        </div>

                        {/* Creator's Feedback Note */}
                        <div className="p-3 rounded-xl glass-subtle text-xs space-y-1">
                          <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-between">
                            <span>Creator Feedback Note:</span>
                            {item.unresolvedCommentsCount > 0 && (
                              <span className="text-destructive font-bold">
                                {item.unresolvedCommentsCount} comments
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-foreground italic">
                            "{item.latestFeedbackNote}"
                          </p>
                        </div>
                      </div>

                      {/* Action Button: Upload Next Version */}
                      <Link
                        href={item.targetUrl}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-250 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <span>Upload Next Iteration ({item.nextVersion})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: "Up Next" Queue (Prioritized Pipeline) */}
            <div className="card-theme p-4 sm:p-6 rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Up Next Register</h3>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Active deliverables sorted by target date
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full glass-subtle text-xs font-mono text-muted-foreground">
                  {teamData.upNext.length} active deliverables
                </span>
              </div>

              {teamData.upNext.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl glass-subtle">
                  No active projects waiting for your role right now.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {teamData.upNext.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl glass-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/40 transition-all duration-250"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                            {item.uniqueContentId || "Slot"}
                          </span>
                          <span className="text-xs font-bold">{item.title}</span>
                          {item.urgency && (
                            <UrgencyBadge
                              urgency={item.urgency}
                              delayDays={item.delayDays}
                              daysUntilDue={item.daysUntilDue}
                            />
                          )}
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono glass-subtle text-muted-foreground">
                            {item.brandName && (
                              <>
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: item.brandColor || "#6366f1" }}
                                />
                                <span className="text-foreground/80">{item.brandName}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{item.contentTypeName}</span>
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span>Task: <strong className="text-foreground">{item.taskName}</strong></span>
                          <span>•</span>
                          <span>Target Date: <strong className="text-primary">{formatDateDisplay(item.teamDueDate)}</strong></span>
                          {item.publishDate && (
                            <>
                              <span>•</span>
                              <span>Publish: <strong>{formatDateDisplay(item.publishDate)}</strong></span>
                            </>
                          )}
                        </div>
                      </div>

                      <Link
                        href={item.targetUrl}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-subtle hover:bg-primary hover:text-primary-foreground text-foreground flex items-center justify-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer transition-all duration-250"
                      >
                        <span>Open Workspace</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Quality & Queue Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card-theme p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-muted-foreground">Delayed Deliverables</span>
                  <div className={`text-2xl font-bold font-mono mt-0.5 ${(teamData.performance.delayedCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {teamData.performance.delayedCount ?? 0}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Assigned tasks past target date</p>
                </div>
                <div className={`p-3 rounded-2xl ${(teamData.performance.delayedCount ?? 0) > 0 ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              <div className="card-theme p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-muted-foreground">First-Try Approval Rate</span>
                  <div className="text-2xl font-bold font-mono text-primary mt-0.5">
                    {teamData.performance.firstTryRate !== null && teamData.performance.firstTryRate !== undefined
                      ? `${teamData.performance.firstTryRate}%`
                      : "—"}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Approved at V1 without rework</p>
                </div>
                <div className="p-3 rounded-2xl bg-primary/15 text-primary">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              <div className="card-theme p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-muted-foreground">Deliverables Submitted</span>
                  <div className="text-2xl font-bold font-mono text-foreground mt-0.5">
                    {teamData.performance.completedDeliverables}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Total cuts submitted across projects</p>
                </div>
                <div className="p-3 rounded-2xl glass-subtle text-muted-foreground">
                  <Clapperboard className="w-6 h-6" />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="hidden md:block w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-6xl mx-auto">
        ContentPipe • Team Workspace Monitor
      </footer>
    </div>
  );
}
