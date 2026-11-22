"use client";

import { useState, useRef, useEffect } from "react";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Eraser,
  Layers,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  DAY_LABELS_SHORT,
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  ZONE_COLOR_PALETTE,
  ZONE_ICON_OPTIONS,
  ZoneDeleteImpactResponse,
  formatMinsCompact,
  formatMinuteTo12h,
  formatMinuteToHHMM,
  hexToRgba,
  parseHHMMToMinute,
} from "./schedule-types";
import { ZoneIcon } from "./zone-icon";

interface ZoneTemplateDesignerProps {
  zones: DbScheduleZone[];
  slots: DbWeeklyZoneSlot[];
  dayBounds: DbWeeklyDayBounds[];
  targetUserId: string;
  onRefresh: () => Promise<void>;
}

const START_HOUR = 6;
const END_HOUR = 24;
const MIN_MINUTE = START_HOUR * 60; // 360 (6:00 AM)
const MAX_MINUTE = END_HOUR * 60; // 1440 (12:00 AM)
const TOTAL_GRID_MINS = MAX_MINUTE - MIN_MINUTE; // 1080
const PAINT_SNAP_MINS = 15;
const MIN_SLOT_SPAN = 15;
const MIN_ACTIVE_DAY_SPAN = 30;

type PresetId = "youtube_maker" | "deep_work" | "ultradian_90";

interface PresetDefinition {
  id: PresetId;
  name: string;
  subtitle: string;
  blocks: {
    zoneRole: "focus" | "studio" | "edit" | "admin";
    days: number[];
    startMinute: number;
    endMinute: number;
  }[];
}

const SCHEDULE_PRESETS: PresetDefinition[] = [
  {
    id: "youtube_maker",
    name: "YouTube Maker Week",
    subtitle: "Mornings focus/script · Tue/Thu studio · Mon/Wed/Fri edit · 4p admin",
    blocks: [
      { zoneRole: "focus", days: [0, 1, 2, 3, 4], startMinute: 540, endMinute: 720 },
      { zoneRole: "edit", days: [0, 2, 4], startMinute: 780, endMinute: 990 },
      { zoneRole: "studio", days: [1, 3], startMinute: 810, endMinute: 1020 },
      { zoneRole: "admin", days: [0, 1, 2, 3, 4], startMinute: 1020, endMinute: 1080 },
    ],
  },
  {
    id: "deep_work",
    name: "Cal Newport Deep Work",
    subtitle: "3h uninterrupted morning focus + afternoon build & admin shutdown",
    blocks: [
      { zoneRole: "focus", days: [0, 1, 2, 3, 4], startMinute: 510, endMinute: 690 },
      { zoneRole: "edit", days: [0, 1, 2, 3, 4], startMinute: 780, endMinute: 960 },
      { zoneRole: "admin", days: [0, 1, 2, 3, 4], startMinute: 960, endMinute: 1050 },
    ],
  },
  {
    id: "ultradian_90",
    name: "Ultradian 90m Sprints",
    subtitle: "Two 90m high-focus blocks with breaks + afternoon creation & batching",
    blocks: [
      { zoneRole: "focus", days: [0, 1, 2, 3, 4], startMinute: 510, endMinute: 600 },
      { zoneRole: "focus", days: [0, 1, 2, 3, 4], startMinute: 630, endMinute: 720 },
      { zoneRole: "studio", days: [1, 3], startMinute: 810, endMinute: 960 },
      { zoneRole: "edit", days: [0, 2, 4], startMinute: 810, endMinute: 960 },
      { zoneRole: "admin", days: [0, 1, 2, 3, 4], startMinute: 990, endMinute: 1050 },
    ],
  },
];

function snapMinute(min: number): number {
  const clamped = Math.max(MIN_MINUTE, Math.min(MAX_MINUTE, min));
  return Math.round(clamped / PAINT_SNAP_MINS) * PAINT_SNAP_MINS;
}

function matchZoneIdForRole(
  role: "focus" | "studio" | "edit" | "admin",
  zones: DbScheduleZone[]
): string {
  if (zones.length === 0) return "";
  const keywordMap: Record<typeof role, string[]> = {
    focus: ["deep", "focus", "script", "write", "ideat"],
    studio: ["film", "studio", "shoot", "record", "cam"],
    edit: ["edit", "bay", "post", "cut", "thumb"],
    admin: ["admin", "light", "ops", "publish", "email"],
  };
  const found = zones.find((z) =>
    keywordMap[role].some((kw) => z.name.toLowerCase().includes(kw))
  );
  if (found) return found.id;
  const fallbackIdx =
    role === "focus" ? 0 : role === "studio" ? 1 : role === "edit" ? 2 : 3;
  return zones[fallbackIdx % zones.length]?.id || zones[0].id;
}

/**
 * Carves overlapping portions of existing slots out and inserts new blocks for targetDays.
 */
function carveAndInsertSlots(
  existingSlots: DbWeeklyZoneSlot[],
  targetDays: number[],
  zoneId: string,
  startMinute: number,
  endMinute: number,
  boundsByDay: Map<number, { workStartMinute: number; workEndMinute: number }>
): { zoneId: string; dayOfWeek: number; startMinute: number; endMinute: number }[] {
  const result: {
    zoneId: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }[] = [];
  const targetDaySet = new Set(targetDays);

  for (const existing of existingSlots) {
    const b = boundsByDay.get(existing.dayOfWeek) || {
      workStartMinute: DEFAULT_WORK_START_MINUTE,
      workEndMinute: DEFAULT_WORK_END_MINUTE,
    };
    if (!targetDaySet.has(existing.dayOfWeek)) {
      result.push({
        zoneId: existing.zoneId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
      });
      continue;
    }

    const dayStart = Math.max(b.workStartMinute, startMinute);
    const dayEnd = Math.min(b.workEndMinute, endMinute);
    if (dayEnd - dayStart < MIN_SLOT_SPAN) {
      result.push({
        zoneId: existing.zoneId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
      });
      continue;
    }

    if (existing.endMinute <= dayStart || existing.startMinute >= dayEnd) {
      result.push({
        zoneId: existing.zoneId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
      });
    } else {
      if (existing.startMinute < dayStart && dayStart - existing.startMinute >= 5) {
        result.push({
          zoneId: existing.zoneId,
          dayOfWeek: existing.dayOfWeek,
          startMinute: existing.startMinute,
          endMinute: dayStart,
        });
      }
      if (existing.endMinute > dayEnd && existing.endMinute - dayEnd >= 5) {
        result.push({
          zoneId: existing.zoneId,
          dayOfWeek: existing.dayOfWeek,
          startMinute: dayEnd,
          endMinute: existing.endMinute,
        });
      }
    }
  }

  for (const d of targetDays) {
    const b = boundsByDay.get(d) || {
      workStartMinute: DEFAULT_WORK_START_MINUTE,
      workEndMinute: DEFAULT_WORK_END_MINUTE,
    };
    const dayStart = Math.max(b.workStartMinute, startMinute);
    const dayEnd = Math.min(b.workEndMinute, endMinute);
    if (dayEnd - dayStart >= MIN_SLOT_SPAN) {
      result.push({
        zoneId,
        dayOfWeek: d,
        startMinute: dayStart,
        endMinute: dayEnd,
      });
    }
  }

  // Merge adjacent same-zone intervals cleanly per day
  const merged: typeof result = [];
  for (let d = 0; d < 7; d++) {
    const dayList = result
      .filter((s) => s.dayOfWeek === d)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (const s of dayList) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.dayOfWeek === d &&
        prev.zoneId === s.zoneId &&
        prev.endMinute === s.startMinute
      ) {
        prev.endMinute = s.endMinute;
      } else {
        merged.push(s);
      }
    }
  }
  return merged;
}

