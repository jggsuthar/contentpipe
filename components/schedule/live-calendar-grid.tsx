"use client";

import { useState } from "react";
import {
  CalendarOff,
  Check,
  Clock,
  Lock,
  Palmtree,
  Pin,
  Plane,
  Sparkles,
  Unlock,
  Zap,
} from "lucide-react";
import {
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  OPEN_WORKDAY_ZONE_ID,
  ScheduleDragPayload,
  ScheduleOverrideItem,
  SolvedAllocation,
  formatDayColumnHeader,
  formatLocalDateStr,
  formatMinuteTo12h,
  getDayIndexMon0,
  getWeekDates,
  hexToRgba,
} from "./schedule-types";
import { ZoneIcon } from "./zone-icon";

interface LiveCalendarGridProps {
  mondayDate: string;
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds: DbWeeklyDayBounds[];
  overrides: ScheduleOverrideItem[];
  allocations: SolvedAllocation[];
  targetUserId: string;
  onTogglePinAllocation: (
    allocationId: string,
    nextPinned: boolean
  ) => Promise<void> | void;
  onCompleteAllocation: (alloc: SolvedAllocation) => Promise<void> | void;
  onDropSchedulePayload: (
    payload: ScheduleDragPayload,
    dateString: string,
    startMinute: number,
    zoneId: string
  ) => Promise<void> | void;
  onToggleHoliday: (dateString: string, currentlyHoliday: boolean) => Promise<void> | void;
}

const START_HOUR = 6;
const END_HOUR = 24;
const MIN_MINUTE = START_HOUR * 60; // 360
const MAX_MINUTE = END_HOUR * 60; // 1440
const TOTAL_GRID_MINS = MAX_MINUTE - MIN_MINUTE; // 1080
const ROW_PX_PER_HOUR = 108; // 18h * 108px = 1944px; 15m = 27px, 30m = 54px, 60m = 108px
const SNAP_DROP_MINS = 15;
const MIN_CARD_VISUAL_MINS = 15;

interface LanePlacement {
  alloc: SolvedAllocation;
  clampedStart: number;
  clampedEnd: number;
  lane: number;
  laneCount: number;
}

function computeDayCardLanes(dayAllocs: SolvedAllocation[]): LanePlacement[] {
  const valid = dayAllocs
    .map((alloc) => ({
      alloc,
      clampedStart: Math.max(MIN_MINUTE, alloc.startMinute),
      clampedEnd: Math.min(MAX_MINUTE, alloc.endMinute),
    }))
    .filter((item) => item.clampedEnd > item.clampedStart)
    .sort((a, b) =>
      a.clampedStart !== b.clampedStart
        ? a.clampedStart - b.clampedStart
        : a.clampedEnd - b.clampedEnd
    );

  if (valid.length === 0) return [];

  // Connected overlap components based on visual end (at least MIN_CARD_VISUAL_MINS)
  const result: LanePlacement[] = [];
  let clusterStart = 0;

  while (clusterStart < valid.length) {
    let clusterEnd = clusterStart + 1;
    let maxVisualEnd = Math.max(
      valid[clusterStart].clampedEnd,
      valid[clusterStart].clampedStart + MIN_CARD_VISUAL_MINS
    );

    while (clusterEnd < valid.length) {
      const next = valid[clusterEnd];
      if (next.clampedStart < maxVisualEnd) {
        maxVisualEnd = Math.max(
          maxVisualEnd,
          Math.max(next.clampedEnd, next.clampedStart + MIN_CARD_VISUAL_MINS)
        );
        clusterEnd++;
      } else {
        break;
      }
    }

    const cluster = valid.slice(clusterStart, clusterEnd);
    const laneVisualEnds: number[] = [];
    const assigned: { item: (typeof valid)[number]; lane: number }[] = [];

    for (const item of cluster) {
      const visEnd = Math.max(
        item.clampedEnd,
        item.clampedStart + MIN_CARD_VISUAL_MINS
      );
      let chosenLane = laneVisualEnds.findIndex(
        (endMin) => endMin <= item.clampedStart
      );
      if (chosenLane === -1) {
        chosenLane = laneVisualEnds.length;
        laneVisualEnds.push(visEnd);
      } else {
        laneVisualEnds[chosenLane] = visEnd;
      }
      assigned.push({ item, lane: chosenLane });
    }

    const laneCount = Math.max(1, laneVisualEnds.length);
    for (const { item, lane } of assigned) {
      result.push({
        alloc: item.alloc,
        clampedStart: item.clampedStart,
        clampedEnd: item.clampedEnd,
        lane,
        laneCount,
      });
    }

    clusterStart = clusterEnd;
  }

  return result;
}

