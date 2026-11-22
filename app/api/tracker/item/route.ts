import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDynamicUserProfile } from "@/lib/constants/users";
import { generateNextContentId } from "@/lib/id-generator";
import { ensureContentDriveFolders, deleteContentDriveFolder } from "@/lib/google-drive";
import { DriveFolders } from "@/types/database";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RBAC: Verify atomic permission 'tracker:row:edit_title' or Master Creator
  const isCreator = session.user.role === "creator";
  const userProfile = await getDynamicUserProfile(session.user.email);
  const effectivePermissions: string[] = isCreator
    ? ["admin:super"]
    : userProfile?.permissions?.effective_permissions || [];

  const canInputIdeation =
    isCreator || effectivePermissions.includes("tracker:row:edit_title");
  if (!canInputIdeation) {
    return NextResponse.json(
      { error: "Forbidden: requires 'tracker:row:edit_title' permission." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      content_type_id,
      item_id, // existing item id or placeholder id
      publish_date,
      title,
      remarks,
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
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
      },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    // Check if this is an existing database record
    const isRealDbId = item_id && !item_id.startsWith("placeholder_");
    let existingItem = isRealDbId
      ? await prisma.contentItem.findUnique({
          where: { id: item_id },
          include: { task_instances: true },
        })
      : null;

    if (!existingItem) {
      // Also check if an item with this publish_date already exists for this content type
      const targetDate = new Date(publish_date);
      existingItem = await prisma.contentItem.findFirst({
        where: {
          content_type_id,
          publish_date: targetDate,
        },
        include: { task_instances: true },
      });
    }

    const cleanTitle = typeof title === "string" ? title.trim() : null;

    // -------------------------------------------------------------
    // Case 1: Clearing / Deleting Title (Reversibility Rule & Drive Purge)
    // -------------------------------------------------------------
    // Per SPEC.md Section 3.1 item 2:
    // "If the Creator clears/deletes the title text from a placeholder,
    // both the Content ID and the Ideation 'Done' mark disappear immediately,
    // and that ID number is freed up to be reused."
    // Also purges all Google Drive folders/files created for this content ID.
    if (!cleanTitle) {
      if (existingItem) {
        // Delete Google Drive project folder if it exists
        if (existingItem.drive_folders) {
          try {
            const driveFolders: DriveFolders = JSON.parse(existingItem.drive_folders);
            if (driveFolders.main_folder_id) {
              await deleteContentDriveFolder(driveFolders.main_folder_id);
            }
          } catch (e) {
            console.error("Error deleting Drive folder on clear title:", e);
          }
        }

        // Return Idea to Idea Bank if it was assigned
        if (existingItem.title) {
          try {
            await prisma.ideaBank.updateMany({
              where: {
                title: existingItem.title,
                is_assigned: true,
              },
              data: {
                is_assigned: false,
              },
            });
          } catch (e) {
            console.error("Error unassigning idea on clear title:", e);
          }
        }

        // Reset item back to an open placeholder
        const updated = await prisma.contentItem.update({
          where: { id: existingItem.id },
          data: {
            title: null,
            unique_content_id: null,
            ideation_date: null,
            drive_folders: "{}",
            raw_assets: "[]",
            raw_footage_uploaded: false,
            remarks: remarks !== undefined ? remarks : existingItem.remarks,
          },
          include: { task_instances: true },
        });

        // Reset Ideation task back to not_done
        await prisma.taskInstance.updateMany({
          where: {
            content_item_id: existingItem.id,
            task_name: { equals: "Ideation" },
          },
          data: {
            status: "not_done",
            completed_at: null,
          },
        });

        return NextResponse.json({
          ...updated,
          is_placeholder: true,
          custom_action_items: JSON.parse(updated.custom_action_items || "[]"),
        });
      }

      // If it didn't even exist in DB, it remains an open placeholder
      return NextResponse.json({
        id: item_id,
        is_placeholder: true,
        title: "",
        unique_content_id: null,
        publish_date,
      });
    }

    // -------------------------------------------------------------
    // Case 2: Title Entry & Unique Content ID Generation
    // -------------------------------------------------------------
    const now = new Date();

    if (existingItem) {
      // If item already had an ID, keep it; if not, generate a new Unique Content ID
      let assignedId = existingItem.unique_content_id;
      let ideationDate = existingItem.ideation_date || now;

      if (!assignedId) {
        assignedId = await generateNextContentId(contentType, now);
        ideationDate = now;
      }

      const updated = await prisma.contentItem.update({
        where: { id: existingItem.id },
        data: {
          title: cleanTitle,
          unique_content_id: assignedId,
          ideation_date: ideationDate,
          remarks: remarks !== undefined ? remarks : existingItem.remarks,
        },
        include: { task_instances: true },
      });

      // Ensure Ideation task instance is marked DONE automatically
      const ideationTask = existingItem.task_instances.find(
        (t) => t.task_name.toLowerCase() === "ideation"
      );

      if (ideationTask) {
        await prisma.taskInstance.update({
          where: { id: ideationTask.id },
          data: { status: "done", completed_at: now },
        });
      } else {
        await prisma.taskInstance.create({
          data: {
            content_item_id: updated.id,
            task_name: "Ideation",
            status: "done",
            completed_at: now,
          },
        });
      }

      // Ensure other intermediate workflow tasks exist with default 'not_done' in one query
      const existingTaskNames = new Set(
        existingItem.task_instances.map((t) => t.task_name.toLowerCase())
      );
      const missingTaskRows = contentType.workflow_tasks
        .filter(
          (wt) =>
            wt.task_name.toLowerCase() !== "ideation" &&
            !existingTaskNames.has(wt.task_name.toLowerCase())
        )
        .map((wt) => ({
          content_item_id: updated.id,
          task_name: wt.task_name,
          status: "not_done",
        }));

      if (missingTaskRows.length > 0) {
        await prisma.taskInstance.createMany({
          data: missingTaskRows,
        });
      }

      // Provision Google Drive folders in the background after returning response immediately
      if (!existingItem.unique_content_id && assignedId) {
        const seriesName = contentType.name;
        const folderArch = contentType.default_folder_architecture;
        const targetItemId = updated.id;
        const targetUniqueId = assignedId;
        const targetTitle = cleanTitle;

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
                where: { id: targetItemId },
                data: { drive_folders: JSON.stringify(driveFolders) },
              });
            }
          } catch (err) {
            console.error("Background Drive folders generation error:", err);
          }
        });
      }

      return NextResponse.json({
        ...updated,
        is_placeholder: false,
        custom_action_items: JSON.parse(updated.custom_action_items || "[]"),
      });
    }

    // Creating brand new ContentItem record from placeholder
    const nextUniqueId = await generateNextContentId(contentType, now);

    const created = await prisma.contentItem.create({
      data: {
        content_type_id,
        title: cleanTitle,
        unique_content_id: nextUniqueId,
        ideation_date: now,
        publish_date: new Date(publish_date),
        remarks: remarks || null,
        task_instances: {
          create: contentType.workflow_tasks.map((wt) => ({
            task_name: wt.task_name,
            status: wt.task_name.toLowerCase() === "ideation" ? "done" : "not_done",
            completed_at: wt.task_name.toLowerCase() === "ideation" ? now : null,
          })),
        },
      },
      include: { task_instances: true },
    });

    // Provision Google Drive folder architecture in background so UI responds instantly
    const createdId = created.id;
    const seriesName = contentType.name;
    const folderArch = contentType.default_folder_architecture;

    after(async () => {
      try {
        const driveFolders = await ensureContentDriveFolders(
          seriesName,
          nextUniqueId,
          cleanTitle,
          null,
          folderArch
        );
        if (driveFolders?.main_folder_id) {
          await prisma.contentItem.update({
            where: { id: createdId },
            data: { drive_folders: JSON.stringify(driveFolders) },
          });
        }
      } catch (err) {
        console.error("Background Drive folders generation error:", err);
      }
    });

    return NextResponse.json({
      ...created,
      is_placeholder: false,
      custom_action_items: JSON.parse(created.custom_action_items || "[]"),
    });
  } catch (error) {
    console.error("Error saving tracker item:", error);
    return NextResponse.json({ error: "Failed to save content item" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { item_id, published_url } = body;

    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }

    const updated = await prisma.contentItem.update({
      where: { id: item_id },
      data: {
        published_url: published_url !== undefined ? (published_url?.trim() || null) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      published_url: updated.published_url,
    });
  } catch (error) {
    console.error("Error updating content item published URL:", error);
    return NextResponse.json({ error: "Failed to update content URL" }, { status: 500 });
  }
}
