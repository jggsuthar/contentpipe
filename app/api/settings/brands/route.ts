import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { verifyPermission } from "@/lib/api-guard";
import {
  ensureDefaultBrandAndBackfill,
  ensureUniqueBrandSlug,
} from "@/lib/brand-helpers";

const BRAND_INCLUDE = {
  _count: {
    select: { content_series: true },
  },
  content_series: {
    select: { id: true, name: true, prefix: true },
    orderBy: { created_at: "asc" as const },
  },
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDefaultBrandAndBackfill();

    const brands = await prisma.brand.findMany({
      orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
      include: BRAND_INCLUDE,
    });

    return NextResponse.json(brands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    return NextResponse.json(
      { error: "Failed to fetch brands" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("settings:manage_content_types");
  if (!guard.authorized) return guard.response;

  try {
    const body = await req.json();
    const { name, description, color, is_default } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Brand name is required." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Ensure default brand exists before adding another brand
    await ensureDefaultBrandAndBackfill();

    // Validate duplicate brand name (case-insensitive)
    const existingBrands = await prisma.brand.findMany({
      select: { id: true, name: true },
    });
    const duplicate = existingBrands.find(
      (b) => b.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `A Brand with name '${trimmedName}' already exists.` },
        { status: 400 }
      );
    }

    const slug = await ensureUniqueBrandSlug(trimmedName);
    const cleanColor =
      typeof color === "string" && color.trim() ? color.trim() : "#6366f1";
    const cleanDescription =
      typeof description === "string" && description.trim()
        ? description.trim()
        : null;
    const makeDefault = Boolean(is_default);

    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.brand.updateMany({
          where: { is_default: true },
          data: { is_default: false },
        });
      }

      return tx.brand.create({
        data: {
          name: trimmedName,
          slug,
          description: cleanDescription,
          color: cleanColor,
          is_default: makeDefault,
        },
        include: BRAND_INCLUDE,
      });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating brand:", error);
    return NextResponse.json(
      { error: "Failed to create brand" },
      { status: 500 }
    );
  }
}
