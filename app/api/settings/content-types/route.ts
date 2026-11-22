import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import { ensureDefaultBrandAndBackfill } from "@/lib/brand-helpers";

export async function GET(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    await ensureDefaultBrandAndBackfill();

    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId");

    const types = await prisma.contentType.findMany({
      where: brandId ? { brand_id: brandId } : undefined,
      include: {
        brand: {
          select: { id: true, name: true, color: true },
        },
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
        misc_tasks: true,
      },
      orderBy: { created_at: "asc" },
    });

    const parsed = types.map((t) => ({
      ...t,
      upload_days: JSON.parse(t.upload_days || "[]"),
      script_default_columns: t.script_default_columns
        ? JSON.parse(t.script_default_columns)
        : null,
      default_folder_architecture: t.default_folder_architecture
        ? JSON.parse(t.default_folder_architecture)
        : [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }],
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error fetching content series:", error);
    return NextResponse.json(
      { error: "Failed to fetch content series" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const {
      brand_id,
      name,
      prefix,
      suffix,
      id_generation_type = "date_counter",
      default_months_open = 3,
      cadence_type = "weekly",
      cadence_start_date,
      upload_days = ["Tuesday"],
      script_default_columns,
      default_folder_architecture,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const defaultBrand = await ensureDefaultBrandAndBackfill();

    let targetBrandId = defaultBrand.id;
    if (brand_id && typeof brand_id === "string" && brand_id.trim()) {
      const targetBrand = await prisma.brand.findUnique({
        where: { id: brand_id.trim() },
        select: { id: true },
      });
      if (!targetBrand) {
        return NextResponse.json(
          { error: "Selected Brand not found." },
          { status: 400 }
        );
      }
      targetBrandId = targetBrand.id;
    }

    // Check existing uniqueness scoped to (brand_id, name)
    const existing = await prisma.contentType.findUnique({
      where: {
        brand_id_name: {
          brand_id: targetBrandId,
          name: trimmedName,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: `Content Series with name '${trimmedName}' already exists in this Brand.`,
        },
        { status: 400 }
      );
    }

    // Default designed columns (system columns Sr. No. and Action are handled separately)
    const fallbackScriptColumns = [
      {
        id: "col_roll",
        name: "Roll Type",
        type: "dropdown",
        width: "140px",
        options: ["A-Roll", "B-Roll", "Screen Recording", "Skit"],
      },
      { id: "col_dialogue", name: "Dialogue / Spoken Words", type: "text", width: "340px" },
      { id: "col_visual", name: "Visual / B-Roll Cue", type: "text", width: "220px" },
      { id: "col_audio", name: "Audio / SFX Cue", type: "text", width: "180px" },
    ];

    const cleanScriptColumns = script_default_columns
      ? (Array.isArray(script_default_columns) ? script_default_columns : JSON.parse(script_default_columns))
          .filter((c: any) => c.id !== "col_sr" && c.id !== "sr_no")
      : fallbackScriptColumns;

    const defaultArch = [
      { id: "fld_raw", name: "Raw_Footage", parent_id: null },
    ];
    let cleanFolderArchitecture = defaultArch;
    if (default_folder_architecture !== undefined) {
      try {
        const parsedArch =
          typeof default_folder_architecture === "string"
            ? JSON.parse(default_folder_architecture)
            : default_folder_architecture;
        if (Array.isArray(parsedArch) && parsedArch.length > 0) {
          cleanFolderArchitecture = parsedArch;
        }
      } catch {
        cleanFolderArchitecture = defaultArch;
      }
    }

    // Create content series with mandatory Ideation and Publish endpoints
    const created = await prisma.contentType.create({
      data: {
        brand_id: targetBrandId,
        name: trimmedName,
        prefix: prefix?.trim() || null,
        suffix: suffix?.trim() || null,
        id_generation_type,
        default_months_open: Number(default_months_open) || 3,
        cadence_type,
        cadence_start_date: cadence_start_date ? new Date(cadence_start_date) : null,
        upload_days: JSON.stringify(upload_days),
        script_default_columns: JSON.stringify(cleanScriptColumns),
        default_folder_architecture: JSON.stringify(cleanFolderArchitecture),
        workflow_tasks: {
          create: [
            {
              task_name: "Ideation",
              sequence_order: 1,
              n_days_offset: 14,
              team_buffer_days: 0,
              team_final_buffer_days: 0,
              is_hidden: false,
            },
            {
              task_name: "Script",
              sequence_order: 2,
              n_days_offset: 10,
              team_buffer_days: 2,
              team_final_buffer_days: 1,
              is_hidden: false,
            },
            {
              task_name: "Shoot",
              sequence_order: 3,
              n_days_offset: 7,
              team_buffer_days: 0,
              team_final_buffer_days: 0,
              is_hidden: false,
            },
            {
              task_name: "Edit",
              sequence_order: 4,
              n_days_offset: 4,
              team_buffer_days: 2,
              team_final_buffer_days: 1,
              is_hidden: false,
            },
            {
              task_name: "Schedule",
              sequence_order: 5,
              n_days_offset: 1,
              team_buffer_days: 0,
              team_final_buffer_days: 0,
              is_hidden: false,
            },
            {
              task_name: "Publish",
              sequence_order: 6,
              n_days_offset: 0,
              team_buffer_days: 0,
              team_final_buffer_days: 0,
              is_hidden: false,
            },
          ],
        },
        misc_tasks: {
          create: [
            { task_name: "Thumbnail Design" },
            { task_name: "Title Variations" },
            { task_name: "Description & Links" },
          ],
        },
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
      ...created,
      upload_days: JSON.parse(created.upload_days),
      script_default_columns: JSON.parse(created.script_default_columns || "[]"),
      default_folder_architecture: JSON.parse(created.default_folder_architecture || "[]"),
    });
  } catch (error) {
    console.error("Error creating content series:", error);
    return NextResponse.json(
      { error: "Failed to create content series" },
      { status: 500 }
    );
  }
}
