export function toUrlSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getBrandUrlSegment(brand: {
  id: string;
  name: string;
  slug?: string | null;
}): string {
  return brand.slug?.trim() || toUrlSlug(brand.name) || brand.id;
}

export function getSeriesUrlSegment(series: { id: string; name: string }): string {
  return toUrlSlug(series.name) || series.id;
}

export function matchesBrandParam(
  brand: { id: string; name: string; slug?: string | null },
  param: string
): boolean {
  const normalized = param.trim().toLowerCase();
  if (!normalized) return false;
  return (
    brand.id.toLowerCase() === normalized ||
    (brand.slug ? brand.slug.toLowerCase() === normalized : false) ||
    toUrlSlug(brand.name) === normalized
  );
}

export function matchesSeriesParam(
  series: { id: string; name: string },
  param: string
): boolean {
  const normalized = param.trim().toLowerCase();
  if (!normalized) return false;
  return (
    series.id.toLowerCase() === normalized ||
    toUrlSlug(series.name) === normalized
  );
}
