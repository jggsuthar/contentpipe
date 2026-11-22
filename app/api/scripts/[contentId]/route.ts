import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { getRoleConfigForContentType } from "@/lib/permissions";

// Default designed columns (system columns Sr. No. and Action are always fixed and hardcoded)
const DEFAULT_SCRIPT_COLUMNS = [
  { id: "col_dialogue", name: "Dialogue / Spoken Words", type: "text", width: "360px" },
  {
    id: "col_roll",
    name: "Roll Type",
    type: "dropdown",
    options: ["A-Roll", "B-Roll", "Screen Recording", "Voiceover"],
    width: "150px",
  },
  { id: "col_visual", name: "Visual / B-Roll Cue", type: "text", width: "240px" },
  { id: "col_audio", name: "Audio / SFX Cue", type: "text", width: "200px" },
];

const DEFAULT_INITIAL_ROWS: any[] = [];

export async function GET(
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

    // 1. Locate Content Item
    const contentItem = await prisma.contentItem.findFirst({
      where: {
        OR: [{ unique_content_id: contentId }, { id: contentId }],
      },
      include: {
        brand: { select: { id: true, name: true, color: true } },
        content_type: {
          include: {
            brand: { select: { id: true, name: true, color: true } },
          },
        },
        script: true,
      },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    // 2. Determine Scripting Responsibility Assignment & User Permissions
    const allRoles = await prisma.role.findMany();
    const assignedWriterRoleRecord = allRoles.find((role) => {
      if (isCreatorEmail(role.email)) return false;

      let permissions: any = {};
      try {
        permissions = JSON.parse(role.permissions || "{}");
      } catch {
        permissions = {};
      }

      // Check new responsibilities architecture first, fallback to legacy
      const config = getRoleConfigForContentType(permissions, contentItem.content_type_id);
      const hasScriptResponsibility =
        config.responsibilities?.scripting?.enabled === true ||
        permissions.responsibilities?.scripting?.enabled === true ||
        (Array.isArray(permissions.submission_tasks) &&
          permissions.submission_tasks.some((t: string) => t.toLowerCase() === "script")) ||
        permissions.submission_task?.toLowerCase() === "script" ||
        (role.role_title && role.role_title.toLowerCase().includes("script"));

      if (!hasScriptResponsibility) return false;

      let assignedTypes: string[] = [];
      try {
        assignedTypes = JSON.parse(role.assigned_content_types || "[]");
      } catch {
        assignedTypes = [];
      }

      if (assignedTypes.length === 0 || assignedTypes.includes("ALL")) return true;
      return (
        (Boolean(contentItem.content_type_id) &&
          assignedTypes.includes(contentItem.content_type_id as string)) ||
        (Boolean(contentItem.content_type?.name) &&
          assignedTypes.includes(contentItem.content_type!.name))
      );
    });

    const isResponsibilityAssigned = !!assignedWriterRoleRecord;
    const assignedWriterRole = assignedWriterRoleRecord
      ? {
          id: assignedWriterRoleRecord.id,
          name: assignedWriterRoleRecord.name,
          email: assignedWriterRoleRecord.email,
          role_title: assignedWriterRoleRecord.role_title,
        }
      : null;

    const isAssignedWriter =
      !isCreator &&
      !!assignedWriterRole &&
      assignedWriterRole.email.toLowerCase() === userEmail;

    // Granular Permissions check
    let canEdit = isCreator;
    let canSubmit = isCreator;
    let canApprove = isCreator;

    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });

      if (!dbRole) {
        return NextResponse.json(
          { error: "Forbidden: Account not registered as a team member" },
          { status: 403 }
        );
      }

      let parsedPermissions: any = {};
      try {
        parsedPermissions = JSON.parse(dbRole.permissions || "{}");
      } catch {
        parsedPermissions = {};
      }

      // Check assigned content type restriction
      let assignedTypes: string[] = [];
      try {
        assignedTypes = JSON.parse(dbRole.assigned_content_types || "[]");
      } catch {
        assignedTypes = [];
      }
      if (
        contentItem.content_type_id &&
        assignedTypes.length > 0 &&
        !assignedTypes.includes("ALL") &&
        !assignedTypes.includes(contentItem.content_type_id) &&
        !(contentItem.content_type?.name && assignedTypes.includes(contentItem.content_type.name))
      ) {
        return NextResponse.json(
          { error: "Forbidden: You are not assigned to this content type" },
          { status: 403 }
        );
      }

      const config = getRoleConfigForContentType(parsedPermissions, contentItem.content_type_id);
      const scriptStudioAccess = config.script_studio?.access;
      const isResponsibleForScripting = config.responsibilities?.scripting?.enabled === true;

      if (scriptStudioAccess === "none") {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to access Script Studio" },
          { status: 403 }
        );
      }

      if (scriptStudioAccess === "edit" || isResponsibleForScripting) {
        canEdit = true;
        canSubmit = true;
        canApprove = false;
      } else if (scriptStudioAccess === "view") {
        canEdit = false;
        canSubmit = false;
        canApprove = false;
      } else {
        // Fallback to legacy permissions
        canEdit = parsedPermissions.can_edit === true;
        canSubmit = parsedPermissions.can_submit === true;
        canApprove = false;
      }
    }

    // 3. Find or create the Script record
    let script = contentItem.script;

    if (!script) {
      let initialColumns = DEFAULT_SCRIPT_COLUMNS;
      if (contentItem.content_type?.script_default_columns) {
        try {
          const parsed = JSON.parse(contentItem.content_type.script_default_columns);
          if (Array.isArray(parsed) && parsed.length > 0) {
            initialColumns = parsed.filter(
              (c: any) => c.id !== "col_sr" && c.id !== "sr_no"
            );
          }
        } catch {
          initialColumns = DEFAULT_SCRIPT_COLUMNS;
        }
      }

      script = await prisma.script.create({
        data: {
          content_item_id: contentItem.id,
          status: "pending",
          columns_schema: JSON.stringify(initialColumns),
          rows_data: "[]",
          custom_notes: "",
          canvas_drawings: "",
          media_attachments: "[]",
          comments: "[]",
        },
      });
    }

    // 4. Fetch feedback categories
    const creatorSettings = await prisma.creatorSettings.findFirst();
    let feedbackCategories = [
      "Pacing / Dead Air",
      "Audio / SFX",
      "B-Roll / Visuals",
      "Typography",
      "Retention Hook",
      "SOP Miss",
    ];
    if (creatorSettings?.feedback_categories) {
      try {
        feedbackCategories = JSON.parse(creatorSettings.feedback_categories);
      } catch {
        // fallback to default
      }
    }

    // Parse script fields and remove any system col_sr from columns schema
    let columnsSchema: any[] = [];
    try {
      columnsSchema = JSON.parse(script.columns_schema || "[]");
      if (!Array.isArray(columnsSchema) || columnsSchema.length === 0) {
        columnsSchema = DEFAULT_SCRIPT_COLUMNS;
      }
    } catch {
      columnsSchema = DEFAULT_SCRIPT_COLUMNS;
    }
    // Filter out system columns like sr_no or col_sr
    columnsSchema = columnsSchema.filter(
      (c: any) => c.id !== "col_sr" && c.id !== "sr_no" && c.id !== "actions"
    );

    let rowsData: any[] = [];
    try {
      rowsData = JSON.parse(script.rows_data || "[]");
      if (!Array.isArray(rowsData)) {
        rowsData = [];
      }
    } catch {
      rowsData = [];
    }

    // If an existing script in DB only contains the legacy default dummy template dialogues, clear them so user gets a clean empty workspace
    if (
      Array.isArray(rowsData) &&
      rowsData.length === 2 &&
      typeof rowsData[0]?.col_dialogue === "string" &&
      rowsData[0].col_dialogue.includes("Hook: Why 99% of creators fail at scripting") &&
      typeof rowsData[1]?.col_dialogue === "string" &&
      rowsData[1].col_dialogue.includes("In this breakdown, I'll reveal the exact 3-step pipeline we use")
    ) {
      rowsData = [];
    }

    let mediaAttachments = [];
    try {
      mediaAttachments = JSON.parse(script.media_attachments || "[]");
    } catch {
      mediaAttachments = [];
    }

    let comments = [];
    try {
      comments = JSON.parse(script.comments || "[]");
    } catch {
      comments = [];
    }

    return NextResponse.json({
      contentItem: {
        id: contentItem.id,
        unique_content_id: contentItem.unique_content_id,
        title: contentItem.title || "Untitled Video",
        publish_date: contentItem.publish_date,
        is_in_idea_bank: contentItem.is_in_idea_bank,
        content_type: contentItem.content_type
          ? {
              id: contentItem.content_type.id,
              name: contentItem.content_type.name,
              prefix: contentItem.content_type.prefix,
              brand: contentItem.content_type.brand || contentItem.brand || null,
            }
          : {
              id: null,
              name: "Idea Bank (Unassigned Pipe)",
              prefix: "ID-",
              brand: contentItem.brand || null,
            },
      },
      scriptStatus: script.status || "pending",
      isResponsibilityAssigned,
      assignedWriterRole,
      script: {
        id: script.id,
        status: script.status || "pending",
        columns_schema: columnsSchema,
        rows_data: rowsData,
        custom_notes: script.custom_notes || "",
        canvas_drawings: script.canvas_drawings || "",
        media_attachments: mediaAttachments,
        comments: comments,
        updated_at: script.updated_at,
      },
      feedbackCategories,
      userPermissions: {
        canEdit,
        canSubmit,
        canApprove,
        isCreator,
        isAssignedWriter,
        userEmail,
      },
    });
  } catch (error) {
    console.error("Error fetching script studio:", error);
    return NextResponse.json({ error: "Failed to load script workspace" }, { status: 500 });
  }
}

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
      include: { script: true },
    });

    if (!contentItem) {
      return NextResponse.json({ error: "Content item not found" }, { status: 404 });
    }

    // Permission check for editing
    if (!isCreator) {
      const dbRole = await prisma.role.findUnique({
        where: { email: userEmail },
      });
      if (!dbRole) {
        return NextResponse.json({ error: "Forbidden: Account not registered" }, { status: 403 });
      }

      let permissions: any = {};
      try {
        permissions = JSON.parse(dbRole?.permissions || "{}");
      } catch {
        permissions = {};
      }

      const config = getRoleConfigForContentType(permissions, contentItem.content_type_id);
      const scriptAccess = config.script_studio?.access;
      const isResponsible = config.responsibilities?.scripting?.enabled === true;

      const canEdit =
        scriptAccess === "edit" ||
        isResponsible ||
        permissions.can_edit === true;

      if (!canEdit) {
        return NextResponse.json({ error: "Forbidden: View-only access" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { columns_schema, rows_data, custom_notes, canvas_drawings, media_attachments } = body;

    // Filter out system columns from columns_schema
    const cleanColumns = Array.isArray(columns_schema)
      ? columns_schema.filter(
          (c: any) => c.id !== "col_sr" && c.id !== "sr_no" && c.id !== "actions"
        )
      : [];

    const updated = await prisma.script.upsert({
      where: { content_item_id: contentItem.id },
      create: {
        content_item_id: contentItem.id,
        status: "pending",
        columns_schema: JSON.stringify(cleanColumns),
        rows_data: JSON.stringify(rows_data || []),
        custom_notes: custom_notes ?? "",
        canvas_drawings: canvas_drawings ?? "",
        media_attachments: JSON.stringify(media_attachments || []),
        comments: "[]",
      },
      update: {
        columns_schema: JSON.stringify(cleanColumns),
        rows_data: JSON.stringify(rows_data || []),
        custom_notes: custom_notes !== undefined ? custom_notes : undefined,
        canvas_drawings: canvas_drawings !== undefined ? canvas_drawings : undefined,
        media_attachments: media_attachments !== undefined ? JSON.stringify(media_attachments) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      updated_at: updated.updated_at,
    });
  } catch (error) {
    console.error("Error saving script:", error);
    return NextResponse.json({ error: "Failed to save script" }, { status: 500 });
  }
}
