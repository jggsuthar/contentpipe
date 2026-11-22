"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  X,
  Settings2,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { MatrixRowItem } from "./matrix-table";

interface ChangePublishDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: MatrixRowItem | null;
  contentTypeId: string;
  contentSeriesName?: string;
  brandName?: string;
  brandColor?: string | null;
  onUpdated: () => void;
}

export function ChangePublishDateModal({
  isOpen,
  onClose,
  row,
  contentTypeId,
  contentSeriesName,
  brandName,
  brandColor,
  onUpdated,
}: ChangePublishDateModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [newPublishDate, setNewPublishDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && row) {
      setCurrentStep(1);
      setError(null);
      setLoading(false);
      const rowDate = new Date(row.publish_date).toISOString().split("T")[0];
      setNewPublishDate(rowDate);
    }
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const currentPublishDateStr = new Date(row.publish_date).toISOString().split("T")[0];
  const isSameDate = newPublishDate === currentPublishDateStr;

  const currentIsManual = Boolean(row.is_manual_publish_date);
  const isCadenceMatch = row.cadence_match?.matches ?? true;

  // Calculate day difference for step 2
  const getDayDiff = () => {
    if (!newPublishDate || !currentPublishDateStr) return 0;
    const oldMs = new Date(currentPublishDateStr).getTime();
    const newMs = new Date(newPublishDate).getTime();
    return Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));
  };

  const dayDiff = getDayDiff();

  const handleExecuteUpdate = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/tracker/placeholder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          content_type_id: contentTypeId,
          new_publish_date: newPublishDate,
          current_publish_date: currentPublishDateStr,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update publish date");
      }

      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update publish date");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg glass-floating rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30 gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-bold text-sm text-foreground">Change Publish Date</span>
            {(brandName || contentSeriesName) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-muted/80 border border-border text-muted-foreground max-w-full truncate">
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-semibold border border-sky-500/30">
              Step {currentStep} of 2
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

        {/* Step Progress Bar */}
        <div className="grid grid-cols-2 gap-1 p-2 bg-muted/20 border-b border-border">
          <div className="h-1.5 rounded-full bg-sky-500 transition-all" />
          <div
            className={`h-1.5 rounded-full transition-all ${
              currentStep === 2 ? "bg-sky-500" : "bg-muted/60"
            }`}
          />
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded bg-destructive/15 text-destructive border border-destructive/30 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Item Identification Card */}
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-foreground">
                {row.unique_content_id ? `${row.unique_content_id} • ` : ""}
                {row.title || "[Open Placeholder Slot]"}
              </span>
              <div className="flex items-center gap-1 font-mono text-[10px]">
                {currentIsManual ? (
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                    <Settings2 className="w-2.5 h-2.5" />
                    <span>Manual Slot</span>
                  </span>
                ) : isCadenceMatch ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Cadence (✅)</span>
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Cadence (⚠️)</span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Current Publish Date: <span className="text-foreground font-semibold">{formatDateDisplay(row.publish_date)}</span>
            </div>
          </div>

          {/* STEP 1: Date Selection & Impact Warning */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-bold text-xs text-foreground block">
                  Select New Publish Date
                </label>
                <input
                  type="date"
                  value={newPublishDate}
                  onChange={(e) => setNewPublishDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl glass-input text-foreground font-mono text-xs"
                />
              </div>

              {/* Automatic rule notices */}
              <div className="space-y-2 p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-foreground">
                <p className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Automatic Recalculation & Status Update</span>
                </p>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground list-disc list-inside">
                  <li>
                    <strong className="text-foreground">Manual Status Switch:</strong> The placeholder will automatically switch to <span className="text-sky-400 font-semibold">Manual (⚙️)</span>, replacing any cadence checkmark.
                  </li>
                  <li>
                    <strong className="text-foreground">Upstream Target Dates:</strong> All workflow task deadlines ($P - \sum n$) will be immediately recalculated backward from this new publish date.
                  </li>
                  <li>
                    <strong className="text-foreground">Schedule Gap Protection:</strong> If moving an autogenerated cadence date, the app ensures no duplicate ghost slot is left on the previous date.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: Final Confirmation Preview */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-3">
                <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Confirm Schedule Modification</span>
                </p>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-xs p-2.5 rounded bg-background border border-border">
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground block">FROM</span>
                    <span className="font-semibold text-muted-foreground line-through">
                      {formatDateDisplay(currentPublishDateStr)}
                    </span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-sky-400 mx-auto" />

                  <div className="text-center">
                    <span className="text-[10px] text-sky-400 font-bold block">TO (NEW)</span>
                    <span className="font-bold text-foreground">
                      {formatDateDisplay(newPublishDate)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-1">
                  <span>Schedule Shift:</span>
                  <span className={`font-bold ${dayDiff > 0 ? "text-emerald-400" : dayDiff < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {dayDiff > 0 ? `+${dayDiff} days forward` : dayDiff < 0 ? `${dayDiff} days earlier` : "No change"}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Please confirm you want to shift this publish date. Team buffer dates and individual task deadlines will update immediately upon confirmation.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-muted/30">
          {currentStep === 1 ? (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              disabled={loading}
              className="px-3.5 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
            >
              Back
            </button>
          )}

          {currentStep === 1 ? (
            <button
              type="button"
              onClick={() => {
                if (!newPublishDate || isSameDate) return;
                setCurrentStep(2);
              }}
              disabled={!newPublishDate || isSameDate}
              className="px-4 py-1.5 rounded bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-sky-400 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              <span>Continue to Step 2</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExecuteUpdate}
              disabled={loading}
              className="px-4 py-1.5 rounded bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-sky-400 transition-all cursor-pointer disabled:opacity-40 shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Date Change</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
