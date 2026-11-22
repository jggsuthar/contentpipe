"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Circle,
  FileText,
  Video,
  ArrowLeftRight,
  ListTodo,
  Plus,
  Check,
  X,
  Loader2,
  Calendar,
  Lock,
  Archive,
  ArchiveRestore,
  ChevronDown,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Trash2,
  ExternalLink,
  Edit3,
  Link2,
  Zap,
  Settings2,
} from "lucide-react";
import { CustomActionItem, TaskStatus } from "@/types/database";
import { resolveTaskColorHex } from "@/lib/task-colors";

export interface MatrixRowItem {
  id: string;
  is_placeholder: boolean;
  unique_content_id: string | null;
  title: string;
  ideation_date: string | null;
  publish_date: string;
  is_manual_publish_date?: boolean;
  cadence_match?: {
    matches: boolean;
    reason: string;
    expectedDaysStr?: string;
  };
  is_archived: boolean;
  remarks: string;
  published_url?: string | null;
  custom_action_items: CustomActionItem[];
  task_instances: {
    id: string;
    task_name: string;
    status: TaskStatus;
    target_date_worst_case?: string | null;
    target_date_team?: string | null;
    target_date_team_1st?: string | null;
    target_date_team_final?: string | null;
  }[];
  task_target_dates?: Record<
    string,
    {
      worst_case: string;
      team: string;
      team_1st: string;
      team_final: string;
    }
  >;
  misc_tasks_status: {
    task_name: string;
    is_done: boolean;
  }[];
  is_archive_eligible?: boolean;
  archive_missing_requirements?: string[];
  has_script: boolean;
  submission_count: number;
}

export interface WorkflowTaskColumn {
  id: string;
  task_name: string;
  sequence_order: number;
  n_days_offset: number;
  team_buffer_days: number;
  team_final_buffer_days: number;
  is_hidden: boolean;
  color?: string | null;
  update_mode?: "manual" | "automatic";
  automation_trigger?: "script_studio" | "drive_raw_footage" | "content_submission" | string | null;
  automation_role_id?: string | null;
  require_closure_link?: boolean;
}

export interface MiscTaskColumn {
  id: string;
  task_name: string;
}

