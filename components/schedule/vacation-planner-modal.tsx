"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Flame,
  Layers,
  Loader2,
  Plane,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  TeamRoleOption,
  addDaysLocal,
  formatLocalDateStr,
  formatMinuteTo12h,
} from "./schedule-types";
import type {
  VacationModelId,
  VacationModelSimulation,
  VacationSimulationResult,
} from "@/lib/vacation-scheduler";

interface VacationPlannerModalProps {
  open: boolean;
  onClose: () => void;
  isCreator: boolean;
  defaultUserId: string;
  teamRoles: TeamRoleOption[];
  initialStartDate?: string;
  initialEndDate?: string;
  onApplied: (targetUserId: string) => Promise<void> | void;
}

const MODEL_ACCENT: Record<
  VacationModelId,
  { badge: string; ring: string; icon: typeof Zap }
> = {
  front_load: {
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/35",
    ring: "ring-sky-400/60 border-sky-400/60",
    icon: Plane,
  },
  level_load: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    ring: "ring-emerald-400/60 border-emerald-400/60",
    icon: Layers,
  },
  team_unblocker: {
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/35",
    ring: "ring-violet-400/60 border-violet-400/60",
    icon: ShieldCheck,
  },
  deficit_advisor: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    ring: "ring-amber-400/60 border-amber-400/60",
    icon: Flame,
  },
};

