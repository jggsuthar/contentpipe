import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("Exporting local SQLite data from prisma/dev.db...");

  const payload = {
    exportedAt: new Date().toISOString(),
    roles: await prisma.role.findMany(),
    brands: await prisma.brand.findMany(),
    contentTypes: await prisma.contentType.findMany(),
    workflowTasks: await prisma.workflowTask.findMany(),
    miscTasks: await prisma.miscTask.findMany(),
    contentItems: await prisma.contentItem.findMany(),
    taskInstances: await prisma.taskInstance.findMany(),
    scripts: await prisma.script.findMany(),
    submissions: await prisma.submission.findMany(),
    comments: await prisma.comment.findMany(),
    ideaBank: await prisma.ideaBank.findMany(),
    creatorSettings: await prisma.creatorSettings.findMany(),
    scheduleZones: await prisma.scheduleZone.findMany(),
    weeklyZoneSlots: await prisma.weeklyZoneSlot.findMany(),
    weeklyDayBounds: await prisma.weeklyDayBounds.findMany(),
    calendarDateOverrides: await prisma.calendarDateOverride.findMany(),
    personalTodos: await prisma.personalTodo.findMany(),
    scheduledAllocations: await prisma.scheduledAllocation.findMany(),
  };

  const outPath = path.join(process.cwd(), "prisma", "sqlite-export.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");

  console.log("Exported counts:");
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      console.log(`  - ${key}: ${value.length}`);
    }
  }
  console.log(`Saved snapshot to ${outPath}`);
}

main()
  .catch((err) => {
    console.error("SQLite export failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
