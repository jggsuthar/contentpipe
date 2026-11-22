import prisma from "@/lib/prisma";
import type { Brand } from "@prisma/client";

/**
 * Generates a URL-friendly slug from a Brand name.
 */
export function generateBrandSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "brand";
}

/**
 * Generates a unique slug for a Brand, appending a numeric suffix if needed.
 */
export async function ensureUniqueBrandSlug(
  name: string,
  excludeBrandId?: string
): Promise<string> {
  const baseSlug = generateBrandSlug(name);
  const existing = await prisma.brand.findMany({
    where: excludeBrandId ? { id: { not: excludeBrandId } } : undefined,
    select: { slug: true },
  });
  const usedSlugs = new Set(existing.map((b) => b.slug).filter(Boolean));

  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (usedSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}

/**
 * Idempotent helper that ensures at least one default Brand exists ("Primary Brand")
 * and attaches any orphaned ContentType (Content Series) records where `brand_id IS NULL`
 * to that default Brand.
 */
export async function ensureDefaultBrandAndBackfill(): Promise<Brand> {
  let defaultBrand = await prisma.brand.findFirst({
    where: { is_default: true },
    orderBy: { created_at: "asc" },
  });

  if (!defaultBrand) {
    const firstBrand = await prisma.brand.findFirst({
      orderBy: { created_at: "asc" },
    });

    if (firstBrand) {
      defaultBrand = await prisma.brand.update({
        where: { id: firstBrand.id },
        data: { is_default: true },
      });
    } else {
      try {
        defaultBrand = await prisma.brand.create({
          data: {
            name: "Primary Brand",
            slug: "primary-brand",
            description: "Default brand for your content series",
            color: "#6366f1",
            is_default: true,
          },
        });
      } catch (err: unknown) {
        // Handle concurrent creation race (Prisma P2002 unique constraint)
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          const fallback = await prisma.brand.findFirst({
            orderBy: { created_at: "asc" },
          });
          if (!fallback) throw err;
          defaultBrand = fallback;
        } else {
          throw err;
        }
      }
    }
  }

  // Attach any Content Series without a brand_id to the default Brand
  await prisma.contentType.updateMany({
    where: { brand_id: null },
    data: { brand_id: defaultBrand.id },
  });

  return defaultBrand;
}
