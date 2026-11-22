import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  normalizeResistance,
  parseEligibleZoneIds,
  resolveTargetScheduleUserId,
} from "@/lib/schedule-seed";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serializeTodo(todo: {
  id: string;
  userId: string;
  title: string;
  durationMins: number;
  setupBufferMins: number;
  resistance: string;
  isSplittable: boolean;
  minSplitChunkMins: number;
  eligibleZoneIds: string;
  targetDate: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    ...todo,
    eligibleZoneIds: parseEligibleZoneIds(todo.eligibleZoneIds),
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
    const status = searchParams.get("status");
    const targetDate = searchParams.get("targetDate");

    const todos = await prisma.personalTodo.findMany({
      where: {
        userId,
        ...(status === "pending" || status === "done" ? { status } : {}),
        ...(targetDate && DATE_RE.test(targetDate) ? { targetDate } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(todos.map(serializeTodo));
  } catch (error) {
    console.error("Error fetching personal todos:", error);
    return NextResponse.json(
      { error: "Failed to fetch personal todos" },
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

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const durationMins =
      body.durationMins !== undefined
        ? Math.max(5, Math.round(Number(body.durationMins) || 30))
        : 30;
    const setupBufferMins =
      body.setupBufferMins !== undefined
        ? Math.max(0, Math.round(Number(body.setupBufferMins) || 0))
        : 0;
    const isSplittable = Boolean(body.isSplittable);
    const minSplitChunkMins =
      body.minSplitChunkMins !== undefined
        ? Math.max(5, Math.round(Number(body.minSplitChunkMins) || 15))
        : 15;
    const resistance = normalizeResistance(body.resistance, "LOW");
    const eligibleZoneIds = parseEligibleZoneIds(body.eligibleZoneIds);
    const targetDate =
      typeof body.targetDate === "string" && DATE_RE.test(body.targetDate.trim())
        ? body.targetDate.trim()
        : null;
    const status = body.status === "done" ? "done" : "pending";

    const created = await prisma.personalTodo.create({
      data: {
        userId,
        title,
        durationMins,
        setupBufferMins,
        resistance,
        isSplittable,
        minSplitChunkMins,
        eligibleZoneIds: JSON.stringify(eligibleZoneIds),
        targetDate,
        status,
      },
    });

    return NextResponse.json(serializeTodo(created), { status: 201 });
  } catch (error) {
    console.error("Error creating personal todo:", error);
    return NextResponse.json(
      { error: "Failed to create personal todo" },
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
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Todo id is required" }, { status: 400 });
    }

    const existing = await prisma.personalTodo.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Personal todo not found" }, { status: 404 });
    }

    let nextTitle = existing.title;
    if (body.title !== undefined) {
      const trimmed = typeof body.title === "string" ? body.title.trim() : "";
      if (!trimmed) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      nextTitle = trimmed;
    }

    let nextTargetDate = existing.targetDate;
    if (body.targetDate !== undefined) {
      if (body.targetDate === null || body.targetDate === "") {
        nextTargetDate = null;
      } else if (typeof body.targetDate === "string" && DATE_RE.test(body.targetDate.trim())) {
        nextTargetDate = body.targetDate.trim();
      } else {
        return NextResponse.json(
          { error: "targetDate must be YYYY-MM-DD or null" },
          { status: 400 }
        );
      }
    }

    const nextStatus =
      body.status !== undefined
        ? body.status === "done"
          ? "done"
          : "pending"
        : existing.status;

    const updated = await prisma.personalTodo.update({
      where: { id },
      data: {
        title: nextTitle,
        durationMins:
          body.durationMins !== undefined
            ? Math.max(5, Math.round(Number(body.durationMins) || 30))
            : existing.durationMins,
        setupBufferMins:
          body.setupBufferMins !== undefined
            ? Math.max(0, Math.round(Number(body.setupBufferMins) || 0))
            : existing.setupBufferMins,
        resistance:
          body.resistance !== undefined
            ? normalizeResistance(body.resistance, "LOW")
            : existing.resistance,
        isSplittable:
          body.isSplittable !== undefined
            ? Boolean(body.isSplittable)
            : existing.isSplittable,
        minSplitChunkMins:
          body.minSplitChunkMins !== undefined
            ? Math.max(5, Math.round(Number(body.minSplitChunkMins) || 15))
            : existing.minSplitChunkMins,
        eligibleZoneIds:
          body.eligibleZoneIds !== undefined
            ? JSON.stringify(parseEligibleZoneIds(body.eligibleZoneIds))
            : existing.eligibleZoneIds,
        targetDate: nextTargetDate,
        status: nextStatus,
      },
    });

    return NextResponse.json(serializeTodo(updated));
  } catch (error) {
    console.error("Error updating personal todo:", error);
    return NextResponse.json(
      { error: "Failed to update personal todo" },
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
    let bodyTargetUserId: unknown = searchParams.get("targetUserId");

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id || null;
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

    const targetId = (id || "").trim();
    if (!targetId) {
      return NextResponse.json({ error: "Todo id is required" }, { status: 400 });
    }

    const existing = await prisma.personalTodo.findFirst({
      where: { id: targetId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Personal todo not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.scheduledAllocation.deleteMany({
        where: { userId, sourceType: "personal_todo", sourceId: targetId },
      }),
      prisma.personalTodo.delete({ where: { id: targetId } }),
    ]);

    return NextResponse.json({ success: true, deletedId: targetId });
  } catch (error) {
    console.error("Error deleting personal todo:", error);
    return NextResponse.json(
      { error: "Failed to delete personal todo" },
      { status: 500 }
    );
  }
}
