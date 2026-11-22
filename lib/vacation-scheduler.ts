import prisma from "@/lib/prisma";
import { loadLiveScheduleInputs } from "@/lib/scheduler-ingestion";
import {
  addDaysToDateString,
  DatedSolverResult,
  enumerateDates,
  formatLocalDateString,
  getDayOfWeekMon0,
  solveDatedSchedule,
  SolvedAllocation,
} from "@/lib/scheduler-engine";
import { calculateTaskTargetDates, WorkflowTaskDefinition } from "@/lib/task-engine";
import { getRoleConfigForContentType } from "@/lib/permissions";
import {
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  OPEN_WORKDAY_ZONE_ID,
} from "@/lib/schedule-seed";
import type {
  DbCalendarDateOverride,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  RolePermissions,
} from "@/types/database";

export type VacationModelId =
  | "front_load"
  | "level_load"
  | "team_unblocker"
  | "deficit_advisor";

export interface VacationImpactedTask {
  sourceType: SolvedAllocation["sourceType"];
  sourceId: string;
  contentItemId: string | null;
  uniqueContentId: string | null;
  title: string;
  taskName: string;
  durationMins: number;
  originalTargetDate: string | null;
  publishDate: string | null;
  isTeamHandoffCritical: boolean;
  downstreamHandoffSummary: string | null;
  disposition: "pulled_forward" | "deferred" | "overtime_fit" | "unplaced";
  newDateString: string | null;
  newStartMinute: number | null;
  newEndMinute: number | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneColor: string | null;
  setupMinsUsed: number;
}

export interface VacationCustomSlotDraft {
  zoneId: string;
  startMinute: number;
  endMinute: number;
}

export interface VacationOvertimeSuggestion {
  id: string;
  dateString: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  addedMinutes: number;
  boostStartMinute: number;
  boostEndMinute: number;
  description: string;
  customSlots: VacationCustomSlotDraft[];
}

export interface VacationPublishShiftSuggestion {
  contentItemId: string;
  uniqueContentId: string | null;
  contentTypeName: string;
  currentTitle: string;
  isPlaceholder: boolean;
  currentPublishDate: string;
  suggestedPublishDate: string;
  freedPreVacationMins: number;
  reason: string;
}

export interface VacationModelMetrics {
  tasksPulledForward: number;
  tasksDeferredPostVacation: number;
  peakDailyLoadPercent: number;
  batchingSavedMins: number;
  teamHandoffsProtected: number;
  deficitMins: number;
  overtimeAddedMins: number;
}

export interface VacationModelSimulation {
  modelId: VacationModelId;
  name: string;
  tagline: string;
  description: string;
  recommended: boolean;
  metrics: VacationModelMetrics;
  impactedTasks: VacationImpactedTask[];
  allocationsToApply: SolvedAllocation[];
  overtimeSuggestions: VacationOvertimeSuggestion[];
  publishShiftSuggestions: VacationPublishShiftSuggestion[];
  solverStatus: DatedSolverResult["status"];
  solverMessage: string;
}

export interface VacationSimulationResult {
  userId: string;
  vacationStart: string;
  vacationEnd: string;
  holidayLabel: string;
  horizonStart: string;
  horizonEnd: string;
  preVacationLastDay: string;
  postVacationFirstDay: string;
  impactedTaskCount: number;
  totalImpactedMinutes: number;
  handoffCriticalCount: number;
  models: VacationModelSimulation[];
}

interface ContentItemPipelineMeta {
  contentItemId: string;
  uniqueContentId: string | null;
  contentTypeName: string;
  title: string;
  publishDate: string;
  isPlaceholder: boolean;
}

interface TaskContextMeta {
  publishDate: string | null;
  isPlaceholder: boolean;
  contentTypeName: string | null;
  isTeamHandoffCritical: boolean;
  downstreamHandoffSummary: string | null;
}

function buildRoleOwnedTaskMap(roles: {
  id: string;
  name: string;
  assigned_content_types: string;
  permissions: string;
}[]) {
  return roles.map((r) => {
    let assigned: string[] = [];
    let perms: RolePermissions = {};
    try {
      assigned = JSON.parse(r.assigned_content_types || "[]");
    } catch {
      assigned = [];
    }
    try {
      perms = JSON.parse(r.permissions || "{}");
    } catch {
      perms = {};
    }
    return { id: r.id, name: r.name, assigned, perms };
  });
}

