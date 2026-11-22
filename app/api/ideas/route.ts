import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPermission, verifyPermission } from "@/lib/api-guard";
import { generateIdeaContentId } from "@/lib/id-generator";
import { ensureLegacyIdeasMigrated } from "@/lib/idea-migration";
import { hasNotesContent } from "@/lib/notes-utils";

const IDEA_INCLUDE = {
  brand: { select: { id: true, name: true, color: true } },
  content_type: {
    select: {
      id: true,
      name: true,
      prefix: true,
      brand_id: true,
      brand: { select: { id: true, name: true, color: true } },
    },
  },
  script: {
    select: {
      id: true,
      rows_data: true,
      custom_notes: true,
    },
  },
} as const;

type HydratedIdeaItem = {
  id: string;
  unique_content_id: string | null;
  title: string | null;
  excerpt: string | null;
  idea_status: string | null;
  is_pinned: boolean;
  brand_id: string | null;
  content_type_id: string | null;
  created_at: Date;
  drive_folders: string;
  raw_assets: string;
  brand: { id: string; name: string; color: string | null } | null;
  content_type: {
    id: string;
    name: string;
    prefix: string | null;
    brand_id: string | null;
    brand: { id: string; name: string; color: string | null } | null;
  } | null;
  script: {
    id: string;
    rows_data: string;
    custom_notes: string | null;
  } | null;
};

function formatIdeaResponse(item: HydratedIdeaItem) {
  const hasScript = Boolean(
    item.script &&
      ((item.script.rows_data && item.script.rows_data !== "[]") ||
        hasNotesContent(item.script.custom_notes))
  );
  const hasContent = Boolean(
    (item.drive_folders && item.drive_folders !== "{}") ||
      (item.raw_assets && item.raw_assets !== "[]")
  );

  return {
    id: item.id,
    unique_content_id: item.unique_content_id,
    title: item.title || "",
    excerpt: item.excerpt || "",
    idea_status: item.idea_status || null,
    is_pinned: Boolean(item.is_pinned),
    brand_id: item.brand_id,
    content_type_id: item.content_type_id,
    created_at: item.created_at,
    brand: item.brand || item.content_type?.brand || null,
    content_type: item.content_type,
    has_script: hasScript,
    has_content: hasContent,
  };
}