interface ProjectedDayZone {
  id: string;
  zoneId: string;
  startMinute: number;
  endMinute: number;
}

export function LiveCalendarGrid({
  mondayDate,
  zones,
  weeklySlots,
  dayBounds,
  overrides,
  allocations,
  onTogglePinAllocation,
  onCompleteAllocation,
  onDropSchedulePayload,
  onToggleHoliday,
}: LiveCalendarGridProps) {
  const [dropPreview, setDropPreview] = useState<{
    dateString: string;
    startMinute: number;
    endMinute: number;
    zoneId: string;
    blocked: boolean;
    blockReason?: string;
  } | null>(null);
  const [draggingPayload, setDraggingPayload] =
    useState<ScheduleDragPayload | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const weekDates = getWeekDates(mondayDate);
  const todayStr = formatLocalDateStr(new Date());
  const effectiveZones =
    zones.length > 0
      ? zones
      : [
          {
            id: OPEN_WORKDAY_ZONE_ID,
            userId: "creator",
            name: "Whole Working Day",
            color: "#6366f1",
            icon: "Briefcase",
            orderIndex: 0,
          },
        ];
  const zoneById = new Map(effectiveZones.map((z) => [z.id, z]));
  const overrideByDate = new Map(overrides.map((o) => [o.dateString, o]));
  const boundsByDay = new Map(dayBounds.map((b) => [b.dayOfWeek, b]));
  const hourTicks = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i
  );

  const getDayWorkBounds = (dateStr: string) => {
    const dow = getDayIndexMon0(dateStr);
    const b = boundsByDay.get(dow);
    return {
      workStartMinute: b?.workStartMinute ?? DEFAULT_WORK_START_MINUTE,
      workEndMinute: b?.workEndMinute ?? DEFAULT_WORK_END_MINUTE,
    };
  };

  const getProjectedDayZones = (dateStr: string): ProjectedDayZone[] => {
    const ov = overrideByDate.get(dateStr);
    if (ov?.isHoliday) return [];
    const { workStartMinute, workEndMinute } = getDayWorkBounds(dateStr);
    if (workEndMinute <= workStartMinute) return [];

    if (ov?.customSlots && Array.isArray(ov.customSlots)) {
      return ov.customSlots
        .map((cs, idx) => ({
          id: `${dateStr}-ov-${idx}`,
          zoneId: zones.length === 0 ? OPEN_WORKDAY_ZONE_ID : cs.zoneId,
          startMinute: Math.max(workStartMinute, cs.startMinute),
          endMinute: Math.min(workEndMinute, cs.endMinute),
        }))
        .filter((dz) => dz.endMinute > dz.startMinute);
    }

    if (zones.length === 0) {
      return [
        {
          id: `${dateStr}-open-workday`,
          zoneId: OPEN_WORKDAY_ZONE_ID,
          startMinute: workStartMinute,
          endMinute: workEndMinute,
        },
      ];
    }

    const dow = getDayIndexMon0(dateStr);
    return weeklySlots
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => ({
        id: s.id,
        zoneId: s.zoneId,
        startMinute: Math.max(workStartMinute, s.startMinute),
        endMinute: Math.min(workEndMinute, s.endMinute),
      }))
      .filter((dz) => dz.endMinute > dz.startMinute);
  };

  const resolveDropMinuteAndZone = (
    dateStr: string,
    clientY: number,
    rect: DOMRect,
    spanMins: number
  ): {
    startMinute: number;
    endMinute: number;
    zoneId: string;
    blocked: boolean;
    blockReason?: string;
  } => {
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const rawMin = MIN_MINUTE + ratio * TOTAL_GRID_MINS;
    const snapped =
      Math.round(rawMin / SNAP_DROP_MINS) * SNAP_DROP_MINS;
    const startMinute = Math.max(
      MIN_MINUTE,
      Math.min(MAX_MINUTE - Math.max(5, spanMins), snapped)
    );
    const endMinute = Math.min(MAX_MINUTE, startMinute + Math.max(5, spanMins));

    const ov = overrideByDate.get(dateStr);
    if (ov?.isHoliday) {
      return {
        startMinute,
        endMinute,
        zoneId: "",
        blocked: true,
        blockReason: "Holiday / Vacation day",
      };
    }

    const { workStartMinute, workEndMinute } = getDayWorkBounds(dateStr);
    if (startMinute < workStartMinute || endMinute > workEndMinute) {
      return {
        startMinute,
        endMinute,
        zoneId: "",
        blocked: true,
        blockReason: "No-Work Zone",
      };
    }

    const dayZones = getProjectedDayZones(dateStr);
    const hitZone = dayZones.find(
      (dz) => startMinute >= dz.startMinute && endMinute <= dz.endMinute
    );

    if (!hitZone) {
      const partialHit = dayZones.find(
        (dz) => startMinute >= dz.startMinute && startMinute < dz.endMinute
      );
      return {
        startMinute,
        endMinute,
        zoneId: partialHit?.zoneId || "",
        blocked: true,
        blockReason: partialHit
          ? "Exceeds zone end time"
          : "Unassigned time (no zone)",
      };
    }

    return {
      startMinute,
      endMinute,
      zoneId: hitZone.zoneId,
      blocked: false,
    };
  };

  const parseDragPayload = (
    e: React.DragEvent
  ): ScheduleDragPayload | null => {
    try {
      const raw = e.dataTransfer.getData("application/x-contentpipe-task");
      if (raw) {
        return JSON.parse(raw) as ScheduleDragPayload;
      }
    } catch {
      // Fallback to state during dragOver where browsers restrict getData
    }
    return draggingPayload;
  };

  const handleCardDragStart = (
    e: React.DragEvent,
    alloc: SolvedAllocation
  ) => {
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
    setDraggingPayload(payload);
    e.dataTransfer.setData(
      "application/x-contentpipe-task",
      JSON.stringify(payload)
    );
    e.dataTransfer.setData("text/plain", alloc.taskName);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden p-3">
      <div className="flex-1 glass-card rounded-2xl border border-border/50 flex flex-col overflow-hidden min-h-0">
        {/* 7 Dated Day Headers */}
        <div className="grid grid-cols-[54px_repeat(7,minmax(0,1fr))] border-b border-border/40 shrink-0 bg-muted/20">
          <div className="px-2 py-2.5 text-[10px] font-semibold text-muted-foreground text-right border-r border-border/30 flex items-center justify-end">
            Hour
          </div>
          {weekDates.map((dateStr) => {
            const { weekday, monthDay } = formatDayColumnHeader(dateStr);
            const isToday = dateStr === todayStr;
            const ov = overrideByDate.get(dateStr);
            const isHoliday = Boolean(ov?.isHoliday);
            const dayZones = getProjectedDayZones(dateStr);
            const dayCapMins = dayZones.reduce(
              (sum, dz) => sum + (dz.endMinute - dz.startMinute),
              0
            );
            const dayAllocCount = allocations.filter(
              (a) => a.dateString === dateStr
            ).length;

            return (
              <div
                key={dateStr}
                className={`px-2 py-2 border-r last:border-r-0 border-border/30 flex items-center justify-between gap-1 ${
                  isHoliday
                    ? "bg-amber-500/10"
                    : isToday
                    ? "bg-primary/10"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[11px] font-semibold ${
                        isToday ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {weekday}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {monthDay}
                    </span>
                    {isToday && (
                      <span className="px-1 py-0.2 rounded bg-primary/20 text-primary text-[9px] font-bold">
                        Today
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {isHoliday
                      ? ov?.holidayLabel || "Holiday (0m)"
                      : `${Math.round((dayCapMins / 60) * 10) / 10}h cap · ${dayAllocCount} task${dayAllocCount === 1 ? "" : "s"}`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleHoliday(dateStr, isHoliday)}
                  title={
                    isHoliday
                      ? "Remove holiday override (restore template)"
                      : "Mark day as Holiday / Off (0m capacity)"
                  }
                  className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                    isHoliday
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                      : "border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {isHoliday ? (
                    <Palmtree className="w-3.5 h-3.5" />
                  ) : (
                    <CalendarOff className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Scrollable Time Grid Body */}
        <div className="flex-1 overflow-y-auto relative">
          <div
            className="grid grid-cols-[54px_repeat(7,minmax(0,1fr))] relative"
            style={{ height: `${(END_HOUR - START_HOUR) * ROW_PX_PER_HOUR}px` }}
          >
            {/* Left Hour Ruler */}
            <div className="relative border-r border-border/30 select-none">
              {hourTicks.map((hr) => {
                const topPct =
                  (((hr - START_HOUR) * 60) / TOTAL_GRID_MINS) * 100;
                return (
                  <div
                    key={hr}
                    className="absolute right-2 -translate-y-2 text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: `${topPct}%` }}
                  >
                    {formatMinuteTo12h(hr * 60)}
                  </div>
                );
              })}
            </div>

            {/* 7 Dated Day Columns */}
            {weekDates.map((dateStr) => {
              const ov = overrideByDate.get(dateStr);
              const isHoliday = Boolean(ov?.isHoliday);
              const dayZones = getProjectedDayZones(dateStr);
              const { workStartMinute, workEndMinute } = getDayWorkBounds(dateStr);
              const dayAllocs = allocations.filter(
                (a) => a.dateString === dateStr
              );

              const topNoWorkBottom = Math.min(MAX_MINUTE, Math.max(MIN_MINUTE, workStartMinute));
              const bottomNoWorkTop = Math.max(MIN_MINUTE, Math.min(MAX_MINUTE, workEndMinute));

              return (
                <div
                  key={dateStr}
                  className={`relative border-r last:border-r-0 border-border/30 ${
                    isHoliday ? "bg-amber-500/5" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const payload = parseDragPayload(e);
                    const duration = Math.max(5, payload?.durationMins || 60);
                    const setup = payload?.setupMins || 0;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const res = resolveDropMinuteAndZone(
                      dateStr,
                      e.clientY,
                      rect,
                      duration + setup
                    );
                    if (
                      !dropPreview ||
                      dropPreview.dateString !== dateStr ||
                      dropPreview.startMinute !== res.startMinute ||
                      dropPreview.zoneId !== res.zoneId ||
                      dropPreview.blocked !== res.blocked
                    ) {
                      setDropPreview({
                        dateString: dateStr,
                        startMinute: res.startMinute,
                        endMinute: res.endMinute,
                        zoneId: res.zoneId,
                        blocked: res.blocked,
                        blockReason: res.blockReason,
                      });
                    }
                  }}
                  onDragLeave={() => {
                    if (dropPreview?.dateString === dateStr) {
                      setDropPreview(null);
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const payload = parseDragPayload(e);
                    setDropPreview(null);
                    setDraggingPayload(null);
                    if (!payload) return;

                    const duration = Math.max(5, payload.durationMins || 30);
                    const setup = payload.setupMins || 0;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const res = resolveDropMinuteAndZone(
                      dateStr,
                      e.clientY,
                      rect,
                      duration + setup
                    );
                    if (res.blocked || !res.zoneId) return;

                    await onDropSchedulePayload(
                      payload,
                      dateStr,
                      res.startMinute,
                      res.zoneId
                    );
                  }}
                >
                  {/* Top Gray NO WORK ZONE */}
                  {!isHoliday && topNoWorkBottom > MIN_MINUTE && (
                    <div
                      className="absolute inset-x-0 border-b border-zinc-400/40 pointer-events-none flex flex-col items-center justify-center text-center px-1 overflow-hidden"
                      style={{
                        top: "0%",
                        height: `${((topNoWorkBottom - MIN_MINUTE) / TOTAL_GRID_MINS) * 100}%`,
                        background:
                          "repeating-linear-gradient(-45deg, rgba(113,113,122,0.16), rgba(113,113,122,0.16) 6px, rgba(82,82,91,0.24) 6px, rgba(82,82,91,0.24) 12px)",
                      }}
                    >
                      <div className="bg-zinc-900/90 text-zinc-100 border border-zinc-500/60 rounded-md px-2 py-0.5 shadow-sm flex flex-col items-center">
                        <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-100">
                          NO WORK ZONE
                        </span>
                        <span className="text-[8px] text-zinc-300 tabular-nums">
                          Until {formatMinuteTo12h(workStartMinute)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Bottom Gray NO WORK ZONE */}
                  {!isHoliday && bottomNoWorkTop < MAX_MINUTE && (
                    <div
                      className="absolute inset-x-0 border-t border-zinc-400/40 pointer-events-none flex flex-col items-center justify-center text-center px-1 overflow-hidden"
                      style={{
                        top: `${((bottomNoWorkTop - MIN_MINUTE) / TOTAL_GRID_MINS) * 100}%`,
                        height: `${((MAX_MINUTE - bottomNoWorkTop) / TOTAL_GRID_MINS) * 100}%`,
                        background:
                          "repeating-linear-gradient(-45deg, rgba(113,113,122,0.16), rgba(113,113,122,0.16) 6px, rgba(82,82,91,0.24) 6px, rgba(82,82,91,0.24) 12px)",
                      }}
                    >
                      <div className="bg-zinc-900/90 text-zinc-100 border border-zinc-500/60 rounded-md px-2 py-0.5 shadow-sm flex flex-col items-center">
                        <span className="text-[9px] font-bold tracking-wider uppercase text-zinc-100">
                          NO WORK ZONE
                        </span>
                        <span className="text-[8px] text-zinc-300 tabular-nums">
                          After {formatMinuteTo12h(workEndMinute)}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Hour Hairlines */}
                  {hourTicks.map((hr) => {
                    const topPct =
                      (((hr - START_HOUR) * 60) / TOTAL_GRID_MINS) * 100;
                    return (
                      <div
                        key={hr}
                        className="absolute inset-x-0 border-t border-border/20 pointer-events-none"
                        style={{ top: `${topPct}%` }}
                      />
                    );
                  })}

                  {/* Holiday Watermark Overlay */}
                  {isHoliday && (
                    <div className="absolute inset-2 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/10 backdrop-blur-xs flex flex-col items-center justify-center text-center p-3 pointer-events-none">
                      <Palmtree className="w-6 h-6 text-amber-400/80 mb-1" />
                      <span className="text-xs font-semibold text-amber-300">
                        {ov?.holidayLabel || "Vacation / Holiday"}
                      </span>
                      <span className="text-[10px] text-amber-200/80 mt-0.5 font-medium">
                        0m Available Capacity
                      </span>
                    </div>
                  )}

                  {/* Frosted Zone Background Regions */}
                  {dayZones.map((dz) => {
                    const zone = zoneById.get(dz.zoneId);
                    const clampedStart = Math.max(MIN_MINUTE, dz.startMinute);
                    const clampedEnd = Math.min(MAX_MINUTE, dz.endMinute);
                    if (clampedEnd <= clampedStart) return null;

                    const topPct =
                      ((clampedStart - MIN_MINUTE) / TOTAL_GRID_MINS) * 100;
                    const heightPct =
                      ((clampedEnd - clampedStart) / TOTAL_GRID_MINS) * 100;
                    const color = zone?.color || "#6366f1";

                    return (
                      <div
                        key={dz.id}
                        className="absolute inset-x-1 rounded-2xl border backdrop-blur-xs pointer-events-none overflow-hidden"
                        style={{
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                          backgroundColor: hexToRgba(color, 0.1),
                          borderColor: hexToRgba(color, 0.3),
                        }}
                      >
                        <div className="flex items-center justify-between px-2 py-1 opacity-85">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold truncate"
                            style={{ color }}
                          >
                            <ZoneIcon icon={zone?.icon} className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{zone?.name || "Zone"}</span>
                          </span>
                          <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                            {formatMinuteTo12h(dz.startMinute)}–
                            {formatMinuteTo12h(dz.endMinute)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Drop Target Ghost Preview */}
                  {dropPreview && dropPreview.dateString === dateStr && (
                    <div
                      className={`absolute inset-x-1.5 z-20 rounded-xl border-2 border-dashed backdrop-blur-xs px-2 py-1 pointer-events-none flex items-center justify-between ${
                        dropPreview.blocked
                          ? "border-rose-500 bg-rose-500/20"
                          : "border-primary bg-primary/20"
                      }`}
                      style={{
                        top: `${
                          ((dropPreview.startMinute - MIN_MINUTE) /
                            TOTAL_GRID_MINS) *
                          100
                        }%`,
                        height: `${Math.max(
                          2.5,
                          ((dropPreview.endMinute - dropPreview.startMinute) /
                            TOTAL_GRID_MINS) *
                            100
                        )}%`,
                      }}
                    >
                      <span
                        className={`text-[10px] font-semibold flex items-center gap-1 ${
                          dropPreview.blocked ? "text-rose-300" : "text-primary"
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                        {dropPreview.blocked
                          ? dropPreview.blockReason || "Blocked"
                          : `Pin at ${formatMinuteTo12h(dropPreview.startMinute)}`}
                      </span>
                      <span
                        className={`text-[9px] ${
                          dropPreview.blocked ? "text-rose-200" : "text-primary/90"
                        }`}
                      >
                        {dropPreview.blocked
                          ? "Blocked"
                          : zoneById.get(dropPreview.zoneId)?.name || ""}
                      </span>
                    </div>
                  )}

                  {/* Scheduled Allocation Blocks (Lane-aware so cards never overlap) */}
                  {computeDayCardLanes(dayAllocs).map(
                    ({ alloc, clampedStart, clampedEnd, lane, laneCount }) => {
                      const durationTotal = clampedEnd - clampedStart;
                      const topPct =
                        ((clampedStart - MIN_MINUTE) / TOTAL_GRID_MINS) * 100;
                      const heightPct = (durationTotal / TOTAL_GRID_MINS) * 100;
                      const zone = zoneById.get(alloc.zoneId);
                      const accent =
                        alloc.taskColor ||
                        alloc.contentTypeColor ||
                        zone?.color ||
                        "#6366f1";
                      const isCompact = durationTotal < 30;
                      const isBatched =
                        (alloc.baseSetupBufferMins || 0) > 0 &&
                        alloc.setupMinsUsed === 0;
                      const isCompleting = completingId === alloc.id;
                      const laneWidthPct = 100 / laneCount;
                      const laneLeftPct = lane * laneWidthPct;

                      return (
                        <div
                          key={alloc.id}
                          draggable
                          onDragStart={(e) => handleCardDragStart(e, alloc)}
                          onDragEnd={() => {
                            setDraggingPayload(null);
                            setDropPreview(null);
                          }}
                          className={`group absolute z-10 rounded-xl border px-2 py-1 backdrop-blur-md shadow-sm transition-all cursor-grab active:cursor-grabbing overflow-hidden flex flex-col justify-between ${
                            alloc.isPinned
                              ? "ring-1 ring-amber-400/60"
                              : "hover:brightness-110 hover:z-20"
                          }`}
                          style={{
                            top: `${topPct}%`,
                            height: `max(24px, ${heightPct}%)`,
                            left: `calc(${laneLeftPct}% + 4px)`,
                            width: `calc(${laneWidthPct}% - 8px)`,
                            backgroundColor: hexToRgba(accent, 0.22),
                            borderColor: alloc.isPinned
                              ? "rgba(251, 191, 36, 0.65)"
                              : hexToRgba(accent, 0.55),
                          }}
                        >
                        {/* Top Line: Content ID / Type Badge + Quick Complete + Pin */}
                        <div className="flex items-start justify-between gap-1 min-w-0">
                          <div className="flex items-center gap-1 min-w-0 flex-wrap">
                            <button
                              type="button"
                              disabled={isCompleting}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setCompletingId(alloc.id);
                                try {
                                  await onCompleteAllocation(alloc);
                                } finally {
                                  setCompletingId(null);
                                }
                              }}
                              title="Mark completed in /index & remove load"
                              className="w-4 h-4 rounded border border-foreground/40 hover:border-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center shrink-0 transition-colors"
                            >
                              {isCompleting ? (
                                <Sparkles className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                              ) : (
                                <Check className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-emerald-400 transition-opacity" />
                              )}
                            </button>

                            {alloc.uniqueContentId ? (
                              <span
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold text-white shrink-0"
                                style={{ backgroundColor: accent }}
                              >
                                {alloc.uniqueContentId}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-foreground/15 text-foreground text-[9px] font-semibold shrink-0">
                                {alloc.sourceType === "personal_todo"
                                  ? "To-Do"
                                  : "Open"}
                              </span>
                            )}

                            <span className="text-[11px] font-semibold text-foreground truncate">
                              {alloc.taskName}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onTogglePinAllocation(
                                alloc.id,
                                !alloc.isPinned
                              );
                            }}
                            title={
                              alloc.isPinned
                                ? "Pinned (Locked) — click to unpin"
                                : "Pin / Lock to this time slot"
                            }
                            className={`p-0.5 rounded transition-colors shrink-0 ${
                              alloc.isPinned
                                ? "text-amber-400 bg-amber-500/20"
                                : "text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-black/15 dark:hover:bg-white/10"
                            }`}
                          >
                            {alloc.isPinned ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Unlock className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        {/* Middle Subtitle if height allows */}
                        {!isCompact && (
                          <p className="text-[10px] text-foreground/80 truncate pl-5">
                            {alloc.title}
                          </p>
                        )}

                        {/* Bottom Metadata Row: Time + Setup/Batched + OR Eligible Zone Dots */}
                        {!isCompact && (
                          <div className="flex items-center justify-between gap-1 text-[9px] pl-0.5 mt-auto">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="inline-flex items-center gap-0.5 text-foreground/80 tabular-nums shrink-0">
                                <Clock className="w-2.5 h-2.5" />
                                {alloc.durationMins}m
                              </span>

                              {isBatched ? (
                                <span
                                  title={`Setup buffer amortized by batching (saved ${alloc.baseSetupBufferMins}m)`}
                                  className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold shrink-0"
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  0m batched
                                </span>
                              ) : alloc.setupMinsUsed > 0 ? (
                                <span className="px-1 py-0.2 rounded bg-black/15 dark:bg-white/10 text-foreground/80 shrink-0">
                                  +{alloc.setupMinsUsed}m setup
                                </span>
                              ) : null}

                              {alloc.isVacationPreScheduled && (
                                <span
                                  title={
                                    alloc.originalTargetDate
                                      ? `Pre-scheduled in advance for vacation (original target: ${alloc.originalTargetDate})`
                                      : "Pre-scheduled in advance for vacation"
                                  }
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/45 text-amber-300 font-semibold shrink-0"
                                >
                                  <Plane className="w-2.5 h-2.5" />
                                  Advance for Vacation
                                </span>
                              )}
                            </div>

                            {/* 'OR' Eligible Zone Dots */}
                            {alloc.eligibleZoneIds &&
                              alloc.eligibleZoneIds.length > 0 && (
                                <div
                                  className="flex items-center gap-0.5 shrink-0"
                                  title={`Eligible Zones (OR): ${alloc.eligibleZoneIds
                                    .map((id) => zoneById.get(id)?.name || id)
                                    .join(" | ")}`}
                                >
                                  {alloc.eligibleZoneIds.map((zId) => {
                                    const z = zoneById.get(zId);
                                    return (
                                      <span
                                        key={zId}
                                        className="w-2 h-2 rounded-full border border-white/40"
                                        style={{
                                          backgroundColor: z?.color || "#94a3b8",
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
