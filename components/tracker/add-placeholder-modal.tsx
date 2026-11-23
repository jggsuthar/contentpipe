"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  X,
  Plus,
  Loader2,
  Clock,
  Sparkles,
  Info,
  AlertTriangle,
} from "lucide-react";
import { MatrixRowItem } from "./matrix-table";

interface AddPlaceholderModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: {
    id: string;
    name: string;
    brand?: {
      id: string;
      name: string;
      color?: string | null;
    } | null;
    workflow_tasks?: {
      id: string;
      task_name: string;
      n_days_offset: number;
      color?: string | null;
    }[];
  } | null;
  initialDate?: string;
  onPlaceholderAdded: () => void;
  existingRows?: MatrixRowItem[];
}

export function AddPlaceholderModal({
  isOpen,
  onClose,
  contentType,
  initialDate,
  onPlaceholderAdded,
  existingRows = [],
}: AddPlaceholderModalProps) {
  const [publishDate, setPublishDate] = useState("");
  const [title, setTitle] = useState("");
  const [collisionStrategy, setCollisionStrategy] = useState<
    "displace_existing" | "put_new_next" | "keep_both"
  >("displace_existing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default publish date to tomorrow or initialDate
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTitle("");
      setCollisionStrategy("displace_existing");
      if (initialDate) {
        setPublishDate(initialDate.split("T")[0]);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPublishDate(tomorrow.toISOString().split("T")[0]);
      }
    }
  }, [isOpen, initialDate]);

  if (!isOpen || !contentType) return null;

  // Collision detection
  const collidingRow = existingRows.find(
    (r) => r.publish_date && r.publish_date.split("T")[0] === publishDate
  );

  // Calculate live preview of task target dates
  const workflowTasks = contentType.workflow_tasks || [];
  const selectedDateObj = publishDate ? new Date(publishDate) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishDate) {
      setError("Please select a publish date.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/tracker/placeholder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type_id: contentType.id,
          publish_date: publishDate,
          title: title.trim() || undefined,
          collision_strategy: collidingRow ? collisionStrategy : "keep_both",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add placeholder");
      }

      onPlaceholderAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add placeholder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full sm:max-w-md glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="sm:hidden mobile-sheet-handle mt-2.5 mb-0.5" />
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-sm text-foreground">Add Custom Placeholder</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-muted/80 border border-border text-muted-foreground max-w-full truncate">
              {contentType.brand?.name && (
                <>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: contentType.brand.color || "#6366f1" }}
                  />
                  <span className="text-foreground/80 truncate">{contentType.brand.name}</span>
                  <span>•</span>
                </>
              )}
              <span className="truncate">{contentType.name}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded bg-destructive/15 text-destructive border border-destructive/30 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="font-semibold block mb-1 text-foreground">
              Custom Publish Date <span className="text-destructive">*</span>
            </label>
            <input
              type="date"
              required
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="w-full h-10 sm:h-9 px-3 rounded-xl glass-input text-foreground font-mono text-base sm:text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              This slot will be marked as a manually added custom publish date (⚙️).
            </p>
          </div>

          {/* Collision Handling Section */}
          {collidingRow && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-2.5">
              <div className="flex items-start gap-2 text-amber-400 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span>Collision: A placeholder already exists on this date:</span>
                  <div className="text-[11px] font-mono font-bold text-foreground mt-0.5">
                    {collidingRow.unique_content_id ? `${collidingRow.unique_content_id} • ` : ""}
                    {collidingRow.title || "[Open Untitled Placeholder]"}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-amber-500/20">
                <span className="text-[11px] font-bold text-foreground block">
                  Select collision action:
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <label className="flex items-start gap-2 p-2 rounded bg-card/70 border border-border cursor-pointer hover:border-primary transition-colors">
                    <input
                      type="radio"
                      name="collision_strategy"
                      value="displace_existing"
                      checked={collisionStrategy === "displace_existing"}
                      onChange={() => setCollisionStrategy("displace_existing")}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="font-semibold text-foreground">
                        1. Displace existing to the next possible placeholder
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        The new video takes this date; existing slot moves to next available cadence slot.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 p-2 rounded bg-card/70 border border-border cursor-pointer hover:border-primary transition-colors">
                    <input
                      type="radio"
                      name="collision_strategy"
                      value="put_new_next"
                      checked={collisionStrategy === "put_new_next"}
                      onChange={() => setCollisionStrategy("put_new_next")}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="font-semibold text-foreground">
                        2. Put the new video to the next possible placeholder
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Existing item stays here; new video will be placed on next available cadence slot.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 p-2 rounded bg-card/70 border border-border cursor-pointer hover:border-primary transition-colors">
                    <input
                      type="radio"
                      name="collision_strategy"
                      value="keep_both"
                      checked={collisionStrategy === "keep_both"}
                      onChange={() => setCollisionStrategy("keep_both")}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="font-semibold text-foreground">
                        3. Keep both contents in same date
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Both items will remain scheduled on this exact same publish date.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="font-semibold block mb-1 text-foreground">
              Idea / Video Title <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to create an open placeholder slot..."
              className="w-full h-10 sm:h-9 px-3 rounded-xl bg-background border border-border text-foreground text-base sm:text-xs focus:outline-none focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              If titled, an ID will be generated immediately and Ideation will be marked Done.
            </p>
          </div>

          {/* Target Dates Calculation Preview */}
          {selectedDateObj && !isNaN(selectedDateObj.getTime()) && workflowTasks.length > 0 && (
            <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Calculated Workflow Target Dates</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                {workflowTasks.map((task) => {
                  const targetD = new Date(selectedDateObj);
                  targetD.setDate(targetD.getDate() - (task.n_days_offset || 0));
                  const dateStr = targetD.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    weekday: "short",
                  });

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-1.5 rounded bg-card/60 border border-border/60"
                    >
                      <span className="font-medium truncate">{task.task_name}:</span>
                      <span className="text-muted-foreground text-[10px] ml-1 shrink-0">{dateStr}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Placeholder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
