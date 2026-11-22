import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { syncTaskAutomation } from "@/lib/task-automation";

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

    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });
      if (!dbRole) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { isDone } = body;

    const updated = await prisma.contentItem.update({
      where: { id: contentItem.id },
      data: {
        raw_footage_uploaded: Boolean(isDone),
      },
    });

    // Dynamic automation: sync task status for any task mapped to 'drive_raw_footage'
    await syncTaskAutomation(contentItem.id, "drive_raw_footage", {
      raw_footage_uploaded: Boolean(isDone),
    });

    return NextResponse.json({
      success: true,
      raw_footage_uploaded: updated.raw_footage_uploaded,
    });
  } catch (error) {
    console.error("Error updating raw footage status:", error);
    return NextResponse.json({ error: "Failed to update raw footage status" }, { status: 500 });
  }
}
