import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveTargetScheduleUserId } from "@/lib/schedule-seed";
import { enumerateDates } from "@/lib/scheduler-engine";
import { calculateTaskTargetDates, WorkflowTaskDefinition } from "@/lib/task-engine";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AllocationCommitInput {
  sourceType: string;
  sourceId: string;
  dateString: string;
  startMinute: number;
  endMinute: number;
  setupMinsUsed?: number;
  zoneId: string;
  originalTargetDate?: string | null;
}

interface OvertimeOverrideCommitInput {
  dateString: string;
  holidayLabel?: string;
  customSlots: { zoneId: string; startMinute: number; endMinute: number }[];
}

interface PublishShiftCommitInput {
  contentItemId: string;
  suggestedPublishDate: string;
}

/**
 * POST /api/schedule/vacation/apply
 * Commits holiday overrides for [vacationStart, vacationEnd], approved overtime slot overrides,
 * optional open-slot publish shifts, and pins the chosen model's allocations with
 * `isPinned: true` and `isVacationPreScheduled: true`.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const resolved = resolveTargetScheduleUserId(session, body?.targetUserId);
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    const vacationStart =
      typeof body?.vacationStart === "string" ? body.vacationStart.trim() : "";
    const vacationEnd =
      typeof body?.vacationEnd === "string" ? body.vacationEnd.trim() : "";
    const holidayLabel =
      typeof body?.holidayLabel === "string" && body.holidayLabel.trim()
        ? body.holidayLabel.trim()
        : "Vacation";

    if (!DATE_RE.test(vacationStart) || !DATE_RE.test(vacationEnd) || vacationStart > vacationEnd) {
      return NextResponse.json(
        { error: "Valid vacationStart and vacationEnd (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

    const rawAllocations: AllocationCommitInput[] = Array.isArray(body?.allocations)
      ? body.allocations
      : [];
    const rawOvertimeOverrides: OvertimeOverrideCommitInput[] = Array.isArray(
      body?.overtimeOverrides
    )
      ? body.overtimeOverrides
      : [];
    const rawPublishShifts: PublishShiftCommitInput[] = Array.isArray(body?.publishShifts)
      ? body.publishShifts
      : [];

    const ownedZones = await prisma.scheduleZone.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedZoneIds = new Set(ownedZones.map((z) => z.id));

    const validAllocations = rawAllocations.filter(
      (a) =>
        typeof a?.sourceType === "string" &&
        typeof a?.sourceId === "string" &&
        DATE_RE.test(a?.dateString || "") &&
        typeof a?.zoneId === "string" &&
        ownedZoneIds.has(a.zoneId) &&
        Number.isInteger(a?.startMinute) &&
        Number.isInteger(a?.endMinute) &&
        a.startMinute >= 0 &&
        a.endMinute <= 1440 &&
        a.startMinute < a.endMinute
    );

    const vacationDates = enumerateDates(vacationStart, vacationEnd);

    await prisma.$transaction(async (tx) => {
      // 1. Mark all vacation days as Holiday (0m capacity)
      for (const dateString of vacationDates) {
        await tx.calendarDateOverride.upsert({
          where: { userId_dateString: { userId, dateString } },
          create: {
            userId,
            dateString,
            isHoliday: true,
            holidayLabel,
            customSlotsJson: null,
          },
          update: {
            isHoliday: true,
            holidayLabel,
            customSlotsJson: null,
          },
        });
      }

      // 2. Apply any approved Model 4 overtime slot boosts (outside vacation window)
      const vacSet = new Set(vacationDates);
      for (const ov of rawOvertimeOverrides) {
        if (!DATE_RE.test(ov?.dateString || "") || vacSet.has(ov.dateString)) {
          continue;
        }
        const cleanSlots = (ov.customSlots || []).filter(
          (s) =>
            ownedZoneIds.has(s.zoneId) &&
            Number.isInteger(s.startMinute) &&
            Number.isInteger(s.endMinute) &&
            s.startMinute >= 0 &&
            s.endMinute <= 1440 &&
            s.startMinute < s.endMinute
        );
        if (cleanSlots.length === 0) continue;

        await tx.calendarDateOverride.upsert({
          where: { userId_dateString: { userId, dateString: ov.dateString } },
          create: {
            userId,
            dateString: ov.dateString,
            isHoliday: false,
            holidayLabel: ov.holidayLabel || "Vacation Prep Boost",
            customSlotsJson: JSON.stringify(cleanSlots),
          },
          update: {
            isHoliday: false,
            holidayLabel: ov.holidayLabel || "Vacation Prep Boost",
            customSlotsJson: JSON.stringify(cleanSlots),
          },
        });
      }

      // 3. Remove unpinned or old vacation placements for the committed tasks + clear vacation dates
      await tx.scheduledAllocation.deleteMany({
        where: {
          userId,
          dateString: { gte: vacationStart, lte: vacationEnd },
        },
      });

      const sourceIds = Array.from(new Set(validAllocations.map((a) => a.sourceId)));
      if (sourceIds.length > 0) {
        await tx.scheduledAllocation.deleteMany({
          where: {
            userId,
            sourceId: { in: sourceIds },
            OR: [{ isPinned: false }, { isVacationPreScheduled: true }],
          },
        });
      }

      // 4. Commit chosen model's allocations as pinned + vacation pre-scheduled
      if (validAllocations.length > 0) {
        await tx.scheduledAllocation.createMany({
          data: validAllocations.map((a) => ({
            userId,
            sourceType: a.sourceType,
            sourceId: a.sourceId,
            dateString: a.dateString,
            startMinute: a.startMinute,
            endMinute: a.endMinute,
            setupMinsUsed: Math.max(0, Math.round(a.setupMinsUsed || 0)),
            zoneId: a.zoneId,
            isPinned: true,
            isVacationPreScheduled: true,
            originalTargetDate:
              a.originalTargetDate && DATE_RE.test(a.originalTargetDate)
                ? a.originalTargetDate
                : null,
          })),
        });
      }

      // 5. Optional (Creator-only): shift approved Open Slot placeholder publish dates
      if (resolved.isCreator && rawPublishShifts.length > 0) {
        for (const shift of rawPublishShifts) {
          if (
            !shift?.contentItemId ||
            !DATE_RE.test(shift?.suggestedPublishDate || "")
          ) {
            continue;
          }
          const item = await tx.contentItem.findUnique({
            where: { id: shift.contentItemId },
            include: {
              content_type: {
                include: { workflow_tasks: { orderBy: { sequence_order: "asc" } } },
              },
              task_instances: true,
            },
          });
          if (!item || !item.content_type || (item.title?.trim() && item.unique_content_id?.trim())) {
            continue; // Safety guard: only shift unstarted placeholder slots automatically
          }

          const newPubDate = new Date(`${shift.suggestedPublishDate}T09:00:00.000Z`);
          await tx.contentItem.update({
            where: { id: item.id },
            data: {
              publish_date: newPubDate,
              is_manual_publish_date: true,
            },
          });

          const defs: WorkflowTaskDefinition[] = item.content_type.workflow_tasks.map(
            (wt) => ({
              id: wt.id,
              task_name: wt.task_name,
              sequence_order: wt.sequence_order,
              n_days_offset: wt.n_days_offset,
              team_buffer_days: wt.team_buffer_days,
              team_final_buffer_days: wt.team_final_buffer_days,
              is_hidden: wt.is_hidden,
              color: wt.color,
            })
          );
          const calcMap = calculateTaskTargetDates(newPubDate, defs);
          for (const ti of item.task_instances) {
            const calc = calcMap.get(ti.task_name.toLowerCase());
            if (calc) {
              await tx.taskInstance.update({
                where: { id: ti.id },
                data: {
                  target_date_worst_case: calc.target_date_worst_case,
                  target_date_team: calc.target_date_team,
                },
              });
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      appliedHolidayDays: vacationDates.length,
      pinnedCount: validAllocations.length,
      overtimeOverridesApplied: rawOvertimeOverrides.length,
    });
  } catch (error) {
    console.error("Error applying vacation model:", error);
    return NextResponse.json(
      { error: "Failed to apply vacation pre-schedule" },
      { status: 500 }
    );
  }
}
