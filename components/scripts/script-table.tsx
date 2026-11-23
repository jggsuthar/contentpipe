"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Columns3,
  Eye,
  EyeOff,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  X,
  Check,
  AlertCircle,
  HelpCircle,
  Minimize2,
  Maximize2,
  Table2,
  LayoutGrid,
} from "lucide-react";
import {
  ScriptColumnSchema,
  ScriptRowData,
  ScriptComment,
  ScriptLifecycleStatus,
} from "@/types/database";

interface ScriptTableProps {
  columns: ScriptColumnSchema[];
  rows: ScriptRowData[];
  comments: ScriptComment[];
  scriptStatus?: ScriptLifecycleStatus;
  canEdit: boolean;
  onUpdateColumns: (newCols: ScriptColumnSchema[]) => void;
  onUpdateRows: (newRows: ScriptRowData[]) => void;
  onOpenRowComments: (srNo: number) => void;
  openCommentsCount?: number;
  onOpenAllComments?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  isExpandedWorkspace?: boolean;
}

// Fallback value resolver for backward compatibility with older rows
function getCellValue(row: any, colId: string): string {
  if (row[colId] !== undefined && row[colId] !== null) return String(row[colId]);
  if (colId === "col_dialogue" && row.dialogue !== undefined) return String(row.dialogue);
  if (colId === "col_roll" && row.roll_type !== undefined) return String(row.roll_type);
  if (colId === "col_visual" && row.description !== undefined) return String(row.description);
  if (colId === "col_audio" && row.remarks !== undefined) return String(row.remarks);
  return "";
}

