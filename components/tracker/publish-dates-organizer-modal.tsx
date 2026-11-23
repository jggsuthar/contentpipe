"use client";

import React, { useState, useEffect } from "react";
import {
  CalendarDays,
  Sparkles,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Info,
  Calendar,
} from "lucide-react";

interface PublishDatesOrganizerModalProps {
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
    cadence_type?: string;
    upload_days?: string[];
    workflow_tasks?: {
      id: string;
      task_name: string;
      sequence_order: number;
    }[];
  } | null;
  onOrganized: () => void;
  isTriggeredFromSettings?: boolean;
}

export function PublishDatesOrganizerModal({
  isOpen,
  onClose,
  contentType,
  onOrganized,
  isTriggeredFromSettings = false,
}: PublishDatesOrganizerModalProps) {
  const [fromLevel, setFromLevel] = useState<string>("ideation");
  const [includeManual, setIncludeManual] = useState<boolean>(false);
  const [anchorMode, setAnchorMode] = useState<"earliest_selection" | "earliest_future_cadence" | "manual_date">(
    "earliest_selection"
  );
  const [manualAnchorDate, setManualAnchorDate] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [matchedCount, setMatchedCount] = useState<number>(0);
  const [skippedManualCount, setSkippedManualCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Filter intermediate tasks: strictly excluding Ideation and Publish
  const intermediateTasks = (contentType?.workflow_tasks || []).filter(
    (t) =>
      t.task_name.toLowerCase() !== "ideation" &&
      t.task_name.toLowerCase() !== "publish"
  );

  // Fetch live preview whenever selections change
  useEffect(() => {
    if (!isOpen || !contentType) return;

    let isCancelled = false;
    const fetchPreview = async () => {
      try {
        setLoadingPreview(true);
        setError(null);

        const res = await fetch("/api/tracker/organizer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_type_id: contentType.id,
            from_level: fromLevel,
            include_manual: includeManual,
            anchor_mode: anchorMode,
            manual_anchor_date: anchorMode === "manual_date" ? manualAnchorDate : undefined,
            dry_run: true,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to preview reorganization");
        }

        if (!isCancelled) {
          setPreviewItems(data.preview || []);
          setMatchedCount(data.matched_count ?? (data.preview || []).length);
          setSkippedManualCount(data.skipped_manual_count ?? 0);
        }
      } catch (err: any) {
        if (!isCancelled) setError(err.message || "Failed to load preview");
      } finally {
        if (!isCancelled) setLoadingPreview(false);
      }
    };

    fetchPreview();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, contentType, fromLevel, includeManual, anchorMode, manualAnchorDate]);

  if (!isOpen || !contentType) return null;

  const handleApply = async () => {
    try {
      setApplying(true);
      setError(null);

      const res = await fetch("/api/tracker/organizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type_id: contentType.id,
          from_level: fromLevel,
          include_manual: includeManual,
          anchor_mode: anchorMode,
          manual_anchor_date: anchorMode === "manual_date" ? manualAnchorDate : undefined,
          dry_run: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reorganize publish dates");
      }

      onOrganized();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to reorganize dates");
    } finally {
      setApplying(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !applying) onClose();
      }}
    >
      <div className="w-full sm:max-w-xl glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="sm:hidden mobile-sheet-handle mt-2.5 mb-0.5" />
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40 gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-sm text-foreground">Publish Dates Organizer</span>
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

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {isTriggeredFromSettings && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-foreground flex items-start gap-2.5">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs">Cadence timetable has been updated!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Would you like to reorganize upcoming placeholders to align with the new cadence upload days?
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-destructive/15 text-destructive border border-destructive/30 text-xs">
              {error}
            </div>
          )}

          {/* Question 1: What level onwards placeholders to be selected */}
          <div className="space-y-1.5">
            <label className="font-bold text-xs text-foreground block">
              1. What level onwards should placeholders be reorganized?
            </label>
            <p className="text-[11px] text-muted-foreground">
              Select which workflow stage to start from. Any item that has not reached that stage will be aligned to the current cadence.
            </p>
            <select
              value={fromLevel}
              onChange={(e) => setFromLevel(e.target.value)}
              className="w-full h-9 px-3 rounded-xl glass-input text-foreground font-mono text-xs cursor-pointer"
            >
              <option value="ideation">
                Ideation is not done (Open untitled placeholders only)
              </option>
              {intermediateTasks.map((t) => (
                <option key={t.id} value={t.task_name}>
                  {t.task_name} is not done
                </option>
              ))}
              <option value="all">
                All active placeholder which are not published yet
              </option>
            </select>
          </div>

          {/* Question 2: Manually added placeholders to be selected */}
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <label className="font-bold text-xs text-foreground block">
              2. Should manually added custom placeholders be reorganized?
            </label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIncludeManual(false)}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  !includeManual
                    ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${!includeManual ? "border-primary" : "border-muted-foreground"}`}>
                    {!includeManual && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </span>
                  <span>No (Recommended)</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 ml-4.5">
                  Preserve custom scheduled dates.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIncludeManual(true)}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  includeManual
                    ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${includeManual ? "border-primary" : "border-muted-foreground"}`}>
                    {includeManual && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </span>
                  <span>Yes, reorganize</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 ml-4.5">
                  Re-align custom placeholders into cadence.
                </p>
              </button>
            </div>
          </div>

          {/* Question 3: Anchor Point Selection */}
          <div className="space-y-1.5 pt-1 border-t border-border/60">
            <label className="font-bold text-xs text-foreground block">
              3. What date onwards should reorganized placeholders start from? (Anchor Point)
            </label>
            <p className="text-[11px] text-muted-foreground">
              Define the starting date for cadence slot snapping. Occupied days will be automatically skipped to prevent double booking.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setAnchorMode("earliest_selection")}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  anchorMode === "earliest_selection"
                    ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                      anchorMode === "earliest_selection" ? "border-primary" : "border-muted-foreground"
                    }`}
                  >
                    {anchorMode === "earliest_selection" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-[11px]">Earliest in selection</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 ml-4.5">
                  Preserve general schedule range from earliest selected item.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAnchorMode("earliest_future_cadence")}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  anchorMode === "earliest_future_cadence"
                    ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                      anchorMode === "earliest_future_cadence" ? "border-primary" : "border-muted-foreground"
                    }`}
                  >
                    {anchorMode === "earliest_future_cadence" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-[11px]">Next cadence date</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 ml-4.5">
                  Snap forward starting on or after today.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAnchorMode("manual_date")}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  anchorMode === "manual_date"
                    ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                      anchorMode === "manual_date" ? "border-primary" : "border-muted-foreground"
                    }`}
                  >
                    {anchorMode === "manual_date" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-[11px]">Choose date manually</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 ml-4.5">
                  Pick a custom starting anchor date.
                </p>
              </button>
            </div>

            {anchorMode === "manual_date" && (
              <div className="pt-2 animate-in fade-in duration-150">
                <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                  Custom Anchor Date:
                </label>
                <input
                  type="date"
                  value={manualAnchorDate}
                  onChange={(e) => setManualAnchorDate(e.target.value)}
                  className="w-full h-10 sm:h-8 px-2.5 rounded-xl bg-background border border-border text-foreground font-mono text-base sm:text-xs focus:outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Strict Protection Rule & Occupied Slot Skipping */}
          <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/80 text-[11px] text-muted-foreground font-mono">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Safety Rule: Published contents and archived items will NEVER be modified.</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 pl-5.5">
              <span>Occupied Slot Skipping: Dates already occupied by unselected or manual placeholders are skipped automatically to avoid collisions.</span>
            </div>
          </div>

          {/* Live Preview List */}
          <div className="space-y-2 pt-1 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span>Reorganization Preview:</span>
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {loadingPreview ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span>Calculating schedule...</span>
                  </span>
                ) : (
                  <span>
                    {matchedCount} matched • {previewItems.length} date change{previewItems.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>
            </div>

            {loadingPreview ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-muted-foreground border border-dashed border-border rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-[11px] font-mono">Simulating cadence timetable...</span>
              </div>
            ) : previewItems.length === 0 ? (
              <div className="py-6 px-4 text-center text-muted-foreground border border-dashed border-border rounded-lg text-xs font-mono space-y-1">
                {matchedCount > 0 ? (
                  <p>
                    {matchedCount} item{matchedCount === 1 ? "" : "s"} matched your filter, and all {matchedCount === 1 ? "is" : "are"} already aligned on your current cadence dates. Choose &ldquo;Next cadence date&rdquo; or &ldquo;Choose date manually&rdquo; to shift them.
                  </p>
                ) : skippedManualCount > 0 && !includeManual ? (
                  <p>
                    {skippedManualCount} item{skippedManualCount === 1 ? "" : "s"} matched the stage filter but {skippedManualCount === 1 ? "is" : "are"} marked as Manual. Select &ldquo;Yes, reorganize&rdquo; above to include them.
                  </p>
                ) : (
                  <p>No active items match the selected filter.</p>
                )}
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto font-mono text-[11px]">
                <table className="w-full text-left divide-y divide-border">
                  <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-3">Content Slot</th>
                      <th className="py-1.5 px-3">Current Date</th>
                      <th className="py-1.5 px-3 text-center"></th>
                      <th className="py-1.5 px-3 text-emerald-500">New Cadence Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-card">
                    {previewItems.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="py-1.5 px-3">
                          <span className="font-semibold text-foreground">
                            {item.unique_content_id || item.title || "[Placeholder]"}
                          </span>
                          {item.is_manual && (
                            <span className="ml-1 text-[9px] px-1 rounded bg-sky-500/15 text-sky-400 font-sans">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-muted-foreground line-through opacity-75">
                          {formatDateDisplay(item.old_publish_date)}
                        </td>
                        <td className="py-1.5 px-1 text-center text-muted-foreground">
                          <ArrowRight className="w-3 h-3 inline text-primary" />
                        </td>
                        <td className="py-1.5 px-3 text-emerald-400 font-bold">
                          {formatDateDisplay(item.new_publish_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="px-3.5 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || loadingPreview || previewItems.length === 0}
            className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
          >
            {applying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Reorganizing Dates...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Reorganize {previewItems.length} Dates</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
