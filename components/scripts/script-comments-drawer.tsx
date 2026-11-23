"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  X,
  Check,
  AlertTriangle,
  Tag,
  Plus,
  Filter,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { ScriptComment } from "@/types/database";

interface ScriptCommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  comments: ScriptComment[];
  activeRowSrNo: number | null; // null for general view
  feedbackCategories: string[];
  userEmail: string;
  isCreator: boolean;
  onAddComment: (data: {
    sr_no: number | null;
    text: string;
    category?: string;
    severity?: "minor" | "critical";
  }) => Promise<void>;
  onToggleResolve: (commentId: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export function ScriptCommentsDrawer({
  isOpen,
  onClose,
  comments,
  activeRowSrNo,
  feedbackCategories,
  userEmail,
  isCreator,
  onAddComment,
  onToggleResolve,
  onDeleteComment,
}: ScriptCommentsDrawerProps) {
  const [filterType, setFilterType] = useState<"all" | "line" | "general" | "unresolved">("all");
  const [newCommentText, setNewCommentText] = useState("");
  const [targetSrNo, setTargetSrNo] = useState<number | null>(activeRowSrNo);
  const [category, setCategory] = useState<string>("General");
  const [severity, setSeverity] = useState<"minor" | "critical">("minor");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronize targetSrNo when activeRowSrNo changes
  React.useEffect(() => {
    setTargetSrNo(activeRowSrNo);
  }, [activeRowSrNo]);

  if (!isOpen) return null;

  // Filter comments
  const filteredComments = comments.filter((c) => {
    if (filterType === "unresolved") return !c.is_resolved;
    if (filterType === "general") return c.sr_no === null;
    if (filterType === "line") {
      if (activeRowSrNo !== null) return c.sr_no === activeRowSrNo;
      return c.sr_no !== null;
    }
    // all
    if (activeRowSrNo !== null) return c.sr_no === activeRowSrNo;
    return true;
  });

  const handleCreate = async () => {
    if (!newCommentText.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddComment({
        sr_no: targetSrNo,
        text: newCommentText.trim(),
        category,
        severity,
      });
      setNewCommentText("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end md:items-stretch justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full md:w-96 md:max-w-md glass-floating rounded-t-3xl rounded-b-none md:rounded-l-2xl md:rounded-r-none max-h-[85dvh] md:max-h-none md:h-full pb-[env(safe-area-inset-bottom)] md:pb-0 flex flex-col justify-between animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
      >
        <div className="md:hidden mobile-sheet-handle mt-2.5 mb-0.5" />
        {/* Drawer Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-bold text-xs">
                {activeRowSrNo !== null
                  ? `Review Feedback: Row #${activeRowSrNo}`
                  : "Script Review & Feedback Hub"}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                {comments.filter((c) => !c.is_resolved).length} open feedback items
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterType === "all"
                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({comments.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("unresolved")}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterType === "unresolved"
                ? "bg-destructive text-destructive-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Unresolved
          </button>
          <button
            type="button"
            onClick={() => setFilterType("general")}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              filterType === "general"
                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            General
          </button>
        </div>

        {/* Comments Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredComments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs font-mono">
              No feedback items in this thread.
            </div>
          ) : (
            filteredComments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3 rounded-md border transition-all text-xs space-y-2 ${
                  comment.is_resolved
                    ? "bg-muted/30 border-border/60 opacity-65"
                    : comment.severity === "critical"
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-background border-border"
                }`}
                style={{ borderRadius: "var(--radius)" }}
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <div className="flex items-center gap-1.5">
                    {comment.sr_no !== null ? (
                      <span className="px-1.5 py-0.2 rounded bg-muted border border-border font-bold">
                        Line #{comment.sr_no}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded bg-muted border border-border">
                        General
                      </span>
                    )}

                    {comment.category && (
                      <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                        {comment.category}
                      </span>
                    )}

                    {comment.severity === "critical" && (
                      <span className="px-1.5 py-0.2 rounded bg-destructive/20 text-destructive font-bold">
                        Critical
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Resolve button */}
                    <button
                      type="button"
                      onClick={() => onToggleResolve(comment.id)}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        comment.is_resolved
                          ? "bg-status-done text-status-done-foreground"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      title={comment.is_resolved ? "Mark as unresolved" : "Mark as resolved"}
                    >
                      <Check className="w-3 h-3" />
                    </button>

                    {/* Delete button (Author or Creator) */}
                    {(isCreator || comment.author_email === userEmail) && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment.id)}
                        className="p-1 hover:bg-destructive/20 hover:text-destructive rounded text-muted-foreground cursor-pointer"
                        title="Delete comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Comment Body */}
                <p className={`text-xs ${comment.is_resolved ? "line-through text-muted-foreground" : "font-medium"}`}>
                  {comment.body}
                </p>

                {/* Author Footer */}
                <div className="text-[9px] text-muted-foreground font-mono flex items-center justify-between">
                  <span>{comment.author_email}</span>
                  <span>{new Date(comment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Comment Box */}
        <div className="p-4 border-t border-border bg-muted/20 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Target row selector */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted-foreground">Target:</span>
              <button
                type="button"
                onClick={() => setTargetSrNo(activeRowSrNo)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  targetSrNo !== null ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                }`}
              >
                {activeRowSrNo !== null ? `Row #${activeRowSrNo}` : "Line"}
              </button>
              <button
                type="button"
                onClick={() => setTargetSrNo(null)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  targetSrNo === null ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                }`}
              >
                General
              </button>
            </div>

            {/* Severity Toggle */}
            <div className="flex items-center gap-1 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setSeverity(severity === "minor" ? "critical" : "minor")}
                className={`px-2 py-0.5 rounded border cursor-pointer font-bold ${
                  severity === "critical"
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {severity === "critical" ? "Critical" : "Minor"}
              </button>
            </div>
          </div>

          {/* Feedback Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 md:h-8 px-2.5 text-base sm:text-[11px] rounded-xl glass-input cursor-pointer font-mono"
            >
              <option value="General">General Feedback</option>
              {feedbackCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Comment Input */}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Leave line feedback (e.g. Trim sentence, Hook too weak)..."
              className="flex-1 p-2.5 text-base sm:text-xs rounded-xl glass-input resize-none"
            />

            <button
              type="button"
              disabled={!newCommentText.trim() || isSubmitting}
              onClick={handleCreate}
              className="px-3 py-2 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer h-9 flex items-center justify-center"
              style={{ borderRadius: "var(--radius)" }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
