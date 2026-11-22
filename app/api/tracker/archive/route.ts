import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkArchiveEligibility } from "@/lib/task-engine";
import { getDynamicUserProfile, isCreatorEmail } from "@/lib/constants/users";
import { getRoleConfigForContentType } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = session.user.role === "creator" || isCreatorEmail(session.user.email);

  try {
    const body = await req.json();
    const { content_item_id, action = "archive" } = body;

    if (!content_item_id) {
      return NextResponse.json({ error: "content_item_id is required" }, { status: 400 });
    }

    const item = await prisma.contentItem.findUnique({
      where: { id: content_item_id },
      include: {
        content_type: {
          include: {
            workflow_tasks: {
              orderBy: { sequence_order: "asc" },
            },
            misc_tasks: true,
          },
        },
        task_instances: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    if (!isCreator) {
      const userProfile = await getDynamicUserProfile(session.user.email);
      const activeConfig = getRoleConfigForContentType(userProfile?.permissions, item.content_type_id);
      const canArchive =
        activeConfig.index?.archive === "edit" ||
        userProfile?.permissions?.effective_permissions?.includes("tracker:row:archive");

      if (!canArchive) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to archive or restore items." },
          { status: 403 }
        );
      }
    }

    if (action === "unarchive") {
      const updated = await prisma.contentItem.update({
        where: { id: content_item_id },
        data: { is_archived: false },
      });
      return NextResponse.json({ success: true, is_archived: false });
    }

    // Archiving validation:
    if (item.is_in_idea_bank || !item.content_type || !item.publish_date) {
      return NextResponse.json(
        { error: "Unscheduled Idea Bank items cannot be archived." },
        { status: 400 }
      );
    }

    // Build workflow task statuses
    const workflowTasks = item.content_type.workflow_tasks.map((wt) => ({
      id: wt.id,
      task_name: wt.task_name,
      sequence_order: wt.sequence_order,
      n_days_offset: wt.n_days_offset,
      team_buffer_days: wt.team_buffer_days,
      team_final_buffer_days: wt.team_final_buffer_days,
      is_hidden: wt.is_hidden,
    }));

    // Task statuses including automated Ideation check
    const currentStatuses = item.task_instances.map((t) => ({
      task_name: t.task_name,
      status: t.status,
    }));

    // If Ideation is not explicitly stored in task_instances, check if title exists
    const hasIdeation = currentStatuses.some((t) => t.task_name.toLowerCase() === "ideation");
    if (!hasIdeation && item.title) {
      currentStatuses.push({ task_name: "Ideation", status: "done" });
    }

    let miscStatuses: { task_name: string; is_done: boolean }[] = [];
    try {
      miscStatuses = JSON.parse(item.misc_tasks_status || "[]");
    } catch {
      miscStatuses = [];
    }

    const requiredMisc = item.content_type.misc_tasks.map((m) => ({
      task_name: m.task_name,
    }));

    const eligibility = checkArchiveEligibility(
      item.publish_date,
      workflowTasks,
      currentStatuses,
      miscStatuses,
      requiredMisc
    );

    if (!eligibility.isEligible) {
      return NextResponse.json(
        {
          error: "Item is not eligible for archive",
          missingRequirements: eligibility.missingRequirements,
          details: eligibility,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.contentItem.update({
      where: { id: content_item_id },
      data: { is_archived: true },
    });

    return NextResponse.json({
      success: true,
      is_archived: true,
    });
  } catch (error) {
    console.error("Error toggling archive status:", error);
    return NextResponse.json({ error: "Failed to update archive status" }, { status: 500 });
  }
}
