import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Creator Production Register Database Seeding...\n");

  // Read optional CLI email argument: e.g. npm run db:seed -- myotheremail@gmail.com
  const customEmail = process.argv.slice(2).find((arg) => arg.includes("@"));
  const teamMemberEmail = (
    customEmail ||
    process.env.TEAM_MEMBER_EMAIL ||
    "editor.contentpipe@gmail.com"
  )
    .trim()
    .toLowerCase();

  console.log(`👤 Seeding sample Team Member with email: ${teamMemberEmail}`);

  // 1. Seed or update sample team member in `roles`
  const editorRole = await prisma.role.upsert({
    where: { email: teamMemberEmail },
    update: {
      name: "Alex Rivera",
      role_title: "Lead Video Editor",
      assigned_content_types: JSON.stringify(["Shorts"]),
      permissions: JSON.stringify({
        can_view: true,
        can_edit: true,
        can_contribute: true,
        can_submit: true,
        submission_task: "Edit",
        allowed_tasks: ["Edit", "Script"],
      }),
    },
    create: {
      name: "Alex Rivera",
      email: teamMemberEmail,
      role_title: "Lead Video Editor",
      assigned_content_types: JSON.stringify(["Shorts"]),
      permissions: JSON.stringify({
        can_view: true,
        can_edit: true,
        can_contribute: true,
        can_submit: true,
        submission_task: "Edit",
        allowed_tasks: ["Edit", "Script"],
      }),
    },
  });

  console.log(`✅ Role seeded: ${editorRole.name} (${editorRole.email}) - ${editorRole.role_title}`);

  // 2. Seed Default Brand: "Primary Brand"
  console.log("🏷️ Seeding Brand: Primary Brand...");
  const primaryBrand = await prisma.brand.upsert({
    where: { name: "Primary Brand" },
    update: { is_default: true },
    create: {
      name: "Primary Brand",
      slug: "primary-brand",
      description: "Default brand for your content series",
      color: "#6366f1",
      is_default: true,
    },
  });

  // 3. Seed Content Series: "Shorts"
  console.log("🎬 Seeding Content Series: Shorts...");

  const shortsType = await prisma.contentType.upsert({
    where: {
      brand_id_name: {
        brand_id: primaryBrand.id,
        name: "Shorts",
      },
    },
    update: {
      prefix: "SH-",
      id_generation_type: "date_counter", // e.g. SH-2610001
      default_months_open: 3,
      cadence_type: "weekly",
      cadence_start_date: new Date("2026-10-01T00:00:00Z"),
      upload_days: JSON.stringify(["Tuesday", "Saturday"]),
      script_default_columns: JSON.stringify([
        { id: "col_sr", name: "Sr. No.", type: "text", width: "70px" },
        {
          id: "col_roll",
          name: "Roll Type",
          type: "dropdown",
          width: "140px",
          options: ["A-Roll", "B-Roll", "Screen Recording", "Skit"],
        },
        { id: "col_dialogue", name: "Dialogue / Spoken Words", type: "text", width: "320px" },
        { id: "col_visual", name: "Visual / B-Roll Cue", type: "text", width: "220px" },
        { id: "col_audio", name: "Audio / SFX Cue", type: "text", width: "180px" },
      ]),
    },
    create: {
      brand_id: primaryBrand.id,
      name: "Shorts",
      prefix: "SH-",
      id_generation_type: "date_counter",
      default_months_open: 3,
      cadence_type: "weekly",
      cadence_start_date: new Date("2026-10-01T00:00:00Z"),
      upload_days: JSON.stringify(["Tuesday", "Saturday"]),
      script_default_columns: JSON.stringify([
        { id: "col_sr", name: "Sr. No.", type: "text", width: "70px" },
        {
          id: "col_roll",
          name: "Roll Type",
          type: "dropdown",
          width: "140px",
          options: ["A-Roll", "B-Roll", "Screen Recording", "Skit"],
        },
        { id: "col_dialogue", name: "Dialogue / Spoken Words", type: "text", width: "320px" },
        { id: "col_visual", name: "Visual / B-Roll Cue", type: "text", width: "220px" },
        { id: "col_audio", name: "Audio / SFX Cue", type: "text", width: "180px" },
      ]),
    },
  });

  console.log(`✅ Content Type seeded: ${shortsType.name} (Prefix: ${shortsType.prefix})`);

  // 3. Clear existing workflow & misc tasks for clean idempotent seed
  await prisma.workflowTask.deleteMany({
    where: { content_type_id: shortsType.id },
  });
  await prisma.miscTask.deleteMany({
    where: { content_type_id: shortsType.id },
  });

  // 4. Seed Sequential Workflow Tasks per SPEC.md Section 3.2
  // Sequence: Ideation -> Script -> Shoot -> Edit -> Schedule -> Publish
  const workflowTasks = [
    { task_name: "Ideation", sequence_order: 1, n_days_offset: 14, team_buffer_days: 0 },
    { task_name: "Script", sequence_order: 2, n_days_offset: 10, team_buffer_days: 2 },
    { task_name: "Shoot", sequence_order: 3, n_days_offset: 7, team_buffer_days: 0 },
    { task_name: "Edit", sequence_order: 4, n_days_offset: 4, team_buffer_days: 2 },
    { task_name: "Schedule", sequence_order: 5, n_days_offset: 1, team_buffer_days: 0 },
    { task_name: "Publish", sequence_order: 6, n_days_offset: 0, team_buffer_days: 0 },
  ];

  for (const task of workflowTasks) {
    await prisma.workflowTask.create({
      data: {
        content_type_id: shortsType.id,
        task_name: task.task_name,
        sequence_order: task.sequence_order,
        n_days_offset: task.n_days_offset,
        team_buffer_days: task.team_buffer_days,
        is_hidden: false,
      },
    });
  }

  console.log(`✅ Seeded ${workflowTasks.length} sequential workflow tasks for Shorts.`);

  // 5. Seed Misc Tasks (Non-sequential checklist tasks per SPEC.md Section 3.2 A)
  const miscTasks = [
    "Thumbnail Design",
    "Title & Description Optimization",
    "Pinned Comment & Links",
  ];

  for (const task of miscTasks) {
    await prisma.miscTask.create({
      data: {
        content_type_id: shortsType.id,
        task_name: task,
      },
    });
  }

  console.log(`✅ Seeded ${miscTasks.length} misc checklist tasks.`);

  // 6. Seed sample Idea in Idea Bank
  await prisma.ideaBank.create({
    data: {
      content_type_id: shortsType.id,
      title: "How I automated my creator production pipeline in 7 days",
      notes: "Show real time-tracker comparison and Google Drive folder structure walkthrough.",
      is_assigned: false,
    },
  });

  console.log("✅ Seeded sample Idea Bank card.\n");

  console.log("✨ Seeding completed successfully!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
