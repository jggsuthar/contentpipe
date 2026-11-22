import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { getRoleConfigForContentType } from "@/lib/permissions";
import { ensureContentDriveFolders, checkCreatorDriveFullAccess } from "@/lib/google-drive";
import { DriveFolders, RawAssetItem } from "@/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contentId } = await params;
    const userEmail = session.user.email.toLowerCase().trim();
    const isCreator = isCreatorEmail(userEmail) || session.user.role === "creator";

    // 0. Enforce Google Drive Full Permissions for Creator
    if (isCreator) {
      const driveAccess = await checkCreatorDriveFullAccess();
      if (!driveAccess.hasFullScope) {
        return NextResponse.json(
          {
            error: "DRIVE_AUTHORIZATION_REQUIRED",
            message: "Full Google Drive authorization is required to access the Content Production Hub.",
            needsDriveAuth: true,
          },
          { status: 403 }
        );
      }
    }

    // 1. Locate Content Item
    const contentItem = await prisma.contentItem.findFirst({
      where: {
        OR: [{ unique_content_id: contentId }, { id: contentId }],
      },
      include: {
        brand: { select: { id: true, name: true, color: true } },
        content_type: {
          include: {
            brand: { select: { id: true, name: true, color: true } },
            workflow_tasks: {
              orderBy: { sequence_order: "asc" },
            },
            misc_tasks: true,
          },
        },
        task_instances: true,
        submissions: {
          include: {
            submitted_by: { select: { id: true, name: true, role_title: true } },
            comments: { orderBy: { created_at: "asc" } },
          },
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    // 2. Evaluate Granular Permissions
    let canUploadRaw = isCreator;
    let canDeleteRaw = isCreator;
    let canSubmit = isCreator;
    let canApprove = isCreator;
    let assignedTask = isCreator ? "Edit" : "";
    let folderPermissions: Record<string, "none" | "view" | "edit"> = {};
    let submissionsVisible = true;
    let visibleSubmissions = contentItem.submissions;

    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });

      if (!dbRole) {
        return NextResponse.json({ error: "Role not configured in database" }, { status: 403 });
      }

      let assignedTypes: string[] = [];
      try {
        assignedTypes = JSON.parse(dbRole.assigned_content_types || "[]");
      } catch {
        assignedTypes = [];
      }

      if (
        contentItem.content_type_id &&
        assignedTypes.length > 0 &&
        !assignedTypes.includes("ALL") &&
        !assignedTypes.includes(contentItem.content_type_id) &&
        !(contentItem.content_type?.name && assignedTypes.includes(contentItem.content_type.name))
      ) {
        return NextResponse.json(
          { error: "Access denied: Not assigned to this Content Series" },
          { status: 403 }
        );
      }

      let permissions: any = {};
      try {
        permissions = JSON.parse(dbRole.permissions || "{}");
      } catch {
        permissions = {};
      }

      const contentConfig = getRoleConfigForContentType(permissions, contentItem.content_type_id);

      folderPermissions = contentConfig.content?.folders || {};
      const subPerm = contentConfig.content?.submission;

      // Evaluate deliverable submission permissions
      if (subPerm) {
        if (subPerm.disabled) {
          submissionsVisible = false;
          canSubmit = false;
          visibleSubmissions = [];
        } else {
          canSubmit = Boolean(
            subPerm.can_submit === true ||
            contentConfig.responsibilities?.content_submission?.enabled === true
          );
          submissionsVisible = Boolean(
            subPerm.can_view_own ||
            subPerm.can_view_others ||
            canSubmit
          );

          visibleSubmissions = contentItem.submissions.filter((sub) => {
            const isOwn = sub.submitted_by_role_id === dbRole.id;
            if (isOwn && subPerm.can_view_own) return true;
            if (subPerm.can_view_others) {
              const allowedIds = subPerm.allowed_other_role_ids || [];
              if (sub.submitted_by_role_id && allowedIds.includes(sub.submitted_by_role_id)) {
                return true;
              }
              if (!sub.submitted_by_role_id && (allowedIds.includes("creator") || allowedIds.includes("ALL"))) {
                return true;
              }
            }
            return false;
          });
        }
      } else {
        // Fallback to legacy permissions
        canSubmit = Boolean(
          contentConfig.content?.can_submit === true ||
          contentConfig.responsibilities?.content_submission?.enabled === true ||
          permissions.can_submit === true
        );
        submissionsVisible = true;
        visibleSubmissions = contentItem.submissions;
      }

      // Has edit permission if at least one folder is configured as 'edit'
      canUploadRaw = Object.values(folderPermissions).some((lvl) => lvl === "edit");
      canDeleteRaw = canUploadRaw;
      canApprove = false;
      assignedTask =
        contentConfig.responsibilities?.content_submission?.target_task_name ||
        permissions.submission_task ||
        "Edit";
    }

    // 3. Ensure Automated Google Drive Folders Hierarchy
    let existingFolders: DriveFolders | null = null;
    try {
      existingFolders = JSON.parse(contentItem.drive_folders || "{}");
    } catch {
      existingFolders = null;
    }

    const driveFolders = await ensureContentDriveFolders(
      contentItem.content_type?.name || "_Idea Bank",
      contentItem.unique_content_id || contentItem.id,
      contentItem.title || "Untitled Video",
      existingFolders,
      contentItem.content_type?.default_folder_architecture || null,
      contentItem.content_type?.brand?.name || contentItem.brand?.name || null
    );

    // Persist folder IDs if newly created or if folder architecture has expanded
    if (
      !existingFolders?.main_folder_id ||
      JSON.stringify(existingFolders?.folder_ids || {}) !== JSON.stringify(driveFolders?.folder_ids || {})
    ) {
      await prisma.contentItem.update({
        where: { id: contentItem.id },
        data: { drive_folders: JSON.stringify(driveFolders) },
      });
    }

    // 4. Parse Raw Assets
    let rawAssets: RawAssetItem[] = [];
    try {
      rawAssets = JSON.parse(contentItem.raw_assets || "[]");
    } catch {
      rawAssets = [];
    }

    // 5. Feedback Categories
    const creatorSettings = await prisma.creatorSettings.findFirst();
    let feedbackCategories = [
      "Pacing / Dead Air",
      "Audio / SFX",
      "B-Roll / Visuals",
      "Typography / Text",
      "Retention Hook",
      "Brand SOP Miss",
    ];
    if (creatorSettings?.feedback_categories) {
      try {
        feedbackCategories = JSON.parse(creatorSettings.feedback_categories);
      } catch {
        // fallback to default
      }
    }

    return NextResponse.json({
      contentItem: {
        id: contentItem.id,
        unique_content_id: contentItem.unique_content_id,
        title: contentItem.title || "Untitled Video",
        publish_date: contentItem.publish_date,
        is_in_idea_bank: contentItem.is_in_idea_bank,
        raw_footage_uploaded: Boolean((contentItem as any).raw_footage_uploaded),
        content_type: contentItem.content_type
          ? {
              id: contentItem.content_type.id,
              name: contentItem.content_type.name,
              prefix: contentItem.content_type.prefix,
              brand: contentItem.content_type.brand || contentItem.brand || null,
            }
          : {
              id: null,
              name: "Idea Bank (Unassigned Pipe)",
              prefix: "ID-",
              brand: contentItem.brand || null,
            },
        task_instances: contentItem.task_instances,
      },
      driveFolders,
      rawAssets,
      submissions: visibleSubmissions,
      workflowTasks: contentItem.content_type
        ? [
            ...contentItem.content_type.workflow_tasks.map((t) => t.task_name),
            ...contentItem.content_type.misc_tasks.map((m) => m.task_name),
          ]
        : ["Edit", "Thumbnail"],
      feedbackCategories,
      userPermissions: {
        canUploadRaw,
        canDeleteRaw,
        canSubmit,
        canApprove,
        isCreator,
        assignedTask,
        userEmail,
        folderPermissions,
        submissionsVisible,
      },
    });
  } catch (error) {
    console.error("Error loading Content Hub:", error);
    return NextResponse.json({ error: "Failed to load content hub" }, { status: 500 });
  }
}
