import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import { ensureDefaultBrandAndBackfill } from "@/lib/brand-helpers";

async function handleUpdate(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const defaultBrand = await ensureDefaultBrandAndBackfill();

    const existingSeries = await prisma.contentType.findUnique({
      where: { id },
    });
    if (!existingSeries) {
      return NextResponse.json(
        { error: "Content Series not found." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      brand_id,
      name,
      prefix,
      suffix,
      id_generation_type,
      default_months_open,
      cadence_type,
      cadence_start_date,
      upload_days,
      script_default_columns,
      default_folder_architecture,
    } = body;

    let nextBrandId: string | undefined = undefined;
    if (brand_id !== undefined) {
      if (typeof brand_id !== "string" || !brand_id.trim()) {
        return NextResponse.json(
          { error: "Target Brand ID cannot be empty." },
          { status: 400 }
        );
      }
      const targetBrand = await prisma.brand.findUnique({
        where: { id: brand_id.trim() },
        select: { id: true },
      });
      if (!targetBrand) {
        return NextResponse.json(
          { error: "Target Brand not found." },
          { status: 400 }
        );
      }
      nextBrandId = targetBrand.id;
    }

    let nextName: string | undefined = undefined;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Content Series name cannot be empty." },
          { status: 400 }
        );
      }
      nextName = name.trim();
    }

    const effectiveBrandId =
      nextBrandId ?? existingSeries.brand_id ?? defaultBrand.id;
    const effectiveName = nextName ?? existingSeries.name;

    if (nextName !== undefined || nextBrandId !== undefined) {
      const duplicate = await prisma.contentType.findFirst({
        where: {
          brand_id: effectiveBrandId,
          name: effectiveName,
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Content Series with name '${effectiveName}' already exists in this Brand.`,
          },
          { status: 400 }
        );
      }
    }

    let cleanedFolderArchitecture: string | undefined = undefined;
    if (default_folder_architecture !== undefined) {
      const parsedArch =
        typeof default_folder_architecture === "string"
          ? JSON.parse(default_folder_architecture)
          : default_folder_architecture;
      if (Array.isArray(parsedArch)) {
        cleanedFolderArchitecture = JSON.stringify(parsedArch);
      } else {
        cleanedFolderArchitecture = JSON.stringify([]);
      }
    }

    let cleanedScriptDefaultColumns: string | undefined = undefined;
    if (script_default_columns !== undefined) {
      const parsedCols =
        typeof script_default_columns === "string"
          ? JSON.parse(script_default_columns)
          : script_default_columns;
      if (Array.isArray(parsedCols)) {
        cleanedScriptDefaultColumns = JSON.stringify(
          parsedCols.filter((c: any) => c.id !== "col_sr" && c.id !== "sr_no")
        );
      } else {
        cleanedScriptDefaultColumns = JSON.stringify([]);
      }
    }

    const updated = await prisma.contentType.update({
      where: { id },
      data: {
        brand_id: nextBrandId,
        name: nextName,
        prefix: prefix !== undefined ? prefix?.trim() || null : undefined,
        suffix: suffix !== undefined ? suffix?.trim() || null : undefined,
        id_generation_type:
          id_generation_type !== undefined ? id_generation_type : undefined,
        default_months_open:
          default_months_open !== undefined
            ? Number(default_months_open)
            : undefined,
        cadence_type: cadence_type !== undefined ? cadence_type : undefined,
        cadence_start_date:
          cadence_start_date !== undefined
            ? cadence_start_date
              ? new Date(cadence_start_date)
              : null
            : undefined,
        upload_days:
          upload_days !== undefined ? JSON.stringify(upload_days) : undefined,
        script_default_columns: cleanedScriptDefaultColumns,
        default_folder_architecture: cleanedFolderArchitecture,
      },
      include: {
        brand: {
          select: { id: true, name: true, color: true },
        },
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
        misc_tasks: true,
      },
    });

    return NextResponse.json({
      ...updated,
      upload_days: JSON.parse(updated.upload_days || "[]"),
      script_default_columns: updated.script_default_columns
        ? JSON.parse(updated.script_default_columns)
        : null,
      default_folder_architecture: updated.default_folder_architecture
        ? JSON.parse(updated.default_folder_architecture)
        : [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }],
    });
  } catch (error) {
    console.error("Error updating content series:", error);
    return NextResponse.json(
      { error: "Failed to update content series" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, context);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    await prisma.contentType.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("Error deleting content series:", error);
    return NextResponse.json(
      { error: "Failed to delete content series" },
      { status: 500 }
    );
  }
}
