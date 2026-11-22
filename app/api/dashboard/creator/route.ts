import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { calculateTaskTargetDates, WorkflowTaskDefinition } from "@/lib/task-engine";
import { ensureDefaultBrandAndBackfill } from "@/lib/brand-helpers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email.toLowerCase().trim();
  const isCreator = isCreatorEmail(userEmail) || session.user.role === "creator";

  if (!isCreator) {
    return NextResponse.json({ error: "Forbidden: Creator Command Center is restricted to the Creator" }, { status: 403 });
  }

  try {
    await ensureDefaultBrandAndBackfill();

    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get("timeframe") || "all"; // "30d" | "all"
    const memberEmail = searchParams.get("member") || "all";
    const brandId = searchParams.get("brandId") || "all";

    const brands = await prisma.brand.findMany({
      orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
      select: { id: true, name: true, color: true, is_default: true },
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // =========================================================================
    // 1. "Needs Your Review" Inbox (Top Priority)
    // =========================================================================
    // Find all task instances currently 'under_review'
    const reviewTasks = await prisma.taskInstance.findMany({
      where: {
        status: "under_review",
        content_item: {
          is_in_idea_bank: false,
          ...(brandId !== "all" ? { content_type: { brand_id: brandId } } : {}),
        },
      },
      include: {
        content_item: {
          include: {
            content_type: {
              select: {
                id: true,
                name: true,
                prefix: true,
                brand_id: true,
                brand: { select: { id: true, name: true, color: true } },
              },
            },
            submissions: {
              where: { status: "pending" },
              orderBy: { created_at: "desc" },
              include: { submitted_by: { select: { name: true, role_title: true } } },
              take: 1,
            },
          },
        },
      },
    });

    const inbox = reviewTasks.map((t) => {
      const item = t.content_item;
      const latestSub = item.submissions[0];
      const isScript = t.task_name.toLowerCase() === "script";

      return {
        id: t.id,
        contentItemId: item.id,
        uniqueContentId: item.unique_content_id,
        title: item.title || "Untitled Project",
        contentTypeName: item.content_type?.name || "Idea Bank",
        brandName: item.content_type?.brand?.name || null,
        brandColor: item.content_type?.brand?.color || null,
        taskName: t.task_name,
        version: latestSub?.version || "V1",
        submitterName: latestSub?.submitted_by?.name || "Team Member",
        roleTitle: latestSub?.submitted_by?.role_title || "Specialist",
        submittedAt: latestSub?.created_at || t.content_item.created_at,
        targetUrl: isScript
          ? `/scripts/${item.unique_content_id || item.id}`
          : `/content/${item.unique_content_id || item.id}`,
      };
    });

    // =========================================================================
    // 2. Task Health & Production Velocity Matrix (Per Content Series)
    // =========================================================================
    const contentTypes = await prisma.contentType.findMany({
      where: brandId !== "all" ? { brand_id: brandId } : {},
      include: {
        brand: { select: { id: true, name: true, color: true } },
        workflow_tasks: { orderBy: { sequence_order: "asc" } },
        content_items: {
          where: { is_archived: false, is_in_idea_bank: false },
          include: { task_instances: true },
        },
      },
    });

    const pipelineHealth = contentTypes.map((type) => {
      const workflowTaskDefs: WorkflowTaskDefinition[] = type.workflow_tasks.map((wt) => ({
        id: wt.id,
        task_name: wt.task_name,
        sequence_order: wt.sequence_order,
        n_days_offset: wt.n_days_offset,
        team_buffer_days: wt.team_buffer_days,
        team_final_buffer_days: wt.team_final_buffer_days,
        is_hidden: wt.is_hidden,
      }));

      const visibleWorkflowTasks = type.workflow_tasks.filter((t) => !t.is_hidden);
      let totalCompletedTasks = 0;
      let totalTasksCount = 0;

      const tasksHealth = visibleWorkflowTasks.map((task) => {
        let completedCount = 0;
        let shouldBeDoneCount = 0;
        let hasRedDelay = false;
        let hasYellowBuffer = false;

        type.content_items.forEach((item) => {
          if (!item.publish_date) return;
          totalTasksCount++;
          const targetDatesMap = calculateTaskTargetDates(new Date(item.publish_date), workflowTaskDefs);
          const taskDates = targetDatesMap.get(task.task_name.toLowerCase());
          const worstCaseDate = taskDates ? taskDates.target_date_worst_case : new Date(item.publish_date);
          const teamDate = taskDates ? taskDates.target_date_team : worstCaseDate;

          const isIdeation = task.task_name.toLowerCase() === "ideation";
          const isDone = isIdeation
            ? Boolean(item.title && item.unique_content_id)
            : item.task_instances.find((ti) => ti.task_name.toLowerCase() === task.task_name.toLowerCase())?.status === "done";

          if (isDone) {
            completedCount++;
            totalCompletedTasks++;
          } else {
            // Task is not done
            if (today >= teamDate) {
              shouldBeDoneCount++;
            }
            if (today > worstCaseDate) {
              hasRedDelay = true;
            } else if (today >= teamDate) {
              hasYellowBuffer = true;
            }
          }
        });

        // Traffic Light per task:
        let lightStatus: "green" | "yellow" | "red" = "green";
        if (hasRedDelay) {
          lightStatus = "red";
        } else if (hasYellowBuffer) {
          lightStatus = "yellow";
        }

        return {
          id: task.id,
          taskName: task.task_name,
          completedCount,
          totalCount: type.content_items.length,
          lightStatus,
        };
      });

      const velocityPercentage =
        totalTasksCount > 0 ? Math.round((totalCompletedTasks / totalTasksCount) * 100) : 0;

      return {
        id: type.id,
        name: type.name,
        prefix: type.prefix,
        brandId: type.brand_id || null,
        brandName: type.brand?.name || null,
        brandColor: type.brand?.color || null,
        activeProjectsCount: type.content_items.length,
        velocityPercentage,
        tasksHealth,
      };
    });

    // =========================================================================
    // 3. Today & This Week's Focus (Creator Agenda)
    // =========================================================================
    const creatorRoles = ["Ideation", "Shoot", "Publish", "Schedule"];
    const overdue: any[] = [];
    const dueToday: any[] = [];
    const upcomingThisWeek: any[] = [];

    contentTypes.forEach((type) => {
      const workflowTaskDefs: WorkflowTaskDefinition[] = type.workflow_tasks.map((wt) => ({
        id: wt.id,
        task_name: wt.task_name,
        sequence_order: wt.sequence_order,
        n_days_offset: wt.n_days_offset,
        team_buffer_days: wt.team_buffer_days,
        team_final_buffer_days: wt.team_final_buffer_days,
        is_hidden: wt.is_hidden,
      }));

      type.content_items.forEach((item) => {
        if (!item.publish_date) return;
        const itemPublishDate = item.publish_date;
        const targetDatesMap = calculateTaskTargetDates(new Date(itemPublishDate), workflowTaskDefs);

        type.workflow_tasks.forEach((task) => {
          // Check if this task is typically Creator-owned or pending
          if (creatorRoles.some((r) => r.toLowerCase() === task.task_name.toLowerCase())) {
            const isIdeation = task.task_name.toLowerCase() === "ideation";
            const isDone = isIdeation
              ? Boolean(item.title && item.unique_content_id)
              : item.task_instances.find((ti) => ti.task_name.toLowerCase() === task.task_name.toLowerCase())?.status === "done";

            if (!isDone) {
              const taskDates = targetDatesMap.get(task.task_name.toLowerCase());
              const dueDate = taskDates ? new Date(taskDates.target_date_worst_case) : new Date(itemPublishDate);
              dueDate.setHours(0, 0, 0, 0);

              const agendaItem = {
                contentItemId: item.id,
                uniqueContentId: item.unique_content_id,
                title: item.title || "Open Slot",
                contentTypeName: type.name,
                brandName: type.brand?.name || null,
                brandColor: type.brand?.color || null,
                taskName: task.task_name,
                dueDate: dueDate.toISOString(),
                targetUrl: `/index?${type.brand_id ? `brand=${type.brand_id}&` : ""}type=${type.id}`,
              };

              if (dueDate.getTime() < today.getTime()) {
                overdue.push(agendaItem);
              } else if (dueDate.getTime() === today.getTime()) {
                dueToday.push(agendaItem);
              } else if (dueDate.getTime() <= sevenDaysFromNow.getTime()) {
                upcomingThisWeek.push(agendaItem);
              }
            }
          }
        });
      });
    });

    // =========================================================================
    // 4. Team Mistake & Rework Analytics (Quality Control)
    // =========================================================================
    // Query comments from video submissions
    let commentWhere: any = {};
    if (timeframe === "30d") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      commentWhere.created_at = { gte: thirtyDaysAgo };
    }
    if (memberEmail !== "all") {
      commentWhere.author_email = memberEmail;
    }
    if (brandId !== "all") {
      commentWhere.submission = { content_item: { content_type: { brand_id: brandId } } };
    }

    const comments = await prisma.comment.findMany({
      where: commentWhere,
      select: { category: true, severity: true, author_email: true, created_at: true },
    });

    // Count comments by mistake category
    const tagCountMap: Record<string, number> = {
      "Pacing / Dead Air": 0,
      "Audio / SFX": 0,
      "B-Roll / Visuals": 0,
      "Typography / Text": 0,
      "Retention Hook": 0,
      "Brand SOP Miss": 0,
    };

    comments.forEach((c) => {
      const cat = c.category || "General";
      if (tagCountMap[cat] !== undefined) {
        tagCountMap[cat]++;
      } else {
        tagCountMap[cat] = (tagCountMap[cat] || 0) + 1;
      }
    });

    const totalMistakeComments = comments.length;
    const mistakeBreakdown = Object.entries(tagCountMap).map(([tag, count]) => ({
      tag,
      count,
      percentage: totalMistakeComments > 0 ? Math.round((count / totalMistakeComments) * 100) : 0,
    }));
    // Sort descending (Pareto style)
    mistakeBreakdown.sort((a, b) => b.count - a.count);

    // Calculate First-Pass Acceptance Rate & Average Iterations
    const allSubmissions = await prisma.submission.findMany({
      where:
        brandId !== "all"
          ? { content_item: { content_type: { brand_id: brandId } } }
          : {},
      select: { content_item_id: true, version: true, status: true },
    });

    const submissionsByItem = new Map<string, typeof allSubmissions>();
    allSubmissions.forEach((s) => {
      const existing = submissionsByItem.get(s.content_item_id) || [];
      existing.push(s);
      submissionsByItem.set(s.content_item_id, existing);
    });

    let firstPassApprovedCount = 0;
    let totalItemsWithSubmissions = submissionsByItem.size;

    submissionsByItem.forEach((subs) => {
      // If approved and exactly 1 iteration (V1), or V1 was never rejected
      const hasV1Approved = subs.some((s) => s.version === "V1" && s.status === "approved");
      const hasRejections = subs.some((s) => s.status === "rejected");
      if (hasV1Approved && !hasRejections) {
        firstPassApprovedCount++;
      }
    });

    const firstPassRate =
      totalItemsWithSubmissions > 0
        ? Math.round((firstPassApprovedCount / totalItemsWithSubmissions) * 100)
        : 100;

    const avgIterations =
      totalItemsWithSubmissions > 0
        ? parseFloat((allSubmissions.length / totalItemsWithSubmissions).toFixed(1))
        : 1.0;

    // Distinct team members list for filter
    const teamRoles = await prisma.role.findMany({
      select: { email: true, name: true, role_title: true },
    });

    // =========================================================================
    // 5. Open Action Items & Remarks Widget (Across all videos, incl. archived)
    // =========================================================================
    const allContentItems = await prisma.contentItem.findMany({
      where: {
        is_in_idea_bank: false,
        ...(brandId !== "all" ? { content_type: { brand_id: brandId } } : {}),
      },
      select: {
        id: true,
        unique_content_id: true,
        title: true,
        is_archived: true,
        custom_action_items: true,
        content_type: {
          select: {
            name: true,
            brand: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });

    const openActionItems: any[] = [];
    const recentlyClosedActionItems: any[] = [];

    allContentItems.forEach((item) => {
      let parsedActions: any[] = [];
      try {
        parsedActions = JSON.parse(item.custom_action_items || "[]");
      } catch {
        parsedActions = [];
      }

      parsedActions.forEach((ai) => {
        const payload = {
          itemId: item.id,
          uniqueContentId: item.unique_content_id,
          title: item.title || "Untitled Video",
          contentTypeName: item.content_type?.name || "Unassigned",
          brandName: item.content_type?.brand?.name || null,
          brandColor: item.content_type?.brand?.color || null,
          isArchived: item.is_archived,
          actionItem: ai,
        };

        if (!ai.is_closed) {
          openActionItems.push(payload);
        } else {
          recentlyClosedActionItems.push(payload);
        }
      });
    });

    // Sort open action items newest first
    openActionItems.sort(
      (a, b) =>
        new Date(b.actionItem.created_at || 0).getTime() -
        new Date(a.actionItem.created_at || 0).getTime()
    );

    return NextResponse.json({
      brands,
      activeBrandId: brandId,
      inbox,
      pipelineHealth,
      creatorAgenda: {
        overdue,
        dueToday,
        upcomingThisWeek,
      },
      mistakeAnalytics: {
        breakdown: mistakeBreakdown,
        firstPassRate,
        avgIterations,
        totalMistakes: totalMistakeComments,
        teamMembers: teamRoles,
      },
      actionItems: {
        open: openActionItems,
        closed: recentlyClosedActionItems.slice(0, 20),
      },
    });
  } catch (error) {
    console.error("Error generating Creator Command Center data:", error);
    return NextResponse.json({ error: "Failed to generate dashboard" }, { status: 500 });
  }
}
