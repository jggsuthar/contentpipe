import prisma from "@/lib/prisma";
import { generateFuturePublishDates } from "@/lib/cadence";
import {
  calculateTaskTargetDates,
  WorkflowTaskDefinition,
} from "@/lib/task-engine";
import {
  getEffectivePermissions,
  getRoleConfigForContentType,
  hasPermission,
} from "@/lib/permissions";
import {
  parseEligibleZoneIds,
  normalizeResistance,
  ensureDefaultScheduleZonesForUser,
  buildNormalizedDayBounds,
} from "@/lib/schedule-seed";
import {
  formatLocalDateString,
  PinnedAllocationInput,
  SchedulerTaskInput,
} from "@/lib/scheduler-engine";
import { resolveTaskColorHex } from "@/lib/task-colors";
import type {
  DbCalendarDateOverride,
  DbScheduleZone,
  DbWeeklyDayBounds,
  DbWeeklyZoneSlot,
  RolePermissions,
} from "@/types/database";

export interface LiveScheduleBundle {
  userId: string;
  zones: DbScheduleZone[];
  weeklySlots: DbWeeklyZoneSlot[];
  dayBounds: DbWeeklyDayBounds[];
  overrides: DbCalendarDateOverride[];
  tasks: SchedulerTaskInput[];
  pinnedAllocations: PinnedAllocationInput[];
  stalePinnedIds: string[];
}

/**
 * Loads live /index tasks (TaskInstance, MiscTask status, ActionItems), PersonalTodos,
 * ScheduleZones, WeeklyZoneSlots, CalendarDateOverrides, and Pinned Allocations
 * for a given user ("creator" or TeamMember roleId/email) and date horizon.
 */
