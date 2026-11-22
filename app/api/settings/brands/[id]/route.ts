import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import { deleteContentDriveFolder, deleteDriveFile } from "@/lib/google-drive";
import { ensureUniqueBrandSlug } from "@/lib/brand-helpers";

const BRAND_INCLUDE = {
  _count: {
    select: { content_series: true },
  },
  content_series: {
    select: { id: true, name: true, prefix: true },
    orderBy: { created_at: "asc" as const },
  },
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;
    const existing = await prisma.brand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, color, is_default } = body;

    let nextName: string | undefined = undefined;
    let nextSlug: string | undefined = undefined;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Brand name cannot be empty." },
          { status: 400 }
        );
      }
      const trimmedName = name.trim();
      const otherBrands = await prisma.brand.findMany({
        where: { id: { not: id } },
        select: { id: true, name: true },
      });
      const duplicate = otherBrands.find(
        (b) => b.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return NextResponse.json(
          { error: `A Brand with name '${trimmedName}' already exists.` },
          { status: 400 }
        );
      }
      nextName = trimmedName;
      if (trimmedName !== existing.name) {
        nextSlug = await ensureUniqueBrandSlug(trimmedName, id);
      }
    }

    if (is_default === false && existing.is_default) {
      return NextResponse.json(
        {
          error:
            "At least one brand must remain the default brand. Set another brand as default instead.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (is_default === true && !existing.is_default) {
        await tx.brand.updateMany({
          where: { id: { not: id }, is_default: true },
          data: { is_default: false },
        });
      }

      return tx.brand.update({
        where: { id },
        data: {
          name: nextName,
          slug: nextSlug,
          description:
            description !== undefined
              ? typeof description === "string" && description.trim()
                ? description.trim()
                : null
              : undefined,
          color:
            color !== undefined
              ? typeof color === "string" && color.trim()
                ? color.trim()
                : "#6366f1"
              : undefined,
          is_default: is_default !== undefined ? Boolean(is_default) : undefined,
        },
        include: BRAND_INCLUDE,
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating brand:", error);
    return NextResponse.json(
      { error: "Failed to update brand" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const { id } = await params;

    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        content_series: {
          select: { id: true, name: true },
        },
      },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }

    const totalBrands = await prisma.brand.count();
    if (totalBrands <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining brand." },
        { status: 400 }
      );
    }

    // Check confirmation & deleteDrive via query param or optional JSON body
    const { searchParams } = new URL(req.url);
    let confirmed =
      searchParams.get("confirm") === "true" ||
      searchParams.get("force") === "true";
    let deleteDrive = searchParams.get("deleteDrive") === "true";

    if (!confirmed || !deleteDrive) {
      try {
        const body = await req.json();
        if (body && body.confirm === true) {
          confirmed = true;
        }
        if (body && body.deleteDrive === true) {
          deleteDrive = true;
        }
      } catch {
        // Request body is optional on DELETE
      }
    }

    const seriesIds = brand.content_series.map((s) => s.id);
    if (seriesIds.length > 0 && !confirmed) {
      const activeItemsCount = await prisma.contentItem.count({
        where: {
          content_type_id: { in: seriesIds },
          is_archived: false,
        },
      });

      if (activeItemsCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete brand '${brand.name}' because it contains ${seriesIds.length} Content Series with ${activeItemsCount} active content item(s). Move or archive those items first, or confirm deletion.`,
            requiresConfirmation: true,
            seriesCount: seriesIds.length,
            activeItemsCount,
          },
          { status: 400 }
        );
      }
    }

    let deletedDriveCount = 0;

    if (deleteDrive && seriesIds.length > 0) {
      const itemsToClean = await prisma.contentItem.findMany({
        where: { content_type_id: { in: seriesIds } },
        select: {
          drive_folders: true,
          raw_assets: true,
          submissions: { select: { drive_file_id: true } },
        },
      });

      const driveTasks: Promise<boolean>[] = [];
      for (const item of itemsToClean) {
        try {
          const folders = JSON.parse(item.drive_folders || "{}");
          if (folders?.main_folder_id) {
            driveTasks.push(deleteContentDriveFolder(folders.main_folder_id));
          }
        } catch {
          // ignore malformed JSON
        }

        try {
          const rawAssets = JSON.parse(item.raw_assets || "[]");
          if (Array.isArray(rawAssets)) {
            for (const asset of rawAssets) {
              if (asset?.drive_file_id) {
                driveTasks.push(deleteDriveFile(asset.drive_file_id));
              }
            }
          }
        } catch {
          // ignore malformed JSON
        }

        for (const sub of item.submissions) {
          if (sub.drive_file_id) {
            driveTasks.push(deleteDriveFile(sub.drive_file_id));
          }
        }
      }

      if (driveTasks.length > 0) {
        const results = await Promise.allSettled(driveTasks);
        deletedDriveCount = results.filter(
          (r) => r.status === "fulfilled" && r.value === true
        ).length;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (brand.is_default) {
        const fallback = await tx.brand.findFirst({
          where: { id: { not: id } },
          orderBy: { created_at: "asc" },
        });
        if (fallback) {
          await tx.brand.update({
            where: { id: fallback.id },
            data: { is_default: true },
          });
        }
      }

      if (deleteDrive) {
        await tx.ideaBank.deleteMany({ where: { brand_id: id } });
      }

      await tx.brand.delete({ where: { id } });
    });

    return NextResponse.json({
      success: true,
      deletedId: id,
      deletedDriveCount,
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    return NextResponse.json(
      { error: "Failed to delete brand" },
      { status: 500 }
    );
  }
}
