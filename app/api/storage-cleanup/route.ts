import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deleteDriveFile } from "@/lib/google-drive";
import { RawAssetItem } from "@/types/database";
import { verifyPermission } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const guard = await verifyPermission("storage:cleanup_trigger");
  if (!guard.authorized) return guard.response;

  try {
    // 1. Fetch all scheduled content items sorted by Publish Date ASC (oldest first per SPEC.md Section 6.4)
    const contentItems = await prisma.contentItem.findMany({
      where: {
        is_in_idea_bank: false,
        publish_date: { not: null },
      },
      orderBy: { publish_date: "asc" },
      include: {
        content_type: {
          select: {
            id: true,
            name: true,
            brand_id: true,
            brand: { select: { id: true, name: true, color: true } },
          },
        },
        submissions: {
          select: {
            id: true,
            version: true,
            status: true,
            file_name: true,
            file_size_bytes: true,
            drive_file_id: true,
          },
        },
      },
    });

    let totalDriveUsageBytes = 0;

    const items = contentItems.map((item) => {
      let rawAssets: RawAssetItem[] = [];
      try {
        rawAssets = JSON.parse(item.raw_assets || "[]");
      } catch {
        rawAssets = [];
      }

      // Raw footage size: assets tagged 'raw' or 'b_roll'
      const rawSizeBytes = rawAssets.reduce((sum, a) => sum + (a.size_bytes || 0), 0);

      // Draft iterations size: submissions that are NOT approved
      const draftSubmissions = item.submissions.filter((s) => s.status !== "approved");
      const draftsSizeBytes = draftSubmissions.reduce(
        (sum, s) => sum + (s.file_size_bytes || 0),
        0
      );

      // Final exports size: approved submissions
      const approvedSubmissions = item.submissions.filter((s) => s.status === "approved");
      const finalSizeBytes = approvedSubmissions.reduce(
        (sum, s) => sum + (s.file_size_bytes || 0),
        0
      );

      const totalItemBytes = rawSizeBytes + draftsSizeBytes + finalSizeBytes;
      totalDriveUsageBytes += totalItemBytes;

      let driveFolders = {};
      try {
        driveFolders = JSON.parse(item.drive_folders || "{}");
      } catch {
        driveFolders = {};
      }

      return {
        id: item.id,
        unique_content_id: item.unique_content_id,
        title: item.title || "Untitled Video",
        publish_date: item.publish_date,
        is_archived: item.is_archived,
        content_type_id: item.content_type?.id || null,
        content_type_name: item.content_type?.name || "Idea Bank",
        brand_id: item.content_type?.brand?.id || item.content_type?.brand_id || item.brand_id || null,
        brand_name: item.content_type?.brand?.name || null,
        brand_color: item.content_type?.brand?.color || null,
        raw_assets_count: rawAssets.length,
        raw_size_bytes: rawSizeBytes,
        drafts_count: draftSubmissions.length,
        drafts_size_bytes: draftsSizeBytes,
        final_count: approvedSubmissions.length,
        final_size_bytes: finalSizeBytes,
        total_size_bytes: totalItemBytes,
        drive_folders: driveFolders,
      };
    });

    return NextResponse.json({
      items,
      totalDriveUsageBytes,
    });
  } catch (error) {
    console.error("Error fetching storage cleanup data:", error);
    return NextResponse.json({ error: "Failed to load storage data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("storage:cleanup_trigger");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const { content_item_id, target } = body; // target: "raw_footage" | "draft_iterations" | "final_export"

    if (!content_item_id || !target) {
      return NextResponse.json(
        { error: "content_item_id and target are required" },
        { status: 400 }
      );
    }

    const item = await prisma.contentItem.findUnique({
      where: { id: content_item_id },
      include: {
        submissions: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    let deletedBytes = 0;

    if (target === "raw_footage") {
      let rawAssets: RawAssetItem[] = [];
      try {
        rawAssets = JSON.parse(item.raw_assets || "[]");
      } catch {
        rawAssets = [];
      }

      // Delete Drive files for raw assets
      for (const asset of rawAssets) {
        if (asset.drive_file_id) {
          await deleteDriveFile(asset.drive_file_id);
        }
        deletedBytes += asset.size_bytes || 0;
      }

      // Clear raw assets in DB
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { raw_assets: "[]" },
      });
    } else if (target === "draft_iterations") {
      const drafts = item.submissions.filter((s) => s.status !== "approved");
      for (const draft of drafts) {
        if (draft.drive_file_id) {
          await deleteDriveFile(draft.drive_file_id);
        }
        deletedBytes += draft.file_size_bytes || 0;
        await prisma.submission.delete({
          where: { id: draft.id },
        });
      }
    } else if (target === "final_export") {
      const finals = item.submissions.filter((s) => s.status === "approved");
      for (const finalSub of finals) {
        if (finalSub.drive_file_id) {
          await deleteDriveFile(finalSub.drive_file_id);
        }
        deletedBytes += finalSub.file_size_bytes || 0;
        await prisma.submission.delete({
          where: { id: finalSub.id },
        });
      }
    } else {
      return NextResponse.json({ error: "Invalid deletion target" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deleted_bytes: deletedBytes,
      target,
    });
  } catch (error) {
    console.error("Error executing storage cleanup:", error);
    return NextResponse.json({ error: "Failed to execute cleanup" }, { status: 500 });
  }
}
