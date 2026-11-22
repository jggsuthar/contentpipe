import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { listDriveFolderContents, ensureContentDriveFolders } from "@/lib/google-drive";
import { DriveFolders } from "@/types/database";

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

    const contentItem = await prisma.contentItem.findFirst({
      where: {
        OR: [{ unique_content_id: contentId }, { id: contentId }],
      },
      include: {
        brand: { select: { name: true } },
        content_type: {
          include: {
            brand: { select: { name: true } },
          },
        },
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    let userFolderPermissions: Record<string, "none" | "view" | "edit"> = {};
    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });
      if (!dbRole) {
        return NextResponse.json({ error: "Role not authorized" }, { status: 403 });
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
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      let parsedPerms: any = {};
      try {
        parsedPerms = JSON.parse(dbRole.permissions || "{}");
      } catch {
        parsedPerms = {};
      }
      userFolderPermissions = parsedPerms.content?.folders || {};
    }

    // Resolve Drive folders
    let driveFolders: DriveFolders = {};
    try {
      driveFolders = JSON.parse(contentItem.drive_folders || "{}");
    } catch {
      driveFolders = {};
    }

    if (!driveFolders.raw_footage_id) {
      driveFolders = await ensureContentDriveFolders(
        contentItem.content_type?.name || "_Idea Bank",
        contentItem.unique_content_id || contentItem.id,
        contentItem.title || "Untitled Video",
        driveFolders,
        contentItem.content_type?.default_folder_architecture || null,
        contentItem.content_type?.brand?.name || contentItem.brand?.name || null
      );
      await (prisma.contentItem as any).update({
        where: { id: contentItem.id },
        data: { drive_folders: JSON.stringify(driveFolders) },
      });
    }

    const { searchParams } = new URL(req.url);
    const targetFolderId =
      searchParams.get("folderId") || driveFolders.main_folder_id || driveFolders.raw_footage_id;

    if (!targetFolderId) {
      return NextResponse.json(
        { success: true, folderId: "", folderName: "Content_Folder", files: [], folderAccess: isCreator ? "edit" : "none" },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    }

    const result = await listDriveFolderContents(targetFolderId);

    const isRootContentFolder = targetFolderId === driveFolders.main_folder_id;
    const defaultName = isRootContentFolder
      ? (contentItem.title || contentItem.unique_content_id || "Content Folder")
      : targetFolderId === driveFolders.raw_footage_id
      ? "Raw_Footage"
      : "Folder";

    let folderAccess: "none" | "view" | "edit" = isCreator ? "edit" : "view";
    let filteredFiles = result.files;

    if (!isCreator) {
      if (isRootContentFolder) {
        // At root content level: filter out any subfolder whose permission is "none"
        folderAccess = "view";
        filteredFiles = result.files.filter((f) => {
          if (!f.isFolder) return true;
          const perm = userFolderPermissions[f.name];
          // If explicitly configured, honor it. If folders matrix configured, default unassigned to none
          if (perm === "none") return false;
          return perm === "view" || perm === "edit";
        });
      } else {
        // Find which top-level folder targetFolderId is
        let topFolderName = "";
        if (targetFolderId === driveFolders.raw_footage_id) {
          topFolderName = "Raw_Footage";
        } else if (driveFolders.folder_ids) {
          const match = Object.entries(driveFolders.folder_ids).find(([, id]) => id === targetFolderId);
          if (match) topFolderName = match[0];
        }

        if (!topFolderName) {
          topFolderName = result.folderName || defaultName;
        }

        const perm = userFolderPermissions[topFolderName] || "none";
        if (perm === "none") {
          return NextResponse.json(
            { error: `Forbidden: You do not have permission to view folder "${topFolderName}"` },
            { status: 403 }
          );
        }
        folderAccess = perm;
      }
    }

    return NextResponse.json(
      {
        success: true,
        folderId: targetFolderId,
        folderName: result.folderName || defaultName,
        files: filteredFiles,
        folderAccess,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Error listing Drive files:", error);
    return NextResponse.json({ error: "Failed to list Drive files" }, { status: 500 });
  }
}
