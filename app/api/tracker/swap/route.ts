import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("tracker:row:move_slot");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const {
      source_item_id,
      target_item_id,
      target_publish_date,
      content_type_id,
    } = body;

    if (!source_item_id) {
      return NextResponse.json({ error: "source_item_id is required" }, { status: 400 });
    }

    const sourceItem = await prisma.contentItem.findUnique({
      where: { id: source_item_id },
    });

    if (!sourceItem) {
      return NextResponse.json({ error: "Source item not found" }, { status: 404 });
    }

    // Check if target is an existing DB record
    const isTargetRealDbId = target_item_id && !target_item_id.startsWith("placeholder_");
    const targetItem = isTargetRealDbId
      ? await prisma.contentItem.findUnique({ where: { id: target_item_id } })
      : null;

    if (targetItem) {
      // Both are DB records -> Swap their publish dates
      const sourceDate = sourceItem.publish_date;
      const destDate = targetItem.publish_date;

      await prisma.$transaction([
        prisma.contentItem.update({
          where: { id: sourceItem.id },
          data: { publish_date: destDate },
        }),
        prisma.contentItem.update({
          where: { id: targetItem.id },
          data: { publish_date: sourceDate },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: "Swapped video contents between slots successfully",
      });
    }

    // Target is an empty placeholder slot -> Move source item to target publish date
    if (!target_publish_date) {
      return NextResponse.json(
        { error: "target_publish_date is required when moving to empty slot" },
        { status: 400 }
      );
    }

    const updated = await prisma.contentItem.update({
      where: { id: sourceItem.id },
      data: {
        publish_date: new Date(target_publish_date),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Moved video item to empty placeholder slot successfully",
      item: updated,
    });
  } catch (error) {
    console.error("Error swapping tracker slots:", error);
    return NextResponse.json({ error: "Failed to swap tracker slots" }, { status: 500 });
  }
}
