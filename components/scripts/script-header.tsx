"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Copy,
  Check,
  Loader2,
  Send,
  ThumbsUp,
  RotateCcw,
  Eye,
  CheckCircle2,
  Save,
  Undo2,
  AlertCircle,
  Clock,
  Columns2,
  Rows2,
} from "lucide-react";
import { ScriptLifecycleStatus } from "@/types/database";

interface ScriptHeaderProps {
  contentItem: {
    id: string;
    unique_content_id: string | null;
    title: string;
    is_in_idea_bank?: boolean;
    content_type?: {
      id?: string | null;
      name: string;
      prefix: string | null;
      brand?: {
        id: string;
        name: string;
        color?: string | null;
      } | null;
    } | null;
  };
  scriptStatus: ScriptLifecycleStatus;
  saveStatus: "saved" | "saving" | "unsaved";
  isTeleprompter: boolean;
  onToggleTeleprompter: () => void;
  onExportText: () => void;
  onManualSave?: () => Promise<void>;
  isResponsibilityAssigned: boolean;
  assignedWriterRole?: { name: string; email: string; role_title: string } | null;
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  isCreator: boolean;
  isAssignedWriter?: boolean;
  onDeclareDone: () => Promise<void>;
  onUndeclare: () => Promise<void>;
  onSubmitForReview: () => Promise<void>;
  onApprove: () => Promise<void>;
  onRequestRevisions: (note: string) => Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  layoutOrientation?: "vertical" | "horizontal";
  onToggleLayout?: () => void;
}