interface MatrixTableProps {
  rows: MatrixRowItem[];
  workflowTasks: WorkflowTaskColumn[];
  miscTasks?: MiscTaskColumn[];
  contentTypeId: string;
  isCreator?: boolean;
  canInputIdeation?: boolean;
  canChangePublish?: boolean;
  indexPermissions?: any;
  onUpdateTitle: (row: MatrixRowItem, newTitle: string) => Promise<void>;
  onSwapSlots: (sourceRow: MatrixRowItem, targetRow: MatrixRowItem) => Promise<void>;
  onToggleActionItem: (itemId: string, actionItemId: string) => Promise<void>;
  onAddActionItem: (itemId: string, text: string) => Promise<void>;
  onUpdateTaskStatus?: (
    itemId: string,
    taskName: string,
    status: TaskStatus,
    publishedUrl?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onUpdatePublishedUrl?: (itemId: string, publishedUrl: string | null) => Promise<void>;
  onToggleMiscTask?: (itemId: string, taskName: string, isDone: boolean) => Promise<void>;
  onArchiveItem?: (itemId: string, action: "archive" | "unarchive") => Promise<{ success: boolean; error?: string }>;
  onDeletePlaceholder?: (row: MatrixRowItem) => void;
  onChangePublishDate?: (row: MatrixRowItem) => void;
}

export function MatrixTable({
  rows,
  workflowTasks,
  miscTasks = [],
  contentTypeId,
  isCreator = true,
  canInputIdeation = true,
  canChangePublish = true,
  indexPermissions,
  onUpdateTitle,
  onSwapSlots,
  onToggleActionItem,
  onAddActionItem,
  onUpdateTaskStatus,
  onUpdatePublishedUrl,
  onToggleMiscTask,
  onArchiveItem,
  onDeletePlaceholder,
  onChangePublishDate,
}: MatrixTableProps) {
  // Local edit states
  const [editingTitleRowId, setEditingTitleRowId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Swapping states
  const [selectedForSwap, setSelectedForSwap] = useState<MatrixRowItem | null>(null);

  // Action Items popover state
  const [activeActionItemRow, setActiveActionItemRow] = useState<MatrixRowItem | null>(null);
  const [newActionItemText, setNewActionItemText] = useState("");

  // Misc tasks popover state
  const [activeMiscRow, setActiveMiscRow] = useState<MatrixRowItem | null>(null);

  // Task status menu dropdown state: `${row.id}_${task_name}`
  const [activeStatusMenuKey, setActiveStatusMenuKey] = useState<string | null>(null);
  const [statusUpdatingKey, setStatusUpdatingKey] = useState<string | null>(null);

  // Validation / Error banner
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirm delete placeholder & Drive content state
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<MatrixRowItem | null>(null);
  const [isDeletingDrive, setIsDeletingDrive] = useState(false);

  // Automation: Manual Override Double-Confirmation Modal state
  const [overrideConfirmModal, setOverrideConfirmModal] = useState<{
    row: MatrixRowItem;
    task: WorkflowTaskColumn;
    newStatus: TaskStatus;
    triggerName: string;
  } | null>(null);

  // Automation: Closure Link Required Modal state
  const [closureLinkModal, setClosureLinkModal] = useState<{
    row: MatrixRowItem;
    task: WorkflowTaskColumn;
    newStatus: TaskStatus;
  } | null>(null);
  const [closureUrlInput, setClosureUrlInput] = useState("");
  const [closureUrlError, setClosureUrlError] = useState<string | null>(null);

  // Content Link Editing Modal state
  const [editLinkModal, setEditLinkModal] = useState<{
    row: MatrixRowItem;
    url: string;
  } | null>(null);
  const [editUrlInput, setEditUrlInput] = useState("");
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  const titleAccess: "none" | "view" | "edit" = isCreator
    ? "edit"
    : (indexPermissions?.content_name || (canInputIdeation ? "edit" : "view"));

  const showWorstCaseDate =
    isCreator || (indexPermissions?.task_target_date !== "none");

  const visibleWorkflowTasks = workflowTasks.filter((t) => {
    if (t.is_hidden) return false;
    if (isCreator) return true;
    const perm = indexPermissions?.tasks?.[t.task_name.toLowerCase()];
    if (perm === "none") return false;
    return true;
  });

  const canEditTask = (taskName: string) => {
    if (isCreator) return true;
    const perm = indexPermissions?.tasks?.[taskName.toLowerCase()];
    if (perm === "edit") return true;
    if (perm === "view" || perm === "none") return false;
    return taskName.toLowerCase() === "publish" ? canChangePublish : true;
  };

  const startEditing = (row: MatrixRowItem) => {
    if (titleAccess !== "edit") return;
    setEditingTitleRowId(row.id);
    setTitleDraft(row.title || "");
  };

  const commitTitle = async (row: MatrixRowItem) => {
    if (editingTitleRowId !== row.id) return;
    if (savingRowId === row.id) return;
    setEditingTitleRowId(null);
    const trimmed = titleDraft.trim();
    if (trimmed === (row.title || "").trim()) {
      return;
    }

    // If clearing an existing title, prompt user with confirmation to delete Drive content
    if (!trimmed && row.title) {
      setConfirmDeleteRow(row);
      return;
    }

    try {
      setSavingRowId(row.id);
      await onUpdateTitle(row, trimmed);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteRow(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteRow) return;
    try {
      setIsDeletingDrive(true);
      await onUpdateTitle(confirmDeleteRow, "");
    } catch (err) {
      console.error("Error clearing placeholder and deleting Drive content:", err);
    } finally {
      setIsDeletingDrive(false);
      setConfirmDeleteRow(null);
    }
  };

  const handleSwapClick = async (row: MatrixRowItem) => {
    if (!selectedForSwap) {
      setSelectedForSwap(row);
    } else {
      if (selectedForSwap.id === row.id) {
        setSelectedForSwap(null);
      } else {
        await onSwapSlots(selectedForSwap, row);
        setSelectedForSwap(null);
      }
    }
  };

  const handleCreateActionItem = async (row: MatrixRowItem) => {
    if (!newActionItemText.trim() || row.is_placeholder) return;
    await onAddActionItem(row.id, newActionItemText.trim());
    setNewActionItemText("");
  };

  const getTriggerLabel = (trigger?: string | null) => {
    if (trigger === "script_studio") return "Scripting Studio update";
    if (trigger === "drive_raw_footage") return "Content Upload in drive (Raw Footage)";
    if (trigger === "content_submission") return "Content Submission (Deliverable cuts)";
    return "Background Automation";
  };

  const isValidUrl = (urlStr: string) => {
    try {
      const u = new URL(urlStr.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleTaskStatusChange = async (
    row: MatrixRowItem,
    taskName: string,
    newStatus: TaskStatus,
    publishedUrl?: string
  ) => {
    if (!onUpdateTaskStatus || row.is_placeholder) return;
    const key = `${row.id}_${taskName}`;
    setStatusUpdatingKey(key);
    setActiveStatusMenuKey(null);
    setValidationError(null);

    try {
      const res = await onUpdateTaskStatus(row.id, taskName, newStatus, publishedUrl);
      if (!res.success && res.error) {
        setValidationError(res.error);
      }
    } catch (err: any) {
      setValidationError(err.message || "Failed to update task status");
    } finally {
      setStatusUpdatingKey(null);
    }
  };

  const onInitiateTaskStatusChange = (
    row: MatrixRowItem,
    task: WorkflowTaskColumn,
    newStatus: TaskStatus
  ) => {
    setActiveStatusMenuKey(null);
    setValidationError(null);

    const isAutomated = task.update_mode === "automatic";

    // 1. Manual Override Double Confirmation (Automated tasks)
    if (isAutomated) {
      if (!isCreator) {
        setValidationError("This task is automated and its status can only be manually overridden by the Creator.");
        return;
      }

      setOverrideConfirmModal({
        row,
        task,
        newStatus,
        triggerName: getTriggerLabel(task.automation_trigger),
      });
      return;
    }

    // 2. Closure Link requirement for manual tasks marked as 'done'
    if (task.require_closure_link && newStatus === "done") {
      setClosureUrlInput(row.published_url || "");
      setClosureUrlError(null);
      setClosureLinkModal({
        row,
        task,
        newStatus,
      });
      return;
    }

    // 3. Normal Manual Status Change
    handleTaskStatusChange(row, task.task_name, newStatus);
  };

  const handleConfirmOverride = () => {
    if (!overrideConfirmModal) return;
    const { row, task, newStatus } = overrideConfirmModal;
    setOverrideConfirmModal(null);

    if (task.require_closure_link && newStatus === "done") {
      setClosureUrlInput(row.published_url || "");
      setClosureUrlError(null);
      setClosureLinkModal({ row, task, newStatus });
      return;
    }

    handleTaskStatusChange(row, task.task_name, newStatus);
  };

  const handleConfirmClosureLink = () => {
    if (!closureLinkModal) return;
    const trimmed = closureUrlInput.trim();
    if (!trimmed) {
      setClosureUrlError("A valid published content URL is required (e.g. YouTube video link).");
      return;
    }
    if (!isValidUrl(trimmed)) {
      setClosureUrlError("Please enter a valid URL beginning with http:// or https://");
      return;
    }

    const { row, task, newStatus } = closureLinkModal;
    setClosureLinkModal(null);
    handleTaskStatusChange(row, task.task_name, newStatus, trimmed);
  };

  const handleSaveEditedUrl = async () => {
    if (!editLinkModal) return;
    const trimmed = editUrlInput.trim();
    if (trimmed && !isValidUrl(trimmed)) {
      setValidationError("Please enter a valid URL beginning with http:// or https://");
      return;
    }
    try {
      setIsSavingUrl(true);
      if (onUpdatePublishedUrl) {
        await onUpdatePublishedUrl(editLinkModal.row.id, trimmed || null);
      } else {
        await fetch("/api/tracker/item", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: editLinkModal.row.id, published_url: trimmed || null }),
        });
      }
      setEditLinkModal(null);
    } catch (err: any) {
      setValidationError(err.message || "Failed to update content URL");
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleArchiveClick = async (row: MatrixRowItem, action: "archive" | "unarchive") => {
    if (!onArchiveItem || row.is_placeholder) return;
    setValidationError(null);
    try {
      const res = await onArchiveItem(row.id, action);
      if (!res.success && res.error) {
        setValidationError(res.error);
      }
    } catch (err: any) {
      setValidationError(err.message || "Failed to archive item");
    }
  };

  // Format date helper: "24 Oct"
  const formatDateDisplay = (dateStr?: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Urgency badge for unfinished tasks: Delay: {n}d (overdue) | Near (+7d -> 0d orange-to-red)
  const renderDeadlineUrgencyBadge = (targetIso?: string | null, status?: TaskStatus) => {
    if (!targetIso || status === "done") return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(targetIso);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const delayDays = Math.abs(diffDays);
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-red-600 text-white border border-red-400/50 shadow-xs mt-0.5 whitespace-nowrap"
          title={`Overdue by ${delayDays} day${delayDays === 1 ? "" : "s"}`}
        >
          Delay: {delayDays}d
        </span>
      );
    }

    if (diffDays <= 7) {
      // Gradient interpolation: +7 days (orange) -> 0 days (red)
      const t = (7 - diffDays) / 7;
      const r = Math.round(249 + (239 - 249) * t);
      const g = Math.round(138 + (68 - 138) * t);
      const b = Math.round(22 + (68 - 22) * t);
      const endR = Math.round(234 + (210 - 234) * t);
      const endG = Math.round(88 + (38 - 88) * t);
      const endB = Math.round(12 + (38 - 12) * t);

      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold text-white border border-white/20 shadow-xs mt-0.5 whitespace-nowrap"
          style={{
            backgroundImage: `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgb(${endR}, ${endG}, ${endB}))`,
          }}
          title={
            diffDays === 0
              ? "Due today"
              : `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`
          }
        >
          Near
        </span>
      );
    }

    return null;
  };

  return (
    <div className="w-full card-theme rounded-2xl">
      {/* Sequential Dependency or Action Error Banner */}
      {validationError && (
        <div className="sticky top-0 z-30 bg-destructive/15 border-b border-destructive/30 px-4 py-2.5 flex items-center justify-between text-xs text-destructive backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{validationError}</span>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="p-1 hover:bg-destructive/20 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <table className="w-full min-w-max text-left border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky top-0 z-20 py-3 px-3 w-14 text-center bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Swap
              </th>
              <th className="sticky top-0 z-20 py-3 px-3 w-28 bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Content ID
              </th>
              <th className="sticky top-0 z-20 py-3 px-4 min-w-[240px] bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Video Title (Type to Register)
              </th>

              {/* Dynamic Workflow Columns with exact raw task colors and uniform solid black text boxes */}
              {visibleWorkflowTasks.map((task) => {
                const colorHex = resolveTaskColorHex(task.task_name, task.color);

                return (
                  <th
                    key={task.id}
                    className="sticky top-0 z-20 py-2.5 px-3 min-w-[130px] text-center border-b border-border shadow-xs transition-colors"
                    style={{
                      backgroundColor: colorHex,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] uppercase tracking-wider font-bold bg-black text-white shadow-xs">
                        {task.task_name}
                        {task.update_mode === "automatic" && (
                          <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        )}
                      </span>
                      {showWorstCaseDate && (
                        <span className="inline-block px-2 py-0.2 rounded text-[9px] lowercase font-mono bg-black text-white shadow-xs">
                          {task.n_days_offset > 0 ? `-${task.n_days_offset}d worst-case` : "drop-dead"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              <th className="sticky top-0 z-20 py-3 px-3 w-28 text-center bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Misc Tasks
              </th>
              <th className="sticky top-0 z-20 py-3 px-3 w-28 text-center bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Action Items
              </th>
              <th className="sticky top-0 z-20 py-3 px-3 w-32 text-center bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Workspace
              </th>
              <th className="sticky top-0 z-20 py-3 px-3 w-28 text-center bg-popover/95 backdrop-blur-md border-b border-border shadow-xs">
                Archive
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {rows.map((row) => {
              const isEmptyPlaceholder = !row.title;
              const isSelectedSwap = selectedForSwap?.id === row.id;

              const isEditing = editingTitleRowId === row.id;
              const isSaving = savingRowId === row.id;

              const openActionsCount = row.custom_action_items.filter((ai) => !ai.is_closed).length;

              // Misc tasks metrics
              const miscCompletedCount = (row.misc_tasks_status || []).filter((m) => m.is_done).length;
              const miscTotalCount = miscTasks.length;
              const allMiscDone = miscTotalCount > 0 && miscCompletedCount === miscTotalCount;

              return (
                <tr
                  key={row.id}
                  className={`transition-colors border-b border-border/60 ${
                    isSelectedSwap
                      ? "bg-primary/10 border-2 border-primary"
                      : isEmptyPlaceholder
                      ? "opacity-85 hover:bg-muted/30"
                      : "hover:bg-muted/20"
                  }`}
                >
                  {/* Column 1: Swap Button */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleSwapClick(row)}
                      className={`p-1.5 rounded transition-all cursor-pointer ${
                        isSelectedSwap
                          ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      title={
                        selectedForSwap
                          ? isSelectedSwap
                            ? "Cancel swap"
                            : `Swap with ${selectedForSwap.unique_content_id || "selected slot"}`
                          : "Select slot to move / swap"
                      }
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  </td>

                  {/* Column 2: Unique Content ID */}
                  <td className="py-2.5 px-3 font-mono font-bold text-xs">
                    {row.unique_content_id ? (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {row.unique_content_id}
                      </span>
                    ) : (
                      <span className="text-muted-foreground opacity-40 font-mono text-[11px]">
                        [Open Slot]
                      </span>
                    )}
                  </td>

                  {/* Column 3: Video Title (Editable / Permissions Guarded) */}
                  <td className="py-2.5 px-4">
                    {titleAccess === "none" ? (
                      <div className="py-1.5 px-2 text-muted-foreground/40 font-mono italic select-none">
                        ••••••••
                      </div>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitTitle(row);
                            if (e.key === "Escape") setEditingTitleRowId(null);
                          }}
                          onBlur={() => commitTitle(row)}
                          placeholder="Type title to claim ID & mark Ideation Done..."
                          className="w-full h-8 px-2.5 text-xs rounded-xl glass-input"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div
                          onClick={() => {
                            if (titleAccess === "edit") startEditing(row);
                          }}
                          className={`py-1.5 px-2 rounded transition-colors flex items-center justify-between group ${
                            titleAccess !== "edit"
                              ? "cursor-default text-foreground font-medium"
                              : "cursor-text " +
                                (isEmptyPlaceholder
                                  ? "border border-dashed border-border/80 text-muted-foreground hover:border-primary/50"
                                  : "hover:bg-muted/50 font-medium")
                          }`}
                          title={
                            titleAccess !== "edit"
                              ? "Title is view-only"
                              : "Click to edit title (Clearing title resets slot and frees ID)"
                          }
                        >
                          <span className="truncate">
                            {row.title || (titleAccess === "edit" ? "Click to enter idea title..." : "Open placeholder slot")}
                          </span>
                          {isSaving && <Loader2 className="w-3 h-3 animate-spin text-primary ml-2" />}
                        </div>

                        {/* Saved Content Link Badge & Edit Button (Active & Archive views) */}
                        {row.published_url ? (
                          <div className="flex items-center gap-1.5 px-2">
                            <a
                              href={row.published_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors shadow-2xs"
                              title={`Open Published Content: ${row.published_url}`}
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate max-w-[150px]">Content Link</span>
                            </a>
                            {isCreator && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditUrlInput(row.published_url || "");
                                  setEditLinkModal({ row, url: row.published_url || "" });
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                title="Edit or remove Content Link"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          row.title && isCreator && (
                            <div className="px-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditUrlInput("");
                                  setEditLinkModal({ row, url: "" });
                                }}
                                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                                title="Attach published content URL"
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                <span>+ Content Link</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </td>

                  {/* Compute last done activity in the workflow sequence for this row */}
                  {(() => {
                    let lastDoneIndex = -1;
                    let lastDoneColorHex: string | null = null;
                    for (let i = visibleWorkflowTasks.length - 1; i >= 0; i--) {
                      const t = visibleWorkflowTasks[i];
                      const tKey = t.task_name.toLowerCase();
                      let isDone = false;
                      if (tKey === "ideation") {
                        isDone = Boolean(row.title && row.unique_content_id);
                      } else if (tKey === "publish") {
                        const prev = visibleWorkflowTasks.slice(0, i);
                        const allPriorDone = prev.every((prior) => {
                          const pk = prior.task_name.toLowerCase();
                          if (pk === "ideation") return Boolean(row.title && row.unique_content_id);
                          return row.task_instances.find((inst) => inst.task_name.toLowerCase() === pk)?.status === "done";
                        });
                        const pDate = new Date(row.publish_date);
                        pDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const pubPassed = today.getTime() >= pDate.getTime();
                        isDone = allPriorDone && pubPassed;
                      } else {
                        isDone = row.task_instances.find((inst) => inst.task_name.toLowerCase() === tKey)?.status === "done";
                      }
                      if (isDone) {
                        lastDoneIndex = i;
                        lastDoneColorHex = resolveTaskColorHex(t.task_name, t.color);
                        break;
                      }
                    }

                    return visibleWorkflowTasks.map((task, colIndex) => {
                      const taskKey = task.task_name.toLowerCase();
                      const isIdeation = taskKey === "ideation";
                      const isPublish = taskKey === "publish";
                      const isCellColored = lastDoneIndex !== -1 && colIndex <= lastDoneIndex;
                      const cellBg = isCellColored ? (lastDoneColorHex || undefined) : undefined;

                      // Computed target dates
                      const targetDates = row.task_target_dates?.[taskKey];
                      const worstCaseStr = formatDateDisplay(targetDates?.worst_case);
                      const teamStr = formatDateDisplay(targetDates?.team);

                      // Task instance status
                      const existingInstance = row.task_instances.find(
                        (t) => t.task_name.toLowerCase() === taskKey
                      );
                      const isIdeationDone = Boolean(row.title && row.unique_content_id);

                      // Automatic evaluation of fixed 'Publish' node:
                      // a. All visible tasks prior to Publish are done
                      // b. Publish target date has passed (Today >= Publish Date at day resolution)
                      let isPublishDone = false;
                      let publishBlockedReason = "";
                      if (isPublish) {
                        const previousTasks = visibleWorkflowTasks.slice(0, colIndex);
                        let allPriorDone = true;
                        const missingTasks: string[] = [];
                        for (const prior of previousTasks) {
                          const pk = prior.task_name.toLowerCase();
                          if (pk === "ideation") {
                            if (!row.title || !row.unique_content_id) {
                              allPriorDone = false;
                              missingTasks.push("Ideation");
                            }
                          } else {
                            const inst = row.task_instances.find((ti) => ti.task_name.toLowerCase() === pk);
                            if (inst?.status !== "done") {
                              allPriorDone = false;
                              missingTasks.push(prior.task_name);
                            }
                          }
                        }

                        const pDate = new Date(row.publish_date);
                        pDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const publishDatePassed = today.getTime() >= pDate.getTime();

                        isPublishDone = allPriorDone && publishDatePassed;

                        if (!isPublishDone) {
                          if (!allPriorDone && !publishDatePassed) {
                            publishBlockedReason = `Waiting on: ${missingTasks.join(", ")} & Publish Date (${formatDateDisplay(row.publish_date)})`;
                          } else if (!allPriorDone) {
                            publishBlockedReason = `Waiting on: ${missingTasks.join(", ")}`;
                          } else {
                            publishBlockedReason = `All tasks complete! Awaiting Publish Date (${formatDateDisplay(row.publish_date)})`;
                          }
                        }
                      }

                      const taskStatus: TaskStatus = isIdeation
                        ? isIdeationDone
                          ? "done"
                          : "not_done"
                        : isPublish
                        ? isPublishDone
                          ? "done"
                          : "not_done"
                        : existingInstance?.status || "not_done";

                      const urgencyTargetIso = isPublish
                        ? targetDates?.worst_case || row.publish_date
                        : isCreator
                        ? targetDates?.worst_case
                        : targetDates?.team || targetDates?.worst_case;

                      const menuKey = `${row.id}_${task.task_name}`;
                      const isMenuOpen = activeStatusMenuKey === menuKey;
                      const isUpdating = statusUpdatingKey === menuKey;

                      return (
                        <td
                          key={task.id}
                          className="py-2.5 px-3 text-center relative transition-colors"
                          style={{
                            backgroundColor: cellBg,
                          }}
                        >
                          {isIdeation ? (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              {isCellColored ? (
                                <div
                                  className="inline-flex items-center justify-center px-2 py-0.5 rounded shadow-xs bg-black text-white font-mono text-[10px] font-bold"
                                  title="Ideation completed from title registration"
                                >
                                  <span>Done</span>
                                </div>
                              ) : (
                                <div
                                  className="inline-flex items-center justify-center px-2 py-0.5 rounded border border-border bg-muted/60 text-muted-foreground font-mono text-[10px] font-medium"
                                  title="Empty placeholder: Enter title to complete ideation"
                                >
                                  <span>Pending</span>
                                </div>
                              )}
                              {/* Target date indicator */}
                              {isCellColored ? (
                                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-black text-white shadow-xs mt-0.5">
                                  {isCreator ? (
                                    <span>
                                      {worstCaseStr}
                                      {teamStr && teamStr !== worstCaseStr && (
                                        <span className="opacity-80 text-[9px]"> [{teamStr}]</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span>{teamStr || (showWorstCaseDate ? worstCaseStr : "")}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                                  {isCreator ? (
                                    <span>
                                      {worstCaseStr}
                                      {teamStr && teamStr !== worstCaseStr && (
                                        <span className="opacity-70 text-[9px]"> [{teamStr}]</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span>{teamStr || (showWorstCaseDate ? worstCaseStr : "")}</span>
                                  )}
                                </span>
                              )}
                              {renderDeadlineUrgencyBadge(urgencyTargetIso, taskStatus)}
                            </div>
                          ) : isPublish ? (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              {isPublishDone ? (
                                <div
                                  className="inline-flex items-center justify-center px-2 py-0.5 rounded shadow-xs bg-black text-white font-mono text-[10px] font-bold"
                                  title="Publish completed: All previous tasks completed and publish target date reached."
                                >
                                  <span>Done</span>
                                </div>
                              ) : (
                                <div
                                  className="inline-flex items-center justify-center px-2 py-0.5 rounded border border-border bg-muted/60 text-muted-foreground font-mono text-[10px] font-medium cursor-help"
                                  title={publishBlockedReason}
                                >
                                  <span>Pending</span>
                                </div>
                              )}
                              {/* Target date indicator with cadence / manual badge */}
                              {(() => {
                                const isManual = Boolean(row.is_manual_publish_date);
                                const isCadenceMatch = row.cadence_match?.matches ?? true;
                                const matchReason = row.cadence_match?.reason || "";

                                let iconBadge = null;
                                if (isManual) {
                                  iconBadge = (
                                    <span
                                      title="Manually added publish date: Custom scheduled slot (manual override)"
                                      className="inline-flex items-center text-sky-400 hover:text-sky-300 cursor-help ml-1"
                                    >
                                      <Settings2 className="w-2.5 h-2.5" />
                                    </span>
                                  );
                                } else if (isCadenceMatch) {
                                  iconBadge = (
                                    <span
                                      title={`Cadence Matched: ${matchReason || "Adheres to current cadence schedule"}`}
                                      className="inline-flex items-center text-emerald-400 hover:text-emerald-300 cursor-help ml-1"
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                    </span>
                                  );
                                } else {
                                  iconBadge = (
                                    <span
                                      title={`Cadence Mismatch: ${matchReason || "Does not match current cadence schedule"}`}
                                      className="inline-flex items-center text-amber-400 hover:text-amber-300 cursor-help ml-1"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                    </span>
                                  );
                                }

                                const canEditPublishDate =
                                  (isCreator || canChangePublish) &&
                                  !isPublishDone &&
                                  Boolean(onChangePublishDate);

                                if (canEditPublishDate) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => onChangePublishDate && onChangePublishDate(row)}
                                      title="Click to change publish date (Double confirmation)"
                                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer group hover:scale-105 mt-0.5 ${
                                        isCellColored
                                          ? "bg-black text-white shadow-xs hover:bg-black/80"
                                          : "bg-muted/70 text-foreground hover:bg-muted border border-border"
                                      }`}
                                    >
                                      <span>{worstCaseStr}</span>
                                      {iconBadge}
                                      <Edit3 className="w-2.5 h-2.5 ml-0.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                  );
                                }

                                return isCellColored ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-black text-white shadow-xs mt-0.5">
                                    <span>{worstCaseStr}</span>
                                    {iconBadge}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                                    <span>{worstCaseStr}</span>
                                    {iconBadge}
                                  </span>
                                );
                              })()}
                              {renderDeadlineUrgencyBadge(urgencyTargetIso, taskStatus)}
                            </div>
                          ) : (
                            /* Intermediate workflow tasks */
                            <div className="flex flex-col items-center justify-center gap-1">
                              {/* Status Button / Pill */}
                              <div className="relative">
                                <button
                                  type="button"
                                  disabled={
                                    isEmptyPlaceholder ||
                                    isUpdating ||
                                    (taskKey === "publish" && !canChangePublish) ||
                                    !canEditTask(task.task_name)
                                  }
                                  onClick={() => {
                                    if (!canEditTask(task.task_name)) return;
                                    setActiveStatusMenuKey(isMenuOpen ? null : menuKey);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
                                    isCellColored
                                      ? "bg-black text-white shadow-xs hover:bg-black/80"
                                      : taskStatus === "under_review"
                                      ? "bg-status-review/15 text-status-review border border-status-review/30 hover:bg-status-review/25"
                                      : taskStatus === "revision_needed"
                                      ? "bg-status-revision/15 text-status-revision border border-status-revision/30 hover:bg-status-revision/25"
                                      : "bg-muted/60 text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
                                  } ${
                                    isEmptyPlaceholder || (taskKey === "publish" && !canChangePublish) || !canEditTask(task.task_name)
                                      ? "opacity-50 cursor-default"
                                      : "cursor-pointer"
                                  }`}
                                  style={{
                                    borderRadius: "var(--radius)",
                                  }}
                                  title={
                                    !canEditTask(task.task_name)
                                      ? "View-only access for this task"
                                      : taskKey === "publish" && !canChangePublish
                                      ? "Requires Publish submission responsibility to update"
                                      : "Click to change task status"
                                  }
                                >
                                  {isUpdating ? (
                                    <Loader2 className={`w-3 h-3 animate-spin ${isCellColored ? "text-white" : "text-foreground"}`} />
                                  ) : (
                                    <>
                                      {task.update_mode === "automatic" && (
                                        <span
                                          title={`Automated task: ${getTriggerLabel(task.automation_trigger)}`}
                                          className="inline-flex items-center"
                                        >
                                          <Zap
                                            className={`w-2.5 h-2.5 shrink-0 ${
                                              isCellColored ? "text-amber-300 fill-amber-300" : "text-amber-500 fill-amber-500"
                                            }`}
                                          />
                                        </span>
                                      )}
                                      <span>
                                        {taskStatus === "done" && "Done"}
                                        {taskStatus === "under_review" && "Review"}
                                        {taskStatus === "revision_needed" && "Revision"}
                                        {taskStatus === "not_done" && "Pending"}
                                      </span>
                                      {canEditTask(task.task_name) && (
                                        <ChevronDown
                                          className={`w-2.5 h-2.5 ${isCellColored ? "text-white" : "opacity-70"}`}
                                        />
                                      )}
                                    </>
                                  )}
                                </button>

                                {/* 4-State Status Popover Menu */}
                              {isMenuOpen && canEditTask(task.task_name) && (
                                <div
                                  className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-36 glass-floating rounded-xl z-30 p-1.5 space-y-0.5 text-left text-[11px] font-sans"
                                >
                                  <button
                                    onClick={() => onInitiateTaskStatusChange(row, task, "done")}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-muted flex items-center gap-1.5 cursor-pointer font-medium"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: "var(--status-done)" }}
                                    />
                                    <span>Done</span>
                                  </button>
                                  <button
                                    onClick={() => onInitiateTaskStatusChange(row, task, "under_review")}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-muted flex items-center gap-1.5 cursor-pointer font-medium"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: "var(--status-review)" }}
                                    />
                                    <span>Under Review</span>
                                  </button>
                                  <button
                                    onClick={() => onInitiateTaskStatusChange(row, task, "revision_needed")}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-muted flex items-center gap-1.5 cursor-pointer font-medium"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: "var(--status-revision)" }}
                                    />
                                    <span>Revision Needed</span>
                                  </button>
                                  <button
                                    onClick={() => onInitiateTaskStatusChange(row, task, "not_done")}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-muted flex items-center gap-1.5 cursor-pointer font-medium text-muted-foreground"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-border" />
                                    <span>Not Done</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Dual Timelines Date Display (Exact match to Ideation) */}
                            {isCellColored ? (
                              <span
                                className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-black text-white shadow-xs mt-0.5 whitespace-nowrap"
                                title={
                                  isCreator
                                    ? `Creator Worst-Case: ${worstCaseStr} | Team Buffer: ${teamStr}`
                                    : showWorstCaseDate
                                    ? `Worst-Case: ${worstCaseStr} | Team: ${teamStr}`
                                    : `Team Deadline: ${teamStr}`
                                }
                              >
                                {isCreator ? (
                                  <span>
                                    {worstCaseStr}
                                    {teamStr && teamStr !== worstCaseStr && (
                                      <span className="opacity-80 text-[9px]"> [{teamStr}]</span>
                                    )}
                                  </span>
                                ) : (
                                  <span>{teamStr || (showWorstCaseDate ? worstCaseStr : "")}</span>
                                )}
                              </span>
                            ) : (
                              <span
                                className="text-[10px] font-mono text-muted-foreground whitespace-nowrap mt-0.5"
                                title={
                                  isCreator
                                    ? `Creator Worst-Case: ${worstCaseStr} | Team Buffer: ${teamStr}`
                                    : showWorstCaseDate
                                    ? `Worst-Case: ${worstCaseStr} | Team: ${teamStr}`
                                    : `Team Deadline: ${teamStr}`
                                }
                              >
                                {isCreator ? (
                                  <span>
                                    {worstCaseStr}
                                    {teamStr && teamStr !== worstCaseStr && (
                                      <span className="opacity-70 text-[9px]"> [{teamStr}]</span>
                                    )}
                                  </span>
                                ) : (
                                  <span>{teamStr || (showWorstCaseDate ? worstCaseStr : "")}</span>
                                )}
                              </span>
                            )}
                            {renderDeadlineUrgencyBadge(urgencyTargetIso, taskStatus)}
                          </div>
                        )}
                      </td>
                    );
                    });
                  })()}

                  {/* Column: Misc Tasks Popover Trigger */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      disabled={isEmptyPlaceholder}
                      onClick={() => setActiveMiscRow(row)}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1 mx-auto cursor-pointer ${
                        isEmptyPlaceholder
                          ? "opacity-30 cursor-not-allowed"
                          : allMiscDone
                          ? "bg-status-done/15 text-status-done border border-status-done/30 font-bold"
                          : miscCompletedCount > 0
                          ? "bg-primary/10 text-primary border border-primary/20 font-bold"
                          : "hover:bg-muted text-muted-foreground border border-transparent"
                      }`}
                      style={{ borderRadius: "var(--radius)" }}
                      title="Manage row-level Misc Tasks"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>
                        {miscTotalCount > 0 ? `${miscCompletedCount}/${miscTotalCount}` : "Misc"}
                      </span>
                    </button>
                  </td>

                  {/* Column: Custom Action Items Badge */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      disabled={isEmptyPlaceholder}
                      onClick={() => setActiveActionItemRow(row)}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1 mx-auto cursor-pointer ${
                        isEmptyPlaceholder
                          ? "opacity-30 cursor-not-allowed"
                          : openActionsCount > 0
                          ? "bg-primary/10 text-primary border border-primary/20 font-bold"
                          : "hover:bg-muted text-muted-foreground border border-transparent"
                      }`}
                      style={{ borderRadius: "var(--radius)" }}
                    >
                      <ListTodo className="w-3 h-3" />
                      <span>{openActionsCount > 0 ? `${openActionsCount} to-do` : "Add"}</span>
                    </button>
                  </td>

                  {/* Column: Quick Link Buttons to Script & Content */}
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {isCreator || indexPermissions?.script_studio_access !== "none" ? (
                        <Link
                          href={row.unique_content_id ? `/scripts/${row.unique_content_id}` : "#"}
                          className={`p-1.5 rounded transition-all text-[11px] font-semibold flex items-center gap-1 ${
                            row.unique_content_id
                              ? "bg-muted hover:bg-muted/80 text-foreground border border-border"
                              : "opacity-25 pointer-events-none text-muted-foreground"
                          }`}
                          style={{ borderRadius: "var(--radius)" }}
                          title={row.unique_content_id ? "Open Script Editor" : "Claim title first to enable script"}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Script</span>
                        </Link>
                      ) : (
                        <span
                          className="p-1.5 rounded text-[11px] font-semibold flex items-center gap-1 opacity-25 cursor-not-allowed text-muted-foreground border border-transparent"
                          title="No permission to access Script Studio"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Script</span>
                        </span>
                      )}

                      <Link
                        href={row.unique_content_id ? `/content/${row.unique_content_id}` : "#"}
                        className={`p-1.5 rounded transition-all text-[11px] font-semibold flex items-center gap-1 ${
                          row.unique_content_id
                            ? "bg-muted hover:bg-muted/80 text-foreground border border-border"
                            : "opacity-25 pointer-events-none text-muted-foreground"
                        }`}
                        style={{ borderRadius: "var(--radius)" }}
                        title={row.unique_content_id ? "Open Content & Review Hub" : "Claim title first to enable content"}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Content</span>
                      </Link>

                      {row.published_url && (
                        <a
                          href={row.published_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded transition-all text-[11px] font-semibold flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                          style={{ borderRadius: "var(--radius)" }}
                          title={`View published content: ${row.published_url}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Link</span>
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Column: Archive Action */}
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {row.is_archived ? (
                        isCreator || indexPermissions?.archive === "edit" ? (
                          <button
                            type="button"
                            onClick={() => handleArchiveClick(row, "unarchive")}
                            className="px-2 py-1 rounded text-[11px] font-mono transition-all flex items-center gap-1 cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border"
                            style={{ borderRadius: "var(--radius)" }}
                            title="Restore item to active tracker"
                          >
                            <ArchiveRestore className="w-3 h-3 text-primary" />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground opacity-60">
                            Archived
                          </span>
                        )
                      ) : isEmptyPlaceholder ? (
                        <span className="text-[10px] font-mono text-muted-foreground opacity-30">
                          —
                        </span>
                      ) : row.is_archive_eligible ? (
                        isCreator || indexPermissions?.archive === "edit" ? (
                          <button
                            type="button"
                            onClick={() => handleArchiveClick(row, "archive")}
                            className="px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                            style={{ borderRadius: "var(--radius)" }}
                            title="All tasks and publish date fulfilled! Click to move to Archive."
                          >
                            <Archive className="w-3 h-3" />
                            <span>Archive</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">
                            Fulfilled
                          </span>
                        )
                      ) : (
                        <div
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-muted-foreground border border-border/50 cursor-help"
                          title={`Cannot archive yet: ${row.archive_missing_requirements?.join(" • ")}`}
                        >
                          <Lock className="w-2.5 h-2.5 opacity-60" />
                          <span>Locked</span>
                        </div>
                      )}

                      {/* Delete Placeholder Button */}
                      {(isCreator || titleAccess === "edit") && (
                        <button
                          type="button"
                          onClick={() => onDeletePlaceholder && onDeletePlaceholder(row)}
                          className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Delete placeholder / content"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

      {/* ------------------------------------------------------------- */}
      {/* Misc Tasks Popover Modal                                      */}
      {/* ------------------------------------------------------------- */}
      {activeMiscRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-sm p-5 shadow-2xl space-y-4"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                <div>
                  <h4 className="font-bold text-xs">
                    Misc Tasks: {activeMiscRow.unique_content_id || "Video"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground truncate max-w-xs">
                    {activeMiscRow.title}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveMiscRow(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {miscTasks.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs font-mono">
                  No misc tasks configured in Settings for this Content Series.
                </div>
              ) : (
                miscTasks.map((task) => {
                  const isDone = Boolean(
                    activeMiscRow.misc_tasks_status?.find(
                      (m) => m.task_name.toLowerCase() === task.task_name.toLowerCase()
                    )?.is_done
                  );

                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        if (onToggleMiscTask) {
                          const updatedMisc = [...(activeMiscRow.misc_tasks_status || [])];
                          const idx = updatedMisc.findIndex(
                            (m) => m.task_name.toLowerCase() === task.task_name.toLowerCase()
                          );
                          if (idx >= 0) {
                            updatedMisc[idx] = { ...updatedMisc[idx], is_done: !isDone };
                          } else {
                            updatedMisc.push({ task_name: task.task_name, is_done: !isDone });
                          }
                          setActiveMiscRow({
                            ...activeMiscRow,
                            misc_tasks_status: updatedMisc,
                          });
                          void onToggleMiscTask(activeMiscRow.id, task.task_name, !isDone);
                        }
                      }}
                      className="p-2.5 rounded flex items-center justify-between hover:bg-muted/40 cursor-pointer border border-border/50 text-xs transition-colors"
                      style={{ borderRadius: "var(--radius)" }}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isDone}
                          readOnly
                          className="accent-primary w-4 h-4 rounded"
                        />
                        <span className={isDone ? "line-through text-muted-foreground" : "font-medium"}>
                          {task.task_name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {isDone ? "Completed" : "Pending"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setActiveMiscRow(null)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground"
                style={{ borderRadius: "var(--radius)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Custom Action Items Modal / Flyout                            */}
      {/* ------------------------------------------------------------- */}
      {activeActionItemRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-md p-5 shadow-2xl space-y-4"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-primary" />
                <div>
                  <h4 className="font-bold text-xs">
                    Action Items: {activeActionItemRow.unique_content_id || "Video"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground truncate max-w-xs">
                    {activeActionItemRow.title}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveActionItemRow(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing Checklist */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {activeActionItemRow.custom_action_items.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs font-mono">
                  No action items registered yet.
                </div>
              ) : (
                activeActionItemRow.custom_action_items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onToggleActionItem(activeActionItemRow.id, item.id)}
                    className="p-2 rounded flex items-center gap-2.5 hover:bg-muted/40 cursor-pointer border border-border/50 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={item.is_closed}
                      readOnly
                      className="accent-primary"
                    />
                    <span className={item.is_closed ? "line-through text-muted-foreground" : "font-medium"}>
                      {item.text}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Action Item */}
            <div className="pt-2 border-t border-border flex items-center gap-2">
              <input
                type="text"
                value={newActionItemText}
                onChange={(e) => setNewActionItemText(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleCreateActionItem(activeActionItemRow))
                }
                placeholder="e.g. End Screen ID: 260201..."
                className="flex-1 h-8 px-2.5 text-xs rounded bg-background border border-border focus:outline-none focus:border-primary"
                style={{ borderRadius: "var(--radius)" }}
              />
              <button
                type="button"
                onClick={() => handleCreateActionItem(activeActionItemRow)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
                style={{ borderRadius: "var(--radius)" }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Remove Placeholder & Drive Content Confirmation Modal          */}
      {/* ------------------------------------------------------------- */}
      {confirmDeleteRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-md p-6 shadow-2xl space-y-4 border border-destructive/40"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-foreground">
                  Remove Placeholder & Drive Content
                </h4>
                <p className="text-xs text-muted-foreground truncate">
                  {confirmDeleteRow.unique_content_id ? `${confirmDeleteRow.unique_content_id} • ` : ""}
                  {confirmDeleteRow.title}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={isDeletingDrive}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground space-y-2 py-1 leading-relaxed">
              <p className="font-medium text-foreground">
                In order to remove this placeholder you will have to remove all the content from drive.
              </p>
              <p>
                Clicking <span className="font-semibold text-destructive">OK</span> will trigger Google Drive sync, permanently delete all folders and files for this Content ID from Google Drive, and reset this row back to an empty placeholder.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={isDeletingDrive}
                className="px-3.5 py-1.5 rounded text-xs font-medium border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingDrive}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                {isDeletingDrive ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting from Drive...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>OK, Delete from Drive</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Automation: Manual Override Double Confirmation Modal          */}
      {/* ------------------------------------------------------------- */}
      {overrideConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-md p-6 shadow-2xl space-y-4 border border-amber-500/40"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-foreground">
                  Manual Override Confirmation
                </h4>
                <p className="text-xs text-muted-foreground truncate">
                  {overrideConfirmModal.row.unique_content_id ? `${overrideConfirmModal.row.unique_content_id} • ` : ""}
                  {overrideConfirmModal.task.task_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideConfirmModal(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground space-y-2 py-1 leading-relaxed">
              <p className="font-medium text-foreground">
                This task status is configured to update automatically based on:
              </p>
              <div className="p-2.5 rounded bg-muted/60 border border-border/80 font-mono text-[11px] text-foreground flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{overrideConfirmModal.triggerName}</span>
              </div>
              <p>
                Manually changing this status to <span className="font-bold text-foreground uppercase">{overrideConfirmModal.newStatus.replace("_", " ")}</span> will override the automated sync state.
              </p>
              <p className="text-[11px] opacity-80">
                Are you sure you want to proceed with this manual override?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setOverrideConfirmModal(null)}
                className="px-3.5 py-1.5 rounded text-xs font-medium border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmOverride}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm Override</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Closure Link Required Modal (Marking Done)                    */}
      {/* ------------------------------------------------------------- */}
      {closureLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-md p-6 shadow-2xl space-y-4 border border-primary/40"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-foreground">
                  Publish Content URL Required
                </h4>
                <p className="text-xs text-muted-foreground truncate">
                  {closureLinkModal.row.unique_content_id ? `${closureLinkModal.row.unique_content_id} • ` : ""}
                  Marking &ldquo;{closureLinkModal.task.task_name}&rdquo; as Done
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClosureLinkModal(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 py-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This task requires the final published content URL before it can be closed out.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
                  <span>Published Content URL</span>
                  <span className="text-[10px] text-muted-foreground font-normal">e.g. YouTube, Instagram, etc.</span>
                </label>
                <input
                  type="url"
                  autoFocus
                  value={closureUrlInput}
                  onChange={(e) => {
                    setClosureUrlInput(e.target.value);
                    setClosureUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmClosureLink();
                    if (e.key === "Escape") setClosureLinkModal(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full h-9 px-3 text-xs rounded bg-background border border-border focus:border-primary focus:outline-none transition-colors"
                  style={{ borderRadius: "var(--radius)" }}
                />
                {closureUrlError && (
                  <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{closureUrlError}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setClosureLinkModal(null)}
                className="px-3.5 py-1.5 rounded text-xs font-medium border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmClosureLink}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Mark Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Edit Content Link Modal (From Badge or Workspace Link)         */}
      {/* ------------------------------------------------------------- */}
      {editLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="card-theme w-full max-w-md p-6 shadow-2xl space-y-4 border border-border"
            style={{ borderRadius: "var(--radius)" }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-foreground">
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-foreground">
                  Edit Content Link
                </h4>
                <p className="text-xs text-muted-foreground truncate">
                  {editLinkModal.row.unique_content_id ? `${editLinkModal.row.unique_content_id} • ` : ""}
                  {editLinkModal.row.title || "Untitled Slot"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditLinkModal(null)}
                disabled={isSavingUrl}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
                  <span>Published URL</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Leave empty to remove link</span>
                </label>
                <input
                  type="url"
                  autoFocus
                  value={editUrlInput}
                  onChange={(e) => setEditUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEditedUrl();
                    if (e.key === "Escape") setEditLinkModal(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full h-9 px-3 text-xs rounded bg-background border border-border focus:border-primary focus:outline-none transition-colors"
                  style={{ borderRadius: "var(--radius)" }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditLinkModal(null)}
                disabled={isSavingUrl}
                className="px-3.5 py-1.5 rounded text-xs font-medium border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEditedUrl}
                disabled={isSavingUrl}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                {isSavingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
