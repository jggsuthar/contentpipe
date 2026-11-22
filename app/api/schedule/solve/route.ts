import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { parseEligibleZoneIds, resolveScheduleUserId } from "@/lib/schedule-seed";
import { loadLiveScheduleInputs } from "@/lib/scheduler-ingestion";
import {
  addDaysToDateString,
  AllocationSourceType,
  buildViewWeekSolverResult,
  enumerateDates,
  formatLocalDateString,
  getDayOfWeekMon0,
  solveDatedSchedule,
  SolvedAllocation,
  UnplacedTask,
} from "@/lib/scheduler-engine";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getMondayOfDateStr(dateStr: string): string {
  const dowMon0 = getDayOfWeekMon0(dateStr);
  return addDaysToDateString(dateStr, -dowMon0);
}

function filterTasksForViewWeek<T extends { targetDate?: string | null }>(
  items: T[],
  viewStartDate: string,
  viewEndDate: string,
  currentMonday: string
): T[] {
  const isCurrentOrPastWeek = viewEndDate >= currentMonday && viewStartDate <= currentMonday;
  return items.filter((item) => {
    if (!item.targetDate) return isCurrentOrPastWeek;
    if (item.targetDate >= viewStartDate && item.targetDate <= viewEndDate) {
      return true;
    }
    if (isCurrentOrPastWeek && item.targetDate < viewStartDate) {
      return true;
    }
    return false;
  });
}

async function runGlobalSolveAndPersist(params: {
  userId: string;
  viewStartDate: string;
  viewEndDate: string;
}) {
  const { userId, viewStartDate, viewEndDate } = params;
  const todayStr = formatLocalDateString(new Date());
  const currentMonday = getMondayOfDateStr(todayStr);

  // Solve across the full active pipeline horizon (current week + up to 12 weeks ahead, capped at 90 days)
  const solveStartDate =
    viewStartDate < currentMonday ? viewStartDate : currentMonday;
  const horizonEndCandidate = addDaysToDateString(solveStartDate, 83);
  const rawSolveEnd =
    viewEndDate > horizonEndCandidate ? viewEndDate : horizonEndCandidate;
  const solveEndDate =
    enumerateDates(solveStartDate, rawSolveEnd).length > 89
      ? addDaysToDateString(solveStartDate, 88)
      : rawSolveEnd;

  const bundle = await loadLiveScheduleInputs({
    userId,
    startDate: solveStartDate,
    endDate: solveEndDate,
    includeFutureTasks: false,
  });

  const globalResult = solveDatedSchedule({
    userId,
    startDate: solveStartDate,
    endDate: solveEndDate,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: bundle.overrides,
    tasks: bundle.tasks,
    pinnedAllocations: bundle.pinnedAllocations,
  });

  // Assign deterministic persistent IDs to newly solved unpinned allocations
  const persistedAllocations = globalResult.allocations.map((alloc) =>
    alloc.isPinned
      ? alloc
      : {
          ...alloc,
          id: randomUUID(),
        }
  );

  const unpinnedToInsert = persistedAllocations
    .filter((a) => !a.isPinned)
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      sourceType: a.sourceType,
      sourceId: a.sourceId,
      dateString: a.dateString,
      startMinute: a.startMinute,
      endMinute: a.endMinute,
      setupMinsUsed: a.setupMinsUsed,
      zoneId: a.zoneId,
      isPinned: false,
      isVacationPreScheduled: a.isVacationPreScheduled,
      originalTargetDate: a.originalTargetDate,
    }));

  await prisma.$transaction(async (tx) => {
    // Replace ALL unpinned allocations globally so a task can never duplicate across weeks
    await tx.scheduledAllocation.deleteMany({
      where: {
        userId,
        isPinned: false,
      },
    });

    if (bundle.stalePinnedIds.length > 0) {
      await tx.scheduledAllocation.deleteMany({
        where: {
          id: { in: bundle.stalePinnedIds },
          userId,
        },
      });
    }

    if (unpinnedToInsert.length > 0) {
      await tx.scheduledAllocation.createMany({
        data: unpinnedToInsert,
      });
    }
  });

  // Slice the global solve result down to the requested viewed week
  const viewAllocations = persistedAllocations.filter(
    (a) => a.dateString >= viewStartDate && a.dateString <= viewEndDate
  );
  const viewUnplaced = filterTasksForViewWeek(
    globalResult.unplacedTasks,
    viewStartDate,
    viewEndDate,
    currentMonday
  );
  const viewCompleted = filterTasksForViewWeek(
    globalResult.completedTasks,
    viewStartDate,
    viewEndDate,
    currentMonday
  );
  const viewOverrides = bundle.overrides.filter(
    (o) => o.dateString >= viewStartDate && o.dateString <= viewEndDate
  );

  const viewResult = buildViewWeekSolverResult({
    startDate: viewStartDate,
    endDate: viewEndDate,
    zones: bundle.zones,
    weeklySlots: bundle.weeklySlots,
    dayBounds: bundle.dayBounds,
    overrides: viewOverrides,
    allocations: viewAllocations,
    unplacedTasks: viewUnplaced,
    completedTasks: viewCompleted,
    swapsExecuted: globalResult.swapsExecuted,
    solveDurationMs: globalResult.solveDurationMs,
  });

  return {
    userId,
    startDate: viewStartDate,
    endDate: viewEndDate,
    ...viewResult,
  };
}

