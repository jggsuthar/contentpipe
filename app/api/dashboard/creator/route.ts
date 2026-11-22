import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  calculateTaskTargetDates,
  checkArchiveEligibility,
  WorkflowTaskDefinition,
} from "@/lib/task-engine";
import { generateFuturePublishDates } from "@/lib/cadence";
import { getBrandUrlSegment, getSeriesUrlSegment } from "@/lib/slug-utils";

const MS_PER_DAY = 86_400_000;

function toUtcDayMs(dateInput: Date | string): number {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toUtcDateKey(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "creator") {
      return NextResponse.json({ error: "Unauthorized: Creator access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get("timeframe") || "all";
    const memberFilter = searchParams.get("member") || "all";
    const brandId = searchParams.get("brandId") || "all";

    const now = new Date();
    const todayUtcMs = toUtcDayMs(now);
    const dateFilter =
      timeframe === "30d" ? new Date(Date.now() - 30 * MS_PER_DAY) : undefined;

    // Fetch all independent dashboard datasets in parallel instead of 6 sequential DB round-trips
    const [
      brands,
      contentTypes,
      allComments,
      allSubmissions,
      teamMembers,
      itemsWithActions,
    ] = await Promise.all([
      prisma.brand.findMany({
        orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
        select: { id: true, name: true, color: true, is_default: true },
      }),
      prisma.contentType.findMany({
        where: brandId !== "all" ? { brand_id: brandId } : undefined,
        select: {
          id: true,
          name: true,
          brand_id: true,
          cadence_type: true,
          cadence_start_date: true,
          upload_days: true,
          skipped_publish_dates: true,
          brand: { select: { id: true, name: true, color: true, slug: true } },
          workflow_tasks: {
            orderBy: { sequence_order: "asc" },
            select: {
              id: true,
              task_name: true,
              sequence_order: true,
              n_days_offset: true,
              team_buffer_days: true,
              team_final_buffer_days: true,
              is_hidden: true,
              color: true,
            },
          },
          misc_tasks: {
            select: { id: true, task_name: true },
          },
          content_items: {
            where: {
              is_in_idea_bank: false,
              publish_date: { not: null },
            },
            orderBy: { publish_date: "asc" },
            select: {
              id: true,
              unique_content_id: true,
              title: true,
              publish_date: true,
              is_archived: true,
              misc_tasks_status: true,
              created_at: true,
              task_instances: {
                select: { task_name: true, status: true },
              },
              submissions: {
                orderBy: { created_at: "desc" },
                select: {
                  task_name: true,
                  version: true,
                  created_at: true,
                  submitted_by: {
                    select: { name: true, role_title: true, email: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { created_at: "asc" },
      }),
      prisma.comment.findMany({
        where: {
          ...(dateFilter ? { created_at: { gte: dateFilter } } : {}),
          ...(brandId !== "all"
            ? { submission: { content_item: { content_type: { brand_id: brandId } } } }
            : {}),
        },
        select: {
          category: true,
          author_email: true,
          submission: {
            select: {
              submitted_by: { select: { email: true } },
            },
          },
        },
      }),
      prisma.submission.findMany({
        where: {
          ...(dateFilter ? { created_at: { gte: dateFilter } } : {}),
          ...(brandId !== "all"
            ? { content_item: { content_type: { brand_id: brandId } } }
            : {}),
        },
        select: {
          content_item_id: true,
          version: true,
          status: true,
          submitted_by: { select: { email: true } },
        },
      }),
      prisma.role.findMany({
        select: { email: true, name: true, role_title: true },
      }),
      prisma.contentItem.findMany({
        where: {
          is_in_idea_bank: false,
          custom_action_items: { not: "[]" },
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
              brand: { select: { name: true, color: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),
    ]);

    type StageUrgency = "delayed" | "near" | "on_track";

    interface AttentionRegisterRow {
      id: string;
      uniqueContentId: string | null;
      title: string;
      publishDate: string;
      seriesId: string;
      seriesName: string;
      brandId: string | null;
      brandName: string | null;
      brandColor: string | null;
      currentStage: string;
      stageStatus: "not_done" | "under_review" | "revision_needed" | "done";
      stageTargetDate: string | null;
      urgency: StageUrgency;
      delayDays: number;
      daysUntilDue: number | null;
      publishUrgency: StageUrgency;
      publishDelayDays: number;
      publishDaysUntilDue: number | null;
      isPublishReady: boolean;
      isArchiveEligible: boolean;
      reviewInfo: {
        taskName: string;
        version: string;
        submitterName: string;
        roleTitle: string;
        submittedAt: string;
        targetUrl: string;
      } | null;
      workspaceUrl: string;
      indexUrl: string;
    }

    interface OpenSlotRow {
      id: string;
      publishDate: string;
      ideationTargetDate: string | null;
      seriesId: string;
      seriesName: string;
      brandId: string | null;
      brandName: string | null;
      brandColor: string | null;
      urgency: StageUrgency;
      delayDays: number;
      daysUntilDue: number | null;
      hasPlaceholderRow: boolean;
      indexUrl: string;
    }

    interface SeriesPipelineSummary {
      id: string;
      name: string;
      brandId: string | null;
      brandName: string | null;
      brandColor: string | null;
      cadenceSummary: string;
      activeCount: number;
      readyRunwayCount: number;
      delayedCount: number;
      nearCount: number;
      stages: {
        taskName: string;
        color: string;
        activeHereCount: number;
        delayedCount: number;
        nearCount: number;
        onTrackCount: number;
        reviewCount: number;
      }[];
      upcomingSlots: {
        dateKey: string;
        publishDate: string;
        title: string | null;
        uniqueContentId: string | null;
        status: "ready" | "delayed" | "near" | "on_track" | "open_slot";
        currentStage: string | null;
      }[];
      indexUrl: string;
    }

    const attentionRegister: AttentionRegisterRow[] = [];
    const openSlotsSoon: OpenSlotRow[] = [];
    const seriesPipelines: SeriesPipelineSummary[] = [];

    let totalReadyRunway = 0;
    let maxSafeRunwayDateMs: number | null = null;
    let totalDelayed = 0;
    let totalNear = 0;
    let totalUnderReview = 0;
    let totalReadyToArchive = 0;

    for (const type of contentTypes) {
      let parsedUploadDays: string[] = ["Tuesday"];
      try {
        parsedUploadDays = JSON.parse(type.upload_days || "[\"Tuesday\"]");
      } catch {
        parsedUploadDays = ["Tuesday"];
      }

      let skippedDatesSet = new Set<string>();
      try {
        const parsedSkipped = JSON.parse(type.skipped_publish_dates || "[]");
        if (Array.isArray(parsedSkipped)) {
          skippedDatesSet = new Set(parsedSkipped.map((d: string) => String(d).slice(0, 10)));
        }
      } catch {
        skippedDatesSet = new Set<string>();
      }

      const workflowTaskDefs: WorkflowTaskDefinition[] = type.workflow_tasks.map((wt) => ({
        id: wt.id,
        task_name: wt.task_name,
        sequence_order: wt.sequence_order,
        n_days_offset: wt.n_days_offset,
        team_buffer_days: wt.team_buffer_days,
        team_final_buffer_days: wt.team_final_buffer_days,
        is_hidden: wt.is_hidden,
        color: wt.color,
      }));

      const visibleTasks = workflowTaskDefs.filter((t) => !t.is_hidden);
      const stageBuckets = visibleTasks.map((vt) => ({
        taskName: vt.task_name,
        color: vt.color || "#6366f1",
        activeHereCount: 0,
        delayedCount: 0,
        nearCount: 0,
        onTrackCount: 0,
        reviewCount: 0,
      }));

      const brandSeg = type.brand ? getBrandUrlSegment(type.brand) : null;
      const seriesSeg = getSeriesUrlSegment({ id: type.id, name: type.name });
      const indexUrl = brandSeg ? `/tracker/${brandSeg}/${seriesSeg}` : `/tracker`;

      // Track occupied date keys across ALL non-idea-bank items (active + archived)
      const occupiedDateMap = new Map<
        string,
        {
          isArchived: boolean;
          isRegistered: boolean;
          title: string | null;
          uniqueContentId: string | null;
          status: "ready" | "delayed" | "near" | "on_track" | "open_slot";
          currentStage: string | null;
          publishDateIso: string;
        }
      >();

      let seriesActiveCount = 0;
      let seriesReadyRunwayCount = 0;
      let seriesDelayedCount = 0;
      let seriesNearCount = 0;

      for (const item of type.content_items) {
        if (!item.publish_date) continue;
        const pubDate = new Date(item.publish_date);
        const pubDateKey = toUtcDateKey(pubDate);
        const pubUtcMs = toUtcDayMs(pubDate);
        const isRegistered = Boolean(item.title && item.unique_content_id);

        if (item.is_archived) {
          occupiedDateMap.set(pubDateKey, {
            isArchived: true,
            isRegistered,
            title: item.title,
            uniqueContentId: item.unique_content_id,
            status: "ready",
            currentStage: "Archived",
            publishDateIso: pubDate.toISOString(),
          });
          continue;
        }

        // Untitled DB placeholder -> treat as open slot (not yet registered in production)
        if (!isRegistered) {
          occupiedDateMap.set(pubDateKey, {
            isArchived: false,
            isRegistered: false,
            title: null,
            uniqueContentId: null,
            status: "open_slot",
            currentStage: "Ideation",
            publishDateIso: pubDate.toISOString(),
          });
          continue;
        }

        seriesActiveCount++;
        const targetDatesMap = calculateTaskTargetDates(pubDate, workflowTaskDefs);

        // Compute effective status for each visible task, matching Index rules
        const taskInstanceMap = new Map(
          item.task_instances.map((ti) => [ti.task_name.toLowerCase(), ti.status])
        );

        const evaluatedTasks = visibleTasks.map((vt, idx) => {
          const key = vt.task_name.toLowerCase();
          let effStatus: "not_done" | "under_review" | "revision_needed" | "done" = "not_done";
          if (key === "ideation") {
            effStatus = isRegistered ? "done" : "not_done";
          } else if (key === "publish") {
            // Done only if all prior visible tasks are done AND publishDate <= today
            const priorAllDone = visibleTasks.slice(0, idx).every((prior) => {
              const pKey = prior.task_name.toLowerCase();
              if (pKey === "ideation") return isRegistered;
              return taskInstanceMap.get(pKey) === "done";
            });
            effStatus = priorAllDone && todayUtcMs >= pubUtcMs ? "done" : "not_done";
          } else {
            const raw = taskInstanceMap.get(key) || "not_done";
            if (
              raw === "done" ||
              raw === "under_review" ||
              raw === "revision_needed"
            ) {
              effStatus = raw;
            }
          }
          return { def: vt, status: effStatus };
        });

        // Parse misc_tasks_status for archive eligibility check
        let miscStatuses: { task_name: string; is_done: boolean }[] = [];
        try {
          miscStatuses = JSON.parse(item.misc_tasks_status || "[]");
        } catch {
          miscStatuses = [];
        }

        const archiveCheck = checkArchiveEligibility(
          pubDate,
          workflowTaskDefs,
          evaluatedTasks.map((et) => ({ task_name: et.def.task_name, status: et.status })),
          miscStatuses,
          type.misc_tasks,
          now
        );

        // Determine current active bottleneck stage: first visible task not "done"
        const firstIncompleteIdx = evaluatedTasks.findIndex((et) => et.status !== "done");
        const activeStageObj =
          firstIncompleteIdx >= 0 ? evaluatedTasks[firstIncompleteIdx] : null;

        // Also check if any task on this video is awaiting Creator review
        const reviewTaskObj = evaluatedTasks.find((et) => et.status === "under_review") || null;

        // Is Publish Ready? (either all stages before Publish are done, OR all stages are done)
        const publishIdx = evaluatedTasks.findIndex(
          (et) => et.def.task_name.toLowerCase() === "publish"
        );
        const allBeforePublishDone =
          publishIdx > 0
            ? evaluatedTasks.slice(0, publishIdx).every((et) => et.status === "done")
            : firstIncompleteIdx === -1;

        const isPublishReady =
          allBeforePublishDone &&
          evaluatedTasks.every(
            (et) =>
              et.status === "done" ||
              et.def.task_name.toLowerCase() === "publish"
          );

        if (isPublishReady && pubUtcMs >= todayUtcMs) {
          totalReadyRunway++;
          seriesReadyRunwayCount++;
          if (maxSafeRunwayDateMs === null || pubUtcMs > maxSafeRunwayDateMs) {
            maxSafeRunwayDateMs = pubUtcMs;
          }
        }

        if (archiveCheck.isEligible) {
          totalReadyToArchive++;
        }

        // Compute stage target date & urgency
        let currentStageName = "Ready to Archive";
        let stageStatus: "not_done" | "under_review" | "revision_needed" | "done" = "done";
        let stageTargetDateIso: string | null = pubDate.toISOString();
        let urgency: StageUrgency = "on_track";
        let delayDays = 0;
        let daysUntilDue: number | null = null;

        if (activeStageObj) {
          stageStatus = activeStageObj.status;

          // Evaluate urgency across incomplete PRODUCTION stages (never include Publish here since Publish Date has its own dedicated column)
          const evaluatedIncomplete = evaluatedTasks
            .filter(
              (et) =>
                et.status !== "done" &&
                et.def.task_name.toLowerCase() !== "publish"
            )
            .map((et) => {
              const tObj = targetDatesMap.get(et.def.task_name.toLowerCase());
              const due = tObj?.target_date_worst_case || pubDate;
              const diffDays = Math.round((toUtcDayMs(due) - todayUtcMs) / MS_PER_DAY);

              let taskUrgency: StageUrgency = "on_track";
              let taskDelayDays = 0;
              if (diffDays < 0) {
                taskUrgency = "delayed";
                taskDelayDays = Math.abs(diffDays);
              } else if (diffDays <= 7) {
                taskUrgency = "near";
              }

              return {
                taskName: et.def.task_name,
                due,
                diffDays,
                urgency: taskUrgency,
                delayDays: taskDelayDays,
              };
            });

          const delayedStages = evaluatedIncomplete.filter((s) => s.urgency === "delayed");
          const nearStages = evaluatedIncomplete.filter((s) => s.urgency === "near");

          if (delayedStages.length > 0) {
            urgency = "delayed";
            currentStageName = delayedStages.map((s) => s.taskName).join(", ");
            const worstStage = delayedStages.reduce((prev, curr) =>
              curr.delayDays > prev.delayDays ? curr : prev
            );
            delayDays = worstStage.delayDays;
            daysUntilDue = worstStage.diffDays;
            stageTargetDateIso = worstStage.due.toISOString();
            totalDelayed++;
            seriesDelayedCount++;
          } else if (nearStages.length > 0) {
            urgency = "near";
            currentStageName = nearStages.map((s) => s.taskName).join(", ");
            const closestStage = nearStages.reduce((prev, curr) =>
              curr.diffDays < prev.diffDays ? curr : prev
            );
            daysUntilDue = closestStage.diffDays;
            stageTargetDateIso = closestStage.due.toISOString();
            totalNear++;
            seriesNearCount++;
          } else if (isPublishReady) {
            currentStageName = "Publish Ready";
            daysUntilDue = Math.round((pubUtcMs - todayUtcMs) / MS_PER_DAY);
            stageTargetDateIso = pubDate.toISOString();
          } else {
            currentStageName = activeStageObj.def.task_name;
            const firstEval = evaluatedIncomplete[0];
            if (firstEval) {
              daysUntilDue = firstEval.diffDays;
              stageTargetDateIso = firstEval.due.toISOString();
            }
          }

          // Place video in exactly ONE stage bucket in the Live Assembly Line (first incomplete bottleneck)
          const bucket = stageBuckets[firstIncompleteIdx];
          if (bucket) {
            bucket.activeHereCount++;
            if (urgency === "delayed") bucket.delayedCount++;
            else if (urgency === "near") bucket.nearCount++;
            else bucket.onTrackCount++;
            if (reviewTaskObj || stageStatus === "under_review") bucket.reviewCount++;
          }
        } else if (stageBuckets.length > 0) {
          // All visible tasks done, waiting to be archived
          const lastBucket = stageBuckets[stageBuckets.length - 1];
          lastBucket.activeHereCount++;
          lastBucket.onTrackCount++;
        }

        // Build review info if under_review exists on this item
        let reviewInfo: AttentionRegisterRow["reviewInfo"] = null;
        if (reviewTaskObj) {
          totalUnderReview++;
          const rTaskName = reviewTaskObj.def.task_name;
          const latestSub =
            item.submissions.find(
              (s) => s.task_name.toLowerCase() === rTaskName.toLowerCase()
            ) || item.submissions[0];

          const isScriptTask = rTaskName.toLowerCase().includes("script");
          const workspaceTarget = isScriptTask
            ? `/scripts/${item.unique_content_id || item.id}`
            : `/content/${item.unique_content_id || item.id}`;

          reviewInfo = {
            taskName: rTaskName,
            version: latestSub?.version || "V1",
            submitterName: latestSub?.submitted_by?.name || "Team Member",
            roleTitle: latestSub?.submitted_by?.role_title || "Specialist",
            submittedAt: (latestSub?.created_at || item.created_at).toISOString(),
            targetUrl: workspaceTarget,
          };
        }

        const isScriptStage = currentStageName.toLowerCase().includes("script");
        const isContentStage =
          currentStageName.toLowerCase().includes("edit") ||
          currentStageName.toLowerCase().includes("thumbnail") ||
          currentStageName.toLowerCase().includes("design");
        const workspaceUrl = reviewInfo
          ? reviewInfo.targetUrl
          : isScriptStage
          ? `/scripts/${item.unique_content_id || item.id}`
          : isContentStage
          ? `/content/${item.unique_content_id || item.id}`
          : indexUrl;

        const pubDiffDays = Math.round((pubUtcMs - todayUtcMs) / MS_PER_DAY);
        let publishUrgency: StageUrgency = "on_track";
        let publishDelayDays = 0;
        if (pubDiffDays < 0) {
          publishUrgency = "delayed";
          publishDelayDays = Math.abs(pubDiffDays);
        } else if (pubDiffDays <= 7) {
          publishUrgency = "near";
        }

        attentionRegister.push({
          id: item.id,
          uniqueContentId: item.unique_content_id,
          title: item.title || "Untitled Video",
          publishDate: pubDate.toISOString(),
          seriesId: type.id,
          seriesName: type.name,
          brandId: type.brand_id || null,
          brandName: type.brand?.name || null,
          brandColor: type.brand?.color || null,
          currentStage: currentStageName,
          stageStatus,
          stageTargetDate: stageTargetDateIso,
          urgency,
          delayDays,
          daysUntilDue,
          publishUrgency,
          publishDelayDays,
          publishDaysUntilDue: pubDiffDays,
          isPublishReady,
          isArchiveEligible: archiveCheck.isEligible,
          reviewInfo,
          workspaceUrl,
          indexUrl,
        });

        occupiedDateMap.set(pubDateKey, {
          isArchived: false,
          isRegistered: true,
          title: item.title,
          uniqueContentId: item.unique_content_id,
          status: isPublishReady ? "ready" : urgency,
          currentStage: currentStageName,
          publishDateIso: pubDate.toISOString(),
        });
      }

      // Evaluate next 30-day cadence slots for gaps ("Open Slots") & series timeline strip
      const futureDates = generateFuturePublishDates(
        {
          cadence_type: (type.cadence_type as any) || "weekly",
          cadence_start_date: type.cadence_start_date,
          upload_days: parsedUploadDays,
        },
        2,
        now
      );

      const upcomingSlots: SeriesPipelineSummary["upcomingSlots"] = [];
      const seenSlotKeys = new Set<string>();

      for (const slotDate of futureDates) {
        const key = toUtcDateKey(slotDate);
        if (skippedDatesSet.has(key) || seenSlotKeys.has(key)) continue;
        seenSlotKeys.add(key);

        const slotMs = toUtcDayMs(slotDate);
        const daysAway = Math.round((slotMs - todayUtcMs) / MS_PER_DAY);
        if (daysAway < 0) continue;

        const existing = occupiedDateMap.get(key);
        if (existing?.isArchived) continue;

        if (upcomingSlots.length < 5) {
          upcomingSlots.push({
            dateKey: key,
            publishDate: slotDate.toISOString(),
            title: existing?.isRegistered ? existing.title : null,
            uniqueContentId: existing?.isRegistered ? existing.uniqueContentId : null,
            status: existing ? existing.status : "open_slot",
            currentStage: existing?.currentStage || null,
          });
        }

        // Open slot within next 30 days needing an Idea/Title
        if ((!existing || !existing.isRegistered) && daysAway <= 30) {
          const targetMap = calculateTaskTargetDates(slotDate, workflowTaskDefs);
          const ideationDue =
            targetMap.get("ideation")?.target_date_worst_case ||
            (visibleTasks[0]
              ? targetMap.get(visibleTasks[0].task_name.toLowerCase())?.target_date_worst_case
              : null) ||
            null;

          let slotUrgency: StageUrgency = "on_track";
          let slotDelay = 0;
          let slotDaysUntil: number | null = daysAway;

          if (ideationDue) {
            const ideationDiff = Math.round((toUtcDayMs(ideationDue) - todayUtcMs) / MS_PER_DAY);
            slotDaysUntil = ideationDiff;
            if (ideationDiff < 0) {
              slotUrgency = "delayed";
              slotDelay = Math.abs(ideationDiff);
            } else if (ideationDiff <= 7) {
              slotUrgency = "near";
            }
          }

          openSlotsSoon.push({
            id: `${type.id}:${key}`,
            publishDate: slotDate.toISOString(),
            ideationTargetDate: ideationDue ? ideationDue.toISOString() : null,
            seriesId: type.id,
            seriesName: type.name,
            brandId: type.brand_id || null,
            brandName: type.brand?.name || null,
            brandColor: type.brand?.color || null,
            urgency: slotUrgency,
            delayDays: slotDelay,
            daysUntilDue: slotDaysUntil,
            hasPlaceholderRow: Boolean(existing && !existing.isRegistered),
            indexUrl,
          });
        }
      }

      const cadenceLabel =
        type.cadence_type.charAt(0).toUpperCase() + type.cadence_type.slice(1);
      seriesPipelines.push({
        id: type.id,
        name: type.name,
        brandId: type.brand_id || null,
        brandName: type.brand?.name || null,
        brandColor: type.brand?.color || null,
        cadenceSummary: `${cadenceLabel} • ${parsedUploadDays.join(", ")}`,
        activeCount: seriesActiveCount,
        readyRunwayCount: seriesReadyRunwayCount,
        delayedCount: seriesDelayedCount,
        nearCount: seriesNearCount,
        stages: stageBuckets,
        upcomingSlots,
        indexUrl,
      });
    }

    // Sort attentionRegister by soonest publishDate (exception-first priority handled seamlessly in UI + date order)
    attentionRegister.sort(
      (a, b) => new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime()
    );
    openSlotsSoon.sort(
      (a, b) => new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime()
    );

    // =========================================================================
    // Quality Control / Mistake Analytics (Distinct historical insight)
    // =========================================================================
    const filteredComments =
      memberFilter !== "all"
        ? allComments.filter(
            (c) =>
              c.submission.submitted_by?.email === memberFilter ||
              c.author_email === memberFilter
          )
        : allComments;

    const categoryCounts: Record<string, number> = {};
    let totalMistakes = 0;

    for (const c of filteredComments) {
      const cat = c.category || "Uncategorized";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      totalMistakes++;
    }

    const mistakeBreakdown = Object.entries(categoryCounts)
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: totalMistakes > 0 ? Math.round((count / totalMistakes) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const filteredSubs =
      memberFilter !== "all"
        ? allSubmissions.filter((s) => s.submitted_by?.email === memberFilter)
        : allSubmissions;

    const submissionsByItem = new Map<string, typeof filteredSubs>();
    for (const sub of filteredSubs) {
      const arr = submissionsByItem.get(sub.content_item_id) || [];
      arr.push(sub);
      submissionsByItem.set(sub.content_item_id, arr);
    }

    let firstPassCount = 0;
    let totalIterationsSum = 0;
    let totalCompletedItems = 0;

    submissionsByItem.forEach((subs) => {
      const hasApproved = subs.some((s) => s.status === "approved");
      if (hasApproved) {
        totalCompletedItems++;
        totalIterationsSum += subs.length;
        const v1 = subs.find((s) => s.version === "V1");
        const hasRejected = subs.some((s) => s.status === "rejected");
        if (v1 && v1.status === "approved" && !hasRejected) {
          firstPassCount++;
        }
      }
    });

    const firstPassRate =
      totalCompletedItems > 0 ? Math.round((firstPassCount / totalCompletedItems) * 100) : 0;
    const avgIterations =
      totalCompletedItems > 0
        ? Number((totalIterationsSum / totalCompletedItems).toFixed(1))
        : 0;

    // =========================================================================
    // Floating Custom Action Items (Not workflow stage tasks)
    // =========================================================================
    const openActionItems: any[] = [];
    const closedActionItems: any[] = [];

    for (const item of itemsWithActions) {
      try {
        const actions = JSON.parse(item.custom_action_items || "[]");
        for (const act of actions) {
          const payload = {
            itemId: item.id,
            uniqueContentId: item.unique_content_id,
            title: item.title || "Untitled Video",
            contentTypeName: item.content_type?.name || "General",
            brandName: item.content_type?.brand?.name || null,
            brandColor: item.content_type?.brand?.color || null,
            isArchived: item.is_archived,
            actionItem: act,
          };
          if (act.is_closed) {
            closedActionItems.push(payload);
          } else {
            openActionItems.push(payload);
          }
        }
      } catch {
        // skip malformed JSON
      }
    }

    const openSlotsUrgentCount = openSlotsSoon.filter((s) => s.urgency !== "on_track").length;

    return NextResponse.json({
      brands,
      activeBrandId: brandId,
      pulseSummary: {
        readyRunwayCount: totalReadyRunway,
        safeUntilDate: maxSafeRunwayDateMs ? new Date(maxSafeRunwayDateMs).toISOString() : null,
        delayedCount: totalDelayed,
        nearCount: totalNear,
        underReviewCount: totalUnderReview,
        readyToArchiveCount: totalReadyToArchive,
        openSlotsSoonCount: openSlotsSoon.length,
        openSlotsUrgentCount,
        totalActiveCount: attentionRegister.length,
      },
      seriesPipelines,
      attentionRegister,
      openSlotsSoon,
      mistakeAnalytics: {
        breakdown: mistakeBreakdown,
        firstPassRate,
        avgIterations,
        totalMistakes,
        teamMembers,
      },
      actionItems: {
        open: openActionItems,
        closed: closedActionItems.slice(0, 12),
      },
    });
  } catch (error) {
    console.error("Error generating Creator Dashboard data:", error);
    return NextResponse.json({ error: "Failed to generate creator dashboard" }, { status: 500 });
  }
}