function doesRoleOwnTask(
  role: ReturnType<typeof buildRoleOwnedTaskMap>[number],
  contentTypeId: string,
  contentTypeName: string,
  taskName: string
): boolean {
  if (
    role.assigned.length > 0 &&
    !role.assigned.includes("ALL") &&
    !role.assigned.includes(contentTypeId) &&
    !role.assigned.includes(contentTypeName)
  ) {
    return false;
  }

  const lower = taskName.toLowerCase();
  const cfg = getRoleConfigForContentType(role.perms, contentTypeId);

  const scriptResp =
    cfg.responsibilities?.scripting ?? role.perms.responsibilities?.scripting;
  if (
    scriptResp?.enabled &&
    (scriptResp.target_task_name || "Script").toLowerCase() === lower
  ) {
    return true;
  }

  const subResp =
    cfg.responsibilities?.content_submission ??
    role.perms.responsibilities?.content_submission;
  if (
    subResp?.enabled &&
    (subResp.target_task_name || "Edit").toLowerCase() === lower
  ) {
    return true;
  }

  if ((role.perms.submission_tasks || []).some((t) => t.toLowerCase() === lower)) {
    return true;
  }
  if (role.perms.submission_task?.toLowerCase() === lower) {
    return true;
  }
  if ((role.perms.allowed_tasks || []).some((t) => t.toLowerCase() === lower)) {
    return true;
  }
  for (const [k, level] of Object.entries(cfg.index?.tasks || {})) {
    if (level === "edit" && k.toLowerCase() === lower) return true;
  }
  return false;
}

function getEffectiveSlotsForDate(
  dateString: string,
  weeklySlots: DbWeeklyZoneSlot[],
  overridesByDate: Map<string, DbCalendarDateOverride>,
  zonesCount = 1,
  dayBounds: DbWeeklyDayBounds[] = []
): { zoneId: string; startMinute: number; endMinute: number }[] {
  const ov = overridesByDate.get(dateString);
  if (ov?.isHoliday) return [];
  const dow = getDayOfWeekMon0(dateString);
  const bound = dayBounds.find((b) => b.dayOfWeek === dow);
  const workStart = bound?.workStartMinute ?? DEFAULT_WORK_START_MINUTE;
  const workEnd = bound?.workEndMinute ?? DEFAULT_WORK_END_MINUTE;

  if (ov?.customSlotsJson) {
    try {
      const parsed = JSON.parse(ov.customSlotsJson);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (s) =>
              typeof s?.zoneId === "string" &&
              typeof s?.startMinute === "number" &&
              typeof s?.endMinute === "number" &&
              s.endMinute > s.startMinute
          )
          .map((s) => ({
            zoneId: zonesCount === 0 ? OPEN_WORKDAY_ZONE_ID : s.zoneId,
            startMinute: Math.max(workStart, s.startMinute),
            endMinute: Math.min(workEnd, s.endMinute),
          }))
          .filter((s) => s.endMinute > s.startMinute);
      }
    } catch {
      // fallback to weekly template
    }
  }
  if (zonesCount === 0) {
    return workEnd > workStart
      ? [{ zoneId: OPEN_WORKDAY_ZONE_ID, startMinute: workStart, endMinute: workEnd }]
      : [];
  }
  return weeklySlots
    .filter((s) => s.dayOfWeek === dow)
    .map((s) => ({
      zoneId: s.zoneId,
      startMinute: Math.max(workStart, s.startMinute),
      endMinute: Math.min(workEnd, s.endMinute),
    }))
    .filter((s) => s.endMinute > s.startMinute);
}

function computePeakPreVacationDailyLoad(
  preDates: string[],
  allocations: SolvedAllocation[],
  weeklySlots: DbWeeklyZoneSlot[],
  overrides: DbCalendarDateOverride[],
  zonesCount = 1,
  dayBounds: DbWeeklyDayBounds[] = []
): number {
  const ovMap = new Map(overrides.map((o) => [o.dateString, o]));
  let peak = 0;

  for (const d of preDates) {
    const slots = getEffectiveSlotsForDate(d, weeklySlots, ovMap, zonesCount, dayBounds);
    const capMins = slots.reduce((sum, s) => sum + (s.endMinute - s.startMinute), 0);
    if (capMins <= 0) continue;

    const allocMins = allocations
      .filter((a) => a.dateString === d)
      .reduce((sum, a) => sum + (a.endMinute - a.startMinute), 0);

    const pct = Math.round((allocMins / capMins) * 1000) / 10;
    if (pct > peak) peak = pct;
  }

  return peak;
}