export async function loadLiveScheduleInputs(params: {
  userId: string;
  startDate: string;
  endDate: string;
  includeFutureTasks?: boolean;
}): Promise<LiveScheduleBundle> {
  const { userId, startDate, endDate, includeFutureTasks = false } = params;

  await ensureDefaultScheduleZonesForUser(userId);

  const [zones, weeklySlots, rawDayBounds, overrides, personalTodos, existingPins] =
    await Promise.all([
      prisma.scheduleZone.findMany({
        where: { userId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.weeklyZoneSlot.findMany({
        where: { userId },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      }),
      prisma.weeklyDayBounds.findMany({
        where: { userId },
        orderBy: { dayOfWeek: "asc" },
      }),
      prisma.calendarDateOverride.findMany({
        where: {
          userId,
          dateString: { gte: startDate, lte: endDate },
        },
        orderBy: { dateString: "asc" },
      }),
      prisma.personalTodo.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.scheduledAllocation.findMany({
        where: {
          userId,
          isPinned: true,
          dateString: { gte: startDate, lte: endDate },
        },
      }),
    ]);

  const dayBounds = buildNormalizedDayBounds(rawDayBounds, userId);

  const isCreator = userId === "creator";

  // If TeamMember, resolve their Role permissions and assigned content series
  let teamRolePerms: RolePermissions | null = null;
  let teamAssignedTypes: string[] = [];
  let teamEffectivePerms: string[] = [];

  if (!isCreator) {
    const roleRecord = await prisma.role.findFirst({
      where: {
        OR: [{ id: userId }, { email: userId.toLowerCase() }],
      },
    });
    if (roleRecord) {
      try {
        teamAssignedTypes = JSON.parse(roleRecord.assigned_content_types || "[]");
      } catch {
        teamAssignedTypes = [];
      }
      try {
        teamRolePerms = JSON.parse(roleRecord.permissions || "{}");
      } catch {
        teamRolePerms = {};
      }
      const primaryTask =
        teamRolePerms?.submission_tasks?.[0] ||
        teamRolePerms?.submission_task ||
        null;
      teamEffectivePerms = getEffectivePermissions(
        primaryTask,
        teamRolePerms?.atomic_permissions || []
      );
    }
  }

  const contentTypes = await prisma.contentType.findMany({
    orderBy: { created_at: "asc" },
    include: {
      brand: { select: { id: true, name: true, color: true } },
      workflow_tasks: { orderBy: { sequence_order: "asc" } },
      misc_tasks: true,
      content_items: {
        where: { is_archived: false, is_in_idea_bank: false },
        include: {
          task_instances: true,
        },
        orderBy: { publish_date: "asc" },
      },
    },
  });

  const tasks: SchedulerTaskInput[] = [];
  const todayLocal = new Date();
  todayLocal.setHours(0, 0, 0, 0);

  for (const ct of contentTypes) {
    // Filter content series for team members
    if (!isCreator && teamRolePerms) {
      if (
        teamAssignedTypes.length > 0 &&
        !teamAssignedTypes.includes("ALL") &&
        !teamAssignedTypes.includes(ct.id) &&
        !teamAssignedTypes.includes(ct.name)
      ) {
        continue;
      }
    }

    // Determine allowed workflow task names for team member
    let allowedTaskNamesLower: Set<string> | null = null;
    let canResolveMisc = isCreator;
    let canResolveAction = isCreator;

    if (!isCreator) {
      if (!teamRolePerms) {
        continue;
      }
      const typeConfig = getRoleConfigForContentType(teamRolePerms, ct.id);
      const ownedNames = new Set<string>();

      const scriptResp =
        typeConfig.responsibilities?.scripting ??
        teamRolePerms.responsibilities?.scripting;
      if (scriptResp?.enabled) {
        ownedNames.add((scriptResp.target_task_name || "Script").toLowerCase());
      }

      const subResp =
        typeConfig.responsibilities?.content_submission ??
        teamRolePerms.responsibilities?.content_submission;
      if (subResp?.enabled) {
        ownedNames.add((subResp.target_task_name || "Edit").toLowerCase());
      }

      for (const tName of teamRolePerms.submission_tasks || []) {
        ownedNames.add(tName.toLowerCase());
      }
      if (teamRolePerms.submission_task) {
        ownedNames.add(teamRolePerms.submission_task.toLowerCase());
      }
      for (const tName of teamRolePerms.allowed_tasks || []) {
        ownedNames.add(tName.toLowerCase());
      }
      for (const [taskKey, level] of Object.entries(typeConfig.index?.tasks || {})) {
        if (level === "edit") ownedNames.add(taskKey.toLowerCase());
      }

      allowedTaskNamesLower = ownedNames;
      canResolveMisc = hasPermission(
        teamEffectivePerms,
        "tracker:misc_task:resolve",
        false
      );
      canResolveAction = hasPermission(
        teamEffectivePerms,
        "tracker:action_item:resolve",
        false
      );
    }

    const visibleWorkflowTasks = ct.workflow_tasks.filter((wt) => !wt.is_hidden);
    const workflowTaskDefs: WorkflowTaskDefinition[] = ct.workflow_tasks.map((wt) => ({
      id: wt.id,
      task_name: wt.task_name,
      sequence_order: wt.sequence_order,
      n_days_offset: wt.n_days_offset,
      team_buffer_days: wt.team_buffer_days,
      team_final_buffer_days: wt.team_final_buffer_days,
      is_hidden: wt.is_hidden,
      color: wt.color,
      durationMins: wt.durationMins,
      setupBufferMins: wt.setupBufferMins,
      isSplittable: wt.isSplittable,
      minSplitChunkMins: wt.minSplitChunkMins,
      resistance: wt.resistance,
      eligibleZoneIds: wt.eligibleZoneIds,
    }));

    const occupiedPublishDateKeys = new Set<string>();

    for (const item of ct.content_items) {
      if (!item.publish_date) continue;
      const publishDateObj = new Date(item.publish_date);
      const publishDateKey = publishDateObj.toISOString().split("T")[0];
      occupiedPublishDateKeys.add(publishDateKey);

      // Check if parent ContentItem is published
      const publishInst = item.task_instances.find(
        (ti) => ti.task_name.toLowerCase() === "publish"
      );
      const publishMidnight = new Date(publishDateObj);
      publishMidnight.setHours(0, 0, 0, 0);

      const allPriorVisibleDone = visibleWorkflowTasks
        .filter((wt) => wt.task_name.toLowerCase() !== "publish")
        .every((wt) => {
          const key = wt.task_name.toLowerCase();
          if (key === "ideation") {
            return Boolean(item.title && item.unique_content_id);
          }
          const inst = item.task_instances.find(
            (ti) => ti.task_name.toLowerCase() === key
          );
          return inst?.status === "done";
        });

      const isPublished =
        publishInst?.status === "done" ||
        (allPriorVisibleDone && todayLocal.getTime() >= publishMidnight.getTime());

      // Strict Completion Rule: archived or published ContentItems are excluded
      if (item.is_archived || isPublished) {
        continue;
      }

      const targetDatesMap = calculateTaskTargetDates(
        publishDateObj,
        workflowTaskDefs
      );
      const itemLabel =
        item.title?.trim() ||
        item.unique_content_id ||
        `${ct.name} (${formatLocalDateString(publishDateObj)})`;
      const publishDateStr = formatLocalDateString(publishDateObj);

      // 1. Workflow TaskInstances
      for (const wt of visibleWorkflowTasks) {
        const taskKey = wt.task_name.toLowerCase();
        if (allowedTaskNamesLower && !allowedTaskNamesLower.has(taskKey)) {
          continue;
        }

        const inst = item.task_instances.find(
          (ti) => ti.task_name.toLowerCase() === taskKey
        );
        const isIdeation = taskKey === "ideation";
        const isDone =
          inst?.status === "done" ||
          (isIdeation && Boolean(item.title && item.unique_content_id));

        const calculated = targetDatesMap.get(taskKey);
        const worstCaseDateObj =
          inst?.target_date_worst_case ||
          calculated?.target_date_worst_case ||
          publishDateObj;
        const team1stDateObj =
          inst?.target_date_team ||
          calculated?.target_date_team_1st ||
          publishDateObj;
        const teamFinalDateObj = calculated?.target_date_team_final || null;

        const worstCaseTargetDate = formatLocalDateString(
          new Date(worstCaseDateObj)
        );
        const team1stTargetDate = formatLocalDateString(
          new Date(team1stDateObj)
        );
        const teamFinalTargetDate = teamFinalDateObj
          ? formatLocalDateString(new Date(teamFinalDateObj))
          : null;

        const rawTargetDate = isCreator ? worstCaseDateObj : team1stDateObj;
        const targetDateStr = formatLocalDateString(new Date(rawTargetDate));

        if (!includeFutureTasks && targetDateStr > endDate) {
          continue;
        }

        tasks.push({
          sourceType: "workflow_task",
          sourceId: inst?.id || `virtual:${item.id}:${wt.id}`,
          workflowTaskId: wt.id,
          title: itemLabel,
          taskName: wt.task_name,
          contentItemId: item.id,
          uniqueContentId: item.unique_content_id,
          contentTypeId: ct.id,
          contentTypeName: ct.name,
          contentTypeColor: ct.brand?.color || wt.color || "#6366f1",
          taskColor: resolveTaskColorHex(wt.task_name, wt.color),
          brandName: ct.brand?.name || null,
          brandColor: ct.brand?.color || null,
          sequenceOrder: wt.sequence_order,
          durationMins: Math.max(5, wt.durationMins ?? 60),
          setupBufferMins: wt.setupBufferMins ?? 15,
          isSplittable: Boolean(wt.isSplittable),
          minSplitChunkMins: wt.minSplitChunkMins ?? 30,
          resistance: normalizeResistance(wt.resistance, "MEDIUM"),
          eligibleZoneIds: parseEligibleZoneIds(wt.eligibleZoneIds),
          targetDate: targetDateStr,
          publishDate: publishDateStr,
          worstCaseTargetDate,
          team1stTargetDate,
          teamFinalTargetDate,
          isDone,
        });
      }

      // 2. Misc Tasks (from ContentType.misc_tasks + ContentItem.misc_tasks_status)
      if (canResolveMisc && (includeFutureTasks || publishDateStr <= endDate)) {
        let miscStatuses: { task_name: string; is_done: boolean }[] = [];
        try {
          miscStatuses = JSON.parse(item.misc_tasks_status || "[]");
        } catch {
          miscStatuses = [];
        }

        const seenMisc = new Set<string>();
        for (const mt of ct.misc_tasks) {
          seenMisc.add(mt.task_name.toLowerCase());
          const statusEntry = miscStatuses.find(
            (m) => m.task_name.toLowerCase() === mt.task_name.toLowerCase()
          );
          tasks.push({
            sourceType: "misc_task",
            sourceId: `${item.id}::misc::${mt.id}`,
            workflowTaskId: null,
            title: itemLabel,
            taskName: mt.task_name,
            contentItemId: item.id,
            uniqueContentId: item.unique_content_id,
            contentTypeId: ct.id,
            contentTypeName: ct.name,
            contentTypeColor: ct.brand?.color || "#6366f1",
            taskColor: "#06b6d4",
            brandName: ct.brand?.name || null,
            brandColor: ct.brand?.color || null,
            sequenceOrder: 900,
            durationMins: Math.max(5, mt.durationMins ?? 30),
            setupBufferMins: mt.setupBufferMins ?? 0,
            isSplittable: Boolean(mt.isSplittable),
            minSplitChunkMins: mt.minSplitChunkMins ?? 15,
            resistance: normalizeResistance(mt.resistance, "LOW"),
            eligibleZoneIds: parseEligibleZoneIds(mt.eligibleZoneIds),
            targetDate: publishDateStr,
            publishDate: publishDateStr,
            isDone: Boolean(statusEntry?.is_done),
          });
        }

        for (const ms of miscStatuses) {
          if (seenMisc.has(ms.task_name.toLowerCase())) continue;
          tasks.push({
            sourceType: "misc_task",
            sourceId: `${item.id}::misc::${ms.task_name}`,
            workflowTaskId: null,
            title: itemLabel,
            taskName: ms.task_name,
            contentItemId: item.id,
            uniqueContentId: item.unique_content_id,
            contentTypeId: ct.id,
            contentTypeName: ct.name,
            contentTypeColor: ct.brand?.color || "#6366f1",
            taskColor: "#06b6d4",
            brandName: ct.brand?.name || null,
            brandColor: ct.brand?.color || null,
            sequenceOrder: 901,
            durationMins: 30,
            setupBufferMins: 0,
            isSplittable: false,
            minSplitChunkMins: 15,
            resistance: "LOW",
            eligibleZoneIds: [],
            targetDate: publishDateStr,
            publishDate: publishDateStr,
            isDone: Boolean(ms.is_done),
          });
        }
      }

      // 3. Action Items (ContentItem.custom_action_items)
      if (canResolveAction && (includeFutureTasks || publishDateStr <= endDate)) {
        let actionItems: {
          id: string;
          text: string;
          is_closed: boolean;
        }[] = [];
        try {
          actionItems = JSON.parse(item.custom_action_items || "[]");
        } catch {
          actionItems = [];
        }

        for (const ai of actionItems) {
          if (!ai?.id || !ai?.text) continue;
          tasks.push({
            sourceType: "action_item",
            sourceId: `${item.id}::action::${ai.id}`,
            workflowTaskId: null,
            title: itemLabel,
            taskName: ai.text,
            contentItemId: item.id,
            uniqueContentId: item.unique_content_id,
            contentTypeId: ct.id,
            contentTypeName: ct.name,
            contentTypeColor: ct.brand?.color || "#6366f1",
            taskColor: "#06b6d4",
            brandName: ct.brand?.name || null,
            brandColor: ct.brand?.color || null,
            sequenceOrder: 950,
            durationMins: 20,
            setupBufferMins: 0,
            isSplittable: false,
            minSplitChunkMins: 15,
            resistance: "LOW",
            eligibleZoneIds: [],
            targetDate: publishDateStr,
            publishDate: publishDateStr,
            isDone: Boolean(ai.is_closed),
          });
        }
      }
    }

    // 3b. Open Cadence Placeholders (Ideation not done yet — no ContentItem row in DB yet)
    let parsedUploadDays: string[] = ["Tuesday"];
    try {
      parsedUploadDays = JSON.parse(ct.upload_days || "[\"Tuesday\"]");
    } catch {
      parsedUploadDays = ["Tuesday"];
    }
    let skippedDates: string[] = [];
    try {
      skippedDates = JSON.parse(ct.skipped_publish_dates || "[]");
    } catch {
      skippedDates = [];
    }

    const horizonMonths = Math.max(1, ct.default_months_open || 3);
    const futureDates = generateFuturePublishDates(
      {
        cadence_type: ct.cadence_type as
          | "weekly"
          | "biweekly"
          | "triweekly"
          | "quadrupleweekly",
        cadence_start_date: ct.cadence_start_date,
        upload_days: parsedUploadDays,
      },
      horizonMonths
    );

    for (const pDate of futureDates) {
      const isoDateKey = pDate.toISOString().split("T")[0];
      if (
        occupiedPublishDateKeys.has(isoDateKey) ||
        skippedDates.includes(isoDateKey)
      ) {
        continue;
      }

      const publishDateStr = formatLocalDateString(pDate);
      const placeholderId = `placeholder:${ct.id}:${isoDateKey}`;
      const targetDatesMap = calculateTaskTargetDates(pDate, workflowTaskDefs);

      for (const wt of visibleWorkflowTasks) {
        const taskKey = wt.task_name.toLowerCase();
        if (allowedTaskNamesLower && !allowedTaskNamesLower.has(taskKey)) {
          continue;
        }
        const calculated = targetDatesMap.get(taskKey);
        const worstCaseDateObj = calculated?.target_date_worst_case || pDate;
        const team1stDateObj = calculated?.target_date_team_1st || pDate;
        const teamFinalDateObj = calculated?.target_date_team_final || null;

        const worstCaseTargetDate = formatLocalDateString(
          new Date(worstCaseDateObj)
        );
        const team1stTargetDate = formatLocalDateString(
          new Date(team1stDateObj)
        );
        const teamFinalTargetDate = teamFinalDateObj
          ? formatLocalDateString(new Date(teamFinalDateObj))
          : null;

        const rawTargetDate = isCreator ? worstCaseDateObj : team1stDateObj;
        const targetDateStr = formatLocalDateString(new Date(rawTargetDate));

        if (!includeFutureTasks && targetDateStr > endDate) {
          continue;
        }

        tasks.push({
          sourceType: "workflow_task",
          sourceId: `virtual:${placeholderId}:${wt.id}`,
          workflowTaskId: wt.id,
          title: `Open (${publishDateStr})`,
          taskName: wt.task_name,
          contentItemId: placeholderId,
          uniqueContentId: null,
          contentTypeId: ct.id,
          contentTypeName: ct.name,
          contentTypeColor: ct.brand?.color || wt.color || "#6366f1",
          taskColor: resolveTaskColorHex(wt.task_name, wt.color),
          brandName: ct.brand?.name || null,
          brandColor: ct.brand?.color || null,
          sequenceOrder: wt.sequence_order,
          durationMins: Math.max(5, wt.durationMins ?? 60),
          setupBufferMins: wt.setupBufferMins ?? 15,
          isSplittable: Boolean(wt.isSplittable),
          minSplitChunkMins: wt.minSplitChunkMins ?? 30,
          resistance: normalizeResistance(wt.resistance, "MEDIUM"),
          eligibleZoneIds: parseEligibleZoneIds(wt.eligibleZoneIds),
          targetDate: targetDateStr,
          publishDate: publishDateStr,
          worstCaseTargetDate,
          team1stTargetDate,
          teamFinalTargetDate,
          isDone: false,
        });
      }

      if (canResolveMisc && (includeFutureTasks || publishDateStr <= endDate)) {
        for (const mt of ct.misc_tasks) {
          tasks.push({
            sourceType: "misc_task",
            sourceId: `${placeholderId}::misc::${mt.id}`,
            workflowTaskId: null,
            title: `Open (${publishDateStr})`,
            taskName: mt.task_name,
            contentItemId: placeholderId,
            uniqueContentId: null,
            contentTypeId: ct.id,
            contentTypeName: ct.name,
            contentTypeColor: ct.brand?.color || "#6366f1",
            taskColor: "#06b6d4",
            brandName: ct.brand?.name || null,
            brandColor: ct.brand?.color || null,
            sequenceOrder: 900,
            durationMins: Math.max(5, mt.durationMins ?? 30),
            setupBufferMins: mt.setupBufferMins ?? 0,
            isSplittable: Boolean(mt.isSplittable),
            minSplitChunkMins: mt.minSplitChunkMins ?? 15,
            resistance: normalizeResistance(mt.resistance, "LOW"),
            eligibleZoneIds: parseEligibleZoneIds(mt.eligibleZoneIds),
            targetDate: publishDateStr,
            publishDate: publishDateStr,
            isDone: false,
          });
        }
      }
    }
  }

  // 4. Personal Todos for the user
  for (const todo of personalTodos) {
    if (
      !includeFutureTasks &&
      todo.targetDate &&
      todo.targetDate > endDate
    ) {
      continue;
    }
    tasks.push({
      sourceType: "personal_todo",
      sourceId: todo.id,
      workflowTaskId: null,
      title: todo.title,
      taskName: todo.title,
      taskColor: "#a855f7",
      sequenceOrder: 1000,
      durationMins: Math.max(5, todo.durationMins),
      setupBufferMins: todo.setupBufferMins,
      isSplittable: todo.isSplittable,
      minSplitChunkMins: todo.minSplitChunkMins,
      resistance: normalizeResistance(todo.resistance, "LOW"),
      eligibleZoneIds: parseEligibleZoneIds(todo.eligibleZoneIds),
      targetDate: todo.targetDate,
      isDone: todo.status === "done",
    });
  }

  // Identify stale pinned allocations (whose underlying task is done / archived / missing)
  const activeTaskKeys = new Set(
    tasks.filter((t) => !t.isDone).map((t) => `${t.sourceType}:${t.sourceId}`)
  );

  const pinnedAllocations: PinnedAllocationInput[] = [];
  const stalePinnedIds: string[] = [];

  for (const pin of existingPins) {
    const key = `${pin.sourceType}:${pin.sourceId}`;
    if (!activeTaskKeys.has(key)) {
      stalePinnedIds.push(pin.id);
      continue;
    }
    pinnedAllocations.push({
      id: pin.id,
      userId: pin.userId,
      sourceType: pin.sourceType as PinnedAllocationInput["sourceType"],
      sourceId: pin.sourceId,
      dateString: pin.dateString,
      startMinute: pin.startMinute,
      endMinute: pin.endMinute,
      setupMinsUsed: pin.setupMinsUsed,
      zoneId: pin.zoneId,
      isPinned: pin.isPinned,
      isVacationPreScheduled: pin.isVacationPreScheduled,
      originalTargetDate: pin.originalTargetDate,
    });
  }

  return {
    userId,
    zones,
    weeklySlots,
    dayBounds,
    overrides,
    tasks,
    pinnedAllocations,
    stalePinnedIds,
  };
}
