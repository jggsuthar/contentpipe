"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  X,
  Loader2,
  Check,
  Calendar,
  ListChecks,
  AlertTriangle,
  ArrowRight,
  Trash2,
  FileText,
  FolderOpen,
  Layers,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import type {
  IdeaBankItem,
  BrandOption,
  ContentSeriesOption,
} from "@/components/ideas/idea-bank-modal";

interface TrackerSlotRow {
  id: string;
  is_placeholder: boolean;
  is_manual_publish_date?: boolean;
  unique_content_id: string | null;
  title: string;
  publish_date: string;
  has_script?: boolean;
  has_content?: boolean;
  is_published?: boolean;
  submission_count?: number;
  task_instances?: { id: string; task_name: string; status: string }[];
}

interface PreviewShift {
  id: string;
  unique_content_id: string | null;
  title: string;
  fromDate: string;
  toDate: string;
}

interface AssignIdeaModalProps {
  idea: IdeaBankItem | null;
  brands: BrandOption[];
  contentTypes: ContentSeriesOption[];
  onClose: () => void;
  onAssigned: (ideaId: string) => void;
}

type AssignmentMode = "placeholder" | "manual_date";
type CollisionStrategy = "push_existing" | "keep_both" | "overwrite_existing";

function formatShortDate(isoOrYmd: string): string {
  const key = isoOrYmd.split("T")[0];
  const d = new Date(`${key}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoOrYmd;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthDay(isoOrYmd: string): string {
  const key = isoOrYmd.split("T")[0];
  const d = new Date(`${key}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoOrYmd;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AssignIdeaModal({
  idea,
  brands,
  contentTypes,
  onClose,
  onAssigned,
}: AssignIdeaModalProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>("");

  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("placeholder");
  const [slots, setSlots] = useState<TrackerSlotRow[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [manualDate, setManualDate] = useState<string>("");

  const [collisionStrategy, setCollisionStrategy] =
    useState<CollisionStrategy>("push_existing");
  const [previewShifts, setPreviewShifts] = useState<PreviewShift[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Overwrite double-confirmation state
  const [overwriteStep, setOverwriteStep] = useState<1 | 2>(1);
  const [overwriteTokenInput, setOverwriteTokenInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize selectors when idea opens
  useEffect(() => {
    if (!idea) return;
    setError(null);
    setAssignmentMode("placeholder");
    setCollisionStrategy("push_existing");
    setPreviewShifts([]);
    setOverwriteStep(1);
    setOverwriteTokenInput("");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setManualDate(tomorrow.toISOString().split("T")[0]);

    if (idea.content_type_id) {
      const matchedSeries = contentTypes.find(
        (ct) => ct.id === idea.content_type_id
      );
      setSelectedBrandId(
        idea.brand_id || matchedSeries?.brand_id || ""
      );
      setSelectedContentTypeId(idea.content_type_id);
    } else {
      setSelectedBrandId(idea.brand_id || "");
      setSelectedContentTypeId("");
      setSlots([]);
      setSelectedSlotId("");
    }
  }, [idea, contentTypes]);

  const filteredContentTypes = useMemo(() => {
    if (!selectedBrandId) return contentTypes;
    return contentTypes.filter((ct) => ct.brand_id === selectedBrandId);
  }, [contentTypes, selectedBrandId]);

  // Load slots whenever selectedContentTypeId changes
  useEffect(() => {
    if (!idea || !selectedContentTypeId) {
      setSlots([]);
      setSelectedSlotId("");
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingSlots(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/tracker?contentTypeId=${encodeURIComponent(
            selectedContentTypeId
          )}&horizonMonths=6&view=active`
        );
        if (!res.ok) {
          if (!cancelled) {
            setSlots([]);
            setSelectedSlotId("");
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const rows: TrackerSlotRow[] = Array.isArray(data.matrixRows)
          ? data.matrixRows
          : [];
        setSlots(rows);
        const firstOpen = rows.find((r) => !r.title && !r.unique_content_id);
        setSelectedSlotId(firstOpen?.id || rows[0]?.id || "");
      } catch {
        if (!cancelled) {
          setSlots([]);
          setSelectedSlotId("");
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [idea, selectedContentTypeId]);

  // Active target slot / date & collision detection
  const selectedSlotRow = useMemo(() => {
    if (assignmentMode !== "placeholder") return null;
    return slots.find((s) => s.id === selectedSlotId) || null;
  }, [assignmentMode, slots, selectedSlotId]);

  const manualDateCollisions = useMemo(() => {
    if (assignmentMode !== "manual_date" || !manualDate) return [];
    return slots.filter(
      (r) =>
        r.publish_date &&
        r.publish_date.split("T")[0] === manualDate &&
        (Boolean(r.title) || Boolean(r.unique_content_id))
    );
  }, [assignmentMode, manualDate, slots]);

  const collidingRow: TrackerSlotRow | null = useMemo(() => {
    if (assignmentMode === "placeholder") {
      if (
        selectedSlotRow &&
        (Boolean(selectedSlotRow.title) ||
          Boolean(selectedSlotRow.unique_content_id))
      ) {
        return selectedSlotRow;
      }
      return null;
    }
    if (manualDateCollisions.length === 0) return null;
    return (
      manualDateCollisions.find((r) => !r.is_published) ||
      manualDateCollisions[0]
    );
  }, [assignmentMode, selectedSlotRow, manualDateCollisions]);

  const targetPublishDate = useMemo(() => {
    if (assignmentMode === "placeholder") {
      return selectedSlotRow?.publish_date || "";
    }
    return manualDate ? `${manualDate}T12:00:00.000Z` : "";
  }, [assignmentMode, selectedSlotRow, manualDate]);

  const collidingIsPublished = Boolean(collidingRow?.is_published);

  // Automatically default away from disabled strategies when colliding row is published
  useEffect(() => {
    if (
      collidingIsPublished &&
      (collisionStrategy === "push_existing" ||
        collisionStrategy === "overwrite_existing")
    ) {
      setCollisionStrategy("keep_both");
    }
  }, [collidingIsPublished, collisionStrategy]);

  // Reset overwrite confirmation whenever target or strategy changes
  useEffect(() => {
    setOverwriteStep(1);
    setOverwriteTokenInput("");
  }, [collidingRow?.id, collisionStrategy, assignmentMode, targetPublishDate]);

  // Fetch live dry_run preview when collision exists and push_existing is selected
  useEffect(() => {
    if (
      !idea ||
      !selectedContentTypeId ||
      !targetPublishDate ||
      !collidingRow ||
      collidingIsPublished ||
      collisionStrategy !== "push_existing"
    ) {
      setPreviewShifts([]);
      return;
    }

    let cancelled = false;
    const runDryRun = async () => {
      setLoadingPreview(true);
      try {
        const res = await fetch("/api/ideas/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea_id: idea.id,
            content_type_id: selectedContentTypeId,
            assignment_mode: assignmentMode,
            publish_date: targetPublishDate,
            target_item_id:
              assignmentMode === "placeholder"
                ? selectedSlotRow?.id
                : collidingRow?.id,
            collision_strategy: "push_existing",
            dry_run: true,
          }),
        });
        if (!res.ok) {
          if (!cancelled) setPreviewShifts([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setPreviewShifts(Array.isArray(data.previewShifts) ? data.previewShifts : []);
        }
      } catch {
        if (!cancelled) setPreviewShifts([]);
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    };

    runDryRun();
    return () => {
      cancelled = true;
    };
  }, [
    idea,
    selectedContentTypeId,
    targetPublishDate,
    assignmentMode,
    selectedSlotRow?.id,
    collidingRow,
    collidingIsPublished,
    collisionStrategy,
  ]);

  if (!idea) return null;

  const canSubmit = (() => {
    if (submitting || !selectedContentTypeId || !targetPublishDate) return false;
    if (assignmentMode === "placeholder" && !selectedSlotRow) return false;
    if (collidingRow) {
      if (
        collidingIsPublished &&
        (collisionStrategy === "push_existing" ||
          collisionStrategy === "overwrite_existing")
      ) {
        return false;
      }
      if (collisionStrategy === "push_existing" && loadingPreview) return false;
      if (collisionStrategy === "overwrite_existing") {
        return overwriteStep === 2 && overwriteTokenInput === "OVERWRITE";
      }
    }
    return true;
  })();

  const handleConfirmAssign = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/ideas/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_id: idea.id,
          content_type_id: selectedContentTypeId,
          assignment_mode: assignmentMode,
          publish_date: targetPublishDate,
          target_item_id:
            assignmentMode === "placeholder"
              ? selectedSlotRow?.id
              : collidingRow?.id,
          collision_strategy: collidingRow ? collisionStrategy : "keep_both",
          confirm_overwrite:
            Boolean(collidingRow) &&
            collisionStrategy === "overwrite_existing" &&
            overwriteStep === 2,
          overwrite_token:
            Boolean(collidingRow) && collisionStrategy === "overwrite_existing"
              ? overwriteTokenInput
              : undefined,
          dry_run: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to assign idea.");
        return;
      }

      onAssigned(idea.id);
      window.dispatchEvent(new CustomEvent("contentpipe:ideas-updated"));
      onClose();
    } catch {
      setError("Network error while assigning idea.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-black/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-floating rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-border shadow-2xl">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs tracking-tight">
                Assign Idea to Production Slot
              </h4>
              <p className="text-[11px] text-muted-foreground truncate">
                {idea.unique_content_id ? `${idea.unique_content_id} • ` : ""}
                {idea.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* 1. Brand -> Content Pipe Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl glass-subtle border border-border">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold block">
                1. Brand
              </label>
              <select
                value={selectedBrandId}
                onChange={(e) => {
                  const nextBrand = e.target.value;
                  setSelectedBrandId(nextBrand);
                  const currentSeries = contentTypes.find(
                    (ct) => ct.id === selectedContentTypeId
                  );
                  if (
                    nextBrand &&
                    currentSeries &&
                    currentSeries.brand_id !== nextBrand
                  ) {
                    setSelectedContentTypeId("");
                  }
                }}
                className="w-full h-9 px-2.5 text-xs glass-input"
              >
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold block">
                2. Content Pipe <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedContentTypeId}
                onChange={(e) => {
                  const nextSeriesId = e.target.value;
                  setSelectedContentTypeId(nextSeriesId);
                  const matched = contentTypes.find(
                    (ct) => ct.id === nextSeriesId
                  );
                  if (matched?.brand_id) {
                    setSelectedBrandId(matched.brand_id);
                  }
                }}
                className="w-full h-9 px-2.5 text-xs glass-input"
              >
                <option value="">Select Content Pipe...</option>
                {filteredContentTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {!selectedBrandId && ct.brand?.name
                      ? `${ct.brand.name} • ${ct.name}`
                      : ct.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedContentTypeId && (
            <>
              {/* 2. Assignment Mode Tabs */}
              <div className="space-y-3">
                <div className="flex items-center gap-1 p-1 rounded-xl glass-subtle border border-border w-fit">
                  <button
                    type="button"
                    onClick={() => setAssignmentMode("placeholder")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      assignmentMode === "placeholder"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    <span>Select Placeholder</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentMode("manual_date")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      assignmentMode === "manual_date"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Insert Date Manually</span>
                  </button>
                </div>

                {assignmentMode === "placeholder" ? (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold block">
                      Available &amp; Scheduled Slots (6-Month Horizon)
                    </label>
                    {loadingSlots ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>Loading cadence slots and active items...</span>
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
                        No slots found in this Content Pipe&apos;s 6-month horizon. Try &quot;Insert Date Manually&quot;.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-background/40">
                        {slots.map((slot) => {
                          const isOccupied =
                            Boolean(slot.title) ||
                            Boolean(slot.unique_content_id);
                          const isSelected = selectedSlotId === slot.id;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlotId(slot.id)}
                              className={`w-full px-3 py-2.5 text-left flex flex-wrap items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-primary/10 border-l-2 border-l-primary"
                                  : "hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-muted-foreground/40"
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5" />}
                                </span>

                                <span className="font-mono text-xs font-semibold text-foreground shrink-0">
                                  {formatShortDate(slot.publish_date)}
                                </span>

                                {isOccupied ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/35 truncate max-w-[280px]">
                                    Occupied •{" "}
                                    {slot.unique_content_id
                                      ? `[${slot.unique_content_id}] `
                                      : ""}
                                    {slot.title || "Untitled"}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35">
                                    [Open Slot]
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {slot.is_published && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Published
                                  </span>
                                )}
                                {slot.has_script && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                                    <FileText className="w-2.5 h-2.5" />
                                    Script
                                  </span>
                                )}
                                {slot.has_content && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                                    <FolderOpen className="w-2.5 h-2.5" />
                                    Drive
                                  </span>
                                )}
                                {(slot.submission_count || 0) > 0 && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                                    {slot.submission_count} Sub
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold block">
                      Target Publish Date
                    </label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full sm:w-64 h-9 px-3 text-xs font-mono glass-input"
                    />
                    {manualDate && !collidingRow && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          No existing content on {formatShortDate(manualDate)}. Will assign as a manual date.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Collision Strategy Cards */}
              {collidingRow && (
                <div className="space-y-2.5 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Collision Detected on {formatShortDate(targetPublishDate)} — Choose How to Proceed
                    </span>
                  </div>

                  {collidingIsPublished && (
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-500">
                      <strong>{collidingRow.unique_content_id || collidingRow.title}</strong> is already{" "}
                      <strong>Published</strong>. Pushing or overwriting published items is disabled; you can still schedule alongside it on the same day.
                    </div>
                  )}

                  {/* Strategy 1: Push Existing */}
                  <div
                    onClick={() => {
                      if (!collidingIsPublished) setCollisionStrategy("push_existing");
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      collidingIsPublished
                        ? "opacity-50 cursor-not-allowed border-border bg-muted/20"
                        : collisionStrategy === "push_existing"
                        ? "border-primary bg-primary/10 cursor-pointer shadow-xs"
                        : "border-border glass-subtle hover:border-primary/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-primary" />
                          <span>Push Existing Content to Make Space</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Shifts existing scheduled content forward along upcoming open cadence dates.
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="collision_strategy"
                        checked={collisionStrategy === "push_existing"}
                        disabled={collidingIsPublished}
                        onChange={() => setCollisionStrategy("push_existing")}
                        className="mt-1 accent-primary"
                      />
                    </div>

                    {collisionStrategy === "push_existing" && !collidingIsPublished && (
                      <div className="mt-2.5 pt-2 border-t border-border/60 text-[11px]">
                        {loadingPreview ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>Calculating cadence shift preview...</span>
                          </div>
                        ) : previewShifts.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                              Live Date-Shift Preview ({previewShifts.length} item{previewShifts.length > 1 ? "s" : ""})
                            </div>
                            {previewShifts.map((s) => (
                              <div
                                key={s.id}
                                className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
                              >
                                <span className="font-bold text-primary">
                                  [{s.unique_content_id || "Slot"}]
                                </span>
                                <span className="truncate max-w-[180px] text-foreground">
                                  {s.title}
                                </span>
                                <span className="text-muted-foreground">moves</span>
                                <span className="text-amber-500 font-semibold">
                                  {formatMonthDay(s.fromDate)}
                                </span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                <span className="text-emerald-500 font-semibold">
                                  {formatMonthDay(s.toDate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            No downstream shifts required.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Strategy 2: Keep Both */}
                  <div
                    onClick={() => setCollisionStrategy("keep_both")}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      collisionStrategy === "keep_both"
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border glass-subtle hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-primary" />
                          <span>Have Multiple Contents on Same Day</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Keeps{" "}
                          <strong className="text-foreground">
                            {collidingRow.unique_content_id || collidingRow.title}
                          </strong>{" "}
                          untouched and schedules this Idea alongside it on{" "}
                          {formatMonthDay(targetPublishDate)}.
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="collision_strategy"
                        checked={collisionStrategy === "keep_both"}
                        onChange={() => setCollisionStrategy("keep_both")}
                        className="mt-1 accent-primary"
                      />
                    </div>
                  </div>

                  {/* Strategy 3: Overwrite Existing (Double Confirmation) */}
                  <div
                    onClick={() => {
                      if (!collidingIsPublished) setCollisionStrategy("overwrite_existing");
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      collidingIsPublished
                        ? "opacity-50 cursor-not-allowed border-border bg-muted/20"
                        : collisionStrategy === "overwrite_existing"
                        ? "border-rose-500/70 bg-rose-500/10 cursor-pointer"
                        : "border-border glass-subtle hover:border-rose-500/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Overwrite Existing Content (Destructive)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Permanently deletes the existing slot&apos;s database record, script, submissions, and Google Drive files.
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="collision_strategy"
                        checked={collisionStrategy === "overwrite_existing"}
                        disabled={collidingIsPublished}
                        onChange={() => setCollisionStrategy("overwrite_existing")}
                        className="mt-1 accent-rose-600"
                      />
                    </div>

                    {collisionStrategy === "overwrite_existing" && !collidingIsPublished && (
                      <div
                        className="mt-3 pt-3 border-t border-rose-500/30 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Step 1: Impact Audit */}
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-1.5 text-[11px]">
                          <div className="font-bold text-rose-500 flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Step 1/2 — Impact Audit</span>
                          </div>
                          <ul className="space-y-1 text-foreground/90 list-disc pl-4">
                            <li>
                              Target Item:{" "}
                              <strong className="font-mono">
                                {collidingRow.unique_content_id || "No ID"}
                              </strong>{" "}
                              — &quot;{collidingRow.title || "Untitled"}&quot;
                            </li>
                            <li>
                              Database records to be permanently erased:{" "}
                              <strong>
                                {collidingRow.task_instances?.length || 0} Workflow Tasks
                              </strong>
                              {collidingRow.has_script ? ", Script Studio data" : ""}
                              {(collidingRow.submission_count || 0) > 0
                                ? `, ${collidingRow.submission_count} Submission(s) & Comments`
                                : ""}
                              .
                            </li>
                            <li className="text-rose-500 font-semibold">
                              The entire Google Drive project folder &amp; all uploaded files for this item will be permanently deleted.
                            </li>
                          </ul>

                          {overwriteStep === 1 && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setOverwriteStep(2)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                              >
                                I Understand — Continue (1/2)
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Step 2: Typed Guard */}
                        {overwriteStep === 2 && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-rose-500 block">
                              Step 2/2 — Type <code className="font-mono font-bold px-1 py-0.5 rounded bg-rose-500/15">OVERWRITE</code> to enable permanent deletion:
                            </label>
                            <input
                              type="text"
                              value={overwriteTokenInput}
                              onChange={(e) => setOverwriteTokenInput(e.target.value)}
                              placeholder="Type OVERWRITE"
                              className="w-full h-8 px-2.5 text-xs font-mono glass-input border-rose-500/50"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 cursor-pointer"
          >
            Cancel
          </button>

          {collidingRow && collisionStrategy === "overwrite_existing" ? (
            <button
              type="button"
              onClick={handleConfirmAssign}
              disabled={!canSubmit}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Permanently Delete Old Content &amp; Assign</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmAssign}
              disabled={!canSubmit}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Confirm Assignment</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
