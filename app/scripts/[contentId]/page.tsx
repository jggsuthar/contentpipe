"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { ScriptHeader } from "@/components/scripts/script-header";
import { ScriptTable } from "@/components/scripts/script-table";
import { ScriptNotes } from "@/components/scripts/script-notes";
import { ScriptCommentsDrawer } from "@/components/scripts/script-comments-drawer";
import { TeleprompterView } from "@/components/scripts/teleprompter-view";
import {
  ScriptColumnSchema,
  ScriptRowData,
  ScriptComment,
  ScriptLifecycleStatus,
} from "@/types/database";
import { extractNotesPlainText } from "@/lib/notes-utils";

export default function ScriptStudioPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Script & Content States
  const [contentItem, setContentItem] = useState<any>(null);
  const [scriptStatus, setScriptStatus] = useState<ScriptLifecycleStatus>("pending");
  const [isResponsibilityAssigned, setIsResponsibilityAssigned] = useState(false);
  const [assignedWriterRole, setAssignedWriterRole] = useState<any>(null);
  const [columns, setColumns] = useState<ScriptColumnSchema[]>([]);
  const [rows, setRows] = useState<ScriptRowData[]>([]);
  const [customNotes, setCustomNotes] = useState<string>("");
  const [comments, setComments] = useState<ScriptComment[]>([]);
  const [feedbackCategories, setFeedbackCategories] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<any>({
    canEdit: false,
    canSubmit: false,
    canApprove: false,
    isCreator: false,
    isAssignedWriter: false,
    userEmail: "",
  });

  // Notes as Main Script State (Hero View Mode), Minimize & Stacking Layout States
  const [isNotesMainScript, setIsNotesMainScript] = useState<boolean>(false);
  const [isTableMinimized, setIsTableMinimized] = useState<boolean>(false);
  const [isNotesMinimized, setIsNotesMinimized] = useState<boolean>(false);
  const [layoutOrientation, setLayoutOrientation] = useState<"vertical" | "horizontal">("vertical");

  // Session Undo / Redo History Stack with Local Cache
  interface SessionSnapshot {
    rows: ScriptRowData[];
    columns: ScriptColumnSchema[];
    notes: string;
  }
  const historyRef = useRef<SessionSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoFlags = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(
      historyIndexRef.current < historyRef.current.length - 1 &&
        historyIndexRef.current >= 0
    );
  }, []);

  // UI View States
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [isTeleprompter, setIsTeleprompter] = useState(false);
  const [commentsDrawerOpen, setCommentsDrawerOpen] = useState(false);
  const [activeCommentRow, setActiveCommentRow] = useState<number | null>(null);

  // Auto-save timer ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef(true);

  // 2. Debounced Auto-save Engine
  const triggerAutoSave = useCallback(
    (payload: {
      cols?: ScriptColumnSchema[];
      r?: ScriptRowData[];
      notes?: string;
    }) => {
      if (isFirstLoad.current || !userPermissions.canEdit) return;

      setSaveStatus("unsaved");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const res = await fetch(`/api/scripts/${contentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              columns_schema: payload.cols || columns,
              rows_data: payload.r || rows,
              custom_notes: payload.notes !== undefined ? payload.notes : customNotes,
            }),
          });

          if (res.ok) {
            setSaveStatus("saved");
          } else {
            setSaveStatus("unsaved");
          }
        } catch (err) {
          console.error("Auto-save failed:", err);
          setSaveStatus("unsaved");
        }
      }, 1200);
    },
    [columns, rows, customNotes, contentId, userPermissions.canEdit]
  );

  // 1. Fetch initial script studio data
  const fetchScriptData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/scripts/${contentId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError(data.error || "You do not have permission to access Script Studio.");
          setLoading(false);
          return;
        }
        setError(data.error || "Failed to load script workspace");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setContentItem(data.contentItem);
      setScriptStatus(data.scriptStatus || "pending");
      setIsResponsibilityAssigned(Boolean(data.isResponsibilityAssigned));
      setAssignedWriterRole(data.assignedWriterRole || null);

      const loadedCols = data.script.columns_schema || [];
      const loadedRows = data.script.rows_data || [];
      const loadedNotes = data.script.custom_notes || "";

      setColumns(loadedCols);
      setRows(loadedRows);
      setCustomNotes(loadedNotes);
      setComments(data.script.comments || []);
      setFeedbackCategories(data.feedbackCategories || []);
      setUserPermissions(data.userPermissions || {});
      setSaveStatus("saved");

      // Load Notes Main Script & section minimize preferences from localStorage
      try {
        const storedMain = localStorage.getItem(`contentpipe_notes_main_${contentId}`);
        if (storedMain === "true") {
          setIsNotesMainScript(true);
        }
        const storedTableMin = localStorage.getItem(`contentpipe_table_min_${contentId}`);
        if (storedTableMin === "true") {
          setIsTableMinimized(true);
        }
        const storedNotesMin = localStorage.getItem(`contentpipe_notes_min_${contentId}`);
        if (storedNotesMin === "true") {
          setIsNotesMinimized(true);
        }
        const storedLayout = localStorage.getItem(`contentpipe_script_layout_${contentId}`);
        if (storedLayout === "horizontal" || storedLayout === "vertical") {
          setLayoutOrientation(storedLayout);
        }
      } catch {}

      // Initialize session history with initial snapshot
      historyRef.current = [
        {
          rows: JSON.parse(JSON.stringify(loadedRows)),
          columns: JSON.parse(JSON.stringify(loadedCols)),
          notes: loadedNotes,
        },
      ];
      historyIndexRef.current = 0;
      updateUndoRedoFlags();
    } catch (err: any) {
      setError(err?.message || "Failed to load script workspace");
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  };

  useEffect(() => {
    fetchScriptData();
  }, [contentId]);

  // Push new state snapshot to session history & local cache
  const pushSessionSnapshot = useCallback(
    (
      newRows: ScriptRowData[],
      newCols: ScriptColumnSchema[],
      newNotes: string
    ) => {
      const curIdx = historyIndexRef.current;
      const snapshot: SessionSnapshot = {
        rows: JSON.parse(JSON.stringify(newRows)),
        columns: JSON.parse(JSON.stringify(newCols)),
        notes: newNotes,
      };

      const nextHistory = historyRef.current.slice(0, curIdx + 1);
      nextHistory.push(snapshot);
      historyRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
      updateUndoRedoFlags();

      try {
        localStorage.setItem(
          `contentpipe_script_cache_${contentId}`,
          JSON.stringify({
            rows: newRows,
            columns: newCols,
            notes: newNotes,
            timestamp: Date.now(),
          })
        );
      } catch {}
    },
    [contentId, updateUndoRedoFlags]
  );

  // Global Session Undo
  const handleGlobalUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const targetIdx = historyIndexRef.current - 1;
    const snapshot = historyRef.current[targetIdx];
    if (!snapshot) return;

    historyIndexRef.current = targetIdx;
    updateUndoRedoFlags();

    const restoredRows = JSON.parse(JSON.stringify(snapshot.rows));
    const restoredCols = JSON.parse(JSON.stringify(snapshot.columns));
    const restoredNotes = snapshot.notes;

    setRows(restoredRows);
    setColumns(restoredCols);
    setCustomNotes(restoredNotes);

    triggerAutoSave({
      r: restoredRows,
      cols: restoredCols,
      notes: restoredNotes,
    });
  }, [triggerAutoSave, updateUndoRedoFlags]);

  // Global Session Redo
  const handleGlobalRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const targetIdx = historyIndexRef.current + 1;
    const snapshot = historyRef.current[targetIdx];
    if (!snapshot) return;

    historyIndexRef.current = targetIdx;
    updateUndoRedoFlags();

    const restoredRows = JSON.parse(JSON.stringify(snapshot.rows));
    const restoredCols = JSON.parse(JSON.stringify(snapshot.columns));
    const restoredNotes = snapshot.notes;

    setRows(restoredRows);
    setColumns(restoredCols);
    setCustomNotes(restoredNotes);

    triggerAutoSave({
      r: restoredRows,
      cols: restoredCols,
      notes: restoredNotes,
    });
  }, [triggerAutoSave, updateUndoRedoFlags]);

  // Global keyboard shortcuts: Ctrl+Z (Undo) and Ctrl+Y (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleGlobalUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleGlobalRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGlobalUndo, handleGlobalRedo]);

  const handleToggleNotesMainScript = () => {
    const nextVal = !isNotesMainScript;
    setIsNotesMainScript(nextVal);
    try {
      localStorage.setItem(`contentpipe_notes_main_${contentId}`, String(nextVal));
    } catch {}
  };

  const handleToggleTableMinimized = () => {
    const nextVal = !isTableMinimized;
    setIsTableMinimized(nextVal);
    try {
      localStorage.setItem(`contentpipe_table_min_${contentId}`, String(nextVal));
    } catch {}
  };

  const handleToggleNotesMinimized = () => {
    const nextVal = !isNotesMinimized;
    setIsNotesMinimized(nextVal);
    try {
      localStorage.setItem(`contentpipe_notes_min_${contentId}`, String(nextVal));
    } catch {}
  };

  const handleToggleLayout = () => {
    const nextVal = layoutOrientation === "vertical" ? "horizontal" : "vertical";
    setLayoutOrientation(nextVal);
    try {
      localStorage.setItem(`contentpipe_script_layout_${contentId}`, nextVal);
    } catch {}
  };

  // Manual save trigger for "Save as Draft"
  const handleManualSave = async () => {
    if (!userPermissions.canEdit) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/scripts/${contentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns_schema: columns,
          rows_data: rows,
          custom_notes: customNotes,
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("unsaved");
      }
    } catch (err) {
      console.error("Manual save error:", err);
      setSaveStatus("unsaved");
    }
  };

  // Handlers for state updates
  const handleUpdateColumns = (newCols: ScriptColumnSchema[]) => {
    setColumns(newCols);
    pushSessionSnapshot(rows, newCols, customNotes);
    triggerAutoSave({ cols: newCols });
  };

  const handleUpdateRows = (newRows: ScriptRowData[]) => {
    setRows(newRows);
    pushSessionSnapshot(newRows, columns, customNotes);
    triggerAutoSave({ r: newRows });
  };

  const handleUpdateNotes = (notes: string) => {
    setCustomNotes(notes);
    pushSessionSnapshot(rows, columns, notes);
    triggerAutoSave({ notes });
  };

  // Export / Copy dialogue script
  const handleExportText = () => {
    const transcript = rows
      .map((r) => {
        const roll = r.col_roll || r.roll_type ? `[${r.col_roll || r.roll_type}] ` : "";
        const desc = r.col_visual || r.description ? ` (${r.col_visual || r.description})` : "";
        const dialogue = r.col_dialogue || r.dialogue || "";
        return `${r.sr_no}. ${roll}${dialogue}${desc}`;
      })
      .join("\n\n");

    const plainNotes = extractNotesPlainText(customNotes);

    const fullExport = `${contentItem?.title || "Video Script"}\nUnique Content ID: ${
      contentItem?.unique_content_id || "N/A"
    }\n\n========================================\n\n${transcript}\n\n========================================\n\nPRODUCTION NOTES:\n${plainNotes}`;

    navigator.clipboard.writeText(fullExport);
  };

  // Status transitions
  const handleDeclareDone = async () => {
    const res = await fetch(`/api/scripts/${contentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "declare_done" }),
    });
    if (res.ok) {
      const data = await res.json();
      setScriptStatus(data.scriptStatus || "done");
    }
  };

  const handleUndeclare = async () => {
    const res = await fetch(`/api/scripts/${contentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undeclare" }),
    });
    if (res.ok) {
      const data = await res.json();
      setScriptStatus(data.scriptStatus || "pending");
    }
  };

  const handleSubmitForReview = async () => {
    const res = await fetch(`/api/scripts/${contentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit_for_review" }),
    });
    if (res.ok) {
      const data = await res.json();
      setScriptStatus(data.scriptStatus || "submitted");
    }
  };

  const handleApprove = async () => {
    const res = await fetch(`/api/scripts/${contentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      const data = await res.json();
      setScriptStatus(data.scriptStatus || "done");
    }
  };

  const handleRequestRevisions = async (note: string) => {
    const res = await fetch(`/api/scripts/${contentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_revisions", feedback_note: note }),
    });
    if (res.ok) {
      const data = await res.json();
      setScriptStatus(data.scriptStatus || "revision_requested");
      if (data.comments) setComments(data.comments);
      await fetchScriptData();
    }
  };

  // Comments operations
  const handleAddComment = async (data: {
    sr_no: number | null;
    text: string;
    category?: string;
    severity?: "minor" | "critical";
  }) => {
    const res = await fetch(`/api/scripts/${contentId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ...data }),
    });
    if (res.ok) {
      const resp = await res.json();
      setComments(resp.comments);
    }
  };

  const handleToggleResolveComment = async (commentId: string) => {
    const res = await fetch(`/api/scripts/${contentId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_resolve", comment_id: commentId }),
    });
    if (res.ok) {
      const resp = await res.json();
      setComments(resp.comments);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await fetch(`/api/scripts/${contentId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", comment_id: commentId }),
    });
    if (res.ok) {
      const resp = await res.json();
      setComments(resp.comments);
    }
  };

  const handleOpenRowComments = (srNo: number) => {
    setActiveCommentRow(srNo);
    setCommentsDrawerOpen(true);
  };

  // Teleprompter / Reader Fullscreen View
  if (isTeleprompter) {
    return (
      <TeleprompterView
        rows={rows}
        columns={columns}
        notesText={customNotes}
        isNotesMainScript={isNotesMainScript}
        videoTitle={contentItem?.title || "Video Script"}
        uniqueContentId={contentItem?.unique_content_id}
        onExit={() => setIsTeleprompter(false)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between w-full">
      {/* Loading & Error States */}
      {loading ? (
        <div className="card-theme p-16 text-center my-auto flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-mono text-xs text-muted-foreground">
            Loading script workspace...
          </span>
        </div>
      ) : error ? (
        <div className="card-theme p-8 text-center my-auto max-w-md mx-auto space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <h2 className="font-bold text-sm">Access Restricted</h2>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/index")}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            style={{ borderRadius: "var(--radius)" }}
          >
            Return to Index
          </button>
        </div>
      ) : (
        <>
          {/* Edge-to-Edge Script Header */}
          <ScriptHeader
            contentItem={contentItem}
            scriptStatus={scriptStatus}
            saveStatus={saveStatus}
            isTeleprompter={isTeleprompter}
            onToggleTeleprompter={() => setIsTeleprompter(true)}
            onExportText={handleExportText}
            onManualSave={handleManualSave}
            isResponsibilityAssigned={isResponsibilityAssigned}
            assignedWriterRole={assignedWriterRole}
            canEdit={userPermissions.canEdit}
            canSubmit={userPermissions.canSubmit}
            canApprove={userPermissions.canApprove}
            isCreator={userPermissions.isCreator}
            isAssignedWriter={userPermissions.isAssignedWriter}
            onDeclareDone={handleDeclareDone}
            onUndeclare={handleUndeclare}
            onSubmitForReview={handleSubmitForReview}
            onApprove={handleApprove}
            onRequestRevisions={handleRequestRevisions}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleGlobalUndo}
            onRedo={handleGlobalRedo}
            layoutOrientation={layoutOrientation}
            onToggleLayout={handleToggleLayout}
          />

          {/* Main Studio Body - Full Edge-to-Edge Utilization */}
          <main
            className={`w-full flex-1 px-1.5 py-2 sm:px-3 md:px-6 md:py-3 ${
              layoutOrientation === "horizontal" && !isTableMinimized && !isNotesMinimized
                ? "grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-4 items-start"
                : "flex flex-col gap-2.5 sm:gap-4"
            }`}
          >
            {(() => {
              const notesSection = (
                <section key="notes" className="min-w-0 animate-in fade-in duration-150">
                  <ScriptNotes
                    notes={customNotes}
                    canEdit={userPermissions.canEdit}
                    onUpdateNotes={handleUpdateNotes}
                    isMainScript={isNotesMainScript}
                    onToggleMainScript={handleToggleNotesMainScript}
                    isMinimized={isNotesMinimized}
                    onToggleMinimize={handleToggleNotesMinimized}
                    isExpandedWorkspace={isTableMinimized && !isNotesMinimized}
                  />
                </section>
              );

              const tableSection = (
                <section key="table" className="min-w-0">
                  <ScriptTable
                    columns={columns}
                    rows={rows}
                    comments={comments}
                    scriptStatus={scriptStatus}
                    canEdit={userPermissions.canEdit}
                    onUpdateColumns={handleUpdateColumns}
                    onUpdateRows={handleUpdateRows}
                    onOpenRowComments={handleOpenRowComments}
                    openCommentsCount={comments.filter((c) => !c.is_resolved).length}
                    onOpenAllComments={() => {
                      setActiveCommentRow(null);
                      setCommentsDrawerOpen(true);
                    }}
                    isMinimized={isTableMinimized}
                    onToggleMinimize={handleToggleTableMinimized}
                    isExpandedWorkspace={isNotesMinimized && !isTableMinimized}
                  />
                </section>
              );

              return isNotesMainScript
                ? [notesSection, tableSection]
                : [tableSection, notesSection];
            })()}
          </main>

          {/* Slide-out Review Feedback Drawer */}
          <ScriptCommentsDrawer
            isOpen={commentsDrawerOpen}
            onClose={() => setCommentsDrawerOpen(false)}
            comments={comments}
            activeRowSrNo={activeCommentRow}
            feedbackCategories={feedbackCategories}
            userEmail={userPermissions.userEmail}
            isCreator={userPermissions.isCreator}
            onAddComment={handleAddComment}
            onToggleResolve={handleToggleResolveComment}
            onDeleteComment={handleDeleteComment}
          />

          {/* Studio Footer */}
          <footer className="w-full text-center text-xs text-muted-foreground py-3 font-mono border-t border-border px-4">
            ContentPipe • The Scripting Environment & Teleprompter
          </footer>
        </>
      )}
    </div>
  );
}
