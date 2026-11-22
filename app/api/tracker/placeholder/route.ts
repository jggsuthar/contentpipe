import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDynamicUserProfile } from "@/lib/constants/users";
import { generateNextContentId } from "@/lib/id-generator";
import { ensureContentDriveFolders, deleteContentDriveFolder } from "@/lib/google-drive";
import { generateFuturePublishDates, CadenceConfig } from "@/lib/cadence";
import { DriveFolders } from "@/types/database";

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

  const canEdit = isCreator || effectivePermissions.includes("tracker:row:edit_title");
  if (!canEdit) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to add placeholders." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      content_type_id,
      publish_date,
      title,
      collision_strategy = "keep_both", // "displace_existing" | "put_new_next" | "keep_both"
    } = body;

    if (!content_type_id || !publish_date) {
      return NextResponse.json(
        { error: "content_type_id and publish_date are required" },
        { status: 400 }
      );
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: content_type_id },
      include: {
        brand: { select: { name: true } },
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
      },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    const targetDate = new Date(publish_date);
    targetDate.setHours(12, 0, 0, 0); // Noon UTC to avoid timezone shift

    const cleanTitle = typeof title === "string" && title.trim().length > 0 ? title.trim() : null;
    const now = new Date();

    // Check if any existing item is on the chosen target date (Collision Check)
    const existing = await prisma.contentItem.findFirst({
      where: {
        content_type_id,
        publish_date: targetDate,
      },
    });

    // Helper: Find next available open cadence slot not taken by any active item
    const findNextAvailableCadenceSlot = async (afterDate: Date): Promise<Date> => {
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

      const startRef = new Date(afterDate);
      startRef.setDate(startRef.getDate() + 1);
      const futureSlots = generateFuturePublishDates(cadenceConfig, 6, startRef);

      const allActive = await prisma.contentItem.findMany({
        where: { content_type_id, is_archived: false, is_in_idea_bank: false, publish_date: { not: null } },
        select: { publish_date: true },
      });

      const takenKeys = new Set(
        allActive
          .filter((a) => a.publish_date !== null)
          .map((a) => (a.publish_date as Date).toISOString().split("T")[0])
      );

      for (const slot of futureSlots) {
        const slotKey = slot.toISOString().split("T")[0];
        if (!takenKeys.has(slotKey)) {
          slot.setHours(12, 0, 0, 0);
          return slot;
        }
      }

      // Fallback: 7 days after
      const fallback = new Date(afterDate);
      fallback.setDate(fallback.getDate() + 7);
      fallback.setHours(12, 0, 0, 0);
      return fallback;
    };

    let finalPublishDate = targetDate;

    // Handle collision if an existing item is already present
    if (existing) {
      if (collision_strategy === "displace_existing") {
        // Move existing item to next available cadence slot
        const nextSlot = await findNextAvailableCadenceSlot(targetDate);
        await prisma.contentItem.update({
          where: { id: existing.id },
          data: { publish_date: nextSlot },
        });
        finalPublishDate = targetDate;
      } else if (collision_strategy === "put_new_next") {
        // Leave existing item alone, assign next available cadence slot to new item
        finalPublishDate = await findNextAvailableCadenceSlot(targetDate);
      } else {
        // "keep_both": Both items share the exact same publish date
        finalPublishDate = targetDate;
      }
    }

    // Un-skip date in ContentType.skipped_publish_dates if it was previously deleted
    if (contentType.skipped_publish_dates) {
      try {
        const skipped: string[] = JSON.parse(contentType.skipped_publish_dates || "[]");
        const dateKey = finalPublishDate.toISOString().split("T")[0];
        if (skipped.includes(dateKey)) {
          const updatedSkipped = skipped.filter((d) => d !== dateKey);
          await prisma.contentType.update({
            where: { id: contentType.id },
            data: { skipped_publish_dates: JSON.stringify(updatedSkipped) },
          });
        }
      } catch (err) {
        console.error("Error updating skipped_publish_dates:", err);
      }
    }

    let assignedId: string | null = null;
    if (cleanTitle) {
      assignedId = await generateNextContentId(contentType, now);
    }

    // Create the new ContentItem
    const created = await prisma.contentItem.create({
      data: {
        content_type_id,
        title: cleanTitle,
        unique_content_id: assignedId,
        ideation_date: cleanTitle ? now : null,
        publish_date: finalPublishDate,
        is_manual_publish_date: true,
        is_archived: false,
        task_instances: {
          create: contentType.workflow_tasks.map((wt) => {
            const isIdeation = wt.task_name.toLowerCase() === "ideation";
            return {
              task_name: wt.task_name,
              status: cleanTitle && isIdeation ? "done" : "not_done",
              completed_at: cleanTitle && isIdeation ? now : null,
            };
          }),
        },
      },
      include: { task_instances: true },
    });

    // Provision Google Drive folders in background if titled
    if (cleanTitle && assignedId) {
      const targetId = created.id;
      const targetUniqueId = assignedId;
      const targetTitle = cleanTitle;
      const brandName = contentType.brand?.name || null;
      const seriesName = contentType.name;
      const folderArch = contentType.default_folder_architecture;

      after(async () => {
        try {
          const driveFolders = await ensureContentDriveFolders(
            seriesName,
            targetUniqueId,
            targetTitle,
            null,
            folderArch,
            brandName
          );
          if (driveFolders?.main_folder_id) {
            await prisma.contentItem.update({
              where: { id: targetId },
              data: { drive_folders: JSON.stringify(driveFolders) },
            });
          }
        } catch (err) {
          console.error("Background Drive folders generation error:", err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Custom placeholder added successfully",
      item: created,
    });
  } catch (error) {
    console.error("Error adding custom placeholder:", error);
    return NextResponse.json({ error: "Failed to add placeholder" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = session.user.role === "creator";
  const userProfile = await getDynamicUserProfile(session.user.email);
  const effectivePermissions: string[] = isCreator
    ? ["admin:super"]
    : userProfile?.permissions?.effective_permissions || [];

  const canDelete = isCreator || effectivePermissions.includes("tracker:row:edit_title");
  if (!canDelete) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to delete placeholders." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const contentTypeId = searchParams.get("content_type_id");
    const publishDateStr = searchParams.get("publish_date");

    if (!id || !contentTypeId) {
      return NextResponse.json(
        { error: "id and content_type_id are required" },
        { status: 400 }
      );
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: contentTypeId },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    // 1. If it's a real database ContentItem, delete all associated assets
    const isRealDbItem = !id.startsWith("placeholder_");
    let deletedItemDate: string | null = null;

    if (isRealDbItem) {
      const existing = await prisma.contentItem.findUnique({
        where: { id },
      });

      if (existing) {
        deletedItemDate = existing.publish_date
          ? existing.publish_date.toISOString().split("T")[0]
          : null;

        // Delete Google Drive project folder if it exists
        if (existing.drive_folders) {
          try {
            const driveFolders: DriveFolders = JSON.parse(existing.drive_folders);
            if (driveFolders.main_folder_id) {
              await deleteContentDriveFolder(driveFolders.main_folder_id);
            }
          } catch (e) {
            console.error("Error deleting Drive folder on placeholder delete:", e);
          }
        }

        // Return Idea to Idea Bank if assigned
        if (existing.title) {
          try {
            await prisma.ideaBank.updateMany({
              where: {
                title: existing.title,
                is_assigned: true,
              },
              data: {
                is_assigned: false,
              },
            });
          } catch (e) {
            console.error("Error unassigning idea on placeholder delete:", e);
          }
        }

        // Delete database record and task instances (cascade)
        await prisma.contentItem.delete({
          where: { id },
        });
      }
    } else {
      // It's a virtual placeholder: id is `placeholder_YYYY-MM-DD`
      deletedItemDate = id.replace("placeholder_", "");
    }

    // 2. If a cadence date was deleted, add it to `skipped_publish_dates`
    // so the cadence timetable generator does not immediately re-generate an empty slot on this date
    const dateToSkip = deletedItemDate || (publishDateStr ? publishDateStr.split("T")[0] : null);
    if (dateToSkip) {
      try {
        let currentSkipped: string[] = [];
        try {
          currentSkipped = JSON.parse(contentType.skipped_publish_dates || "[]");
        } catch {
          currentSkipped = [];
        }

        if (!currentSkipped.includes(dateToSkip)) {
          currentSkipped.push(dateToSkip);
          await prisma.contentType.update({
            where: { id: contentType.id },
            data: { skipped_publish_dates: JSON.stringify(currentSkipped) },
          });
        }
      } catch (err) {
        console.error("Error recording skipped cadence date:", err);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Placeholder and associated content deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting placeholder:", error);
    return NextResponse.json({ error: "Failed to delete placeholder" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCreator = session.user.role === "creator";
  const userProfile = await getDynamicUserProfile(session.user.email);
  const effectivePermissions: string[] = isCreator
    ? ["admin:super"]
    : userProfile?.permissions?.effective_permissions || [];

  const canEdit =
    isCreator ||
    effectivePermissions.includes("tracker:row:edit_title") ||
    effectivePermissions.includes("tracker:row:edit_publish");

  if (!canEdit) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to update publish dates." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { id, content_type_id, new_publish_date } = body;

    if (!id || !content_type_id || !new_publish_date) {
      return NextResponse.json(
        { error: "id, content_type_id, and new_publish_date are required" },
        { status: 400 }
      );
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: content_type_id },
      include: {
        brand: { select: { name: true } },
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
      },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    const newTargetDate = new Date(new_publish_date);
    newTargetDate.setHours(0, 0, 0, 0);

    const isVirtualPlaceholder = id.startsWith("placeholder_");

    if (!isVirtualPlaceholder) {
      const existing = await prisma.contentItem.findUnique({
        where: { id },
        include: { task_instances: true },
      });

      if (!existing) {
        return NextResponse.json({ error: "Content Item not found" }, { status: 404 });
      }

      if (existing.is_in_idea_bank || !existing.publish_date) {
        return NextResponse.json(
          { error: "Cannot change publish date of an unscheduled Idea Bank item." },
          { status: 400 }
        );
      }

      // Check if publish task is already Done:
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isPastPublish = new Date(existing.publish_date).getTime() <= today.getTime();
      const visibleTasks = contentType.workflow_tasks.filter((t) => !t.is_hidden);
      const publishDef = visibleTasks.find((t) => t.task_name.toLowerCase() === "publish");
      let allPriorDone = true;
      if (publishDef) {
        const publishIdx = visibleTasks.findIndex((t) => t.id === publishDef.id);
        const priorTasks = visibleTasks.slice(0, publishIdx);
        for (const prior of priorTasks) {
          const priorKey = prior.task_name.toLowerCase();
          if (priorKey === "ideation") {
            if (!existing.title || !existing.unique_content_id) {
              allPriorDone = false;
              break;
            }
          } else {
            const inst = existing.task_instances.find((ti) => ti.task_name.toLowerCase() === priorKey);
            if (inst?.status !== "done") {
              allPriorDone = false;
              break;
            }
          }
        }
      }

      const publishInst = existing.task_instances.find(
        (t) => t.task_name.toLowerCase() === "publish"
      );

      if (publishInst?.status === "done" || (allPriorDone && isPastPublish)) {
        return NextResponse.json(
          { error: "Forbidden: Cannot change publish date of an already published content item." },
          { status: 400 }
        );
      }

      // If old date was an autogenerated cadence date (not previously manual),
      // record it in skipped_publish_dates so an empty virtual slot doesn't spawn back
      const oldDateKey = new Date(existing.publish_date).toISOString().split("T")[0];
      let currentSkipped: string[] = [];
      try {
        currentSkipped = JSON.parse(contentType.skipped_publish_dates || "[]");
      } catch {
        currentSkipped = [];
      }

      if (!existing.is_manual_publish_date) {
        if (!currentSkipped.includes(oldDateKey)) {
          currentSkipped.push(oldDateKey);
        }
      }

      // Un-skip new date if present in skipped
      const newDateKey = newTargetDate.toISOString().split("T")[0];
      currentSkipped = currentSkipped.filter((d) => d !== newDateKey);

      await prisma.contentType.update({
        where: { id: contentType.id },
        data: { skipped_publish_dates: JSON.stringify(currentSkipped) },
      });

      // Update ContentItem with new publish date, mark is_manual_publish_date = true
      const updated = await prisma.contentItem.update({
        where: { id },
        data: {
          publish_date: newTargetDate,
          is_manual_publish_date: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Publish date updated and marked as manual.",
        item: updated,
      });
    } else {
      // It is a virtual placeholder: id is `placeholder_YYYY-MM-DD`
      const oldDateKey = id.replace("placeholder_", "");
      let currentSkipped: string[] = [];
      try {
        currentSkipped = JSON.parse(contentType.skipped_publish_dates || "[]");
      } catch {
        currentSkipped = [];
      }

      if (!currentSkipped.includes(oldDateKey)) {
        currentSkipped.push(oldDateKey);
      }

      const newDateKey = newTargetDate.toISOString().split("T")[0];
      currentSkipped = currentSkipped.filter((d) => d !== newDateKey);

      await prisma.contentType.update({
        where: { id: contentType.id },
        data: { skipped_publish_dates: JSON.stringify(currentSkipped) },
      });

      // Create new ContentItem in database with manual status
      const newItem = await prisma.contentItem.create({
        data: {
          content_type_id: contentType.id,
          title: "",
          publish_date: newTargetDate,
          is_manual_publish_date: true,
          task_instances: {
            create: contentType.workflow_tasks.map((task) => ({
              task_name: task.task_name,
              status: "not_done",
            })),
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "Virtual placeholder converted to manual scheduled slot.",
        item: newItem,
      });
    }
  } catch (error: any) {
    console.error("Error updating publish date:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update publish date" },
      { status: 500 }
    );
  }
}
