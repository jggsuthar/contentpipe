import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    const contentItem = await prisma.contentItem.findFirst({
      where: {
        OR: [{ unique_content_id: contentId }, { id: contentId }],
      },
      include: { script: true },
    });

    if (!contentItem || !contentItem.script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    const script = contentItem.script;
    let comments: any[] = [];
    try {
      comments = JSON.parse(script.comments || "[]");
    } catch {
      comments = [];
    }

    const body = await req.json();
    const { action = "add" } = body;

    if (action === "add") {
      const { sr_no, text, category, severity = "minor" } = body;
      if (!text || !text.trim()) {
        return NextResponse.json({ error: "Comment text is required" }, { status: 400 });
      }

      const newComment = {
        id: `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sr_no: typeof sr_no === "number" ? sr_no : null,
        author_email: userEmail,
        body: text.trim(),
        category: category || "General",
        severity: severity === "critical" ? "critical" : "minor",
        is_resolved: false,
        created_at: new Date().toISOString(),
      };

      comments.push(newComment);
    } else if (action === "toggle_resolve") {
      const { comment_id } = body;
      const target = comments.find((c) => c.id === comment_id);
      if (target) {
        target.is_resolved = !target.is_resolved;
      }
    } else if (action === "delete") {
      const { comment_id } = body;
      comments = comments.filter((c) => c.id !== comment_id);
    }

    await prisma.script.update({
      where: { id: script.id },
      data: {
        comments: JSON.stringify(comments),
      },
    });

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error("Error managing script comment:", error);
    return NextResponse.json({ error: "Failed to manage comment" }, { status: 500 });
  }
}
