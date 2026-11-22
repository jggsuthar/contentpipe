import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import { validateGoogleEmail } from "@/lib/email-validator";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_roles");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      email,
      role_title,
      assigned_content_types,
      permissions,
    } = body;

    const normalizedEmail = email ? email.trim().toLowerCase() : undefined;

    // If changing email, validate authentic Google email and check uniqueness
    if (normalizedEmail) {
      const emailValidation = await validateGoogleEmail(normalizedEmail);
      if (!emailValidation.valid) {
        return NextResponse.json(
          {
            error:
              emailValidation.reason ||
              `The email '${normalizedEmail}' is not an authentic Google or Google Workspace email address.`,
          },
          { status: 400 }
        );
      }

      const existing = await prisma.role.findFirst({
        where: {
          email: normalizedEmail,
          NOT: { id },
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Another team member is already registered with email '${normalizedEmail}'.` },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        email: normalizedEmail,
        role_title: role_title ? role_title.trim() : undefined,
        assigned_content_types: assigned_content_types
          ? JSON.stringify(assigned_content_types)
          : undefined,
        permissions: permissions ? JSON.stringify(permissions) : undefined,
      },
    });

    return NextResponse.json({
      ...updated,
      assigned_content_types: JSON.parse(updated.assigned_content_types),
      permissions: JSON.parse(updated.permissions),
    });
  } catch (error) {
    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: "Failed to update team member role" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_roles");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    await prisma.role.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Error deleting role:", error);
    return NextResponse.json(
      { error: "Failed to delete team member role" },
      { status: 500 }
    );
  }
}