function summarizeModelOutcome(params: {
  modelId: VacationModelId;
  name: string;
  tagline: string;
  description: string;
  recommended: boolean;
  result: DatedSolverResult;
  impactedTaskKeys: Set<string>;
  taskContextByKey: Map<string, TaskContextMeta>;
  originalTargetDateByKey: Map<string, string | null>;
  preDates: string[];
  vacationStart: string;
  vacationEnd: string;
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds?: DbWeeklyDayBounds[];
  overridesUsed: DbCalendarDateOverride[];
  overtimeSuggestions?: VacationOvertimeSuggestion[];
  publishShiftSuggestions?: VacationPublishShiftSuggestion[];
}): VacationModelSimulation {
  const {
    modelId,
    name,
    tagline,
    description,
    recommended,
    result,
    impactedTaskKeys,
    taskContextByKey,
    originalTargetDateByKey,
    preDates,
    vacationStart,
    vacationEnd,
    zones,
    weeklySlots,
    dayBounds = [],
    overridesUsed,
    overtimeSuggestions = [],
    publishShiftSuggestions = [],
  } = params;

  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const overtimeDateSet = new Set(overtimeSuggestions.map((o) => o.dateString));

  const impactedTasks: VacationImpactedTask[] = [];
  const allocationsToApply: SolvedAllocation[] = [];

  let tasksPulledForward = 0;
  let tasksDeferredPostVacation = 0;
  let teamHandoffsProtected = 0;

  // Map placed allocations by key (prefer primary or earliest chunk for table display)
  const placedByKey = new Map<string, SolvedAllocation[]>();
  for (const alloc of result.allocations) {
    const key = `${alloc.sourceType}:${alloc.sourceId}`;
    const list = placedByKey.get(key) || [];
    list.push(alloc);
    placedByKey.set(key, list);

    const isAffected =
      impactedTaskKeys.has(key) ||
      (alloc.dateString < vacationStart &&
        (originalTargetDateByKey.get(key) || "") >= vacationStart);

    if (isAffected && !alloc.isPinned) {
      allocationsToApply.push({
        ...alloc,
        isVacationPreScheduled: alloc.dateString < vacationStart,
        originalTargetDate: originalTargetDateByKey.get(key) ?? alloc.targetDate,
      });
    }
  }

  for (const key of impactedTaskKeys) {
    const allocs = placedByKey.get(key) || [];
    const ctx = taskContextByKey.get(key);
    const origDate = originalTargetDateByKey.get(key) ?? null;

    if (allocs.length > 0) {
      const first = allocs[0];
      const zone = zoneById.get(first.zoneId);
      const isBefore = first.dateString < vacationStart;
      const isAfter = first.dateString > vacationEnd;

      if (isBefore) {
        tasksPulledForward++;
        if (ctx?.isTeamHandoffCritical) teamHandoffsProtected++;
      } else if (isAfter) {
        tasksDeferredPostVacation++;
      }

      const disposition: VacationImpactedTask["disposition"] =
        isBefore && overtimeDateSet.has(first.dateString) && modelId === "deficit_advisor"
          ? "overtime_fit"
          : isBefore
          ? "pulled_forward"
          : "deferred";

      impactedTasks.push({
        sourceType: first.sourceType,
        sourceId: first.sourceId,
        contentItemId: first.contentItemId ?? null,
        uniqueContentId: first.uniqueContentId ?? null,
        title: first.title,
        taskName: first.taskName,
        durationMins: allocs.reduce((s, a) => s + a.durationMins, 0),
        originalTargetDate: origDate,
        publishDate: ctx?.publishDate ?? null,
        isTeamHandoffCritical: Boolean(ctx?.isTeamHandoffCritical),
        downstreamHandoffSummary: ctx?.downstreamHandoffSummary ?? null,
        disposition,
        newDateString: first.dateString,
        newStartMinute: first.startMinute,
        newEndMinute: first.endMinute,
        zoneId: first.zoneId,
        zoneName: zone?.name ?? null,
        zoneColor: zone?.color ?? null,
        setupMinsUsed: allocs.reduce((s, a) => s + a.setupMinsUsed, 0),
      });
    } else {
      const unplaced = result.unplacedTasks.find(
        (u) => `${u.sourceType}:${u.sourceId}` === key
      );
      if (unplaced) {
        impactedTasks.push({
          sourceType: unplaced.sourceType,
          sourceId: unplaced.sourceId,
          contentItemId: unplaced.contentItemId ?? null,
          uniqueContentId: unplaced.uniqueContentId ?? null,
          title: unplaced.title,
          taskName: unplaced.taskName,
          durationMins: unplaced.missingMinutes,
          originalTargetDate: origDate,
          publishDate: ctx?.publishDate ?? null,
          isTeamHandoffCritical: Boolean(ctx?.isTeamHandoffCritical),
          downstreamHandoffSummary: ctx?.downstreamHandoffSummary ?? null,
          disposition: "unplaced",
          newDateString: null,
          newStartMinute: null,
          newEndMinute: null,
          zoneId: null,
          zoneName: null,
          zoneColor: null,
          setupMinsUsed: unplaced.setupBufferMins ?? 0,
        });
      }
    }
  }

  impactedTasks.sort((a, b) => {
    if (a.isTeamHandoffCritical !== b.isTeamHandoffCritical) {
      return a.isTeamHandoffCritical ? -1 : 1;
    }
    const da = a.originalTargetDate || "9999-12-31";
    const db = b.originalTargetDate || "9999-12-31";
    return da.localeCompare(db);
  });

  const deficitMins = result.unplacedTasks.reduce(
    (sum, u) => sum + u.missingMinutes,
    0
  );
  const peakDailyLoadPercent = computePeakPreVacationDailyLoad(
    preDates,
    result.allocations,
    weeklySlots,
    overridesUsed,
    zones.length,
    dayBounds
  );
  const overtimeAddedMins = overtimeSuggestions.reduce(
    (sum, s) => sum + s.addedMinutes,
    0
  );

  return {
    modelId,
    name,
    tagline,
    description,
    recommended,
    metrics: {
      tasksPulledForward,
      tasksDeferredPostVacation,
      peakDailyLoadPercent,
      batchingSavedMins: result.batchingSavedMins,
      teamHandoffsProtected,
      deficitMins,
      overtimeAddedMins,
    },
    impactedTasks,
    allocationsToApply,
    overtimeSuggestions,
    publishShiftSuggestions,
    solverStatus: result.status,
    solverMessage: result.statusMessage,
  };
}

