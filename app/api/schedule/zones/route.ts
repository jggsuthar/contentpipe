import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  DEFAULT_WORK_END_MINUTE,
  DEFAULT_WORK_START_MINUTE,
  OPEN_WORKDAY_ZONE_ID,
  buildNormalizedDayBounds,
  parseEligibleZoneIds,
  resolveTargetScheduleUserId,
} from "@/lib/schedule-seed";

async function getBoundsForDay(userId: string, dayOfWeek: number) {
  const row = await prisma.weeklyDayBounds.findUnique({
    where: { userId_dayOfWeek: { userId, dayOfWeek } },
  });
  return {
    workStartMinute: row?.workStartMinute ?? DEFAULT_WORK_START_MINUTE,
    workEndMinute: row?.workEndMinute ?? DEFAULT_WORK_END_MINUTE,
  };
}

async function getBoundsMapForUser(userId: string) {
  const rows = await prisma.weeklyDayBounds.findMany({ where: { userId } });
  const normalized = buildNormalizedDayBounds(rows, userId);
  return new Map(normalized.map((b) => [b.dayOfWeek, b]));
}

async function fetchZonesBundle(userId: string) {
  const [zones, slots, rawBounds] = await Promise.all([
    prisma.scheduleZone.findMany({
      where: { userId },
      orderBy: { orderIndex: "asc" },
      include: {
        weeklySlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
    }),
    prisma.weeklyZoneSlot.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      include: {
        zone: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    }),
    prisma.weeklyDayBounds.findMany({
      where: { userId },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);
  return {
    zones,
    slots,
    dayBounds: buildNormalizedDayBounds(rawBounds, userId),
  };
}

function isValidMinuteRange(startMinute: unknown, endMinute: unknown): boolean {
  return (
    typeof startMinute === "number" &&
    typeof endMinute === "number" &&
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 1440 &&
    startMinute < endMinute
  );
}

function isValidDayOfWeek(dayOfWeek: unknown): boolean {
  return (
    typeof dayOfWeek === "number" &&
    Number.isInteger(dayOfWeek) &&
    dayOfWeek >= 0 &&
    dayOfWeek <= 6
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const resolved = resolveTargetScheduleUserId(
      session,
      searchParams.get("targetUserId")
    );
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    // Optional inspection payload before deleting a zone
    const inspectDeleteId = searchParams.get("inspectDeleteId")?.trim();
    if (inspectDeleteId) {
      const zone = await prisma.scheduleZone.findFirst({
        where: { id: inspectDeleteId, userId },
      });
      if (!zone) {
        return NextResponse.json({ error: "Schedule zone not found" }, { status: 404 });
      }

      const [allWorkflowTasks, userTodos, slotCount, pinnedCount] = await Promise.all([
        prisma.workflowTask.findMany({
          orderBy: [{ sequence_order: "asc" }],
          include: {
            content_type: {
              select: {
                id: true,
                name: true,
                brand: { select: { id: true, name: true, color: true } },
              },
            },
          },
        }),
        prisma.personalTodo.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.weeklyZoneSlot.count({ where: { userId, zoneId: inspectDeleteId } }),
        prisma.scheduledAllocation.count({
          where: { userId, zoneId: inspectDeleteId, isPinned: true },
        }),
      ]);

      const workflowTasks = allWorkflowTasks
        .map((wt) => {
          const parsedIds = parseEligibleZoneIds(wt.eligibleZoneIds);
          if (!parsedIds.includes(inspectDeleteId)) return null;
          return {
            id: wt.id,
            taskName: wt.task_name,
            durationMins: wt.durationMins,
            seriesId: wt.content_type.id,
            seriesName: wt.content_type.name,
            brandName: wt.content_type.brand?.name || "Unbranded",
            brandColor: wt.content_type.brand?.color || null,
            currentEligibleZoneIds: parsedIds,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const personalTodos = userTodos
        .map((todo) => {
          const parsedIds = parseEligibleZoneIds(todo.eligibleZoneIds);
          if (!parsedIds.includes(inspectDeleteId)) return null;
          return {
            id: todo.id,
            title: todo.title,
            durationMins: todo.durationMins,
            targetDate: todo.targetDate,
            status: todo.status,
            currentEligibleZoneIds: parsedIds,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return NextResponse.json({
        zone,
        workflowTasks,
        personalTodos,
        slotCount,
        pinnedCount,
      });
    }

    const bundle = await fetchZonesBundle(userId);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Error fetching schedule zones:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule zones" },
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

    const isSlotPayload =
      body.type === "slot" ||
      (body.zoneId !== undefined &&
        body.dayOfWeek !== undefined &&
        body.startMinute !== undefined &&
        body.endMinute !== undefined &&
        !body.name);

    if (isSlotPayload) {
      const zoneId = typeof body.zoneId === "string" ? body.zoneId.trim() : "";
      const dayOfWeek = Number(body.dayOfWeek);
      const startMinute = Number(body.startMinute);
      const endMinute = Number(body.endMinute);

      if (!zoneId) {
        return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
      }
      if (!isValidDayOfWeek(dayOfWeek)) {
        return NextResponse.json(
          { error: "dayOfWeek must be an integer between 0 (MON) and 6 (SUN)" },
          { status: 400 }
        );
      }
      if (!isValidMinuteRange(startMinute, endMinute)) {
        return NextResponse.json(
          { error: "startMinute and endMinute must be valid integers within 0..1440 with startMinute < endMinute" },
          { status: 400 }
        );
      }

      const ownedZone = await prisma.scheduleZone.findFirst({
        where: { id: zoneId, userId },
      });
      if (!ownedZone) {
        return NextResponse.json({ error: "Schedule zone not found" }, { status: 404 });
      }

      const bounds = await getBoundsForDay(userId, dayOfWeek);
      if (startMinute < bounds.workStartMinute || endMinute > bounds.workEndMinute) {
        return NextResponse.json(
          {
            error: "Cannot place zone blocks inside the No-Work Zone (outside active working hours)",
          },
          { status: 400 }
        );
      }

      const slot = await prisma.weeklyZoneSlot.create({
        data: {
          userId,
          zoneId,
          dayOfWeek,
          startMinute,
          endMinute,
        },
        include: {
          zone: {
            select: { id: true, name: true, color: true, icon: true },
          },
        },
      });

      return NextResponse.json({ slot }, { status: 201 });
    }

    // Create a ScheduleZone
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Zone name is required" }, { status: 400 });
    }

    const color =
      typeof body.color === "string" && body.color.trim()
        ? body.color.trim()
        : "#6366f1";
    const icon =
      typeof body.icon === "string" && body.icon.trim()
        ? body.icon.trim()
        : "Briefcase";

    let orderIndex: number;
    if (typeof body.orderIndex === "number" && Number.isInteger(body.orderIndex)) {
      orderIndex = body.orderIndex;
    } else {
      const agg = await prisma.scheduleZone.aggregate({
        where: { userId },
        _max: { orderIndex: true },
      });
      orderIndex = (agg._max.orderIndex ?? -1) + 1;
    }

    const rawSlots = Array.isArray(body.slots) ? body.slots : [];
    const validSlots: {
      userId: string;
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
    }[] = [];

    for (const s of rawSlots) {
      const dayOfWeek = Number(s?.dayOfWeek);
      const startMinute = Number(s?.startMinute);
      const endMinute = Number(s?.endMinute);
      if (!isValidDayOfWeek(dayOfWeek) || !isValidMinuteRange(startMinute, endMinute)) {
        return NextResponse.json(
          { error: "Invalid weekly slot definition in slots array" },
          { status: 400 }
        );
      }
      validSlots.push({ userId, dayOfWeek, startMinute, endMinute });
    }

    const zone = await prisma.scheduleZone.create({
      data: {
        userId,
        name,
        color,
        icon,
        orderIndex,
        ...(validSlots.length > 0
          ? { weeklySlots: { create: validSlots } }
          : {}),
      },
      include: {
        weeklySlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return NextResponse.json({ zone }, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule zone or slot:", error);
    return NextResponse.json(
      { error: "Failed to create schedule zone or slot" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
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

    // 0. Update WeeklyDayBounds (single day or bulk days) and trim slots inside No-Work Zones
    if (body.type === "dayBounds" || body.type === "dayBoundsBulk") {
      const items: {
        dayOfWeek: number;
        workStartMinute: number;
        workEndMinute: number;
      }[] = [];

      const rawList =
        body.type === "dayBoundsBulk" && Array.isArray(body.dayBounds)
          ? body.dayBounds
          : [
              {
                dayOfWeek: body.dayOfWeek,
                workStartMinute: body.workStartMinute,
                workEndMinute: body.workEndMinute,
              },
            ];

      for (const item of rawList) {
        const d = Number(item?.dayOfWeek);
        const ws = Number(item?.workStartMinute);
        const we = Number(item?.workEndMinute);
        if (
          !isValidDayOfWeek(d) ||
          !Number.isInteger(ws) ||
          !Number.isInteger(we) ||
          ws < 0 ||
          we > 1440 ||
          we - ws < 15
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid dayBounds: require 0 <= workStartMinute < workEndMinute <= 1440 and at least 15m active window",
            },
            { status: 400 }
          );
        }
        items.push({ dayOfWeek: d, workStartMinute: ws, workEndMinute: we });
      }

      await prisma.$transaction(async (tx) => {
        for (const item of items) {
          await tx.weeklyDayBounds.upsert({
            where: {
              userId_dayOfWeek: { userId, dayOfWeek: item.dayOfWeek },
            },
            create: {
              userId,
              dayOfWeek: item.dayOfWeek,
              workStartMinute: item.workStartMinute,
              workEndMinute: item.workEndMinute,
            },
            update: {
              workStartMinute: item.workStartMinute,
              workEndMinute: item.workEndMinute,
            },
          });

          const existingDaySlots = await tx.weeklyZoneSlot.findMany({
            where: { userId, dayOfWeek: item.dayOfWeek },
          });

          for (const slot of existingDaySlots) {
            const clippedStart = Math.max(slot.startMinute, item.workStartMinute);
            const clippedEnd = Math.min(slot.endMinute, item.workEndMinute);
            if (clippedEnd - clippedStart < 5) {
              await tx.weeklyZoneSlot.delete({ where: { id: slot.id } });
            } else if (
              clippedStart !== slot.startMinute ||
              clippedEnd !== slot.endMinute
            ) {
              await tx.weeklyZoneSlot.update({
                where: { id: slot.id },
                data: { startMinute: clippedStart, endMinute: clippedEnd },
              });
            }
          }
        }
      });

      const bundle = await fetchZonesBundle(userId);
      return NextResponse.json(bundle);
    }

    // 1. Bulk replace weekly slot template (entire week or single dayOfWeek)
    if (Array.isArray(body.slots)) {
      const [ownedZones, boundsMap] = await Promise.all([
        prisma.scheduleZone.findMany({
          where: { userId },
          select: { id: true },
        }),
        getBoundsMapForUser(userId),
      ]);
      const ownedZoneIds = new Set(ownedZones.map((z) => z.id));

      const targetDay =
        body.dayOfWeek !== undefined && body.dayOfWeek !== null
          ? Number(body.dayOfWeek)
          : null;
      if (targetDay !== null && !isValidDayOfWeek(targetDay)) {
        return NextResponse.json(
          { error: "dayOfWeek must be an integer between 0 and 6" },
          { status: 400 }
        );
      }

      const slotsToCreate: {
        userId: string;
        zoneId: string;
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
      }[] = [];

      for (const s of body.slots) {
        const zoneId = typeof s?.zoneId === "string" ? s.zoneId.trim() : "";
        const dayOfWeek = targetDay !== null ? targetDay : Number(s?.dayOfWeek);
        const startMinute = Number(s?.startMinute);
        const endMinute = Number(s?.endMinute);

        if (!ownedZoneIds.has(zoneId)) {
          return NextResponse.json(
            { error: `Invalid or unowned zoneId: '${zoneId}'` },
            { status: 400 }
          );
        }
        if (!isValidDayOfWeek(dayOfWeek) || !isValidMinuteRange(startMinute, endMinute)) {
          return NextResponse.json(
            { error: "Invalid dayOfWeek or minute range in slots" },
            { status: 400 }
          );
        }

        const bounds = boundsMap.get(dayOfWeek);
        const workStart = bounds?.workStartMinute ?? DEFAULT_WORK_START_MINUTE;
        const workEnd = bounds?.workEndMinute ?? DEFAULT_WORK_END_MINUTE;
        const clippedStart = Math.max(startMinute, workStart);
        const clippedEnd = Math.min(endMinute, workEnd);
        if (clippedEnd - clippedStart < 5) {
          continue;
        }

        slotsToCreate.push({
          userId,
          zoneId,
          dayOfWeek,
          startMinute: clippedStart,
          endMinute: clippedEnd,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.weeklyZoneSlot.deleteMany({
          where: {
            userId,
            ...(targetDay !== null ? { dayOfWeek: targetDay } : {}),
          },
        });
        if (slotsToCreate.length > 0) {
          await tx.weeklyZoneSlot.createMany({ data: slotsToCreate });
        }
      });

      const bundle = await fetchZonesBundle(userId);
      return NextResponse.json(bundle);
    }

    // 2. Reorder zones
    if (Array.isArray(body.zoneIds)) {
      const zoneIds = body.zoneIds.filter((id: unknown): id is string => typeof id === "string");
      const existing = await prisma.scheduleZone.findMany({
        where: { userId, id: { in: zoneIds } },
        select: { id: true },
      });
      if (existing.length !== zoneIds.length) {
        return NextResponse.json(
          { error: "One or more zones not found" },
          { status: 404 }
        );
      }

      await prisma.$transaction(
        zoneIds.map((id: string, index: number) =>
          prisma.scheduleZone.update({
            where: { id },
            data: { orderIndex: index },
          })
        )
      );

      const zones = await prisma.scheduleZone.findMany({
        where: { userId },
        orderBy: { orderIndex: "asc" },
        include: {
          weeklySlots: {
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
          },
        },
      });
      return NextResponse.json({ zones });
    }

    // 3. Update single WeeklyZoneSlot
    if (body.type === "slot" || body.slotId) {
      const targetSlotId = (body.slotId || body.id) as string;
      if (!targetSlotId) {
        return NextResponse.json({ error: "slotId is required" }, { status: 400 });
      }

      const existingSlot = await prisma.weeklyZoneSlot.findFirst({
        where: { id: targetSlotId, userId },
      });
      if (!existingSlot) {
        return NextResponse.json({ error: "Weekly slot not found" }, { status: 404 });
      }

      const nextZoneId =
        typeof body.zoneId === "string" && body.zoneId.trim()
          ? body.zoneId.trim()
          : existingSlot.zoneId;
      if (nextZoneId !== existingSlot.zoneId) {
        const ownedZone = await prisma.scheduleZone.findFirst({
          where: { id: nextZoneId, userId },
        });
        if (!ownedZone) {
          return NextResponse.json({ error: "Target zone not found" }, { status: 404 });
        }
      }

      const nextDay =
        body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : existingSlot.dayOfWeek;
      const nextStart =
        body.startMinute !== undefined ? Number(body.startMinute) : existingSlot.startMinute;
      const nextEnd =
        body.endMinute !== undefined ? Number(body.endMinute) : existingSlot.endMinute;

      if (!isValidDayOfWeek(nextDay) || !isValidMinuteRange(nextStart, nextEnd)) {
        return NextResponse.json(
          { error: "Invalid dayOfWeek or minute range" },
          { status: 400 }
        );
      }

      const bounds = await getBoundsForDay(userId, nextDay);
      if (nextStart < bounds.workStartMinute || nextEnd > bounds.workEndMinute) {
        return NextResponse.json(
          {
            error: "Cannot resize or move a zone slot inside the No-Work Zone",
          },
          { status: 400 }
        );
      }

      const slot = await prisma.weeklyZoneSlot.update({
        where: { id: targetSlotId },
        data: {
          zoneId: nextZoneId,
          dayOfWeek: nextDay,
          startMinute: nextStart,
          endMinute: nextEnd,
        },
        include: {
          zone: { select: { id: true, name: true, color: true, icon: true } },
        },
      });

      return NextResponse.json({ slot });
    }

    // 4. Update single ScheduleZone
    const zoneId = typeof body.id === "string" ? body.id.trim() : "";
    if (!zoneId) {
      return NextResponse.json(
        { error: "Zone id (or slots/zoneIds/slotId) is required" },
        { status: 400 }
      );
    }

    const existingZone = await prisma.scheduleZone.findFirst({
      where: { id: zoneId, userId },
    });
    if (!existingZone) {
      return NextResponse.json({ error: "Schedule zone not found" }, { status: 404 });
    }

    const nextName =
      body.name !== undefined
        ? typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : null
        : existingZone.name;
    if (!nextName) {
      return NextResponse.json({ error: "Zone name cannot be empty" }, { status: 400 });
    }

    const zone = await prisma.scheduleZone.update({
      where: { id: zoneId },
      data: {
        name: nextName,
        color:
          typeof body.color === "string" && body.color.trim()
            ? body.color.trim()
            : existingZone.color,
        icon:
          typeof body.icon === "string" && body.icon.trim()
            ? body.icon.trim()
            : existingZone.icon,
        orderIndex:
          body.orderIndex !== undefined && Number.isInteger(Number(body.orderIndex))
            ? Number(body.orderIndex)
            : existingZone.orderIndex,
      },
      include: {
        weeklySlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return NextResponse.json({ zone });
  } catch (error) {
    console.error("Error updating schedule zone or slot:", error);
    return NextResponse.json(
      { error: "Failed to update schedule zone or slot" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);

    let id = searchParams.get("id");
    let slotId = searchParams.get("slotId");
    let type = searchParams.get("type");
    let bodyTargetUserId: unknown = searchParams.get("targetUserId");
    let reassignmentMode: "any" | "specific" =
      searchParams.get("reassignmentMode") === "specific" ? "specific" : "any";
    let targetZoneIds: string[] = [];

    try {
      const body = await req.json();
      if (!id && body?.id) id = body.id;
      if (!slotId && body?.slotId) slotId = body.slotId;
      if (!type && body?.type) type = body.type;
      if (body?.targetUserId !== undefined) bodyTargetUserId = body.targetUserId;
      if (body?.reassignmentMode === "specific" || body?.reassignmentMode === "any") {
        reassignmentMode = body.reassignmentMode;
      }
      if (Array.isArray(body?.targetZoneIds)) {
        targetZoneIds = body.targetZoneIds.filter(
          (z: unknown): z is string => typeof z === "string" && z.trim().length > 0
        );
      }
    } catch {
      // No JSON body provided
    }

    const resolved = resolveTargetScheduleUserId(session, bodyTargetUserId);
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    if (type === "slot" || slotId) {
      const targetSlotId = (slotId || id || "").trim();
      if (!targetSlotId) {
        return NextResponse.json({ error: "slotId is required" }, { status: 400 });
      }
      const existingSlot = await prisma.weeklyZoneSlot.findFirst({
        where: { id: targetSlotId, userId },
      });
      if (!existingSlot) {
        return NextResponse.json({ error: "Weekly slot not found" }, { status: 404 });
      }
      await prisma.weeklyZoneSlot.delete({ where: { id: targetSlotId } });
      return NextResponse.json({ success: true, deletedId: targetSlotId, type: "slot" });
    }

    const targetZoneId = (id || "").trim();
    if (!targetZoneId) {
      return NextResponse.json({ error: "Zone id is required" }, { status: 400 });
    }

    const existingZone = await prisma.scheduleZone.findFirst({
      where: { id: targetZoneId, userId },
    });
    if (!existingZone) {
      return NextResponse.json({ error: "Schedule zone not found" }, { status: 404 });
    }

    const remainingZones = await prisma.scheduleZone.findMany({
      where: { userId, id: { not: targetZoneId } },
      select: { id: true },
    });
    const remainingZoneIdSet = new Set(remainingZones.map((z) => z.id));
    const validTargets = Array.from(
      new Set(targetZoneIds.filter((zid) => remainingZoneIdSet.has(zid)))
    );

    const [allWorkflowTasks, userTodos] = await Promise.all([
      prisma.workflowTask.findMany({
        select: { id: true, eligibleZoneIds: true },
      }),
      prisma.personalTodo.findMany({
        where: { userId },
        select: { id: true, eligibleZoneIds: true },
      }),
    ]);

    const affectedWorkflowTasks = allWorkflowTasks
      .map((wt) => ({
        id: wt.id,
        ids: parseEligibleZoneIds(wt.eligibleZoneIds),
      }))
      .filter((wt) => wt.ids.includes(targetZoneId));

    const affectedTodos = userTodos
      .map((td) => ({
        id: td.id,
        ids: parseEligibleZoneIds(td.eligibleZoneIds),
      }))
      .filter((td) => td.ids.includes(targetZoneId));

    if (
      reassignmentMode === "specific" &&
      (affectedWorkflowTasks.length > 0 || affectedTodos.length > 0) &&
      validTargets.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Select at least one replacement zone or choose 'Any' to reassign affected tasks before deletion.",
        },
        { status: 400 }
      );
    }

    const computeReassignedIds = (currentIds: string[]): string[] => {
      if (reassignmentMode === "any" || remainingZones.length === 0) {
        return [];
      }
      const withoutDeleted = currentIds.filter((zid) => zid !== targetZoneId);
      return Array.from(new Set([...withoutDeleted, ...validTargets]));
    };

    await prisma.$transaction(async (tx) => {
      for (const wt of affectedWorkflowTasks) {
        await tx.workflowTask.update({
          where: { id: wt.id },
          data: {
            eligibleZoneIds: JSON.stringify(computeReassignedIds(wt.ids)),
          },
        });
      }

      for (const td of affectedTodos) {
        await tx.personalTodo.update({
          where: { id: td.id },
          data: {
            eligibleZoneIds: JSON.stringify(computeReassignedIds(td.ids)),
          },
        });
      }

      // Clean up allocations referencing the deleted zone
      await tx.scheduledAllocation.deleteMany({
        where: { userId, zoneId: targetZoneId, isPinned: false },
      });

      if (reassignmentMode === "specific" && validTargets.length > 0) {
        await tx.scheduledAllocation.updateMany({
          where: { userId, zoneId: targetZoneId, isPinned: true },
          data: { zoneId: validTargets[0] },
        });
      } else if (remainingZones.length === 0) {
        await tx.scheduledAllocation.updateMany({
          where: { userId, zoneId: targetZoneId, isPinned: true },
          data: { zoneId: OPEN_WORKDAY_ZONE_ID },
        });
      } else {
        // Reassignment mode is 'any': unpin stale zone-specific locks so auto-solver places across remaining zones
        await tx.scheduledAllocation.deleteMany({
          where: { userId, zoneId: targetZoneId, isPinned: true },
        });
      }

      await tx.scheduleZone.delete({ where: { id: targetZoneId } });
    });

    return NextResponse.json({
      success: true,
      deletedId: targetZoneId,
      type: "zone",
      reassignedWorkflowTaskCount: affectedWorkflowTasks.length,
      reassignedTodoCount: affectedTodos.length,
    });
  } catch (error) {
    console.error("Error deleting schedule zone or slot:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule zone or slot" },
      { status: 500 }
    );
  }
}
