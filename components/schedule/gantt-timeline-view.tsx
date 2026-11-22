"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Filter,
  Lock,
  MoreVertical,
  Palmtree,
  Plane,
  Search,
  Sparkles,
  Unlock,
  Video,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getContrastTextColor, resolveTaskColorHex } from "@/lib/task-colors";
import {
  CustomSlotEntry,
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  OPEN_WORKDAY_ZONE_ID,
  ResistanceLevel,
  ScheduleOverrideItem,
  SchedulerTaskInput,
  SolvedAllocation,
  UnplacedTask,
  addDaysLocal,
  formatDayColumnHeader,
  formatLocalDateStr,
  formatMinsCompact,
  formatMinuteToHHMM,
  getDayIndexMon0,
  hexToRgba,
} from "./schedule-types";

interface GanttTimelineViewProps {
  mondayDate: string;
  numWeeks: 1 | 2 | 3 | 4;
  onNumWeeksChange: (weeks: 1 | 2 | 3 | 4) => void;
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds: DbWeeklyDayBounds[];
  overrides: ScheduleOverrideItem[];
  allocations: SolvedAllocation[];
  unplacedTasks: UnplacedTask[];
  completedTasks: SchedulerTaskInput[];
  onTogglePinAllocation: (
    allocationId: string,
    nextPinned: boolean
  ) => Promise<void> | void;
  onCompleteAllocation: (alloc: SolvedAllocation) => Promise<void> | void;
}

type FilterMode = "active" | "scheduled" | "all_with_done";

type GanttColumnId =
  | "contentId"
  | "brand"
  | "series"
  | "task"
  | "duration"
  | "zone"
  | "start"
  | "end";

interface ColumnDef {
  id: GanttColumnId;
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

interface SortKey {
  column: GanttColumnId;
  dir: "asc" | "desc";
}

interface GanttTaskRow {
  key: string;
  sourceType: SolvedAllocation["sourceType"];
  sourceId: string;
  contentItemId: string | null;
  uniqueContentId: string | null;
  contentIdDisplay: string;
  brandName: string | null;
  brandDisplay: string;
  brandColor: string | null;
  seriesName: string | null;
  seriesDisplay: string;
  taskName: string;
  title: string;
  taskColor: string;
  sequenceOrder: number;
  durationMins: number;
  durationDisplay: string;
  zoneDisplay: string;
  zoneColor: string | null;
  startMinute: number | null;
  startDisplay: string;
  endMinute: number | null;
  endDisplay: string;
  resistance: ResistanceLevel;
  targetDate: string | null;
  publishDate: string | null;
  worstCaseTargetDate: string | null;
  team1stTargetDate: string | null;
  teamFinalTargetDate: string | null;
  status: "scheduled" | "partial" | "unplaced" | "done";
  allocs: SolvedAllocation[];
  unplaced: UnplacedTask | null;
}

interface DayZoneBand {
  zoneId: string;
  name: string;
  color: string;
  startMinute: number;
  endMinute: number;
}

interface DayTimelineLayout {
  dateString: string;
  dayOfWeek: number;
  isHoliday: boolean;
  holidayLabel: string | null;
  isToday: boolean;
  workStartMinute: number;
  workEndMinute: number;
  activeMins: number;
  widthPx: number;
  zoneBands: DayZoneBand[];
}

const COLUMNS: ColumnDef[] = [
  { id: "contentId", label: "Content ID", width: 86 },
  { id: "brand", label: "Brand", width: 86 },
  { id: "series", label: "Series", width: 90 },
  { id: "task", label: "Task", width: 112 },
  { id: "duration", label: "Duration", width: 72, align: "right" },
  { id: "zone", label: "Zone", width: 90 },
  { id: "start", label: "Start", width: 58, align: "center" },
  { id: "end", label: "End", width: 58, align: "center" },
];

const LEFT_COLS_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0); // 652px
const HOLIDAY_COL_PX = 58;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function getColumnValueForFilter(
  row: GanttTaskRow,
  col: GanttColumnId
): string {
  switch (col) {
    case "contentId":
      return row.contentIdDisplay;
    case "brand":
      return row.brandDisplay;
    case "series":
      return row.seriesDisplay;
    case "task":
      return row.taskName;
    case "duration":
      return row.durationDisplay;
    case "zone":
      return row.zoneDisplay;
    case "start":
      return row.startDisplay;
    case "end":
      return row.endDisplay;
  }
}

function compareColumnValues(
  a: GanttTaskRow,
  b: GanttTaskRow,
  col: GanttColumnId,
  dir: "asc" | "desc"
): number {
  const mult = dir === "asc" ? 1 : -1;

  if (col === "duration") {
    if (a.durationMins !== b.durationMins) {
      return (a.durationMins - b.durationMins) * mult;
    }
    return 0;
  }

  if (col === "start") {
    const aVal = a.startMinute;
    const bVal = b.startMinute;
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1; // keep empty at bottom
    if (bVal === null) return -1;
    if (aVal !== bVal) return (aVal - bVal) * mult;
    const aDate = a.allocs[0]?.dateString || "";
    const bDate = b.allocs[0]?.dateString || "";
    return aDate.localeCompare(bDate) * mult;
  }

  if (col === "end") {
    const aVal = a.endMinute;
    const bVal = b.endMinute;
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    if (aVal !== bVal) return (aVal - bVal) * mult;
    const aDate = a.allocs[a.allocs.length - 1]?.dateString || "";
    const bDate = b.allocs[b.allocs.length - 1]?.dateString || "";
    return aDate.localeCompare(bDate) * mult;
  }

  const va = getColumnValueForFilter(a, col);
  const vb = getColumnValueForFilter(b, col);
  const aEmpty = va === "—";
  const bEmpty = vb === "—";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" }) * mult;
}

