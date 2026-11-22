import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  OPEN_WORKDAY_ZONE_ID,
  resolveTargetScheduleUserId,
} from "@/lib/schedule-seed";
import { getDayOfWeekMon0 } from "@/lib/scheduler-engine";

async function validatePlacementPolicy(params: {
  userId: string;
  dateString: string;
  startMinute: number;
  endMinute: number;
  zoneId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { userId, dateString, startMinute, endMinute, zoneId } = params;
  const dayOfWeek = getDayOfWeekMon0(dateString);

  const [ownedZones, dayBoundsRow, override] = await Promise.all([
    prisma.scheduleZone.findMany({ where: { userId }, select: { id: true } }),
    prisma.weeklyDayBounds.findUnique({
      where: { userId_dayOfWeek: { userId, dayOfWeek } },
    }),
    prisma.calendarDateOverride.findUnique({
      where: { userId_dateString: { userId, dateString } },
    }),
  ]);

  if (override?.isHoliday) {
    return {
      ok: false,
      status: 400,
      error: "Cannot schedule tasks on a Holiday / Vacation day.",
    };
  }

  const workStart = dayBoundsRow?.workStartMinute ?? DEFAULT_WORK_START_MINUTE;
  const workEnd = dayBoundsRow?.workEndMinute ?? DEFAULT_WORK_END_MINUTE;
  if (startMinute < workStart || endMinute > workEnd) {
    return {
      ok: false,
      status: 400,
      error: "Cannot assign tasks inside a No-Work Zone (outside working hours).",
    };
  }

  if (ownedZones.length === 0) {
    if (zoneId !== OPEN_WORKDAY_ZONE_ID) {
      return {
        ok: false,
        status: 400,
        error: "Invalid zoneId for whole-day open schedule mode.",
      };
    }
    return { ok: true };
  }

  const ownedZoneIds = new Set(ownedZones.map((z) => z.id));
  if (!ownedZoneIds.has(zoneId)) {
    return { ok: false, status: 404, error: "Target zone not found" };
  }

  let candidateIntervals: { zoneId: string; startMinute: number; endMinute: number }[] = [];
  if (override?.customSlotsJson) {
    try {
      const parsed = JSON.parse(override.customSlotsJson);
      if (Array.isArray(parsed)) {
        candidateIntervals = parsed
          .map((s) => ({
            zoneId: typeof s?.zoneId === "string" ? s.zoneId : "",
            startMinute: Math.max(workStart, Number(s?.startMinute) || 0),
            endMinute: Math.min(workEnd, Number(s?.endMinute) || 0),
          }))
          .filter((s) => s.endMinute > s.startMinute);
      }
    } catch {
      candidateIntervals = [];
    }
  } else {
    const daySlots = await prisma.weeklyZoneSlot.findMany({
      where: { userId, dayOfWeek },
      select: { zoneId: true, startMinute: true, endMinute: true },
    });
    candidateIntervals = daySlots
      .map((s) => ({
        zoneId: s.zoneId,
        startMinute: Math.max(workStart, s.startMinute),
        endMinute: Math.min(workEnd, s.endMinute),
      }))
      .filter((s) => s.endMinute > s.startMinute);
  }

  const coveredByZone = candidateIntervals.some(
    (s) =>
      s.zoneId === zoneId &&
      startMinute >= s.startMinute &&
      endMinute <= s.endMinute
  );
  if (!coveredByZone) {
    return {
      ok: false,
      status: 400,
      error:
        "No zone is assigned to that time window. Tasks can only be placed inside painted zones.",
    };
  }

  return { ok: true };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SOURCE_TYPES = new Set([
  "workflow_task",
  "misc_task",
  "action_item",
  "personal_todo",
]);

function isValidMinuteRange(startMinute: unknown, endMinute: unknown): boolean {
  return (
    typeof startMinute === "number" &&
    typeof endMinute === "number" &&
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 1440 &&
    endMinute - startMinute >= 5
  );
}

/**
 * POST /api/schedule/allocations
 * Creates a pinned allocation (e.g., dragging an unplaced or queued task onto a day/time/zone),
 * or moves an existing allocation by ID and pins it.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json();
    const resolved = resolveTargetScheduleUserId(
      session,
      body.targetUserId ?? searchParams.get("targetUserId")
    );
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    const sourceType =
      typeof body.sourceType === "string" ? body.sourceType.trim() : "";
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const dateString =
      typeof body.dateString === "string" ? body.dateString.trim() : "";
    const zoneId = typeof body.zoneId === "string" ? body.zoneId.trim() : "";
    const startMinute = Number(body.startMinute);
    const endMinute = Number(body.endMinute);
    const setupMinsUsed =
      body.setupMinsUsed !== undefined
        ? Math.max(0, Math.round(Number(body.setupMinsUsed) || 0))
        : 0;
    const isPinned = body.isPinned !== undefined ? Boolean(body.isPinned) : true;
    const isVacationPreScheduled = Boolean(body.isVacationPreScheduled);
    const originalTargetDate =
      typeof body.originalTargetDate === "string" &&
      DATE_RE.test(body.originalTargetDate.trim())
        ? body.originalTargetDate.trim()
        : null;

    if (!VALID_SOURCE_TYPES.has(sourceType)) {
      return NextResponse.json({ error: "Invalid sourceType" }, { status: 400 });
    }
    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }
    if (!DATE_RE.test(dateString)) {
      return NextResponse.json(
        { error: "dateString must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (!isValidMinuteRange(startMinute, endMinute)) {
      return NextResponse.json(
        { error: "startMinute and endMinute must be valid integers within 0..1440" },
        { status: 400 }
      );
    }
    if (!zoneId) {
      return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
    }

    const policyCheck = await validatePlacementPolicy({
      userId,
      dateString,
      startMinute,
      endMinute,
      zoneId,
    });
    if (!policyCheck.ok) {
      return NextResponse.json(
        { error: policyCheck.error },
        { status: policyCheck.status }
      );
    }

    const replaceExistingId =
      typeof body.replaceAllocationId === "string" && body.replaceAllocationId.trim()
        ? body.replaceAllocationId.trim()
        : null;

    const allocation = await prisma.$transaction(async (tx) => {
      if (replaceExistingId) {
        const existing = await tx.scheduledAllocation.findFirst({
          where: { id: replaceExistingId, userId },
        });
        if (existing) {
          return tx.scheduledAllocation.update({
            where: { id: existing.id },
            data: {
              dateString,
              startMinute,
              endMinute,
              zoneId,
              setupMinsUsed,
              isPinned,
              isVacationPreScheduled,
              originalTargetDate:
                originalTargetDate ?? existing.originalTargetDate,
            },
          });
        }
      }

      // Remove any existing unpinned allocation for this exact source before pinning
      if (body.clearUnpinnedForSource !== false) {
        await tx.scheduledAllocation.deleteMany({
          where: {
            userId,
            sourceType,
            sourceId,
            isPinned: false,
          },
        });
      }

      return tx.scheduledAllocation.create({
        data: {
          userId,
          sourceType,
          sourceId,
          dateString,
          startMinute,
          endMinute,
          setupMinsUsed,
          zoneId,
          isPinned,
          isVacationPreScheduled,
          originalTargetDate,
        },
      });
    });

    return NextResponse.json({ allocation }, { status: 201 });
  } catch (error) {
    console.error("Error saving schedule allocation:", error);
    return NextResponse.json(
      { error: "Failed to save schedule allocation" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/schedule/allocations
 * Toggles `isPinned` or moves an existing allocation onto a new date/time/zone.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json();
    const resolved = resolveTargetScheduleUserId(
      session,
      body.targetUserId ?? searchParams.get("targetUserId")
    );
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Allocation id is required" }, { status: 400 });
    }

    const existing = await prisma.scheduledAllocation.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    }

    const nextDate =
      typeof body.dateString === "string" ? body.dateString.trim() : existing.dateString;
    if (!DATE_RE.test(nextDate)) {
      return NextResponse.json(
        { error: "dateString must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const nextStart =
      body.startMinute !== undefined ? Number(body.startMinute) : existing.startMinute;
    const nextEnd =
      body.endMinute !== undefined ? Number(body.endMinute) : existing.endMinute;
    if (!isValidMinuteRange(nextStart, nextEnd)) {
      return NextResponse.json(
        { error: "Invalid startMinute or endMinute" },
        { status: 400 }
      );
    }

    const nextZoneId =
      typeof body.zoneId === "string" && body.zoneId.trim()
        ? body.zoneId.trim()
        : existing.zoneId;

    const isMovingPlacement =
      nextDate !== existing.dateString ||
      nextStart !== existing.startMinute ||
      nextEnd !== existing.endMinute ||
      nextZoneId !== existing.zoneId;

    if (isMovingPlacement) {
      const policyCheck = await validatePlacementPolicy({
        userId,
        dateString: nextDate,
        startMinute: nextStart,
        endMinute: nextEnd,
        zoneId: nextZoneId,
      });
      if (!policyCheck.ok) {
        return NextResponse.json(
          { error: policyCheck.error },
          { status: policyCheck.status }
        );
      }
    }

    const nextPinned =
      body.isPinned !== undefined ? Boolean(body.isPinned) : existing.isPinned;
    const nextSetup =
      body.setupMinsUsed !== undefined
        ? Math.max(0, Math.round(Number(body.setupMinsUsed) || 0))
        : existing.setupMinsUsed;

    const allocation = await prisma.scheduledAllocation.update({
      where: { id: existing.id },
      data: {
        dateString: nextDate,
        startMinute: nextStart,
        endMinute: nextEnd,
        zoneId: nextZoneId,
        isPinned: nextPinned,
        setupMinsUsed: nextSetup,
      },
    });

    return NextResponse.json({ allocation });
  } catch (error) {
    console.error("Error updating schedule allocation:", error);
    return NextResponse.json(
      { error: "Failed to update schedule allocation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schedule/allocations
 * Removes a scheduled allocation by id (typically to unpin/clear a manual placement).
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");
    let bodyTargetUserId: unknown = searchParams.get("targetUserId");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id || null;
        if (body?.targetUserId !== undefined) bodyTargetUserId = body.targetUserId;
      } catch {
        // No body
      }
    }

    const resolved = resolveTargetScheduleUserId(session, bodyTargetUserId);
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    const targetId = (id || "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "Allocation id is required" }, { status: 400 });
    }

    const existing = await prisma.scheduledAllocation.findFirst({
      where: { id: targetId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    }

    await prisma.scheduledAllocation.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, deletedId: existing.id });
  } catch (error) {
    console.error("Error deleting schedule allocation:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule allocation" },
      { status: 500 }
    );
  }
}