export async function GET(req: NextRequest) {
  const guard = await verifyPermission("idea:view");
  if (!guard.authorized) return guard.response;

  try {
    await ensureLegacyIdeasMigrated();

    const { searchParams } = new URL(req.url);
    const contentTypeId = searchParams.get("contentTypeId");
    const brandId = searchParams.get("brandId");
    const all = searchParams.get("all") === "true";

    const filters: Record<string, unknown>[] = [{ is_in_idea_bank: true }];

    if (!all) {
      if (brandId && contentTypeId) {
        filters.push({
          OR: [
            { brand_id: null, content_type_id: null },
            { brand_id: brandId, content_type_id: null },
            { content_type_id: contentTypeId },
          ],
        });
      } else if (brandId) {
        filters.push({
          OR: [
            { brand_id: null, content_type_id: null },
            { brand_id: brandId },
            { content_type: { brand_id: brandId } },
          ],
        });
      } else if (contentTypeId) {
        filters.push({
          OR: [{ content_type_id: null }, { content_type_id: contentTypeId }],
        });
      }
    }

    const ideas = await prisma.contentItem.findMany({
      where: filters.length === 1 ? filters[0] : { AND: filters },
      include: IDEA_INCLUDE,
      orderBy: [{ is_pinned: "desc" }, { created_at: "desc" }],
    });

    return NextResponse.json(ideas.map(formatIdeaResponse));
  } catch (error) {
    console.error("Error fetching Idea Bank:", error);
    return NextResponse.json({ error: "Failed to load Idea Bank" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await verifyPermission("idea:create");
  if (!guard.authorized) return guard.response;

  try {
    await ensureLegacyIdeasMigrated();

    const body = await req.json();
    const cleanTitle = typeof body.title === "string" ? body.title.trim() : "";
    const cleanExcerpt = typeof body.excerpt === "string" ? body.excerpt.trim() : "";

    if (!cleanTitle || !cleanExcerpt) {
      return NextResponse.json(
        { error: "Both title and excerpt are required" },
        { status: 400 }
      );
    }

    const contentTypeId: string | null = body.content_type_id || null;
    let resolvedBrandId: string | null = body.brand_id || null;

    if (contentTypeId) {
      const series = await prisma.contentType.findUnique({
        where: { id: contentTypeId },
        select: { id: true, brand_id: true },
      });
      if (!series) {
        return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
      }
      if (!resolvedBrandId && series.brand_id) {
        resolvedBrandId = series.brand_id;
      }
    }

    const cleanIdeaStatus =
      typeof body.idea_status === "string" && body.idea_status.trim()
        ? body.idea_status.trim()
        : null;
    const isPinned = Boolean(body.is_pinned);

    const uniqueContentId = await generateIdeaContentId(contentTypeId);

    const created = await prisma.contentItem.create({
      data: {
        unique_content_id: uniqueContentId,
        title: cleanTitle,
        excerpt: cleanExcerpt,
        idea_status: cleanIdeaStatus,
        is_pinned: isPinned,
        brand_id: resolvedBrandId,
        content_type_id: contentTypeId,
        is_in_idea_bank: true,
        publish_date: null,
      },
      include: IDEA_INCLUDE,
    });

    return NextResponse.json(formatIdeaResponse(created), { status: 201 });
  } catch (error) {
    console.error("Error creating idea:", error);
    return NextResponse.json({ error: "Failed to save idea" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await verifyPermission("idea:edit");
  if (!guard.authorized) return guard.response;

  try {
    await ensureLegacyIdeasMigrated();

    const body = await req.json();
    const {
      id,
      title,
      excerpt,
      idea_status,
      is_pinned,
      brand_id,
      content_type_id,
      regenerateId,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Idea id is required" }, { status: 400 });
    }

    const existing = await prisma.contentItem.findFirst({
      where: { id, is_in_idea_bank: true },
      include: {
        content_type: { select: { id: true, brand_id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      const cleanTitle = typeof title === "string" ? title.trim() : "";
      if (!cleanTitle) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      updateData.title = cleanTitle;
    }

    if (excerpt !== undefined) {
      const cleanExcerpt = typeof excerpt === "string" ? excerpt.trim() : "";
      if (!cleanExcerpt) {
        return NextResponse.json({ error: "Excerpt cannot be empty" }, { status: 400 });
      }
      updateData.excerpt = cleanExcerpt;
    }

    if (idea_status !== undefined) {
      updateData.idea_status =
        typeof idea_status === "string" && idea_status.trim() ? idea_status.trim() : null;
    }

    if (is_pinned !== undefined) {
      updateData.is_pinned = Boolean(is_pinned);
    }

    let nextBrandId = existing.brand_id;
    let nextContentTypeId = existing.content_type_id;

    if (brand_id !== undefined) {
      nextBrandId = brand_id || null;
      if (!nextBrandId) {
        // Clearing Brand clears Content Pipe so Brand and Pipe never mismatch
        nextContentTypeId = null;
      } else if (
        content_type_id === undefined &&
        nextContentTypeId &&
        existing.content_type?.brand_id !== nextBrandId
      ) {
        // Changing Brand to one that doesn't own the current Content Pipe clears the Pipe
        nextContentTypeId = null;
      }
    }

    if (content_type_id !== undefined) {
      nextContentTypeId = content_type_id || null;
      if (nextContentTypeId) {
        const series = await prisma.contentType.findUnique({
          where: { id: nextContentTypeId },
          select: { id: true, brand_id: true },
        });
        if (!series) {
          return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
        }
        if (series.brand_id) {
          nextBrandId = series.brand_id;
        }
      }
    }

    if (brand_id !== undefined || content_type_id !== undefined) {
      updateData.brand_id = nextBrandId;
      updateData.content_type_id = nextContentTypeId;
    }

    if (regenerateId === true && nextContentTypeId) {
      updateData.unique_content_id = await generateIdeaContentId(
        nextContentTypeId,
        existing.created_at
      );
    }

    const updated = await prisma.contentItem.update({
      where: { id: existing.id },
      data: updateData,
      include: IDEA_INCLUDE,
    });

    return NextResponse.json(formatIdeaResponse(updated));
  } catch (error) {
    console.error("Error updating idea:", error);
    return NextResponse.json({ error: "Failed to update idea" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const deleteCheck = await checkPermission("idea:delete");
  const createCheck = await checkPermission("idea:create");
  if (!deleteCheck.session && !createCheck.session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!deleteCheck.allowed && !createCheck.allowed) {
    return NextResponse.json(
      { error: "Forbidden: requires 'idea:delete' or 'idea:create' permission." },
      { status: 403 }
    );
  }

  try {
    await ensureLegacyIdeasMigrated();

    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");
    if (!id) {
      try {
        const body = await req.json();
        id = body?.id || null;
      } catch {
        id = null;
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Idea id is required" }, { status: 400 });
    }

    const existing = await prisma.contentItem.findFirst({
      where: { id, is_in_idea_bank: true },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    await prisma.contentItem.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, deleted: true, id: existing.id });
  } catch (error) {
    console.error("Error deleting idea:", error);
    return NextResponse.json({ error: "Failed to delete idea" }, { status: 500 });
  }
}
