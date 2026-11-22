import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveTaskColorHex } from "@/lib/task-colors";
import { generateFuturePublishDates, checkDateCadenceMatch, CadenceConfig } from "@/lib/cadence";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const contentTypeId = searchParams.get("content_type_id");

    // 1. Resolve Active Content Type
    let activeContentType = null;
    if (contentTypeId) {
      activeContentType = await prisma.contentType.findUnique({
        where: { id: contentTypeId },
        include: {
          workflow_tasks: {
            orderBy: { sequence_order: "asc" },
          },
        },
      });
    }

    if (!activeContentType) {
      activeContentType = await prisma.contentType.findFirst({
        orderBy: { created_at: "asc" },
        include: {
          workflow_tasks: {
            orderBy: { sequence_order: "asc" },
          },
        },
      });
    }

    if (!activeContentType) {
      return NextResponse.json({ error: "No Content Series found" }, { status: 404 });
    }

    // 2. Define 6-Month Range (Starting from 1st of Current Month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (e.g. 10 for November)

    const startOfRange = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    // 6 months total: current month + next 5 months
    const endOfRange = new Date(currentYear, currentMonth + 6, 0, 23, 59, 59, 999);

    // 3. Query existing content items in the 6-month window
    const contentItems = await prisma.contentItem.findMany({
      where: {
        content_type_id: activeContentType.id,
        is_in_idea_bank: false,
        publish_date: {
          gte: startOfRange,
          lte: endOfRange,
        },
      },
      include: {
        task_instances: true,
      },
      orderBy: { publish_date: "asc" },
    });

    // 4. Generate Cadence Future Publish Dates to cover uninstantiated placeholders
    let parsedUploadDays: string[] = ["Tuesday"];
    try {
      parsedUploadDays = JSON.parse(activeContentType.upload_days || "[\"Tuesday\"]");
    } catch {
      parsedUploadDays = ["Tuesday"];
    }

    const cadenceConfig: CadenceConfig = {
      cadence_type: activeContentType.cadence_type as any,
      cadence_start_date: activeContentType.cadence_start_date,
      upload_days: parsedUploadDays,
      default_months_open: 6,
    };

    const futurePublishDates = generateFuturePublishDates(cadenceConfig, 6, startOfRange);

    let skippedDates: string[] = [];
    try {
      skippedDates = JSON.parse(activeContentType.skipped_publish_dates || "[]");
    } catch {
      skippedDates = [];
    }

    const visibleWorkflowTasks = activeContentType.workflow_tasks.filter((t) => !t.is_hidden);

    // Helper: format YYYY-MM-DD key using the calendar date of the Date object
    const formatDateKey = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const todayLocalKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 5. Map content items and cadence dates to itemsByDate dictionary
    const itemsByDate: Record<
      string,
      {
        content_id: string | null;
        title: string;
        is_placeholder: boolean;
        is_manual_publish_date?: boolean;
        cadence_match?: { matches: boolean; reason: string };
        is_archived: boolean;
        publish_date: string;
        last_done_task_name: string | null;
        last_done_color: string | null;
        all_tasks_done: boolean;
      }
    > = {};

    // First map existing content items from DB
    for (const item of contentItems) {
      if (!item.publish_date) continue;
      const itemDate = new Date(item.publish_date);
      const key = formatDateKey(itemDate);

      // Evaluate last done task in sequence
      let lastDoneTaskName: string | null = null;
      let lastDoneColor: string | null = null;
      let allPriorDone = true;

      for (let i = 0; i < visibleWorkflowTasks.length; i++) {
        const t = visibleWorkflowTasks[i];
        const tKey = t.task_name.toLowerCase();
        let isDone = false;

        if (tKey === "ideation") {
          isDone = Boolean(item.title && item.unique_content_id);
        } else if (tKey === "publish") {
          const itemPDate = new Date(item.publish_date);
          itemPDate.setHours(0, 0, 0, 0);
          const todayMid = new Date();
          todayMid.setHours(0, 0, 0, 0);
          isDone = allPriorDone && todayMid.getTime() >= itemPDate.getTime();
        } else {
          isDone = item.task_instances.find((ti) => ti.task_name.toLowerCase() === tKey)?.status === "done";
        }

        if (isDone) {
          lastDoneTaskName = t.task_name;
          lastDoneColor = resolveTaskColorHex(t.task_name, t.color);
        } else {
          allPriorDone = false;
        }
      }

      const isManual = Boolean(item.is_manual_publish_date);
      const cadenceCheck = checkDateCadenceMatch(item.publish_date, cadenceConfig);

      const itemPayload = {
        content_id: item.unique_content_id,
        title: item.title || "",
        is_placeholder: !item.title,
        is_manual_publish_date: isManual,
        cadence_match: cadenceCheck,
        is_archived: item.is_archived,
        publish_date: item.publish_date.toISOString(),
        last_done_task_name: lastDoneTaskName,
        last_done_color: lastDoneColor,
        all_tasks_done: allPriorDone,
      };

      itemsByDate[key] = itemPayload;
    }

    // Next, map any future cadence dates that don't have a content item yet (Open Slots)
    for (const cadDate of futurePublishDates) {
      const key = formatDateKey(cadDate);
      if (skippedDates.includes(key)) continue;

      if (!itemsByDate[key]) {
        const cadenceCheck = checkDateCadenceMatch(cadDate, cadenceConfig);
        const placeholderPayload = {
          content_id: null,
          title: "",
          is_placeholder: true,
          is_manual_publish_date: false,
          cadence_match: cadenceCheck,
          is_archived: false,
          publish_date: cadDate.toISOString(),
          last_done_task_name: null,
          last_done_color: null,
          all_tasks_done: false,
        };
        itemsByDate[key] = placeholderPayload;
      }
    }

    // 6. Build the 6 Months metadata (e.g. Nov-2026, Dec-2026, Jan-2027...)
    const MONTH_NAMES_SHORT = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const months = [];
    for (let i = 0; i < 6; i++) {
      const mDate = new Date(currentYear, currentMonth + i, 1);
      const y = mDate.getFullYear();
      const m = mDate.getMonth();
      const label = `${MONTH_NAMES_SHORT[m]}-${y}`;
      const firstDayOfWeek = new Date(y, m, 1).getDay(); // 0 = Sunday
      const daysCount = new Date(y, m + 1, 0).getDate();

      months.push({
        index: i,
        year: y,
        month: m,
        label,
        firstDayOfWeek,
        daysCount,
      });
    }

    return NextResponse.json({
      success: true,
      contentType: {
        id: activeContentType.id,
        name: activeContentType.name,
      },
      today: todayLocalKey,
      months,
      itemsByDate,
      workflowTasks: visibleWorkflowTasks.map((t) => ({
        id: t.id,
        task_name: t.task_name,
        color: resolveTaskColorHex(t.task_name, t.color),
      })),
    });
  } catch (error) {
    console.error("Error generating 6-month publish calendar:", error);
    return NextResponse.json(
      { error: "Failed to generate publish calendar" },
      { status: 500 }
    );
  }
}
