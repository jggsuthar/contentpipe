"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  GanttChart,
  Grid,
  Loader2,
  Plane,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  PersonalTodoItem,
  ScheduleDragPayload,
  ScheduleOverrideItem,
  ScheduleViewMode,
  ScheduleZonesPayload,
  SolveApiResponse,
  SolvedAllocation,
  TeamRoleOption,
  addDaysLocal,
  formatWeekRangeLabel,
  getMondayOfWeek,
} from "@/components/schedule/schedule-types";
import { WorkloadSidebar } from "@/components/schedule/workload-sidebar";
import { LiveCalendarGrid } from "@/components/schedule/live-calendar-grid";
import { GanttTimelineView } from "@/components/schedule/gantt-timeline-view";
import { ZoneTemplateDesigner } from "@/components/schedule/zone-template-designer";
import { PersonalTodoModal } from "@/components/schedule/personal-todo-modal";
import { VacationPlannerModal } from "@/components/schedule/vacation-planner-modal";

export default function SchedulePage() {
  const { data: session, status: authStatus } = useSession();

  const isCreator = session?.user?.role === "creator";
  const selfUserId = isCreator
    ? "creator"
    : session?.user?.roleId || session?.user?.email?.toLowerCase() || "creator";

  const [userOverrideId, setUserOverrideId] = useState<string | null>(null);
  const selectedUserId = userOverrideId ?? selfUserId;
  const [teamRoles, setTeamRoles] = useState<TeamRoleOption[]>([]);

  const [mondayDate, setMondayDate] = useState<string>(() =>
    getMondayOfWeek(new Date())
  );
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("calendar");
  const [ganttWeeks, setGanttWeeks] = useState<1 | 2 | 3 | 4>(1);

  const [zones, setZones] = useState<DbScheduleZone[]>([]);
  const [weeklySlots, setWeeklySlots] = useState<DbWeeklyZoneSlot[]>([]);
  const [dayBounds, setDayBounds] = useState<DbWeeklyDayBounds[]>([]);
  const [overrides, setOverrides] = useState<ScheduleOverrideItem[]>([]);
  const [personalTodos, setPersonalTodos] = useState<PersonalTodoItem[]>([]);
  const [solveResult, setSolveResult] = useState<SolveApiResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [banner, setBanner] = useState<{
    type: "error" | "info" | "success";
    message: string;
  } | null>(null);

  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<PersonalTodoItem | null>(null);
  const [vacationModalOpen, setVacationModalOpen] = useState(false);
  const [vacationInitRange, setVacationInitRange] = useState<{
    start?: string;
    end?: string;
  }>({});
  const [holidayAutoPromptDate, setHolidayAutoPromptDate] = useState<string | null>(
    null
  );

  // Fetch team roles for Creator user switcher
  useEffect(() => {
    if (!isCreator) return;
    let active = true;
    fetch("/api/settings/roles")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!active || !Array.isArray(data)) return;
        setTeamRoles(
          data.map((r: TeamRoleOption) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role_title: r.role_title,
          }))
        );
      })
      .catch(() => {
        // Roles selector stays Creator-only if unavailable
      });
    return () => {
      active = false;
    };
  }, [isCreator]);

  const endDate =
    viewMode === "gantt"
      ? addDaysLocal(mondayDate, ganttWeeks * 7 - 1)
      : addDaysLocal(mondayDate, 6);

  const fetchScheduleBundle = useCallback(
    async (withAutoSolve: boolean) => {
      const targetUser = selectedUserId || selfUserId;
      const qsUser = `targetUserId=${encodeURIComponent(targetUser)}`;
      const [zonesRes, todosRes, overridesRes, solveRes] = await Promise.all([
        fetch(`/api/schedule/zones?${qsUser}`, { cache: "no-store" }),
        fetch(`/api/schedule/todos?${qsUser}`, { cache: "no-store" }),
        fetch(
          `/api/schedule/overrides?startDate=${mondayDate}&endDate=${endDate}&${qsUser}`,
          { cache: "no-store" }
        ),
        withAutoSolve
          ? fetch("/api/schedule/solve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                startDate: mondayDate,
                endDate,
                targetUserId: targetUser,
                includeFutureTasks: false,
              }),
            }).catch(() => null)
          : fetch(
              `/api/schedule/solve?startDate=${mondayDate}&endDate=${endDate}&${qsUser}`,
              { cache: "no-store" }
            ).catch(() => null),
      ]);

      return { zonesRes, todosRes, overridesRes, solveRes };
    },
    [selectedUserId, selfUserId, mondayDate, endDate]
  );

  const applyScheduleResponses = useCallback(
    async ({
      zonesRes,
      todosRes,
      overridesRes,
      solveRes,
    }: Awaited<ReturnType<typeof fetchScheduleBundle>>) => {
      if (zonesRes.ok) {
        const zData = (await zonesRes.json()) as ScheduleZonesPayload;
        setZones(zData.zones || []);
        setWeeklySlots(zData.slots || []);
        setDayBounds(zData.dayBounds || []);
      }

      if (todosRes.ok) {
        const tData = (await todosRes.json()) as PersonalTodoItem[];
        setPersonalTodos(tData || []);
      }

      if (overridesRes.ok) {
        const oData = (await overridesRes.json()) as ScheduleOverrideItem[];
        setOverrides(oData || []);
      }

      if (solveRes) {
        const sData = await solveRes.json();
        if (!solveRes.ok) {
          setBanner({
            type: "error",
            message: sData?.error || "Failed to auto-solve schedule.",
          });
        } else {
          setSolveResult(sData as SolveApiResponse);
          if (sData.status === "SWAP_APPLIED") {
            setBanner({ type: "info", message: sData.statusMessage });
          } else if (sData.status === "CAPACITY_EXCEEDED") {
            setBanner({ type: "error", message: sData.statusMessage });
          }
        }
      }
    },
    []
  );

  const loadScheduleData = useCallback(
    async (withAutoSolve = true) => {
      if (authStatus !== "authenticated") return;
      if (withAutoSolve) {
        setSolving(true);
      }

      try {
        const responses = await fetchScheduleBundle(withAutoSolve);
        await applyScheduleResponses(responses);
      } catch {
        setBanner({
          type: "error",
          message: "Network error while loading weekly schedule.",
        });
      } finally {
        setLoading(false);
        setSolving(false);
      }
    },
    [authStatus, fetchScheduleBundle, applyScheduleResponses]
  );

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const responses = await fetchScheduleBundle(false);
        if (!cancelled) {
          await applyScheduleResponses(responses);
        }
      } catch {
        if (!cancelled) {
          setBanner({
            type: "error",
            message: "Network error while loading weekly schedule.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, fetchScheduleBundle, applyScheduleResponses]);

  const handlePrevWeek = () => setMondayDate((m) => addDaysLocal(m, -7));
  const handleNextWeek = () => setMondayDate((m) => addDaysLocal(m, 7));
  const handleToday = () => setMondayDate(getMondayOfWeek(new Date()));

  const handleTogglePinAllocation = async (
    allocationId: string,
    nextPinned: boolean
  ) => {
    setBanner(null);
    const res = await fetch("/api/schedule/allocations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: allocationId,
        isPinned: nextPinned,
        targetUserId: selectedUserId,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setBanner({
        type: "error",
        message: data?.error || "Failed to update pin status.",
      });
      return;
    }
    await loadScheduleData(true);
  };

  const handleDropSchedulePayload = async (
    payload: ScheduleDragPayload,
    dateString: string,
    startMinute: number,
    zoneId: string
  ) => {
    setBanner(null);
    const totalSpan =
      Math.max(5, payload.durationMins || 30) + (payload.setupMins || 0);
    const endMinute = Math.min(1440, startMinute + totalSpan);

    if (payload.kind === "allocation" && payload.allocationId) {
      const patchRes = await fetch("/api/schedule/allocations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: payload.allocationId,
          dateString,
          startMinute,
          endMinute,
          zoneId,
          isPinned: true,
          targetUserId: selectedUserId,
        }),
      });
      if (patchRes.ok) {
        await loadScheduleData(true);
        return;
      }
    }

    const postRes = await fetch("/api/schedule/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replaceAllocationId: payload.allocationId,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
        dateString,
        startMinute,
        endMinute,
        setupMinsUsed: payload.setupMins || 0,
        zoneId,
        isPinned: true,
        originalTargetDate: payload.targetDate,
        targetUserId: selectedUserId,
      }),
    });
    if (!postRes.ok) {
      const data = await postRes.json();
      setBanner({
        type: "error",
        message: data?.error || "Failed to pin dragged task.",
      });
      return;
    }
    await loadScheduleData(true);
  };

  const handleCompleteAllocation = async (alloc: SolvedAllocation) => {
    setBanner(null);
    let res: Response;

    if (alloc.sourceType === "workflow_task") {
      res = await fetch("/api/tracker/task-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_item_id: alloc.contentItemId,
          item_id: alloc.contentItemId,
          task_name: alloc.taskName,
          status: "done",
        }),
      });
    } else if (alloc.sourceType === "misc_task") {
      res = await fetch("/api/tracker/misc-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_item_id: alloc.contentItemId,
          item_id: alloc.contentItemId,
          task_name: alloc.taskName,
          is_done: true,
        }),
      });
    } else if (alloc.sourceType === "action_item") {
      const toggleId = alloc.sourceId.split("::action::")[1] || "";
      res = await fetch("/api/tracker/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: alloc.contentItemId,
          toggle_id: toggleId,
        }),
      });
    } else {
      res = await fetch("/api/schedule/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alloc.sourceId,
          status: "done",
          targetUserId: selectedUserId,
        }),
      });
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBanner({
        type: "error",
        message: data?.error || "Could not mark task complete.",
      });
      return;
    }

    setBanner({
      type: "success",
      message: `Completed "${alloc.taskName}" — removed from weekly workload.`,
    });
    await loadScheduleData(true);
  };

  const handleToggleHoliday = async (
    dateString: string,
    currentlyHoliday: boolean
  ) => {
    setBanner(null);
    if (currentlyHoliday) {
      setHolidayAutoPromptDate(null);
      await fetch(
        `/api/schedule/overrides?dateString=${encodeURIComponent(
          dateString
        )}&targetUserId=${encodeURIComponent(selectedUserId)}`,
        { method: "DELETE" }
      );
    } else {
      await fetch("/api/schedule/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateString,
          isHoliday: true,
          holidayLabel: "Holiday / Day Off",
          targetUserId: selectedUserId,
        }),
      });
      setHolidayAutoPromptDate(dateString);
    }
    await loadScheduleData(true);
  };

  const handleToggleTodoDone = async (todo: PersonalTodoItem) => {
    const nextStatus = todo.status === "done" ? "pending" : "done";
    await fetch("/api/schedule/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: todo.id,
        status: nextStatus,
        targetUserId: selectedUserId,
      }),
    });
    await loadScheduleData(true);
  };

  const handleDeleteTodo = async (todoId: string) => {
    await fetch(
      `/api/schedule/todos?id=${encodeURIComponent(
        todoId
      )}&targetUserId=${encodeURIComponent(selectedUserId)}`,
      { method: "DELETE" }
    );
    await loadScheduleData(true);
  };

  const activeUserLabel =
    selectedUserId === "creator"
      ? "Creator"
      : teamRoles.find((r) => r.id === selectedUserId)?.name ||
        session?.user?.name ||
        "Team Member";

  return (
    <div className="h-[calc(100dvh-65px)] overflow-hidden flex flex-col">
      {/* Top Command Bar */}
      <div className="glass-nav px-4 py-2.5 border-b border-border/50 shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Week Navigator */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center glass-subtle rounded-xl p-0.5 border border-border/40">
            <button
              type="button"
              onClick={handlePrevWeek}
              title="Previous Week"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Today
            </button>
            <span className="px-2.5 py-1 text-xs font-semibold text-foreground border-x border-border/40">
              {viewMode === "gantt" && ganttWeeks > 1
                ? `${formatWeekRangeLabel(mondayDate).split(" – ")[0]} – ${formatWeekRangeLabel(
                    addDaysLocal(mondayDate, (ganttWeeks - 1) * 7)
                  ).split(" – ")[1]}`
                : formatWeekRangeLabel(mondayDate)}
            </span>
            <button
              type="button"
              onClick={handleNextWeek}
              title="Next Week"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* User / Role Filter */}
          {isCreator ? (
            <div className="inline-flex items-center gap-1.5 glass-subtle rounded-xl px-2.5 py-1.5 border border-border/40">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={selectedUserId}
                onChange={(e) => setUserOverrideId(e.target.value)}
                aria-label="Filter schedule by user"
                className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer"
              >
                <option value="creator" className="bg-background text-foreground">
                  Creator (My Schedule)
                </option>
                {teamRoles.map((role) => (
                  <option
                    key={role.id}
                    value={role.id}
                    className="bg-background text-foreground"
                  >
                    {role.name} · {role.role_title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 glass-subtle rounded-xl px-2.5 py-1.5 border border-border/40 text-xs font-medium text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{activeUserLabel}</span>
            </div>
          )}
        </div>

        {/* Center: View Switcher */}
        <div className="inline-flex items-center glass-subtle rounded-xl p-0.5 border border-border/40">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "calendar"
                ? "bg-primary/15 text-primary border border-primary/35 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendar View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("gantt")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "gantt"
                ? "bg-primary/15 text-primary border border-primary/35 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GanttChart className="w-3.5 h-3.5" />
            Gantt View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("template")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === "template"
                ? "bg-primary/15 text-primary border border-primary/35 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            Weekly Zone Template
          </button>
        </div>

        {/* Right: Primary Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setVacationInitRange({});
              setVacationModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
          >
            <Plane className="w-3.5 h-3.5" />
            Plan Vacation / Holiday
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTodo(null);
              setTodoModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-subtle border border-border/50 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Personal To-Do
          </button>

          <button
            type="button"
            disabled={solving}
            onClick={() => loadScheduleData(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-all shadow-sm"
          >
            {solving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {solving ? "Solving..." : "Auto-Solve"}
          </button>
        </div>
      </div>

      {/* Auto-Prompt when user marks a new Holiday on Calendar */}
      {holidayAutoPromptDate && (
        <div className="px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 border-b bg-amber-500/15 border-amber-500/35 text-amber-200">
          <span className="flex items-center gap-2">
            <Plane className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>{holidayAutoPromptDate}</strong> marked as 0m Holiday. Want to run the 4-Model Engine to pre-schedule impacted tasks?
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setVacationInitRange({
                  start: holidayAutoPromptDate,
                  end: holidayAutoPromptDate,
                });
                setVacationModalOpen(true);
                setHolidayAutoPromptDate(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
            >
              <Plane className="w-3 h-3" />
              Open 4-Model Planner
            </button>
            <button
              type="button"
              onClick={() => setHolidayAutoPromptDate(null)}
              className="p-1 rounded hover:bg-white/10"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Non-blocking Diagnostic / Action Feedback Strip */}
      {banner && (
        <div
          className={`px-4 py-1.5 text-xs flex items-center justify-between gap-2 shrink-0 border-b ${
            banner.type === "error"
              ? "bg-rose-500/12 border-rose-500/30 text-rose-300"
              : banner.type === "success"
              ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-300"
              : "bg-sky-500/12 border-sky-500/30 text-sky-300"
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            {banner.type === "error" ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{banner.message}</span>
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-0.5 rounded hover:bg-white/10 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <WorkloadSidebar
          solveResult={solveResult}
          zones={zones}
          personalTodos={personalTodos}
          onToggleTodoDone={handleToggleTodoDone}
          onEditTodo={(todo) => {
            setEditingTodo(todo);
            setTodoModalOpen(true);
          }}
          onDeleteTodo={handleDeleteTodo}
          onAddTodoClick={() => {
            setEditingTodo(null);
            setTodoModalOpen(true);
          }}
          onTogglePinAllocation={handleTogglePinAllocation}
        />

        {loading && !solveResult ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading PWS calendar &amp; live tasks...</span>
          </div>
        ) : viewMode === "calendar" ? (
          <LiveCalendarGrid
            mondayDate={mondayDate}
            zones={zones}
            weeklySlots={weeklySlots}
            dayBounds={dayBounds}
            overrides={overrides}
            allocations={solveResult?.allocations || []}
            targetUserId={selectedUserId}
            onTogglePinAllocation={handleTogglePinAllocation}
            onCompleteAllocation={handleCompleteAllocation}
            onDropSchedulePayload={handleDropSchedulePayload}
            onToggleHoliday={handleToggleHoliday}
          />
        ) : viewMode === "gantt" ? (
          <GanttTimelineView
            mondayDate={mondayDate}
            numWeeks={ganttWeeks}
            onNumWeeksChange={setGanttWeeks}
            zones={zones}
            weeklySlots={weeklySlots}
            dayBounds={dayBounds}
            overrides={overrides}
            allocations={solveResult?.allocations || []}
            unplacedTasks={solveResult?.unplacedTasks || []}
            completedTasks={solveResult?.completedTasks || []}
            onTogglePinAllocation={handleTogglePinAllocation}
            onCompleteAllocation={handleCompleteAllocation}
          />
        ) : (
          <ZoneTemplateDesigner
            zones={zones}
            slots={weeklySlots}
            dayBounds={dayBounds}
            targetUserId={selectedUserId}
            onRefresh={() => loadScheduleData(true)}
          />
        )}
      </div>

      {/* Add / Edit Personal To-Do Modal */}
      <PersonalTodoModal
        open={todoModalOpen}
        onClose={() => {
          setTodoModalOpen(false);
          setEditingTodo(null);
        }}
        zones={zones}
        targetUserId={selectedUserId}
        defaultDate={mondayDate}
        editingTodo={editingTodo}
        onSaved={() => loadScheduleData(true)}
      />

      {/* Phase 4 Vacation / Holiday 4-Model Simulator & Comparator Modal */}
      <VacationPlannerModal
        open={vacationModalOpen}
        onClose={() => setVacationModalOpen(false)}
        isCreator={isCreator}
        defaultUserId={selectedUserId}
        teamRoles={teamRoles}
        initialStartDate={vacationInitRange.start}
        initialEndDate={vacationInitRange.end}
        onApplied={async (appliedUserId) => {
          if (appliedUserId !== selectedUserId) {
            setUserOverrideId(appliedUserId);
          }
          setBanner({
            type: "success",
            message:
              "Vacation model applied & advance blocks pinned! Look for the amber ✈️ Advance for Vacation badges.",
          });
          await loadScheduleData(true);
        }}
      />
    </div>
  );
}
