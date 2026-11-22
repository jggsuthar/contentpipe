import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calculateTaskTargetDates, WorkflowTaskDefinition } from "@/lib/task-engine";
import { getRoleConfigForContentType } from "@/lib/permissions";
import { ensureDefaultBrandAndBackfill } from "@/lib/brand-helpers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email.toLowerCase().trim();

  try {
    await ensureDefaultBrandAndBackfill();
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId") || "all";

    // 1. Fetch dynamic team member profile from database
    const dbRole = await prisma.role.findUnique({
      where: { email: userEmail },
    });

    if (!dbRole) {
      return NextResponse.json({ error: "Team member role not registered in database" }, { status: 403 });
    }

    let assignedContentTypes: string[] = [];
    try {
      assignedContentTypes = JSON.parse(dbRole.assigned_content_types || "[]");
    } catch {
      assignedContentTypes = [];
    }

    let permissions: any = {};
    try {
      permissions = JSON.parse(dbRole.permissions || "{}");
    } catch {
      permissions = {};
    }

    const roleTitle = dbRole.role_title || "Specialist";
    const resp = permissions.responsibilities || {};

    const hasScripting = Boolean(
      resp.scripting?.enabled !== undefined
        ? resp.scripting.enabled
        : (permissions.submission_tasks &&
            permissions.submission_tasks.some((t: string) => t.toLowerCase().includes("script"))) ||
          roleTitle.toLowerCase().includes("script")
    );

    const hasContentSub = Boolean(
      resp.content_submission?.enabled !== undefined
        ? resp.content_submission.enabled
        : permissions.can_submit ||
          (permissions.submission_tasks &&
            permissions.submission_tasks.some((t: string) => !t.toLowerCase().includes("script"))) ||
          roleTitle.toLowerCase().includes("edit")
    );

    const scriptTargetTask = resp.scripting?.target_task_name || "Script";
    const contentSubTargetTask = resp.content_submission?.target_task_name || "Edit";

    // Fetch accessible brands for this team member
    const allAccessibleSeries = await prisma.contentType.findMany({
      where: assignedContentTypes.length > 0 ? { id: { in: assignedContentTypes } } : {},
      select: {
        brand: { select: { id: true, name: true, color: true, is_default: true } },
      },
    });
    const brandMap = new Map<string, { id: string; name: string; color: string | null; is_default: boolean }>();
    for (const s of allAccessibleSeries) {
      if (s.brand) brandMap.set(s.brand.id, s.brand);
    }
    const brands = Array.from(brandMap.values()).sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // 2. Query all active content items for assigned Content Series (filtered by Brand if requested)
    let contentTypesWhere: any = {};
    if (assignedContentTypes.length > 0) {
      contentTypesWhere.id = { in: assignedContentTypes };
    }
    if (brandId !== "all") {
      contentTypesWhere.brand_id = brandId;
    }

    const contentTypes = await prisma.contentType.findMany({
      where: contentTypesWhere,
      include: {
        brand: { select: { id: true, name: true, color: true } },
        workflow_tasks: { orderBy: { sequence_order: "asc" } },
        content_items: {
          where: { is_archived: false, is_in_idea_bank: false },
          include: {
            task_instances: true,
            submissions: {
              include: {
                comments: true,
              },
              orderBy: { created_at: "desc" },
            },
            script: { select: { comments: true } },
          },
        },
      },
    });

    // =========================================================================
    // Section 1: "Changes Requested" (Immediate Action Required)
    // =========================================================================
    const changesRequested: any[] = [];
    const upNext: any[] = [];

    contentTypes.forEach((type) => {
      const typeConfig = getRoleConfigForContentType(permissions, type.id);
      const typeResp = typeConfig.responsibilities || {};
      const typeHasScripting = Boolean(
        typeResp.scripting?.enabled !== undefined
          ? typeResp.scripting.enabled
          : resp.scripting?.enabled
      );
      const typeHasContentSub = Boolean(
        typeResp.content_submission?.enabled !== undefined
          ? typeResp.content_submission.enabled
          : resp.content_submission?.enabled
      );
      const currentScriptTargetTask = typeResp.scripting?.target_task_name || scriptTargetTask;
      const currentContentSubTargetTask = typeResp.content_submission?.target_task_name || contentSubTargetTask;

      const workflowTaskDefs: WorkflowTaskDefinition[] = type.workflow_tasks.map((wt) => ({
        id: wt.id,
        task_name: wt.task_name,
        sequence_order: wt.sequence_order,
        n_days_offset: wt.n_days_offset,
        team_buffer_days: wt.team_buffer_days,
        team_final_buffer_days: wt.team_final_buffer_days,
        is_hidden: wt.is_hidden,
      }));

      const computeUrgency = (targetDate: Date) => {
        const now = new Date();
        const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const targetMs = Date.UTC(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate()
        );
        const diffDays = Math.round((targetMs - todayMs) / 86_400_000);
        if (diffDays < 0) {
          return { urgency: "delayed" as const, delayDays: Math.abs(diffDays), daysUntilDue: diffDays };
        }
        if (diffDays <= 7) {
          return { urgency: "near" as const, delayDays: 0, daysUntilDue: diffDays };
        }
        return { urgency: "on_track" as const, delayDays: 0, daysUntilDue: diffDays };
      };

      type.content_items.forEach((item) => {
        if (!item.publish_date || !item.title || !item.unique_content_id) return;
        const targetDatesMap = calculateTaskTargetDates(new Date(item.publish_date), workflowTaskDefs);
        const publishDateIso = new Date(item.publish_date).toISOString();

        // Responsibility A: Scripting
        if (typeHasScripting) {
          const taskName = currentScriptTargetTask;
          const taskDates = targetDatesMap.get(taskName.toLowerCase());
          const scriptInstance = item.task_instances.find(
            (ti) => ti.task_name.toLowerCase() === taskName.toLowerCase()
          );
          const status = scriptInstance?.status || "not_done";

          let hasScriptRevision = false;
          let latestFeedbackNote = "Revisions requested by Creator. Please review script comments.";
          let unresolvedCommentsCount = 0;

          if (item.script) {
            try {
              const scriptComments = JSON.parse(item.script.comments || "[]");
              unresolvedCommentsCount = scriptComments.filter((c: any) => !c.is_resolved).length;
              const lastRevision = scriptComments.find((c: any) => c.body?.includes("[Revision Request]") || !c.is_resolved);
              if (lastRevision) {
                hasScriptRevision = true;
                latestFeedbackNote = lastRevision.body;
              }
            } catch {
              // fallback
            }
          }
          if (status === "revision_needed") {
            hasScriptRevision = true;
          }

          // Per user specification:
          // Target date shown is 1st buffer initially; once person gets request for revision, next target date is final buffer!
          const targetDate = hasScriptRevision
            ? taskDates?.target_date_team_final || new Date(item.publish_date)
            : taskDates?.target_date_team_1st || new Date(item.publish_date);
          const timing = computeUrgency(targetDate);

          if (hasScriptRevision) {
            changesRequested.push({
              contentItemId: item.id,
              uniqueContentId: item.unique_content_id,
              title: item.title || "Untitled Video",
              contentTypeName: type.name,
              brandName: type.brand?.name || null,
              brandColor: type.brand?.color || null,
              taskName: "Scripting",
              targetTaskName: taskName,
              nextVersion: "Rev",
              latestFeedbackNote,
              unresolvedCommentsCount,
              publishDate: publishDateIso,
              teamDueDate: targetDate.toISOString(),
              ...timing,
              targetUrl: `/scripts/${item.unique_content_id || item.id}`,
            });
          } else if (status !== "done") {
            upNext.push({
              contentItemId: item.id,
              uniqueContentId: item.unique_content_id,
              title: item.title || "Untitled Video",
              contentTypeName: type.name,
              brandName: type.brand?.name || null,
              brandColor: type.brand?.color || null,
              taskName: "Scripting",
              targetTaskName: taskName,
              publishDate: publishDateIso,
              teamDueDate: targetDate.toISOString(),
              ...timing,
              targetUrl: `/scripts/${item.unique_content_id || item.id}`,
            });
          }
        }

        // Responsibility B: Content Submission
        if (typeHasContentSub) {
          const taskName = currentContentSubTargetTask;
          const taskDates = targetDatesMap.get(taskName.toLowerCase());
          const subInstance = item.task_instances.find(
            (ti) => ti.task_name.toLowerCase() === taskName.toLowerCase()
          );
          const status = subInstance?.status || "not_done";

          const taskSubs = item.submissions.filter(
            (s) => s.task_name.toLowerCase() === taskName.toLowerCase()
          );
          const latestSub = taskSubs[0];
          let hasContentRevision = latestSub?.status === "rejected" || status === "revision_needed";
          let latestFeedbackNote = "Revisions requested by Creator. Please review feedback.";
          let unresolvedCommentsCount = 0;

          if (latestSub) {
            unresolvedCommentsCount = latestSub.comments.filter((c: any) => !c.is_resolved).length;
            if (latestSub.comments.length > 0) {
              latestFeedbackNote = latestSub.comments[latestSub.comments.length - 1].body;
            }
          }

          // Target date: 1st buffer initially; final buffer on revision request!
          const targetDate = hasContentRevision
            ? taskDates?.target_date_team_final || new Date(item.publish_date)
            : taskDates?.target_date_team_1st || new Date(item.publish_date);
          const timing = computeUrgency(targetDate);

          const nextVersion = `V${taskSubs.length + 1}`;

          if (hasContentRevision) {
            changesRequested.push({
              contentItemId: item.id,
              uniqueContentId: item.unique_content_id,
              title: item.title || "Untitled Video",
              contentTypeName: type.name,
              brandName: type.brand?.name || null,
              brandColor: type.brand?.color || null,
              taskName: "Content Submission",
              targetTaskName: taskName,
              nextVersion,
              latestFeedbackNote,
              unresolvedCommentsCount,
              publishDate: publishDateIso,
              teamDueDate: targetDate.toISOString(),
              ...timing,
              targetUrl: `/content/${item.unique_content_id || item.id}`,
            });
          } else if (status !== "done" && latestSub?.status !== "approved") {
            upNext.push({
              contentItemId: item.id,
              uniqueContentId: item.unique_content_id,
              title: item.title || "Untitled Video",
              contentTypeName: type.name,
              brandName: type.brand?.name || null,
              brandColor: type.brand?.color || null,
              taskName: "Content Submission",
              targetTaskName: taskName,
              publishDate: publishDateIso,
              teamDueDate: targetDate.toISOString(),
              ...timing,
              targetUrl: `/content/${item.unique_content_id || item.id}`,
            });
          }
        }
      });
    });

    // Sort Up Next chronologically by teamDueDate ASC
    upNext.sort(
      (a, b) => new Date(a.teamDueDate).getTime() - new Date(b.teamDueDate).getTime()
    );

    // =========================================================================
    // Section 3 & 4: Personal Focus Reminder & Performance Tracker
    // =========================================================================
    // Query comments on this role's submissions
    const mySubmissions = await prisma.submission.findMany({
      where: {
        submitted_by_role_id: dbRole.id,
        ...(brandId !== "all"
          ? { content_item: { content_type: { brand_id: brandId } } }
          : {}),
      },
      include: { comments: true },
    });

    const categoryCounts: Record<string, number> = {};
    let totalMistakes = 0;

    mySubmissions.forEach((sub) => {
      sub.comments.forEach((comm) => {
        const cat = comm.category || "General";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        totalMistakes++;
      });
    });

    const sortedErrors = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    const top2 = sortedErrors.slice(0, 2);

    let focusReminderText = "Keep up the great quality! Double-check retention hook and pacing before submitting.";
    if (top2.length >= 2 && totalMistakes > 0) {
      const topPercentage = Math.round(((top2[0][1] + top2[1][1]) / totalMistakes) * 100);
      focusReminderText = `${topPercentage}% of your recent revision notes were related to ${top2[0][0]} and ${top2[1][0]}. Double-check these before submitting V1!`;
    } else if (top2.length === 1 && totalMistakes > 0) {
      const topPercentage = Math.round((top2[0][1] / totalMistakes) * 100);
      focusReminderText = `${topPercentage}% of your recent feedback was related to ${top2[0][0]}. Focus on refining this in your next cut!`;
    }

    // Performance calculations (actual data, no placeholder guesses):
    let approvedItemsCount = 0;
    let firstTryCount = 0;

    const subItemMap = new Map<string, typeof mySubmissions>();
    mySubmissions.forEach((s) => {
      const arr = subItemMap.get(s.content_item_id) || [];
      arr.push(s);
      subItemMap.set(s.content_item_id, arr);
    });

    subItemMap.forEach((subs) => {
      const hasApproved = subs.some((s) => s.status === "approved");
      if (hasApproved) {
        approvedItemsCount++;
        const v1 = subs.find((s) => s.version === "V1");
        const hadRejections = subs.some((s) => s.status === "rejected");
        if (v1 && v1.status === "approved" && !hadRejections) {
          firstTryCount++;
        }
      }
    });

    const firstTryRate =
      approvedItemsCount > 0 ? Math.round((firstTryCount / approvedItemsCount) * 100) : null;
    const delayedCount = [...changesRequested, ...upNext].filter(
      (i) => i.urgency === "delayed"
    ).length;

    return NextResponse.json({
      brands,
      activeBrandId: brandId,
      roleInfo: {
        name: dbRole.name,
        roleTitle,
        email: dbRole.email,
        assignedTask: hasScripting ? scriptTargetTask : contentSubTargetTask,
        assignedContentTypes,
      },
      changesRequested,
      upNext,
      focusReminder: {
        text: focusReminderText,
        topErrors: top2.map(([name, count]) => ({ name, count })),
      },
      performance: {
        delayedCount,
        approvedDeliverables: approvedItemsCount,
        firstTryRate,
        completedDeliverables: mySubmissions.length,
      },
    });
  } catch (error) {
    console.error("Error generating Team Dashboard data:", error);
    return NextResponse.json({ error: "Failed to generate team dashboard" }, { status: 500 });
  }
}
