import type {
  DbCalendarDateOverride,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  ResistanceLevel,
} from "@/types/database";
import {
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  OPEN_WORKDAY_ZONE_ID,
  parseEligibleZoneIds,
} from "@/lib/schedule-seed";

// -------------------------------------------------------------
// Constants & Multipliers
// -------------------------------------------------------------
export const RESISTANCE_MULTIPLIERS: Record<ResistanceLevel, number> = {
  LOW: 1.0,
  MEDIUM: 2.0,
  HIGH: 3.5,
};

// -------------------------------------------------------------
// Date Utilities (UTC-safe YYYY-MM-DD arithmetic)
// -------------------------------------------------------------
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function formatDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const dt = parseDateString(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDateString(dt);
}

/**
 * Converts a YYYY-MM-DD date string to Monday-first day index: 0 = MON ... 6 = SUN.
 * Matches WeeklyZoneSlot.dayOfWeek.
 */
export function getDayOfWeekMon0(dateStr: string): number {
  const dt = parseDateString(dateStr);
  return (dt.getUTCDay() + 6) % 7;
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 366) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
    guard++;
  }
  return dates;
}

// -------------------------------------------------------------
// Public Solver Types
// -------------------------------------------------------------
export type AllocationSourceType =
  | "workflow_task"
  | "misc_task"
  | "action_item"
  | "personal_todo";

export interface SchedulerTaskInput {
  sourceType: AllocationSourceType;
  sourceId: string;
  workflowTaskId: string | null;
  title: string;
  taskName: string;
  contentItemId?: string | null;
  uniqueContentId?: string | null;
  contentTypeId?: string | null;
  contentTypeName?: string | null;
  contentTypeColor?: string | null;
  taskColor?: string | null;
  brandName?: string | null;
  brandColor?: string | null;
  sequenceOrder: number;
  durationMins: number;
  setupBufferMins: number;
  isSplittable: boolean;
  minSplitChunkMins: number;
  resistance: ResistanceLevel;
  eligibleZoneIds: string[];
  targetDate: string | null; // "YYYY-MM-DD"
  publishDate?: string | null;
  worstCaseTargetDate?: string | null;
  team1stTargetDate?: string | null;
  teamFinalTargetDate?: string | null;
  isDone: boolean;
}

export interface PinnedAllocationInput {
  id: string;
  userId: string;
  sourceType: AllocationSourceType;
  sourceId: string;
  dateString: string;
  startMinute: number;
  endMinute: number;
  setupMinsUsed: number;
  zoneId: string;
  isPinned: boolean;
  isVacationPreScheduled: boolean;
  originalTargetDate: string | null;
}

export interface SolvedAllocation {
  id: string;
  userId: string;
  sourceType: AllocationSourceType;
  sourceId: string;
  dateString: string;
  startMinute: number;
  endMinute: number;
  setupMinsUsed: number;
  zoneId: string;
  isPinned: boolean;
  isVacationPreScheduled: boolean;
  originalTargetDate: string | null;
  // Enriched display & analytics metadata
  title: string;
  taskName: string;
  workflowTaskId: string | null;
  contentItemId?: string | null;
  uniqueContentId?: string | null;
  contentTypeId?: string | null;
  contentTypeName?: string | null;
  contentTypeColor?: string | null;
  taskColor?: string | null;
  brandName?: string | null;
  brandColor?: string | null;
  sequenceOrder?: number;
  resistance: ResistanceLevel;
  durationMins: number;
  targetDate: string | null;
  publishDate?: string | null;
  worstCaseTargetDate?: string | null;
  team1stTargetDate?: string | null;
  teamFinalTargetDate?: string | null;
  isPartialChunk: boolean;
  eligibleZoneIds: string[];
  baseSetupBufferMins: number;
}

export interface UnplacedTask {
  sourceType: AllocationSourceType;
  sourceId: string;
  title: string;
  taskName: string;
  targetDate: string | null;
  publishDate?: string | null;
  worstCaseTargetDate?: string | null;
  team1stTargetDate?: string | null;
  teamFinalTargetDate?: string | null;
  missingMinutes: number;
  eligibleZoneIds: string[];
  reason: string;
  contentItemId?: string | null;
  uniqueContentId?: string | null;
  contentTypeName?: string | null;
  contentTypeColor?: string | null;
  taskColor?: string | null;
  brandName?: string | null;
  brandColor?: string | null;
  sequenceOrder?: number;
  resistance?: ResistanceLevel;
  setupBufferMins?: number;
}

export interface SwapLogEntry {
  displacedSourceId: string;
  displacedTitle: string;
  displacedTaskName: string;
  fromZoneId: string;
  toZoneId: string;
  fromDateString: string;
  toDateString: string;
  minutesVacated: number;
  hopCount: 1 | 2;
  reason: string;
}

export interface ZoneUtilizationReport {
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  availableMinutes: number;
  allocatedMinutes: number;
  workMinutes: number;
  setupMinutes: number;
  remainingFreeMinutes: number;
  shiftableMinutes: number;
  utilizationPercent: number;
  isBottleneck: boolean;
}

export interface SolverStrategyOptions {
  earlyPreferenceWeight?: number; // Default 10
  mergeBonusWeight?: number; // Default 800
  datePenalties?: Record<string, number>; // dateString -> score delta
  dailyLoadCapRatio?: number; // e.g., 0.85 for 85% max utilization per slot/day
  balanceAcrossDays?: boolean; // Favor under-utilized days to level load
  priorityBoostBySourceKey?: Record<string, number>; // "${sourceType}:${sourceId}" -> boost
  hardMaxDateBySourceKey?: Record<string, string>; // "${sourceType}:${sourceId}" -> max YYYY-MM-DD
}

export interface DatedSolverInput {
  userId: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds?: DbWeeklyDayBounds[];
  overrides: DbCalendarDateOverride[];
  tasks: SchedulerTaskInput[];
  pinnedAllocations?: PinnedAllocationInput[];
  options?: SolverStrategyOptions;
}

export interface DatedSolverResult {
  status: "OPTIMAL_FIT" | "SWAP_APPLIED" | "CAPACITY_EXCEEDED";
  statusMessage: string;
  allocations: SolvedAllocation[];
  unplacedTasks: UnplacedTask[];
  zoneUtilization: ZoneUtilizationReport[];
  bottleneckZoneIds: string[];
  swapsExecuted: SwapLogEntry[];
  totalScheduledMins: number;
  totalScheduledWorkMins: number;
  totalAvailableMins: number;
  completedExcludedMins: number;
  completedTasks: SchedulerTaskInput[];
  batchingSavedMins: number;
  solveDurationMs: number;
}

// -------------------------------------------------------------
// Internal Mutable Solver Structures
// -------------------------------------------------------------
interface InternalAllocation {
  id: string;
  userId: string;
  sourceType: AllocationSourceType;
  sourceId: string;
  dateString: string;
  startMinute: number;
  endMinute: number;
  durationMins: number;
  setupMinsUsed: number;
  zoneId: string;
  isPinned: boolean;
  isVacationPreScheduled: boolean;
  originalTargetDate: string | null;
  workflowTaskId: string | null;
  title: string;
  taskName: string;
  contentItemId?: string | null;
  uniqueContentId?: string | null;
  contentTypeId?: string | null;
  contentTypeName?: string | null;
  contentTypeColor?: string | null;
  taskColor?: string | null;
  brandName?: string | null;
  brandColor?: string | null;
  sequenceOrder: number;
  resistance: ResistanceLevel;
  targetDate: string | null;
  publishDate?: string | null;
  worstCaseTargetDate?: string | null;
  team1stTargetDate?: string | null;
  teamFinalTargetDate?: string | null;
  isPartialChunk: boolean;
  effectiveEligibleZoneIds: string[];
  baseSetupBufferMins: number;
}

interface MutableDatedSlot {
  id: string;
  dateString: string;
  dayOfWeek: number;
  zoneId: string;
  startMinute: number;
  endMinute: number;
  totalMinutes: number;
  allocations: InternalAllocation[];
}

interface FreeInterval {
  startMinute: number;
  endMinute: number;
  duration: number;
}

interface PlacementCandidate {
  slot: MutableDatedSlot;
  startMinute: number;
  endMinute: number;
  workMins: number;
  effectiveSetup: number;
  totalBlockMins: number;
  score: number;
}

interface PreparedTask {
  raw: SchedulerTaskInput;
  remainingWorkMins: number;
  effectiveEligibleZoneIds: string[];
  hasInvalidConfiguredZones: boolean;
}