export function ScriptHeader({
  contentItem,
  scriptStatus,
  saveStatus,
  isTeleprompter,
  onToggleTeleprompter,
  onExportText,
  onManualSave,
  isResponsibilityAssigned,
  assignedWriterRole,
  canEdit,
  canSubmit,
  canApprove,
  isCreator,
  isAssignedWriter,
  onDeclareDone,
  onUndeclare,
  onSubmitForReview,
  onApprove,
  onRequestRevisions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  layoutOrientation = "vertical",
  onToggleLayout,
}: ScriptHeaderProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [copied, setCopied] = useState(false);

  const handleExportClick = () => {
    onExportText();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeclareDone = async () => {
    setIsSubmitting(true);
    try {
      await onDeclareDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndeclare = async () => {
    setIsSubmitting(true);
    try {
      await onUndeclare();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmitForReview();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRevisions = async () => {
    if (!revisionNote.trim()) return;
    setIsSubmitting(true);
    try {
      await onRequestRevisions(revisionNote.trim());
      setRevisionModalOpen(false);
      setRevisionNote("");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status visual token styles
  const getStatusBadge = () => {
    switch (scriptStatus) {
      case "done":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{isResponsibilityAssigned ? "Approved" : "Declared Done"}</span>
          </span>
        );
      case "submitted":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Submitted for Review</span>
          </span>
        );
      case "revision_requested":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            <span>Revision Requested</span>
          </span>
        );
      case "pending":
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-muted-foreground border border-border flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>Draft</span>
          </span>
        );
    }
  };

  return (
    <>
      <header className="w-full flex flex-col md:flex-row md:items-center justify-between gap-2 px-2.5 py-2 sm:px-4 sm:py-2.5 glass-nav select-none sticky top-0 z-30">
        {/* Row 1 on Mobile / Left on Desktop: Back + Title + Status + Save */}
        <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2.5 min-w-0 w-full md:w-auto">
          <div className="flex items-center gap-2 min-w-0 w-full md:w-auto">
            <Link
              href="/tracker"
              className="p-1.5 md:p-1 rounded-lg md:rounded-md hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all cursor-pointer shrink-0"
              style={{ borderRadius: "var(--radius)" }}
              title="Return to Main Board"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>

            <span className="font-bold text-sm tracking-tight truncate flex-1 md:flex-initial md:max-w-md min-w-0">
              {contentItem.title}
            </span>

            {/* Desktop Breadcrumb Badge: Brand Name / Content Series / Unique ID */}
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-muted/80 text-muted-foreground border border-border max-w-full truncate">
              {contentItem.content_type?.brand?.name && (
                <>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: contentItem.content_type.brand.color || "#6366f1" }}
                  />
                  <span className="text-foreground/85 font-semibold truncate">
                    {contentItem.content_type.brand.name}
                  </span>
                  <span className="opacity-50">/</span>
                </>
              )}
              <span className="truncate">
                {contentItem.content_type?.name || "Idea Bank (Unassigned Pipe)"}
              </span>
              {contentItem.unique_content_id && (
                <>
                  <span className="opacity-50">/</span>
                  <span className="font-bold text-primary shrink-0">
                    {contentItem.unique_content_id}
                  </span>
                </>
              )}
            </span>

            {contentItem.is_in_idea_bank && (
              <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Idea Bank
              </span>
            )}

            {/* Status Badge */}
            <div className="shrink-0">{getStatusBadge()}</div>

            {/* Auto-save Status Indicator */}
            <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground shrink-0">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="hidden sm:inline text-[10px]">Saving...</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="hidden sm:inline text-[10px]">Saved</span>
                </>
              )}
              {saveStatus === "unsaved" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="hidden sm:inline text-[10px] text-amber-400">Unsaved</span>
                </>
              )}
            </div>

            {isResponsibilityAssigned && assignedWriterRole && (
              <span className="hidden md:inline text-[10px] font-mono text-muted-foreground">
                • Writer: <strong className="text-foreground">{assignedWriterRole.name}</strong>
              </span>
            )}
          </div>

          {/* Mobile Compact Sub-line for ID / Brand / Series */}
          <div className="flex md:hidden items-center gap-1.5 text-[10px] font-mono text-muted-foreground pl-8 truncate">
            {contentItem.unique_content_id && (
              <span className="px-1.5 py-0.2 rounded bg-primary/15 text-primary font-bold shrink-0">
                {contentItem.unique_content_id}
              </span>
            )}
            {contentItem.content_type?.brand?.name && (
              <span className="inline-flex items-center gap-1 truncate">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: contentItem.content_type.brand.color || "#6366f1" }}
                />
                <span className="truncate">{contentItem.content_type.brand.name}</span>
                <span>•</span>
              </span>
            )}
            <span className="truncate">
              {contentItem.content_type?.name || "Idea Bank"}
            </span>
          </div>
        </div>

        {/* Row 2 on Mobile (single-row swipeable or compact) / Right on Desktop: Actions & Scenario Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible w-full md:w-auto">
          {/* Workspace Stacking Toggle: Vertical vs Horizontal Side-by-Side (PC / Desktop only) */}
          {onToggleLayout && (
            <button
              type="button"
              onClick={onToggleLayout}
              className={`hidden lg:flex p-1.5 rounded-md border transition-all cursor-pointer items-center justify-center ${
                layoutOrientation === "horizontal"
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
              }`}
              style={{ borderRadius: "var(--radius)" }}
              title={
                layoutOrientation === "vertical"
                  ? "Layout: Vertically Stacked (Click to switch to Side-by-Side)"
                  : "Layout: Horizontally Stacked (Click to switch to Vertical)"
              }
              aria-label="Toggle workspace layout between vertical and horizontal"
            >
              {layoutOrientation === "horizontal" ? (
                <Columns2 className="w-3.5 h-3.5" />
              ) : (
                <Rows2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Teleprompter Reading View Toggle */}
          <button
            type="button"
            onClick={onToggleTeleprompter}
            className={`min-h-[38px] md:min-h-0 px-3 py-1.5 rounded-xl md:rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
              isTeleprompter
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-muted/70 hover:bg-muted text-foreground border-border"
            }`}
            title="Open full-screen Teleprompter"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isTeleprompter ? "Studio Table" : "Teleprompter"}</span>
          </button>

          {/* Copy Script Text */}
          <button
            type="button"
            onClick={handleExportClick}
            className="min-h-[38px] md:min-h-0 px-2.5 sm:px-3 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-muted/70 hover:bg-muted text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            title="Copy script dialogue to clipboard"
            aria-label="Copy script dialogue"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy Script</span>
              </>
            )}
          </button>

          {/* Global Session Undo / Redo */}
          {canEdit && (onUndo || onRedo) && (
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-xl md:rounded-md border border-border shrink-0 min-h-[38px] md:min-h-0">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                className="p-2 md:p-1.5 rounded-lg md:rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                className="p-2 md:p-1.5 rounded-lg md:rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <RotateCcw className="w-3.5 h-3.5 -scale-x-100" />
              </button>
            </div>
          )}

          {/* Save as Draft (Available whenever canEdit) */}
          {canEdit && onManualSave && (
            <button
              type="button"
              disabled={saveStatus === "saving" || isSubmitting}
              onClick={onManualSave}
              className="min-h-[38px] md:min-h-0 px-2.5 sm:px-3 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-muted/70 hover:bg-muted text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              title="Save current script as draft"
              aria-label="Save as Draft"
            >
              {saveStatus === "saving" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Save as Draft</span>
            </button>
          )}

          {/* ============================================================== */}
          {/* SCENARIO A: Responsibility NOT Assigned (Creator Solo Workflow) */}
          {/* ============================================================== */}
          {!isResponsibilityAssigned && isCreator && (
            <div className="flex items-center gap-1.5 shrink-0">
              {scriptStatus !== "done" ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDeclareDone}
                  className="min-h-[38px] md:min-h-0 px-3.5 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  title="Declare this script completed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Declare Done</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleUndeclare}
                  className="min-h-[38px] md:min-h-0 px-3 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  title="Revert back to Pending / Draft"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="w-3.5 h-3.5" />
                  )}
                  <span>Undeclare</span>
                </button>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* SCENARIO B: Responsibility IS Assigned (Writer + Creator Workflow) */}
          {/* ============================================================== */}
          {isResponsibilityAssigned && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Writer Actions: Submit for Review / Resubmit */}
              {canSubmit && !isCreator && (
                <button
                  type="button"
                  disabled={isSubmitting || scriptStatus === "submitted"}
                  onClick={handleSubmit}
                  className={`min-h-[38px] md:min-h-0 px-3.5 py-1.5 rounded-xl md:rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs whitespace-nowrap ${
                    scriptStatus === "submitted"
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-default"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {scriptStatus === "submitted"
                      ? "Submitted"
                      : scriptStatus === "revision_requested"
                      ? "Resubmit Script"
                      : "Submit"}
                  </span>
                </button>
              )}

              {/* Creator Actions: Approve and Request Revision */}
              {isCreator && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Request Revision button: available if submitted or already approved */}
                  {(scriptStatus === "submitted" || scriptStatus === "done") && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setRevisionModalOpen(true)}
                      className="min-h-[38px] md:min-h-0 px-2.5 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                      title="Request changes from Script Writer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Revision</span>
                    </button>
                  )}

                  {/* Approve button: available when submitted */}
                  {scriptStatus === "submitted" && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleApprove}
                      className="min-h-[38px] md:min-h-0 px-3.5 py-1.5 rounded-xl md:rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                      title="Approve script"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp className="w-3.5 h-3.5" />
                      )}
                      <span>Approve</span>
                    </button>
                  )}

                  {/* If script is already done/approved in Scenario B */}
                  {scriptStatus === "done" && (
                    <span className="min-h-[38px] md:min-h-0 px-2.5 py-1 rounded-xl md:rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approved</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Revision Request Dialog Modal */}
      {revisionModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setRevisionModalOpen(false);
          }}
        >
          <div className="glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 sm:p-6 space-y-4">
            <div className="sm:hidden mobile-sheet-handle -mt-1" />
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <RotateCcw className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-sm">Request Script Revisions</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Provide feedback notes for the script writer. This will move the script status to{" "}
              <strong className="text-rose-400">Revision Requested</strong> and notify the writer.
            </p>

            <textarea
              autoFocus
              rows={4}
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="e.g. The retention hook in row 1 is too slow. Cut the intro and start straight with the proof..."
              className="w-full p-3 text-base sm:text-xs rounded-xl glass-input"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground cursor-pointer"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!revisionNote.trim() || isSubmitting}
                onClick={handleConfirmRevisions}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ borderRadius: "var(--radius)" }}
              >
                {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Send Revision Request</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
