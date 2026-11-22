import prisma from "@/lib/prisma";

interface ContentTypeInfo {
  id: string;
  name: string;
  prefix: string | null;
  suffix: string | null;
  id_generation_type: "sequential" | "date_counter" | string;
}

/**
 * Generates the next Unique Content ID according to SPEC.md Section 3.1 item 2.
 */
export async function generateNextContentId(
  contentType: ContentTypeInfo,
  ideationDate: Date = new Date()
): Promise<string> {
  const prefix = contentType.prefix || "";
  const suffix = contentType.suffix || "";

  if (contentType.id_generation_type === "sequential") {
    // Type 1: Simple Sequential (1, 2, 3...)
    const existingItems = await prisma.contentItem.findMany({
      where: {
        content_type_id: contentType.id,
        unique_content_id: { not: null },
      },
      select: { unique_content_id: true },
    });

    let maxNum = 0;
    for (const item of existingItems) {
      if (!item.unique_content_id) continue;
      // Extract numeric portion
      const match = item.unique_content_id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    const nextSeq = maxNum + 1;
    return `${prefix}${nextSeq}${suffix}`;
  } else {
    // Type 2: Date & Monthly Counter (YYMMnnn)
    // Derived from actual Ideation Date
    const fullYear = ideationDate.getFullYear();
    const yy = fullYear.toString().slice(-2);
    const mm = (ideationDate.getMonth() + 1).toString().padStart(2, "0");
    const ymPrefix = `${yy}${mm}`;

    // Find all items created in this content type with this YYMM
    const existingItems = await prisma.contentItem.findMany({
      where: {
        content_type_id: contentType.id,
        unique_content_id: {
          contains: ymPrefix,
        },
      },
      select: { unique_content_id: true },
    });

    let maxCounter = 0;
    for (const item of existingItems) {
      if (!item.unique_content_id) continue;
      // Search for YYMM followed by numbers
      const regex = new RegExp(`${ymPrefix}(\\d{3,})`);
      const match = item.unique_content_id.match(regex);
      if (match && match[1]) {
        const counter = parseInt(match[1], 10);
        if (counter > maxCounter) maxCounter = counter;
      }
    }

    const nextCounter = (maxCounter + 1).toString().padStart(3, "0");
    return `${prefix}${ymPrefix}${nextCounter}${suffix}`;
  }
}

async function isUniqueContentIdTaken(uniqueContentId: string): Promise<boolean> {
  const existing = await prisma.contentItem.findUnique({
    where: { unique_content_id: uniqueContentId },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Generates a permanent Unique Content ID for an Idea Bank item.
 * Uses the selected Content Series prefix/format when provided, or a universal
 * "ID-" prefix formatted according to CreatorSettings.default_id_generation_type.
 */
export async function generateIdeaContentId(
  contentTypeId?: string | null,
  createdAt: Date = new Date()
): Promise<string> {
  if (contentTypeId) {
    const contentType = await prisma.contentType.findUnique({
      where: { id: contentTypeId },
      select: {
        id: true,
        name: true,
        prefix: true,
        suffix: true,
        id_generation_type: true,
      },
    });

    if (contentType) {
      const candidate = await generateNextContentId(contentType, createdAt);
      if (!(await isUniqueContentIdTaken(candidate))) {
        return candidate;
      }
      // Fallback if another series or item already holds this ID
      let suffixIndex = 2;
      while (await isUniqueContentIdTaken(`${candidate}-${suffixIndex}`)) {
        suffixIndex += 1;
      }
      return `${candidate}-${suffixIndex}`;
    }
  }

  const settings =
    (await prisma.creatorSettings.findUnique({
      where: { id: "default" },
      select: { default_id_generation_type: true },
    })) ??
    (await prisma.creatorSettings.findFirst({
      select: { default_id_generation_type: true },
    }));

  const idGenType = settings?.default_id_generation_type || "date_counter";

  if (idGenType === "sequential") {
    const existingItems = await prisma.contentItem.findMany({
      where: {
        unique_content_id: { startsWith: "ID-" },
      },
      select: { unique_content_id: true },
    });

    let maxNum = 0;
    for (const item of existingItems) {
      if (!item.unique_content_id) continue;
      // Match sequential IDs (ID-1, ID-2...) without colliding with YYMMnnn IDs
      const match = item.unique_content_id.match(/^ID-(\d{1,5})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    let nextSeq = maxNum + 1;
    let candidate = `ID-${nextSeq}`;
    while (await isUniqueContentIdTaken(candidate)) {
      nextSeq += 1;
      candidate = `ID-${nextSeq}`;
    }
    return candidate;
  }

  const fullYear = createdAt.getFullYear();
  const yy = fullYear.toString().slice(-2);
  const mm = (createdAt.getMonth() + 1).toString().padStart(2, "0");
  const ymPrefix = `${yy}${mm}`;
  const idPrefix = `ID-${ymPrefix}`;

  const existingItems = await prisma.contentItem.findMany({
    where: {
      unique_content_id: { startsWith: idPrefix },
    },
    select: { unique_content_id: true },
  });

  let maxCounter = 0;
  const regex = new RegExp(`^ID-${ymPrefix}(\\d{3,})$`);
  for (const item of existingItems) {
    if (!item.unique_content_id) continue;
    const match = item.unique_content_id.match(regex);
    if (match && match[1]) {
      const counter = parseInt(match[1], 10);
      if (counter > maxCounter) maxCounter = counter;
    }
  }

  let nextCounter = maxCounter + 1;
  let candidate = `${idPrefix}${nextCounter.toString().padStart(3, "0")}`;
  while (await isUniqueContentIdTaken(candidate)) {
    nextCounter += 1;
    candidate = `${idPrefix}${nextCounter.toString().padStart(3, "0")}`;
  }
  return candidate;
}