/**
 * Simulates 4 distinct PWS vacation pre-scheduling models over [horizonStart, horizonEnd]
 * with [vacationStart, vacationEnd] blocked as 0m holiday capacity.
 */
export async function simulateVacationModels(params: {
  userId: string;
  vacationStart: string;
  vacationEnd: string;
  holidayLabel?: string;
}): Promise<VacationSimulationResult> {
  const { userId, vacationStart, vacationEnd } = params;
  const holidayLabel = params.holidayLabel?.trim() || "Vacation";

  const todayStr = formatLocalDateString(new Date());
  const threeWeeksPrior = addDaysToDateString(vacationStart, -21);
  const horizonStart =
    threeWeeksPrior < todayStr && todayStr <= vacationStart
      ? todayStr
      : threeWeeksPrior > vacationStart
      ? addDaysToDateString(vacationStart, -14)
      : threeWeeksPrior;
  const horizonEnd = addDaysToDateString(vacationEnd, 7);

  const preVacationLastDay = addDaysToDateString(vacationStart, -1);
  const postVacationFirstDay = addDaysToDateString(vacationEnd, 1);
  const allHorizonDates = enumerateDates(horizonStart, horizonEnd);
  const preDates = allHorizonDates.filter((d) => d < vacationStart);

  // 1. Load base live tasks, zones, slots, overrides & pinned allocations
  const bundle = await loadLiveScheduleInputs({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    includeFutureTasks: true,
  });

  // 2. Load ContentItem pipelines + Team Roles for Model 3 handoff detection & Model 4 Open Slot shifts
  const [contentTypes, rawRoles] = await Promise.all([
    prisma.contentType.findMany({
      include: {
        workflow_tasks: { orderBy: { sequence_order: "asc" } },
        content_items: {
          where: { is_archived: false, is_in_idea_bank: false },
          include: { task_instances: true },
        },
      },
    }),
    prisma.role.findMany(),
  ]);

  const parsedRoles = buildRoleOwnedTaskMap(rawRoles);
  const itemMetaById = new Map<string, ContentItemPipelineMeta>();
  const taskContextByKey = new Map<string, TaskContextMeta>();

  for (const ct of contentTypes) {
    const visibleWts = ct.workflow_tasks.filter((wt) => !wt.is_hidden);
    const defs: WorkflowTaskDefinition[] = ct.workflow_tasks.map((wt) => ({
      id: wt.id,
      task_name: wt.task_name,
      sequence_order: wt.sequence_order,
      n_days_offset: wt.n_days_offset,
      team_buffer_days: wt.team_buffer_days,
      team_final_buffer_days: wt.team_final_buffer_days,
      is_hidden: wt.is_hidden,
      color: wt.color,
    }));

    for (const item of ct.content_items) {
      if (!item.publish_date) continue;
      const pubStr = formatLocalDateString(new Date(item.publish_date));
      const isPlaceholder = !item.title?.trim() || !item.unique_content_id?.trim();
      itemMetaById.set(item.id, {
        contentItemId: item.id,
        uniqueContentId: item.unique_content_id,
        contentTypeName: ct.name,
        title: item.title?.trim() || `${ct.name} [Open Slot]`,
        publishDate: pubStr,
        isPlaceholder,
      });

      const targetDates = calculateTaskTargetDates(
        new Date(item.publish_date),
        defs
      );

      for (const wt of visibleWts) {
        const inst = item.task_instances.find(
          (ti) => ti.task_name.toLowerCase() === wt.task_name.toLowerCase()
        );
        const sourceId = inst?.id || `virtual:${item.id}:${wt.id}`;
        const key = `workflow_task:${sourceId}`;

        // Detect downstream workflow tasks owned by a team member inside [vacationStart, vacationEnd]
        let isTeamHandoffCritical = false;
        let downstreamHandoffSummary: string | null = null;

        for (const downWt of visibleWts) {
          if (downWt.sequence_order <= wt.sequence_order) continue;
          const downInst = item.task_instances.find(
            (ti) => ti.task_name.toLowerCase() === downWt.task_name.toLowerCase()
          );
          if (downInst?.status === "done") continue;

          const downCalc = targetDates.get(downWt.task_name.toLowerCase());
          const rawDownDate =
            downInst?.target_date_team ||
            downCalc?.target_date_team ||
            downInst?.target_date_worst_case ||
            downCalc?.target_date_worst_case;
          if (!rawDownDate) continue;

          const downDateStr = formatLocalDateString(new Date(rawDownDate));
          if (downDateStr >= vacationStart && downDateStr <= vacationEnd) {
            const ownerRole = parsedRoles.find((r) =>
              doesRoleOwnTask(r, ct.id, ct.name, downWt.task_name)
            );
            if (ownerRole || userId === "creator") {
              isTeamHandoffCritical = true;
              downstreamHandoffSummary = ownerRole
                ? `Unblocks ${ownerRole.name}'s "${downWt.task_name}" on ${downDateStr}`
                : `Unblocks "${downWt.task_name}" on ${downDateStr}`;
              break;
            }
          }
        }

        taskContextByKey.set(key, {
          publishDate: pubStr,
          isPlaceholder,
          contentTypeName: ct.name,
          isTeamHandoffCritical,
          downstreamHandoffSummary,
        });
      }
    }
  }

  // Enrich misc, action & personal todos in taskContextByKey
  for (const t of bundle.tasks) {
    const key = `${t.sourceType}:${t.sourceId}`;
    if (!taskContextByKey.has(key)) {
      const itemMeta = t.contentItemId
        ? itemMetaById.get(t.contentItemId)
        : undefined;
      taskContextByKey.set(key, {
        publishDate: itemMeta?.publishDate ?? t.targetDate ?? null,
        isPlaceholder: Boolean(itemMeta?.isPlaceholder),
        contentTypeName: itemMeta?.contentTypeName ?? t.contentTypeName ?? null,
        isTeamHandoffCritical: false,
        downstreamHandoffSummary: null,
      });
    }
  }

  // 3. Build synthetic vacation holiday overrides covering [vacationStart, vacationEnd]
  const vacationDateSet = new Set(enumerateDates(vacationStart, vacationEnd));
  const baseOverridesNonVacation = bundle.overrides.filter(
    (o) => !vacationDateSet.has(o.dateString)
  );
  const vacationHolidayOverrides: DbCalendarDateOverride[] = Array.from(
    vacationDateSet
  ).map((dateString) => ({
    id: `sim-vac-${dateString}`,
    userId,
    dateString,
    isHoliday: true,
    holidayLabel,
    customSlotsJson: null,
  }));
  const simOverrides: DbCalendarDateOverride[] = [
    ...baseOverridesNonVacation,
    ...vacationHolidayOverrides,
  ];

  // 4. Determine vacation-impacted tasks
  const activeTasks = bundle.tasks.filter((t) => !t.isDone);
  const impactedTaskKeys = new Set<string>();
  const originalTargetDateByKey = new Map<string, string | null>();
  let totalImpactedMinutes = 0;
  let handoffCriticalCount = 0;

  for (const t of activeTasks) {
    const key = `${t.sourceType}:${t.sourceId}`;
    originalTargetDateByKey.set(key, t.targetDate);
    const ctx = taskContextByKey.get(key);
    const inVacationWindow =
      Boolean(t.targetDate) &&
      t.targetDate! >= vacationStart &&
      t.targetDate! <= vacationEnd;
    const preTripDependent =
      Boolean(ctx?.isTeamHandoffCritical) &&
      (!t.targetDate || t.targetDate <= vacationEnd);

    if (inVacationWindow || preTripDependent) {
      impactedTaskKeys.add(key);
      totalImpactedMinutes += t.durationMins;
      if (ctx?.isTeamHandoffCritical) handoffCriticalCount++;
    }
  }

  // Filter tasks strictly needed within [horizonStart, horizonEnd] for solving
  const tasksInHorizon = activeTasks.map((t) => ({ ...t }));

  // Helper hard constraint maps
  const hardPreVacMaxMap: Record<string, string> = {};
  for (const key of impactedTaskKeys) {
    hardPreVacMaxMap[key] = preVacationLastDay;
  }

  // =========================================================================
  // MODEL 1: Earliest Front-Load ("Peace of Mind")
  // =========================================================================
  const datePenaltiesM1: Record<string, number> = {};
  if (preDates.length >= 1) {
    datePenaltiesM1[preDates[preDates.length - 1]] = -1600;
  }
  if (preDates.length >= 2) {
    datePenaltiesM1[preDates[preDates.length - 2]] = -800;
  }

  const m1Result = solveDatedSchedule({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: simOverrides,
    tasks: tasksInHorizon,
    pinnedAllocations: bundle.pinnedAllocations,
    options: {
      earlyPreferenceWeight: 45,
      datePenalties: datePenaltiesM1,
      hardMaxDateBySourceKey: hardPreVacMaxMap,
    },
  });

  const model1 = summarizeModelOutcome({
    modelId: "front_load",
    name: "Earliest Front-Load",
    tagline: "Peace of Mind",
    description:
      "Pulls vacation-window tasks as early as possible starting from open pre-trip capacity so the final 1–2 days before departure stay calm.",
    recommended: false,
    result: m1Result,
    impactedTaskKeys,
    taskContextByKey,
    originalTargetDateByKey,
    preDates,
    vacationStart,
    vacationEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overridesUsed: simOverrides,
  });

  // =========================================================================
  // MODEL 2: Smoothed & Batched Level-Load ("Anti-Burnout")
  // =========================================================================
  const m2Result = solveDatedSchedule({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: simOverrides,
    tasks: tasksInHorizon,
    pinnedAllocations: bundle.pinnedAllocations,
    options: {
      balanceAcrossDays: true,
      dailyLoadCapRatio: 0.85,
      mergeBonusWeight: 2500,
      hardMaxDateBySourceKey: hardPreVacMaxMap,
    },
  });

  const model2 = summarizeModelOutcome({
    modelId: "level_load",
    name: "Smoothed & Batched Level-Load",
    tagline: "Anti-Burnout",
    description:
      "Caps daily zone utilization around 85% across pre-vacation days while clustering identical tasks to maximize setup buffer savings.",
    recommended: m2Result.unplacedTasks.length === 0 && handoffCriticalCount === 0,
    result: m2Result,
    impactedTaskKeys,
    taskContextByKey,
    originalTargetDateByKey,
    preDates,
    vacationStart,
    vacationEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overridesUsed: simOverrides,
  });

  // =========================================================================
  // MODEL 3: Critical-Path & Team-Handoff Priority ("Team Unblocker")
  // =========================================================================
  const priorityBoostM3: Record<string, number> = {};
  const hardMaxM3: Record<string, string> = {};
  const tasksM3 = tasksInHorizon.map((t) => {
    const key = `${t.sourceType}:${t.sourceId}`;
    if (!impactedTaskKeys.has(key)) return t;
    const ctx = taskContextByKey.get(key);
    const pubAfterTripWithSlack =
      ctx?.publishDate && ctx.publishDate > addDaysToDateString(vacationEnd, 2);

    if (ctx?.isTeamHandoffCritical) {
      priorityBoostM3[key] = 10000;
      hardMaxM3[key] = preVacationLastDay;
      return { ...t, targetDate: preVacationLastDay };
    }
    if (pubAfterTripWithSlack) {
      // Defer non-blocking solo tasks to first return week
      return { ...t, targetDate: postVacationFirstDay };
    }
    hardMaxM3[key] = preVacationLastDay;
    return t;
  });

  const m3Result = solveDatedSchedule({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: simOverrides,
    tasks: tasksM3,
    pinnedAllocations: bundle.pinnedAllocations,
    options: {
      priorityBoostBySourceKey: priorityBoostM3,
      hardMaxDateBySourceKey: hardMaxM3,
    },
  });

  const model3 = summarizeModelOutcome({
    modelId: "team_unblocker",
    name: "Critical-Path & Team Handoff",
    tagline: "Team Unblocker",
    description:
      "Strictly pulls ahead tasks that unblock a Team Member during your trip while deferring slack solo work until after you return.",
    recommended: handoffCriticalCount > 0 && m3Result.unplacedTasks.length === 0,
    result: m3Result,
    impactedTaskKeys,
    taskContextByKey,
    originalTargetDateByKey,
    preDates,
    vacationStart,
    vacationEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overridesUsed: simOverrides,
  });

  // =========================================================================
  // MODEL 4: Minimum Overtime / Schedule Shift Advisor ("Deficit Resolver")
  // =========================================================================
  const baselineDeficitCheck = solveDatedSchedule({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: simOverrides,
    tasks: tasksInHorizon,
    pinnedAllocations: bundle.pinnedAllocations,
    options: {
      priorityBoostBySourceKey: priorityBoostM3,
      hardMaxDateBySourceKey: hardPreVacMaxMap,
    },
  });

  const overtimeSuggestions: VacationOvertimeSuggestion[] = [];
  const publishShiftSuggestions: VacationPublishShiftSuggestion[] = [];
  let advisorOverrides = [...simOverrides];

  if (baselineDeficitCheck.unplacedTasks.length > 0 && preDates.length > 0) {
    // Tally unplaced deficit minutes per zone
    const deficitByZone = new Map<string, number>();
    for (const u of baselineDeficitCheck.unplacedTasks) {
      const targetZone =
        u.eligibleZoneIds[0] || bundle.zones[0]?.id;
      if (targetZone) {
        deficitByZone.set(
          targetZone,
          (deficitByZone.get(targetZone) || 0) +
            u.missingMinutes +
            (u.setupBufferMins ?? 15)
        );
      }
    }

    const simOvMap = new Map(simOverrides.map((o) => [o.dateString, o]));
    const boostedCustomSlotsByDate = new Map<string, VacationCustomSlotDraft[]>();
    const zoneById = new Map(
      (bundle.zones.length > 0
        ? bundle.zones
        : [
            {
              id: OPEN_WORKDAY_ZONE_ID,
              userId,
              name: "Whole Working Day",
              color: "#6366f1",
              icon: "Briefcase",
              orderIndex: 0,
            },
          ]
      ).map((z) => [z.id, z])
    );

    // Spread needed boosts in 45m–90m chunks across pre-vacation days (newest-to-oldest excluding eve if possible)
    const candidateDays = [...preDates].reverse();

    for (const [zoneId, rawNeededMins] of deficitByZone.entries()) {
      let remaining = rawNeededMins;
      const zone = zoneById.get(zoneId);
      if (!zone) continue;

      for (const dateStr of candidateDays) {
        if (remaining <= 0) break;

        const baseSlots =
          boostedCustomSlotsByDate.get(dateStr) ||
          getEffectiveSlotsForDate(
            dateStr,
            bundle.weeklySlots,
            simOvMap,
            bundle.zones.length,
            bundle.dayBounds
          );
        const workingCopy = baseSlots.map((s) => ({ ...s }));
        const zoneSlotIdx = workingCopy.findIndex((s) => s.zoneId === zoneId);

        const chunkAdd = Math.min(remaining, Math.max(45, Math.min(90, remaining)));
        let boostStart = 1140; // 19:00 fallback
        let boostEnd = Math.min(1440, boostStart + chunkAdd);

        if (zoneSlotIdx >= 0) {
          const targetSlot = workingCopy[zoneSlotIdx];
          const maxEndAfter = workingCopy
            .filter((s, idx) => idx !== zoneSlotIdx && s.startMinute >= targetSlot.endMinute)
            .reduce((minS, s) => Math.min(minS, s.startMinute), 1380);
          const roomAfter = Math.max(0, maxEndAfter - targetSlot.endMinute);

          if (roomAfter >= 30) {
            const actualAdd = Math.min(chunkAdd, roomAfter);
            boostStart = targetSlot.endMinute;
            boostEnd = targetSlot.endMinute + actualAdd;
            targetSlot.endMinute = boostEnd;
            remaining -= actualAdd;
            boostedCustomSlotsByDate.set(dateStr, workingCopy);
            overtimeSuggestions.push({
              id: `ot-${dateStr}-${zoneId}`,
              dateString: dateStr,
              zoneId,
              zoneName: zone.name,
              zoneColor: zone.color,
              addedMinutes: actualAdd,
              boostStartMinute: boostStart,
              boostEndMinute: boostEnd,
              description: `+${actualAdd}m in ${zone.name} on ${dateStr}`,
              customSlots: workingCopy,
            });
            continue;
          }
        }

        // Otherwise append evening boost block in any non-overlapping tail after last slot
        const latestEnd = workingCopy.reduce(
          (maxE, s) => Math.max(maxE, s.endMinute),
          540
        );
        if (1410 - latestEnd >= 30) {
          const actualAdd = Math.min(chunkAdd, 1410 - latestEnd);
          boostStart = latestEnd;
          boostEnd = latestEnd + actualAdd;
          workingCopy.push({
            zoneId,
            startMinute: boostStart,
            endMinute: boostEnd,
          });
          remaining -= actualAdd;
          boostedCustomSlotsByDate.set(dateStr, workingCopy);
          overtimeSuggestions.push({
            id: `ot-${dateStr}-${zoneId}`,
            dateString: dateStr,
            zoneId,
            zoneName: zone.name,
            zoneColor: zone.color,
            addedMinutes: actualAdd,
            boostStartMinute: boostStart,
            boostEndMinute: boostEnd,
            description: `+${actualAdd}m evening boost in ${zone.name} on ${dateStr}`,
            customSlots: workingCopy,
          });
        }
      }
    }

    // Apply boosted custom slots into advisorOverrides for simulation
    advisorOverrides = simOverrides.filter(
      (o) => !boostedCustomSlotsByDate.has(o.dateString)
    );
    for (const [dateString, customSlots] of boostedCustomSlotsByDate.entries()) {
      advisorOverrides.push({
        id: `sim-ot-${dateString}`,
        userId,
        dateString,
        isHoliday: false,
        holidayLabel: "Vacation Prep Boost",
        customSlotsJson: JSON.stringify(customSlots),
      });
    }

    // Also identify Open Slot / Placeholder items whose publish_date can shift post-vacation
    const vacationDurationDays = Math.max(
      1,
      enumerateDates(vacationStart, vacationEnd).length
    );
    const seenItems = new Set<string>();
    for (const t of tasksInHorizon) {
      if (!t.contentItemId || seenItems.has(t.contentItemId)) continue;
      const meta = itemMetaById.get(t.contentItemId);
      if (!meta || !meta.isPlaceholder) continue;
      if (meta.publishDate < vacationStart) continue;

      const itemMins = tasksInHorizon
        .filter(
          (cand) =>
            cand.contentItemId === t.contentItemId &&
            impactedTaskKeys.has(`${cand.sourceType}:${cand.sourceId}`)
        )
        .reduce((s, cand) => s + cand.durationMins, 0);
      if (itemMins <= 0) continue;

      seenItems.add(t.contentItemId);
      const suggestedPublish = addDaysToDateString(
        meta.publishDate,
        vacationDurationDays + 2
      );
      publishShiftSuggestions.push({
        contentItemId: meta.contentItemId,
        uniqueContentId: meta.uniqueContentId,
        contentTypeName: meta.contentTypeName,
        currentTitle: meta.title,
        isPlaceholder: meta.isPlaceholder,
        currentPublishDate: meta.publishDate,
        suggestedPublishDate: suggestedPublish,
        freedPreVacationMins: itemMins,
        reason: `Unstarted [Open Slot] — shifting publish date to ${suggestedPublish} frees ${itemMins}m before your trip.`,
      });
    }
  }

  const m4Result = solveDatedSchedule({
    userId,
    startDate: horizonStart,
    endDate: horizonEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: advisorOverrides,
    tasks: tasksInHorizon,
    pinnedAllocations: bundle.pinnedAllocations,
    options: {
      priorityBoostBySourceKey: priorityBoostM3,
      hardMaxDateBySourceKey: hardPreVacMaxMap,
    },
  });

  const model4 = summarizeModelOutcome({
    modelId: "deficit_advisor",
    name: "Overtime & Shift Advisor",
    tagline: "Deficit Resolver",
    description:
      overtimeSuggestions.length > 0 || publishShiftSuggestions.length > 0
        ? `Adds ${overtimeSuggestions.reduce(
            (s, o) => s + o.addedMinutes,
            0
          )}m of targeted zone boosts (or suggests Open Slot shifts) to hit 0 unplaced tasks.`
        : "No pre-vacation deficit detected! Matches balanced pre-trip capacity cleanly with 0m overtime needed.",
    recommended:
      model1.metrics.deficitMins > 0 &&
      model2.metrics.deficitMins > 0 &&
      model3.metrics.deficitMins > 0,
    result: m4Result,
    impactedTaskKeys,
    taskContextByKey,
    originalTargetDateByKey,
    preDates,
    vacationStart,
    vacationEnd,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overridesUsed: advisorOverrides,
    overtimeSuggestions,
    publishShiftSuggestions,
  });

  // Guarantee exactly 1 model carries the Recommended badge
  const models = [model1, model2, model3, model4];
  if (!models.some((m) => m.recommended)) {
    const cleanZeroDeficit = models.find((m) => m.metrics.deficitMins === 0);
    if (cleanZeroDeficit) cleanZeroDeficit.recommended = true;
    else model4.recommended = true;
  }

  return {
    userId,
    vacationStart,
    vacationEnd,
    holidayLabel,
    horizonStart,
    horizonEnd,
    preVacationLastDay,
    postVacationFirstDay,
    impactedTaskCount: impactedTaskKeys.size,
    totalImpactedMinutes,
    handoffCriticalCount,
    models,
  };
}
