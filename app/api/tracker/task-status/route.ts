import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDynamicUserProfile } from "@/lib/constants/users";
import { validateSequentialDependency } from "@/lib/task-engine";
import { syncPublishTask } from "@/lib/task-automation";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      content_item_id,
      item_id,
      task_name,
      status, // "not_done" | "under_review" | "revision_needed" | "done"
    } = body;

    const targetItemId = content_item_id || item_id;

    if (!targetItemId || !task_name || !status) {
      return NextResponse.json(
        { error: "content_item_id (or item_id), task_name, and status are required" },
        { status: 400 }
      );
    }

    // RBAC: Atomic permission checks for task status updates
    const isCreator = session.user.role === "creator";
    const userProfile = await getDynamicUserProfile(session.user.email);
    const effectivePermissions: string[] = isCreator
      ? ["admin:super"]
      : userProfile?.permissions?.effective_permissions || [];

    // Backwards-compat: also derive submission tasks
    const userTasks: string[] = isCreator
      ? ["ALL"]
      : userProfile?.permissions?.submission_tasks && userProfile.permissions.submission_tasks.length > 0
      ? userProfile.permissions.submission_tasks
      : userProfile?.permissions?.submission_task
      ? [userProfile.permissions.submission_task]
      : [];

    if (task_name.toLowerCase() === "publish") {
      // Publish task requires tracker:task:status_any OR (tracker:task:status_own AND Publish in submission_tasks)
      const canChangePublish =
        isCreator ||
        effectivePermissions.includes("tracker:task:status_any") ||
        (effectivePermissions.includes("tracker:task:status_own") &&
          userTasks.some((t) => t.toLowerCase() === "publish"));
      if (!canChangePublish) {
        return NextResponse.json(
          { error: "Forbidden: requires 'tracker:task:status_any' or Publish submission responsibility." },
          { status: 403 }
        );
      }
    } else {
      // Other tasks require tracker:task:status_own or tracker:task:status_any
      const canUpdateStatus =
        isCreator ||
        effectivePermissions.includes("tracker:task:status_any") ||
        effectivePermissions.includes("tracker:task:status_own");
      if (!canUpdateStatus) {
        return NextResponse.json(
          { error: "Forbidden: requires 'tracker:task:status_own' permission." },
          { status: 403 }
        );
      }
    }

    const contentItem = await prisma.contentItem.findUnique({
      where: { id: targetItemId },
      include: {
        content_type: {
          include: {
            workflow_tasks: {
              orderBy: { sequence_order: "asc" },
            },
          },
        },
        task_instances: true,
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    if (!contentItem.content_type) {
      return NextResponse.json(
        { error: "Content item is not assigned to a Content Series yet." },
        { status: 400 }
      );
    }

    // Publish is a fixed automated node governed strictly by prior tasks and target date
    if (task_name.toLowerCase() === "publish") {
      return NextResponse.json(
        { error: "Publish status is automatically evaluated based on prior tasks and the publish target date." },
        { status: 400 }
      );
    }

    const workflowTasks = contentItem.content_type.workflow_tasks;
    const matchingDef = workflowTasks.find(
      (wt) => wt.task_name.toLowerCase() === task_name.toLowerCase()
    );

    // If task is automated, only Creator can manually override it
    if (matchingDef?.update_mode === "automatic" && !isCreator) {
      return NextResponse.json(
        { error: "This task is automated and its status can only be manually overridden by the Creator." },
        { status: 403 }
      );
    }

    // If closure link is enabled on this task and marking as done, enforce published URL
    if (matchingDef?.require_closure_link && status === "done") {
      const incomingUrl = body.published_url?.trim();
      const existingUrl = contentItem.published_url;

      if (!incomingUrl && !existingUrl) {
        return NextResponse.json(
          { error: `A valid published content link is required to complete '${task_name}'.` },
          { status: 400 }
        );
      }

      if (incomingUrl) {
        await prisma.contentItem.update({
          where: { id: targetItemId },
          data: { published_url: incomingUrl },
        });
      }
    } else if (body.published_url !== undefined && body.published_url?.trim()) {
      await prisma.contentItem.update({
        where: { id: targetItemId },
        data: { published_url: body.published_url.trim() },
      });
    }

    const currentStatuses = contentItem.task_instances.map((t) => ({
      task_name: t.task_name,
      status: t.status,
    }));

    // -------------------------------------------------------------
    // Strict Sequential Dependency Validation
    // -------------------------------------------------------------
    // Per SPEC.md Section 4.4 Rule 1:
    // A task cannot be marked Done unless the visible task immediately
    // before it is marked Done.
    if (status === "done") {
      const validation = validateSequentialDependency(
        task_name,
        workflowTasks,
        currentStatuses
      );

      if (!validation.allowed) {
        return NextResponse.json(
          {
            error: validation.reason,
            blockingTaskName: validation.blockingTaskName,
          },
          { status: 400 }
        );
      }
    }

    // Upsert or update task instance
    const existingInstance = contentItem.task_instances.find(
      (t) => t.task_name.toLowerCase() === task_name.toLowerCase()
    );

    const now = new Date();
    let updatedInstance;

    if (existingInstance) {
      updatedInstance = await prisma.taskInstance.update({
        where: { id: existingInstance.id },
        data: {
          status,
          completed_at: status === "done" ? now : null,
        },
      });
    } else {
      updatedInstance = await prisma.taskInstance.create({
        data: {
          content_item_id: targetItemId,
          task_name,
          status,
          completed_at: status === "done" ? now : null,
        },
      });
    }

    // Automatically check and synchronize the fixed Publish task
    await syncPublishTask(targetItemId);

    return NextResponse.json({
      success: true,
      task_instance: updatedInstance,
    });
  } catch (error) {
    console.error("Error updating task status:", error);
    return NextResponse.json({ error: "Failed to update task status" }, { status: 500 });
  }
}
