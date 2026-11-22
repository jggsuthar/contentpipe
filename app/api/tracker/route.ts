import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDynamicUserProfile } from "@/lib/constants/users";
import { getRoleConfigForContentType } from "@/lib/permissions";
import { generateFuturePublishDates, checkDateCadenceMatch } from "@/lib/cadence";
import { ensureDefaultBrandAndBackfill } from "@/lib/brand-helpers";
import {
  calculateTaskTargetDates,
  checkArchiveEligibility,
  WorkflowTaskDefinition,
} from "@/lib/task-engine";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = session.user.role === "creator";

  try {
    await ensureDefaultBrandAndBackfill();

    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");
    const contentTypeId = searchParams.get("contentTypeId");
    const horizonParam = searchParams.get("horizonMonths");
    const viewParam = searchParams.get("view") || "active"; // "active" | "archive"

    // Fetch system default open horizon from CreatorSettings (default: 6 rolling months)
    const settings = await prisma.creatorSettings.findUnique({
      where: { id: "default" },
    });
    const systemDefaultMonths = settings?.default_months_open || 6;

    const horizonMonths = horizonParam ? parseInt(horizonParam, 10) : systemDefaultMonths;

    // 1. Fetch all Brands and Content Series
    const [allBrands, allContentTypes] = await Promise.all([
      prisma.brand.findMany({
        orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          color: true,
          is_default: true,
        },
      }),
      prisma.contentType.findMany({
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          name: true,
          prefix: true,
          brand_id: true,
          brand: {
            select: { id: true, name: true, color: true },
          },
        },
      }),
    ]);

    // Filter Content Series according to assigned permissions for team members
    const userProfile = await getDynamicUserProfile(session.user.email);
    let allowedContentTypes = allContentTypes;
    if (!isCreator) {
      const assigned = userProfile?.assignedContentTypes || [];
      if (!assigned.includes("ALL")) {
        allowedContentTypes = allContentTypes.filter((t) =>
          assigned.includes(t.id) || assigned.includes(t.name)
        );
      }
    }

    // Team members only see Brands that contain at least one Content Series they have access to
    const allowedBrandIds = new Set(
      allowedContentTypes.map((t) => t.brand_id).filter(Boolean) as string[]
    );
    const allowedBrands = isCreator
      ? allBrands
      : allBrands.filter((b) => allowedBrandIds.has(b.id));

    if (allowedContentTypes.length === 0) {
      const fallbackBrand =
        (brandId && allowedBrands.find((b) => b.id === brandId)) ||
        allowedBrands[0] ||
        null;
      return NextResponse.json({
        brands: allowedBrands,
        activeBrand: fallbackBrand,
        contentTypes: [],
        activeContentType: null,
        matrixRows: [],
        isCreator,
      });
    }

    // 2. Select active Brand and target Content Series from allowed sets
    let selectedBrand =
      (brandId && allowedBrands.find((b) => b.id === brandId)) || null;
    let targetTypeId: string | null = null;

    if (selectedBrand) {
      const brandSeries = allowedContentTypes.filter(
        (t) => t.brand_id === selectedBrand!.id
      );
      if (contentTypeId && brandSeries.some((t) => t.id === contentTypeId)) {
        targetTypeId = contentTypeId;
      } else {
        targetTypeId = brandSeries[0]?.id ?? null;
      }
    } else if (
      contentTypeId &&
      allowedContentTypes.some((t) => t.id === contentTypeId)
    ) {
      targetTypeId = contentTypeId;
      const matchedType = allowedContentTypes.find((t) => t.id === targetTypeId);
      selectedBrand =
        allowedBrands.find((b) => b.id === matchedType?.brand_id) ||
        allowedBrands[0] ||
        null;
    } else {
      selectedBrand =
        allowedBrands.find((b) =>
          allowedContentTypes.some((t) => t.brand_id === b.id)
        ) ||
        allowedBrands[0] ||
        null;
      const brandSeries = selectedBrand
        ? allowedContentTypes.filter((t) => t.brand_id === selectedBrand!.id)
        : allowedContentTypes;
      targetTypeId = brandSeries[0]?.id ?? allowedContentTypes[0]?.id ?? null;
    }

    if (!targetTypeId) {
      return NextResponse.json({
        brands: allowedBrands,
        activeBrand: selectedBrand,
        contentTypes: allowedContentTypes,
        activeContentType: null,
        matrixRows: [],
        isCreator,
      });
    }

    const activeContentType = await prisma.contentType.findUnique({
      where: { id: targetTypeId },
      include: {
        brand: {
          select: { id: true, name: true, color: true },
        },
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
        misc_tasks: true,
      },
    });

    if (!activeContentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    let parsedUploadDays: string[] = ["Tuesday"];
    try {
      parsedUploadDays = JSON.parse(activeContentType.upload_days || "[\"Tuesday\"]");
    } catch {
      parsedUploadDays = ["Tuesday"];
    }

    const workflowTaskDefs: WorkflowTaskDefinition[] = activeContentType.workflow_tasks.map((t) => ({
      id: t.id,
      task_name: t.task_name,
      sequence_order: t.sequence_order,
      n_days_offset: t.n_days_offset,
      team_buffer_days: t.team_buffer_days,
      team_final_buffer_days: t.team_final_buffer_days,
      is_hidden: t.is_hidden,
      color: t.color,
      update_mode: (t.update_mode as any) || "manual",
      automation_trigger: (t.automation_trigger as any) || null,
      automation_role_id: (t as any).automation_role_id || null,
      require_closure_link: Boolean(t.require_closure_link),
    }));

    // 3. Helper to format row data with calculated dates and archive eligibility
    const formatRowItem = (item: any) => {
      const pDate = new Date(item.publish_date);
      const targetDatesMap = calculateTaskTargetDates(pDate, workflowTaskDefs);

      // Map target dates to JSON-serializable record
      const taskTargetDates: Record<
        string,
        {
          worst_case: string;
          team: string;
          team_1st: string;
          team_final: string;
        }
      > = {};

      targetDatesMap.forEach((dates, key) => {
        taskTargetDates[key] = {
          worst_case: dates.target_date_worst_case.toISOString(),
          team: dates.target_date_team.toISOString(),
          team_1st: dates.target_date_team_1st.toISOString(),
          team_final: dates.target_date_team_final.toISOString(),
        };
      });

      // Prepare existing task instances with target dates
      const taskInstances = (item.task_instances || []).map((ti: any) => {
        const key = ti.task_name.toLowerCase();
        const dates = taskTargetDates[key];
        return {
          id: ti.id,
          task_name: ti.task_name,
          status: ti.status,
          target_date_worst_case: dates ? dates.worst_case : null,
          target_date_team: dates ? dates.team : null,
          target_date_team_1st: dates ? dates.team_1st : null,
          target_date_team_final: dates ? dates.team_final : null,
        };
      });

      // Automatic evaluation of fixed 'Publish' task status:
      // a. All previous visible tasks are done
      // b. Target publish date has passed (Today >= Publish Date at day resolution)
      const visibleTasks = workflowTaskDefs.filter((t) => !t.is_hidden);
      const publishTaskDef = visibleTasks.find((t) => t.task_name.toLowerCase() === "publish");
      let isPublishDone = false;

      if (publishTaskDef) {
        const publishIdx = visibleTasks.findIndex((t) => t.id === publishTaskDef.id);
        const priorTasks = visibleTasks.slice(0, publishIdx);

        let allPriorDone = true;
        for (const prior of priorTasks) {
          const priorKey = prior.task_name.toLowerCase();
          if (priorKey === "ideation") {
            if (!item.title || !item.unique_content_id) {
              allPriorDone = false;
              break;
            }
          } else {
            const inst = taskInstances.find((ti: any) => ti.task_name.toLowerCase() === priorKey);
            if (inst?.status !== "done") {
              allPriorDone = false;
              break;
            }
          }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const itemPubDate = new Date(item.publish_date);
        itemPubDate.setHours(0, 0, 0, 0);
        const pubDatePassed = today.getTime() >= itemPubDate.getTime();

        isPublishDone = allPriorDone && pubDatePassed;

        // Ensure taskInstances has Publish updated with this automated status
        const pubInstanceIdx = taskInstances.findIndex(
          (ti: any) => ti.task_name.toLowerCase() === "publish"
        );
        if (pubInstanceIdx >= 0) {
          taskInstances[pubInstanceIdx].status = isPublishDone ? "done" : "not_done";
        } else {
          taskInstances.push({
            id: `pub_${item.id}`,
            task_name: publishTaskDef.task_name,
            status: isPublishDone ? "done" : "not_done",
            target_date_worst_case: taskTargetDates["publish"]?.worst_case || null,
            target_date_team: taskTargetDates["publish"]?.team || null,
            target_date_team_1st: taskTargetDates["publish"]?.team_1st || null,
            target_date_team_final: taskTargetDates["publish"]?.team_final || null,
          });
        }
      }

      // Parse misc_tasks_status
      let miscStatuses: { task_name: string; is_done: boolean }[] = [];
      try {
        miscStatuses = JSON.parse(item.misc_tasks_status || "[]");
      } catch {
        miscStatuses = [];
      }

      // Check archive eligibility
      const currentStatuses = taskInstances.map((t: any) => ({
        task_name: t.task_name,
        status: t.status,
      }));
      if (item.title && !currentStatuses.some((t: any) => t.task_name.toLowerCase() === "ideation")) {
        currentStatuses.push({ task_name: "Ideation", status: "done" });
      }

      const eligibility = checkArchiveEligibility(
        item.publish_date,
        workflowTaskDefs,
        currentStatuses,
        miscStatuses,
        activeContentType.misc_tasks
      );

      const cadenceMatch = checkDateCadenceMatch(item.publish_date, {
        cadence_type: activeContentType.cadence_type as any,
        cadence_start_date: activeContentType.cadence_start_date,
        upload_days: parsedUploadDays,
      });

      return {
        id: item.id,
        is_placeholder: !item.title,
        is_manual_publish_date: Boolean(item.is_manual_publish_date),
        cadence_match: cadenceMatch,
        unique_content_id: item.unique_content_id,
        title: item.title || "",
        ideation_date: item.ideation_date,
        publish_date: item.publish_date,
        is_archived: item.is_archived,
        remarks: item.remarks || "",
        published_url: item.published_url || null,
        custom_action_items: JSON.parse(item.custom_action_items || "[]"),
        task_instances: taskInstances,
        task_target_dates: taskTargetDates,
        misc_tasks_status: miscStatuses,
        is_archive_eligible: eligibility.isEligible,
        archive_missing_requirements: eligibility.missingRequirements,
        has_script: !!item.script,
        has_content: Boolean(
          (item.drive_folders && item.drive_folders !== "{}") ||
            (item.raw_assets && item.raw_assets !== "[]")
        ),
        is_published: isPublishDone,
        submission_count: item.submissions ? item.submissions.length : 0,
      };
    };

    // Structured Index Permissions for active content type
    const activeConfig = getRoleConfigForContentType(
      userProfile?.permissions,
      activeContentType.id
    );

    const archiveAccess = isCreator ? "edit" : (activeConfig.index?.archive || "none");
    const scriptStudioAccess = isCreator ? "edit" : (activeConfig.script_studio?.access || "none");

    const indexPermissions = isCreator
      ? {
          content_name: "edit",
          task_target_date: "view",
          archive: "edit",
          script_studio_access: "edit",
          tasks: {},
        }
      : {
          content_name: activeConfig.index?.content_name || (userProfile?.permissions?.can_edit ? "edit" : "view"),
          task_target_date: activeConfig.index?.task_target_date || "view",
          archive: archiveAccess,
          script_studio_access: scriptStudioAccess,
          tasks: activeConfig.index?.tasks || {},
        };

    // If viewing the Archive Vault:
    if (viewParam === "archive") {
      if (!isCreator && archiveAccess === "none") {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to access the Archive Vault." },
          { status: 403 }
        );
      }

      const archivedItems = await prisma.contentItem.findMany({
        where: {
          content_type_id: activeContentType.id,
          is_archived: true,
          is_in_idea_bank: false,
        },
        include: {
          task_instances: true,
          script: { select: { id: true } },
          submissions: { select: { id: true, version: true, status: true } },
        },
        orderBy: { publish_date: "desc" },
      });

      const matrixRows = archivedItems.map(formatRowItem);

      return NextResponse.json({
        brands: allowedBrands,
        activeBrand: selectedBrand,
        contentTypes: allowedContentTypes,
        activeContentType: {
          ...activeContentType,
          upload_days: JSON.parse(activeContentType.upload_days || "[\"Tuesday\"]"),
        },
        matrixRows,
        isCreator,
        canInputIdeation: false,
        canChangePublish: false,
        indexPermissions,
        currentView: "archive",
      });
    }

    // Otherwise: Active Pipeline View
    // 4. Generate future schedule dates based on cadence timetable
    const futureDates = generateFuturePublishDates(
      {
        cadence_type: activeContentType.cadence_type as any,
        cadence_start_date: activeContentType.cadence_start_date,
        upload_days: parsedUploadDays,
      },
      horizonMonths
    );

    let skippedDates: string[] = [];
    try {
      skippedDates = JSON.parse(activeContentType.skipped_publish_dates || "[]");
    } catch {
      skippedDates = [];
    }
    const filteredFutureDates = futureDates.filter(
      (d) => !skippedDates.includes(d.toISOString().split("T")[0])
    );

    // 5. Fetch existing active Content Items in database for this Content Type
    const existingActiveItems = await prisma.contentItem.findMany({
      where: {
        content_type_id: activeContentType.id,
        is_archived: false,
        is_in_idea_bank: false,
      },
      include: {
        task_instances: true,
        script: { select: { id: true } },
        submissions: { select: { id: true, version: true, status: true } },
      },
      orderBy: { publish_date: "asc" },
    });

    const itemsByDateKey = new Map<string, (typeof existingActiveItems[0])[]>();
    existingActiveItems.forEach((item) => {
      if (!item.publish_date) return;
      const dateKey = new Date(item.publish_date).toISOString().split("T")[0];
      const list = itemsByDateKey.get(dateKey) || [];
      list.push(item);
      itemsByDateKey.set(dateKey, list);
    });

    const matrixRows = [];

    // Combine schedule: for each scheduled future date, either pick existing items or create placeholder slot
    for (const pDate of filteredFutureDates) {
      const dateKey = pDate.toISOString().split("T")[0];
      const existingList = itemsByDateKey.get(dateKey);

      if (existingList && existingList.length > 0) {
        for (const existing of existingList) {
          matrixRows.push(formatRowItem(existing));
        }
        itemsByDateKey.delete(dateKey);
      } else {
        // Open empty placeholder slot
        const targetDatesMap = calculateTaskTargetDates(pDate, workflowTaskDefs);
        const taskTargetDates: Record<string, { worst_case: string; team: string; team_1st: string; team_final: string }> = {};
        targetDatesMap.forEach((dates, key) => {
          taskTargetDates[key] = {
            worst_case: dates.target_date_worst_case.toISOString(),
            team: dates.target_date_team.toISOString(),
            team_1st: dates.target_date_team_1st.toISOString(),
            team_final: dates.target_date_team_final.toISOString(),
          };
        });

        matrixRows.push({
          id: `placeholder_${dateKey}`,
          is_placeholder: true,
          is_manual_publish_date: false,
          cadence_match: {
            matches: true,
            reason: `Autogenerated from cadence timetable (${parsedUploadDays.join(", ")})`,
            expectedDaysStr: parsedUploadDays.join(", "),
          },
          unique_content_id: null,
          title: "",
          ideation_date: null,
          publish_date: pDate,
          is_archived: false,
          remarks: "",
          published_url: null,
          custom_action_items: [],
          task_instances: [],
          task_target_dates: taskTargetDates,
          misc_tasks_status: [],
          is_archive_eligible: false,
          archive_missing_requirements: ["Empty placeholder slot"],
          has_script: false,
          has_content: false,
          is_published: false,
          submission_count: 0,
        });
      }
    }

    // Also include any active items not within the generated future window (e.g. past active videos or multiple items on same date)
    for (const [, orphanList] of itemsByDateKey) {
      for (const orphanItem of orphanList) {
        matrixRows.push(formatRowItem(orphanItem));
      }
    }

    // Sort matrix rows chronologically by publish_date ASC
    matrixRows.sort((a, b) => new Date(a.publish_date).getTime() - new Date(b.publish_date).getTime());

    // Resolve dynamic RBAC permissions for the logged-in user (atomic permission system)
    const effectivePermissions: string[] = isCreator
      ? ["admin:super"]
      : userProfile?.permissions?.effective_permissions || [];

    // Backwards-compat: also derive submission tasks for frontend
    const userTasks: string[] = isCreator
      ? ["ALL"]
      : userProfile?.permissions?.submission_tasks && userProfile.permissions.submission_tasks.length > 0
      ? userProfile.permissions.submission_tasks
      : userProfile?.permissions?.submission_task
      ? [userProfile.permissions.submission_task]
      : [];



    const canInputIdeation =
      isCreator ||
      indexPermissions.content_name === "edit" ||
      effectivePermissions.includes("tracker:row:edit_title");

    const canChangePublish =
      isCreator ||
      ((indexPermissions.tasks as Record<string, string> | undefined)?.["publish"] === "edit") ||
      effectivePermissions.includes("tracker:task:status_any") ||
      (effectivePermissions.includes("tracker:task:status_own") &&
        userTasks.some((t) => t.toLowerCase() === "publish"));

    return NextResponse.json({
      brands: allowedBrands,
      activeBrand: selectedBrand,
      contentTypes: allowedContentTypes,
      activeContentType: {
        ...activeContentType,
        upload_days: parsedUploadDays,
      },
      matrixRows,
      isCreator,
      canInputIdeation,
      canChangePublish,
      indexPermissions,
      submissionTasks: userTasks,
      effectivePermissions,
      defaultMonthsOpen: systemDefaultMonths,
      horizonMonths,
      currentView: "active",
    });
  } catch (error) {
    console.error("Error fetching tracker data:", error);
    return NextResponse.json({ error: "Failed to load tracker matrix" }, { status: 500 });
  }
}