export function GanttTimelineView({
  mondayDate,
  numWeeks,
  onNumWeeksChange,
  zones,
  weeklySlots,
  dayBounds,
  overrides,
  allocations,
  unplacedTasks,
  completedTasks,
  onTogglePinAllocation,
  onCompleteAllocation,
}: GanttTimelineViewProps) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("active");
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<GanttColumnId, Set<string>>>
  >({});

  // Excel-style column filter popover state
  const [openFilterMenu, setOpenFilterMenu] = useState<{
    column: GanttColumnId;
    top: number;
    left: number;
  } | null>(null);
  const [filterMenuSearch, setFilterMenuSearch] = useState("");
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  // Horizontal zoom & container sizing for timeline
  const [timelineZoom, setTimelineZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const zoomRef = useRef(timelineZoom);

  useEffect(() => {
    zoomRef.current = timelineZoom;
  }, [timelineZoom]);

  const [completingKey, setCompletingKey] = useState<string | null>(null);

  const weekDates = useMemo(
    () =>
      Array.from({ length: numWeeks * 7 }, (_, i) =>
        addDaysLocal(mondayDate, i)
      ),
    [mondayDate, numWeeks]
  );
  const todayStr = formatLocalDateStr(new Date());

  const zoneById = useMemo(
    () => new Map(zones.map((z) => [z.id, z])),
    [zones]
  );
  const overrideByDate = useMemo(
    () => new Map(overrides.map((o) => [o.dateString, o])),
    [overrides]
  );
  const boundsByDay = useMemo(
    () => new Map(dayBounds.map((b) => [b.dayOfWeek, b])),
    [dayBounds]
  );

  // Observe scroll container width so 1x fits the viewport cleanly
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Close Excel filter popover on outside click or Escape
  useEffect(() => {
    if (!openFilterMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        filterMenuRef.current &&
        target &&
        !filterMenuRef.current.contains(target) &&
        !target.closest("[data-filter-trigger]")
      ) {
        setOpenFilterMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFilterMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openFilterMenu]);

  // Ctrl+Scroll horizontal zoom anchored to mouse pointer over the timeline
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();

      const prevZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.round(prevZoom * factor * 100) / 100)
      );
      if (nextZoom === prevZoom) return;

      const rect = el.getBoundingClientRect();
      const pointerInTimeline = Math.max(
        0,
        e.clientX - rect.left - LEFT_COLS_WIDTH
      );
      const timelineContentX = el.scrollLeft + pointerInTimeline;
      const ratio = nextZoom / prevZoom;

      zoomRef.current = nextZoom;
      setTimelineZoom(nextZoom);

      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollLeft = Math.max(
          0,
          timelineContentX * ratio - pointerInTimeline
        );
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // Build per-day horizontal layouts excluding No Work Zones
  const dayLayouts: DayTimelineLayout[] = useMemo(() => {
    const rawDays = weekDates.map((dateStr) => {
      const dayIdx = getDayIndexMon0(dateStr);
      const ov = overrideByDate.get(dateStr);
      const isHoliday = Boolean(ov?.isHoliday);
      const isToday = dateStr === todayStr;

      const bound = boundsByDay.get(dayIdx);
      const workStartMinute = bound
        ? bound.workStartMinute
        : DEFAULT_WORK_START_MINUTE;
      const workEndMinute = bound
        ? bound.workEndMinute
        : DEFAULT_WORK_END_MINUTE;

      const activeMins = isHoliday
        ? 0
        : Math.max(0, workEndMinute - workStartMinute);

      // Build zones clipped strictly to active working window (excluding No Work Zone)
      const zoneBands: DayZoneBand[] = [];
      if (!isHoliday && activeMins > 0) {
        if (zones.length === 0) {
          zoneBands.push({
            zoneId: OPEN_WORKDAY_ZONE_ID,
            name: "Open Workday",
            color: "#6366f1",
            startMinute: workStartMinute,
            endMinute: workEndMinute,
          });
        } else {
          const sourceSlots: {
            zoneId: string;
            startMinute: number;
            endMinute: number;
          }[] =
            ov?.customSlots && ov.customSlots.length > 0
              ? (ov.customSlots as CustomSlotEntry[])
              : weeklySlots.filter((s) => s.dayOfWeek === dayIdx);

          for (const slot of sourceSlots) {
            const clippedStart = Math.max(workStartMinute, slot.startMinute);
            const clippedEnd = Math.min(workEndMinute, slot.endMinute);
            if (clippedEnd <= clippedStart) continue;
            const z = zoneById.get(slot.zoneId);
            if (!z) continue;
            zoneBands.push({
              zoneId: z.id,
              name: z.name,
              color: z.color,
              startMinute: clippedStart,
              endMinute: clippedEnd,
            });
          }
          zoneBands.sort((a, b) => a.startMinute - b.startMinute);
        }
      }

      return {
        dateString: dateStr,
        dayOfWeek: dayIdx,
        isHoliday,
        holidayLabel: ov?.holidayLabel || null,
        isToday,
        workStartMinute,
        workEndMinute,
        activeMins,
        zoneBands,
      };
    });

    const holidayCount = rawDays.filter(
      (d) => d.isHoliday || d.activeMins === 0
    ).length;
    const totalWorkMins = rawDays.reduce((sum, d) => sum + d.activeMins, 0);
    const availableBasePx = Math.max(
      containerWidth - LEFT_COLS_WIDTH - holidayCount * HOLIDAY_COL_PX - 2,
      420
    );
    const zoomedWorkPx = availableBasePx * timelineZoom;

    const minDayPx = numWeeks > 1 ? 82 : 56;
    return rawDays.map((d) => {
      if (d.isHoliday || d.activeMins === 0) {
        return { ...d, widthPx: HOLIDAY_COL_PX };
      }
      const widthPx =
        totalWorkMins > 0
          ? Math.max(minDayPx, (d.activeMins / totalWorkMins) * zoomedWorkPx)
          : Math.max(minDayPx, availableBasePx / Math.max(1, rawDays.length - holidayCount));
      return { ...d, widthPx };
    });
  }, [
    weekDates,
    numWeeks,
    overrideByDate,
    todayStr,
    boundsByDay,
    zones.length,
    weeklySlots,
    zoneById,
    containerWidth,
    timelineZoom,
  ]);

  const totalTimelinePx = useMemo(
    () => dayLayouts.reduce((sum, d) => sum + d.widthPx, 0),
    [dayLayouts]
  );

  // Merge allocations + unplaced + done into 1 unified row per task (base rows before column filters/sort)
  const baseRows: GanttTaskRow[] = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        sourceType: SolvedAllocation["sourceType"];
        sourceId: string;
        contentItemId: string | null;
        uniqueContentId: string | null;
        brandName: string | null;
        brandColor: string | null;
        seriesName: string | null;
        taskName: string;
        title: string;
        taskColor: string;
        sequenceOrder: number;
        durationMins: number;
        resistance: ResistanceLevel;
        targetDate: string | null;
        publishDate: string | null;
        worstCaseTargetDate: string | null;
        team1stTargetDate: string | null;
        teamFinalTargetDate: string | null;
        status: "scheduled" | "partial" | "unplaced" | "done";
        allocs: SolvedAllocation[];
        unplaced: UnplacedTask | null;
      }
    >();

    for (const alloc of allocations) {
      if (alloc.taskName.toLowerCase().trim() === "publish") continue;
      const key = `${alloc.sourceType}:${alloc.sourceId}`;
      const resolvedColor =
        alloc.taskColor || resolveTaskColorHex(alloc.taskName, null);
      const existing = map.get(key);
      if (existing) {
        existing.allocs.push(alloc);
        existing.durationMins += alloc.durationMins;
        if (alloc.isPartialChunk) existing.status = "partial";
      } else {
        map.set(key, {
          key,
          sourceType: alloc.sourceType,
          sourceId: alloc.sourceId,
          contentItemId: alloc.contentItemId ?? null,
          uniqueContentId: alloc.uniqueContentId ?? null,
          brandName: alloc.brandName ?? null,
          brandColor: alloc.brandColor ?? null,
          seriesName: alloc.contentTypeName ?? null,
          taskName: alloc.taskName,
          title: alloc.title,
          taskColor: resolvedColor,
          sequenceOrder: alloc.sequenceOrder ?? 500,
          durationMins: alloc.durationMins,
          resistance: alloc.resistance,
          targetDate: alloc.targetDate,
          publishDate: alloc.publishDate ?? null,
          worstCaseTargetDate: alloc.worstCaseTargetDate ?? alloc.targetDate,
          team1stTargetDate: alloc.team1stTargetDate ?? null,
          teamFinalTargetDate: alloc.teamFinalTargetDate ?? null,
          status: alloc.isPartialChunk ? "partial" : "scheduled",
          allocs: [alloc],
          unplaced: null,
        });
      }
    }

    for (const u of unplacedTasks) {
      if (u.taskName.toLowerCase().trim() === "publish") continue;
      const key = `${u.sourceType}:${u.sourceId}`;
      const resolvedColor =
        u.taskColor || resolveTaskColorHex(u.taskName, null);
      const existing = map.get(key);
      if (existing) {
        existing.unplaced = u;
        existing.status = "partial";
        existing.durationMins += u.missingMinutes;
      } else {
        map.set(key, {
          key,
          sourceType: u.sourceType,
          sourceId: u.sourceId,
          contentItemId: u.contentItemId ?? null,
          uniqueContentId: u.uniqueContentId ?? null,
          brandName: u.brandName ?? null,
          brandColor: u.brandColor ?? null,
          seriesName: u.contentTypeName ?? null,
          taskName: u.taskName,
          title: u.title,
          taskColor: resolvedColor,
          sequenceOrder: u.sequenceOrder ?? 500,
          durationMins: u.missingMinutes,
          resistance: u.resistance || "MEDIUM",
          targetDate: u.targetDate,
          publishDate: u.publishDate ?? null,
          worstCaseTargetDate: u.worstCaseTargetDate ?? u.targetDate,
          team1stTargetDate: u.team1stTargetDate ?? null,
          teamFinalTargetDate: u.teamFinalTargetDate ?? null,
          status: "unplaced",
          allocs: [],
          unplaced: u,
        });
      }
    }

    if (filterMode === "all_with_done") {
      for (const dt of completedTasks) {
        if (dt.taskName.toLowerCase().trim() === "publish") continue;
        const key = `${dt.sourceType}:${dt.sourceId}`;
        if (map.has(key)) continue;
        map.set(key, {
          key,
          sourceType: dt.sourceType,
          sourceId: dt.sourceId,
          contentItemId: dt.contentItemId ?? null,
          uniqueContentId: dt.uniqueContentId ?? null,
          brandName: dt.brandName ?? null,
          brandColor: dt.brandColor ?? null,
          seriesName: dt.contentTypeName ?? null,
          taskName: dt.taskName,
          title: dt.title,
          taskColor:
            dt.taskColor || resolveTaskColorHex(dt.taskName, null),
          sequenceOrder: dt.sequenceOrder,
          durationMins: dt.durationMins,
          resistance: dt.resistance,
          targetDate: dt.targetDate,
          publishDate: dt.publishDate ?? null,
          worstCaseTargetDate: dt.worstCaseTargetDate ?? dt.targetDate,
          team1stTargetDate: dt.team1stTargetDate ?? null,
          teamFinalTargetDate: dt.teamFinalTargetDate ?? null,
          status: "done",
          allocs: [],
          unplaced: null,
        });
      }
    }

    let list: GanttTaskRow[] = Array.from(map.values()).map((r) => {
      const sortedAllocs = [...r.allocs].sort((a, b) => {
        if (a.dateString !== b.dateString) {
          return a.dateString.localeCompare(b.dateString);
        }
        return a.startMinute - b.startMinute;
      });

      const firstAlloc = sortedAllocs[0] || null;
      const lastAlloc = sortedAllocs[sortedAllocs.length - 1] || null;

      const uniqueZones: { name: string; color: string | null }[] = [];
      const seenZoneIds = new Set<string>();
      for (const a of sortedAllocs) {
        if (seenZoneIds.has(a.zoneId)) continue;
        seenZoneIds.add(a.zoneId);
        if (a.zoneId === OPEN_WORKDAY_ZONE_ID) {
          uniqueZones.push({ name: "Open Day", color: "#6366f1" });
        } else {
          const z = zoneById.get(a.zoneId);
          uniqueZones.push({
            name: z?.name || "Zone",
            color: z?.color || null,
          });
        }
      }

      const contentIdDisplay =
        r.uniqueContentId ||
        (r.sourceType === "personal_todo" ? "To-Do" : "Open");
      const brandDisplay =
        r.brandName ||
        (r.sourceType === "personal_todo" ? "Personal" : "—");
      const seriesDisplay = r.seriesName || "—";
      const durationDisplay = formatMinsCompact(r.durationMins);
      const zoneDisplay =
        uniqueZones.length > 0
          ? uniqueZones.map((z) => z.name).join(", ")
          : "—";
      const zoneColor = uniqueZones.length === 1 ? uniqueZones[0].color : null;
      const startMinute = firstAlloc ? firstAlloc.startMinute : null;
      const endMinute = lastAlloc ? lastAlloc.endMinute : null;

      return {
        ...r,
        allocs: sortedAllocs,
        contentIdDisplay,
        brandDisplay,
        seriesDisplay,
        durationDisplay,
        zoneDisplay,
        zoneColor,
        startMinute,
        startDisplay:
          startMinute !== null ? formatMinuteToHHMM(startMinute) : "—",
        endMinute,
        endDisplay: endMinute !== null ? formatMinuteToHHMM(endMinute) : "—",
      };
    });

    if (filterMode === "scheduled") {
      list = list.filter((r) => r.allocs.length > 0);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          r.contentIdDisplay,
          r.brandDisplay,
          r.seriesDisplay,
          r.taskName,
          r.zoneDisplay,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    return list;
  }, [
    allocations,
    unplacedTasks,
    completedTasks,
    filterMode,
    search,
    zoneById,
  ]);

  // Excel-like unique values per column (from baseRows)
  const columnUniqueValues = useMemo(() => {
    const out = new Map<
      GanttColumnId,
      { value: string; count: number }[]
    >();
    for (const col of COLUMNS) {
      const counts = new Map<string, number>();
      for (const row of baseRows) {
        const val = getColumnValueForFilter(row, col.id);
        counts.set(val, (counts.get(val) || 0) + 1);
      }
      const entries = Array.from(counts.entries()).map(([value, count]) => ({
        value,
        count,
      }));
      entries.sort((a, b) => {
        if (a.value === "—") return 1;
        if (b.value === "—") return -1;
        return a.value.localeCompare(b.value, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
      out.set(col.id, entries);
    }
    return out;
  }, [baseRows]);

  // Apply per-column Excel filters & multi-column sorting
  const rows = useMemo(() => {
    let filtered = baseRows.filter((row) => {
      for (const col of COLUMNS) {
        const allowedSet = columnFilters[col.id];
        if (!allowedSet) continue;
        const val = getColumnValueForFilter(row, col.id);
        if (!allowedSet.has(val)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      for (const sk of sortKeys) {
        const cmp = compareColumnValues(a, b, sk.column, sk.dir);
        if (cmp !== 0) return cmp;
      }
      // Default fallback: pipeline grouping
      const cKeyA = a.contentItemId || a.sourceId;
      const cKeyB = b.contentItemId || b.sourceId;
      if (cKeyA !== cKeyB) {
        const da = a.targetDate || "9999-12-31";
        const db = b.targetDate || "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        return cKeyA.localeCompare(cKeyB);
      }
      if (a.sequenceOrder !== b.sequenceOrder) {
        return a.sequenceOrder - b.sequenceOrder;
      }
      return a.taskName.localeCompare(b.taskName);
    });

    return filtered;
  }, [baseRows, columnFilters, sortKeys]);

  // Identify the second-to-last workflow task (last task before Publish) per ContentItem to show the Video Publish icon
  const prePublishRowKeys = useMemo(() => {
    const bestByContent = new Map<string, { key: string; seq: number }>();
    for (const row of baseRows) {
      if (row.sourceType !== "workflow_task" || !row.contentItemId) continue;
      const existing = bestByContent.get(row.contentItemId);
      if (!existing || row.sequenceOrder > existing.seq) {
        bestByContent.set(row.contentItemId, {
          key: row.key,
          seq: row.sequenceOrder,
        });
      }
    }
    return new Set(Array.from(bestByContent.values()).map((v) => v.key));
  }, [baseRows]);

  // Multi-column sort click handler: asc -> desc -> remove; new column appends as next tie-breaker
  const handleHeaderSortClick = useCallback((col: GanttColumnId) => {
    setSortKeys((prev) => {
      const idx = prev.findIndex((s) => s.column === col);
      if (idx === -1) {
        return [...prev, { column: col, dir: "asc" }];
      }
      const existing = prev[idx];
      if (existing.dir === "asc") {
        return prev.map((s, i) => (i === idx ? { ...s, dir: "desc" } : s));
      }
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const setColumnExplicitSort = useCallback(
    (col: GanttColumnId, dir: "asc" | "desc" | null) => {
      setSortKeys((prev) => {
        const idx = prev.findIndex((s) => s.column === col);
        if (dir === null) {
          return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
        }
        if (idx === -1) {
          return [...prev, { column: col, dir }];
        }
        return prev.map((s, i) => (i === idx ? { ...s, dir } : s));
      });
    },
    []
  );

  const handleOpenFilterMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    col: GanttColumnId
  ) => {
    e.stopPropagation();
    if (openFilterMenu?.column === col) {
      setOpenFilterMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 236;
    const left = Math.min(
      window.innerWidth - menuWidth - 12,
      Math.max(12, rect.right - menuWidth)
    );
    const top = Math.min(window.innerHeight - 360, rect.bottom + 6);
    setFilterMenuSearch("");
    setOpenFilterMenu({ column: col, top, left });
  };

  const toggleFilterValue = (col: GanttColumnId, val: string) => {
    const allVals = (columnUniqueValues.get(col) || []).map((v) => v.value);
    setColumnFilters((prev) => {
      const current = prev[col] ?? new Set(allVals);
      const next = new Set(current);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      if (next.size === allVals.length) {
        const copy = { ...prev };
        delete copy[col];
        return copy;
      }
      return { ...prev, [col]: next };
    });
  };

  const selectAllColumnFilter = (col: GanttColumnId) => {
    setColumnFilters((prev) => {
      const copy = { ...prev };
      delete copy[col];
      return copy;
    });
  };

  const clearAllColumnFilterValues = (col: GanttColumnId) => {
    setColumnFilters((prev) => ({
      ...prev,
      [col]: new Set<string>(),
    }));
  };

  const activeFilterCount = Object.keys(columnFilters).length;

  const adjustZoomButton = (dir: "in" | "out" | "reset") => {
    if (dir === "reset") {
      setTimelineZoom(1);
      return;
    }
    setTimelineZoom((z) => {
      const next = dir === "in" ? z * 1.35 : z / 1.35;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
    });
  };

  // Excel-like dropdown menu rendered via portal so sticky headers never clip it
  const openMenuOptions = openFilterMenu
    ? (columnUniqueValues.get(openFilterMenu.column) || []).filter((item) =>
        item.value.toLowerCase().includes(filterMenuSearch.trim().toLowerCase())
      )
    : [];
  const openMenuAllowedSet = openFilterMenu
    ? columnFilters[openFilterMenu.column]
    : undefined;
  const openMenuSort = openFilterMenu
    ? sortKeys.find((s) => s.column === openFilterMenu.column)
    : undefined;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden p-3 gap-2.5">
      {/* Gantt Controls & Compact Legend */}
      <div className="glass-card rounded-2xl px-3.5 py-2 border border-border/50 shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table..."
              className="glass-input rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground outline-none w-48"
            />
          </div>

          <div className="inline-flex items-center glass-subtle rounded-xl p-0.5 border border-border/40">
            {(
              [
                { id: "active", label: "Active" },
                { id: "scheduled", label: "Placed" },
                { id: "all_with_done", label: "Include Done" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  filterMode === opt.id
                    ? "bg-primary/15 text-primary border border-primary/35"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {sortKeys.length > 0 && (
            <button
              type="button"
              onClick={() => setSortKeys([])}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
              title="Clear multi-column sorting"
            >
              <X className="w-3 h-3" />
              Clear Sort ({sortKeys.length})
            </button>
          )}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-medium hover:bg-amber-500/25 transition-colors"
              title="Clear all column filters"
            >
              <Filter className="w-3 h-3" />
              Clear Filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Target Date Legend, Multi-Week Selector & Timeline Zoom Controls */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <div
            className="inline-flex items-center glass-subtle rounded-lg border border-border/40 p-0.5 gap-0.5"
            title="Show 1 to 4 weeks on Gantt timeline (Next/Prev still moves by 1 week)"
          >
            {([1, 2, 3, 4] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onNumWeeksChange(w)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                  numWeeks === w
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {w}W
              </button>
            ))}
          </div>

          <span
            className="inline-flex items-center gap-1.5"
            title="Worst-case task target date"
          >
            <span className="inline-flex items-center gap-0.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="w-0.5 h-3 bg-rose-500/90" />
            </span>
            <span className="text-rose-400 font-medium">Worst Target</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Team 1st submission target date"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Team 1st</span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Team final submission target date"
          >
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span>Team Final</span>
          </span>
          <span
            className="inline-flex items-center gap-1 text-emerald-400"
            title="Publish date shown on the pre-publish task row"
          >
            <Video className="w-3 h-3" />
            <span>Publish</span>
          </span>

          <div
            className="inline-flex items-center glass-subtle rounded-lg border border-border/40 px-1 py-0.5 gap-1"
            title="Use Ctrl + Scroll on timeline to zoom horizontally"
          >
            <button
              type="button"
              onClick={() => adjustZoomButton("out")}
              disabled={timelineZoom <= MIN_ZOOM}
              className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-35 text-foreground"
              aria-label="Zoom out timeline"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => adjustZoomButton("reset")}
              className="px-1 text-[10px] font-semibold tabular-nums text-foreground hover:text-primary"
              title="Click to reset zoom (or Ctrl+Scroll)"
            >
              {Math.round(timelineZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => adjustZoomButton("in")}
              disabled={timelineZoom >= MAX_ZOOM}
              className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-35 text-foreground"
              aria-label="Zoom in timeline"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Gantt Table + Zoomable Timeline (No-Work Zones Excluded) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 glass-card rounded-2xl border border-border/50 overflow-auto min-h-0 select-none"
      >
        <div
          style={{
            width: `${LEFT_COLS_WIDTH + totalTimelinePx}px`,
            minWidth: "100%",
          }}
        >
          {/* Sticky Top Header Row */}
          <div className="sticky top-0 z-30 flex border-b border-border/50 bg-background/95 backdrop-blur-md">
            {/* Sticky Left Table Columns Header */}
            <div
              className="sticky left-0 z-40 shrink-0 flex border-r border-border/50 bg-background/95 backdrop-blur-md text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: `${LEFT_COLS_WIDTH}px` }}
            >
              {COLUMNS.map((col) => {
                const sortIdx = sortKeys.findIndex((s) => s.column === col.id);
                const sortEntry = sortIdx !== -1 ? sortKeys[sortIdx] : null;
                const isFiltered = Boolean(columnFilters[col.id]);

                return (
                  <div
                    key={col.id}
                    style={{ width: `${col.width}px` }}
                    className="shrink-0 border-r last:border-r-0 border-border/30 flex items-center justify-between px-1.5 py-2 gap-0.5 hover:bg-muted/30 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderSortClick(col.id)}
                      title={`Click to sort by ${col.label} (multi-column sort supported)`}
                      className="flex-1 min-w-0 flex items-center gap-0.5 text-left truncate cursor-pointer"
                    >
                      <span
                        className={`truncate ${
                          sortEntry ? "text-primary font-bold" : ""
                        }`}
                      >
                        {col.label}
                      </span>
                      {sortEntry && (
                        <span className="inline-flex items-center shrink-0 text-primary">
                          {sortKeys.length > 1 && (
                            <span className="text-[8px] font-bold leading-none mr-0.5">
                              {sortIdx + 1}
                            </span>
                          )}
                          {sortEntry.dir === "asc" ? (
                            <ArrowUp className="w-2.5 h-2.5" />
                          ) : (
                            <ArrowDown className="w-2.5 h-2.5" />
                          )}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      data-filter-trigger="true"
                      onClick={(e) => handleOpenFilterMenu(e, col.id)}
                      title={`Filter ${col.label}`}
                      aria-label={`Filter ${col.label}`}
                      className={`shrink-0 p-0.5 rounded transition-colors ${
                        isFiltered
                          ? "bg-amber-500/20 text-amber-300"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Dated Timeline Columns Header (Active Work Hours Only — No Work Zones Excluded) */}
            <div className="flex shrink-0">
              {dayLayouts.map((day) => {
                const { weekday, monthDay } = formatDayColumnHeader(
                  day.dateString
                );
                const showZoneDetails = !day.isHoliday && day.widthPx >= 150;
                const hoursSpan = day.activeMins / 60;
                const pxPerHour = hoursSpan > 0 ? day.widthPx / hoursSpan : 0;
                const showHourlyTicks = !day.isHoliday && pxPerHour >= 26;
                const tickStepHours = pxPerHour >= 48 ? 1 : 2;

                const hourTicks: number[] = [];
                if (showHourlyTicks && day.activeMins > 0) {
                  const firstWholeHour =
                    Math.ceil(day.workStartMinute / 60) * 60;
                  for (
                    let m = firstWholeHour;
                    m <= day.workEndMinute;
                    m += tickStepHours * 60
                  ) {
                    if (m > day.workStartMinute && m < day.workEndMinute) {
                      hourTicks.push(m);
                    }
                  }
                }

                return (
                  <div
                    key={day.dateString}
                    style={{ width: `${day.widthPx}px` }}
                    className={`shrink-0 border-r last:border-r-0 border-border/35 flex flex-col justify-between ${
                      day.isHoliday
                        ? "bg-amber-500/10"
                        : day.isToday
                        ? "bg-primary/10"
                        : ""
                    }`}
                  >
                    <div className="px-1.5 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold leading-tight">
                        <span
                          className={
                            day.isToday ? "text-primary" : "text-foreground"
                          }
                        >
                          {weekday}
                        </span>
                        <span className="text-muted-foreground font-normal truncate">
                          {monthDay}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1 truncate">
                        {day.isHoliday ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-300 font-medium truncate">
                            <Palmtree className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">
                              {day.holidayLabel || "Off"}
                            </span>
                          </span>
                        ) : day.activeMins === 0 ? (
                          <span>Off</span>
                        ) : (
                          <span className="tabular-nums">
                            {formatMinuteToHHMM(day.workStartMinute)}–
                            {formatMinuteToHHMM(day.workEndMinute)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Zoomed-in Zone Division & Hour Ruler Sub-header */}
                    {(showZoneDetails || showHourlyTicks) && (
                      <div className="relative h-5 border-t border-border/30 bg-background/40 overflow-hidden">
                        {showZoneDetails &&
                          day.zoneBands.map((band, idx) => {
                            const leftPct =
                              ((band.startMinute - day.workStartMinute) /
                                day.activeMins) *
                              100;
                            const widthPct =
                              ((band.endMinute - band.startMinute) /
                                day.activeMins) *
                              100;
                            const bandPx = (widthPct / 100) * day.widthPx;
                            return (
                              <div
                                key={`${band.zoneId}-${idx}`}
                                title={`${band.name} (${formatMinuteToHHMM(
                                  band.startMinute
                                )}–${formatMinuteToHHMM(band.endMinute)})`}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  backgroundColor: hexToRgba(band.color, 0.22),
                                  borderColor: hexToRgba(band.color, 0.45),
                                }}
                                className="absolute inset-y-0 border-x flex items-center justify-center px-1 overflow-hidden"
                              >
                                {bandPx >= 46 && (
                                  <span className="text-[8px] font-semibold text-foreground/90 truncate">
                                    {band.name}
                                  </span>
                                )}
                              </div>
                            );
                          })}

                        {showHourlyTicks &&
                          hourTicks.map((tickMin) => {
                            const leftPct =
                              ((tickMin - day.workStartMinute) /
                                day.activeMins) *
                              100;
                            return (
                              <span
                                key={tickMin}
                                style={{ left: `${leftPct}%` }}
                                className="absolute bottom-0 -translate-x-1/2 text-[8px] leading-none text-muted-foreground/85 tabular-nums pointer-events-none px-0.5 bg-background/60 rounded-t"
                              >
                                {formatMinuteToHHMM(tickMin)}
                              </span>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gantt Rows */}
          {rows.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground">
              No tasks match the current filters in this week.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {rows.map((row) => {
                const primaryAlloc = row.allocs[0] || null;
                const isDone = row.status === "done";
                const isCompleting = completingKey === row.key;

                // Gather distinct target dates present on this row
                const markersByDate = new Map<
                  string,
                  { kind: "worst" | "team1" | "teamFinal"; label: string; colorClass: string }[]
                >();

                const pushMarker = (
                  dateStr: string | null,
                  kind: "worst" | "team1" | "teamFinal",
                  label: string,
                  colorClass: string
                ) => {
                  if (!dateStr) return;
                  const arr = markersByDate.get(dateStr) || [];
                  arr.push({ kind, label, colorClass });
                  markersByDate.set(dateStr, arr);
                };

                if (row.sourceType === "workflow_task") {
                  pushMarker(
                    row.worstCaseTargetDate,
                    "worst",
                    `Worst Target Date: ${row.worstCaseTargetDate}`,
                    "bg-rose-500"
                  );
                  if (row.team1stTargetDate) {
                    pushMarker(
                      row.team1stTargetDate,
                      "team1",
                      `Team 1st Target: ${row.team1stTargetDate}`,
                      "bg-amber-400"
                    );
                  }
                  if (row.teamFinalTargetDate) {
                    pushMarker(
                      row.teamFinalTargetDate,
                      "teamFinal",
                      `Team Final Target: ${row.teamFinalTargetDate}`,
                      "bg-violet-400"
                    );
                  }
                } else if (row.targetDate) {
                  pushMarker(
                    row.targetDate,
                    "worst",
                    `Target Date: ${row.targetDate}`,
                    "bg-rose-500"
                  );
                }

                return (
                  <div
                    key={row.key}
                    className={`flex items-stretch h-10 transition-colors hover:bg-muted/20 group ${
                      isDone ? "opacity-55" : ""
                    }`}
                  >
                    {/* Sticky Left Table Cells */}
                    <div
                      className="sticky left-0 z-20 shrink-0 flex border-r border-border/50 bg-background/90 backdrop-blur-md text-[11px]"
                      style={{ width: `${LEFT_COLS_WIDTH}px` }}
                    >
                      {/* Content ID */}
                      <div
                        style={{ width: `${COLUMNS[0].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center overflow-hidden"
                      >
                        {row.uniqueContentId ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white truncate max-w-full"
                            style={{
                              backgroundColor: row.brandColor || "#6366f1",
                            }}
                            title={`${row.uniqueContentId} — ${row.title}${
                              row.publishDate
                                ? ` · Publish: ${row.publishDate}`
                                : ""
                            }`}
                          >
                            {row.uniqueContentId}
                          </span>
                        ) : (
                          <span
                            title={
                              row.publishDate
                                ? `Open Placeholder — Publish Date: ${row.publishDate}`
                                : row.title
                            }
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase truncate ${
                              row.contentIdDisplay === "Open"
                                ? "bg-sky-500/15 text-sky-300 border border-sky-500/35"
                                : "bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            {row.contentIdDisplay}
                          </span>
                        )}
                      </div>

                      {/* Brand */}
                      <div
                        style={{ width: `${COLUMNS[1].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center min-w-0"
                      >
                        {row.brandName ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground truncate">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: row.brandColor || "#94a3b8",
                              }}
                            />
                            <span className="truncate">{row.brandName}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {row.brandDisplay}
                          </span>
                        )}
                      </div>

                      {/* Series */}
                      <div
                        style={{ width: `${COLUMNS[2].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center min-w-0"
                      >
                        <span
                          className="text-muted-foreground truncate"
                          title={row.seriesDisplay}
                        >
                          {row.seriesDisplay}
                        </span>
                      </div>

                      {/* Task (ONLY task name, no extra clutter) */}
                      <div
                        style={{ width: `${COLUMNS[3].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center min-w-0"
                      >
                        <span
                          className={`font-medium truncate ${
                            isDone
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                          title={row.taskName}
                        >
                          {row.taskName}
                        </span>
                      </div>

                      {/* Duration (ONLY duration) */}
                      <div
                        style={{ width: `${COLUMNS[4].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center justify-end tabular-nums font-medium text-foreground/90"
                      >
                        {row.durationDisplay}
                      </div>

                      {/* Zone */}
                      <div
                        style={{ width: `${COLUMNS[5].width}px` }}
                        className="shrink-0 px-2 border-r border-border/30 flex items-center gap-1 min-w-0"
                      >
                        {row.zoneColor && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: row.zoneColor }}
                          />
                        )}
                        <span
                          className="text-muted-foreground truncate"
                          title={row.zoneDisplay}
                        >
                          {row.zoneDisplay}
                        </span>
                      </div>

                      {/* Start (hh:mm only) */}
                      <div
                        style={{ width: `${COLUMNS[6].width}px` }}
                        className="shrink-0 px-1.5 border-r border-border/30 flex items-center justify-center tabular-nums text-[10px] font-medium text-foreground/90"
                        title={
                          row.allocs.length > 1
                            ? row.allocs
                                .map(
                                  (a) =>
                                    `${formatMinuteToHHMM(a.startMinute)}–${formatMinuteToHHMM(a.endMinute)}`
                                )
                                .join(", ")
                            : undefined
                        }
                      >
                        {row.startDisplay}
                      </div>

                      {/* End (hh:mm only) */}
                      <div
                        style={{ width: `${COLUMNS[7].width}px` }}
                        className="shrink-0 px-1.5 flex items-center justify-center tabular-nums text-[10px] font-medium text-foreground/90"
                        title={
                          row.allocs.length > 1
                            ? row.allocs
                                .map(
                                  (a) =>
                                    `${formatMinuteToHHMM(a.startMinute)}–${formatMinuteToHHMM(a.endMinute)}`
                                )
                                .join(", ")
                            : undefined
                        }
                      >
                        {row.endDisplay}
                      </div>
                    </div>

                    {/* Right 7-Day Zoomable Timeline Track (No Work Zones Excluded) */}
                    <div className="flex shrink-0 relative">
                      {dayLayouts.map((day) => {
                        const dayAllocs = row.allocs.filter(
                          (a) => a.dateString === day.dateString
                        );
                        const dayMarkers = markersByDate.get(day.dateString);
                        const showZoneBg =
                          !day.isHoliday &&
                          day.activeMins > 0 &&
                          day.widthPx >= 150;
                        const hoursSpan = day.activeMins / 60;
                        const pxPerHour =
                          hoursSpan > 0 ? day.widthPx / hoursSpan : 0;
                        const showHourLines = !day.isHoliday && pxPerHour >= 26;
                        const tickStepHours = pxPerHour >= 48 ? 1 : 2;
                        const hourTicks: number[] = [];
                        if (showHourLines && day.activeMins > 0) {
                          const firstWholeHour =
                            Math.ceil(day.workStartMinute / 60) * 60;
                          for (
                            let m = firstWholeHour;
                            m <= day.workEndMinute;
                            m += tickStepHours * 60
                          ) {
                            if (m > day.workStartMinute && m < day.workEndMinute) {
                              hourTicks.push(m);
                            }
                          }
                        }

                        const hasWorstMarker = dayMarkers?.some(
                          (m) => m.kind === "worst"
                        );
                        const primaryLineColor = hasWorstMarker
                          ? "border-rose-500/90"
                          : dayMarkers?.[0]?.kind === "team1"
                          ? "border-amber-400/90"
                          : "border-violet-400/90";

                        return (
                          <div
                            key={day.dateString}
                            style={{ width: `${day.widthPx}px` }}
                            className={`relative shrink-0 border-r last:border-r-0 border-border/30 flex items-center overflow-hidden ${
                              day.isHoliday
                                ? "bg-amber-500/8"
                                : day.isToday
                                ? "bg-primary/5"
                                : ""
                            }`}
                          >
                            {/* Zone Background Divisions when Zoomed into Day */}
                            {showZoneBg &&
                              day.zoneBands.map((band, idx) => {
                                const leftPct =
                                  ((band.startMinute - day.workStartMinute) /
                                    day.activeMins) *
                                  100;
                                const widthPct =
                                  ((band.endMinute - band.startMinute) /
                                    day.activeMins) *
                                  100;
                                return (
                                  <div
                                    key={`${band.zoneId}-${idx}`}
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                      backgroundColor: hexToRgba(
                                        band.color,
                                        0.1
                                      ),
                                      borderColor: hexToRgba(band.color, 0.28),
                                    }}
                                    className="absolute inset-y-0 border-x pointer-events-none"
                                  />
                                );
                              })}

                            {/* Hourly Gridlines when Zoomed In */}
                            {showHourLines &&
                              hourTicks.map((tickMin) => {
                                const leftPct =
                                  ((tickMin - day.workStartMinute) /
                                    day.activeMins) *
                                  100;
                                return (
                                  <div
                                    key={tickMin}
                                    style={{ left: `${leftPct}%` }}
                                    className="absolute inset-y-0 border-l border-border/20 pointer-events-none"
                                  />
                                );
                              })}

                            {/* Compact Target Date Line + Colored Dot(s) */}
                            {dayMarkers && dayMarkers.length > 0 && (
                              <div
                                title={dayMarkers.map((m) => m.label).join("\n")}
                                className={`absolute right-0.5 inset-y-0 z-20 border-r-2 border-dashed ${primaryLineColor} pointer-events-auto flex flex-col items-end justify-start pt-0.5 pr-0.5 gap-0.5`}
                              >
                                {dayMarkers.map((m) => (
                                  <span
                                    key={m.kind}
                                    className={`w-2 h-2 rounded-full ${m.colorClass} shadow-xs ring-1 ring-background`}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Video Publish Icon on the Second-to-Last Task Row */}
                            {prePublishRowKeys.has(row.key) &&
                              row.publishDate === day.dateString && (
                                <div
                                  title={`Publish Date: ${row.publishDate}`}
                                  className="absolute right-1 bottom-0.5 z-20 px-1 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 flex items-center justify-center pointer-events-auto"
                                >
                                  <Video className="w-2.5 h-2.5" />
                                </div>
                              )}

                            {/* Scheduled Gantt Bar(s) matching exact Task Color */}
                            {!day.isHoliday &&
                              day.activeMins > 0 &&
                              dayAllocs.map((alloc) => {
                                const clampedStart = Math.max(
                                  day.workStartMinute,
                                  Math.min(day.workEndMinute, alloc.startMinute)
                                );
                                const clampedEnd = Math.max(
                                  clampedStart,
                                  Math.min(day.workEndMinute, alloc.endMinute)
                                );
                                if (clampedEnd <= clampedStart) return null;

                                const leftPct =
                                  ((clampedStart - day.workStartMinute) /
                                    day.activeMins) *
                                  100;
                                const rawWidthPct =
                                  ((clampedEnd - clampedStart) /
                                    day.activeMins) *
                                  100;
                                const barWidthPx =
                                  (rawWidthPct / 100) * day.widthPx;
                                const zone = zoneById.get(alloc.zoneId);
                                const isBatched =
                                  (alloc.baseSetupBufferMins || 0) > 0 &&
                                  alloc.setupMinsUsed === 0;
                                const barColor = row.taskColor;
                                const textColor =
                                  getContrastTextColor(barColor) === "black"
                                    ? "#111827"
                                    : "#ffffff";

                                return (
                                  <div
                                    key={alloc.id}
                                    title={`${row.taskName} (${row.title})\n${alloc.dateString} · ${formatMinuteToHHMM(
                                      alloc.startMinute
                                    )}–${formatMinuteToHHMM(
                                      alloc.endMinute
                                    )} (${formatMinsCompact(
                                      alloc.durationMins
                                    )}) · Zone: ${
                                      zone?.name || "Open Day"
                                    }${
                                      alloc.isVacationPreScheduled
                                        ? "\n✈️ Pre-scheduled for Vacation"
                                        : ""
                                    }`}
                                    className={`absolute h-6 rounded-md border px-1 flex items-center justify-between gap-1 overflow-hidden text-[10px] font-semibold shadow-xs z-10 ${
                                      alloc.isPinned
                                        ? "ring-1 ring-amber-400"
                                        : ""
                                    }`}
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${rawWidthPct}%`,
                                      minWidth: "6px",
                                      maxWidth: `calc(100% - ${leftPct}%)`,
                                      backgroundColor: hexToRgba(barColor, 0.85),
                                      borderColor: alloc.isVacationPreScheduled
                                        ? "rgba(251, 191, 36, 0.95)"
                                        : barColor,
                                      color: textColor,
                                    }}
                                  >
                                    <div className="flex items-center gap-0.5 min-w-0 truncate">
                                      {alloc.isVacationPreScheduled && (
                                        <Plane className="w-2.5 h-2.5 shrink-0" />
                                      )}
                                      {isBatched && (
                                        <Zap className="w-2.5 h-2.5 shrink-0" />
                                      )}
                                      {barWidthPx >= 40 && (
                                        <span className="truncate tabular-nums">
                                          {barWidthPx >= 76
                                            ? `${formatMinuteToHHMM(
                                                alloc.startMinute
                                              )}–${formatMinuteToHHMM(
                                                alloc.endMinute
                                              )}`
                                            : formatMinuteToHHMM(
                                                alloc.startMinute
                                              )}
                                        </span>
                                      )}
                                    </div>

                                    {/* Quick Pin & Done actions visible on hover when space permits */}
                                    {barWidthPx >= 64 && !isDone && primaryAlloc && (
                                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
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
                                              ? "Unpin slot"
                                              : "Pin slot"
                                          }
                                          className="p-0.5 rounded bg-black/20 hover:bg-black/40"
                                        >
                                          {alloc.isPinned ? (
                                            <Lock className="w-2.5 h-2.5" />
                                          ) : (
                                            <Unlock className="w-2.5 h-2.5" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isCompleting}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setCompletingKey(row.key);
                                            try {
                                              await onCompleteAllocation(alloc);
                                            } finally {
                                              setCompletingKey(null);
                                            }
                                          }}
                                          title="Mark Done in /index"
                                          className="p-0.5 rounded bg-black/20 hover:bg-emerald-600/80"
                                        >
                                          {isCompleting ? (
                                            <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                                          ) : (
                                            <Check className="w-2.5 h-2.5" />
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                            {/* Unplaced Overflow Indicator */}
                            {row.status === "unplaced" &&
                              ((row.targetDate && row.targetDate === day.dateString) ||
                                (!row.targetDate &&
                                  day.dateString === weekDates[0])) && (
                                <div
                                  title={`Unplaced Overflow (${row.durationMins}m)`}
                                  className="mx-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/45 text-rose-300 text-[9px] font-semibold flex items-center gap-1 truncate w-full z-10"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    Overflow ({row.durationMins}m)
                                  </span>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Excel-Like Column Filter Popover Portal */}
      {openFilterMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={filterMenuRef}
            style={{
              top: `${openFilterMenu.top}px`,
              left: `${openFilterMenu.left}px`,
              width: "236px",
            }}
            className="fixed z-50 rounded-xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-2.5 text-xs text-foreground flex flex-col gap-2"
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="font-semibold text-[11px]">
                Filter:{" "}
                {COLUMNS.find((c) => c.id === openFilterMenu.column)?.label}
              </span>
              <button
                type="button"
                onClick={() => setOpenFilterMenu(null)}
                className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground"
                aria-label="Close filter menu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Sort Buttons (Excel-style) */}
            <div className="flex flex-col gap-1 border-b border-border/50 pb-2">
              <button
                type="button"
                onClick={() =>
                  setColumnExplicitSort(openFilterMenu.column, "asc")
                }
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-left transition-colors ${
                  openMenuSort?.dir === "asc"
                    ? "bg-primary/15 text-primary font-semibold"
                    : "hover:bg-muted/50"
                }`}
              >
                <ArrowUp className="w-3 h-3" />
                Sort Ascending
              </button>
              <button
                type="button"
                onClick={() =>
                  setColumnExplicitSort(openFilterMenu.column, "desc")
                }
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-left transition-colors ${
                  openMenuSort?.dir === "desc"
                    ? "bg-primary/15 text-primary font-semibold"
                    : "hover:bg-muted/50"
                }`}
              >
                <ArrowDown className="w-3 h-3" />
                Sort Descending
              </button>
              {openMenuSort && (
                <button
                  type="button"
                  onClick={() =>
                    setColumnExplicitSort(openFilterMenu.column, null)
                  }
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-left text-muted-foreground hover:bg-muted/50"
                >
                  <X className="w-3 h-3" />
                  Remove Column Sort
                </button>
              )}
            </div>

            {/* Value Search */}
            <div className="relative">
              <Search className="w-3 h-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filterMenuSearch}
                onChange={(e) => setFilterMenuSearch(e.target.value)}
                placeholder="Search values..."
                className="w-full glass-input rounded-lg pl-6 pr-2 py-1 text-[11px] outline-none"
              />
            </div>

            {/* Select All / Clear All */}
            <div className="flex items-center justify-between text-[10px] px-0.5">
              <button
                type="button"
                onClick={() => selectAllColumnFilter(openFilterMenu.column)}
                className="text-primary hover:underline font-medium"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() =>
                  clearAllColumnFilterValues(openFilterMenu.column)
                }
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear All
              </button>
            </div>

            {/* Distinct Value Checkboxes */}
            <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5 pr-1">
              {openMenuOptions.length === 0 ? (
                <div className="py-3 text-center text-[10px] text-muted-foreground">
                  No matching values
                </div>
              ) : (
                openMenuOptions.map((opt) => {
                  const checked =
                    openMenuAllowedSet === undefined ||
                    openMenuAllowedSet.has(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-md hover:bg-muted/40 cursor-pointer text-[11px]"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleFilterValue(openFilterMenu.column, opt.value)
                          }
                          className="rounded border-border accent-primary shrink-0"
                        />
                        <span className="truncate">{opt.value}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {opt.count}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
              <button
                type="button"
                onClick={() => {
                  selectAllColumnFilter(openFilterMenu.column);
                  setOpenFilterMenu(null);
                }}
                className="px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:bg-muted/50"
              >
                Reset Filter
              </button>
              <button
                type="button"
                onClick={() => setOpenFilterMenu(null)}
                className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
