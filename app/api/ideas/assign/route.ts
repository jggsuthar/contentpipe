import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/prisma";
import { generateNextContentId } from "@/lib/id-generator";
import { verifyPermission } from "@/lib/api-guard";
import { deleteContentDriveFolder, ensureContentDriveFolders } from "@/lib/google-drive";
import { ensureLegacyIdeasMigrated } from "@/lib/idea-migration";
import { generateFuturePublishDates, CadenceConfig } from "@/lib/cadence";
import { DriveFolders } from "@/types/database";

type AssignmentMode = "placeholder" | "manual_date";
type CollisionStrategy = "push_existing" | "keep_both" | "overwrite_existing";

interface PreviewShift {
  id: string;
  unique_content_id: string | null;
  title: string;
  fromDate: string;
  toDate: string;
}

function toUtcDateKey(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return new Date(value).toISOString().split("T")[0];
}

function parseTargetPublishDate(raw: string): Date {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000Z`);
  }
  return new Date(trimmed);
}

function isAssignedContentItem(item: {
  title: string | null;
  unique_content_id: string | null;
}): boolean {
  return item.title !== null || item.unique_content_id !== null;
}

function isItemPublished(
  item: {
    title: string | null;
    unique_content_id: string | null;
    publish_date: Date | null;
    task_instances: { task_name: string; status: string }[];
  },
  visibleWorkflowTasks: { task_name: string }[]
): boolean {
  const publishInst = item.task_instances.find(
    (ti) => ti.task_name.toLowerCase() === "publish"
  );
  if (publishInst?.status === "done") return true;
  if (!item.publish_date) return false;

  const priorTasks = visibleWorkflowTasks.filter(
    (wt) => wt.task_name.toLowerCase() !== "publish"
  );
  const allPriorDone =
    priorTasks.length > 0 &&
    priorTasks.every((wt) => {
      const key = wt.task_name.toLowerCase();
      if (key === "ideation") {
        return Boolean(item.title && item.unique_content_id);
      }
      const inst = item.task_instances.find(
        (ti) => ti.task_name.toLowerCase() === key
      );
      return inst?.status === "done";
    });

  const pubDateMidnight = new Date(item.publish_date);
  pubDateMidnight.setHours(0, 0, 0, 0);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  return allPriorDone && todayMidnight.getTime() >= pubDateMidnight.getTime();
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("idea:assign");
  if (!guard.authorized) return guard.response;

  try {
    await ensureLegacyIdeasMigrated();

    const body = await req.json();
    const {
      idea_id,
      content_type_id,
      assignment_mode = "placeholder",
      publish_date,
      target_item_id,
      item_id,
      collision_strategy = "keep_both",
      confirm_overwrite = false,
      overwrite_token = "",
      dry_run = false,
    } = body as {
      idea_id?: string;
      content_type_id?: string;
      assignment_mode?: AssignmentMode;
      publish_date?: string;
      target_item_id?: string;
      item_id?: string;
      collision_strategy?: CollisionStrategy;
      confirm_overwrite?: boolean;
      overwrite_token?: string;
      dry_run?: boolean;
    };

    if (!idea_id || !content_type_id || !publish_date) {
      return NextResponse.json(
        { error: "idea_id, content_type_id, and publish_date are required" },
        { status: 400 }
      );
    }

    const idea = await prisma.contentItem.findFirst({
      where: { id: idea_id, is_in_idea_bank: true },
      include: {
        task_instances: true,
        script: true,
      },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
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

    const targetPublishDate = parseTargetPublishDate(publish_date);
    if (Number.isNaN(targetPublishDate.getTime())) {
      return NextResponse.json({ error: "Invalid publish_date" }, { status: 400 });
    }
    const targetDateKey = toUtcDateKey(publish_date);

    const visibleWorkflowTasks = contentType.workflow_tasks.filter(
      (wt) => !wt.is_hidden
    );

    // 1. Collision Detection across active assigned items in this Content Series
    const activeSeriesItems = await prisma.contentItem.findMany({
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

    const effectiveTargetId = target_item_id || item_id;
    const isRealTargetId =
      Boolean(effectiveTargetId) &&
      !String(effectiveTargetId).startsWith("placeholder_");

    const targetById = isRealTargetId
      ? activeSeriesItems.find((i) => i.id === effectiveTargetId) || null
      : null;

    const assignedOnTargetDate = activeSeriesItems.filter(
      (i) =>
        i.id !== idea.id &&
        i.publish_date &&
        toUtcDateKey(i.publish_date) === targetDateKey &&
        isAssignedContentItem(i)
    );

    const collidingItem =
      (targetById && targetById.id !== idea.id && isAssignedContentItem(targetById)
        ? targetById
        : null) ||
      assignedOnTargetDate.find(
        (i) => !isItemPublished(i, visibleWorkflowTasks)
      ) ||
      assignedOnTargetDate[0] ||
      null;

    // Empty placeholder DB rows on the target slot (to be cleared cleanly on commit)
    const emptyPlaceholdersToClear = activeSeriesItems.filter(
      (i) =>
        i.id !== idea.id &&
        !isAssignedContentItem(i) &&
        ((isRealTargetId && i.id === effectiveTargetId) ||
          (i.publish_date && toUtcDateKey(i.publish_date) === targetDateKey))
    );

    // 2. Handle Collisions
    let previewShifts: PreviewShift[] = [];

    if (collidingItem) {
      const collidingIsPublished = isItemPublished(
        collidingItem,
        visibleWorkflowTasks
      );

      if (
        collidingIsPublished &&
        (collision_strategy === "push_existing" ||
          collision_strategy === "overwrite_existing")
      ) {
        return NextResponse.json(
          {
            error:
              "Cannot push or overwrite an item that is already published. Choose 'Have Multiple Contents on Same Day' instead.",
          },
          { status: 400 }
        );
      }

      if (collision_strategy === "push_existing") {
        let parsedUploadDays: string[] = ["Tuesday"];
        try {
          parsedUploadDays = JSON.parse(
            contentType.upload_days || '["Tuesday"]'
          );
        } catch {
          parsedUploadDays = ["Tuesday"];
        }

        const cadenceConfig: CadenceConfig = {
          cadence_type: contentType.cadence_type as CadenceConfig["cadence_type"],
          cadence_start_date: contentType.cadence_start_date,
          upload_days: parsedUploadDays,
          default_months_open: 12,
        };

        let skippedDates: string[] = [];
        try {
          skippedDates = JSON.parse(contentType.skipped_publish_dates || "[]");
        } catch {
          skippedDates = [];
        }
        const skippedSet = new Set(skippedDates);

        const futureCadenceCandidates = generateFuturePublishDates(
          cadenceConfig,
          12,
          new Date(targetPublishDate)
        ).filter((d) => {
          const k = toUtcDateKey(d);
          return k > targetDateKey && !skippedSet.has(k);
        });

        // Deduplicate cadence slots by YYYY-MM-DD
        const cadenceDates: Date[] = [];
        const seenCadenceKeys = new Set<string>();
        for (const d of futureCadenceCandidates) {
          const k = toUtcDateKey(d);
          if (!seenCadenceKeys.has(k)) {
            seenCadenceKeys.add(k);
            cadenceDates.push(d);
          }
        }

        // Map active assigned items (other than collidingItem) by date key
        const itemsByDateKey = new Map<string, typeof activeSeriesItems>();
        for (const item of activeSeriesItems) {
          if (item.id === collidingItem.id || item.id === idea.id) continue;
          if (!isAssignedContentItem(item) || !item.publish_date) continue;
          const k = toUtcDateKey(item.publish_date);
          const list = itemsByDateKey.get(k) || [];
          list.push(item);
          itemsByDateKey.set(k, list);
        }

        // Cascade shift forward until absorbed by an open cadence slot
        let itemToPlace: typeof collidingItem | null = collidingItem;
        let cadenceIdx = 0;

        while (itemToPlace && cadenceIdx < cadenceDates.length) {
          const currentFromKey = toUtcDateKey(itemToPlace.publish_date!);

          // Advance cadenceIdx until slot is strictly after itemToPlace's current date
          while (
            cadenceIdx < cadenceDates.length &&
            toUtcDateKey(cadenceDates[cadenceIdx]) <= currentFromKey
          ) {
            cadenceIdx++;
          }

          if (cadenceIdx >= cadenceDates.length) break;

          const candidateDate = cadenceDates[cadenceIdx];
          const candidateKey = toUtcDateKey(candidateDate);
          const occupants = itemsByDateKey.get(candidateKey) || [];

          // Check if any occupant is locked (published or manual publish date)
          const hasLockedOccupant = occupants.some(
            (occ) =>
              occ.is_manual_publish_date ||
              isItemPublished(occ, visibleWorkflowTasks)
          );

          if (hasLockedOccupant) {
            // Skip locked slot and keep searching forward
            cadenceIdx++;
            continue;
          }

          const pushableOccupant = occupants[0] || null;
          if (pushableOccupant) {
            itemsByDateKey.set(
              candidateKey,
              occupants.filter((o) => o.id !== pushableOccupant.id)
            );
          }

          const normalizedToDate = new Date(`${candidateKey}T12:00:00.000Z`);
          previewShifts.push({
            id: itemToPlace.id,
            unique_content_id: itemToPlace.unique_content_id,
            title: itemToPlace.title || "Untitled Video",
            fromDate: itemToPlace.publish_date!.toISOString(),
            toDate: normalizedToDate.toISOString(),
          });

          // Mark slot as occupied by itemToPlace in case of further tracking
          const updatedOccupants = itemsByDateKey.get(candidateKey) || [];
          updatedOccupants.push(itemToPlace);
          itemsByDateKey.set(candidateKey, updatedOccupants);

          cadenceIdx++;
          itemToPlace = pushableOccupant;
        }

        if (itemToPlace) {
          // Fallback beyond 12-month cadence horizon: +7 days after last cadence date
          const lastBase =
            cadenceDates[cadenceDates.length - 1] || new Date(targetPublishDate);
          const fallback = new Date(lastBase);
          fallback.setDate(fallback.getDate() + 7);
          const fallbackKey = toUtcDateKey(fallback);
          previewShifts.push({
            id: itemToPlace.id,
            unique_content_id: itemToPlace.unique_content_id,
            title: itemToPlace.title || "Untitled Video",
            fromDate: itemToPlace.publish_date!.toISOString(),
            toDate: new Date(`${fallbackKey}T12:00:00.000Z`).toISOString(),
          });
        }
      } else if (collision_strategy === "overwrite_existing") {
        if (dry_run) {
          return NextResponse.json({
            success: true,
            dry_run: true,
            collision: true,
            previewShifts: [],
          });
        }

        if (!confirm_overwrite || overwrite_token !== "OVERWRITE") {
          return NextResponse.json(
            {
              error:
                "Overwrite requires explicit confirmation and typing OVERWRITE.",
            },
            { status: 400 }
          );
        }

        // Purge Google Drive folder for overwritten item
        if (collidingItem.drive_folders) {
          try {
            const oldDriveFolders: DriveFolders = JSON.parse(
              collidingItem.drive_folders
            );
            if (oldDriveFolders.main_folder_id) {
              await deleteContentDriveFolder(oldDriveFolders.main_folder_id);
            }
          } catch (err) {
            console.error(
              "Error deleting Google Drive folder during overwrite:",
              err
            );
          }
        }

        // Remove ScheduledAllocations tied to old item's TaskInstances or virtual IDs
        const oldTaskIds = collidingItem.task_instances.map((ti) => ti.id);
        await prisma.scheduledAllocation.deleteMany({
          where: {
            OR: [
              ...(oldTaskIds.length > 0
                ? [{ sourceId: { in: oldTaskIds } }]
                : []),
              { sourceId: { startsWith: `virtual:${collidingItem.id}:` } },
              { sourceId: { startsWith: `${collidingItem.id}::` } },
            ],
          },
        });

        // Delete old ContentItem (cascades TaskInstance, Script, Submission, Comment)
        await prisma.contentItem.delete({
          where: { id: collidingItem.id },
        });
      }
    }

    if (dry_run) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        collision: Boolean(collidingItem),
        previewShifts,
      });
    }

    // Apply empty placeholder cleanup and cascade shifts
    const destinationDateKeys = new Set(
      previewShifts.map((s) => toUtcDateKey(s.toDate))
    );
    const extraEmptyPlaceholders = activeSeriesItems.filter(
      (i) =>
        !isAssignedContentItem(i) &&
        i.publish_date &&
        destinationDateKeys.has(toUtcDateKey(i.publish_date))
    );

    const emptyIdsToDelete = Array.from(
      new Set([
        ...emptyPlaceholdersToClear.map((i) => i.id),
        ...extraEmptyPlaceholders.map((i) => i.id),
      ])
    );

    if (emptyIdsToDelete.length > 0) {
      await prisma.contentItem.deleteMany({
        where: { id: { in: emptyIdsToDelete } },
      });
    }

    if (previewShifts.length > 0) {
      await prisma.$transaction(
        previewShifts.map((shift) =>
          prisma.contentItem.update({
            where: { id: shift.id },
            data: {
              publish_date: new Date(shift.toDate),
              is_manual_publish_date: false,
            },
          })
        )
      );
    }

    // Un-skip target date in ContentType.skipped_publish_dates if present
    if (contentType.skipped_publish_dates) {
      try {
        const skipped: string[] = JSON.parse(
          contentType.skipped_publish_dates || "[]"
        );
        if (skipped.includes(targetDateKey)) {
          await prisma.contentType.update({
            where: { id: contentType.id },
            data: {
              skipped_publish_dates: JSON.stringify(
                skipped.filter((d) => d !== targetDateKey)
              ),
            },
          });
        }
      } catch (err) {
        console.error("Error updating skipped_publish_dates:", err);
      }
    }

    // 3. Lossless Idea Promotion
    const now = new Date();
    const permanentId =
      idea.unique_content_id || (await generateNextContentId(contentType, now));

    const existingTaskNames = new Set(
      idea.task_instances.map((ti) => ti.task_name.toLowerCase())
    );
    const missingTasksToCreate = contentType.workflow_tasks
      .filter((wt) => !existingTaskNames.has(wt.task_name.toLowerCase()))
      .map((wt) => {
        const isIdeation = wt.task_name.toLowerCase() === "ideation";
        return {
          task_name: wt.task_name,
          status: isIdeation ? "done" : "not_done",
          completed_at: isIdeation ? now : null,
        };
      });

    const isManualDate =
      assignment_mode === "manual_date" ||
      (Boolean(collidingItem) && collision_strategy === "keep_both");

    let savedItem = await prisma.contentItem.update({
      where: { id: idea.id },
      data: {
        is_in_idea_bank: false,
        content_type_id,
        brand_id: contentType.brand_id || idea.brand_id || null,
        publish_date: targetPublishDate,
        ideation_date: idea.ideation_date || now,
        is_manual_publish_date: isManualDate,
        unique_content_id: permanentId,
        ...(missingTasksToCreate.length > 0
          ? {
              task_instances: {
                create: missingTasksToCreate,
              },
            }
          : {}),
      },
      include: { task_instances: true },
    });

    const existingIdeation = savedItem.task_instances.find(
      (ti) => ti.task_name.toLowerCase() === "ideation"
    );
    if (existingIdeation && existingIdeation.status !== "done") {
      await prisma.taskInstance.update({
        where: { id: existingIdeation.id },
        data: { status: "done", completed_at: now },
      });
    }

    // Provision Drive folders only if not already created during Idea Bank work
    let existingFolders: DriveFolders | null = null;
    try {
      existingFolders = JSON.parse(savedItem.drive_folders || "{}");
    } catch {
      existingFolders = null;
    }

    if (!existingFolders?.main_folder_id && savedItem.unique_content_id) {
      const targetId = savedItem.id;
      const targetUniqueId = savedItem.unique_content_id;
      const targetTitle = savedItem.title || "Untitled Video";
      const seriesName = contentType.name;
      const folderArch = contentType.default_folder_architecture;

      after(async () => {
        try {
          const driveFolders = await ensureContentDriveFolders(
            seriesName,
            targetUniqueId,
            targetTitle,
            null,
            folderArch
          );
          if (driveFolders?.main_folder_id) {
            await prisma.contentItem.update({
              where: { id: targetId },
              data: { drive_folders: JSON.stringify(driveFolders) },
            });
          }
        } catch (err) {
          console.error("Background Drive folders error on idea assign:", err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      item: savedItem,
      shiftedCount: previewShifts.length,
      previewShifts,
    });
  } catch (error) {
    console.error("Error assigning idea to slot:", error);
    return NextResponse.json({ error: "Failed to assign idea" }, { status: 500 });
  }
}