function VacationPlannerModalInner({
  onClose,
  isCreator,
  defaultUserId,
  teamRoles,
  initialStartDate,
  initialEndDate,
  onApplied,
}: Omit<VacationPlannerModalProps, "open">) {
  const defaultStart =
    initialStartDate || addDaysLocal(formatLocalDateStr(new Date()), 5);
  const defaultEnd =
    initialEndDate && initialEndDate >= defaultStart
      ? initialEndDate
      : addDaysLocal(defaultStart, 3);

  const [vacationStart, setVacationStart] = useState(defaultStart);
  const [vacationEnd, setVacationEnd] = useState(defaultEnd);
  const [holidayLabel, setHolidayLabel] = useState("Vacation Break");
  const [targetUserId, setTargetUserId] = useState(defaultUserId);

  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<VacationSimulationResult | null>(
    null
  );
  const [selectedModelId, setSelectedModelId] =
    useState<VacationModelId>("level_load");
  const [approvedOvertimeIds, setApprovedOvertimeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [approvedShiftItemIds, setApprovedShiftItemIds] = useState<Set<string>>(
    () => new Set()
  );

  const runSimulation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!vacationStart || !vacationEnd || vacationStart > vacationEnd) {
      setError("Please select a valid Start Date on or before End Date.");
      return;
    }

    setSimulating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/vacation/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacationStart,
          vacationEnd,
          holidayLabel: holidayLabel.trim() || "Vacation",
          targetUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to simulate 4 vacation models.");
        return;
      }

      const simResult = data as VacationSimulationResult;
      setSimulation(simResult);

      const recommended =
        simResult.models.find((m) => m.recommended) || simResult.models[0];
      if (recommended) {
        setSelectedModelId(recommended.modelId);
        const advisor = simResult.models.find(
          (m) => m.modelId === "deficit_advisor"
        );
        setApprovedOvertimeIds(
          new Set((advisor?.overtimeSuggestions || []).map((o) => o.id))
        );
        setApprovedShiftItemIds(new Set());
      }
    } catch {
      setError("Network error running 4-model vacation simulation.");
    } finally {
      setSimulating(false);
    }
  };

  const selectedModel: VacationModelSimulation | undefined =
    simulation?.models.find((m) => m.modelId === selectedModelId) ||
    simulation?.models[0];

  const handleApplySelectedModel = async () => {
    if (!simulation || !selectedModel) return;
    setApplying(true);
    setError(null);

    try {
      const overtimeByDate = new Map<
        string,
        {
          dateString: string;
          holidayLabel: string;
          customSlots: { zoneId: string; startMinute: number; endMinute: number }[];
        }
      >();
      if (selectedModel.modelId === "deficit_advisor") {
        for (const sug of selectedModel.overtimeSuggestions) {
          if (approvedOvertimeIds.has(sug.id)) {
            overtimeByDate.set(sug.dateString, {
              dateString: sug.dateString,
              holidayLabel: `${simulation.holidayLabel} Prep Boost`,
              customSlots: sug.customSlots,
            });
          }
        }
      }

      const publishShifts = selectedModel.publishShiftSuggestions
        .filter((ps) => approvedShiftItemIds.has(ps.contentItemId))
        .map((ps) => ({
          contentItemId: ps.contentItemId,
          suggestedPublishDate: ps.suggestedPublishDate,
        }));

      const res = await fetch("/api/schedule/vacation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacationStart: simulation.vacationStart,
          vacationEnd: simulation.vacationEnd,
          holidayLabel: simulation.holidayLabel,
          modelId: selectedModel.modelId,
          targetUserId: simulation.userId,
          allocations: selectedModel.allocationsToApply.map((a) => ({
            sourceType: a.sourceType,
            sourceId: a.sourceId,
            dateString: a.dateString,
            startMinute: a.startMinute,
            endMinute: a.endMinute,
            setupMinsUsed: a.setupMinsUsed,
            zoneId: a.zoneId,
            originalTargetDate: a.originalTargetDate,
          })),
          overtimeOverrides: Array.from(overtimeByDate.values()),
          publishShifts,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to apply vacation plan.");
        return;
      }

      await onApplied(simulation.userId);
      onClose();
    } catch {
      setError("Network error applying selected vacation model.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="glass-modal w-full max-w-6xl max-h-[92dvh] rounded-2xl border border-border/60 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
              <Plane className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Vacation &amp; Holiday Multi-Model Pre-Scheduling Engine
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Simulate 4 PWS strategies across your horizon before locking advance slots
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Step 1: Configuration Bar */}
          <form
            onSubmit={runSimulation}
            className="glass-card rounded-2xl p-3.5 border border-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={vacationStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setVacationStart(val);
                  if (val && vacationEnd < val) setVacationEnd(val);
                }}
                className="glass-input w-full rounded-xl px-2.5 py-2 text-xs text-foreground outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                End Date
              </label>
              <input
                type="date"
                value={vacationEnd}
                min={vacationStart}
                onChange={(e) => setVacationEnd(e.target.value)}
                className="glass-input w-full rounded-xl px-2.5 py-2 text-xs text-foreground outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Vacation / Holiday Label
              </label>
              <input
                type="text"
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                placeholder="e.g., Goa Trip / Diwali Break"
                className="glass-input w-full rounded-xl px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Schedule Owner
              </label>
              {isCreator ? (
                <div className="glass-input rounded-xl px-2.5 py-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <select
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="w-full bg-transparent text-xs text-foreground outline-none cursor-pointer"
                  >
                    <option value="creator" className="bg-background text-foreground">
                      Creator
                    </option>
                    {teamRoles.map((r) => (
                      <option
                        key={r.id}
                        value={r.id}
                        className="bg-background text-foreground"
                      >
                        {r.name} · {r.role_title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="glass-input rounded-xl px-3 py-2 text-xs text-muted-foreground">
                  My Schedule
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-all shadow-sm h-[34px]"
            >
              {simulating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {simulating ? "Simulating..." : "Run 4 Scheduling Models"}
            </button>
          </form>

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/35 px-3.5 py-2 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!simulation && !simulating && (
            <div className="glass-subtle rounded-2xl p-8 border border-border/40 text-center space-y-2">
              <CalendarRange className="w-8 h-8 text-amber-400/80 mx-auto" />
              <p className="text-sm font-medium text-foreground">
                Pick your vacation dates above and run the 4-model simulator
              </p>
              <p className="text-xs text-muted-foreground max-w-xl mx-auto">
                The engine scans up to 3 weeks before departure through 1 week after return, detects downstream team handoffs, and compares Front-Load, Level-Load, Team Unblocker, and Deficit Resolver plans side by side.
              </p>
            </div>
          )}

          {simulation && (
            <>
              {/* Context Summary Pill Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 font-medium">
                    Vacation: {simulation.vacationStart} → {simulation.vacationEnd} (
                    {simulation.holidayLabel})
                  </span>
                  <span className="px-2.5 py-1 rounded-xl glass-subtle border border-border/40 text-foreground">
                    {simulation.impactedTaskCount} impacted tasks (
                    {Math.round((simulation.totalImpactedMinutes / 60) * 10) / 10}h total)
                  </span>
                  {simulation.handoffCriticalCount > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/35 text-violet-300 font-medium">
                      {simulation.handoffCriticalCount} team handoff blocker(s)
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Horizon: {simulation.horizonStart} → {simulation.horizonEnd}
                </span>
              </div>

              {/* Step 2: 4-Model Side-by-Side Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {simulation.models.map((model, idx) => {
                  const accent = MODEL_ACCENT[model.modelId];
                  const Icon = accent.icon;
                  const active = selectedModel?.modelId === model.modelId;

                  return (
                    <button
                      key={model.modelId}
                      type="button"
                      onClick={() => setSelectedModelId(model.modelId)}
                      className={`text-left glass-card rounded-2xl p-3.5 border transition-all flex flex-col justify-between gap-3 ${
                        active
                          ? `ring-2 ${accent.ring} bg-primary/5`
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${accent.badge}`}
                          >
                            <Icon className="w-3 h-3" />
                            Model {idx + 1}: {model.tagline}
                          </span>
                          {model.recommended && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase">
                              Best Fit
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xs font-semibold text-foreground">
                            {model.name}
                          </h3>
                          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                            {model.description}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-border/40 text-[11px]">
                        <MetricRow
                          label="Pulled Forward"
                          value={`${model.metrics.tasksPulledForward} task(s)`}
                          tone="text-sky-300"
                        />
                        <MetricRow
                          label="Deferred Post-Trip"
                          value={`${model.metrics.tasksDeferredPostVacation} task(s)`}
                        />
                        <MetricRow
                          label="Peak Pre-Trip Load"
                          value={`${model.metrics.peakDailyLoadPercent}%`}
                          tone={
                            model.metrics.peakDailyLoadPercent > 90
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }
                        />
                        <MetricRow
                          label="Setup Saved (Batch)"
                          value={`⚡ ${model.metrics.batchingSavedMins}m`}
                          tone="text-emerald-300"
                        />
                        <MetricRow
                          label="Handoffs Protected"
                          value={`${model.metrics.teamHandoffsProtected}`}
                          tone="text-violet-300"
                        />
                        <MetricRow
                          label="Deficit / Overtime"
                          value={
                            model.metrics.deficitMins > 0
                              ? `${model.metrics.deficitMins}m deficit`
                              : model.metrics.overtimeAddedMins > 0
                              ? `+${model.metrics.overtimeAddedMins}m OT`
                              : "0m needed"
                          }
                          tone={
                            model.metrics.deficitMins > 0
                              ? "text-rose-400"
                              : model.metrics.overtimeAddedMins > 0
                              ? "text-amber-300"
                              : "text-emerald-400"
                          }
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Model 4 Advisor Options (Overtime Boosts & Open-Slot Shifts) */}
              {selectedModel &&
                (selectedModel.overtimeSuggestions.length > 0 ||
                  selectedModel.publishShiftSuggestions.length > 0) && (
                  <div className="glass-card rounded-2xl p-3.5 border border-amber-500/35 bg-amber-500/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5" />
                        Deficit Resolver Recommendations ({selectedModel.name})
                      </h4>
                      <span className="text-[10px] text-muted-foreground">
                        Toggle overrides/shifts to apply with this plan
                      </span>
                    </div>

                    {selectedModel.overtimeSuggestions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Temporary Zone Boosts (CalendarDateOverride)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedModel.overtimeSuggestions.map((ot) => {
                            const checked = approvedOvertimeIds.has(ot.id);
                            return (
                              <label
                                key={ot.id}
                                className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition-colors ${
                                  checked
                                    ? "bg-amber-500/15 border-amber-500/45 text-foreground"
                                    : "glass-subtle border-border/40 text-muted-foreground"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setApprovedOvertimeIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(ot.id)) next.delete(ot.id);
                                      else next.add(ot.id);
                                      return next;
                                    })
                                  }
                                  className="accent-amber-500"
                                />
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: ot.zoneColor }}
                                />
                                <span>{ot.description}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedModel.publishShiftSuggestions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Open Slot Publish Date Shift Suggestions (Zero Overtime)
                        </p>
                        <div className="space-y-1.5">
                          {selectedModel.publishShiftSuggestions.map((ps) => {
                            const checked = approvedShiftItemIds.has(
                              ps.contentItemId
                            );
                            return (
                              <label
                                key={ps.contentItemId}
                                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-[11px] cursor-pointer ${
                                  checked
                                    ? "bg-emerald-500/15 border-emerald-500/45 text-foreground"
                                    : "glass-subtle border-border/40 text-muted-foreground"
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  {isCreator && (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setApprovedShiftItemIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(ps.contentItemId))
                                            next.delete(ps.contentItemId);
                                          else next.add(ps.contentItemId);
                                          return next;
                                        })
                                      }
                                      className="accent-emerald-500"
                                    />
                                  )}
                                  <span className="truncate font-medium text-foreground">
                                    {ps.currentTitle}
                                  </span>
                                  <span className="text-muted-foreground truncate">
                                    {ps.currentPublishDate} → {ps.suggestedPublishDate}
                                  </span>
                                </span>
                                <span className="text-emerald-400 font-semibold shrink-0">
                                  Frees {ps.freedPreVacationMins}m
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Step 3: Interactive Advance Schedule Preview Table */}
              {selectedModel && (
                <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground">
                      Advance Schedule Preview — {selectedModel.name} (
                      {selectedModel.impactedTasks.length} impacted tasks)
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedModel.solverMessage}
                    </span>
                  </div>

                  {selectedModel.impactedTasks.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>
                        No pending tasks fall directly inside {simulation.vacationStart} – {simulation.vacationEnd}. Applying will simply block those dates as Holidays.
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="py-2 px-3">Task &amp; Content</th>
                            <th className="py-2 px-3">Original Target</th>
                            <th className="py-2 px-3">New Scheduled Slot &amp; Zone</th>
                            <th className="py-2 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {selectedModel.impactedTasks.map((t) => (
                            <tr
                              key={`${t.sourceType}:${t.sourceId}`}
                              className="hover:bg-muted/20 transition-colors"
                            >
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {t.uniqueContentId && (
                                    <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold">
                                      {t.uniqueContentId}
                                    </span>
                                  )}
                                  <span className="font-medium text-foreground">
                                    {t.title}
                                  </span>
                                  <span className="text-muted-foreground">—</span>
                                  <span className="font-semibold text-foreground">
                                    {t.taskName}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({t.durationMins}m)
                                  </span>
                                </div>
                                {t.isTeamHandoffCritical && (
                                  <p className="text-[10px] text-violet-300 mt-0.5">
                                    {t.downstreamHandoffSummary ||
                                      "Protects downstream team handoff"}
                                  </p>
                                )}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground tabular-nums whitespace-nowrap">
                                {t.originalTargetDate || "Unscheduled"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {t.newDateString ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span className="font-medium text-foreground tabular-nums">
                                      {t.newDateString}{" "}
                                      {t.newStartMinute !== null &&
                                      t.newEndMinute !== null
                                        ? `${formatMinuteTo12h(
                                            t.newStartMinute
                                          )}–${formatMinuteTo12h(t.newEndMinute)}`
                                        : ""}
                                    </span>
                                    {t.zoneName && (
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                        style={{
                                          backgroundColor: `${
                                            t.zoneColor || "#6366f1"
                                          }22`,
                                          color: t.zoneColor || "#a5b4fc",
                                        }}
                                      >
                                        {t.zoneName}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-rose-400 font-medium">
                                    Unplaced ({t.durationMins}m deficit)
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {t.disposition === "pulled_forward" && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-semibold">
                                    ✈️ Advance
                                  </span>
                                )}
                                {t.disposition === "overtime_fit" && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/45 text-amber-200 text-[10px] font-semibold">
                                    ⚡ Boost Fit
                                  </span>
                                )}
                                {t.disposition === "deferred" && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-500/35 text-slate-300 text-[10px] font-semibold">
                                    Deferred Post-Trip
                                  </span>
                                )}
                                {t.disposition === "unplaced" && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-semibold">
                                    Overflow
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 4 Footer */}
        <div className="px-5 py-3.5 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-muted/15">
          <p className="text-[11px] text-muted-foreground">
            {simulation && selectedModel
              ? `Ready to lock ${selectedModel.allocationsToApply.length} advance block(s) with 📌 Pin + ✈️ Advance for Vacation badge.`
              : "Run the 4-model simulation to compare strategies before committing."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!simulation || !selectedModel || applying}
              onClick={handleApplySelectedModel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 disabled:opacity-45 transition-all shadow-sm"
            >
              {applying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plane className="w-3.5 h-3.5" />
              )}
              {applying ? "Applying & Pinning..." : "Apply & Pin Selected Model"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

export function VacationPlannerModal({
  open,
  ...rest
}: VacationPlannerModalProps) {
  if (!open) return null;
  const key = `${rest.defaultUserId}-${rest.initialStartDate || ""}-${
    rest.initialEndDate || ""
  }`;
  return <VacationPlannerModalInner key={key} {...rest} />;
}
