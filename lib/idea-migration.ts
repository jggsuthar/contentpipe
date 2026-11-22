import prisma from "@/lib/prisma";
import { generateIdeaContentId } from "@/lib/id-generator";

let migrationCompleted = false;
let migrationInFlight: Promise<void> | null = null;

/**
 * One-time idempotent migration that promotes any remaining unassigned legacy
 * IdeaBank rows into unified ContentItem records with permanent Content IDs.
 */
export async function ensureLegacyIdeasMigrated(): Promise<void> {
  if (migrationCompleted) {
    return;
  }

  if (migrationInFlight) {
    return migrationInFlight;
  }

  migrationInFlight = (async () => {
    const unassignedCount = await prisma.ideaBank.count({
      where: { is_assigned: false },
    });

    if (unassignedCount === 0) {
      migrationCompleted = true;
      return;
    }

    const legacyIdeas = await prisma.ideaBank.findMany({
      where: { is_assigned: false },
    });

    for (const idea of legacyIdeas) {
      const uniqueContentId = await generateIdeaContentId(idea.content_type_id);

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.ideaBank.updateMany({
          where: { id: idea.id, is_assigned: false },
          data: { is_assigned: true },
        });

        if (claimed.count === 0) {
          return;
        }

        await tx.contentItem.create({
          data: {
            title: idea.title,
            excerpt: idea.notes || "No excerpt provided",
            brand_id: idea.brand_id || null,
            content_type_id: idea.content_type_id || null,
            is_in_idea_bank: true,
            publish_date: null,
            unique_content_id: uniqueContentId,
          },
        });
      });
    }

    migrationCompleted = true;
  })().finally(() => {
    migrationInFlight = null;
  });

  return migrationInFlight;
}