// -------------------------------------------------------------
// Slot Horizon Projection
// -------------------------------------------------------------
function buildDatedSlots(
  startDate: string,
  endDate: string,
  zones: DbScheduleZone[],
  weeklySlots: DbWeeklyZoneSlot[],
  overrides: DbCalendarDateOverride[],
  dayBounds: DbWeeklyDayBounds[] = []
): { slots: MutableDatedSlot[]; holidayDates: Set<string> } {
  const isSingleOpenZoneMode = zones.length === 0;
  const validZoneIds = new Set(
    isSingleOpenZoneMode ? [OPEN_WORKDAY_ZONE_ID] : zones.map((z) => z.id)
  );
  const boundsByDay = new Map<number, { workStartMinute: number; workEndMinute: number }>();
  for (const b of dayBounds) {
    boundsByDay.set(b.dayOfWeek, {
      workStartMinute: Math.max(0, Math.min(1440, b.workStartMinute)),
      workEndMinute: Math.max(0, Math.min(1440, b.workEndMinute)),
    });
  }

  const overrideByDate = new Map<string, DbCalendarDateOverride>(
    overrides.map((o) => [o.dateString, o])
  );
  const holidayDates = new Set<string>();
  const slots: MutableDatedSlot[] = [];

  for (const dateString of enumerateDates(startDate, endDate)) {
    const dayOfWeek = getDayOfWeekMon0(dateString);
    const override = overrideByDate.get(dateString);

    if (override?.isHoliday) {
      holidayDates.add(dateString);
      continue;
    }

    const dayBound = boundsByDay.get(dayOfWeek) || {
      workStartMinute: DEFAULT_WORK_START_MINUTE,
      workEndMinute: DEFAULT_WORK_END_MINUTE,
    };
    const workStart = dayBound.workStartMinute;
    const workEnd = dayBound.workEndMinute;
    if (workEnd <= workStart) continue;

    if (override?.customSlotsJson) {
      try {
        const parsed = JSON.parse(override.customSlotsJson);
        if (Array.isArray(parsed)) {
          for (let idx = 0; idx < parsed.length; idx++) {
            const s = parsed[idx];
            const rawZoneId = typeof s?.zoneId === "string" ? s.zoneId : "";
            const effZoneId = isSingleOpenZoneMode ? OPEN_WORKDAY_ZONE_ID : rawZoneId;
            const clippedStart = Math.max(workStart, Math.round(Number(s?.startMinute) || 0));
            const clippedEnd = Math.min(workEnd, Math.round(Number(s?.endMinute) || 0));
            if (validZoneIds.has(effZoneId) && clippedStart < clippedEnd) {
              slots.push({
                id: `${dateString}__custom_${idx}__${effZoneId}__${clippedStart}_${clippedEnd}`,
                dateString,
                dayOfWeek,
                zoneId: effZoneId,
                startMinute: clippedStart,
                endMinute: clippedEnd,
                totalMinutes: clippedEnd - clippedStart,
                allocations: [],
              });
            }
          }
          continue;
        }
      } catch {
        // Fallback to weekly template if customSlotsJson is malformed
      }
    }

    if (isSingleOpenZoneMode) {
      // Whole active working day treated as one single open zone
      slots.push({
        id: `${dateString}__open_workday`,
        dateString,
        dayOfWeek,
        zoneId: OPEN_WORKDAY_ZONE_ID,
        startMinute: workStart,
        endMinute: workEnd,
        totalMinutes: workEnd - workStart,
        allocations: [],
      });
      continue;
    }

    const dayTemplate = weeklySlots.filter((ws) => ws.dayOfWeek === dayOfWeek);
    for (const ws of dayTemplate) {
      if (!validZoneIds.has(ws.zoneId)) continue;
      const clippedStart = Math.max(workStart, ws.startMinute);
      const clippedEnd = Math.min(workEnd, ws.endMinute);
      if (clippedStart < clippedEnd) {
        slots.push({
          id: `${dateString}__${ws.id}__${ws.zoneId}`,
          dateString,
          dayOfWeek,
          zoneId: ws.zoneId,
          startMinute: clippedStart,
          endMinute: clippedEnd,
          totalMinutes: clippedEnd - clippedStart,
          allocations: [],
        });
      }
    }
  }

  slots.sort((a, b) => {
    if (a.dateString !== b.dateString) return a.dateString.localeCompare(b.dateString);
    return a.startMinute - b.startMinute;
  });

  return { slots, holidayDates };
}

// -------------------------------------------------------------
// Interval & Placement Evaluation
// -------------------------------------------------------------
function getFreeIntervals(slot: MutableDatedSlot): FreeInterval[] {
  if (slot.allocations.length === 0) {
    return [
      {
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        duration: slot.endMinute - slot.startMinute,
      },
    ];
  }

  const sorted = [...slot.allocations].sort((a, b) => a.startMinute - b.startMinute);
  const intervals: FreeInterval[] = [];
  let cursor = slot.startMinute;

  for (const alloc of sorted) {
    if (alloc.startMinute > cursor) {
      intervals.push({
        startMinute: cursor,
        endMinute: alloc.startMinute,
        duration: alloc.startMinute - cursor,
      });
    }
    cursor = Math.max(cursor, alloc.endMinute);
  }

  if (cursor < slot.endMinute) {
    intervals.push({
      startMinute: cursor,
      endMinute: slot.endMinute,
      duration: slot.endMinute - cursor,
    });
  }

  return intervals;
}

function canAmortizeWithNeighbor(
  neighbor: InternalAllocation | undefined,
  workflowTaskId: string | null
): boolean {
  if (!neighbor || !workflowTaskId) return false;
  return neighbor.workflowTaskId === workflowTaskId;
}

function slotWithinDailyCap(
  slot: MutableDatedSlot,
  addedMins: number,
  capRatio?: number
): boolean {
  if (!capRatio || capRatio <= 0 || capRatio >= 1) return true;
  const allocated = slot.allocations.reduce(
    (sum, a) => sum + (a.endMinute - a.startMinute),
    0
  );
  return allocated + addedMins <= Math.floor(slot.totalMinutes * capRatio) + 1e-6;
}

interface MinStartConstraint {
  dateString: string;
  minute: number;
}

function trimIntervalByMinStart(
  slotDate: string,
  interval: FreeInterval,
  minStart?: MinStartConstraint
): FreeInterval | null {
  if (!minStart) return interval;
  if (slotDate < minStart.dateString) return null;
  if (slotDate === minStart.dateString) {
    if (interval.endMinute <= minStart.minute) return null;
    const startMinute = Math.max(interval.startMinute, minStart.minute);
    return {
      startMinute,
      endMinute: interval.endMinute,
      duration: interval.endMinute - startMinute,
    };
  }
  return interval;
}

