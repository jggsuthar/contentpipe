import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { getRoleConfigForContentType } from "@/lib/permissions";
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
      include: {
        submissions: true,
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    let roleId: string | null = null;
    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });
      if (!dbRole) {
        return NextResponse.json({ error: "Role not authorized" }, { status: 403 });
      }

      let parsedPerms: any = {};
      try {
        parsedPerms = JSON.parse(dbRole.permissions || "{}");
      } catch {
        parsedPerms = {};
      }

      const contentConfig = getRoleConfigForContentType(parsedPerms, contentItem.content_type_id);
      const subPerm = contentConfig.content?.submission;

      const canSubmit = Boolean(
        subPerm?.can_submit === true ||
        contentConfig.responsibilities?.content_submission?.enabled === true ||
        contentConfig.content?.can_submit === true ||
        parsedPerms.can_submit === true
      );

      if (!canSubmit || subPerm?.disabled) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to submit content deliverables" },
          { status: 403 }
        );
      }

      roleId = dbRole.id;
    }

    const body = await req.json();
    const {
      task_name = "Edit",
      version,
      file_url,
      file_name,
      file_type = "video",
      file_size_bytes = 0,
      drive_file_id,
    } = body;

    if (!file_url && !drive_file_id) {
      return NextResponse.json({ error: "File reference or Drive ID is required" }, { status: 400 });
    }

    // Determine iteration version: auto-generate V1, V2, etc. if not provided
    const taskSubmissions = contentItem.submissions.filter(
      (s) => s.task_name.toLowerCase() === task_name.toLowerCase()
    );
    const calculatedVersion = version || `V${taskSubmissions.length + 1}`;

    // 1. Create the Submission record
    const submission = await prisma.submission.create({
      data: {
        content_item_id: contentItem.id,
        task_name,
        version: calculatedVersion,
        file_url: file_url || "",
        file_name: file_name || `${task_name}_${calculatedVersion}`,
        file_type: file_type === "image" ? "image" : "video",
        file_size_bytes: Number(file_size_bytes) || 0,
        drive_file_id: drive_file_id || null,
        submitted_by_role_id: roleId,
        status: "pending",
      },
    });

    // Dynamic automation: sync task status for any task mapped to 'content_submission'
    await syncTaskAutomation(contentItem.id, "content_submission");

    return NextResponse.json({
      success: true,
      submission,
    });
  } catch (error) {
    console.error("Error submitting iteration deliverable:", error);
    return NextResponse.json({ error: "Failed to submit deliverable" }, { status: 500 });
  }
}
