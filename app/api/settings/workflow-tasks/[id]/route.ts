import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_workflows");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      task_name,
      n_days_offset,
      team_buffer_days,
      team_final_buffer_days,
      is_hidden,
      color,
    } = body;

    const existing = await prisma.workflowTask.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Protect renaming mandatory endpoints
    const isEndpoint =
      existing.task_name.toLowerCase() === "ideation" ||
      existing.task_name.toLowerCase() === "publish";

    const updated = await prisma.workflowTask.update({
      where: { id },
      data: {
        task_name: isEndpoint ? existing.task_name : (task_name?.trim() || existing.task_name),
        n_days_offset: n_days_offset !== undefined ? Number(n_days_offset) : undefined,
        team_buffer_days: team_buffer_days !== undefined ? Number(team_buffer_days) : undefined,
        team_final_buffer_days: team_final_buffer_days !== undefined ? Number(team_final_buffer_days) : undefined,
        is_hidden: isEndpoint ? false : (is_hidden !== undefined ? Boolean(is_hidden) : undefined),
        color: color !== undefined ? color : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating workflow task:", error);
    return NextResponse.json(
      { error: "Failed to update workflow task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_workflows");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const task = await prisma.workflowTask.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Hard protection: Ideation and Publish can NEVER be deleted
    if (task.task_name.toLowerCase() === "ideation" || task.task_name.toLowerCase() === "publish") {
      return NextResponse.json(
        { error: "Mandatory endpoints (Ideation & Publish) cannot be deleted." },
        { status: 400 }
      );
    }

    const { content_type_id, sequence_order } = task;

    // Delete task
    await prisma.workflowTask.delete({
      where: { id },
    });

    // Re-index remaining tasks
    await prisma.workflowTask.updateMany({
      where: {
        content_type_id,
        sequence_order: { gt: sequence_order },
      },
      data: {
        sequence_order: { decrement: 1 },
      },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Error deleting workflow task:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow task" },
      { status: 500 }
    );
  }
}
