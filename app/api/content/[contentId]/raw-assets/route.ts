import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { deleteDriveFile } from "@/lib/google-drive";
import { RawAssetItem } from "@/types/database";

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
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action = "add" } = body;

    let rawAssets: RawAssetItem[] = [];
    try {
      rawAssets = JSON.parse(contentItem.raw_assets || "[]");
    } catch {
      rawAssets = [];
    }

    if (action === "add") {
      if (!isCreator) {
        return NextResponse.json({ error: "Only Creator can upload raw footage" }, { status: 403 });
      }

      const { name, file_url, drive_file_id, size_bytes = 0, folder_type = "raw" } = body;
      if (!name) {
        return NextResponse.json({ error: "File name is required" }, { status: 400 });
      }

      const newAsset: RawAssetItem = {
        id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name,
        file_url: file_url || "",
        drive_file_id: drive_file_id || "",
        size_bytes: Number(size_bytes) || 0,
        folder_type: folder_type === "b_roll" ? "b_roll" : "raw",
        uploaded_by: userEmail,
        uploaded_at: new Date().toISOString(),
      };

      rawAssets.push(newAsset);
    } else if (action === "delete") {
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
        const hasAnyEdit =
          Object.values(userFolderPermissions).some((lvl) => lvl === "edit") ||
          parsedPerms.can_edit === true;
        if (!hasAnyEdit) {
          return NextResponse.json(
            { error: "Forbidden: You do not have permission to delete files" },
            { status: 403 }
          );
        }
      }

      const { asset_id, drive_file_id } = body;
      const targetFileId = drive_file_id || rawAssets.find((a) => a.id === asset_id)?.drive_file_id || asset_id;
      if (targetFileId) {
        await deleteDriveFile(targetFileId);
      }
      rawAssets = rawAssets.filter((a) => a.id !== asset_id && a.drive_file_id !== targetFileId);
    }

    await prisma.contentItem.update({
      where: { id: contentItem.id },
      data: { raw_assets: JSON.stringify(rawAssets) },
    });

    return NextResponse.json({
      success: true,
      rawAssets,
    });
  } catch (error) {
    console.error("Error managing raw assets:", error);
    return NextResponse.json({ error: "Failed to manage raw assets" }, { status: 500 });
  }
}
