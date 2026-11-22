import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDynamicUserProfile } from "@/lib/constants/users";
import { generateFuturePublishDates, CadenceConfig } from "@/lib/cadence";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = session.user.role === "creator";
  const userProfile = await getDynamicUserProfile(session.user.email);
  const effectivePermissions: string[] = isCreator
    ? ["admin:super"]
    : userProfile?.permissions?.effective_permissions || [];

  const canEdit = isCreator || effectivePermissions.includes("tracker:row:move_slot");
  if (!canEdit) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to reorganize publish dates." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      content_type_id,
      from_level = "ideation", // "ideation" | task_name | "all"
      include_manual = false,
      anchor_mode = "earliest_selection", // "earliest_selection" | "earliest_future_cadence" | "manual_date"
      manual_anchor_date,
      dry_run = false,
    } = body;

    if (!content_type_id) {
      return NextResponse.json({ error: "content_type_id is required" }, { status: 400 });
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: content_type_id },
      include: {
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
      },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    let parsedUploadDays: string[] = ["Tuesday"];
    try {
      parsedUploadDays = JSON.parse(contentType.upload_days || "[\"Tuesday\"]");
    } catch {
      parsedUploadDays = ["Tuesday"];
    }

    const cadenceConfig: CadenceConfig = {
      cadence_type: contentType.cadence_type as any,
      cadence_start_date: contentType.cadence_start_date,
      upload_days: parsedUploadDays,
      default_months_open: 6,
    };

    // 1. Fetch all active items for this content type
    const activeItems = await prisma.contentItem.findMany({
      where: {
        content_type_id,
        is_archived: false,
        is_in_idea_bank: false,
        publish_date: { not: null },
      },
      include: {
        task_instances: true,
      },
      orderBy: { publish_date: "asc" },
    });

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));

    const visibleTasks = contentType.workflow_tasks.filter((t) => !t.is_hidden);
    const fromLevelLower = from_level.toLowerCase().trim();

    // 2. Classify items: Locked vs Selected for Reorganization
    const lockedItems: typeof activeItems = [];
    const selectedItems: typeof activeItems = [];
    let skippedManualCount = 0;

    for (const item of activeItems) {
      if (!item.publish_date) continue;
      const rawPDate = new Date(item.publish_date);
      const itemPDate = new Date(
        Date.UTC(rawPDate.getUTCFullYear(), rawPDate.getUTCMonth(), rawPDate.getUTCDate(), 12, 0, 0, 0)
      );

      // Rule: Never reorganize any date that is already published
      const allPriorDone = visibleTasks.every((t) => {
        const tKey = t.task_name.toLowerCase();
        if (tKey === "ideation") return Boolean(item.title && item.unique_content_id);
        if (tKey === "publish") return true;
        return item.task_instances.find((ti) => ti.task_name.toLowerCase() === tKey)?.status === "done";
      });

      const isAlreadyPublished = allPriorDone && today.getTime() >= itemPDate.getTime();
      if (isAlreadyPublished) {
        lockedItems.push(item);
        continue;
      }

      // Check level filter FIRST so we know whether manual exclusion skipped qualifying items
      let qualifies = false;
      if (fromLevelLower === "ideation") {
        qualifies = !item.title || !item.unique_content_id;
      } else if (fromLevelLower === "all" || fromLevelLower === "publish") {
        qualifies = true;
      } else {
        const targetTaskIdx = visibleTasks.findIndex(
          (t) => t.task_name.toLowerCase() === fromLevelLower
        );
        if (targetTaskIdx !== -1) {
          const isIdeationDone = Boolean(item.title && item.unique_content_id);
          if (!isIdeationDone) {
            qualifies = true;
          } else {
            const tasksUpToTarget = visibleTasks.slice(0, targetTaskIdx + 1);
            const allUpToTargetDone = tasksUpToTarget.every((t) => {
              const tKey = t.task_name.toLowerCase();
              if (tKey === "ideation") return Boolean(item.title && item.unique_content_id);
              const inst = item.task_instances.find((ti) => ti.task_name.toLowerCase() === tKey);
              return inst?.status === "done";
            });
            qualifies = !allUpToTargetDone;
          }
        }
      }

      // Check manually added condition
      if (qualifies && item.is_manual_publish_date && !include_manual) {
        skippedManualCount++;
        lockedItems.push(item);
        continue;
      }

      if (qualifies) {
        selectedItems.push(item);
      } else {
        lockedItems.push(item);
      }
    }

    if (selectedItems.length === 0) {
      return NextResponse.json({
        success: true,
        reorganized_count: 0,
        matched_count: 0,
        skipped_manual_count: skippedManualCount,
        message: "No uncompleted placeholders match the selected filter.",
        preview: [],
      });
    }

    // 3. Determine Anchor Point date (UTC Noon)
    let anchorDate: Date;
    if (anchor_mode === "earliest_future_cadence") {
      const futureCadenceFromToday = generateFuturePublishDates(cadenceConfig, 6, today);
      const firstFutureCadence = futureCadenceFromToday.find((d) => d.getTime() >= today.getTime());
      anchorDate = firstFutureCadence ? new Date(firstFutureCadence) : new Date(today);
    } else if (anchor_mode === "manual_date" && manual_anchor_date) {
      const parsedAnchor = new Date(manual_anchor_date);
      anchorDate = new Date(
        Date.UTC(
          parsedAnchor.getUTCFullYear(),
          parsedAnchor.getUTCMonth(),
          parsedAnchor.getUTCDate(),
          12,
          0,
          0,
          0
        )
      );
    } else {
      // Default: "earliest_selection" (earliest date from the selection)
      const selectedTimes = selectedItems
        .filter((item) => item.publish_date !== null)
        .map((item) => new Date(item.publish_date as Date).getTime());
      const minSelectedTime = selectedTimes.length > 0 ? Math.min(...selectedTimes) : today.getTime();
      const earliest = new Date(minSelectedTime);
      anchorDate = new Date(
        Date.UTC(
          earliest.getUTCFullYear(),
          earliest.getUTCMonth(),
          earliest.getUTCDate(),
          12,
          0,
          0,
          0
        )
      );
    }

    // 4. Generate future cadence publish dates from anchorDate onwards (12 months horizon for plenty of slots)
    const allCadenceDates = generateFuturePublishDates(cadenceConfig, 12, anchorDate);
    let skippedDates: string[] = [];
    try {
      skippedDates = JSON.parse(contentType.skipped_publish_dates || "[]");
    } catch {
      skippedDates = [];
    }
    const futureCadenceDates = allCadenceDates.filter((d) => {
      const dKey = d.toISOString().split("T")[0];
      const isAfterOrAtAnchor = d.getTime() >= anchorDate.getTime();
      return isAfterOrAtAnchor && !skippedDates.includes(dKey);
    });

    // Set of date strings already occupied by locked items (format YYYY-MM-DD)
    // Used for Occupied Slot Skipping to prevent collisions or double bookings
    const lockedDateKeys = new Set(
      lockedItems
        .filter((item) => item.publish_date !== null)
        .map((item) => new Date(item.publish_date as Date).toISOString().split("T")[0])
    );

    // 4. Assign available cadence dates to selected items
    const preview: {
      id: string;
      title: string;
      unique_content_id: string | null;
      old_publish_date: string;
      new_publish_date: string;
      is_manual: boolean;
    }[] = [];

    const updates: { id: string; new_publish_date: Date }[] = [];
    let cadenceIdx = 0;

    for (const item of selectedItems) {
      // Find next open cadence slot not taken by a locked item
      while (
        cadenceIdx < futureCadenceDates.length &&
        lockedDateKeys.has(futureCadenceDates[cadenceIdx].toISOString().split("T")[0])
      ) {
        cadenceIdx++;
      }

      if (cadenceIdx < futureCadenceDates.length) {
        const nextDate = futureCadenceDates[cadenceIdx];
        const nextDateKey = nextDate.toISOString().split("T")[0];
        lockedDateKeys.add(nextDateKey); // reserve it
        cadenceIdx++;

        const oldDateKey = item.publish_date
          ? new Date(item.publish_date).toISOString().split("T")[0]
          : "";
        const isDateChanged = oldDateKey !== nextDateKey;

        // Only include in updates and preview if the date is actually changing!
        if (isDateChanged) {
          preview.push({
            id: item.id,
            title: item.title || "[Empty Placeholder]",
            unique_content_id: item.unique_content_id,
            old_publish_date: item.publish_date ? item.publish_date.toISOString() : "",
            new_publish_date: nextDate.toISOString(),
            is_manual: item.is_manual_publish_date,
          });

          updates.push({
            id: item.id,
            new_publish_date: nextDate,
          });
        }
      }
    }

    // 5. If dry run: return preview only
    if (dry_run) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        reorganized_count: preview.length,
        matched_count: selectedItems.length,
        skipped_manual_count: skippedManualCount,
        locked_count: lockedItems.length,
        preview,
      });
    }

    // 6. Execute updates in transaction
    await prisma.$transaction(
      updates.map((u) =>
        prisma.contentItem.update({
          where: { id: u.id },
          data: {
            publish_date: u.new_publish_date,
            is_manual_publish_date: false, // now strictly aligned to cadence
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      dry_run: false,
      reorganized_count: updates.length,
      message: `Successfully reorganized ${updates.length} publish dates according to current cadence schedule.`,
      preview,
    });
  } catch (error) {
    console.error("Error in Publish Dates Organizer:", error);
    return NextResponse.json({ error: "Failed to reorganize publish dates" }, { status: 500 });
  }
}