/**
 * GET /api/schedule/solve
 * Read-only view of the persisted schedule for the requested week.
 * Never re-runs the solver when navigating weeks (unless the user has 0 saved allocations yet).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const callerUserId = resolveScheduleUserId(session);
    const isCreator =
      session.user.role === "creator" || isCreatorEmail(session.user.email);

    const requestedUserId =
      searchParams.get("targetUserId")?.trim() || callerUserId;

    if (requestedUserId !== callerUserId && !isCreator) {
      return NextResponse.json(
        { error: "Forbidden: Only the Creator can view other team members' schedules" },
        { status: 403 }
      );
    }

    const todayStr = formatLocalDateString(new Date());
    const currentMonday = getMondayOfDateStr(todayStr);
    const rawStart = searchParams.get("startDate")?.trim();
    const rawEnd = searchParams.get("endDate")?.trim();

    const viewStartDate =
      rawStart && DATE_RE.test(rawStart) ? rawStart : currentMonday;
    const viewEndDate =
      rawEnd && DATE_RE.test(rawEnd)
        ? rawEnd
        : addDaysToDateString(viewStartDate, 6);

    if (viewStartDate > viewEndDate) {
      return NextResponse.json(
        { error: "startDate must be on or before endDate" },
        { status: 400 }
      );
    }

    // Check if any solved schedule exists for this user yet; if never solved, run initial global solve once
    const existingCount = await prisma.scheduledAllocation.count({
      where: { userId: requestedUserId },
    });

    if (existingCount === 0) {
      const initialPayload = await runGlobalSolveAndPersist({
        userId: requestedUserId,
        viewStartDate,
        viewEndDate,
      });
      return NextResponse.json(initialPayload);
    }

    // Load live task metadata & all persisted allocations for this user
    const [bundle, allPersisted] = await Promise.all([
      loadLiveScheduleInputs({
        userId: requestedUserId,
        startDate: viewStartDate,
        endDate: viewEndDate,
        includeFutureTasks: true,
      }),
      prisma.scheduledAllocation.findMany({
        where: { userId: requestedUserId },
        orderBy: [{ dateString: "asc" }, { startMinute: "asc" }],
      }),
    ]);

    const activeTaskMap = new Map(
      bundle.tasks
        .filter((t) => !t.isDone)
        .map((t) => [`${t.sourceType}:${t.sourceId}`, t])
    );

    const completedTasks = bundle.tasks.filter((t) => t.isDone);
    const allocatedMinsByTask = new Map<string, number>();
    const staleAllocationIds: string[] = [];
    const viewAllocations: SolvedAllocation[] = [];

    for (const row of allPersisted) {
      const key = `${row.sourceType}:${row.sourceId}`;
      const meta = activeTaskMap.get(key);
      if (!meta) {
        staleAllocationIds.push(row.id);
        continue;
      }

      const workMins = Math.max(
        5,
        row.endMinute - row.startMinute - (row.setupMinsUsed || 0)
      );
      allocatedMinsByTask.set(key, (allocatedMinsByTask.get(key) || 0) + workMins);

      if (row.dateString >= viewStartDate && row.dateString <= viewEndDate) {
        viewAllocations.push({
          id: row.id,
          userId: row.userId,
          sourceType: row.sourceType as AllocationSourceType,
          sourceId: row.sourceId,
          dateString: row.dateString,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
          setupMinsUsed: row.setupMinsUsed,
          zoneId: row.zoneId,
          isPinned: row.isPinned,
          isVacationPreScheduled: row.isVacationPreScheduled,
          originalTargetDate: row.originalTargetDate ?? meta.targetDate,
          title: meta.title,
          taskName: meta.taskName,
          workflowTaskId: meta.workflowTaskId,
          contentItemId: meta.contentItemId,
          uniqueContentId: meta.uniqueContentId,
          contentTypeId: meta.contentTypeId,
          contentTypeName: meta.contentTypeName,
          contentTypeColor: meta.contentTypeColor,
          taskColor: meta.taskColor,
          brandName: meta.brandName,
          brandColor: meta.brandColor,
          sequenceOrder: meta.sequenceOrder,
          resistance: meta.resistance,
          durationMins: workMins,
          targetDate: meta.targetDate,
          publishDate: meta.publishDate,
          worstCaseTargetDate: meta.worstCaseTargetDate,
          team1stTargetDate: meta.team1stTargetDate,
          teamFinalTargetDate: meta.teamFinalTargetDate,
          isPartialChunk: workMins < meta.durationMins,
          eligibleZoneIds: parseEligibleZoneIds(meta.eligibleZoneIds),
          baseSetupBufferMins: meta.setupBufferMins,
        });
      }
    }

    // Clean up any allocations whose underlying tasks became Done/Archived since last solve
    if (staleAllocationIds.length > 0) {
      await prisma.scheduledAllocation.deleteMany({
        where: { id: { in: staleAllocationIds }, userId: requestedUserId },
      });
    }

    // Identify unplaced active tasks whose target date falls in this viewed week (or overdue on current week)
    const activeInView = filterTasksForViewWeek(
      bundle.tasks.filter((t) => !t.isDone),
      viewStartDate,
      viewEndDate,
      currentMonday
    );

    const viewUnplaced: UnplacedTask[] = [];
    for (const t of activeInView) {
      const key = `${t.sourceType}:${t.sourceId}`;
      const placedMins = allocatedMinsByTask.get(key) || 0;
      const missingMinutes = Math.max(0, t.durationMins - placedMins);
      if (missingMinutes > 0 && (placedMins === 0 || t.isSplittable)) {
        viewUnplaced.push({
          sourceType: t.sourceType,
          sourceId: t.sourceId,
          title: t.title,
          taskName: t.taskName,
          targetDate: t.targetDate,
          publishDate: t.publishDate,
          worstCaseTargetDate: t.worstCaseTargetDate,
          team1stTargetDate: t.team1stTargetDate,
          teamFinalTargetDate: t.teamFinalTargetDate,
          missingMinutes,
          eligibleZoneIds: t.eligibleZoneIds,
          reason:
            placedMins === 0
              ? "Not yet placed on calendar — click Auto-Solve to schedule."
              : `${missingMinutes}m remaining unplaced.`,
          contentItemId: t.contentItemId,
          uniqueContentId: t.uniqueContentId,
          contentTypeName: t.contentTypeName,
          contentTypeColor: t.contentTypeColor,
          taskColor: t.taskColor,
          brandName: t.brandName,
          brandColor: t.brandColor,
          sequenceOrder: t.sequenceOrder,
          resistance: t.resistance,
          setupBufferMins: t.setupBufferMins,
        });
      }
    }

    const viewCompleted = filterTasksForViewWeek(
      completedTasks,
      viewStartDate,
      viewEndDate,
      currentMonday
    );

    const viewResult = buildViewWeekSolverResult({
      startDate: viewStartDate,
      endDate: viewEndDate,
      zones: bundle.zones,
      weeklySlots: bundle.weeklySlots,
      dayBounds: bundle.dayBounds,
      overrides: bundle.overrides,
      allocations: viewAllocations,
      unplacedTasks: viewUnplaced,
      completedTasks: viewCompleted,
      swapsExecuted: [],
      solveDurationMs: 0,
    });

    return NextResponse.json({
      userId: requestedUserId,
      startDate: viewStartDate,
      endDate: viewEndDate,
      ...viewResult,
    });
  } catch (error) {
    console.error("Error reading schedule:", error);
    return NextResponse.json(
      { error: "Failed to load schedule" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const callerUserId = resolveScheduleUserId(session);
    const isCreator =
      session.user.role === "creator" || isCreatorEmail(session.user.email);

    const requestedUserId =
      typeof body.targetUserId === "string" && body.targetUserId.trim()
        ? body.targetUserId.trim()
        : callerUserId;

    if (requestedUserId !== callerUserId && !isCreator) {
      return NextResponse.json(
        { error: "Forbidden: Only the Creator can solve schedules for other team members" },
        { status: 403 }
      );
    }

    const todayStr = formatLocalDateString(new Date());
    const currentMonday = getMondayOfDateStr(todayStr);
    const viewStartDate =
      typeof body.startDate === "string" && DATE_RE.test(body.startDate.trim())
        ? body.startDate.trim()
        : currentMonday;
    const viewEndDate =
      typeof body.endDate === "string" && DATE_RE.test(body.endDate.trim())
        ? body.endDate.trim()
        : addDaysToDateString(viewStartDate, 6);

    if (viewStartDate > viewEndDate) {
      return NextResponse.json(
        { error: "startDate must be on or before endDate" },
        { status: 400 }
      );
    }

    const payload = await runGlobalSolveAndPersist({
      userId: requestedUserId,
      viewStartDate,
      viewEndDate,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error solving dated schedule:", error);
    return NextResponse.json(
      { error: "Failed to solve schedule" },
      { status: 500 }
    );
  }
}
