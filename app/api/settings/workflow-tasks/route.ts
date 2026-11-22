import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import {
  extractWorkflowTaskPwsData,
  serializeWorkflowTask,
} from "@/lib/schedule-seed";

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_workflows");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const {
      content_type_id,
      task_name,
      n_days_offset = 1,
      team_buffer_days = 0,
      team_final_buffer_days = 0,
      color,
    } = body;

    if (!content_type_id || !task_name || !task_name.trim()) {
      return NextResponse.json(
        { error: "content_type_id and task_name are required" },
        { status: 400 }
      );
    }

    const trimmedName = task_name.trim();

    // Check that it's not trying to duplicate Ideation or Publish
    if (trimmedName.toLowerCase() === "ideation" || trimmedName.toLowerCase() === "publish") {
      return NextResponse.json(
        { error: "Ideation and Publish are mandatory fixed endpoints and cannot be added again." },
        { status: 400 }
      );
    }

    // Fetch existing tasks ordered by sequence_order
    const tasks = await prisma.workflowTask.findMany({
      where: { content_type_id },
      orderBy: { sequence_order: "asc" },
    });

    // Find the Publish task (the last task)
    const publishTask = tasks.find((t) => t.task_name.toLowerCase() === "publish");
    const insertOrder = publishTask ? publishTask.sequence_order : tasks.length + 1;

    // Shift Publish (and any subsequent) forward
    if (publishTask) {
      await prisma.workflowTask.updateMany({
        where: {
          content_type_id,
          sequence_order: { gte: insertOrder },
        },
        data: {
          sequence_order: { increment: 1 },
        },
      });
    }

    // Create the new task right before Publish
    const pwsData = extractWorkflowTaskPwsData(body, false);
    const created = await prisma.workflowTask.create({
      data: {
        content_type_id,
        task_name: trimmedName,
        sequence_order: insertOrder,
        n_days_offset: Number(n_days_offset) || 1,
        team_buffer_days: Number(team_buffer_days) || 0,
        team_final_buffer_days: Number(team_final_buffer_days) || 0,
        is_hidden: false,
        color: color || null,
        update_mode: body.update_mode || "manual",
        automation_trigger: body.update_mode === "automatic" ? (body.automation_trigger || "script_studio") : null,
        automation_role_id: body.update_mode === "automatic" && body.automation_trigger === "content_submission"
          ? (body.automation_role_id || null)
          : null,
        require_closure_link: Boolean(body.require_closure_link),
        ...pwsData,
      },
    });

    return NextResponse.json(serializeWorkflowTask(created));
  } catch (error) {
    console.error("Error creating workflow task:", error);
    return NextResponse.json(
      { error: "Failed to create workflow task" },
      { status: 500 }
    );
  }
}

// Update sequence orders or bulk update entire workflow pipeline
export async function PUT(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_workflows");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const { content_type_id, task_ids, tasks } = body as {
      content_type_id: string;
      task_ids?: string[];
      tasks?: Array<{
        id: string;
        task_name?: string;
        sequence_order?: number;
        n_days_offset?: number;
        team_buffer_days?: number;
        team_final_buffer_days?: number;
        is_hidden?: boolean;
        color?: string | null;
        durationMins?: number;
        setupBufferMins?: number;
        isSplittable?: boolean;
        minSplitChunkMins?: number;
        resistance?: string;
        eligibleZoneIds?: string[] | string;
      }>;
    };

    if (!content_type_id) {
      return NextResponse.json(
        { error: "content_type_id is required" },
        { status: 400 }
      );
    }

    // 1. Bulk Update Pipeline Tasks
    if (tasks && Array.isArray(tasks)) {
      await prisma.$transaction(
        tasks.map((task, index) => {
          const isEndpoint =
            task.task_name?.toLowerCase() === "ideation" ||
            task.task_name?.toLowerCase() === "publish";
          const pwsUpdate = extractWorkflowTaskPwsData(task as Record<string, unknown>, true);

          return prisma.workflowTask.update({
            where: { id: task.id },
            data: {
              ...(isEndpoint ? {} : task.task_name ? { task_name: task.task_name.trim() } : {}),
              sequence_order: task.sequence_order !== undefined ? Number(task.sequence_order) : index + 1,
              n_days_offset: task.n_days_offset !== undefined ? Number(task.n_days_offset) : undefined,
              team_buffer_days: task.team_buffer_days !== undefined ? Number(task.team_buffer_days) : undefined,
              team_final_buffer_days: task.team_final_buffer_days !== undefined ? Number(task.team_final_buffer_days) : undefined,
              is_hidden: isEndpoint ? false : (task.is_hidden !== undefined ? Boolean(task.is_hidden) : undefined),
              color: task.color !== undefined ? task.color : undefined,
              update_mode: (task as any).update_mode !== undefined ? (task as any).update_mode : undefined,
              automation_trigger: (task as any).update_mode === "automatic"
                ? ((task as any).automation_trigger || "script_studio")
                : (task as any).update_mode === "manual"
                ? null
                : undefined,
              automation_role_id: (task as any).update_mode === "automatic" && (task as any).automation_trigger === "content_submission"
                ? ((task as any).automation_role_id || null)
                : null,
              require_closure_link: (task as any).require_closure_link !== undefined ? Boolean((task as any).require_closure_link) : undefined,
              ...pwsUpdate,
            },
          });
        })
      );

      const updatedTasks = await prisma.workflowTask.findMany({
        where: { content_type_id },
        orderBy: { sequence_order: "asc" },
      });

      return NextResponse.json(updatedTasks.map(serializeWorkflowTask));
    }

    // 2. Legacy Reorder with task_ids
    if (task_ids && Array.isArray(task_ids)) {
      await prisma.$transaction(
        task_ids.map((id, index) =>
          prisma.workflowTask.update({
            where: { id },
            data: { sequence_order: index + 1 },
          })
        )
      );

      const updatedTasks = await prisma.workflowTask.findMany({
        where: { content_type_id },
        orderBy: { sequence_order: "asc" },
      });

      return NextResponse.json(updatedTasks);
    }

    return NextResponse.json(
      { error: "Either 'tasks' or 'task_ids' array is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating workflow tasks:", error);
    return NextResponse.json(
      { error: "Failed to update workflow tasks" },
      { status: 500 }
    );
  }
}
