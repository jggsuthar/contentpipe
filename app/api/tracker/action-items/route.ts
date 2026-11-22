import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { item_id, text, toggle_id } = body;

    // Check specific micro-action permission based on payload
    const requiredPermission = toggle_id
      ? ("tracker:action_item:resolve" as const)
      : ("tracker:action_item:create" as const);

    const guard = await verifyPermission(requiredPermission);
    if (!guard.authorized) return guard.response;

    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }

    const item = await prisma.contentItem.findUnique({
      where: { id: item_id },
    });

    if (!item) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    let actionItems: { id: string; text: string; is_closed: boolean; created_at: string }[] = [];
    try {
      actionItems = JSON.parse(item.custom_action_items || "[]");
    } catch {
      actionItems = [];
    }

    if (toggle_id) {
      // Toggle existing item
      actionItems = actionItems.map((ai) =>
        ai.id === toggle_id ? { ...ai, is_closed: !ai.is_closed } : ai
      );
    } else if (text && text.trim()) {
      // Add new action item
      actionItems.push({
        id: `ai_${Date.now()}`,
        text: text.trim(),
        is_closed: false,
        created_at: new Date().toISOString(),
      });
    }

    const updated = await prisma.contentItem.update({
      where: { id: item_id },
      data: {
        custom_action_items: JSON.stringify(actionItems),
      },
    });

    return NextResponse.json({
      success: true,
      custom_action_items: actionItems,
    });
  } catch (error) {
    console.error("Error managing custom action items:", error);
    return NextResponse.json({ error: "Failed to update action items" }, { status: 500 });
  }
}