export function ZoneTemplateDesigner({
  zones,
  slots,
  dayBounds,
  targetUserId,
  onRefresh,
}: ZoneTemplateDesignerProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    () => zones[0]?.id || ""
  );

  // Zone CRUD form state
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DbScheduleZone | null>(null);
  const [zoneNameInput, setZoneNameInput] = useState("");
  const [zoneColorInput, setZoneColorInput] = useState(ZONE_COLOR_PALETTE[0]);
  const [zoneIconInput, setZoneIconInput] = useState<string>("Brain");

  // Delete Zone Inspection & Reassignment Modal
  const [deleteInspect, setDeleteInspect] =
    useState<ZoneDeleteImpactResponse | null>(null);
  const [deleteLoadingZoneId, setDeleteLoadingZoneId] = useState<string | null>(
    null
  );
  const [reassignMode, setReassignMode] = useState<"any" | "specific">("any");
  const [reassignTargetZoneIds, setReassignTargetZoneIds] = useState<string[]>([]);

  // Multi-day guided block builder modal
  const [showAddBlockModal, setShowAddBlockModal] = useState(false);
  const [builderZoneId, setBuilderZoneId] = useState<string>("");
  const [builderDays, setBuilderDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [builderStartHHMM, setBuilderStartHHMM] = useState("09:00");
  const [builderEndHHMM, setBuilderEndHHMM] = useState("12:00");

  // Single-slot edit popover (supports multi-day copy!)
  const [editingSlot, setEditingSlot] = useState<DbWeeklyZoneSlot | null>(null);
  const [slotStartInput, setSlotStartInput] = useState("09:00");
  const [slotEndInput, setSlotEndInput] = useState("12:00");
  const [slotZoneInput, setSlotZoneInput] = useState("");
  const [slotApplyDays, setSlotApplyDays] = useState<number[]>([]);

  // Presets popover menu
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  // 2D Drag-Paint across multiple days & times
  const [dragPaint, setDragPaint] = useState<{
    anchorDay: number;
    currentDay: number;
    anchorMin: number;
    currentMin: number;
  } | null>(null);

  // Existing Slot Resize (vertical top/bottom OR horizontal across days)
  const [resizeDrag, setResizeDrag] = useState<{
    slot: DbWeeklyZoneSlot;
    mode: "top" | "bottom" | "horizontal";
    previewStart: number;
    previewEnd: number;
    anchorDay: number;
    currentDay: number;
  } | null>(null);

  // No-Work Zone Boundary Drag (vertical per day)
  const [boundsDrag, setBoundsDrag] = useState<{
    dayOfWeek: number;
    edge: "top" | "bottom";
    previewWorkStart: number;
    previewWorkEnd: number;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "info" | "warn" | "ok";
    text: string;
  } | null>(null);

  const gridDaysContainerRef = useRef<HTMLDivElement | null>(null);

  const effectiveSelectedZoneId =
    zones.find((z) => z.id === selectedZoneId)?.id || zones[0]?.id || "";
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const boundsByDay = new Map<
    number,
    { workStartMinute: number; workEndMinute: number }
  >();
  for (let d = 0; d < 7; d++) {
    const found = dayBounds.find((b) => b.dayOfWeek === d);
    boundsByDay.set(d, {
      workStartMinute: found?.workStartMinute ?? DEFAULT_WORK_START_MINUTE,
      workEndMinute: found?.workEndMinute ?? DEFAULT_WORK_END_MINUTE,
    });
  }

  // Refs for window drag callbacks so listeners stay lightweight and avoid stale closures
  const dragStateRef = useRef({
    dragPaint,
    resizeDrag,
    boundsDrag,
    slots,
    boundsByDay,
    effectiveSelectedZoneId,
    targetUserId,
  });
  useEffect(() => {
    dragStateRef.current = {
      dragPaint,
      resizeDrag,
      boundsDrag,
      slots,
      boundsByDay,
      effectiveSelectedZoneId,
      targetUserId,
    };
  });

  const commitPainted2DRange = async (
    anchorDay: number,
    currentDay: number,
    rawStart: number,
    rawEnd: number
  ) => {
    const zId = dragStateRef.current.effectiveSelectedZoneId;
    if (!zId) {
      setFeedback({
        tone: "warn",
        text: "Create a Zone first before painting zone blocks (currently in Whole-Day Open Mode).",
      });
      return;
    }

    const startMinute = Math.min(rawStart, rawEnd);
    const endMinute = Math.max(rawStart, rawEnd);
    if (endMinute - startMinute < MIN_SLOT_SPAN) return;

    const minDay = Math.max(0, Math.min(anchorDay, currentDay));
    const maxDay = Math.min(6, Math.max(anchorDay, currentDay));
    const targetDays = Array.from(
      { length: maxDay - minDay + 1 },
      (_, idx) => minDay + idx
    );

    const updatedSlots = carveAndInsertSlots(
      dragStateRef.current.slots,
      targetDays,
      zId,
      startMinute,
      endMinute,
      dragStateRef.current.boundsByDay
    );

    if (updatedSlots.length === dragStateRef.current.slots.length && targetDays.length === 0) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: dragStateRef.current.targetUserId,
          slots: updatedSlots,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedback({ tone: "warn", text: data?.error || "Failed to paint zone block." });
      } else {
        const dayText =
          minDay === maxDay
            ? DAY_LABELS_SHORT[minDay]
            : `${DAY_LABELS_SHORT[minDay]}–${DAY_LABELS_SHORT[maxDay]}`;
        setFeedback({
          tone: "ok",
          text: `Assigned ${zoneById.get(zId)?.name || "Zone"} on ${dayText} (${formatMinuteTo12h(
            startMinute
          )}–${formatMinuteTo12h(endMinute)}).`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const commitVerticalResize = async (
    slot: DbWeeklyZoneSlot,
    newStart: number,
    newEnd: number
  ) => {
    if (newStart === slot.startMinute && newEnd === slot.endMinute) return;
    if (newEnd - newStart < MIN_SLOT_SPAN) return;

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "slot",
          slotId: slot.id,
          targetUserId: dragStateRef.current.targetUserId,
          zoneId: slot.zoneId,
          dayOfWeek: slot.dayOfWeek,
          startMinute: newStart,
          endMinute: newEnd,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedback({
          tone: "warn",
          text: data?.error || "Failed to resize block.",
        });
      } else {
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const commitHorizontalExtend = async (
    slot: DbWeeklyZoneSlot,
    anchorDay: number,
    currentDay: number
  ) => {
    const minDay = Math.max(0, Math.min(anchorDay, currentDay));
    const maxDay = Math.min(6, Math.max(anchorDay, currentDay));
    if (minDay === maxDay) return;

    const targetDays = Array.from(
      { length: maxDay - minDay + 1 },
      (_, idx) => minDay + idx
    );

    const updatedSlots = carveAndInsertSlots(
      dragStateRef.current.slots,
      targetDays,
      slot.zoneId,
      slot.startMinute,
      slot.endMinute,
      dragStateRef.current.boundsByDay
    );

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: dragStateRef.current.targetUserId,
          slots: updatedSlots,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedback({ tone: "warn", text: data?.error || "Failed to extend slot across days." });
      } else {
        setFeedback({
          tone: "ok",
          text: `Extended ${zoneById.get(slot.zoneId)?.name || "Zone"} (${formatMinuteTo12h(
            slot.startMinute
          )}–${formatMinuteTo12h(slot.endMinute)}) across ${DAY_LABELS_SHORT[minDay]}–${
            DAY_LABELS_SHORT[maxDay]
          }.`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const commitBoundsChange = async (
    dayOfWeek: number,
    workStartMinute: number,
    workEndMinute: number
  ) => {
    const prev = dragStateRef.current.boundsByDay.get(dayOfWeek);
    if (
      prev &&
      prev.workStartMinute === workStartMinute &&
      prev.workEndMinute === workEndMinute
    ) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "dayBounds",
          targetUserId: dragStateRef.current.targetUserId,
          dayOfWeek,
          workStartMinute,
          workEndMinute,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedback({
          tone: "warn",
          text: data?.error || "Failed to update working hours.",
        });
      } else {
        setFeedback({
          tone: "ok",
          text: `Updated ${DAY_LABELS_SHORT[dayOfWeek]} active hours to ${formatMinuteTo12h(
            workStartMinute
          )}–${formatMinuteTo12h(workEndMinute)} (No-Work Zones trimmed any overlapping zone blocks).`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const isDraggingAnything = Boolean(dragPaint || resizeDrag || boundsDrag);

  useEffect(() => {
    if (!isDraggingAnything) return;

    const getCoords = (clientX: number, clientY: number) => {
      const container = gridDaysContainerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const minute = snapMinute(MIN_MINUTE + ratioY * TOTAL_GRID_MINS);
      const ratioX = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
      const dayIdx = Math.max(0, Math.min(6, Math.floor(ratioX * 7)));
      return { minute, dayIdx };
    };

    const handleWindowMove = (e: MouseEvent) => {
      const coords = getCoords(e.clientX, e.clientY);
      if (!coords) return;
      const st = dragStateRef.current;

      if (st.boundsDrag) {
        const { dayOfWeek, edge, previewWorkStart, previewWorkEnd } = st.boundsDrag;
        if (edge === "top") {
          const nextStart = Math.max(
            MIN_MINUTE,
            Math.min(previewWorkEnd - MIN_ACTIVE_DAY_SPAN, coords.minute)
          );
          setBoundsDrag((prev) =>
            prev ? { ...prev, previewWorkStart: nextStart } : null
          );
        } else {
          const nextEnd = Math.min(
            MAX_MINUTE,
            Math.max(previewWorkStart + MIN_ACTIVE_DAY_SPAN, coords.minute)
          );
          setBoundsDrag((prev) =>
            prev ? { ...prev, previewWorkEnd: nextEnd } : null
          );
        }
        void dayOfWeek;
        return;
      }

      if (st.resizeDrag) {
        const { slot, mode, previewStart, previewEnd } = st.resizeDrag;
        if (mode === "horizontal") {
          setResizeDrag((prev) =>
            prev ? { ...prev, currentDay: coords.dayIdx } : null
          );
          return;
        }

        const dayBound = st.boundsByDay.get(slot.dayOfWeek) || {
          workStartMinute: DEFAULT_WORK_START_MINUTE,
          workEndMinute: DEFAULT_WORK_END_MINUTE,
        };
        const others = st.slots.filter(
          (s) => s.dayOfWeek === slot.dayOfWeek && s.id !== slot.id
        );

        if (mode === "bottom") {
          const neighborMin = others
            .filter((s) => s.startMinute >= previewStart)
            .reduce((minS, s) => Math.min(minS, s.startMinute), dayBound.workEndMinute);
          const maxBound = Math.min(dayBound.workEndMinute, neighborMin);
          const clampedEnd = Math.min(
            maxBound,
            Math.max(previewStart + MIN_SLOT_SPAN, coords.minute)
          );
          setResizeDrag((prev) =>
            prev ? { ...prev, previewEnd: clampedEnd } : null
          );
        } else {
          const neighborMax = others
            .filter((s) => s.endMinute <= previewEnd)
            .reduce((maxE, s) => Math.max(maxE, s.endMinute), dayBound.workStartMinute);
          const minBound = Math.max(dayBound.workStartMinute, neighborMax);
          const clampedStart = Math.max(
            minBound,
            Math.min(previewEnd - MIN_SLOT_SPAN, coords.minute)
          );
          setResizeDrag((prev) =>
            prev ? { ...prev, previewStart: clampedStart } : null
          );
        }
        return;
      }

      if (st.dragPaint) {
        const anchorBounds = st.boundsByDay.get(st.dragPaint.anchorDay) || {
          workStartMinute: DEFAULT_WORK_START_MINUTE,
          workEndMinute: DEFAULT_WORK_END_MINUTE,
        };
        const clampedMin = Math.max(
          anchorBounds.workStartMinute,
          Math.min(anchorBounds.workEndMinute, coords.minute)
        );
        setDragPaint((prev) =>
          prev
            ? {
                ...prev,
                currentDay: coords.dayIdx,
                currentMin: clampedMin,
              }
            : null
        );
      }
    };

    const handleWindowUp = () => {
      const st = dragStateRef.current;

      if (st.boundsDrag) {
        const { dayOfWeek, previewWorkStart, previewWorkEnd } = st.boundsDrag;
        setBoundsDrag(null);
        void commitBoundsChange(dayOfWeek, previewWorkStart, previewWorkEnd);
        return;
      }

      if (st.resizeDrag) {
        const { slot, mode, previewStart, previewEnd, anchorDay, currentDay } =
          st.resizeDrag;
        setResizeDrag(null);
        if (mode === "horizontal") {
          void commitHorizontalExtend(slot, anchorDay, currentDay);
        } else {
          void commitVerticalResize(slot, previewStart, previewEnd);
        }
        return;
      }

      if (st.dragPaint) {
        const { anchorDay, currentDay, anchorMin, currentMin } = st.dragPaint;
        setDragPaint(null);
        void commitPainted2DRange(anchorDay, currentDay, anchorMin, currentMin);
      }
    };

    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingAnything]);

  // Find adjacent same-zone slots that can be collapsed
  const mergeablePairs: {
    dayOfWeek: number;
    first: DbWeeklyZoneSlot;
    second: DbWeeklyZoneSlot;
  }[] = [];
  for (let d = 0; d < 7; d++) {
    const daySlots = slots
      .filter((s) => s.dayOfWeek === d)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 0; i < daySlots.length - 1; i++) {
      if (
        daySlots[i].zoneId === daySlots[i + 1].zoneId &&
        daySlots[i].endMinute === daySlots[i + 1].startMinute
      ) {
        mergeablePairs.push({
          dayOfWeek: d,
          first: daySlots[i],
          second: daySlots[i + 1],
        });
      }
    }
  }

  const openCreateZone = () => {
    setEditingZone(null);
    setZoneNameInput("");
    setZoneColorInput(
      ZONE_COLOR_PALETTE[zones.length % ZONE_COLOR_PALETTE.length]
    );
    setZoneIconInput("Briefcase");
    setShowZoneForm(true);
  };

  const openEditZone = (zone: DbScheduleZone) => {
    setEditingZone(zone);
    setZoneNameInput(zone.name);
    setZoneColorInput(zone.color);
    setZoneIconInput(zone.icon || "Briefcase");
    setShowZoneForm(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = zoneNameInput.trim();
    if (!trimmed) {
      setFeedback({ tone: "warn", text: "Please enter a Zone name." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: editingZone ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingZone ? { id: editingZone.id } : {}),
          targetUserId,
          name: trimmed,
          color: zoneColorInput,
          icon: zoneIconInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ tone: "warn", text: data?.error || "Failed to save zone." });
      } else {
        if (data.zone?.id) {
          setSelectedZoneId(data.zone.id);
        }
        setShowZoneForm(false);
        setFeedback({
          tone: "ok",
          text: editingZone
            ? `Updated zone "${trimmed}".`
            : `Created "${trimmed}" & selected it as your active paint brush.`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const initiateDeleteZone = async (zone: DbScheduleZone) => {
    setDeleteLoadingZoneId(zone.id);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/schedule/zones?inspectDeleteId=${encodeURIComponent(
          zone.id
        )}&targetUserId=${encodeURIComponent(targetUserId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          tone: "warn",
          text: data?.error || "Failed to inspect zone tasks before deletion.",
        });
        return;
      }
      const impact = data as ZoneDeleteImpactResponse;
      const otherZones = zones.filter((z) => z.id !== zone.id);
      setReassignMode(otherZones.length === 0 ? "any" : "specific");
      setReassignTargetZoneIds(otherZones.length > 0 ? [otherZones[0].id] : []);
      setDeleteInspect(impact);
    } finally {
      setDeleteLoadingZoneId(null);
    }
  };

  const handleConfirmDeleteZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteInspect) return;

    const totalTasks =
      deleteInspect.workflowTasks.length + deleteInspect.personalTodos.length;
    const otherZones = zones.filter((z) => z.id !== deleteInspect.zone.id);

    if (
      totalTasks > 0 &&
      reassignMode === "specific" &&
      otherZones.length > 0 &&
      reassignTargetZoneIds.length === 0
    ) {
      setFeedback({
        tone: "warn",
        text: "Select at least one replacement zone or choose 'Any Zone' for affected tasks.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deleteInspect.zone.id,
          targetUserId,
          reassignmentMode: otherZones.length === 0 ? "any" : reassignMode,
          targetZoneIds:
            reassignMode === "specific" ? reassignTargetZoneIds : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          tone: "warn",
          text: data?.error || "Failed to delete zone.",
        });
      } else {
        const deletedName = deleteInspect.zone.name;
        setDeleteInspect(null);
        setFeedback({
          tone: "info",
          text:
            otherZones.length === 0
              ? `Deleted "${deletedName}". All zones removed — active working hours now act as a single open zone.`
              : `Deleted "${deletedName}" and reassigned ${
                  (data.reassignedWorkflowTaskCount || 0) +
                  (data.reassignedTodoCount || 0)
                } task(s).`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const openMultiDayBlockModal = () => {
    setBuilderZoneId(effectiveSelectedZoneId || zones[0]?.id || "");
    setBuilderDays([0, 1, 2, 3, 4]);
    setBuilderStartHHMM("09:00");
    setBuilderEndHHMM("12:00");
    setShowAddBlockModal(true);
  };

  const handleApplyMultiDayBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetZone = builderZoneId || effectiveSelectedZoneId;
    if (!targetZone) {
      setFeedback({ tone: "warn", text: "Please choose a Zone." });
      return;
    }
    if (builderDays.length === 0) {
      setFeedback({ tone: "warn", text: "Select at least one day of the week." });
      return;
    }

    const startMin = parseHHMMToMinute(builderStartHHMM);
    const endMin = parseHHMMToMinute(builderEndHHMM);
    if (endMin - startMin < MIN_SLOT_SPAN) {
      setFeedback({
        tone: "warn",
        text: "End time must be at least 15 minutes after Start time.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const updatedSlots = carveAndInsertSlots(
        slots,
        builderDays,
        targetZone,
        startMin,
        endMin,
        boundsByDay
      );

      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, slots: updatedSlots }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFeedback({ tone: "warn", text: data?.error || "Failed to add blocks." });
      } else {
        setShowAddBlockModal(false);
        setFeedback({
          tone: "ok",
          text: `Added ${zoneById.get(targetZone)?.name || "Zone"} (${formatMinuteTo12h(
            startMin
          )}–${formatMinuteTo12h(endMin)}) across ${builderDays.length} day(s) inside working hours.`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleApplyPreset = async (preset: PresetDefinition) => {
    if (zones.length === 0) {
      setFeedback({ tone: "warn", text: "Create at least one Zone first." });
      return;
    }

    setBusy(true);
    setShowPresetMenu(false);
    setFeedback(null);
    try {
      const mappedSlots: {
        zoneId: string;
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
      }[] = [];

      for (const blk of preset.blocks) {
        const zId = matchZoneIdForRole(blk.zoneRole, zones);
        if (!zId) continue;
        for (const d of blk.days) {
          const b = boundsByDay.get(d) || {
            workStartMinute: DEFAULT_WORK_START_MINUTE,
            workEndMinute: DEFAULT_WORK_END_MINUTE,
          };
          const cs = Math.max(b.workStartMinute, blk.startMinute);
          const ce = Math.min(b.workEndMinute, blk.endMinute);
          if (ce - cs >= MIN_SLOT_SPAN) {
            mappedSlots.push({
              zoneId: zId,
              dayOfWeek: d,
              startMinute: cs,
              endMinute: ce,
            });
          }
        }
      }

      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, slots: mappedSlots }),
      });

      if (res.ok) {
        setFeedback({
          tone: "ok",
          text: `Applied "${preset.name}" weekly zone template.`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearAllSlots = async () => {
    setBusy(true);
    setShowPresetMenu(false);
    setFeedback(null);
    try {
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, slots: [] }),
      });
      if (res.ok) {
        setFeedback({
          tone: "info",
          text: "Cleared weekly zone slots. Note: when zones exist, unassigned hours accept no activities.",
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopyDayToWeekdays = async (sourceDayIdx: number) => {
    const sourceSlots = slots.filter((s) => s.dayOfWeek === sourceDayIdx);
    const sourceBounds = boundsByDay.get(sourceDayIdx) || {
      workStartMinute: DEFAULT_WORK_START_MINUTE,
      workEndMinute: DEFAULT_WORK_END_MINUTE,
    };

    setBusy(true);
    setFeedback(null);
    try {
      const targetDays = [0, 1, 2, 3, 4];

      // Sync Mon-Fri No-Work Zone bounds to match sourceDayIdx as well
      await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "dayBoundsBulk",
          targetUserId,
          dayBounds: targetDays.map((d) => ({
            dayOfWeek: d,
            workStartMinute: sourceBounds.workStartMinute,
            workEndMinute: sourceBounds.workEndMinute,
          })),
        }),
      });

      const preserved = slots
        .filter((s) => !targetDays.includes(s.dayOfWeek))
        .map((s) => ({
          zoneId: s.zoneId,
          dayOfWeek: s.dayOfWeek,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
        }));

      const replicated = targetDays.flatMap((d) =>
        sourceSlots.map((s) => ({
          zoneId: s.zoneId,
          dayOfWeek: d,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
        }))
      );

      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          slots: [...preserved, ...replicated],
        }),
      });
      if (res.ok) {
        setFeedback({
          tone: "ok",
          text: `Copied ${DAY_LABELS_SHORT[sourceDayIdx]}'s work hours & blocks across Mon–Fri.`,
        });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const openSlotEditor = (slot: DbWeeklyZoneSlot) => {
    setEditingSlot(slot);
    setSlotStartInput(formatMinuteToHHMM(slot.startMinute));
    setSlotEndInput(formatMinuteToHHMM(slot.endMinute));
    setSlotZoneInput(slot.zoneId);
    setSlotApplyDays([slot.dayOfWeek]);
    setFeedback(null);
  };

  const handleSaveSlotEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;

    const nextStart = parseHHMMToMinute(slotStartInput);
    const nextEnd = parseHHMMToMinute(slotEndInput);
    if (nextEnd - nextStart < MIN_SLOT_SPAN) {
      setFeedback({
        tone: "warn",
        text: "End time must be at least 15 minutes after start time.",
      });
      return;
    }

    const applyDays =
      slotApplyDays.length > 0 ? slotApplyDays : [editingSlot.dayOfWeek];

    // If only editing the single original day, keep strict single-slot validation against No-Work Zone
    if (applyDays.length === 1 && applyDays[0] === editingSlot.dayOfWeek) {
      const bounds = boundsByDay.get(editingSlot.dayOfWeek) || {
        workStartMinute: DEFAULT_WORK_START_MINUTE,
        workEndMinute: DEFAULT_WORK_END_MINUTE,
      };
      if (nextStart < bounds.workStartMinute || nextEnd > bounds.workEndMinute) {
        setFeedback({
          tone: "warn",
          text: `Must stay inside active working hours (${formatMinuteTo12h(
            bounds.workStartMinute
          )}–${formatMinuteTo12h(bounds.workEndMinute)}).`,
        });
        return;
      }

      const overlaps = slots.some(
        (s) =>
          s.id !== editingSlot.id &&
          s.dayOfWeek === editingSlot.dayOfWeek &&
          nextStart < s.endMinute &&
          nextEnd > s.startMinute
      );
      if (overlaps) {
        setFeedback({
          tone: "warn",
          text: "Updated time range overlaps another zone slot on this day.",
        });
        return;
      }

      setBusy(true);
      setFeedback(null);
      try {
        const res = await fetch("/api/schedule/zones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "slot",
            slotId: editingSlot.id,
            targetUserId,
            zoneId: slotZoneInput,
            dayOfWeek: editingSlot.dayOfWeek,
            startMinute: nextStart,
            endMinute: nextEnd,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setFeedback({ tone: "warn", text: data?.error || "Failed to update slot." });
        } else {
          setEditingSlot(null);
          await onRefresh();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Applying across multiple days cleanly
    setBusy(true);
    setFeedback(null);
    try {
      const remainingWithoutEdited = slots.filter((s) => s.id !== editingSlot.id);
      const updatedSlots = carveAndInsertSlots(
        remainingWithoutEdited,
        applyDays,
        slotZoneInput,
        nextStart,
        nextEnd,
        boundsByDay
      );
      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, slots: updatedSlots }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFeedback({ tone: "warn", text: data?.error || "Failed to update blocks." });
      } else {
        setEditingSlot(null);
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/schedule/zones?type=slot&slotId=${encodeURIComponent(
          slotId
        )}&targetUserId=${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setEditingSlot(null);
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMergeAdjacentSlots = async () => {
    if (mergeablePairs.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const mergedList: {
        zoneId: string;
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
      }[] = [];

      for (let d = 0; d < 7; d++) {
        const daySorted = slots
          .filter((s) => s.dayOfWeek === d)
          .sort((a, b) => a.startMinute - b.startMinute);
        for (const s of daySorted) {
          const prev = mergedList[mergedList.length - 1];
          if (
            prev &&
            prev.dayOfWeek === d &&
            prev.zoneId === s.zoneId &&
            prev.endMinute === s.startMinute
          ) {
            prev.endMinute = s.endMinute;
          } else {
            mergedList.push({
              zoneId: s.zoneId,
              dayOfWeek: d,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
            });
          }
        }
      }

      const res = await fetch("/api/schedule/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, slots: mergedList }),
      });
      if (res.ok) {
        setFeedback({ tone: "ok", text: "Merged adjacent same-zone blocks cleanly." });
        await onRefresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const setDurationQuickChip = (mins: number) => {
    const startMin = parseHHMMToMinute(builderStartHHMM);
    const endMin = Math.min(1440, startMin + mins);
    setBuilderEndHHMM(formatMinuteToHHMM(endMin));
  };

  const hourTicks = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i
  );

  const weeklyTotalsByZone = zones.map((z) => {
    const totalMins = slots
      .filter((s) => s.zoneId === z.id)
      .reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
    return { zone: z, totalMins };
  });

  const paintDayMin = dragPaint
    ? Math.min(dragPaint.anchorDay, dragPaint.currentDay)
    : -1;
  const paintDayMax = dragPaint
    ? Math.max(dragPaint.anchorDay, dragPaint.currentDay)
    : -1;
  const paintTimeStart = dragPaint
    ? Math.min(dragPaint.anchorMin, dragPaint.currentMin)
    : 0;
  const paintTimeEnd = dragPaint
    ? Math.max(dragPaint.anchorMin, dragPaint.currentMin)
    : 0;

  const horizExtendDayMin =
    resizeDrag && resizeDrag.mode === "horizontal"
      ? Math.min(resizeDrag.anchorDay, resizeDrag.currentDay)
      : -1;
  const horizExtendDayMax =
    resizeDrag && resizeDrag.mode === "horizontal"
      ? Math.max(resizeDrag.anchorDay, resizeDrag.currentDay)
      : -1;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden p-3 gap-2.5">
      {/* Zone Brush, Quick Presets & Actions Strip */}
      <div className="glass-card rounded-2xl p-3 border border-border/50 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Weekly Zone Template Studio</span>
              <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-medium">
                2D Multi-Day Drag · Adjustable No-Work Zones
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Drag vertically &amp; horizontally across columns to paint multi-day zones, drag block edges to resize or extend across days, and drag top/bottom gray No-Work Zone bars to set daily working hours.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 relative">
            {mergeablePairs.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleMergeAdjacentSlots}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-400 text-[11px] font-medium hover:bg-amber-500/20 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                Merge {mergeablePairs.length} adjacent
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                disabled={zones.length === 0}
                onClick={() => setShowPresetMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-subtle border border-border/50 text-[11px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                title={
                  zones.length === 0
                    ? "Create at least one Zone to use presets"
                    : "Apply a weekly zone template preset"
                }
              >
                <Wand2 className="w-3.5 h-3.5 text-primary" />
                Apply Preset
              </button>

              {showPresetMenu && (
                <div className="absolute right-0 mt-1.5 w-80 z-40 glass-floating rounded-2xl border border-border/60 p-2 shadow-2xl space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    1-Click Weekly Presets
                  </div>
                  {SCHEDULE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={busy}
                      onClick={() => handleApplyPreset(preset)}
                      className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted/60 transition-colors space-y-0.5"
                    >
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-primary" />
                        {preset.name}
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {preset.subtitle}
                      </p>
                    </button>
                  ))}
                  <div className="border-t border-border/40 pt-1 mt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleClearAllSlots}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-rose-500/15 text-rose-400 text-[11px] font-medium flex items-center gap-1.5"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      Clear All Weekly Slots
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={zones.length === 0}
              onClick={openMultiDayBlockModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-subtle border border-border/50 text-[11px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-emerald-400" />
              + Add Multi-Day Block
            </button>

            <button
              type="button"
              onClick={openCreateZone}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/35 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Zone
            </button>
          </div>
        </div>

        {/* Zone Brush Selector Pills OR Whole-Day Single Zone Callout */}
        {zones.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] text-foreground">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />
              <span>
                <strong className="font-semibold">Whole Working Day Mode (0 custom zones):</strong>{" "}
                No zones defined — every day&apos;s active hours between Top &amp; Bottom{" "}
                <span className="font-semibold">NO WORK ZONE</span> boundaries act as one single open zone for all tasks.
              </span>
            </div>
            <button
              type="button"
              onClick={openCreateZone}
              className="px-2.5 py-1 rounded-lg bg-primary/20 border border-primary/40 text-primary text-[11px] font-semibold hover:bg-primary/25 shrink-0"
            >
              + Create Custom Zone
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Active Brush:
            </span>
            {weeklyTotalsByZone.map(({ zone, totalMins }) => {
              const active = effectiveSelectedZoneId === zone.id;
              const isInspecting = deleteLoadingZoneId === zone.id;
              return (
                <div
                  key={zone.id}
                  className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? "ring-2 ring-primary/50 shadow-sm text-foreground"
                      : "glass-subtle border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: hexToRgba(zone.color, 0.16),
                          borderColor: hexToRgba(zone.color, 0.55),
                        }
                      : undefined
                  }
                  onClick={() => setSelectedZoneId(zone.id)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  <ZoneIcon icon={zone.icon} className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium">{zone.name}</span>
                  <span className="text-[10px] opacity-75 ml-0.5 tabular-nums">
                    ({formatMinsCompact(totalMins)}/wk)
                  </span>
                  {active && (
                    <Check className="w-3 h-3 text-primary ml-0.5 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditZone(zone);
                    }}
                    title="Edit zone"
                    className="p-1 rounded-lg hover:bg-black/15 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isInspecting || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void initiateDeleteZone(zone);
                    }}
                    title="Delete zone & reassign tasks"
                    className="p-1 rounded-lg hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition-colors"
                  >
                    {isInspecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                </div>
              );
            })}
            <span className="text-[10px] text-muted-foreground/80 ml-auto">
              Unpainted hours between No-Work Zones accept 0 tasks
            </span>
          </div>
        )}

        {feedback && (
          <div
            className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-[11px] ${
              feedback.tone === "warn"
                ? "bg-amber-500/15 border-amber-500/35 text-amber-300"
                : feedback.tone === "ok"
                ? "bg-emerald-500/12 border-emerald-500/35 text-emerald-300"
                : "bg-sky-500/12 border-sky-500/35 text-sky-300"
            }`}
          >
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Inline Create/Edit Zone Panel with Live Chip Preview */}
      {showZoneForm && (
        <form
          onSubmit={handleSaveZone}
          className="glass-floating rounded-2xl p-3.5 border border-border/60 shrink-0 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              Zone Name
            </label>
            <input
              type="text"
              value={zoneNameInput}
              onChange={(e) => setZoneNameInput(e.target.value)}
              placeholder="e.g., Thumbnail Lab"
              className="glass-input w-full rounded-xl px-3 py-1.5 text-xs text-foreground outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              Color
            </label>
            <div className="flex items-center gap-1">
              {ZONE_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setZoneColorInput(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    zoneColorInput === c
                      ? "border-white scale-110"
                      : "border-transparent opacity-75 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              Icon
            </label>
            <div className="flex items-center gap-1">
              {ZONE_ICON_OPTIONS.map((iconKey) => (
                <button
                  key={iconKey}
                  type="button"
                  onClick={() => setZoneIconInput(iconKey)}
                  title={iconKey}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    zoneIconInput === iconKey
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ZoneIcon icon={iconKey} className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Live Zone Pill Preview */}
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-muted-foreground mb-1">
              Preview
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium text-foreground"
              style={{
                backgroundColor: hexToRgba(zoneColorInput, 0.2),
                borderColor: hexToRgba(zoneColorInput, 0.6),
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: zoneColorInput }}
              />
              <ZoneIcon icon={zoneIconInput} className="w-3.5 h-3.5" />
              <span>{zoneNameInput.trim() || "New Zone"}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              disabled={busy}
              className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
            >
              {editingZone ? "Update Zone" : "Create Zone"}
            </button>
            <button
              type="button"
              onClick={() => setShowZoneForm(false)}
              className="px-2.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Interactive 7-Day Template Grid */}
      <div className="flex-1 glass-card rounded-2xl border border-border/50 flex flex-col overflow-hidden min-h-0">
        {/* Column Day Headers */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border/40 shrink-0 bg-muted/20">
          <div className="px-2 py-2 text-[10px] font-semibold text-muted-foreground text-right border-r border-border/30 flex items-center justify-end">
            Time
          </div>
          {DAY_LABELS_SHORT.map((label, dayIdx) => {
            const bound = boundsByDay.get(dayIdx) || {
              workStartMinute: DEFAULT_WORK_START_MINUTE,
              workEndMinute: DEFAULT_WORK_END_MINUTE,
            };
            const effDayMins =
              zones.length === 0
                ? Math.max(0, bound.workEndMinute - bound.workStartMinute)
                : slots
                    .filter((s) => s.dayOfWeek === dayIdx)
                    .reduce(
                      (sum, s) =>
                        sum +
                        Math.max(
                          0,
                          Math.min(bound.workEndMinute, s.endMinute) -
                            Math.max(bound.workStartMinute, s.startMinute)
                        ),
                      0
                    );
            return (
              <div
                key={label}
                className="px-2 py-2 border-r last:border-r-0 border-border/30 flex items-center justify-between gap-1"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums truncate">
                    {formatMinsCompact(effDayMins)} · {formatMinuteTo12h(bound.workStartMinute)}–
                    {formatMinuteTo12h(bound.workEndMinute)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleCopyDayToWeekdays(dayIdx)}
                  title={`Copy ${label}'s working hours & blocks across Mon–Fri`}
                  className="p-1 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Scrollable 06:00–24:00 Painter Body */}
        <div className="flex-1 overflow-y-auto relative">
          <div
            className="grid grid-cols-[56px_minmax(0,1fr)] relative select-none"
            style={{ height: `${(END_HOUR - START_HOUR) * 46}px` }}
          >
            {/* Left Time Axis */}
            <div className="relative border-r border-border/30">
              {hourTicks.map((hr) => {
                const topPct = (((hr - START_HOUR) * 60) / TOTAL_GRID_MINS) * 100;
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

            {/* 7 Day Columns Wrapper (2D coordinate reference frame) */}
            <div
              ref={gridDaysContainerRef}
              className="grid grid-cols-7 relative"
            >
              {DAY_LABELS_SHORT.map((label, dayIdx) => {
                const dayBound = boundsByDay.get(dayIdx) || {
                  workStartMinute: DEFAULT_WORK_START_MINUTE,
                  workEndMinute: DEFAULT_WORK_END_MINUTE,
                };
                const effWorkStart =
                  boundsDrag?.dayOfWeek === dayIdx
                    ? boundsDrag.previewWorkStart
                    : dayBound.workStartMinute;
                const effWorkEnd =
                  boundsDrag?.dayOfWeek === dayIdx
                    ? boundsDrag.previewWorkEnd
                    : dayBound.workEndMinute;

                const daySlots = slots
                  .filter((s) => s.dayOfWeek === dayIdx)
                  .sort((a, b) => a.startMinute - b.startMinute);

                const in2DPaintRange =
                  dragPaint && dayIdx >= paintDayMin && dayIdx <= paintDayMax;
                const paintStartForCol = in2DPaintRange
                  ? Math.max(effWorkStart, paintTimeStart)
                  : 0;
                const paintEndForCol = in2DPaintRange
                  ? Math.min(effWorkEnd, paintTimeEnd)
                  : 0;

                const inHorizExtendRange =
                  resizeDrag &&
                  resizeDrag.mode === "horizontal" &&
                  dayIdx >= horizExtendDayMin &&
                  dayIdx <= horizExtendDayMax &&
                  dayIdx !== resizeDrag.anchorDay;
                const horizStartForCol = inHorizExtendRange
                  ? Math.max(effWorkStart, resizeDrag.slot.startMinute)
                  : 0;
                const horizEndForCol = inHorizExtendRange
                  ? Math.min(effWorkEnd, resizeDrag.slot.endMinute)
                  : 0;

                const activePaintZone = zoneById.get(effectiveSelectedZoneId);
                const horizExtendZone = resizeDrag
                  ? zoneById.get(resizeDrag.slot.zoneId)
                  : undefined;

                const clampedTopNoWorkEnd = Math.max(
                  MIN_MINUTE,
                  Math.min(MAX_MINUTE, effWorkStart)
                );
                const clampedBottomNoWorkStart = Math.max(
                  MIN_MINUTE,
                  Math.min(MAX_MINUTE, effWorkEnd)
                );

                return (
                  <div
                    key={label}
                    className={`relative border-r last:border-r-0 border-border/30 ${
                      zones.length > 0 ? "cursor-crosshair" : "cursor-default"
                    }`}
                    onMouseDown={(e) => {
                      if (
                        e.button !== 0 ||
                        resizeDrag ||
                        boundsDrag ||
                        zones.length === 0
                      ) {
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratioY = Math.max(
                        0,
                        Math.min(1, (e.clientY - rect.top) / rect.height)
                      );
                      const m = snapMinute(MIN_MINUTE + ratioY * TOTAL_GRID_MINS);
                      if (m < effWorkStart || m >= effWorkEnd) {
                        setFeedback({
                          tone: "warn",
                          text: "Zones cannot be placed inside a No-Work Zone. Drag the No-Work Zone handle first to expand working hours.",
                        });
                        return;
                      }
                      setDragPaint({
                        anchorDay: dayIdx,
                        currentDay: dayIdx,
                        anchorMin: m,
                        currentMin: Math.min(effWorkEnd, m + PAINT_SNAP_MINS * 2),
                      });
                    }}
                  >
                    {/* Hour Horizontal Hairlines */}
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

                    {/* Single Open Zone Overlay when 0 Zones Exist */}
                    {zones.length === 0 && effWorkEnd > effWorkStart && (
                      <div
                        className="absolute inset-x-1 rounded-xl border border-dashed border-indigo-400/35 bg-indigo-500/8 pointer-events-none flex flex-col items-center justify-center p-2 text-center"
                        style={{
                          top: `${
                            ((effWorkStart - MIN_MINUTE) / TOTAL_GRID_MINS) * 100
                          }%`,
                          height: `${
                            ((effWorkEnd - effWorkStart) / TOTAL_GRID_MINS) * 100
                          }%`,
                        }}
                      >
                        <span className="text-[10px] font-semibold text-indigo-300/90">
                          Whole Day Open Zone
                        </span>
                        <span className="text-[9px] text-indigo-200/70 tabular-nums mt-0.5">
                          {formatMinuteTo12h(effWorkStart)}–
                          {formatMinuteTo12h(effWorkEnd)}
                        </span>
                      </div>
                    )}

                    {/* Top Gray NO WORK ZONE + Bottom Resize Handle */}
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute inset-x-0 top-0 z-10 border-b-2 border-zinc-400/55 flex flex-col items-center justify-center text-center px-1 overflow-hidden select-none"
                      style={{
                        height: `${Math.max(
                          0,
                          ((clampedTopNoWorkEnd - MIN_MINUTE) / TOTAL_GRID_MINS) *
                            100
                        )}%`,
                        background:
                          "repeating-linear-gradient(-45deg, rgba(113,113,122,0.22), rgba(113,113,122,0.22) 6px, rgba(82,82,91,0.34) 6px, rgba(82,82,91,0.34) 12px)",
                      }}
                    >
                      {clampedTopNoWorkEnd - MIN_MINUTE >= 30 && (
                        <div className="bg-zinc-900/90 text-zinc-100 border border-zinc-500/60 rounded-md px-2 py-0.5 shadow-sm flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-zinc-100">
                            <Lock className="w-2.5 h-2.5" />
                            NO WORK ZONE
                          </span>
                          <span className="text-[9px] text-zinc-300 tabular-nums">
                            Until {formatMinuteTo12h(effWorkStart)}
                          </span>
                        </div>
                      )}
                      {/* Vertical drag handle at bottom edge of Top No-Work Zone */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setBoundsDrag({
                            dayOfWeek: dayIdx,
                            edge: "top",
                            previewWorkStart: effWorkStart,
                            previewWorkEnd: effWorkEnd,
                          });
                        }}
                        title={`Drag vertically to adjust morning start time (${formatMinuteTo12h(
                          effWorkStart
                        )})`}
                        className="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize flex items-center justify-center bg-zinc-900/40 hover:bg-primary/30 transition-colors"
                      >
                        <span className="w-12 h-1.5 rounded-full bg-zinc-200 shadow-sm" />
                      </div>
                    </div>

                    {/* Zero-Height Handle Strip if Top No-Work Zone Collapsed to 6AM */}
                    {clampedTopNoWorkEnd <= MIN_MINUTE && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setBoundsDrag({
                            dayOfWeek: dayIdx,
                            edge: "top",
                            previewWorkStart: effWorkStart,
                            previewWorkEnd: effWorkEnd,
                          });
                        }}
                        title="Drag down to add morning No-Work Zone"
                        className="absolute inset-x-0 top-0 h-3 z-20 cursor-ns-resize flex items-center justify-center bg-zinc-900/60 hover:bg-primary/40 transition-colors"
                      >
                        <span className="w-12 h-1.5 rounded-full bg-zinc-200 shadow-sm" />
                      </div>
                    )}

                    {/* Bottom Gray NO WORK ZONE + Top Resize Handle */}
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute inset-x-0 bottom-0 z-10 border-t-2 border-zinc-400/55 flex flex-col items-center justify-center text-center px-1 overflow-hidden select-none"
                      style={{
                        top: `${
                          ((clampedBottomNoWorkStart - MIN_MINUTE) /
                            TOTAL_GRID_MINS) *
                          100
                        }%`,
                        background:
                          "repeating-linear-gradient(-45deg, rgba(113,113,122,0.22), rgba(113,113,122,0.22) 6px, rgba(82,82,91,0.34) 6px, rgba(82,82,91,0.34) 12px)",
                      }}
                    >
                      {/* Vertical drag handle at top edge of Bottom No-Work Zone */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setBoundsDrag({
                            dayOfWeek: dayIdx,
                            edge: "bottom",
                            previewWorkStart: effWorkStart,
                            previewWorkEnd: effWorkEnd,
                          });
                        }}
                        title={`Drag vertically to adjust evening cutoff time (${formatMinuteTo12h(
                          effWorkEnd
                        )})`}
                        className="absolute inset-x-0 top-0 h-3 cursor-ns-resize flex items-center justify-center bg-zinc-900/40 hover:bg-primary/30 transition-colors"
                      >
                        <span className="w-12 h-1.5 rounded-full bg-zinc-200 shadow-sm" />
                      </div>
                      {MAX_MINUTE - clampedBottomNoWorkStart >= 30 && (
                        <div className="bg-zinc-900/90 text-zinc-100 border border-zinc-500/60 rounded-md px-2 py-0.5 shadow-sm flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-zinc-100">
                            <Lock className="w-2.5 h-2.5" />
                            NO WORK ZONE
                          </span>
                          <span className="text-[9px] text-zinc-300 tabular-nums">
                            After {formatMinuteTo12h(effWorkEnd)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Zero-Height Handle Strip if Bottom No-Work Zone Extended to 12AM */}
                    {clampedBottomNoWorkStart >= MAX_MINUTE && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setBoundsDrag({
                            dayOfWeek: dayIdx,
                            edge: "bottom",
                            previewWorkStart: effWorkStart,
                            previewWorkEnd: effWorkEnd,
                          });
                        }}
                        title="Drag up to set evening No-Work Zone"
                        className="absolute inset-x-0 bottom-0 h-3 z-20 cursor-ns-resize flex items-center justify-center bg-zinc-900/60 hover:bg-primary/40 transition-colors"
                      >
                        <span className="w-12 h-1.5 rounded-full bg-zinc-200 shadow-sm" />
                      </div>
                    )}

                    {/* Existing Painted Weekly Slots + Top/Bottom & Left/Right Drag Handles */}
                    {daySlots.map((slot) => {
                      const isBeingVertResized =
                        resizeDrag?.slot.id === slot.id &&
                        resizeDrag.mode !== "horizontal";
                      const isHorizAnchor =
                        resizeDrag?.slot.id === slot.id &&
                        resizeDrag.mode === "horizontal";

                      const rawStart = isBeingVertResized
                        ? resizeDrag.previewStart
                        : slot.startMinute;
                      const rawEnd = isBeingVertResized
                        ? resizeDrag.previewEnd
                        : slot.endMinute;

                      const zone = zoneById.get(slot.zoneId);
                      const clampedStart = Math.max(
                        MIN_MINUTE,
                        effWorkStart,
                        rawStart
                      );
                      const clampedEnd = Math.min(
                        MAX_MINUTE,
                        effWorkEnd,
                        rawEnd
                      );
                      if (clampedEnd <= clampedStart) return null;

                      const topPct =
                        ((clampedStart - MIN_MINUTE) / TOTAL_GRID_MINS) * 100;
                      const heightPct =
                        ((clampedEnd - clampedStart) / TOTAL_GRID_MINS) * 100;
                      const color = zone?.color || "#6366f1";
                      const durMins = clampedEnd - clampedStart;

                      return (
                        <div
                          key={slot.id}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!resizeDrag && !boundsDrag) openSlotEditor(slot);
                          }}
                          className={`group absolute inset-x-1 z-20 rounded-xl border px-2 py-1 cursor-pointer transition-colors hover:brightness-110 overflow-hidden flex flex-col justify-between ${
                            isBeingVertResized || isHorizAnchor
                              ? "z-30 ring-2 ring-white/75"
                              : ""
                          }`}
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            backgroundColor: hexToRgba(color, 0.24),
                            borderColor: hexToRgba(color, 0.65),
                          }}
                        >
                          {/* Top Vertical Resize Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizeDrag({
                                slot,
                                mode: "top",
                                previewStart: slot.startMinute,
                                previewEnd: slot.endMinute,
                                anchorDay: slot.dayOfWeek,
                                currentDay: slot.dayOfWeek,
                              });
                            }}
                            title="Drag vertically to adjust start time"
                            className="absolute inset-x-2 top-0 h-2 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="w-6 h-0.5 rounded-full bg-white/80" />
                          </div>

                          {/* Left Horizontal Extend Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizeDrag({
                                slot,
                                mode: "horizontal",
                                previewStart: slot.startMinute,
                                previewEnd: slot.endMinute,
                                anchorDay: slot.dayOfWeek,
                                currentDay: slot.dayOfWeek,
                              });
                            }}
                            title="Drag horizontally left/right to replicate across days"
                            className="absolute inset-y-2 left-0 w-2 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="w-0.5 h-5 rounded-full bg-white/80" />
                          </div>

                          {/* Right Horizontal Extend Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizeDrag({
                                slot,
                                mode: "horizontal",
                                previewStart: slot.startMinute,
                                previewEnd: slot.endMinute,
                                anchorDay: slot.dayOfWeek,
                                currentDay: slot.dayOfWeek,
                              });
                            }}
                            title="Drag horizontally left/right to replicate across days"
                            className="absolute inset-y-2 right-0 w-2 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="w-0.5 h-5 rounded-full bg-white/80" />
                          </div>

                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground truncate">
                              <ZoneIcon icon={zone?.icon} className="w-3 h-3 shrink-0" />
                              <span className="truncate">{zone?.name || "Zone"}</span>
                            </span>
                            <span className="text-[9px] font-semibold text-foreground/75 shrink-0">
                              {formatMinsCompact(durMins)}
                            </span>
                          </div>
                          <span className="text-[10px] text-foreground/85 tabular-nums">
                            {formatMinuteTo12h(clampedStart)}–
                            {formatMinuteTo12h(clampedEnd)}
                          </span>

                          {/* Bottom Vertical Resize Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setResizeDrag({
                                slot,
                                mode: "bottom",
                                previewStart: slot.startMinute,
                                previewEnd: slot.endMinute,
                                anchorDay: slot.dayOfWeek,
                                currentDay: slot.dayOfWeek,
                              });
                            }}
                            title="Drag vertically to adjust end time"
                            className="absolute inset-x-2 bottom-0 h-2 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="w-6 h-0.5 rounded-full bg-white/80" />
                          </div>
                        </div>
                      );
                    })}

                    {/* 2D Multi-Day Drag-Paint Ghost Preview */}
                    {in2DPaintRange && paintEndForCol > paintStartForCol && (
                      <div
                        className="absolute inset-x-1 z-30 rounded-xl border-2 border-dashed pointer-events-none px-2 py-1 flex flex-col justify-between"
                        style={{
                          top: `${
                            ((paintStartForCol - MIN_MINUTE) / TOTAL_GRID_MINS) *
                            100
                          }%`,
                          height: `${
                            ((paintEndForCol - paintStartForCol) /
                              TOTAL_GRID_MINS) *
                            100
                          }%`,
                          backgroundColor: hexToRgba(
                            activePaintZone?.color || "#6366f1",
                            0.32
                          ),
                          borderColor: activePaintZone?.color || "#6366f1",
                        }}
                      >
                        <span className="text-[10px] font-semibold text-foreground truncate">
                          {activePaintZone?.name || "Zone"} ·{" "}
                          {formatMinsCompact(paintEndForCol - paintStartForCol)}
                        </span>
                        <span className="text-[10px] text-foreground/90 tabular-nums">
                          {formatMinuteTo12h(paintStartForCol)}–
                          {formatMinuteTo12h(paintEndForCol)}
                        </span>
                      </div>
                    )}

                    {/* Horizontal Extend Ghost Preview */}
                    {inHorizExtendRange && horizEndForCol > horizStartForCol && (
                      <div
                        className="absolute inset-x-1 z-30 rounded-xl border-2 border-dashed pointer-events-none px-2 py-1 flex flex-col justify-between"
                        style={{
                          top: `${
                            ((horizStartForCol - MIN_MINUTE) / TOTAL_GRID_MINS) *
                            100
                          }%`,
                          height: `${
                            ((horizEndForCol - horizStartForCol) /
                              TOTAL_GRID_MINS) *
                            100
                          }%`,
                          backgroundColor: hexToRgba(
                            horizExtendZone?.color || "#6366f1",
                            0.32
                          ),
                          borderColor: horizExtendZone?.color || "#6366f1",
                        }}
                      >
                        <span className="text-[10px] font-semibold text-foreground truncate">
                          Extend {horizExtendZone?.name || "Zone"}
                        </span>
                        <span className="text-[10px] text-foreground/90 tabular-nums">
                          {formatMinuteTo12h(horizStartForCol)}–
                          {formatMinuteTo12h(horizEndForCol)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Zone & Reassign Tasks Modal */}
      {deleteInspect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !busy && setDeleteInspect(null)}
        >
          <form
            onSubmit={handleConfirmDeleteZone}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal w-full max-w-2xl rounded-2xl p-5 border border-border/60 space-y-4 shadow-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-start justify-between border-b border-border/40 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>Delete Zone:</span>
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs"
                      style={{
                        backgroundColor: hexToRgba(deleteInspect.zone.color, 0.2),
                        borderColor: hexToRgba(deleteInspect.zone.color, 0.5),
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: deleteInspect.zone.color }}
                      />
                      {deleteInspect.zone.name}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Removes {deleteInspect.slotCount} weekly block(s)
                    {deleteInspect.pinnedCount > 0
                      ? ` and updates ${deleteInspect.pinnedCount} pinned allocation(s)`
                      : ""}
                    . Review tasks referencing this zone below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteInspect(null)}
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Affected Tasks List with Series & Brand */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tasks Assigned to &ldquo;{deleteInspect.zone.name}&rdquo; (
                    {deleteInspect.workflowTasks.length +
                      deleteInspect.personalTodos.length}
                    )
                  </span>
                </div>

                {deleteInspect.workflowTasks.length === 0 &&
                deleteInspect.personalTodos.length === 0 ? (
                  <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    No workflow tasks or personal to-dos are assigned to this zone. Safe to delete immediately.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/40 text-[10px] font-semibold uppercase text-muted-foreground">
                          <th className="py-2 px-3">Brand</th>
                          <th className="py-2 px-3">Content Series</th>
                          <th className="py-2 px-3">Task Name</th>
                          <th className="py-2 px-3 text-right">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {deleteInspect.workflowTasks.map((wt) => (
                          <tr key={wt.id} className="hover:bg-muted/20">
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: wt.brandColor || "#6366f1",
                                  }}
                                />
                                {wt.brandName}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[11px] text-foreground/90">
                                {wt.seriesName}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-medium text-foreground">
                              {wt.taskName}
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {wt.durationMins}m
                              </span>
                            </td>
                          </tr>
                        ))}
                        {deleteInspect.personalTodos.map((td) => (
                          <tr key={td.id} className="hover:bg-muted/20">
                            <td className="py-2 px-3 text-muted-foreground">
                              Personal
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[11px]">
                                To-Do
                              </span>
                            </td>
                            <td className="py-2 px-3 font-medium text-foreground">
                              {td.title}
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                              {td.durationMins}m
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ownership Reassignment Selection */}
              {(deleteInspect.workflowTasks.length > 0 ||
                deleteInspect.personalTodos.length > 0) && (
                <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5 space-y-2.5">
                  <div className="text-xs font-semibold text-foreground">
                    Select New Zone Ownership for These Tasks
                  </div>
                  {zones.filter((z) => z.id !== deleteInspect.zone.id).length ===
                  0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      This is your last custom zone. After deletion, these tasks will automatically switch to{" "}
                      <strong className="text-foreground">Any / Whole Working Day</strong>{" "}
                      mode.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReassignMode("any");
                            setReassignTargetZoneIds([]);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                            reassignMode === "any"
                              ? "bg-primary/20 border-primary/50 text-primary"
                              : "glass-subtle border-border/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {reassignMode === "any" && (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Any Remaining Zone
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReassignMode("specific");
                            if (reassignTargetZoneIds.length === 0) {
                              const firstOther = zones.find(
                                (z) => z.id !== deleteInspect.zone.id
                              );
                              if (firstOther)
                                setReassignTargetZoneIds([firstOther.id]);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                            reassignMode === "specific"
                              ? "bg-primary/20 border-primary/50 text-primary"
                              : "glass-subtle border-border/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {reassignMode === "specific" && (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Select One or More Existing Zones
                        </button>
                      </div>

                      {reassignMode === "specific" && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {zones
                            .filter((z) => z.id !== deleteInspect.zone.id)
                            .map((z) => {
                              const picked = reassignTargetZoneIds.includes(z.id);
                              return (
                                <button
                                  key={z.id}
                                  type="button"
                                  onClick={() =>
                                    setReassignTargetZoneIds((prev) =>
                                      prev.includes(z.id)
                                        ? prev.filter((id) => id !== z.id)
                                        : [...prev, z.id]
                                    )
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                                    picked
                                      ? "ring-1 ring-primary/50 text-foreground"
                                      : "glass-subtle border-border/40 text-muted-foreground hover:text-foreground"
                                  }`}
                                  style={
                                    picked
                                      ? {
                                          backgroundColor: hexToRgba(z.color, 0.2),
                                          borderColor: hexToRgba(z.color, 0.6),
                                        }
                                      : undefined
                                  }
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: z.color }}
                                  />
                                  <ZoneIcon icon={z.icon} className="w-3 h-3" />
                                  <span>{z.name}</span>
                                  {picked && (
                                    <Check className="w-3 h-3 text-primary" />
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteInspect(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete Zone &amp; Reassign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Guided Multi-Day Block Builder Modal */}
      {showAddBlockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={() => setShowAddBlockModal(false)}
        >
          <form
            onSubmit={handleApplyMultiDayBlock}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal w-full max-w-md rounded-2xl p-5 border border-border/60 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Add Weekly Zone Block Across Days
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Blocks are automatically bounded by each day&apos;s No-Work Zones
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBlockModal(false)}
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Choose Zone
              </label>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => {
                  const active = (builderZoneId || effectiveSelectedZoneId) === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => setBuilderZoneId(z.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                        active
                          ? "text-foreground ring-1 ring-primary/50"
                          : "glass-subtle border-border/40 text-muted-foreground"
                      }`}
                      style={
                        active
                          ? {
                              backgroundColor: hexToRgba(z.color, 0.2),
                              borderColor: hexToRgba(z.color, 0.6),
                            }
                          : undefined
                      }
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: z.color }}
                      />
                      <ZoneIcon icon={z.icon} className="w-3 h-3" />
                      <span>{z.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Repeat on Days
                </label>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setBuilderDays([0, 1, 2, 3, 4])}
                    className="px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground"
                  >
                    Weekdays
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuilderDays([0, 1, 2, 3, 4, 5, 6])}
                    className="px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground"
                  >
                    All 7
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuilderDays([5, 6])}
                    className="px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-foreground"
                  >
                    Weekend
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS_SHORT.map((dLabel, idx) => {
                  const active = builderDays.includes(idx);
                  return (
                    <button
                      key={dLabel}
                      type="button"
                      onClick={() =>
                        setBuilderDays((prev) =>
                          prev.includes(idx)
                            ? prev.filter((x) => x !== idx)
                            : [...prev, idx].sort((a, b) => a - b)
                        )
                      }
                      className={`py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "glass-subtle border-border/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {dLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  step={900}
                  value={builderStartHHMM}
                  onChange={(e) => setBuilderStartHHMM(e.target.value)}
                  className="glass-input w-full rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  step={900}
                  value={builderEndHHMM}
                  onChange={(e) => setBuilderEndHHMM(e.target.value)}
                  className="glass-input w-full rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground mr-1">Quick Length:</span>
              {[60, 90, 120, 180, 240].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationQuickChip(m)}
                  className="px-2 py-0.5 rounded-lg glass-subtle border border-border/40 text-[10px] font-medium text-foreground hover:bg-muted/60"
                >
                  {formatMinsCompact(m)}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setShowAddBlockModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
              >
                Apply to {builderDays.length} Day(s)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Slot Quick Editor Popover Modal */}
      {editingSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setEditingSlot(null)}
        >
          <form
            onSubmit={handleSaveSlotEdit}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal w-full max-w-sm rounded-2xl p-4 border border-border/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">
                Edit {DAY_LABELS_SHORT[editingSlot.dayOfWeek]} Zone Slot
              </h3>
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Assigned Zone
              </label>
              <select
                value={slotZoneInput}
                onChange={(e) => setSlotZoneInput(e.target.value)}
                className="glass-input w-full rounded-xl px-3 py-1.5 text-xs text-foreground outline-none"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  step={900}
                  value={slotStartInput}
                  onChange={(e) => setSlotStartInput(e.target.value)}
                  className="glass-input w-full rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  step={900}
                  value={slotEndInput}
                  onChange={(e) => setSlotEndInput(e.target.value)}
                  className="glass-input w-full rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Apply to Days
              </label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS_SHORT.map((dLabel, idx) => {
                  const active = slotApplyDays.includes(idx);
                  return (
                    <button
                      key={dLabel}
                      type="button"
                      onClick={() =>
                        setSlotApplyDays((prev) =>
                          prev.includes(idx)
                            ? prev.filter((x) => x !== idx)
                            : [...prev, idx].sort((a, b) => a - b)
                        )
                      }
                      className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                        active
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "glass-subtle border-border/40 text-muted-foreground"
                      }`}
                    >
                      {dLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDeleteSlot(editingSlot.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-400 text-xs font-medium hover:bg-rose-500/25"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Block
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingSlot(null)}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
