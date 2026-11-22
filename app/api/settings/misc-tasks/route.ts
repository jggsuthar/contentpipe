import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCreatorApi } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const guard = await verifyCreatorApi();
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const { content_type_id, task_name } = body;

    if (!content_type_id || !task_name || !task_name.trim()) {
      return NextResponse.json(
        { error: "content_type_id and task_name are required" },
        { status: 400 }
      );
    }

    const created = await prisma.miscTask.create({
      data: {
        content_type_id,
        task_name: task_name.trim(),
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("Error creating misc task:", error);
    return NextResponse.json(
      { error: "Failed to create misc task" },
      { status: 500 }
    );
  }
}
