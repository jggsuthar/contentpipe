"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Pencil,
  Pin,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import {
  DbScheduleZone,
  PersonalTodoItem,
  RESISTANCE_BADGES,
  ScheduleDragPayload,
  SolveApiResponse,
  formatMinsAsHours,
  formatMinsCompact,
  formatMinuteTo12h,
} from "./schedule-types";
import { ZoneIcon } from "./zone-icon";

type SidebarTab = "scheduled" | "unplaced" | "todos" | "done";

interface WorkloadSidebarProps {
  solveResult: SolveApiResponse | null;
  zones: DbScheduleZone[];
  personalTodos: PersonalTodoItem[];
  onToggleTodoDone: (todo: PersonalTodoItem) => Promise<void> | void;
  onEditTodo: (todo: PersonalTodoItem) => void;
  onDeleteTodo: (todoId: string) => Promise<void> | void;
  onAddTodoClick: () => void;
  onTogglePinAllocation: (allocationId: string, nextPinned: boolean) => Promise<void> | void;
}

export function WorkloadSidebar({
  solveResult,
  zones,
  personalTodos,
  onToggleTodoDone,
  onEditTodo,
  onDeleteTodo,
  onAddTodoClick,
  onTogglePinAllocation,
}: WorkloadSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("scheduled");

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const totalScheduledMins = solveResult?.totalScheduledMins ?? 0;
  const totalAvailableMins = solveResult?.totalAvailableMins ?? 0;
  const utilizationPct =
    totalAvailableMins > 0
      ? Math.min(100, Math.round((totalScheduledMins / totalAvailableMins) * 100))
      : 0;

  const batchingSavedMins = solveResult?.batchingSavedMins ?? 0;
  const completedTasks = solveResult?.completedTasks ?? [];
  const completedExcludedMins = solveResult?.completedExcludedMins ?? 0;
  const unplacedTasks = solveResult?.unplacedTasks ?? [];
  const allocations = solveResult?.allocations ?? [];
  const zoneUtilization = solveResult?.zoneUtilization ?? [];

  const handleDragStart = (
    e: React.DragEvent,
    payload: ScheduleDragPayload
  ) => {
    e.dataTransfer.setData("application/x-contentpipe-task", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.taskName);
    e.dataTransfer.effectAllowed = "move";
  };

  if (collapsed) {
    return (
      <aside className="h-full w-11 shrink-0 glass-card border-r border-border/50 rounded-none flex flex-col items-center py-3 gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand Workload & Task Rail"
          className="p-2 rounded-xl glass-subtle hover:bg-muted/60 text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div
          className="flex flex-col items-center gap-1 text-[10px] font-semibold text-muted-foreground"
          title={`${utilizationPct}% weekly utilization`}
        >
          <span className="text-foreground">{utilizationPct}%</span>
          <div className="w-1.5 h-20 rounded-full bg-muted/50 overflow-hidden flex flex-col justify-end">
            <div
              className={`w-full rounded-full transition-all ${
                utilizationPct >= 95
                  ? "bg-rose-500"
                  : utilizationPct >= 80
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{ height: `${utilizationPct}%` }}
            />
          </div>
        </div>

        {unplacedTasks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              setActiveTab("unplaced");
            }}
            title={`${unplacedTasks.length} unplaced overflow task(s)`}
            className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center text-[11px] font-bold"
          >
            {unplacedTasks.length}
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="h-full w-80 shrink-0 glass-card border-r border-border/50 rounded-none flex flex-col overflow-hidden">
      {/* Rail Header */}
      <div className="px-3.5 py-2.5 border-b border-border/40 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-semibold tracking-tight text-foreground">
            Weekly Workload HUD
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {solveResult?.solveDurationMs !== undefined
              ? `Solved in ${solveResult.solveDurationMs}ms`
              : "Live PWS engine"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* HUD Summary Card */}
      <div className="px-3.5 py-3 border-b border-border/40 space-y-2.5 shrink-0">
        <div>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="font-medium text-foreground">
              {formatMinsAsHours(totalScheduledMins)}{" "}
              <span className="text-muted-foreground font-normal">
                / {formatMinsAsHours(totalAvailableMins)} cap
              </span>
            </span>
            <span
              className={`font-semibold tabular-nums ${
                utilizationPct >= 95
                  ? "text-rose-400"
                  : utilizationPct >= 85
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {utilizationPct}% Used
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                utilizationPct >= 95
                  ? "bg-rose-500"
                  : utilizationPct >= 85
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
        </div>

        {/* Per-Zone Capacity Mini Bars */}
        <div className="space-y-1.5">
          {zoneUtilization.map((zu) => {
            const pct = Math.min(100, Math.round(zu.utilizationPercent));
            const isHot = zu.isBottleneck || zu.utilizationPercent >= 90;
            const zone = zoneById.get(zu.zoneId);
            return (
              <div key={zu.zoneId} className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5 font-medium text-foreground truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: zu.zoneColor }}
                    />
                    <ZoneIcon icon={zone?.icon} className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{zu.zoneName}</span>
                    {isHot && (
                      <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-400 font-semibold text-[9px]">
                        HOT
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatMinsCompact(zu.allocatedMinutes)}/{formatMinsCompact(zu.availableMinutes)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isHot ? "#f43f5e" : zu.zoneColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Batching Savings + Done Excluded Pills */}
        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 text-[11px] font-medium">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>{batchingSavedMins}m saved via PWS batching</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 text-[11px] font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>
              {completedTasks.length} tasks ({formatMinsAsHours(completedExcludedMins)}) done in /index &amp; excluded from load
            </span>
          </div>
        </div>

        {unplacedTasks.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("unplaced")}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400 text-[11px] font-semibold hover:bg-rose-500/20 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {unplacedTasks.length} Unplaced Overflow Task(s)
            </span>
            <span className="text-[10px] underline">Inspect</span>
          </button>
        )}
      </div>

      {/* Queue Filter Tabs */}
      <div className="px-2.5 pt-2 pb-1.5 border-b border-border/40 grid grid-cols-4 gap-1 shrink-0">
        {(
          [
            { id: "scheduled", label: "Placed", count: allocations.length },
            { id: "unplaced", label: "Overflow", count: unplacedTasks.length, alert: unplacedTasks.length > 0 },
            { id: "todos", label: "To-Dos", count: personalTodos.filter((t) => t.status !== "done").length },
            { id: "done", label: "Done", count: completedTasks.length },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors flex flex-col items-center leading-tight ${
                active
                  ? "bg-primary/15 text-primary border border-primary/35"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              }`}
            >
              <span className="flex items-center gap-1">
                {tab.label}
                {"alert" in tab && tab.alert && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                )}
              </span>
              <span className="text-[9px] opacity-75">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Queue Content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {activeTab === "scheduled" && (
          <>
            {allocations.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-6">
                No tasks placed in this week yet.
              </p>
            ) : (
              allocations.map((alloc) => {
                const zone = zoneById.get(alloc.zoneId);
                const payload: ScheduleDragPayload = {
                  kind: "allocation",
                  allocationId: alloc.id,
                  sourceType: alloc.sourceType,
                  sourceId: alloc.sourceId,
                  title: alloc.title,
                  taskName: alloc.taskName,
                  durationMins: alloc.durationMins,
                  setupMins: alloc.setupMinsUsed,
                  targetDate: alloc.targetDate,
                  eligibleZoneIds: alloc.eligibleZoneIds || [],
                };
                return (
                  <div
                    key={alloc.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, payload)}
                    className="glass-subtle rounded-xl p-2.5 border border-border/40 hover:border-border/80 cursor-grab active:cursor-grabbing transition-all space-y-1"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <GripVertical className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                          {alloc.uniqueContentId ? (
                            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold">
                              {alloc.uniqueContentId}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground text-[9px] font-semibold uppercase">
                              {alloc.sourceType.replace("_", " ")}
                            </span>
                          )}
                          {zone && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{
                                backgroundColor: `${zone.color}20`,
                                color: zone.color,
                              }}
                            >
                              {zone.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-foreground truncate mt-1">
                          {alloc.taskName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {alloc.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTogglePinAllocation(alloc.id, !alloc.isPinned)}
                        title={alloc.isPinned ? "Unpin allocation" : "Pin to this slot"}
                        className={`p-1 rounded-lg transition-colors shrink-0 ${
                          alloc.isPinned
                            ? "bg-amber-500/20 text-amber-400"
                            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {alloc.dateString} · {formatMinuteTo12h(alloc.startMinute)}–
                        {formatMinuteTo12h(alloc.endMinute)}
                      </span>
                      <span className="font-medium text-foreground">
                        {alloc.durationMins}m
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === "unplaced" && (
          <>
            {unplacedTasks.length === 0 ? (
              <div className="text-center py-6 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-xs font-medium text-foreground">Zero overflow!</p>
                <p className="text-[10px] text-muted-foreground">
                  Every active task fits within your weekly zones.
                </p>
              </div>
            ) : (
              unplacedTasks.map((task) => {
                const payload: ScheduleDragPayload = {
                  kind: "unplaced",
                  sourceType: task.sourceType,
                  sourceId: task.sourceId,
                  title: task.title,
                  taskName: task.taskName,
                  durationMins: task.missingMinutes,
                  setupMins: task.setupBufferMins ?? 0,
                  targetDate: task.targetDate,
                  eligibleZoneIds: task.eligibleZoneIds,
                };
                const resBadge = task.resistance
                  ? RESISTANCE_BADGES[task.resistance]
                  : null;
                return (
                  <div
                    key={`${task.sourceType}:${task.sourceId}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, payload)}
                    className="rounded-xl p-2.5 bg-rose-500/10 border border-rose-500/30 hover:border-rose-500/60 cursor-grab active:cursor-grabbing space-y-1.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <GripVertical className="w-3 h-3 text-rose-400 shrink-0" />
                          {task.uniqueContentId && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold">
                              {task.uniqueContentId}
                            </span>
                          )}
                          {resBadge && (
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[9px] font-medium ${resBadge.badgeClass}`}
                            >
                              {resBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-foreground truncate mt-1">
                          {task.taskName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {task.title}
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold shrink-0">
                        {task.missingMinutes}m
                      </span>
                    </div>
                    <p className="text-[10px] text-rose-300/90 leading-snug">
                      {task.reason}
                    </p>
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>
                        {task.targetDate ? `Due ${task.targetDate}` : "No deadline"}
                      </span>
                      <span className="flex items-center gap-1">
                        {task.eligibleZoneIds.map((zId) => {
                          const z = zoneById.get(zId);
                          return (
                            <span
                              key={zId}
                              title={z?.name || zId}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: z?.color || "#94a3b8" }}
                            />
                          );
                        })}
                        <span>Drag onto calendar</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === "todos" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onAddTodoClick}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/35 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Personal To-Do
            </button>

            {personalTodos.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                No personal to-dos yet.
              </p>
            ) : (
              personalTodos.map((todo) => {
                const isDone = todo.status === "done";
                const payload: ScheduleDragPayload = {
                  kind: "todo",
                  sourceType: "personal_todo",
                  sourceId: todo.id,
                  title: "Personal To-Do",
                  taskName: todo.title,
                  durationMins: todo.durationMins,
                  setupMins: todo.setupBufferMins,
                  targetDate: todo.targetDate,
                  eligibleZoneIds: todo.eligibleZoneIds || [],
                };
                return (
                  <div
                    key={todo.id}
                    draggable={!isDone}
                    onDragStart={(e) => !isDone && handleDragStart(e, payload)}
                    className={`glass-subtle rounded-xl p-2.5 border border-border/40 space-y-1.5 transition-opacity ${
                      isDone ? "opacity-55" : "cursor-grab active:cursor-grabbing"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleTodoDone(todo)}
                        title={isDone ? "Mark pending" : "Mark done"}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isDone
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-muted-foreground/50 hover:border-primary"
                        }`}
                      >
                        {isDone && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[11px] font-semibold truncate ${
                            isDone ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {todo.title}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span>{todo.durationMins}m</span>
                          {todo.targetDate && <span>· Due {todo.targetDate}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditTodo(todo)}
                          className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTodo(todo.id)}
                          className="p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "done" && (
          <>
            {completedTasks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-6">
                No completed tasks excluded in this horizon yet.
              </p>
            ) : (
              completedTasks.map((task) => (
                <div
                  key={`${task.sourceType}:${task.sourceId}`}
                  className="glass-subtle rounded-xl p-2.5 border border-emerald-500/25 bg-emerald-500/5 space-y-0.5 opacity-80"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {task.uniqueContentId || task.sourceType.replace("_", " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      0m load (was {task.durationMins}m)
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-foreground line-through truncate">
                    {task.taskName}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {task.title}
                  </p>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
}
