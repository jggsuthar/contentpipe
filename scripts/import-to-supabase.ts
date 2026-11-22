import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Normalizes ISO date strings back to Date objects for Prisma inserts.
 */
function hydrateDates(rows: any[], dateFields: string[]): any[] {
  return rows.map((row) => {
    const copy: Record<string, any> = { ...row };
    for (const field of dateFields) {
      const val = copy[field];
      if (typeof val === "string" && val.length > 0) {
        copy[field] = new Date(val);
      }
    }
    return copy;
  });
}

async function main() {
  const snapshotPath = path.join(process.cwd(), "prisma", "sqlite-export.json");
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found at ${snapshotPath}. Run export-sqlite.ts first.`);
  }

  const raw = fs.readFileSync(snapshotPath, "utf-8");
  const data = JSON.parse(raw);

  console.log(`Importing snapshot from ${data.exportedAt} into Supabase PostgreSQL...`);

  // Insert in strict foreign-key dependency order with skipDuplicates so reruns are safe
  if (data.roles?.length) {
    await prisma.role.createMany({
      data: hydrateDates(data.roles, ["created_at", "updated_at"]),
      skipDuplicates: true,
    });
  }
  if (data.brands?.length) {
    await prisma.brand.createMany({
      data: hydrateDates(data.brands, ["created_at", "updated_at"]),
      skipDuplicates: true,
    });
  }
  if (data.contentTypes?.length) {
    await prisma.contentType.createMany({
      data: hydrateDates(data.contentTypes, ["cadence_start_date", "created_at"]),
      skipDuplicates: true,
    });
  }
  if (data.workflowTasks?.length) {
    await prisma.workflowTask.createMany({
      data: data.workflowTasks,
      skipDuplicates: true,
    });
  }
  if (data.miscTasks?.length) {
    await prisma.miscTask.createMany({
      data: data.miscTasks,
      skipDuplicates: true,
    });
  }
  if (data.contentItems?.length) {
    await prisma.contentItem.createMany({
      data: hydrateDates(data.contentItems, ["ideation_date", "publish_date", "created_at"]),
      skipDuplicates: true,
    });
  }
  if (data.taskInstances?.length) {
    await prisma.taskInstance.createMany({
      data: hydrateDates(data.taskInstances, [
        "target_date_worst_case",
        "target_date_team",
        "completed_at",
      ]),
      skipDuplicates: true,
    });
  }
  if (data.scripts?.length) {
    await prisma.script.createMany({
      data: hydrateDates(data.scripts, ["created_at", "updated_at"]),
      skipDuplicates: true,
    });
  }
  if (data.submissions?.length) {
    await prisma.submission.createMany({
      data: hydrateDates(data.submissions, ["created_at"]),
      skipDuplicates: true,
    });
  }
  if (data.comments?.length) {
    await prisma.comment.createMany({
      data: hydrateDates(data.comments, ["created_at"]),
      skipDuplicates: true,
    });
  }
  if (data.ideaBank?.length) {
    await prisma.ideaBank.createMany({
      data: data.ideaBank,
      skipDuplicates: true,
    });
  }
  if (data.creatorSettings?.length) {
    await prisma.creatorSettings.createMany({
      data: hydrateDates(data.creatorSettings, ["updated_at"]),
      skipDuplicates: true,
    });
  }

  console.log("Supabase import completed successfully!");
  console.log({
    roles: await prisma.role.count(),
    brands: await prisma.brand.count(),
    contentTypes: await prisma.contentType.count(),
    contentItems: await prisma.contentItem.count(),
    scripts: await prisma.script.count(),
  });
}

main()
  .catch((err) => {
    console.error("Supabase import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
