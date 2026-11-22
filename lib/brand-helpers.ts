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

let cachedDefaultBrand: Brand | null = null;
let inFlightBackfill: Promise<Brand> | null = null;

/**
 * Idempotent helper that ensures at least one default Brand exists ("Primary Brand")
 * and attaches any orphaned ContentType (Content Series) records where `brand_id IS NULL`
 * to that default Brand. Memoized per server instance so normal reads skip extra DB round trips.
 */
export async function ensureDefaultBrandAndBackfill(force = false): Promise<Brand> {
  if (!force && cachedDefaultBrand) {
    return cachedDefaultBrand;
  }
  if (!force && inFlightBackfill) {
    return inFlightBackfill;
  }

  inFlightBackfill = (async () => {
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

    await prisma.contentType.updateMany({
      where: { brand_id: null },
      data: { brand_id: defaultBrand.id },
    });

    cachedDefaultBrand = defaultBrand;
    return defaultBrand;
  })();

  try {
    return await inFlightBackfill;
  } finally {
    inFlightBackfill = null;
  }
}
