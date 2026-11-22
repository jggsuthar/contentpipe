import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userEmail = session.user.email.toLowerCase().trim();
    const isCreator = isCreatorEmail(userEmail) || session.user.role === "creator";

    const body = await req.json();
    const {
      action = "add",
      comment_id,
      submission_id,
      timestamp_seconds,
      marker_x,
      marker_y,
      category = "General",
      severity = "minor",
      text,
    } = body;

    if (action === "add") {
      if (!submission_id || !text || !text.trim()) {
        return NextResponse.json(
          { error: "submission_id and comment text are required" },
          { status: 400 }
        );
      }

      const comment = await prisma.comment.create({
        data: {
          submission_id,
          author_email: userEmail,
          timestamp_seconds: timestamp_seconds !== undefined && timestamp_seconds !== null ? Number(timestamp_seconds) : null,
          marker_x: marker_x !== undefined && marker_x !== null ? Number(marker_x) : null,
          marker_y: marker_y !== undefined && marker_y !== null ? Number(marker_y) : null,
          category,
          severity: severity === "critical" ? "critical" : "minor",
          body: text.trim(),
          is_resolved: false,
        },
      });

      return NextResponse.json({ success: true, comment });
    } else if (action === "toggle_resolve") {
      if (!comment_id) {
        return NextResponse.json({ error: "comment_id is required" }, { status: 400 });
      }

      const existing = await prisma.comment.findUnique({
        where: { id: comment_id },
      });
      if (!existing) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }

      const updated = await prisma.comment.update({
        where: { id: comment_id },
        data: { is_resolved: !existing.is_resolved },
      });

      return NextResponse.json({ success: true, comment: updated });
    } else if (action === "delete") {
      if (!comment_id) {
        return NextResponse.json({ error: "comment_id is required" }, { status: 400 });
      }

      const existing = await prisma.comment.findUnique({
        where: { id: comment_id },
      });
      if (!existing) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }

      if (!isCreator && existing.author_email !== userEmail) {
        return NextResponse.json({ error: "Forbidden to delete comment" }, { status: 403 });
      }

      await prisma.comment.delete({
        where: { id: comment_id },
      });

      return NextResponse.json({ success: true, deleted: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error managing submission comment:", error);
    return NextResponse.json({ error: "Failed to manage comment" }, { status: 500 });
  }
}