function evaluateSlotInterval(
  slot: MutableDatedSlot,
  rawInterval: FreeInterval,
  workMins: number,
  setupBufferMins: number,
  workflowTaskId: string | null,
  resistance: ResistanceLevel,
  targetDate: string | null,
  dateOrderIndex: Map<string, number>,
  strategy?: SolverStrategyOptions,
  hardMaxDate?: string,
  minStart?: MinStartConstraint
): PlacementCandidate | null {
  if (hardMaxDate && slot.dateString > hardMaxDate) return null;

  const interval = trimIntervalByMinStart(slot.dateString, rawInterval, minStart);
  if (!interval) return null;

  const candidates: PlacementCandidate[] = [];
  const earlyWeight = strategy?.earlyPreferenceWeight ?? 10;
  const mergeBonusVal = strategy?.mergeBonusWeight ?? 800;
  const datePenalty = strategy?.datePenalties?.[slot.dateString] ?? 0;

  const currentAllocated = slot.allocations.reduce(
    (sum, a) => sum + (a.endMinute - a.startMinute),
    0
  );
  const currentUtilRatio =
    slot.totalMinutes > 0 ? currentAllocated / slot.totalMinutes : 1;

  const scoreCandidate = (
    startMinute: number,
    endMinute: number,
    effectiveSetup: number,
    isMergeContinuation: boolean
  ): PlacementCandidate => {
    let deadlineScore = 0;
    if (targetDate) {
      if (slot.dateString <= targetDate) {
        deadlineScore = 10000;
      } else {
        const slotIdx = dateOrderIndex.get(slot.dateString) ?? 0;
        const targetIdx = dateOrderIndex.get(targetDate) ?? 0;
        deadlineScore = -Math.max(1, slotIdx - targetIdx) * 100;
      }
    } else {
      deadlineScore = 5000;
    }

    const dayIdx = dateOrderIndex.get(slot.dateString) ?? 0;
    let timingScore: number;
    if (strategy?.balanceAcrossDays) {
      timingScore = (1 - currentUtilRatio) * 1200 + Math.max(0, 120 - dayIdx * 3);
    } else if (
      strategy?.earlyPreferenceWeight === undefined &&
      targetDate &&
      slot.dateString <= targetDate
    ) {
      // Natural target-date window: prefer days leading up to each task's own targetDate
      const targetIdx = dateOrderIndex.get(targetDate) ?? dayIdx;
      const daysBeforeTarget = Math.max(0, targetIdx - dayIdx);
      timingScore = Math.max(0, 500 - daysBeforeTarget * 15);
    } else {
      timingScore = Math.max(0, 500 - dayIdx * earlyWeight);
    }
    const mergeBonus = isMergeContinuation ? mergeBonusVal : 0;
    const resistanceWeight = RESISTANCE_MULTIPLIERS[resistance] || 1.0;
    const resistanceBonus = resistanceWeight * 25;
    const leftover = interval.duration - (endMinute - startMinute);
    const compactnessBonus = Math.max(0, 100 - leftover * 0.1);

    return {
      slot,
      startMinute,
      endMinute,
      workMins,
      effectiveSetup,
      totalBlockMins: endMinute - startMinute,
      score:
        deadlineScore +
        timingScore +
        datePenalty +
        mergeBonus +
        resistanceBonus +
        compactnessBonus,
    };
  };

  // Option A: Left-aligned at interval.startMinute (amortized if abutting prevAlloc or exact-fitting nextAlloc)
  const prevAlloc = slot.allocations.find((a) => a.endMinute === interval.startMinute);
  const nextAtExactEnd = slot.allocations.find(
    (a) => a.startMinute === interval.startMinute + workMins
  );
  const leftMerge =
    canAmortizeWithNeighbor(prevAlloc, workflowTaskId) ||
    canAmortizeWithNeighbor(nextAtExactEnd, workflowTaskId);
  const leftSetup = leftMerge ? 0 : setupBufferMins;
  const leftTotal = workMins + leftSetup;

  if (
    interval.duration >= leftTotal &&
    slotWithinDailyCap(slot, leftTotal, strategy?.dailyLoadCapRatio)
  ) {
    candidates.push(
      scoreCandidate(
        interval.startMinute,
        interval.startMinute + leftTotal,
        leftSetup,
        leftMerge
      )
    );
  }

  // Option B: Right-aligned at interval.endMinute if abutting a matching nextAlloc
  const nextAtIntervalEnd = slot.allocations.find(
    (a) => a.startMinute === interval.endMinute
  );
  if (
    canAmortizeWithNeighbor(nextAtIntervalEnd, workflowTaskId) &&
    interval.duration >= workMins &&
    slotWithinDailyCap(slot, workMins, strategy?.dailyLoadCapRatio)
  ) {
    candidates.push(
      scoreCandidate(
        interval.endMinute - workMins,
        interval.endMinute,
        0,
        true
      )
    );
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function findDirectPlacement(
  slots: MutableDatedSlot[],
  eligibleZoneIds: string[],
  workMins: number,
  setupBufferMins: number,
  workflowTaskId: string | null,
  resistance: ResistanceLevel,
  targetDate: string | null,
  dateOrderIndex: Map<string, number>,
  strategy?: SolverStrategyOptions,
  hardMaxDate?: string,
  minStart?: MinStartConstraint
): PlacementCandidate | null {
  const candidates: PlacementCandidate[] = [];

  for (const slot of slots) {
    if (!eligibleZoneIds.includes(slot.zoneId)) continue;
    const intervals = getFreeIntervals(slot);
    for (const interval of intervals) {
      const candidate = evaluateSlotInterval(
        slot,
        interval,
        workMins,
        setupBufferMins,
        workflowTaskId,
        resistance,
        targetDate,
        dateOrderIndex,
        strategy,
        hardMaxDate,
        minStart
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// -------------------------------------------------------------
// Augmenting-Path Eviction Engine (1-hop & 2-hop Zone Swaps)
// -------------------------------------------------------------
function attemptAugmentingPathSwap(
  slots: MutableDatedSlot[],
  targetZoneId: string,
  workMins: number,
  setupBufferMins: number,
  workflowTaskId: string | null,
  resistance: ResistanceLevel,
  targetDate: string | null,
  dateOrderIndex: Map<string, number>,
  displacingTitle: string,
  displacingTaskName: string,
  strategy?: SolverStrategyOptions,
  hardMaxDate?: string,
  minStart?: MinStartConstraint
): {
  success: boolean;
  swaps: SwapLogEntry[];
  placement: PlacementCandidate | null;
} {
  // Prioritize slots in targetZoneId on/before targetDate first
  const targetSlots = slots
    .filter((s) => s.zoneId === targetZoneId)
    .sort((a, b) => {
      if (targetDate) {
        const aOnTime = a.dateString <= targetDate ? 0 : 1;
        const bOnTime = b.dateString <= targetDate ? 0 : 1;
        if (aOnTime !== bOnTime) return aOnTime - bOnTime;
      }
      return a.dateString.localeCompare(b.dateString);
    });

  for (const slotX of targetSlots) {
    for (let i = 0; i < slotX.allocations.length; i++) {
      const allocA = slotX.allocations[i];
      // Never evict pinned allocations!
      if (allocA.isPinned) continue;

      const altZonesA = allocA.effectiveEligibleZoneIds.filter(
        (z) => z !== targetZoneId
      );
      if (altZonesA.length === 0) continue;

      // Temporarily remove allocA from slotX
      slotX.allocations.splice(i, 1);

      // ---------------------------------------------------------
      // TRY 1-HOP SWAP: Move allocA directly to Zone Y
      // ---------------------------------------------------------
      const maxDateA =
        strategy?.hardMaxDateBySourceKey?.[`${allocA.sourceType}:${allocA.sourceId}`];
      for (const zoneY of altZonesA) {
        const altPlacementA = findDirectPlacement(
          slots,
          [zoneY],
          allocA.durationMins,
          allocA.baseSetupBufferMins,
          allocA.workflowTaskId,
          allocA.resistance,
          allocA.targetDate,
          dateOrderIndex,
          strategy,
          maxDateA
        );

        if (altPlacementA) {
          const intervalsX = getFreeIntervals(slotX);
          let targetPlacement: PlacementCandidate | null = null;
          for (const intervalX of intervalsX) {
            targetPlacement = evaluateSlotInterval(
              slotX,
              intervalX,
              workMins,
              setupBufferMins,
              workflowTaskId,
              resistance,
              targetDate,
              dateOrderIndex,
              strategy,
              hardMaxDate,
              minStart
            );
            if (targetPlacement) break;
          }

          if (targetPlacement) {
            const movedA: InternalAllocation = {
              ...allocA,
              dateString: altPlacementA.slot.dateString,
              startMinute: altPlacementA.startMinute,
              endMinute: altPlacementA.endMinute,
              setupMinsUsed: altPlacementA.effectiveSetup,
              zoneId: altPlacementA.slot.zoneId,
            };
            altPlacementA.slot.allocations.push(movedA);

            return {
              success: true,
              swaps: [
                {
                  displacedSourceId: allocA.sourceId,
                  displacedTitle: allocA.title,
                  displacedTaskName: allocA.taskName,
                  fromZoneId: targetZoneId,
                  toZoneId: zoneY,
                  fromDateString: slotX.dateString,
                  toDateString: altPlacementA.slot.dateString,
                  minutesVacated: allocA.endMinute - allocA.startMinute,
                  hopCount: 1,
                  reason: `1-hop swap: moved '${allocA.taskName}' (${allocA.title}) to vacate ${allocA.endMinute - allocA.startMinute}m for '${displacingTaskName}' (${displacingTitle})`,
                },
              ],
              placement: targetPlacement,
            };
          }
        }

        // ---------------------------------------------------------
        // TRY 2-HOP SWAP: Move allocA -> Zone Y by moving allocB -> Zone Z
        // ---------------------------------------------------------
        const slotsY = slots.filter((s) => s.zoneId === zoneY);
        for (const slotY of slotsY) {
          for (let j = 0; j < slotY.allocations.length; j++) {
            const allocB = slotY.allocations[j];
            if (allocB.isPinned) continue;

            const altZonesB = allocB.effectiveEligibleZoneIds.filter(
              (z) => z !== zoneY && z !== targetZoneId
            );
            if (altZonesB.length === 0) continue;

            slotY.allocations.splice(j, 1);

            for (const zoneZ of altZonesB) {
              const maxDateB =
                strategy?.hardMaxDateBySourceKey?.[
                  `${allocB.sourceType}:${allocB.sourceId}`
                ];
              const altPlacementB = findDirectPlacement(
                slots,
                [zoneZ],
                allocB.durationMins,
                allocB.baseSetupBufferMins,
                allocB.workflowTaskId,
                allocB.resistance,
                allocB.targetDate,
                dateOrderIndex,
                strategy,
                maxDateB
              );

              if (altPlacementB) {
                const intervalsY = getFreeIntervals(slotY);
                let placementAInY: PlacementCandidate | null = null;
                for (const intervalY of intervalsY) {
                  placementAInY = evaluateSlotInterval(
                    slotY,
                    intervalY,
                    allocA.durationMins,
                    allocA.baseSetupBufferMins,
                    allocA.workflowTaskId,
                    allocA.resistance,
                    allocA.targetDate,
                    dateOrderIndex,
                    strategy,
                    maxDateA
                  );
                  if (placementAInY) break;
                }

                if (placementAInY) {
                  const intervalsX = getFreeIntervals(slotX);
                  let targetPlacement: PlacementCandidate | null = null;
                  for (const intervalX of intervalsX) {
                    targetPlacement = evaluateSlotInterval(
                      slotX,
                      intervalX,
                      workMins,
                      setupBufferMins,
                      workflowTaskId,
                      resistance,
                      targetDate,
                      dateOrderIndex,
                      strategy,
                      hardMaxDate,
                      minStart
                    );
                    if (targetPlacement) break;
                  }

                  if (targetPlacement) {
                    const movedB: InternalAllocation = {
                      ...allocB,
                      dateString: altPlacementB.slot.dateString,
                      startMinute: altPlacementB.startMinute,
                      endMinute: altPlacementB.endMinute,
                      setupMinsUsed: altPlacementB.effectiveSetup,
                      zoneId: altPlacementB.slot.zoneId,
                    };
                    altPlacementB.slot.allocations.push(movedB);

                    const movedA: InternalAllocation = {
                      ...allocA,
                      dateString: slotY.dateString,
                      startMinute: placementAInY.startMinute,
                      endMinute: placementAInY.endMinute,
                      setupMinsUsed: placementAInY.effectiveSetup,
                      zoneId: slotY.zoneId,
                    };
                    slotY.allocations.push(movedA);

                    return {
                      success: true,
                      swaps: [
                        {
                          displacedSourceId: allocB.sourceId,
                          displacedTitle: allocB.title,
                          displacedTaskName: allocB.taskName,
                          fromZoneId: zoneY,
                          toZoneId: zoneZ,
                          fromDateString: slotY.dateString,
                          toDateString: altPlacementB.slot.dateString,
                          minutesVacated: allocB.endMinute - allocB.startMinute,
                          hopCount: 2,
                          reason: `2-hop swap: relocated '${allocB.taskName}' (${allocB.title}) to make room for '${allocA.taskName}'`,
                        },
                        {
                          displacedSourceId: allocA.sourceId,
                          displacedTitle: allocA.title,
                          displacedTaskName: allocA.taskName,
                          fromZoneId: targetZoneId,
                          toZoneId: zoneY,
                          fromDateString: slotX.dateString,
                          toDateString: slotY.dateString,
                          minutesVacated: allocA.endMinute - allocA.startMinute,
                          hopCount: 2,
                          reason: `2-hop swap: relocated '${allocA.taskName}' (${allocA.title}) to vacate ${allocA.endMinute - allocA.startMinute}m for '${displacingTaskName}'`,
                        },
                      ],
                      placement: targetPlacement,
                    };
                  }
                }
              }
            }

            // Rollback B
            slotY.allocations.splice(j, 0, allocB);
          }
        }
      }

      // Rollback A
      slotX.allocations.splice(i, 0, allocA);
    }
  }

  return { success: false, swaps: [], placement: null };
}

// -------------------------------------------------------------
// Setup Amortization Recalculation (Authoritative post-swap)
// -------------------------------------------------------------
function computeBatchingSavedMins(slots: MutableDatedSlot[]): number {
  let saved = 0;

  for (const slot of slots) {
    const sorted = [...slot.allocations].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr.isPinned) continue;
      if (curr.baseSetupBufferMins > 0 && curr.setupMinsUsed === 0) {
        const prev = i > 0 ? sorted[i - 1] : undefined;
        const next = i < sorted.length - 1 ? sorted[i + 1] : undefined;
        const adjacentMatch =
          (prev &&
            prev.endMinute === curr.startMinute &&
            curr.workflowTaskId &&
            prev.workflowTaskId === curr.workflowTaskId) ||
          (next &&
            next.startMinute === curr.endMinute &&
            curr.workflowTaskId &&
            next.workflowTaskId === curr.workflowTaskId);
        if (adjacentMatch) {
          saved += curr.baseSetupBufferMins;
        }
      }
    }
  }

  return saved;
}

// -------------------------------------------------------------
// Main Multi-Week Dated Calendar Solver
// -------------------------------------------------------------
export function solveDatedSchedule(input: DatedSolverInput): DatedSolverResult {
  const t0 = performance.now();
  const {
    userId,
    startDate,
    endDate,
    zones,
    weeklySlots,
    dayBounds = [],
    overrides,
    tasks,
    pinnedAllocations = [],
    options: strategy,
  } = input;

  const isSingleOpenZoneMode = zones.length === 0;
  const effectiveZonesList: DbScheduleZone[] = isSingleOpenZoneMode
    ? [
        {
          id: OPEN_WORKDAY_ZONE_ID,
          userId,
          name: "Whole Working Day",
          color: "#6366f1",
          icon: "Briefcase",
          orderIndex: 0,
        },
      ]
    : zones;

  const dates = enumerateDates(startDate, endDate);
  const dateOrderIndex = new Map<string, number>(dates.map((d, idx) => [d, idx]));

  // 1. Project weekly template + overrides + day bounds onto real dates
  const { slots, holidayDates } = buildDatedSlots(
    startDate,
    endDate,
    zones,
    weeklySlots,
    overrides,
    dayBounds
  );

  // 2. Strict Completion Filter: exclude 'done' tasks & sum completedExcludedMins
  let completedExcludedMins = 0;
  const completedTasks: SchedulerTaskInput[] = [];
  const activeTasks: SchedulerTaskInput[] = [];
  const activeTaskByKey = new Map<string, SchedulerTaskInput>();

  for (const task of tasks) {
    const clampedDuration = Math.max(5, Math.round(task.durationMins || 0));
    const normalizedTask: SchedulerTaskInput =
      clampedDuration !== task.durationMins
        ? { ...task, durationMins: clampedDuration }
        : task;

    if (normalizedTask.isDone) {
      completedExcludedMins += normalizedTask.durationMins;
      completedTasks.push(normalizedTask);
      continue;
    }
    activeTasks.push(normalizedTask);
    activeTaskByKey.set(
      `${normalizedTask.sourceType}:${normalizedTask.sourceId}`,
      normalizedTask
    );
  }

  // Track latest placed end per ContentItem workflow step so later steps never precede earlier steps
  const latestPlacedByContentItem = new Map<
    string,
    { sequenceOrder: number; dateString: string; endMinute: number }[]
  >();

  const recordPipelinePlacement = (
    contentItemId: string | null | undefined,
    sourceType: AllocationSourceType,
    sequenceOrder: number,
    dateString: string,
    endMinute: number
  ) => {
    if (!contentItemId || sourceType !== "workflow_task") return;
    const list = latestPlacedByContentItem.get(contentItemId) || [];
    list.push({ sequenceOrder, dateString, endMinute });
    latestPlacedByContentItem.set(contentItemId, list);
  };

  const getPipelineMinStart = (
    raw: SchedulerTaskInput
  ): MinStartConstraint | undefined => {
    if (!raw.contentItemId || raw.sourceType !== "workflow_task") {
      return undefined;
    }
    const entries = latestPlacedByContentItem.get(raw.contentItemId);
    if (!entries || entries.length === 0) return undefined;
    let best: MinStartConstraint | undefined;
    for (const e of entries) {
      if (e.sequenceOrder >= raw.sequenceOrder) continue;
      if (
        !best ||
        e.dateString > best.dateString ||
        (e.dateString === best.dateString && e.endMinute > best.minute)
      ) {
        best = { dateString: e.dateString, minute: e.endMinute };
      }
    }
    return best;
  };

  // 3. Place Pinned Allocations first (deducting their intervals before solver runs)
  const pinnedMinutesByTask = new Map<string, number>();
  const orphanPinnedAllocations: InternalAllocation[] = [];

  for (const pin of pinnedAllocations) {
    if (pin.dateString < startDate || pin.dateString > endDate) continue;
    const key = `${pin.sourceType}:${pin.sourceId}`;
    const taskMeta = activeTaskByKey.get(key);
    // Strict Completion Rule: if underlying task is 'done' or archived/excluded, drop stale pin
    if (!taskMeta) continue;

    const validZoneIds = effectiveZonesList.map((z) => z.id);
    const parsedEligible = parseEligibleZoneIds(taskMeta.eligibleZoneIds);
    const effectiveZones = isSingleOpenZoneMode
      ? [OPEN_WORKDAY_ZONE_ID]
      : parsedEligible.length > 0
      ? parsedEligible.filter((z) => validZoneIds.includes(z))
      : validZoneIds;

    const workMins = Math.max(
      0,
      pin.endMinute - pin.startMinute - (pin.setupMinsUsed || 0)
    );
    pinnedMinutesByTask.set(key, (pinnedMinutesByTask.get(key) || 0) + workMins);

    const resolvedPinZoneId = isSingleOpenZoneMode ? OPEN_WORKDAY_ZONE_ID : pin.zoneId;

    const internalPin: InternalAllocation = {
      id: pin.id,
      userId,
      sourceType: pin.sourceType,
      sourceId: pin.sourceId,
      dateString: pin.dateString,
      startMinute: pin.startMinute,
      endMinute: pin.endMinute,
      durationMins: workMins,
      setupMinsUsed: pin.setupMinsUsed || 0,
      zoneId: resolvedPinZoneId,
      isPinned: true,
      isVacationPreScheduled: pin.isVacationPreScheduled,
      originalTargetDate: pin.originalTargetDate ?? taskMeta.targetDate,
      workflowTaskId: taskMeta.workflowTaskId,
      title: taskMeta.title,
      taskName: taskMeta.taskName,
      contentItemId: taskMeta.contentItemId,
      uniqueContentId: taskMeta.uniqueContentId,
      contentTypeId: taskMeta.contentTypeId,
      contentTypeName: taskMeta.contentTypeName,
      contentTypeColor: taskMeta.contentTypeColor,
      taskColor: taskMeta.taskColor,
      brandName: taskMeta.brandName,
      brandColor: taskMeta.brandColor,
      sequenceOrder: taskMeta.sequenceOrder,
      resistance: taskMeta.resistance,
      targetDate: taskMeta.targetDate,
      publishDate: taskMeta.publishDate,
      worstCaseTargetDate: taskMeta.worstCaseTargetDate,
      team1stTargetDate: taskMeta.team1stTargetDate,
      teamFinalTargetDate: taskMeta.teamFinalTargetDate,
      isPartialChunk: workMins < taskMeta.durationMins,
      effectiveEligibleZoneIds: effectiveZones,
      baseSetupBufferMins: taskMeta.setupBufferMins,
    };

    const matchingSlot = slots.find(
      (s) =>
        s.dateString === pin.dateString &&
        s.zoneId === resolvedPinZoneId &&
        pin.startMinute < s.endMinute &&
        pin.endMinute > s.startMinute
    );

    if (matchingSlot) {
      matchingSlot.allocations.push(internalPin);
    } else {
      // Preserve pinned block even if slot changed (e.g. partial override)
      orphanPinnedAllocations.push(internalPin);
    }
    recordPipelinePlacement(
      taskMeta.contentItemId,
      taskMeta.sourceType,
      taskMeta.sequenceOrder,
      pin.dateString,
      pin.endMinute
    );
  }

  // 4. Prepare Unpinned Tasks with effective eligible zones & remaining durations
  const allZoneIds = effectiveZonesList.map((z) => z.id);
  const allZoneIdSet = new Set(allZoneIds);
  const preparedTasks: PreparedTask[] = [];

  for (const task of activeTasks) {
    const key = `${task.sourceType}:${task.sourceId}`;
    const alreadyPinnedMins = pinnedMinutesByTask.get(key) || 0;
    if (alreadyPinnedMins >= task.durationMins) {
      continue;
    }
    if (alreadyPinnedMins > 0 && !task.isSplittable) {
      // Unsplittable task already has a pinned placement
      continue;
    }

    const remainingWorkMins = task.durationMins - alreadyPinnedMins;
    const configuredZones = parseEligibleZoneIds(task.eligibleZoneIds);
    const hasConfigured = !isSingleOpenZoneMode && configuredZones.length > 0;
    const effectiveEligibleZoneIds = isSingleOpenZoneMode
      ? [OPEN_WORKDAY_ZONE_ID]
      : hasConfigured
      ? configuredZones.filter((z) => allZoneIdSet.has(z))
      : allZoneIds;

    preparedTasks.push({
      raw: task,
      remainingWorkMins,
      effectiveEligibleZoneIds,
      hasInvalidConfiguredZones: hasConfigured && effectiveEligibleZoneIds.length === 0,
    });
  }

  // MRV + Deadline Priority Sorting:
  // 1. Earliest target deadline date ascending
  // 2. eligibleZoneIds.length ascending (most restricted first)
  // 3. resistance descending (HIGH: 3.5x, MEDIUM: 2.0x, LOW: 1.0x)
  // 4. isSplittable (false before true)
  // 5. Deterministic tie-breakers
  preparedTasks.sort((a, b) => {
    const boostA =
      strategy?.priorityBoostBySourceKey?.[`${a.raw.sourceType}:${a.raw.sourceId}`] ?? 0;
    const boostB =
      strategy?.priorityBoostBySourceKey?.[`${b.raw.sourceType}:${b.raw.sourceId}`] ?? 0;
    if (boostA !== boostB) return boostB - boostA;

    const dateA = a.raw.targetDate || "9999-12-31";
    const dateB = b.raw.targetDate || "9999-12-31";
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    // Same ContentItem workflow tasks must always solve in sequential stage order
    if (
      a.raw.contentItemId &&
      a.raw.contentItemId === b.raw.contentItemId &&
      a.raw.sequenceOrder !== b.raw.sequenceOrder
    ) {
      return a.raw.sequenceOrder - b.raw.sequenceOrder;
    }

    const zoneDiff =
      a.effectiveEligibleZoneIds.length - b.effectiveEligibleZoneIds.length;
    if (zoneDiff !== 0) return zoneDiff;

    const resA = RESISTANCE_MULTIPLIERS[a.raw.resistance] || 1.0;
    const resB = RESISTANCE_MULTIPLIERS[b.raw.resistance] || 1.0;
    if (resB !== resA) return resB - resA;

    if (a.raw.isSplittable !== b.raw.isSplittable) {
      return a.raw.isSplittable ? 1 : -1;
    }

    if (b.raw.setupBufferMins !== a.raw.setupBufferMins) {
      return b.raw.setupBufferMins - a.raw.setupBufferMins;
    }

    if (a.raw.sequenceOrder !== b.raw.sequenceOrder) {
      return a.raw.sequenceOrder - b.raw.sequenceOrder;
    }

    return a.raw.sourceId.localeCompare(b.raw.sourceId);
  });

  // 5. Run Solver Placement Loop
  const swapsExecuted: SwapLogEntry[] = [];
  const unplacedTasks: UnplacedTask[] = [];
  let allocSeq = 0;

  const commitInternalPlacement = (
    item: PreparedTask,
    placement: PlacementCandidate,
    workMins: number,
    isPartialChunk: boolean
  ) => {
    const { raw, effectiveEligibleZoneIds } = item;
    const isVacPre = Boolean(
      raw.targetDate &&
        holidayDates.has(raw.targetDate) &&
        placement.slot.dateString < raw.targetDate
    );

    const alloc: InternalAllocation = {
      id: `alloc_${++allocSeq}_${raw.sourceType}_${raw.sourceId}`,
      userId,
      sourceType: raw.sourceType,
      sourceId: raw.sourceId,
      dateString: placement.slot.dateString,
      startMinute: placement.startMinute,
      endMinute: placement.endMinute,
      durationMins: workMins,
      setupMinsUsed: placement.effectiveSetup,
      zoneId: placement.slot.zoneId,
      isPinned: false,
      isVacationPreScheduled: isVacPre,
      originalTargetDate: raw.targetDate,
      workflowTaskId: raw.workflowTaskId,
      title: raw.title,
      taskName: raw.taskName,
      contentItemId: raw.contentItemId,
      uniqueContentId: raw.uniqueContentId,
      contentTypeId: raw.contentTypeId,
      contentTypeName: raw.contentTypeName,
      contentTypeColor: raw.contentTypeColor,
      taskColor: raw.taskColor,
      brandName: raw.brandName,
      brandColor: raw.brandColor,
      sequenceOrder: raw.sequenceOrder,
      resistance: raw.resistance,
      targetDate: raw.targetDate,
      publishDate: raw.publishDate,
      worstCaseTargetDate: raw.worstCaseTargetDate,
      team1stTargetDate: raw.team1stTargetDate,
      teamFinalTargetDate: raw.teamFinalTargetDate,
      isPartialChunk,
      effectiveEligibleZoneIds,
      baseSetupBufferMins: raw.setupBufferMins,
    };
    placement.slot.allocations.push(alloc);
    recordPipelinePlacement(
      raw.contentItemId,
      raw.sourceType,
      raw.sequenceOrder,
      placement.slot.dateString,
      placement.endMinute
    );
  };

  for (const item of preparedTasks) {
    const { raw, remainingWorkMins, effectiveEligibleZoneIds, hasInvalidConfiguredZones } =
      item;
    const hardMaxDate =
      strategy?.hardMaxDateBySourceKey?.[`${raw.sourceType}:${raw.sourceId}`];
    const minStart = getPipelineMinStart(raw);

    if (hasInvalidConfiguredZones || effectiveEligibleZoneIds.length === 0) {
      unplacedTasks.push({
        sourceType: raw.sourceType,
        sourceId: raw.sourceId,
        title: raw.title,
        taskName: raw.taskName,
        targetDate: raw.targetDate,
        publishDate: raw.publishDate,
        worstCaseTargetDate: raw.worstCaseTargetDate,
        team1stTargetDate: raw.team1stTargetDate,
        teamFinalTargetDate: raw.teamFinalTargetDate,
        missingMinutes: remainingWorkMins,
        eligibleZoneIds: raw.eligibleZoneIds,
        reason: "No valid eligible schedule zones available in user configuration.",
        contentItemId: raw.contentItemId,
        uniqueContentId: raw.uniqueContentId,
        contentTypeName: raw.contentTypeName,
        contentTypeColor: raw.contentTypeColor,
        taskColor: raw.taskColor,
        brandName: raw.brandName,
        brandColor: raw.brandColor,
        sequenceOrder: raw.sequenceOrder,
        resistance: raw.resistance,
        setupBufferMins: raw.setupBufferMins,
      });
      continue;
    }

    // 5a. Try Direct Placement for full duration
    const direct = findDirectPlacement(
      slots,
      effectiveEligibleZoneIds,
      remainingWorkMins,
      raw.setupBufferMins,
      raw.workflowTaskId,
      raw.resistance,
      raw.targetDate,
      dateOrderIndex,
      strategy,
      hardMaxDate,
      minStart
    );

    if (direct) {
      commitInternalPlacement(item, direct, remainingWorkMins, false);
      continue;
    }

    // 5b. Try 1-Hop / 2-Hop Augmenting-Path Zone Swaps
    let swapSucceeded = false;
    for (const zoneId of effectiveEligibleZoneIds) {
      const swapRes = attemptAugmentingPathSwap(
        slots,
        zoneId,
        remainingWorkMins,
        raw.setupBufferMins,
        raw.workflowTaskId,
        raw.resistance,
        raw.targetDate,
        dateOrderIndex,
        raw.title,
        raw.taskName,
        strategy,
        hardMaxDate,
        minStart
      );
      if (swapRes.success && swapRes.placement) {
        swapsExecuted.push(...swapRes.swaps);
        commitInternalPlacement(item, swapRes.placement, remainingWorkMins, false);
        swapSucceeded = true;
        break;
      }
    }
    if (swapSucceeded) continue;

    // 5c. Splittable Task Chunking
    if (raw.isSplittable && Math.max(5, raw.minSplitChunkMins) < remainingWorkMins) {
      let leftMins = remainingWorkMins;
      const minChunk = Math.max(5, raw.minSplitChunkMins);
      const maxSplitIterations = 250;
      let splitIterations = 0;

      while (leftMins > 0 && splitIterations < maxSplitIterations) {
        splitIterations++;
        // Choose chunk size: either full leftMins or largest fitting chunk >= minChunk
        // without leaving a sub-minimum tail (unless leftMins <= minChunk)
        let placedChunk = false;

        // Find all candidate intervals in eligible zones that can fit at least minChunk
        const candidateIntervals: {
          slot: MutableDatedSlot;
          interval: FreeInterval;
          chunkMins: number;
          placement: PlacementCandidate;
        }[] = [];

        for (const slot of slots) {
          if (!effectiveEligibleZoneIds.includes(slot.zoneId)) continue;
          for (const interval of getFreeIntervals(slot)) {
            const trimmedInterval = trimIntervalByMinStart(
              slot.dateString,
              interval,
              minStart
            );
            if (!trimmedInterval) continue;
            const probe = evaluateSlotInterval(
              slot,
              trimmedInterval,
              Math.min(leftMins, minChunk),
              raw.setupBufferMins,
              raw.workflowTaskId,
              raw.resistance,
              raw.targetDate,
              dateOrderIndex,
              strategy,
              hardMaxDate,
              minStart
            );
            if (!probe) continue;

            const maxWorkInInterval =
              trimmedInterval.duration - probe.effectiveSetup;
            let chunkMins = Math.min(leftMins, maxWorkInInterval);
            // Avoid stranding a tiny tail smaller than minChunk
            if (chunkMins < leftMins && leftMins - chunkMins < minChunk) {
              chunkMins = leftMins - minChunk;
            }
            if (chunkMins < Math.min(leftMins, minChunk)) continue;

            const sizedPlacement = evaluateSlotInterval(
              slot,
              trimmedInterval,
              chunkMins,
              raw.setupBufferMins,
              raw.workflowTaskId,
              raw.resistance,
              raw.targetDate,
              dateOrderIndex,
              strategy,
              hardMaxDate,
              minStart
            );
            if (sizedPlacement) {
              candidateIntervals.push({
                slot,
                interval,
                chunkMins,
                placement: sizedPlacement,
              });
            }
          }
        }

        if (candidateIntervals.length > 0) {
          // Prefer largest fitting chunk among top-scoring pre-deadline slots
          candidateIntervals.sort((a, b) => {
            const scoreDiff = b.placement.score - a.placement.score;
            if (Math.abs(scoreDiff) > 50) return scoreDiff;
            return b.chunkMins - a.chunkMins;
          });
          const chosen = candidateIntervals[0];
          if (chosen.chunkMins > 0) {
            commitInternalPlacement(item, chosen.placement, chosen.chunkMins, true);
            leftMins -= chosen.chunkMins;
            placedChunk = true;
          }
        } else {
          // Try augmenting-path swap for a minChunk-sized piece
          const targetChunk =
            leftMins >= minChunk * 2 ? minChunk : leftMins;
          if (targetChunk > 0) {
            for (const zoneId of effectiveEligibleZoneIds) {
              const swapRes = attemptAugmentingPathSwap(
                slots,
                zoneId,
                targetChunk,
                raw.setupBufferMins,
                raw.workflowTaskId,
                raw.resistance,
                raw.targetDate,
                dateOrderIndex,
                raw.title,
                raw.taskName,
                strategy,
                hardMaxDate,
                minStart
              );
              if (swapRes.success && swapRes.placement) {
                swapsExecuted.push(...swapRes.swaps);
                commitInternalPlacement(item, swapRes.placement, targetChunk, true);
                leftMins -= targetChunk;
                placedChunk = true;
                break;
              }
            }
          }
        }

        if (!placedChunk) {
          unplacedTasks.push({
            sourceType: raw.sourceType,
            sourceId: raw.sourceId,
            title: raw.title,
            taskName: raw.taskName,
            targetDate: raw.targetDate,
            publishDate: raw.publishDate,
            worstCaseTargetDate: raw.worstCaseTargetDate,
            team1stTargetDate: raw.team1stTargetDate,
            teamFinalTargetDate: raw.teamFinalTargetDate,
            missingMinutes: leftMins,
            eligibleZoneIds: effectiveEligibleZoneIds,
            reason: `No eligible slot could fit remaining ${leftMins}m chunk (min chunk ${minChunk}m).`,
            contentItemId: raw.contentItemId,
            uniqueContentId: raw.uniqueContentId,
            contentTypeName: raw.contentTypeName,
            contentTypeColor: raw.contentTypeColor,
            taskColor: raw.taskColor,
            brandName: raw.brandName,
            brandColor: raw.brandColor,
            sequenceOrder: raw.sequenceOrder,
            resistance: raw.resistance,
            setupBufferMins: raw.setupBufferMins,
          });
          break;
        }
      }

      if (leftMins > 0 && splitIterations >= maxSplitIterations) {
        unplacedTasks.push({
          sourceType: raw.sourceType,
          sourceId: raw.sourceId,
          title: raw.title,
          taskName: raw.taskName,
          targetDate: raw.targetDate,
          publishDate: raw.publishDate,
          worstCaseTargetDate: raw.worstCaseTargetDate,
          team1stTargetDate: raw.team1stTargetDate,
          teamFinalTargetDate: raw.teamFinalTargetDate,
          missingMinutes: leftMins,
          eligibleZoneIds: effectiveEligibleZoneIds,
          reason: `Reached max split iteration safeguard (${maxSplitIterations}) with ${leftMins}m remaining.`,
          contentItemId: raw.contentItemId,
          uniqueContentId: raw.uniqueContentId,
          contentTypeName: raw.contentTypeName,
          contentTypeColor: raw.contentTypeColor,
          taskColor: raw.taskColor,
          brandName: raw.brandName,
          brandColor: raw.brandColor,
          sequenceOrder: raw.sequenceOrder,
          resistance: raw.resistance,
          setupBufferMins: raw.setupBufferMins,
        });
      }
      continue;
    }

    // 5d. Unsplittable task could not fit
    unplacedTasks.push({
      sourceType: raw.sourceType,
      sourceId: raw.sourceId,
      title: raw.title,
      taskName: raw.taskName,
      targetDate: raw.targetDate,
      publishDate: raw.publishDate,
      worstCaseTargetDate: raw.worstCaseTargetDate,
      team1stTargetDate: raw.team1stTargetDate,
      teamFinalTargetDate: raw.teamFinalTargetDate,
      missingMinutes: remainingWorkMins,
      eligibleZoneIds: effectiveEligibleZoneIds,
      reason: `Insufficient contiguous capacity (${remainingWorkMins}m + ${raw.setupBufferMins}m setup) in eligible zones.`,
      contentItemId: raw.contentItemId,
      uniqueContentId: raw.uniqueContentId,
      contentTypeName: raw.contentTypeName,
      contentTypeColor: raw.contentTypeColor,
      taskColor: raw.taskColor,
      brandName: raw.brandName,
      brandColor: raw.brandColor,
      sequenceOrder: raw.sequenceOrder,
      resistance: raw.resistance,
      setupBufferMins: raw.setupBufferMins,
    });
  }

  // 6. Gather Final Allocations
  const allInternal: InternalAllocation[] = [...orphanPinnedAllocations];
  for (const s of slots) {
    allInternal.push(...s.allocations);
  }
  allInternal.sort((a, b) => {
    if (a.dateString !== b.dateString) return a.dateString.localeCompare(b.dateString);
    return a.startMinute - b.startMinute;
  });

  const allocations: SolvedAllocation[] = allInternal.map((a) => ({
    id: a.id,
    userId: a.userId,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
    dateString: a.dateString,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
    setupMinsUsed: a.setupMinsUsed,
    zoneId: a.zoneId,
    isPinned: a.isPinned,
    isVacationPreScheduled: a.isVacationPreScheduled,
    originalTargetDate: a.originalTargetDate,
    title: a.title,
    taskName: a.taskName,
    workflowTaskId: a.workflowTaskId,
    contentItemId: a.contentItemId,
    uniqueContentId: a.uniqueContentId,
    contentTypeId: a.contentTypeId,
    contentTypeName: a.contentTypeName,
    contentTypeColor: a.contentTypeColor,
    taskColor: a.taskColor,
    brandName: a.brandName,
    brandColor: a.brandColor,
    sequenceOrder: a.sequenceOrder,
    resistance: a.resistance,
    durationMins: a.durationMins,
    targetDate: a.targetDate,
    publishDate: a.publishDate,
    worstCaseTargetDate: a.worstCaseTargetDate,
    team1stTargetDate: a.team1stTargetDate,
    teamFinalTargetDate: a.teamFinalTargetDate,
    isPartialChunk: a.isPartialChunk,
    eligibleZoneIds: a.effectiveEligibleZoneIds,
    baseSetupBufferMins: a.baseSetupBufferMins,
  }));

  // 7. Zone Utilization & Bottleneck Diagnostics
  const zoneUtilization: ZoneUtilizationReport[] = [];
  for (const zone of effectiveZonesList) {
    const zoneSlots = slots.filter((s) => s.zoneId === zone.id);
    const availableMinutes = zoneSlots.reduce((sum, s) => sum + s.totalMinutes, 0);

    let workMinutes = 0;
    let setupMinutes = 0;
    let shiftableMinutes = 0;

    for (const slot of zoneSlots) {
      for (const alloc of slot.allocations) {
        workMinutes += alloc.durationMins;
        setupMinutes += alloc.setupMinsUsed;

        if (!alloc.isPinned) {
          const altZones = alloc.effectiveEligibleZoneIds.filter((z) => z !== zone.id);
          if (altZones.length > 0) {
            const blockTotal = alloc.endMinute - alloc.startMinute;
            const canMove = altZones.some((otherZoneId) => {
              const otherFree = slots
                .filter((s) => s.zoneId === otherZoneId)
                .reduce(
                  (acc, s) =>
                    acc + getFreeIntervals(s).reduce((iSum, iv) => iSum + iv.duration, 0),
                  0
                );
              return otherFree >= blockTotal;
            });
            if (canMove) shiftableMinutes += blockTotal;
          }
        }
      }
    }

    const allocatedMinutes = workMinutes + setupMinutes;
    const remainingFreeMinutes = Math.max(0, availableMinutes - allocatedMinutes);
    const utilizationPercent =
      availableMinutes > 0
        ? Math.round((allocatedMinutes / availableMinutes) * 1000) / 10
        : 0;

    zoneUtilization.push({
      zoneId: zone.id,
      zoneName: zone.name,
      zoneColor: zone.color,
      availableMinutes,
      allocatedMinutes,
      workMinutes,
      setupMinutes,
      remainingFreeMinutes,
      shiftableMinutes,
      utilizationPercent,
      isBottleneck: false,
    });
  }

  const bottleneckZoneIds: string[] = [];
  for (const unplaced of unplacedTasks) {
    for (const zId of unplaced.eligibleZoneIds) {
      const zUtil = zoneUtilization.find((u) => u.zoneId === zId);
      if (zUtil) {
        const effectiveFree = zUtil.remainingFreeMinutes + zUtil.shiftableMinutes;
        if (effectiveFree < unplaced.missingMinutes && !bottleneckZoneIds.includes(zId)) {
          bottleneckZoneIds.push(zId);
          zUtil.isBottleneck = true;
        }
      }
    }
  }

  if (bottleneckZoneIds.length === 0) {
    const highUtil = [...zoneUtilization]
      .filter((u) => u.availableMinutes > 0 && u.utilizationPercent >= 85)
      .sort((a, b) => a.remainingFreeMinutes - b.remainingFreeMinutes);
    if (highUtil.length > 0) {
      highUtil[0].isBottleneck = true;
      bottleneckZoneIds.push(highUtil[0].zoneId);
    }
  }

  const totalAvailableMins = zoneUtilization.reduce(
    (sum, z) => sum + z.availableMinutes,
    0
  );
  const totalScheduledMins = zoneUtilization.reduce(
    (sum, z) => sum + z.allocatedMinutes,
    0
  );
  const totalScheduledWorkMins = zoneUtilization.reduce(
    (sum, z) => sum + z.workMinutes,
    0
  );
  const batchingSavedMins = computeBatchingSavedMins(slots);

  let status: DatedSolverResult["status"] = "OPTIMAL_FIT";
  let statusMessage =
    "Optimal Fit: All active tasks scheduled within horizon capacity.";

  if (unplacedTasks.length > 0) {
    status = "CAPACITY_EXCEEDED";
    const missingTotal = unplacedTasks.reduce((sum, u) => sum + u.missingMinutes, 0);
    const bottleneckNames = bottleneckZoneIds
      .map((id) => effectiveZonesList.find((z) => z.id === id)?.name || id)
      .join(", ");
    statusMessage = `Capacity Exceeded: ${missingTotal}m unplaced across ${unplacedTasks.length} task(s)${
      bottleneckNames ? ` (bottleneck: ${bottleneckNames})` : ""
    }.`;
  } else if (swapsExecuted.length > 0) {
    status = "SWAP_APPLIED";
    statusMessage = `Smart Zone Swap Applied: Executed ${swapsExecuted.length} augmenting-path relocation(s) to fit all tasks.`;
  }

  const solveDurationMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    status,
    statusMessage,
    allocations,
    unplacedTasks,
    zoneUtilization,
    bottleneckZoneIds,
    swapsExecuted,
    totalScheduledMins,
    totalScheduledWorkMins,
    totalAvailableMins,
    completedExcludedMins,
    completedTasks,
    batchingSavedMins,
    solveDurationMs,
  };
}

/**
 * Computes accurate zone capacity, utilization, and status metrics for a viewed
 * date window (e.g., 7-day Mon-Sun week) from an already-solved set of allocations.
 */
export function buildViewWeekSolverResult(params: {
  startDate: string;
  endDate: string;
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds?: DbWeeklyDayBounds[];
  overrides: DbCalendarDateOverride[];
  allocations: SolvedAllocation[];
  unplacedTasks: UnplacedTask[];
  completedTasks: SchedulerTaskInput[];
  swapsExecuted?: SwapLogEntry[];
  solveDurationMs?: number;
}): DatedSolverResult {
  const {
    startDate,
    endDate,
    zones,
    weeklySlots,
    dayBounds = [],
    overrides,
    allocations,
    unplacedTasks,
    completedTasks,
    swapsExecuted = [],
    solveDurationMs = 0,
  } = params;

  const isSingleOpenZoneMode = zones.length === 0;
  const effectiveZonesList: DbScheduleZone[] = isSingleOpenZoneMode
    ? [
        {
          id: OPEN_WORKDAY_ZONE_ID,
          userId: zones[0]?.userId ?? "creator",
          name: "Open Workday",
          color: "#6366f1",
          icon: "Briefcase",
          orderIndex: 0,
        },
      ]
    : zones;

  const { slots } = buildDatedSlots(
    startDate,
    endDate,
    zones,
    weeklySlots,
    overrides,
    dayBounds
  );

  // Attach view allocations onto slots for batching/utilization calculation
  for (const alloc of allocations) {
    const slot = slots.find(
      (s) =>
        s.dateString === alloc.dateString &&
        s.zoneId === alloc.zoneId &&
        alloc.startMinute < s.endMinute &&
        alloc.endMinute > s.startMinute
    );
    if (slot) {
      slot.allocations.push({
        id: alloc.id,
        userId: alloc.userId,
        sourceType: alloc.sourceType,
        sourceId: alloc.sourceId,
        dateString: alloc.dateString,
        startMinute: alloc.startMinute,
        endMinute: alloc.endMinute,
        durationMins: alloc.durationMins,
        setupMinsUsed: alloc.setupMinsUsed,
        zoneId: alloc.zoneId,
        isPinned: alloc.isPinned,
        isVacationPreScheduled: alloc.isVacationPreScheduled,
        originalTargetDate: alloc.originalTargetDate,
        workflowTaskId: alloc.workflowTaskId,
        title: alloc.title,
        taskName: alloc.taskName,
        contentItemId: alloc.contentItemId,
        uniqueContentId: alloc.uniqueContentId,
        contentTypeId: alloc.contentTypeId,
        contentTypeName: alloc.contentTypeName,
        contentTypeColor: alloc.contentTypeColor,
        taskColor: alloc.taskColor,
        brandName: alloc.brandName,
        brandColor: alloc.brandColor,
        sequenceOrder: alloc.sequenceOrder ?? 500,
        resistance: alloc.resistance,
        targetDate: alloc.targetDate,
        publishDate: alloc.publishDate,
        worstCaseTargetDate: alloc.worstCaseTargetDate,
        team1stTargetDate: alloc.team1stTargetDate,
        teamFinalTargetDate: alloc.teamFinalTargetDate,
        isPartialChunk: alloc.isPartialChunk,
        effectiveEligibleZoneIds: alloc.eligibleZoneIds,
        baseSetupBufferMins: alloc.baseSetupBufferMins,
      });
    }
  }

  const zoneUtilization: ZoneUtilizationReport[] = [];
  for (const zone of effectiveZonesList) {
    const zoneSlots = slots.filter((s) => s.zoneId === zone.id);
    const availableMinutes = zoneSlots.reduce((sum, s) => sum + s.totalMinutes, 0);

    const zoneAllocs = allocations.filter((a) => a.zoneId === zone.id);
    const workMinutes = zoneAllocs.reduce((sum, a) => sum + a.durationMins, 0);
    const setupMinutes = zoneAllocs.reduce((sum, a) => sum + a.setupMinsUsed, 0);
    const allocatedMinutes = workMinutes + setupMinutes;
    const remainingFreeMinutes = Math.max(0, availableMinutes - allocatedMinutes);
    const utilizationPercent =
      availableMinutes > 0
        ? Math.round((allocatedMinutes / availableMinutes) * 1000) / 10
        : 0;

    zoneUtilization.push({
      zoneId: zone.id,
      zoneName: zone.name,
      zoneColor: zone.color,
      availableMinutes,
      allocatedMinutes,
      workMinutes,
      setupMinutes,
      remainingFreeMinutes,
      shiftableMinutes: 0,
      utilizationPercent,
      isBottleneck: false,
    });
  }

  const bottleneckZoneIds: string[] = [];
  for (const unplaced of unplacedTasks) {
    for (const zId of unplaced.eligibleZoneIds) {
      const zUtil = zoneUtilization.find((u) => u.zoneId === zId);
      if (zUtil && zUtil.remainingFreeMinutes < unplaced.missingMinutes) {
        if (!bottleneckZoneIds.includes(zId)) {
          bottleneckZoneIds.push(zId);
          zUtil.isBottleneck = true;
        }
      }
    }
  }

  const totalAvailableMins = zoneUtilization.reduce(
    (sum, z) => sum + z.availableMinutes,
    0
  );
  const totalScheduledMins = zoneUtilization.reduce(
    (sum, z) => sum + z.allocatedMinutes,
    0
  );
  const totalScheduledWorkMins = zoneUtilization.reduce(
    (sum, z) => sum + z.workMinutes,
    0
  );
  const completedExcludedMins = completedTasks.reduce(
    (sum, t) => sum + t.durationMins,
    0
  );
  const batchingSavedMins = computeBatchingSavedMins(slots);

  let status: DatedSolverResult["status"] = "OPTIMAL_FIT";
  let statusMessage =
    "Optimal Fit: All active tasks scheduled within horizon capacity.";

  if (unplacedTasks.length > 0) {
    status = "CAPACITY_EXCEEDED";
    const missingTotal = unplacedTasks.reduce((sum, u) => sum + u.missingMinutes, 0);
    const bottleneckNames = bottleneckZoneIds
      .map((id) => effectiveZonesList.find((z) => z.id === id)?.name || id)
      .join(", ");
    statusMessage = `Capacity Exceeded: ${missingTotal}m unplaced across ${unplacedTasks.length} task(s)${
      bottleneckNames ? ` (bottleneck: ${bottleneckNames})` : ""
    }.`;
  } else if (swapsExecuted.length > 0) {
    status = "SWAP_APPLIED";
    statusMessage = `Smart Zone Swap Applied: Executed ${swapsExecuted.length} augmenting-path relocation(s) to fit all tasks.`;
  }

  return {
    status,
    statusMessage,
    allocations,
    unplacedTasks,
    zoneUtilization,
    bottleneckZoneIds,
    swapsExecuted,
    totalScheduledMins,
    totalScheduledWorkMins,
    totalAvailableMins,
    completedExcludedMins,
    completedTasks,
    batchingSavedMins,
    solveDurationMs,
  };
}
