import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  parseMigrationDate,
  parseMigrationBoolean,
  DateMappingConfig,
  MigrationIssue,
  ParsedIndexItem,
  ParsedScriptRow,
} from "@/lib/migration-parser";
import { DEFAULT_SCRIPT_COL_DEFS, ScriptColumnDef } from "@/components/settings/content-types-tab";
import { checkDateCadenceMatch, CadenceConfig } from "@/lib/cadence";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "creator") {
    return NextResponse.json({ error: "Unauthorized: Creator role required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      action = "validate", // "validate" | "execute"
      content_type_id,
      index_rows = [],
      scripts_rows = [],
      date_mapping = { mode: "custom_format", formatPattern: "YYYY-MM-DD" },
      conflict_resolution = "overwrite", // "overwrite" | "skip"
    } = body;

    if (!content_type_id) {
      return NextResponse.json({ error: "content_type_id is required" }, { status: 400 });
    }

    const contentType = await prisma.contentType.findUnique({
      where: { id: content_type_id },
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

    // 3. Query existing Content IDs in DB to detect conflicts
    const existingDbItems = await prisma.contentItem.findMany({
      select: { unique_content_id: true, id: true, title: true },
    });
    const existingDbIdSet = new Set(
      existingDbItems.map((i) => i.unique_content_id).filter(Boolean) as string[]
    );

    // 4. Validate & Parse Sheet 1: Index Rows
    const issues: MigrationIssue[] = [];
    const parsedIndexItems: ParsedIndexItem[] = [];
    const seenContentIds = new Set<string>();

    if (!Array.isArray(index_rows) || index_rows.length === 0) {
      issues.push({
        sheet: "Index",
        rowNumber: 1,
        field: "Sheet",
        message: "The 'Index' sheet is empty or contains no data rows.",
        severity: "error",
      });
    }

    index_rows.forEach((row: any, idx: number) => {
      const rowNum = idx + 2; // Excel row numbering (header = row 1)

      // Find Content ID
      let rawContentId = "";
      let rawTitle = "";
      let rawPublishDate: any = null;
      let rawContentLink: any = null;
      let rawArchive: any = null;
      const taskStatuses: Record<string, boolean> = {};

      Object.entries(row).forEach(([key, val]) => {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        if (cleanKey.includes("contentid") || cleanKey === "id") {
          rawContentId = val ? String(val).trim() : "";
        } else if (cleanKey.includes("title") || cleanKey.includes("name")) {
          rawTitle = val ? String(val).trim() : "";
        } else if (cleanKey.includes("publish") || cleanKey.includes("date")) {
          rawPublishDate = val;
        } else if (cleanKey.includes("link") || cleanKey.includes("url")) {
          rawContentLink = val ? String(val).trim() : null;
        } else if (cleanKey.includes("archive")) {
          rawArchive = val;
        } else {
          // Check dynamic intermediate workflow task matches
          const matchedTask = intermediateTasks.find(
            (t) => t.task_name.trim().toLowerCase() === key.trim().toLowerCase()
          );
          if (matchedTask) {
            taskStatuses[matchedTask.task_name] = parseMigrationBoolean(val);
          }
        }
      });

      // Validation Checks for Index row
      if (!rawContentId) {
        issues.push({
          sheet: "Index",
          rowNumber: rowNum,
          field: "Content ID",
          message: "Missing Content ID.",
          severity: "error",
        });
      } else if (seenContentIds.has(rawContentId)) {
        issues.push({
          sheet: "Index",
          rowNumber: rowNum,
          contentId: rawContentId,
          field: "Content ID",
          message: `Duplicate Content ID '${rawContentId}' within the uploaded file.`,
          severity: "error",
        });
      } else {
        seenContentIds.add(rawContentId);
        if (existingDbIdSet.has(rawContentId)) {
          issues.push({
            sheet: "Index",
            rowNumber: rowNum,
            contentId: rawContentId,
            field: "Content ID",
            message: `Content ID '${rawContentId}' already exists in database (${
              conflict_resolution === "overwrite" ? "will be overwritten" : "will be skipped"
            }).`,
            severity: "warning",
          });
        }
      }

      if (!rawTitle) {
        issues.push({
          sheet: "Index",
          rowNumber: rowNum,
          contentId: rawContentId,
          field: "Content Title",
          message: "Missing Content Title.",
          severity: "error",
        });
      }

      const parsedDate = parseMigrationDate(rawPublishDate, date_mapping);
      if (!parsedDate) {
        issues.push({
          sheet: "Index",
          rowNumber: rowNum,
          contentId: rawContentId,
          field: "Publish Date",
          message: `Invalid or unparseable Publish Date '${rawPublishDate ?? ""}'.`,
          severity: "error",
        });
      }

      if (rawContentId && rawTitle && parsedDate) {
        parsedIndexItems.push({
          rowNumber: rowNum,
          contentId: rawContentId,
          title: rawTitle,
          taskStatuses,
          publishDate: parsedDate,
          publishDateRaw: rawPublishDate,
          contentLink: rawContentLink,
          isArchived: parseMigrationBoolean(rawArchive),
        });
      }
    });

    // 5. Validate & Parse Sheet 2: Scripts Rows
    const parsedScriptRows: ParsedScriptRow[] = [];

    scripts_rows.forEach((row: any, idx: number) => {
      const rowNum = idx + 2;

      let rawContentId = "";
      let rawSrNo: any = null;
      const scriptData: Record<string, any> = {};

      Object.entries(row).forEach(([key, val]) => {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        if (cleanKey.includes("contentid") || cleanKey === "id") {
          rawContentId = val ? String(val).trim() : "";
        } else if (cleanKey.includes("sr") || cleanKey.includes("no") || cleanKey.includes("seq")) {
          rawSrNo = val;
        } else {
          // Check dynamic script column matches
          const matchedCol = scriptCols.find(
            (c) =>
              c.name.trim().toLowerCase() === key.trim().toLowerCase() ||
              c.id.trim().toLowerCase() === key.trim().toLowerCase()
          );
          if (matchedCol) {
            scriptData[matchedCol.id] = val !== null && val !== undefined ? String(val).trim() : "";
          } else {
            // Also preserve key by sanitized name
            const colId = `col_${key.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
            scriptData[colId] = val !== null && val !== undefined ? String(val).trim() : "";
          }
        }
      });

      if (!rawContentId) {
        issues.push({
          sheet: "Scripts",
          rowNumber: rowNum,
          field: "Content ID",
          message: "Missing Content ID in Scripts row.",
          severity: "error",
        });
      } else if (!seenContentIds.has(rawContentId) && !existingDbIdSet.has(rawContentId)) {
        issues.push({
          sheet: "Scripts",
          rowNumber: rowNum,
          contentId: rawContentId,
          field: "Content ID",
          message: `Script references Content ID '${rawContentId}', which does not exist in the Index sheet or database.`,
          severity: "warning",
        });
      }

      const srNo = rawSrNo ? parseInt(String(rawSrNo), 10) : idx + 1;

      if (rawContentId) {
        parsedScriptRows.push({
          rowNumber: rowNum,
          contentId: rawContentId,
          srNo: isNaN(srNo) ? idx + 1 : srNo,
          data: scriptData,
        });
      }
    });

    // 6. Summary Statistics
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const uniqueScriptContentIds = new Set(parsedScriptRows.map((s) => s.contentId));

    const summary = {
      totalIndexRows: index_rows.length,
      validIndexItemsCount: parsedIndexItems.length,
      activeCount: parsedIndexItems.filter((i) => !i.isArchived).length,
      archiveCount: parsedIndexItems.filter((i) => i.isArchived).length,
      totalScriptRows: parsedScriptRows.length,
      uniqueScriptsCount: uniqueScriptContentIds.size,
      errorCount,
      warningCount,
      conflictCount: parsedIndexItems.filter((i) => existingDbIdSet.has(i.contentId)).length,
    };

    // If action is "validate", return preview and validation report immediately
    if (action === "validate") {
      return NextResponse.json({
        success: errorCount === 0,
        summary,
        issues,
        previewIndex: parsedIndexItems.slice(0, 10),
        previewScripts: parsedScriptRows.slice(0, 15),
      });
    }

    // -------------------------------------------------------------
    // Action: "execute" - Atomic Transaction Commit (Bypassing Automations)
    // -------------------------------------------------------------
    if (errorCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot execute migration: ${errorCount} validation error(s) must be resolved.`,
          issues,
        },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visibleWorkflowTasks = contentType.workflow_tasks.filter((t) => !t.is_hidden);

    let parsedUploadDays: string[] = ["Tuesday"];
    try {
      parsedUploadDays = JSON.parse(contentType.upload_days || "[\"Tuesday\"]");
    } catch {
      parsedUploadDays = ["Tuesday"];
    }
    const migrationCadenceConfig: CadenceConfig = {
      cadence_type: contentType.cadence_type as any,
      cadence_start_date: contentType.cadence_start_date,
      upload_days: parsedUploadDays,
    };

    const existingIdByContentId = new Map<string, string>();
    for (const row of existingDbItems) {
      if (row.unique_content_id) {
        existingIdByContentId.set(row.unique_content_id, row.id);
      }
    }

    const transactionResult = await prisma.$transaction(
      async (tx) => {
        let createdCount = 0;
        let updatedCount = 0;
        let scriptCount = 0;

        const itemRecordMap = new Map<string, string>(); // contentId -> ContentItem.id
        const overwriteItemIds: string[] = [];
        const pendingTaskItems: { itemId: string; item: ParsedIndexItem }[] = [];

        // 1. Process and save Content Items (no per-row findUnique/deleteMany/createMany N+1 round-trips)
        for (const item of parsedIndexItems) {
          const existingId = existingIdByContentId.get(item.contentId);
          let itemId: string;

          const matchesCadence = checkDateCadenceMatch(
            item.publishDate,
            migrationCadenceConfig
          ).matches;

          if (existingId) {
            if (conflict_resolution === "skip") {
              itemRecordMap.set(item.contentId, existingId);
              continue;
            }

            const updated = await tx.contentItem.update({
              where: { id: existingId },
              data: {
                content_type_id: contentType.id,
                brand_id: contentType.brand_id || null,
                title: item.title,
                publish_date: item.publishDate,
                published_url: item.contentLink || null,
                is_archived: item.isArchived,
                is_manual_publish_date: !matchesCadence,
              },
            });
            itemId = updated.id;
            updatedCount++;
            overwriteItemIds.push(itemId);
          } else {
            const created = await tx.contentItem.create({
              data: {
                content_type_id: contentType.id,
                brand_id: contentType.brand_id || null,
                unique_content_id: item.contentId,
                title: item.title,
                ideation_date: new Date(),
                publish_date: item.publishDate,
                published_url: item.contentLink || null,
                is_archived: item.isArchived,
                is_manual_publish_date: !matchesCadence,
              },
            });
            itemId = created.id;
            createdCount++;
          }

          itemRecordMap.set(item.contentId, itemId);
          pendingTaskItems.push({ itemId, item });
        }

        // 2. Batch delete & batch create TaskInstances in 2 queries instead of 2*N queries
        if (overwriteItemIds.length > 0) {
          await tx.taskInstance.deleteMany({
            where: { content_item_id: { in: overwriteItemIds } },
          });
        }

        const allTaskCreateData = pendingTaskItems.flatMap(({ itemId, item }) =>
          visibleWorkflowTasks.map((t) => {
            const tKey = t.task_name.toLowerCase().trim();
            let status = "not_done";

            if (tKey === "ideation") {
              status = "done";
            } else if (tKey === "publish") {
              const pTime = item.publishDate.getTime();
              status = item.isArchived || pTime <= today.getTime() ? "done" : "not_done";
            } else {
              const isDone = Boolean(item.taskStatuses[t.task_name]);
              status = isDone ? "done" : "not_done";
            }

            return {
              content_item_id: itemId,
              task_name: t.task_name,
              status,
            };
          })
        );

        if (allTaskCreateData.length > 0) {
          await tx.taskInstance.createMany({
            data: allTaskCreateData,
          });
        }

        // 3. Process and save Scripts rows
        const scriptsByContentId = new Map<string, ParsedScriptRow[]>();
        for (const sRow of parsedScriptRows) {
          const list = scriptsByContentId.get(sRow.contentId) || [];
          list.push(sRow);
          scriptsByContentId.set(sRow.contentId, list);
        }

        for (const [contentId, rows] of scriptsByContentId) {
          const contentItemId = itemRecordMap.get(contentId);
          if (!contentItemId) continue;

          rows.sort((a, b) => a.srNo - b.srNo);

          const rowsData = rows.map((r, idx) => ({
            sr_no: idx + 1,
            ...r.data,
          }));

          await tx.script.upsert({
            where: { content_item_id: contentItemId },
            create: {
              content_item_id: contentItemId,
              status: "pending",
              columns_schema: JSON.stringify(scriptCols),
              rows_data: JSON.stringify(rowsData),
              custom_notes: "",
              canvas_drawings: "",
              media_attachments: "[]",
              comments: "[]",
            },
            update: {
              columns_schema: JSON.stringify(scriptCols),
              rows_data: JSON.stringify(rowsData),
            },
          });

          scriptCount++;
        }

        return { createdCount, updatedCount, scriptCount };
      },
      {
        maxWait: 15000,
        timeout: 60000,
      }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${transactionResult.createdCount + transactionResult.updatedCount} content item(s) and ${transactionResult.scriptCount} script(s).`,
      results: transactionResult,
    });
  } catch (error: any) {
    console.error("Error executing data migration:", error);
    return NextResponse.json(
      { error: error.message || "Database migration transaction failed and rolled back." },
      { status: 500 }
    );
  }
}
