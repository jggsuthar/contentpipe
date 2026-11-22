import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import { validateGoogleEmail } from "@/lib/email-validator";

export async function GET() {
  const guard = await verifyPermission("settings:manage_roles");
  if (!guard.authorized) return guard.response;

  try {
    const roles = await prisma.role.findMany({
      orderBy: { created_at: "asc" },
    });

    const parsed = roles.map((r) => ({
      ...r,
      assigned_content_types: JSON.parse(r.assigned_content_types || "[]"),
      permissions: JSON.parse(r.permissions || "{}"),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_roles");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const {
      name,
      email,
      role_title,
      assigned_content_types = [],
      permissions = {},
    } = body;

    if (!name?.trim() || !email?.trim() || !role_title?.trim()) {
      return NextResponse.json(
        { error: "Name, Google email, and Role title are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate authentic Google email ID
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

    // Check if email already exists in roles
    const existing = await prisma.role.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: `A team member with email '${normalizedEmail}' already exists.` },
        { status: 400 }
      );
    }

    const created = await prisma.role.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        role_title: role_title.trim(),
        assigned_content_types: JSON.stringify(assigned_content_types),
        permissions: JSON.stringify(permissions),
      },
    });

    return NextResponse.json({
      ...created,
      assigned_content_types: JSON.parse(created.assigned_content_types),
      permissions: JSON.parse(created.permissions),
    });
  } catch (error) {
    console.error("Error creating role:", error);
    return NextResponse.json(
      { error: "Failed to create team member role" },
      { status: 500 }
    );
  }
}
