"use client";

import React, { useState, useEffect } from "react";
import {
  Trash2,
  X,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Calendar,
  FolderX,
  CheckCircle2,
  ArrowRight,
  FileX,
} from "lucide-react";
import { MatrixRowItem } from "./matrix-table";

interface DeletePlaceholderModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: MatrixRowItem | null;
  contentTypeId: string;
  contentSeriesName?: string;
  brandName?: string;
  brandColor?: string | null;
  onDeleted: () => void;
}

export function DeletePlaceholderModal({
  isOpen,
  onClose,
  row,
  contentTypeId,
  contentSeriesName,
  brandName,
  brandColor,
  onDeleted,
}: DeletePlaceholderModalProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [deleteInputText, setDeleteInputText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setDeleteInputText("");
      setError(null);
      setLoading(false);
    }
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  // 1. Analyze what is in this placeholder
  const hasContent = Boolean(
    row.title ||
    row.unique_content_id ||
    row.has_script ||
    (row.submission_count && row.submission_count > 0) ||
    row.task_instances?.some(
      (ti) =>
        ti.status === "done" ||
        ti.status === "under_review" ||
        ti.status === "revision_needed"
    )
  );

  const hasCheckmark = Boolean(!row.is_manual_publish_date && row.cadence_match?.matches);

  // 2. Determine confirmation tiers:
  // - Base: 2 confirmations (double confirmation)
  // - With ✅ OR with content: 3 confirmations (triple confirmation)
  // - With ✅ AND with content: 4 confirmations (quadruple confirmation)
  let totalSteps = 2;
  if (hasCheckmark && hasContent) {
    totalSteps = 4;
  } else if (hasCheckmark || hasContent) {
    totalSteps = 3;
  }

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      weekday: "short",
      year: "numeric",
    });
  };

  const handleExecuteDelete = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = `/api/tracker/placeholder?id=${encodeURIComponent(row.id)}&content_type_id=${encodeURIComponent(
        contentTypeId
      )}&publish_date=${encodeURIComponent(row.publish_date)}`;

      const res = await fetch(url, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete placeholder");
      }

      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete placeholder");
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleExecuteDelete();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg glass-floating mobile-bottom-sheet border-destructive/40 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="sm:hidden mobile-sheet-handle mt-2.5 mb-0.5" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-destructive/10 gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Trash2 className="w-4 h-4 text-destructive shrink-0" />
            <span className="font-bold text-sm text-foreground">Delete Placeholder</span>
            {(brandName || contentSeriesName) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-background/60 border border-border text-muted-foreground max-w-full truncate">
                {brandName && (
                  <>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: brandColor || "#6366f1" }}
                    />
                    <span className="text-foreground/80 truncate">{brandName}</span>
                    {contentSeriesName && <span>•</span>}
                  </>
                )}
                {contentSeriesName && <span className="truncate">{contentSeriesName}</span>}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-semibold">
              Step {currentStep} of {totalSteps}
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

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-muted/20 border-b border-border">
          {[1, 2, 3, 4].slice(0, totalSteps).map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all ${
                step < currentStep
                  ? "bg-emerald-500"
                  : step === currentStep
                  ? "bg-destructive"
                  : "bg-muted/60"
              }`}
            />
          ))}
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded bg-destructive/15 text-destructive border border-destructive/30 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Item Summary Card */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-foreground">
                {row.unique_content_id ? `${row.unique_content_id} • ` : ""}
                {row.title || "[Open Placeholder Slot]"}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatDateDisplay(row.publish_date)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
              {hasCheckmark && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Cadence Scheduled Release Date (✅)</span>
                </span>
              )}
              {hasContent && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <FolderX className="w-3 h-3" />
                  <span>Contains Production Content & Tasks</span>
                </span>
              )}
              {!hasCheckmark && !hasContent && (
                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  Empty Off-Cadence Placeholder
                </span>
              )}
            </div>
          </div>

          {/* STEP 1: Initial Intent Warning */}
          {currentStep === 1 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-foreground">Confirm Deletion Request</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Are you sure you want to delete this placeholder?
                    {totalSteps === 4
                      ? " Because this item has active content AND is an official cadence date (✅), 4 sequential confirmations are required."
                      : totalSteps === 3
                      ? " Because this item contains content or is an official cadence date (✅), 3 sequential confirmations are required."
                      : " Double confirmation is required before this slot can be deleted."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Cadence or Content Impact Warning */}
          {currentStep === 2 && (
            <div className="space-y-3">
              {totalSteps === 2 ? (
                /* Final confirmation for 2-step */
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
                  <p className="font-bold text-destructive flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Final Confirmation (2 of 2)</span>
                  </p>
                  <p className="text-muted-foreground">
                    This empty placeholder slot will be completely removed from your active matrix schedule.
                  </p>
                </div>
              ) : hasCheckmark ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <p className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>Cadence Timetable Impact Notice (Step 2 of {totalSteps})</span>
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    This placeholder corresponds to an official cadence release slot (✅). Deleting it will create an intentional gap in your release schedule. The app will record this date as skipped.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
                  <p className="font-bold text-destructive flex items-center gap-1.5">
                    <FolderX className="w-4 h-4" />
                    <span>Production Data Destruction Notice (Step 2 of {totalSteps})</span>
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    This placeholder contains title data, task status records, or Google Drive folders. Deleting it will permanently purge all cloud folders and release the Content ID.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Deep Data Purge Warning or Type Confirm */}
          {currentStep === 3 && (
            <div className="space-y-3">
              {totalSteps === 3 ? (
                /* Final confirmation for 3-step */
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                  <p className="font-bold text-destructive flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Final Step: Confirm Permanent Eradication (3 of 3)</span>
                  </p>
                  <p className="text-muted-foreground">
                    Please confirm that you want to permanently erase this placeholder. All associated records and folder linkages will be destroyed.
                  </p>
                </div>
              ) : (
                /* Step 3 of 4: Content & Cloud Assets Purge Warning */
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
                  <p className="font-bold text-destructive flex items-center gap-1.5">
                    <FolderX className="w-4 h-4" />
                    <span>Cloud Drive & Milestone Eradication (Step 3 of 4)</span>
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    All associated Google Drive assets, raw footage, video deliverables, script documents, and task history will be permanently deleted and cannot be restored.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Quadruple Confirmation Type 'DELETE' */}
          {currentStep === 4 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-destructive/15 border-2 border-destructive text-destructive space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Final Quadruple Confirmation (Step 4 of 4)</span>
                </p>
                <p className="text-xs text-foreground leading-relaxed">
                  To permanently delete this cadence-scheduled production item, type <span className="font-mono font-bold text-destructive bg-destructive/20 px-1.5 py-0.5 rounded">DELETE</span> in the box below:
                </p>
                <input
                  type="text"
                  autoFocus
                  value={deleteInputText}
                  onChange={(e) => setDeleteInputText(e.target.value)}
                  placeholder="Type DELETE to confirm..."
                  className="w-full h-10 sm:h-9 px-3 rounded-xl bg-background border border-destructive text-foreground font-mono text-base sm:text-xs focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-4 py-1.5 rounded bg-destructive text-destructive-foreground text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/90 transition-all cursor-pointer shadow-xs"
            >
              <span>Continue to Step {currentStep + 1}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExecuteDelete}
              disabled={loading || (totalSteps === 4 && deleteInputText !== "DELETE")}
              className="px-4 py-1.5 rounded bg-destructive text-destructive-foreground text-xs font-bold flex items-center gap-1.5 hover:bg-destructive/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Permanently Delete Placeholder</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
