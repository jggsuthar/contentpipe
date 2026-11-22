import type {
  DbCalendarDateOverride,
  DbPersonalTodo,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  ResistanceLevel,
} from "@/types/database";
import type {
  AllocationSourceType,
  DatedSolverResult,
  SchedulerTaskInput,
  SolvedAllocation,
  UnplacedTask,
  ZoneUtilizationReport,
} from "@/lib/scheduler-engine";

export type ScheduleViewMode = "calendar" | "gantt" | "template";

export interface TeamRoleOption {
  id: string;
  name: string;
  email: string;
  role_title: string;
}

export interface CustomSlotEntry {
  zoneId: string;
  startMinute: number;
  endMinute: number;
}

export interface ScheduleOverrideItem extends DbCalendarDateOverride {
  customSlots?: CustomSlotEntry[] | null;
}

export interface PersonalTodoItem extends Omit<DbPersonalTodo, "eligibleZoneIds" | "createdAt"> {
  eligibleZoneIds: string[];
  createdAt?: string | Date;
}

export const DEFAULT_WORK_START_MINUTE = 480; // 08:00 AM
export const DEFAULT_WORK_END_MINUTE = 1080; // 06:00 PM
export const OPEN_WORKDAY_ZONE_ID = "__open_workday__";

export interface ZoneDeleteImpactWorkflowTask {
  id: string;
  taskName: string;
  durationMins: number;
  seriesId: string;
  seriesName: string;
  brandName: string;
  brandColor: string | null;
  currentEligibleZoneIds: string[];
}

export interface ZoneDeleteImpactTodo {
  id: string;
  title: string;
  durationMins: number;
  targetDate: string | null;
  status: string;
  currentEligibleZoneIds: string[];
}

export interface ZoneDeleteImpactResponse {
  zone: DbScheduleZone;
  workflowTasks: ZoneDeleteImpactWorkflowTask[];
  personalTodos: ZoneDeleteImpactTodo[];
  slotCount: number;
  pinnedCount: number;
}

export interface ScheduleZonesPayload {
  zones: (DbScheduleZone & { weeklySlots?: DbWeeklyZoneSlot[] })[];
  slots: (DbWeeklyZoneSlot & {
    zone?: Pick<DbScheduleZone, "id" | "name" | "color" | "icon">;
  })[];
  dayBounds?: DbWeeklyDayBounds[];
}

export interface SolveApiResponse extends DatedSolverResult {
  userId: string;
  startDate: string;
  endDate: string;
}

export interface ScheduleDragPayload {
  kind: "allocation" | "unplaced" | "todo";
  allocationId?: string;
  sourceType: AllocationSourceType;
  sourceId: string;
  title: string;
  taskName: string;
  durationMins: number;
  setupMins: number;
  targetDate: string | null;
  eligibleZoneIds: string[];
}

export type {
  AllocationSourceType,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  ResistanceLevel,
  SchedulerTaskInput,
  SolvedAllocation,
  UnplacedTask,
  ZoneUtilizationReport,
};

export const DAY_LABELS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_LABELS_UPPER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const ZONE_COLOR_PALETTE = [
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#84cc16", // Lime
  "#f97316", // Orange
];

export const ZONE_ICON_OPTIONS = [
  "Brain",
  "Video",
  "Film",
  "Briefcase",
  "Mic",
  "PenTool",
  "Sparkles",
  "Layers",
  "Laptop",
  "Camera",
] as const;

export const RESISTANCE_BADGES: Record<
  ResistanceLevel,
  { label: string; badgeClass: string }
> = {
  HIGH: {
    label: "High",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  MEDIUM: {
    label: "Med",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  LOW: {
    label: "Low",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
};

export function formatLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateStrLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysLocal(dateStr: string, deltaDays: number): string {
  const dt = parseDateStrLocal(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalDateStr(dt);
}

export function getMondayOfWeek(date: Date = new Date()): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = copy.getDay(); // 0=SUN..6=SAT
  const diffToMon = (jsDay + 6) % 7;
  copy.setDate(copy.getDate() - diffToMon);
  return formatLocalDateStr(copy);
}

export function getWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysLocal(mondayStr, i));
}

export function formatWeekRangeLabel(mondayStr: string): string {
  const start = parseDateStrLocal(mondayStr);
  const end = parseDateStrLocal(addDaysLocal(mondayStr, 6));
  const startFmt = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const endFmt = end.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${startFmt} – ${endFmt}`;
}

export function formatDayColumnHeader(dateStr: string): {
  weekday: string;
  monthDay: string;
} {
  const dt = parseDateStrLocal(dateStr);
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return { weekday, monthDay };
}

export function formatMinuteToHHMM(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatMinuteTo12h(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)));
  if (clamped === 1440 || clamped === 0) return clamped === 1440 ? "12a" : "12a";
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const suffix = h24 >= 12 ? "p" : "a";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatMinsCompact(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatMinsAsHours(mins: number): string {
  return `${(mins / 60).toFixed(1)}h`;
}

export function parseHHMMToMinute(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 540;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export function getDayIndexMon0(dateStr: string): number {
  const dt = parseDateStrLocal(dateStr);
  return (dt.getDay() + 6) % 7;
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `rgba(99, 102, 241, ${alpha})`;
}
