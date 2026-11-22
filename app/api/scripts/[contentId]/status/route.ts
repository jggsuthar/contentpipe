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
        script: true,
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    // Ensure Script record exists
    let script = contentItem.script;
    if (!script) {
      script = await prisma.script.create({
        data: {
          content_item_id: contentItem.id,
          status: "pending",
          columns_schema: "[]",
          rows_data: "[]",
          comments: "[]",
        },
      });
    }

    const body = await req.json();
    const { action, feedback_note } = body;

    let targetStatus: "pending" | "submitted" | "revision_requested" | "done" = "pending";
    let updatedComments: any[] = [];
    try {
      updatedComments = JSON.parse(script.comments || "[]");
    } catch {
      updatedComments = [];
    }

    if (action === "declare_done") {
      if (!isCreator) {
        return NextResponse.json(
          { error: "Only Creator can declare script done" },
          { status: 403 }
        );
      }
      targetStatus = "done";
    } else if (action === "undeclare") {
      if (!isCreator) {
        return NextResponse.json(
          { error: "Only Creator can undeclare script" },
          { status: 403 }
        );
      }
      targetStatus = "pending";
    } else if (action === "submit_for_review") {
      if (!isCreator) {
        const dbRole = await prisma.role.findUnique({
          where: { email: userEmail },
        });
        if (!dbRole) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        let permissions: any = {};
        try {
          permissions = JSON.parse(dbRole.permissions || "{}");
        } catch {
          permissions = {};
        }
        const config = getRoleConfigForContentType(permissions, contentItem.content_type_id);
        const scriptAccess = config.script_studio?.access;
        const isResponsible = config.responsibilities?.scripting?.enabled === true;
        const canSubmit = scriptAccess === "edit" || isResponsible || permissions.can_submit === true;
        if (!canSubmit) {
          return NextResponse.json(
            { error: "Forbidden: You do not have permission to submit scripts for review" },
            { status: 403 }
          );
        }
      }
      targetStatus = "submitted";
    } else if (action === "approve") {
      if (!isCreator) {
        return NextResponse.json(
          { error: "Only Creator can approve script" },
          { status: 403 }
        );
      }
      targetStatus = "done";
    } else if (action === "request_revisions") {
      if (!isCreator) {
        return NextResponse.json(
          { error: "Only Creator can request revisions" },
          { status: 403 }
        );
      }
      targetStatus = "revision_requested";

      if (feedback_note) {
        updatedComments.push({
          id: `sc_${Date.now()}_rev`,
          sr_no: null,
          author_email: userEmail,
          body: `[Revision Request] ${feedback_note}`,
          category: "General",
          severity: "critical",
          is_resolved: false,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    // Update Script record
    const updatedScript = await prisma.script.update({
      where: { id: script.id },
      data: {
        status: targetStatus,
        comments: JSON.stringify(updatedComments),
      },
    });

    // Sync any workflow task dynamically configured to automate from Script Studio
    if (!contentItem.is_in_idea_bank && contentItem.content_type_id) {
      await syncTaskAutomation(contentItem.id, "script_studio", { script_status: targetStatus });
    }

    return NextResponse.json({
      success: true,
      scriptStatus: updatedScript.status,
      comments: updatedComments,
    });
  } catch (error) {
    console.error("Error updating script status:", error);
    return NextResponse.json({ error: "Failed to update script status" }, { status: 500 });
  }
}
