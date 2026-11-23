"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  X,
  ExternalLink,
  ArrowDownToLine,
  GripHorizontal,
  Loader2,
} from "lucide-react";

export interface CalendarMonthData {
  index: number;
  year: number;
  month: number;
  label: string;
  firstDayOfWeek: number;
  daysCount: number;
}

export interface CalendarItemData {
  content_id: string | null;
  title: string;
  is_placeholder: boolean;
  is_manual_publish_date?: boolean;
  cadence_match?: { matches: boolean; reason: string };
  is_archived: boolean;
  publish_date: string;
  last_done_task_name: string | null;
  last_done_color: string | null;
  all_tasks_done: boolean;
}

export interface PublishCalendarProps {
  contentTypeId: string;
  contentTypeName?: string;
  mode: "docked" | "floating" | "minimized";
  onModeChange: (mode: "docked" | "floating" | "minimized" | "closed") => void;
  onSelectDate?: (dateStr: string, item?: CalendarItemData) => void;
}

const DAYS_OF_WEEK = ["S", "M", "T", "W", "T", "F", "S"];

export function PublishCalendar({
  contentTypeId,
  contentTypeName = "Content",
  mode,
  onModeChange,
  onSelectDate,
}: PublishCalendarProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<CalendarMonthData[]>([]);
  const [itemsByDate, setItemsByDate] = useState<Record<string, CalendarItemData>>({});
  const [workflowTasks, setWorkflowTasks] = useState<{ id: string; task_name: string; color: string }[]>([]);
  const [todayStr, setTodayStr] = useState<string>("");

  // Start month offset for 3-month viewing window (0 to 3)
  const [startMonthIdx, setStartMonthIdx] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Floating Window States
  const [floatingPos, setFloatingPos] = useState({ x: 80, y: 120 });
  const [floatingWidth, setFloatingWidth] = useState(780);
  const posRef = useRef({ x: 80, y: 120 });
  const widthRef = useRef(780);

  // DOM Refs for high-performance direct GPU transform manipulations
  const floatingContainerRef = useRef<HTMLDivElement>(null);
  const minimizedContainerRef = useRef<HTMLDivElement>(null);

  // Sync refs with state
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    posRef.current = floatingPos;
  }, [floatingPos]);

  useEffect(() => {
    widthRef.current = floatingWidth;
  }, [floatingWidth]);

  // Fetch 6-month calendar data
  useEffect(() => {
    let isCancelled = false;
    const fetchCalendarData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tracker/calendar?content_type_id=${encodeURIComponent(contentTypeId)}`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setMonths(data.months || []);
          setItemsByDate(data.itemsByDate || {});
          setWorkflowTasks(data.workflowTasks || []);
          setTodayStr(data.today || "");
        }
      } catch (err) {
        console.error("Error fetching publish calendar:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchCalendarData();
    return () => {
      isCancelled = true;
    };
  }, [contentTypeId]);

  // High-performance GPU Drag Engine (Zero React re-render lag)
  const isDraggingRef = useRef(false);
  const dragDataRef = useRef({
    startX: 0,
    startY: 0,
    originX: 80,
    originY: 120,
    hasMoved: false,
    rafId: 0,
  });

  const startDrag = (e: React.MouseEvent, isMinimized: boolean) => {
    if (e.button !== 0) return;
    // Don't drag if clicked on a button
    if ((e.target as HTMLElement).closest("button")) return;

    e.preventDefault();
    isDraggingRef.current = true;
    dragDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
      hasMoved: false,
      rafId: 0,
    };

    const targetEl = isMinimized ? minimizedContainerRef.current : floatingContainerRef.current;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragDataRef.current.startX;
      const dy = moveEvent.clientY - dragDataRef.current.startY;

      if (!dragDataRef.current.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragDataRef.current.hasMoved = true;
      }

      const maxX = Math.max(10, window.innerWidth - (isMinimized ? 160 : 300));
      const maxY = Math.max(10, window.innerHeight - (isMinimized ? 50 : 150));
      const nextX = Math.max(10, Math.min(maxX, dragDataRef.current.originX + dx));
      const nextY = Math.max(10, Math.min(maxY, dragDataRef.current.originY + dy));

      posRef.current = { x: nextX, y: nextY };

      if (dragDataRef.current.rafId) {
        cancelAnimationFrame(dragDataRef.current.rafId);
      }

      dragDataRef.current.rafId = requestAnimationFrame(() => {
        if (targetEl) {
          targetEl.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
        }
      });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (dragDataRef.current.rafId) {
        cancelAnimationFrame(dragDataRef.current.rafId);
      }

      setFloatingPos({ x: posRef.current.x, y: posRef.current.y });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Restore from Minimized to Floating with Screen Bounds Clamping
  const restoreToFloating = () => {
    const curX = posRef.current.x;
    const curY = posRef.current.y;
    const maxX = Math.max(10, window.innerWidth - widthRef.current - 20);
    const maxY = Math.max(10, window.innerHeight - 350);
    const clampedX = Math.max(10, Math.min(maxX, curX));
    const clampedY = Math.max(10, Math.min(maxY, curY));

    posRef.current = { x: clampedX, y: clampedY };
    setFloatingPos({ x: clampedX, y: clampedY });
    onModeChange("floating");
  };

  const handleMinimizedClick = () => {
    if (dragDataRef.current.hasMoved) return;
    restoreToFloating();
  };

  // High-performance GPU Horizontal Resizing Engine
  const isResizingRef = useRef(false);
  const resizeDataRef = useRef({ startX: 0, startWidth: 780, rafId: 0 });

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeDataRef.current = {
      startX: e.clientX,
      startWidth: widthRef.current,
      rafId: 0,
    };

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = moveEvent.clientX - resizeDataRef.current.startX;
      const maxW = Math.max(280, window.innerWidth - posRef.current.x - 20);
      const nextWidth = Math.max(280, Math.min(maxW, resizeDataRef.current.startWidth + dx));
      widthRef.current = nextWidth;

      if (resizeDataRef.current.rafId) {
        cancelAnimationFrame(resizeDataRef.current.rafId);
      }

      resizeDataRef.current.rafId = requestAnimationFrame(() => {
        if (floatingContainerRef.current) {
          floatingContainerRef.current.style.width = `${nextWidth}px`;
        }
      });
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (resizeDataRef.current.rafId) {
        cancelAnimationFrame(resizeDataRef.current.rafId);
      }

      setFloatingWidth(widthRef.current);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Month navigation
  const canGoPrev = startMonthIdx > 0;
  const canGoNext = startMonthIdx < Math.max(0, months.length - 3);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const idx = Math.round(scrollLeft / 244);
      setStartMonthIdx(Math.max(0, Math.min(months.length - 1, idx)));
    }
  };

  const handlePrevMonths = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -244, behavior: "smooth" });
    }
  };

  const handleNextMonths = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 244, behavior: "smooth" });
    }
  };

  // Render a single month's grid matching the exact format in the user's uploaded image
  const renderMonthGrid = (monthData: CalendarMonthData) => {
    const { year, month, label, firstDayOfWeek, daysCount } = monthData;

    // Total cells in standard 7-col grid (up to 6 rows = 42 cells)
    const totalSlots = Math.ceil((firstDayOfWeek + daysCount) / 7) * 7;
    const cells = [];

    for (let slot = 0; slot < totalSlots; slot++) {
      const dayNum = slot - firstDayOfWeek + 1;
      const isValidDay = dayNum >= 1 && dayNum <= daysCount;

      if (!isValidDay) {
        cells.push(
          <div
            key={`empty_${slot}`}
            className="h-8 border border-border/40 bg-muted/15"
          />
        );
        continue;
      }

      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const isToday = dateStr === todayStr;
      const isPassed = Boolean(todayStr && dateStr < todayStr);

      const contentItem = itemsByDate[dateStr];
      const hasContent = Boolean(contentItem);
      const isPlaceholder = contentItem?.is_placeholder;
      const taskDoneColor = contentItem?.last_done_color;

      // Styling matching user image:
      // - Passed dates: grayed out + strikethrough
      // - Content dates: underlined number + colored with last done task color
      let cellBg = "bg-card";
      let cellTextClass = "font-medium text-foreground";
      let cellStyle: React.CSSProperties = {};

      if (isPassed) {
        cellBg = "bg-[#e9ecef] dark:bg-muted/60 text-muted-foreground";
        cellTextClass = "line-through opacity-75";
      }

      if (hasContent) {
        if (!isPassed) {
          if (taskDoneColor) {
            cellStyle = {
              backgroundColor: taskDoneColor,
              color: "#000000",
            };
            cellBg = "";
            cellTextClass = "font-bold text-black";
          } else {
            // Open placeholder slot with no completed task yet: light amber tint like screenshot
            cellBg = "bg-[#fff2cc] dark:bg-amber-950/40 text-amber-950 dark:text-amber-200";
            cellTextClass = "font-bold";
          }
        }
      }

      cells.push(
        <div
          key={dateStr}
          onClick={() => onSelectDate && onSelectDate(dateStr, contentItem)}
          className={`h-8 border border-border flex items-center justify-center relative select-none transition-all ${cellBg} ${
            hasContent ? "cursor-pointer hover:ring-2 hover:ring-primary/80 hover:z-10" : ""
          } ${isToday ? "ring-2 ring-primary ring-inset font-bold" : ""}`}
          style={cellStyle}
          title={
            hasContent
              ? `${dateStr} • ${contentItem.content_id || "[Open Slot]"} - ${contentItem.title || "Untitled"}\nSchedule: ${
                  contentItem.is_manual_publish_date
                    ? "Manual Custom Slot"
                    : contentItem.cadence_match?.matches
                    ? "Cadence (Matched ✓)"
                    : `Cadence Mismatch ⚠️ (${contentItem.cadence_match?.reason || "Expected different day"})`
                }\nLast Done: ${contentItem.last_done_task_name || "None (Pending)"}`
              : dateStr
          }
        >
          <span className={`text-xs ${cellTextClass}`}>
            {hasContent ? (
              <u className="decoration-1 underline-offset-2 font-bold">{dayNum}</u>
            ) : (
              dayNum
            )}
          </span>
        </div>
      );
    }

    return (
      <div
        key={label}
        className="w-[230px] shrink-0 border border-border bg-card shadow-xs rounded-sm overflow-hidden flex flex-col font-sans"
      >
        {/* Month Header (Excel style light blue bar matching uploaded screenshot) */}
        <div className="py-1 px-2 text-center text-xs font-bold border-b border-border bg-[#cfe2f3] dark:bg-slate-800 text-slate-900 dark:text-slate-100 uppercase tracking-wider">
          {label}
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center text-[11px] font-bold border-b border-border bg-[#e8f1fa] dark:bg-slate-800/60 text-slate-800 dark:text-slate-200">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={`${label}_${d}_${i}`} className="py-0.5 border-r border-border/60 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Day Grid */}
        <div className="grid grid-cols-7 flex-1">
          {cells}
        </div>
      </div>
    );
  };

  // Common inner content
  const calendarContent = (
    <div className="flex flex-col h-full">
      {/* Calendar Top Toolbar */}
      <div
        onMouseDown={(e) => mode === "floating" && startDrag(e, false)}
        className={`flex items-center justify-between px-3 py-2 border-b border-border select-none ${
          mode === "floating"
            ? "bg-muted/80 cursor-grab active:cursor-grabbing"
            : "bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          {mode === "floating" && <GripHorizontal className="w-4 h-4 text-muted-foreground opacity-60" />}
          <CalendarIcon className="w-4 h-4 text-primary" />
          <span className="font-bold text-xs text-foreground font-display">
            6-Month Publish Calendar
          </span>
          <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
            ({contentTypeName})
          </span>
        </div>

        {/* Middle Month Pagination Controls */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={handlePrevMonths}
            disabled={!canGoPrev}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
            title="Previous Month Window"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-medium text-foreground px-1">
            {months[startMonthIdx]?.label}
            {months[startMonthIdx + 2]
              ? ` – ${months[startMonthIdx + 2]?.label}`
              : months[months.length - 1]
              ? ` – ${months[months.length - 1]?.label}`
              : ""}
          </span>

          <button
            type="button"
            onClick={handleNextMonths}
            disabled={!canGoNext}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
            title="Next Month Window"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Window Action Controls */}
        <div className="flex items-center gap-1">
          {mode === "docked" ? (
            <>
              <button
                type="button"
                onClick={() => onModeChange("floating")}
                className="hidden md:inline-flex p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Pop out to floating window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onModeChange("closed")}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Close calendar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onModeChange("minimized")}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Minimize floating calendar to icon"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onModeChange("docked")}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Put back calendar to header"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onModeChange("closed")}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Close calendar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Calendar Months Container with horizontal scroll */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="p-3 overflow-x-auto flex-1 flex gap-3.5 items-start scroll-smooth scrollbar-thin"
      >
        {loading ? (
          <div className="w-full py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-xs font-mono">Generating 6-month calendar matrix...</span>
          </div>
        ) : months.length === 0 ? (
          <div className="w-full py-8 text-center text-xs font-mono text-muted-foreground">
            No schedule calendar available.
          </div>
        ) : (
          months.map((m) => renderMonthGrid(m))
        )}
      </div>

      {/* Legend Footer */}
      {workflowTasks.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border bg-muted/30 flex flex-wrap items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span className="font-semibold text-foreground">Task Done Color Legend:</span>
          {workflowTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-xs border border-black/20"
                style={{ backgroundColor: t.color }}
              />
              <span>{t.task_name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-auto">
            <span className="w-2.5 h-2.5 bg-[#e9ecef] dark:bg-muted/60 line-through border border-border text-[9px] flex items-center justify-center">
              1
            </span>
            <span>Passed Date</span>
          </div>
        </div>
      )}
    </div>
  );

  // Render Mode 1: Docked Header Panel on Desktop / Bottom Sheet Overlay on Mobile
  if (mode === "docked") {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end md:bg-transparent md:backdrop-blur-none md:pointer-events-none md:inset-auto md:absolute md:top-full md:left-0 md:right-0 md:z-40 md:mt-2 md:flex md:justify-center md:px-2 animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onModeChange("closed");
        }}
      >
        <div className="w-full md:pointer-events-auto md:max-w-[790px] glass-floating backdrop-blur-2xl rounded-t-3xl md:rounded-2xl max-h-[82dvh] md:max-h-none pb-[env(safe-area-inset-bottom)] md:pb-0 overflow-hidden flex flex-col">
          <div className="md:hidden mobile-sheet-handle mt-2.5 mb-0.5" />
          {calendarContent}
        </div>
      </div>
    );
  }

  // Render Mode 2: Minimized Floating Icon (Rendered via React Portal onto document.body, on top of everything)
  if (mode === "minimized") {
    if (!mounted || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={minimizedContainerRef}
        style={{
          transform: `translate3d(${floatingPos.x}px, ${floatingPos.y}px, 0)`,
          willChange: "transform",
        }}
        className="fixed top-0 left-0 z-[99999] select-none"
      >
        <div
          onMouseDown={(e) => startDrag(e, true)}
          onClick={handleMinimizedClick}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full glass-floating backdrop-blur-2xl border-2 border-primary/45 text-foreground font-mono text-xs font-semibold cursor-grab active:cursor-grabbing hover:border-primary hover:shadow-primary/20 transition-all duration-200 group animate-in fade-in zoom-in-95"
          title="Click to expand calendar • Drag to reposition"
        >
          <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground" />
          <CalendarIcon className="w-4 h-4 text-primary" />
          <span className="font-bold">6M Calendar</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              restoreToFloating();
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors ml-0.5"
            title="Expand Calendar"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onModeChange("closed");
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Close Calendar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Render Mode 3: Floating Draggable & Horizontally Resizable Window (Rendered via React Portal onto document.body)
  if (mode === "floating") {
    if (!mounted || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={floatingContainerRef}
        style={{
          transform: `translate3d(${floatingPos.x}px, ${floatingPos.y}px, 0)`,
          width: `${floatingWidth}px`,
          willChange: "transform, width",
        }}
        className="fixed top-0 left-0 z-[99999] glass-floating backdrop-blur-2xl border-2 border-primary/45 rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        {calendarContent}

        {/* Right Edge Horizontal Resize Handle */}
        <div
          onMouseDown={handleMouseDownResize}
          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-primary/40 active:bg-primary/60 transition-colors z-20"
          title="Drag horizontally to adjust calendar width & number of visible months"
        />
      </div>,
      document.body
    );
  }

  return null;
}
