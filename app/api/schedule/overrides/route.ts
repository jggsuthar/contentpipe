import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveTargetScheduleUserId } from "@/lib/schedule-seed";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CustomSlotInput {
  zoneId: string;
  startMinute: number;
  endMinute: number;
}

function parseCustomSlots(raw: unknown): CustomSlotInput[] | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;

  const valid: CustomSlotInput[] = [];
  for (const item of parsed) {
    const zoneId = typeof item?.zoneId === "string" ? item.zoneId.trim() : "";
    const startMinute = Number(item?.startMinute);
    const endMinute = Number(item?.endMinute);
    if (
      zoneId &&
      Number.isInteger(startMinute) &&
      Number.isInteger(endMinute) &&
      startMinute >= 0 &&
      endMinute <= 1440 &&
      startMinute < endMinute
    ) {
      valid.push({ zoneId, startMinute, endMinute });
    }
  }
  return valid;
}

function serializeOverride(ov: {
  id: string;
  userId: string;
  dateString: string;
  isHoliday: boolean;
  holidayLabel: string | null;
  customSlotsJson: string | null;
}) {
  return {
    ...ov,
    customSlots: parseCustomSlots(ov.customSlotsJson),
  };
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
    const dateString = searchParams.get("dateString");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = { userId };
    if (dateString && DATE_RE.test(dateString)) {
      where.dateString = dateString;
    } else if (startDate || endDate) {
      const range: Record<string, string> = {};
      if (startDate && DATE_RE.test(startDate)) range.gte = startDate;
      if (endDate && DATE_RE.test(endDate)) range.lte = endDate;
      if (Object.keys(range).length > 0) {
        where.dateString = range;
      }
    }

    const overrides = await prisma.calendarDateOverride.findMany({
      where,
      orderBy: { dateString: "asc" },
    });

    return NextResponse.json(overrides.map(serializeOverride));
  } catch (error) {
    console.error("Error fetching calendar overrides:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar overrides" },
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

    const rawDates: string[] = Array.isArray(body.dateStrings)
      ? body.dateStrings
      : body.dateString
      ? [body.dateString]
      : [];

    const validDates = Array.from(
      new Set(
        rawDates
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.trim())
          .filter((d) => DATE_RE.test(d))
      )
    );

    if (validDates.length === 0) {
      return NextResponse.json(
        { error: "Valid dateString (YYYY-MM-DD) or dateStrings array is required" },
        { status: 400 }
      );
    }

    const isHoliday = Boolean(body.isHoliday);
    const holidayLabel =
      typeof body.holidayLabel === "string" && body.holidayLabel.trim()
        ? body.holidayLabel.trim()
        : null;

    let customSlotsJson: string | null = null;
    if (body.customSlots !== undefined) {
      if (body.customSlots === null) {
        customSlotsJson = null;
      } else {
        const parsed = parseCustomSlots(body.customSlots);
        if (parsed === null) {
          return NextResponse.json(
            { error: "customSlots must be an array of { zoneId, startMinute, endMinute }" },
            { status: 400 }
          );
        }
        customSlotsJson = JSON.stringify(parsed);
      }
    } else if (body.customSlotsJson !== undefined) {
      if (body.customSlotsJson === null || body.customSlotsJson === "") {
        customSlotsJson = null;
      } else {
        const parsed = parseCustomSlots(body.customSlotsJson);
        if (parsed === null) {
          return NextResponse.json(
            { error: "customSlotsJson must be valid JSON array of { zoneId, startMinute, endMinute }" },
            { status: 400 }
          );
        }
        customSlotsJson = JSON.stringify(parsed);
      }
    }

    const upserted = await prisma.$transaction(
      validDates.map((dateString) =>
        prisma.calendarDateOverride.upsert({
          where: {
            userId_dateString: { userId, dateString },
          },
          create: {
            userId,
            dateString,
            isHoliday,
            holidayLabel,
            customSlotsJson,
          },
          update: {
            isHoliday,
            holidayLabel,
            customSlotsJson,
          },
        })
      )
    );

    if (Array.isArray(body.dateStrings)) {
      return NextResponse.json(upserted.map(serializeOverride), { status: 201 });
    }

    return NextResponse.json(serializeOverride(upserted[0]), { status: 201 });
  } catch (error) {
    console.error("Error saving calendar override:", error);
    return NextResponse.json(
      { error: "Failed to save calendar override" },
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
    let dateString = searchParams.get("dateString");
    let bodyTargetUserId: unknown = searchParams.get("targetUserId");

    if (!id && !dateString) {
      try {
        const body = await req.json();
        id = body?.id || null;
        dateString = body?.dateString || null;
        if (body?.targetUserId !== undefined) bodyTargetUserId = body.targetUserId;
      } catch {
        // No JSON body provided
      }
    }

    const resolved = resolveTargetScheduleUserId(session, bodyTargetUserId);
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }
    const userId = resolved.userId;

    if (id && id.trim()) {
      const existing = await prisma.calendarDateOverride.findFirst({
        where: { id: id.trim(), userId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Calendar override not found" }, { status: 404 });
      }
      await prisma.calendarDateOverride.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, deletedId: existing.id });
    }

    if (dateString && DATE_RE.test(dateString.trim())) {
      const existing = await prisma.calendarDateOverride.findUnique({
        where: {
          userId_dateString: { userId, dateString: dateString.trim() },
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Calendar override not found" }, { status: 404 });
      }
      await prisma.calendarDateOverride.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, deletedId: existing.id });
    }

    return NextResponse.json(
      { error: "id or dateString (YYYY-MM-DD) is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error deleting calendar override:", error);
    return NextResponse.json(
      { error: "Failed to delete calendar override" },
      { status: 500 }
    );
  }
}
