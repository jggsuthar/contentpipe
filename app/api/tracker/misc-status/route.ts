import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("tracker:misc_task:resolve");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const { content_item_id, item_id, task_name, is_done } = body;
    const targetItemId = content_item_id || item_id;

    if (!targetItemId || !task_name) {
      return NextResponse.json(
        { error: "content_item_id (or item_id) and task_name are required" },
        { status: 400 }
      );
    }

    const item = await prisma.contentItem.findUnique({
      where: { id: targetItemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    let miscStatuses: { task_name: string; is_done: boolean }[] = [];
    try {
      miscStatuses = JSON.parse(item.misc_tasks_status || "[]");
    } catch {
      miscStatuses = [];
    }

    const index = miscStatuses.findIndex(
      (m) => m.task_name.toLowerCase() === task_name.toLowerCase()
    );

    const targetDone = is_done !== undefined ? Boolean(is_done) : true;

    if (index >= 0) {
      miscStatuses[index].is_done = targetDone;
    } else {
      miscStatuses.push({ task_name, is_done: targetDone });
    }

    const updated = await prisma.contentItem.update({
      where: { id: targetItemId },
      data: {
        misc_tasks_status: JSON.stringify(miscStatuses),
      },
    });

    return NextResponse.json({
      success: true,
      misc_tasks_status: miscStatuses,
    });
  } catch (error) {
    console.error("Error updating misc task status:", error);
    return NextResponse.json({ error: "Failed to update misc status" }, { status: 500 });
  }
}
