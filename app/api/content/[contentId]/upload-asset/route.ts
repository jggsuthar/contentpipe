import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { uploadBufferToDrive, ensureContentDriveFolders } from "@/lib/google-drive";
import { DriveFolders, DriveFileItem, RawAssetItem } from "@/types/database";

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetFolderId = (formData.get("folderId") as string) || driveFolders.raw_footage_id;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!targetFolderId) {
      return NextResponse.json({ error: "Target Google Drive folder not configured" }, { status: 500 });
    }

    // Permission enforcement: Creator or Team Member with 'edit' access on this folder
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
      if (targetFolderId === driveFolders.raw_footage_id) {
        topFolderName = "Raw_Footage";
      } else if (driveFolders.folder_ids) {
        const match = Object.entries(driveFolders.folder_ids).find(([, id]) => id === targetFolderId);
        if (match) topFolderName = match[0];
      }

      const hasEditAccess =
        (topFolderName && userFolderPermissions[topFolderName] === "edit") ||
        parsedPerms.can_edit === true;

      if (!hasEditAccess) {
        return NextResponse.json(
          { error: "Forbidden: You do not have edit/upload permission for this folder" },
          { status: 403 }
        );
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadRes = await uploadBufferToDrive(
      targetFolderId,
      file.name,
      file.type || "application/octet-stream",
      buffer
    );

    // Also sync to raw_assets JSON array for backwards-compatibility
    let rawAssets: RawAssetItem[] = [];
    try {
      rawAssets = JSON.parse(contentItem.raw_assets || "[]");
    } catch {
      rawAssets = [];
    }

    const newRawAsset: RawAssetItem = {
      id: uploadRes.fileId,
      name: file.name,
      file_url: uploadRes.viewUrl,
      drive_file_id: uploadRes.fileId,
      size_bytes: uploadRes.sizeBytes,
      folder_type: "raw",
      uploaded_by: userEmail,
      uploaded_at: new Date().toISOString(),
    };

    rawAssets.push(newRawAsset);
    await (prisma.contentItem as any).update({
      where: { id: contentItem.id },
      data: { raw_assets: JSON.stringify(rawAssets) },
    });

    const fileItem: DriveFileItem = {
      id: uploadRes.fileId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      isFolder: false,
      sizeBytes: uploadRes.sizeBytes,
      webViewLink: uploadRes.viewUrl,
      directDownloadUrl: uploadRes.directDownloadUrl,
      createdTime: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      file: fileItem,
    });
  } catch (error) {
    console.error("Error uploading asset to Drive:", error);
    return NextResponse.json({ error: "Failed to upload asset" }, { status: 500 });
  }
}
