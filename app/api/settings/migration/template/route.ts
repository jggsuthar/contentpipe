import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { DEFAULT_SCRIPT_COL_DEFS, ScriptColumnDef } from "@/components/settings/content-types-tab";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "creator") {
    return NextResponse.json({ error: "Unauthorized: Creator only" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const contentTypeId = searchParams.get("content_type_id");

    if (!contentTypeId) {
      return NextResponse.json({ error: "content_type_id is required" }, { status: 400 });
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: contentTypeId },
      include: {
        workflow_tasks: {
          orderBy: { sequence_order: "asc" },
        },
      },
    });

    if (!contentType) {
      return NextResponse.json({ error: "Content Series not found" }, { status: 404 });
    }

    // 1. Identify intermediate workflow tasks (exclude Ideation and Publish)
    const intermediateTasks = contentType.workflow_tasks.filter((t) => {
      const name = t.task_name.toLowerCase().trim();
      return name !== "ideation" && name !== "publish" && !t.is_hidden;
    });

    // 2. Identify script custom columns
    let scriptCols: ScriptColumnDef[] = [];
    try {
      scriptCols = JSON.parse(contentType.script_default_columns || "[]");
    } catch {
      scriptCols = [];
    }

    if (!Array.isArray(scriptCols) || scriptCols.length === 0) {
      scriptCols = DEFAULT_SCRIPT_COL_DEFS;
    }
    scriptCols = scriptCols.filter((c) => c.id !== "col_sr" && c.id !== "sr_no");

    // 3. Construct Sheet 1: Index
    const indexHeaders = [
      "Content ID",
      "Content Title",
      ...intermediateTasks.map((t) => t.task_name),
      "Publish Date",
      "Content Link",
      "Archive",
    ];

    const prefix = contentType.prefix || "VID";
    const sampleId1 = `${prefix}-2610001`;
    const sampleId2 = `${prefix}-2610002`;

    const sampleIndexRow1 = [
      sampleId1,
      "10 Must-Know Tips for Better Content Production",
      ...intermediateTasks.map((_, i) => (i === 0 ? true : false)),
      "2026-11-20",
      "",
      false,
    ];

    const sampleIndexRow2 = [
      sampleId2,
      "Behind the Scenes: Complete Studio Tour",
      ...intermediateTasks.map(() => true),
      "2026-10-15",
      "https://youtube.com/watch?v=sample123",
      true,
    ];

    const indexSheetData = [indexHeaders, sampleIndexRow1, sampleIndexRow2];

    // 4. Construct Sheet 2: Scripts
    const scriptHeaders = ["Content ID", "Sr. No.", ...scriptCols.map((c) => c.name)];

    const sampleScriptRow1 = [
      sampleId1,
      1,
      ...scriptCols.map((c) => {
        const n = c.name.toLowerCase();
        if (n.includes("dialogue") || n.includes("speech") || n.includes("spoken")) {
          return "Hook: Here are 10 game-changing production tips...";
        }
        if (n.includes("roll")) return "A-Roll";
        if (n.includes("visual") || n.includes("cue")) return "Direct to camera, dynamic framing";
        if (n.includes("audio") || n.includes("sfx")) return "Subtle ambient background music";
        return "Sample note";
      }),
    ];

    const sampleScriptRow2 = [
      sampleId1,
      2,
      ...scriptCols.map((c) => {
        const n = c.name.toLowerCase();
        if (n.includes("dialogue") || n.includes("speech") || n.includes("spoken")) {
          return "Tip #1: Always calibrate your audio gain before recording.";
        }
        if (n.includes("roll")) return "B-Roll";
        if (n.includes("visual") || n.includes("cue")) return "Close-up of audio interface meters";
        if (n.includes("audio") || n.includes("sfx")) return "Whoosh sound effect on transition";
        return "Sample note";
      }),
    ];

    const scriptSheetData = [scriptHeaders, sampleScriptRow1, sampleScriptRow2];

    // 5. Generate Excel Workbook
    const wb = XLSX.utils.book_new();

    const wsIndex = XLSX.utils.aoa_to_sheet(indexSheetData);
    const wsScripts = XLSX.utils.aoa_to_sheet(scriptSheetData);

    // Set auto-fit column widths
    const setColWidths = (ws: XLSX.WorkSheet, data: any[][]) => {
      const colWidths = data[0].map((_, colIdx) => {
        let maxLen = 12;
        data.forEach((row) => {
          const val = row[colIdx] ? String(row[colIdx]) : "";
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(maxLen + 3, 50) };
      });
      ws["!cols"] = colWidths;
    };

    setColWidths(wsIndex, indexSheetData);
    setColWidths(wsScripts, scriptSheetData);

    XLSX.utils.book_append_sheet(wb, wsIndex, "Index");
    XLSX.utils.book_append_sheet(wb, wsScripts, "Scripts");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeName = contentType.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeName}_Migration_Template.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating migration template:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate template" },
      { status: 500 }
    );
  }
}
