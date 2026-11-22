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

    if (!isCreator) {
      return NextResponse.json(
        { error: "Forbidden: Only the Creator can approve or request revisions" },
        { status: 403 }
      );
    }

    const contentItem = await prisma.contentItem.findFirst({
      where: {
        OR: [{ unique_content_id: contentId }, { id: contentId }],
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    const body = await req.json();
    const { submission_id, action } = body;

    if (!submission_id || !action) {
      return NextResponse.json(
        { error: "submission_id and action are required" },
        { status: 400 }
      );
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submission_id },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (action === "approve") {
      await prisma.submission.update({
        where: { id: submission_id },
        data: { status: "approved" },
      });

      // Dynamic automation: sync task status for any task mapped to 'content_submission'
      await syncTaskAutomation(contentItem.id, "content_submission");

      return NextResponse.json({
        success: true,
        submission_status: "approved",
      });
    } else if (action === "request_revision") {
      await prisma.submission.update({
        where: { id: submission_id },
        data: { status: "rejected" },
      });

      // Dynamic automation: sync task status for any task mapped to 'content_submission'
      await syncTaskAutomation(contentItem.id, "content_submission");

      return NextResponse.json({
        success: true,
        submission_status: "rejected",
      });
    }

    return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  } catch (error) {
    console.error("Error executing submission review action:", error);
    return NextResponse.json({ error: "Failed to process review action" }, { status: 500 });
  }
}
