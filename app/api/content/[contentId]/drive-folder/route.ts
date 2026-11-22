import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { createDriveSubfolder, ensureContentDriveFolders } from "@/lib/google-drive";
import { DriveFolders } from "@/types/database";

export async function POST(
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
        content_type: true,
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

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
        contentItem.content_type?.default_folder_architecture || null
      );
      await (prisma.contentItem as any).update({
        where: { id: contentItem.id },
        data: { drive_folders: JSON.stringify(driveFolders) },
      });
    }

    const body = await req.json();
    const { name, parentFolderId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const targetParentId = parentFolderId || driveFolders.raw_footage_id;
    if (!targetParentId) {
      return NextResponse.json({ error: "Target Google Drive folder not configured" }, { status: 500 });
    }

    // Permission check: Creator or Team Member with 'edit' access
    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });
      if (!dbRole) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      let parsedPerms: any = {};
      try {
        parsedPerms = JSON.parse(dbRole.permissions || "{}");
      } catch {
        parsedPerms = {};
      }

      const userFolderPermissions: Record<string, "none" | "view" | "edit"> =
        parsedPerms.content?.folders || {};

      let topFolderName = "";
      if (targetParentId === driveFolders.raw_footage_id) {
        topFolderName = "Raw_Footage";
      } else if (driveFolders.folder_ids) {
        const match = Object.entries(driveFolders.folder_ids).find(([, id]) => id === targetParentId);
        if (match) topFolderName = match[0];
      }

      const hasEditAccess =
        (topFolderName && userFolderPermissions[topFolderName] === "edit") ||
        parsedPerms.can_edit === true;

      if (!hasEditAccess) {
        return NextResponse.json(
          { error: "Forbidden: You do not have edit permission to create folders here" },
          { status: 403 }
        );
      }
    }

    const newFolder = await createDriveSubfolder(name.trim(), targetParentId);

    return NextResponse.json({
      success: true,
      folder: newFolder,
    });
  } catch (error) {
    console.error("Error creating Drive subfolder:", error);
    return NextResponse.json({ error: "Failed to create Drive subfolder" }, { status: 500 });
  }
}
