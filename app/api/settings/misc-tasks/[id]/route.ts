import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCreatorApi } from "@/lib/api-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyCreatorApi();
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.task_name === "string" && body.task_name.trim()) {
      data.task_name = body.task_name.trim();
    }

    const updated = await prisma.miscTask.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating misc task:", error);
    return NextResponse.json(
      { error: "Failed to update misc task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyCreatorApi();
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    await prisma.miscTask.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Error deleting misc task:", error);
    return NextResponse.json(
      { error: "Failed to delete misc task" },
      { status: 500 }
    );
  }
}