export function ScriptTable({
  columns,
  rows,
  comments,
  scriptStatus = "pending",
  canEdit,
  onUpdateColumns,
  onUpdateRows,
  onOpenRowComments,
  openCommentsCount,
  onOpenAllComments,
  isMinimized = false,
  onToggleMinimize,
  isExpandedWorkspace = false,
}: ScriptTableProps) {
  // Column Management States
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [newColModalOpen, setNewColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "dropdown">("text");
  const [newColOptionsText, setNewColOptionsText] = useState("Option 1, Option 2, Option 3");

  // Active Dropdown Combobox tracking & Floating Portal Anchor (Outside Table)
  const [activeDropdownCell, setActiveDropdownCell] = useState<string | null>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    rowIndex: number;
    colIndex: number;
    colId: string;
    options: string[];
    cellValue: string;
  } | null>(null);

  // Multi-cell Range Selection (Excel-like)
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  // Paste error alert banner
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Mobile view switcher: Cards (default on < md) vs Table
  const [mobileViewMode, setMobileViewMode] = useState<"cards" | "table">("cards");

  // Focus target after row addition
  const pendingFocusRef = useRef<{ rowIndex: number; colIndex: number } | null>(null);

  // Filter out system columns (Sr. No. and Action are always fixed system columns)
  const visibleDataColumns = columns.filter(
    (c) => c.id !== "col_sr" && c.id !== "sr_no" && c.id !== "actions" && !c.is_hidden
  );

  // Global listeners for dropdown dismissal outside table & selection mouseup
  useEffect(() => {
    const handleDocumentMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("#script-table-dropdown-portal")) return;
      if (activeDropdownCell && target.closest(`#cell-${activeDropdownCell}`)) return;
      setActiveDropdownCell(null);
      setDropdownAnchor(null);
    };

    const handleWindowMouseUp = () => {
      setIsSelecting(false);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [activeDropdownCell]);

  // Recalculate dropdown floating position on scroll or resize
  useEffect(() => {
    const handleScrollOrResize = () => {
      if (activeDropdownCell) {
        const inputEl = document.getElementById(`cell-${activeDropdownCell}`);
        if (inputEl) {
          const rect = inputEl.getBoundingClientRect();
          setDropdownAnchor((prev) =>
            prev
              ? {
                  ...prev,
                  top: rect.bottom + 4,
                  left: rect.left,
                  width: Math.max(rect.width, 160),
                }
              : null
          );
        } else {
          setActiveDropdownCell(null);
          setDropdownAnchor(null);
        }
      }
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [activeDropdownCell]);

  // Re-number rows helper
  const renumberRows = (items: ScriptRowData[]): ScriptRowData[] => {
    return items.map((row, idx) => ({
      ...row,
      sr_no: idx + 1,
    }));
  };

  // Row operations
  const handleAddRowBelow = (targetIndex: number, colToFocusAfter?: number) => {
    if (!canEdit) return;
    const newRow: ScriptRowData = {
      sr_no: targetIndex + 2,
    };
    // Initialize default values for visible columns
    visibleDataColumns.forEach((c) => {
      newRow[c.id] = c.type === "dropdown" && c.options?.[0] ? c.options[0] : "";
    });

    const updated = [...rows];
    updated.splice(targetIndex + 1, 0, newRow);
    const renumbered = renumberRows(updated);
    onUpdateRows(renumbered);

    if (colToFocusAfter !== undefined) {
      pendingFocusRef.current = {
        rowIndex: targetIndex + 1,
        colIndex: colToFocusAfter,
      };
    }
  };

  const handleDeleteRow = (targetIndex: number) => {
    if (!canEdit) return;
    const updated = [...rows];
    updated.splice(targetIndex, 1);
    onUpdateRows(renumberRows(updated));
  };

  const handleMoveRow = (fromIndex: number, direction: "up" | "down") => {
    if (!canEdit) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= rows.length) return;

    const updated = [...rows];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onUpdateRows(renumberRows(updated));
  };

  const handleCellChange = (rowIndex: number, field: string, value: any) => {
    if (!canEdit) return;
    const updated = [...rows];
    updated[rowIndex] = {
      ...updated[rowIndex],
      [field]: value,
    };
    // Also mirror to legacy fields if applicable
    if (field === "col_dialogue") updated[rowIndex].dialogue = value;
    if (field === "col_roll") updated[rowIndex].roll_type = value;
    if (field === "col_visual") updated[rowIndex].description = value;
    if (field === "col_audio") updated[rowIndex].remarks = value;

    onUpdateRows(updated);
  };

  const openDropdown = (
    rowIndex: number,
    colIndex: number,
    colId: string,
    options: string[],
    cellValue: string,
    targetInput: HTMLElement
  ) => {
    const rect = targetInput.getBoundingClientRect();
    setDropdownAnchor({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 160),
      rowIndex,
      colIndex,
      colId,
      options,
      cellValue,
    });
    setActiveDropdownCell(`${rowIndex}-${colIndex}`);
  };

  const clearSelectedCells = () => {
    if (!canEdit || !selectedRange) return;
    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

    const updated = [...rows];
    for (let r = minR; r <= maxR; r++) {
      if (!updated[r]) continue;
      const rowCopy = { ...updated[r] };
      for (let c = minC; c <= maxC; c++) {
        const col = visibleDataColumns[c];
        if (col) {
          rowCopy[col.id] = "";
          if (col.id === "col_dialogue") rowCopy.dialogue = "";
          if (col.id === "col_roll") rowCopy.roll_type = "";
          if (col.id === "col_visual") rowCopy.description = "";
          if (col.id === "col_audio") rowCopy.remarks = "";
        }
      }
      updated[r] = rowCopy;
    }
    onUpdateRows(updated);
  };

  const handleCellPaste = (
    e: React.ClipboardEvent,
    startRow: number,
    startCol: number
  ) => {
    const clipboardData = e.clipboardData.getData("text/plain");
    if (!clipboardData) return;

    // Check if it's TSV (Excel / Google Sheets copied cells)
    const normalized = clipboardData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");
    if (rawLines.length > 1 && rawLines[rawLines.length - 1].trim() === "") {
      rawLines.pop();
    }

    const grid = rawLines.map((line) => line.split("\t"));
    const isMultiCell = grid.length > 1 || (grid.length === 1 && grid[0].length > 1);

    if (!isMultiCell) {
      // Single cell regular paste, let native behavior continue
      return;
    }

    e.preventDefault();
    setPasteError(null);

    const neededRows = grid.length;
    const neededCols = Math.max(...grid.map((r) => r.length));

    const totalRows = rows.length;
    const totalCols = visibleDataColumns.length;

    // Check boundary overflow
    if (startRow + neededRows > totalRows || startCol + neededCols > totalCols) {
      const rowDiff = (startRow + neededRows) - totalRows;
      const colDiff = (startCol + neededCols) - totalCols;
      let err = `Paste Error: Copied range (${neededRows} rows × ${neededCols} columns) spills outside the table starting at row ${startRow + 1}, col ${startCol + 1}. `;
      if (rowDiff > 0 && colDiff > 0) {
        err += `Requires ${rowDiff} more row(s) and ${colDiff} more column(s).`;
      } else if (rowDiff > 0) {
        err += `Requires ${rowDiff} more row(s). Click "Add Row" below first.`;
      } else {
        err += `Requires ${colDiff} more column(s). Add columns in menu first.`;
      }
      setPasteError(err);
      return;
    }

    // Fits in table! Apply values
    const updated = [...rows];
    for (let r = 0; r < neededRows; r++) {
      const targetRowIdx = startRow + r;
      if (!updated[targetRowIdx]) continue;
      const rowCopy = { ...updated[targetRowIdx] };
      for (let c = 0; c < neededCols; c++) {
        const targetColIdx = startCol + c;
        const col = visibleDataColumns[targetColIdx];
        if (col && grid[r][c] !== undefined) {
          const val = grid[r][c];
          rowCopy[col.id] = val;
          if (col.id === "col_dialogue") rowCopy.dialogue = val;
          if (col.id === "col_roll") rowCopy.roll_type = val;
          if (col.id === "col_visual") rowCopy.description = val;
          if (col.id === "col_audio") rowCopy.remarks = val;
        }
      }
      updated[targetRowIdx] = rowCopy;
    }

    onUpdateRows(updated);
    setSelectedRange({
      startRow,
      startCol,
      endRow: startRow + neededRows - 1,
      endCol: startCol + neededCols - 1,
    });
  };

  // Focus effect for newly added rows
  useEffect(() => {
    if (pendingFocusRef.current) {
      const { rowIndex, colIndex } = pendingFocusRef.current;
      pendingFocusRef.current = null;
      setTimeout(() => {
        const el = document.getElementById(`cell-${rowIndex}-${colIndex}`) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (el) {
          el.focus();
          if (el.select) el.select();
        }
      }, 50);
    }
  }, [rows.length]);

  // Navigate focus to cell helper
  const focusCell = (
    targetRow: number,
    targetCol: number,
    caretPosition: "start" | "end" | "preserve" = "preserve"
  ) => {
    const el = document.getElementById(`cell-${targetRow}-${targetCol}`) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (el) {
      el.focus();
      if (caretPosition === "start") {
        el.setSelectionRange?.(0, 0);
      } else if (caretPosition === "end") {
        const len = el.value.length;
        el.setSelectionRange?.(len, len);
      }
    }
  };

  // Keyboard navigation handler for all cells
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowIndex: number,
    colIndex: number,
    isDropdown: boolean
  ) => {
    const totalCols = visibleDataColumns.length;
    const totalRows = rows.length;
    const target = e.currentTarget;

    // 1. Tab / Shift + Tab: Navigate horizontally
    if (e.key === "Tab") {
      e.preventDefault();
      setActiveDropdownCell(null);
      if (!e.shiftKey) {
        if (colIndex < totalCols - 1) {
          focusCell(rowIndex, colIndex + 1);
        } else if (rowIndex < totalRows - 1) {
          focusCell(rowIndex + 1, 0);
        } else if (canEdit) {
          handleAddRowBelow(rowIndex, 0);
        }
      } else {
        if (colIndex > 0) {
          focusCell(rowIndex, colIndex - 1);
        } else if (rowIndex > 0) {
          focusCell(rowIndex - 1, totalCols - 1);
        }
      }
      return;
    }

    // 2. Enter / Shift + Enter: Navigate vertically
    if (e.key === "Enter") {
      // Allow Ctrl+Enter or Alt+Enter to insert line breaks in textareas
      if (e.ctrlKey || e.altKey) {
        return;
      }

      e.preventDefault();
      setActiveDropdownCell(null);

      if (!e.shiftKey) {
        if (rowIndex < totalRows - 1) {
          focusCell(rowIndex + 1, colIndex);
        } else if (canEdit) {
          // Enter on the last row automatically appends a new row and focuses it!
          handleAddRowBelow(rowIndex, colIndex);
        }
      } else {
        // Shift + Enter: Move up
        if (rowIndex > 0) {
          focusCell(rowIndex - 1, colIndex);
        }
      }
      return;
    }

    // 3. Up Arrow: Move up if caret is on first line
    if (e.key === "ArrowUp") {
      if (isDropdown) {
        // Dropdown cells: jump up immediately
        e.preventDefault();
        setActiveDropdownCell(null);
        if (rowIndex > 0) {
          focusCell(rowIndex - 1, colIndex, "end");
        }
        return;
      }

      const currentPos = target.selectionStart ?? 0;
      if (currentPos === 0) {
        e.preventDefault();
        if (rowIndex > 0) {
          focusCell(rowIndex - 1, colIndex, "end");
        }
        return;
      }

      // Check if caret was already on top visual line
      requestAnimationFrame(() => {
        if (target.selectionStart === currentPos) {
          if (rowIndex > 0) {
            focusCell(rowIndex - 1, colIndex, "end");
          }
        }
      });
      return;
    }

    // 4. Down Arrow: Move down if caret is on last line
    if (e.key === "ArrowDown") {
      if (isDropdown) {
        // Dropdown cells: jump down immediately
        e.preventDefault();
        setActiveDropdownCell(null);
        if (rowIndex < totalRows - 1) {
          focusCell(rowIndex + 1, colIndex, "start");
        }
        return;
      }

      const currentPos = target.selectionEnd ?? target.value.length;
      const maxLen = target.value.length;
      if (currentPos === maxLen) {
        e.preventDefault();
        if (rowIndex < totalRows - 1) {
          focusCell(rowIndex + 1, colIndex, "start");
        }
        return;
      }

      // Check if caret was already on bottom visual line
      requestAnimationFrame(() => {
        if (target.selectionEnd === currentPos) {
          if (rowIndex < totalRows - 1) {
            focusCell(rowIndex + 1, colIndex, "start");
          }
        }
      });
      return;
    }

    // 5. Delete or Backspace: Clear selected range if multi-cell selected
    if (e.key === "Delete" || e.key === "Backspace") {
      if (
        selectedRange &&
        (selectedRange.startRow !== selectedRange.endRow ||
          selectedRange.startCol !== selectedRange.endCol)
      ) {
        e.preventDefault();
        clearSelectedCells();
        return;
      }
    }

    // 6. Escape: Close open dropdown & deselect
    if (e.key === "Escape") {
      setActiveDropdownCell(null);
      setDropdownAnchor(null);
      setSelectedRange(null);
    }
  };

  // Column operations
  const handleToggleColumnHide = (colId: string) => {
    if (!canEdit) return;
    const updated = columns.map((col) => {
      if (col.id === colId) {
        return { ...col, is_hidden: !col.is_hidden };
      }
      return col;
    });
    onUpdateColumns(updated);
  };

  const handleMoveColumn = (index: number, direction: "left" | "right") => {
    if (!canEdit) return;
    const targetIdx = direction === "left" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;

    const updated = [...columns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    onUpdateColumns(updated);
  };

  const handleDeleteColumn = (colId: string) => {
    if (!canEdit) return;
    const updated = columns.filter((c) => c.id !== colId);
    onUpdateColumns(updated);
  };

  const handleCreateColumn = () => {
    if (!newColName.trim() || !canEdit) return;
    const id = `col_${Date.now()}`;
    const options =
      newColType === "dropdown"
        ? newColOptionsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const newCol: ScriptColumnSchema = {
      id,
      name: newColName.trim(),
      type: newColType,
      options,
      width: newColType === "dropdown" ? "150px" : "220px",
      is_hidden: false,
    };

    onUpdateColumns([...columns, newCol]);
    setNewColName("");
    setNewColType("text");
    setNewColOptionsText("Option 1, Option 2, Option 3");
    setNewColModalOpen(false);
  };

  // Interactive column width resizer affecting ONLY 2 adjacent columns
  const handleResizeBetween = (
    e: React.MouseEvent,
    leftColIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const colA = visibleDataColumns[leftColIndex];
    const colB = visibleDataColumns[leftColIndex + 1];

    if (!colA) return;

    const initialWA = parseInt(colA.width || "220", 10) || 220;

    if (!colB) {
      // Last column: resize against table boundary
      const handleMouseMoveLast = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(75, initialWA + delta);
        const updated = columns.map((c) =>
          c.id === colA.id ? { ...c, width: `${newWidth}px` } : c
        );
        onUpdateColumns(updated);
      };
      const handleMouseUpLast = () => {
        window.removeEventListener("mousemove", handleMouseMoveLast);
        window.removeEventListener("mouseup", handleMouseUpLast);
      };
      window.addEventListener("mousemove", handleMouseMoveLast);
      window.addEventListener("mouseup", handleMouseUpLast);
      return;
    }

    const initialWB = parseInt(colB.width || "220", 10) || 220;
    const totalPairWidth = initialWA + initialWB;
    const minW = 75;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let delta = moveEvent.clientX - startX;

      // Restrict delta so neither column falls below minW
      if (initialWA + delta < minW) {
        delta = minW - initialWA;
      } else if (initialWB - delta < minW) {
        delta = initialWB - minW;
      }

      const newWA = initialWA + delta;
      const newWB = totalPairWidth - newWA;

      const updated = columns.map((c) => {
        if (c.id === colA.id) return { ...c, width: `${newWA}px` };
        if (c.id === colB.id) return { ...c, width: `${newWB}px` };
        return c;
      });
      onUpdateColumns(updated);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const resolvedOpenComments =
    openCommentsCount ?? comments.filter((c) => !c.is_resolved).length;

  return (
    <div
      className="w-full flex flex-col card-theme rounded-xl sm:rounded-2xl overflow-hidden focus:outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (isMinimized) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          const isTyping = activeTag === "input" || activeTag === "textarea";
          if (
            selectedRange &&
            (!isTyping ||
              selectedRange.startRow !== selectedRange.endRow ||
              selectedRange.startCol !== selectedRange.endCol)
          ) {
            e.preventDefault();
            clearSelectedCells();
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedRange) {
          const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
          const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
          const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
          const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

          const lines: string[] = [];
          for (let r = minR; r <= maxR; r++) {
            const rowVals: string[] = [];
            for (let c = minC; c <= maxC; c++) {
              const col = visibleDataColumns[c];
              rowVals.push(col ? getCellValue(rows[r], col.id) : "");
            }
            lines.push(rowVals.join("\t"));
          }
          navigator.clipboard.writeText(lines.join("\n"));
        } else if (e.key === "Escape") {
          setSelectedRange(null);
          setActiveDropdownCell(null);
          setDropdownAnchor(null);
        }
      }}
    >
      {/* Persistent Header Bar (identical across minimized & expanded views) */}
      <div
        onClick={() => onToggleMinimize?.()}
        role={onToggleMinimize ? "button" : undefined}
        tabIndex={onToggleMinimize ? 0 : undefined}
        onKeyDown={(e) => {
          if (onToggleMinimize && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggleMinimize();
          }
        }}
        title={
          onToggleMinimize
            ? isMinimized
              ? "Click bar to expand Script Table"
              : "Click bar to minimize Script Table"
            : undefined
        }
        className={`px-2.5 py-2 sm:px-4 sm:py-2.5 bg-muted/40 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-xs font-mono select-none transition-colors ${
          onToggleMinimize ? "cursor-pointer hover:bg-muted/60" : ""
        } ${isMinimized ? "" : "border-b border-border"}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
            <Table2 className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold font-mono text-foreground">
            Script Table
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60">
            Rows: <strong className="text-foreground">{rows.length}</strong> • Cols:{" "}
            <strong className="text-foreground">{visibleDataColumns.length}</strong>
          </span>
          <span className="hidden xl:inline text-[10px] text-muted-foreground/80">
            Tab: next cell • Enter: cell below • Drag multi-cells to select/delete
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!isMinimized && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex md:hidden items-center p-0.5 rounded-xl glass-subtle text-[11px] font-mono gap-0.5"
            >
              <button
                type="button"
                onClick={() => setMobileViewMode("cards")}
                className={`px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                  mobileViewMode === "cards"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode("table")}
                className={`px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                  mobileViewMode === "table"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                <Table2 className="w-3 h-3" />
                <span>Table</span>
              </button>
            </div>
          )}

          {onOpenAllComments && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAllComments();
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold text-primary hover:bg-primary/10 border border-primary/25 transition-colors flex items-center gap-1 cursor-pointer"
              title="Open all script comments"
            >
              <MessageSquare className="w-3 h-3" />
              <span>All Comments ({resolvedOpenComments} open)</span>
            </button>
          )}

          {canEdit && !isMinimized && (
            <>
              {/* Columns Customization Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setColumnManagerOpen(!columnManagerOpen);
                }}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1.5 cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
                title="Customize table columns"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>Columns</span>
              </button>

              {columnManagerOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 glass-floating backdrop-blur-2xl rounded-xl z-40 p-2.5 text-xs space-y-1.5 font-sans">
                  <div className="flex items-center justify-between pb-1 border-b border-border text-[11px] font-semibold text-muted-foreground">
                    <span>Manage Custom Columns</span>
                    <button
                      onClick={() => setColumnManagerOpen(false)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {columns.map((col, idx) => (
                      <div
                        key={col.id}
                        className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 text-[11px]"
                      >
                        <span className="truncate max-w-[120px] font-medium">{col.name}</span>

                        <div className="flex items-center gap-1">
                          {/* Hide/Unhide toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleColumnHide(col.id)}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                            title={col.is_hidden ? "Show column" : "Hide column"}
                          >
                            {col.is_hidden ? (
                              <EyeOff className="w-3 h-3 text-muted-foreground" />
                            ) : (
                              <Eye className="w-3 h-3 text-primary" />
                            )}
                          </button>

                          {/* Move Left / Right */}
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMoveColumn(idx, "left")}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Move left"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {idx < columns.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleMoveColumn(idx, "right")}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Move right"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {/* Delete custom column */}
                          <button
                            type="button"
                            onClick={() => handleDeleteColumn(col.id)}
                            className="p-1 hover:bg-destructive/10 rounded text-destructive cursor-pointer"
                            title="Delete column"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1.5 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setColumnManagerOpen(false);
                        setNewColModalOpen(true);
                      }}
                      className="w-full py-1 text-center rounded text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1 cursor-pointer"
                      style={{ borderRadius: "var(--radius)" }}
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Custom Column</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Add Row Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddRowBelow(rows.length - 1, 0);
              }}
              className="px-2.5 py-1 rounded text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 cursor-pointer shadow-xs"
              style={{ borderRadius: "var(--radius)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
            </>
          )}

          {onToggleMinimize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMinimize();
              }}
              className="px-2.5 py-1 rounded-xl text-[11px] font-semibold glass-subtle hover:border-primary/40 text-foreground flex items-center gap-1.5 cursor-pointer transition-all"
              title={
                isMinimized
                  ? "Expand Script Table"
                  : "Minimize Script Table to give Notes more screen space"
              }
            >
              {isMinimized ? (
                <>
                  <Maximize2 className="w-3 h-3 text-primary" />
                  <span>Expand</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Minimize</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Excel Paste Boundary Overflow Alert */}
      {pasteError && (
        <div className="mx-3 my-2 p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-mono">{pasteError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPasteError(null)}
            className="p-1 hover:bg-destructive/20 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Scene Cards View (< md when mobileViewMode === "cards") */}
      {mobileViewMode === "cards" && (
        <div className="md:hidden p-2 space-y-2.5">
          {rows.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border/80 glass-subtle space-y-2.5">
              <p className="text-xs font-mono text-muted-foreground">
                No script rows yet. Script is empty.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleAddRowBelow(-1, 0)}
                  className="px-3.5 min-h-[40px] rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Script Row</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {rows.map((row, rowIndex) => {
                const rowComments = comments.filter((c) => c.sr_no === row.sr_no);
                const unresolvedComments = rowComments.filter((c) => !c.is_resolved);
                const hasRevisionFeedback =
                  scriptStatus === "revision_requested" && rowComments.length > 0;

                return (
                  <div
                    key={row.sr_no || rowIndex}
                    className={`p-3 rounded-xl glass-subtle border space-y-2.5 ${
                      hasRevisionFeedback
                        ? "bg-rose-500/[0.04] border-rose-500/40 border-l-4 border-l-rose-500"
                        : "border-border/80"
                    }`}
                  >
                    {/* Card Header: Line # + Comments + Row Controls */}
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                        Line #{row.sr_no}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenRowComments(row.sr_no)}
                          className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer border ${
                            unresolvedComments.length > 0
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold"
                              : rowComments.length > 0
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "text-muted-foreground border-border/70 hover:text-foreground"
                          }`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>{rowComments.length > 0 ? rowComments.length : "+"}</span>
                        </button>

                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMoveRow(rowIndex, "up")}
                              disabled={rowIndex === 0}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-25 cursor-pointer"
                              aria-label="Move row up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveRow(rowIndex, "down")}
                              disabled={rowIndex === rows.length - 1}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-25 cursor-pointer"
                              aria-label="Move row down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddRowBelow(rowIndex, 0)}
                              className="p-1.5 rounded-lg hover:bg-primary/15 text-primary cursor-pointer"
                              aria-label="Insert row below"
                              title="Insert scene below"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(rowIndex)}
                              className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive cursor-pointer"
                              aria-label="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Editable Scene Fields */}
                    <div className="space-y-2">
                      {visibleDataColumns.map((col) => {
                        const cellValue = getCellValue(row, col.id);
                        const isDropdown = col.type === "dropdown";
                        const options = col.options || [
                          "A-Roll",
                          "B-Roll",
                          "Screen Recording",
                          "Voiceover",
                        ];
                        const isDialogue =
                          col.id === "col_dialogue" ||
                          col.name.toLowerCase().includes("dialogue");

                        return (
                          <div key={col.id} className="space-y-1">
                            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                              {col.name}
                            </label>
                            {isDropdown ? (
                              <select
                                disabled={!canEdit}
                                value={cellValue}
                                onChange={(e) => handleCellChange(rowIndex, col.id, e.target.value)}
                                className="w-full h-9 px-2.5 text-base sm:text-xs rounded-xl glass-input cursor-pointer disabled:opacity-75"
                              >
                                <option value="">Select {col.name}...</option>
                                {cellValue && !options.includes(cellValue) && (
                                  <option value={cellValue}>{cellValue}</option>
                                )}
                                {options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="grid w-full relative items-start">
                                <div
                                  aria-hidden="true"
                                  className={`col-start-1 row-start-1 invisible w-full px-2.5 py-2 text-base sm:text-xs font-sans leading-relaxed whitespace-pre-wrap break-words pointer-events-none select-none ${
                                    isDialogue ? "min-h-[56px]" : "min-h-[38px]"
                                  }`}
                                >
                                  {cellValue ? cellValue + " " : "\u00A0"}
                                </div>
                                <textarea
                                  rows={isDialogue ? 2 : 1}
                                  disabled={!canEdit}
                                  value={cellValue}
                                  onChange={(e) =>
                                    handleCellChange(rowIndex, col.id, e.target.value)
                                  }
                                  placeholder={`Enter ${col.name.toLowerCase()}...`}
                                  className={`col-start-1 row-start-1 w-full h-full px-2.5 py-2 text-base sm:text-xs rounded-xl glass-input resize-none leading-relaxed font-sans overflow-hidden disabled:opacity-80 ${
                                    isDialogue ? "min-h-[56px]" : "min-h-[38px]"
                                  }`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleAddRowBelow(rows.length - 1, 0)}
                  className="w-full min-h-[40px] rounded-xl text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Scene Row</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Main Compact Spreadsheet View */}
      <div
        className={`${
          mobileViewMode === "table" ? "block" : "hidden md:block"
        } overflow-x-auto ${
          isExpandedWorkspace ? "min-h-[calc(100dvh-260px)]" : ""
        }`}
      >
        <table className="w-full border-collapse text-xs table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-[11px] font-mono text-muted-foreground uppercase tracking-wider select-none">
              {/* Fixed System Column 1: Sr. No. */}
              <th className="w-10 py-1.5 px-1 text-center font-bold border-r border-border/60">
                #
              </th>

              {/* Fixed System Column 2: Row Actions */}
              {canEdit && (
                <th className="w-18 py-1.5 px-1 text-center font-semibold border-r border-border/60">
                  Actions
                </th>
              )}

              {/* Dynamic Designed Columns */}
              {visibleDataColumns.map((col, colIndex) => (
                <th
                  key={col.id}
                  className="py-1.5 px-2 font-semibold text-left border-r border-border/60 relative group/th select-none"
                  style={{ width: col.width || "220px" }}
                >
                  <div className="flex items-center justify-between gap-1 pr-1.5 truncate">
                    <span className="truncate">{col.name}</span>
                    {col.type === "dropdown" && (
                      <span className="text-[9px] lowercase opacity-50 font-normal">▼</span>
                    )}
                  </div>

                  {/* Interactive Column Width Drag Resizer affecting only 2 adjacent columns */}
                  {canEdit && (
                    <div
                      onMouseDown={(e) => handleResizeBetween(e, colIndex)}
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-primary/70 transition-colors z-20 group-hover/th:bg-border/60"
                      title="Click and drag to adjust width between columns"
                    />
                  )}
                </th>
              ))}

              {/* Fixed System Column 3: Comments Column */}
              <th className="w-20 py-1.5 px-1 text-center font-semibold">Comments</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleDataColumns.length + (canEdit ? 3 : 2)}
                  className="py-14 text-center text-muted-foreground bg-muted/5"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-xs font-mono text-muted-foreground">
                      No script rows yet. Script is empty.
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleAddRowBelow(-1, 0)}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                        style={{ borderRadius: "var(--radius)" }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add First Script Row</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
              const rowComments = comments.filter((c) => c.sr_no === row.sr_no);
              const unresolvedComments = rowComments.filter((c) => !c.is_resolved);
              const hasRevisionFeedback =
                scriptStatus === "revision_requested" && rowComments.length > 0;

              return (
                <tr
                  key={row.sr_no || rowIndex}
                  className={`hover:bg-muted/30 transition-colors group ${
                    hasRevisionFeedback
                      ? "bg-rose-500/[0.04] border-l-4 border-l-rose-500"
                      : ""
                  }`}
                >
                  {/* Fixed System Column 1: Sr. No. (Non-typable automatic row index) */}
                  <td className="w-10 py-0.5 px-1 font-mono font-bold text-center text-xs align-top text-muted-foreground border-r border-border/60 bg-muted/20 select-none">
                    <span className="inline-block py-0.5 leading-tight">{row.sr_no}</span>
                  </td>

                  {/* Fixed System Column 2: Actions (Reorder, Insert below, Delete) */}
                  {canEdit && (
                    <td className="w-18 py-0.5 px-0.5 text-center align-top border-r border-border/60 bg-muted/10">
                      <div className="flex items-center justify-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveRow(rowIndex, "up")}
                          disabled={rowIndex === 0}
                          className="p-0.5 hover:bg-muted rounded text-muted-foreground disabled:opacity-20 cursor-pointer"
                          title="Move row up"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveRow(rowIndex, "down")}
                          disabled={rowIndex === rows.length - 1}
                          className="p-0.5 hover:bg-muted rounded text-muted-foreground disabled:opacity-20 cursor-pointer"
                          title="Move row down"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRowBelow(rowIndex, 0)}
                          className="p-0.5 hover:bg-primary/20 hover:text-primary rounded text-muted-foreground cursor-pointer"
                          title="Insert row below"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(rowIndex)}
                          className="p-0.5 hover:bg-destructive/15 hover:text-destructive rounded text-muted-foreground cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Dynamic Designed Data Columns */}
                  {visibleDataColumns.map((col, colIndex) => {
                    const cellKey = `${rowIndex}-${colIndex}`;
                    const cellValue = getCellValue(row, col.id);
                    const isDropdown = col.type === "dropdown";
                    const isDropdownActive = activeDropdownCell === cellKey;
                    const options = col.options || [
                      "A-Roll",
                      "B-Roll",
                      "Screen Recording",
                      "Voiceover",
                    ];

                    const isCellSelected =
                      selectedRange !== null &&
                      rowIndex >= Math.min(selectedRange.startRow, selectedRange.endRow) &&
                      rowIndex <= Math.max(selectedRange.startRow, selectedRange.endRow) &&
                      colIndex >= Math.min(selectedRange.startCol, selectedRange.endCol) &&
                      colIndex <= Math.max(selectedRange.startCol, selectedRange.endCol);

                    const isMultiSelected =
                      selectedRange !== null &&
                      (selectedRange.startRow !== selectedRange.endRow ||
                        selectedRange.startCol !== selectedRange.endCol);

                    return (
                      <td
                        key={col.id}
                        className={`py-0.5 px-1 align-top border-r border-border/60 relative transition-colors ${
                          isCellSelected && isMultiSelected
                            ? "bg-primary/20 ring-1 ring-inset ring-primary/60"
                            : isCellSelected
                            ? "bg-primary/10"
                            : ""
                        }`}
                        style={{ width: col.width || "220px" }}
                        onMouseDown={(e) => {
                          if (e.shiftKey && selectedRange) {
                            setSelectedRange({
                              ...selectedRange,
                              endRow: rowIndex,
                              endCol: colIndex,
                            });
                          } else {
                            setIsSelecting(true);
                            setSelectedRange({
                              startRow: rowIndex,
                              startCol: colIndex,
                              endRow: rowIndex,
                              endCol: colIndex,
                            });
                          }
                        }}
                        onMouseEnter={() => {
                          if (isSelecting && selectedRange) {
                            setSelectedRange({
                              ...selectedRange,
                              endRow: rowIndex,
                              endCol: colIndex,
                            });
                          }
                        }}
                      >
                        {isDropdown ? (
                          /* Dropdown Combobox Cell: Compact 24px height */
                          <div className="relative w-full">
                            <input
                              id={`cell-${rowIndex}-${colIndex}`}
                              type="text"
                              disabled={!canEdit}
                              value={cellValue}
                              onClick={(e) =>
                                canEdit &&
                                openDropdown(
                                  rowIndex,
                                  colIndex,
                                  col.id,
                                  options,
                                  cellValue,
                                  e.currentTarget
                                )
                              }
                              onFocus={(e) =>
                                canEdit &&
                                openDropdown(
                                  rowIndex,
                                  colIndex,
                                  col.id,
                                  options,
                                  cellValue,
                                  e.currentTarget
                                )
                              }
                              onChange={(e) => {
                                handleCellChange(rowIndex, col.id, e.target.value);
                                if (dropdownAnchor) {
                                  setDropdownAnchor({
                                    ...dropdownAnchor,
                                    cellValue: e.target.value,
                                  });
                                }
                              }}
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, rowIndex, colIndex, true)
                              }
                              onPaste={(e) => handleCellPaste(e, rowIndex, colIndex)}
                              placeholder="Type or pick..."
                              className="w-full h-[24px] px-1.5 text-xs rounded bg-transparent hover:bg-muted/40 focus:bg-background border border-transparent focus:border-primary focus:outline-none transition-colors leading-tight"
                              style={{ borderRadius: "var(--radius)" }}
                            />
                          </div>
                        ) : (
                          /* Dynamic Autogrow Textarea: Starts at true minimum height (1 line, 24px) and dynamically auto-expands */
                          <div className="grid w-full relative items-start">
                            <div
                              aria-hidden="true"
                              className="col-start-1 row-start-1 invisible w-full py-0.5 px-1 text-xs font-sans leading-tight whitespace-pre-wrap break-words pointer-events-none select-none min-h-[24px]"
                              style={{
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {cellValue ? cellValue + " " : "\u00A0"}
                            </div>

                            <textarea
                              id={`cell-${rowIndex}-${colIndex}`}
                              rows={1}
                              disabled={!canEdit}
                              value={cellValue}
                              onChange={(e) =>
                                handleCellChange(rowIndex, col.id, e.target.value)
                              }
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, rowIndex, colIndex, false)
                              }
                              onPaste={(e) => handleCellPaste(e, rowIndex, colIndex)}
                              placeholder={`Enter ${col.name.toLowerCase()}...`}
                              className="col-start-1 row-start-1 w-full h-full py-0.5 px-1 text-xs rounded bg-transparent hover:bg-muted/40 focus:bg-background border border-transparent focus:border-primary focus:outline-none resize-none leading-tight transition-colors disabled:opacity-80 font-sans overflow-hidden min-h-[24px]"
                              style={{
                                borderRadius: "var(--radius)",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                              }}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Fixed System Column 3: Comments Column */}
                  <td className="w-20 py-0.5 px-1 text-center align-top">
                    <button
                      type="button"
                      onClick={() => onOpenRowComments(row.sr_no)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 mx-auto cursor-pointer transition-all border ${
                        unresolvedComments.length > 0
                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold"
                          : rowComments.length > 0
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "text-muted-foreground border-transparent hover:bg-muted hover:text-foreground opacity-40 group-hover:opacity-100"
                      }`}
                      style={{ borderRadius: "var(--radius)" }}
                      title={
                        unresolvedComments.length > 0
                          ? `${unresolvedComments.length} unresolved feedback items`
                          : rowComments.length > 0
                          ? `${rowComments.length} comments`
                          : "Add comment for row"
                      }
                    >
                      <MessageSquare className="w-3 h-3" />
                      {rowComments.length > 0 ? (
                        <span>{rowComments.length}</span>
                      ) : (
                        <span className="text-[10px]">+</span>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
          </tbody>
        </table>
      </div>

      {/* Add Custom Column Modal */}
      {newColModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewColModalOpen(false);
          }}
        >
          <div className="glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 sm:p-6 space-y-4">
            <div className="sm:hidden mobile-sheet-handle -mt-1" />
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="font-bold text-sm">Add Custom Column</h3>
              <button
                onClick={() => setNewColModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Column Name *</label>
                <input
                  type="text"
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. SFX Cue, Graphics..."
                  className="w-full h-8 px-2.5 rounded bg-background border border-border focus:outline-none focus:border-primary"
                  style={{ borderRadius: "var(--radius)" }}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Column Type</label>
                <select
                  value={newColType}
                  onChange={(e) => setNewColType(e.target.value as any)}
                  className="w-full h-8 px-2 rounded bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                  style={{ borderRadius: "var(--radius)" }}
                >
                  <option value="text">Text (Multi-line input)</option>
                  <option value="dropdown">Dropdown (Filterable options)</option>
                </select>
              </div>

              {newColType === "dropdown" && (
                <div>
                  <label className="font-semibold block mb-1">
                    Predefined Options (comma separated)
                  </label>
                  <input
                    type="text"
                    value={newColOptionsText}
                    onChange={(e) => setNewColOptionsText(e.target.value)}
                    placeholder="Option 1, Option 2, Option 3"
                    className="w-full h-8 px-2.5 rounded bg-background border border-border focus:outline-none focus:border-primary"
                    style={{ borderRadius: "var(--radius)" }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setNewColModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newColName.trim()}
                onClick={handleCreateColumn}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-50"
                style={{ borderRadius: "var(--radius)" }}
              >
                Create Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Dropdown Portal (Rendered Outside Table via createPortal) */}
      {dropdownAnchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="script-table-dropdown-portal"
            className="fixed z-99999 max-h-56 overflow-y-auto glass-floating backdrop-blur-2xl rounded-xl p-1.5 font-sans text-xs animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: `${dropdownAnchor.top}px`,
              left: `${dropdownAnchor.left}px`,
              width: `${dropdownAnchor.width}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {dropdownAnchor.options
              .filter((opt) =>
                opt
                  .toLowerCase()
                  .includes(dropdownAnchor.cellValue.toLowerCase())
              )
              .map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    handleCellChange(
                      dropdownAnchor.rowIndex,
                      dropdownAnchor.colId,
                      opt
                    );
                    setActiveDropdownCell(null);
                    setDropdownAnchor(null);
                    if (dropdownAnchor.rowIndex < rows.length - 1) {
                      focusCell(
                        dropdownAnchor.rowIndex + 1,
                        dropdownAnchor.colIndex
                      );
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between cursor-pointer transition-colors ${
                    dropdownAnchor.cellValue === opt
                      ? "bg-primary/10 text-primary font-bold"
                      : ""
                  }`}
                >
                  <span>{opt}</span>
                  {dropdownAnchor.cellValue === opt && (
                    <Check className="w-3 h-3 text-primary" />
                  )}
                </button>
              ))}
            {dropdownAnchor.options.filter((opt) =>
              opt.toLowerCase().includes(dropdownAnchor.cellValue.toLowerCase())
            ).length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-[11px] italic">
                Custom: &ldquo;{dropdownAnchor.cellValue}&rdquo;
              </div>
            )}
          </div>,
          document.body
        )}
        </>
      )}
    </div>
  );
}
