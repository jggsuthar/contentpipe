"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  HardDrive,
  Trash2,
  AlertTriangle,
  FolderSync,
  ExternalLink,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Calendar,
  CheckCircle2,
  Film,
  Layers,
} from "lucide-react";

export interface StorageCleanupItem {
  id: string;
  unique_content_id: string | null;
  title: string;
  publish_date: string;
  is_archived: boolean;
  content_type_id?: string | null;
  content_type_name: string;
  brand_id?: string | null;
  brand_name?: string | null;
  brand_color?: string | null;
  raw_assets_count: number;
  raw_size_bytes: number;
  drafts_count: number;
  drafts_size_bytes: number;
  final_count: number;
  final_size_bytes: number;
  total_size_bytes: number;
  drive_folders: any;
}

interface StorageCleanupViewProps {
  items: StorageCleanupItem[];
  totalUsageBytes: number;
  onDeleteItemTarget: (itemId: string, target: "raw_footage" | "draft_iterations" | "final_export") => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function StorageCleanupView({
  items,
  totalUsageBytes,
  onDeleteItemTarget,
  onRefresh,
}: StorageCleanupViewProps) {
  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    item: StorageCleanupItem;
    target: "raw_footage" | "draft_iterations" | "final_export";
    targetLabel: string;
    sizeBytes: number;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");

  const brandOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string | null }>();
    for (const item of items) {
      if (item.brand_id && item.brand_name) {
        map.set(item.brand_id, {
          id: item.brand_id,
          name: item.brand_name,
          color: item.brand_color,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const seriesOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brandName?: string | null }>();
    for (const item of items) {
      if (brandFilter !== "all" && item.brand_id !== brandFilter) continue;
      const key = item.content_type_id || item.content_type_name;
      map.set(key, {
        id: key,
        name: item.content_type_name,
        brandName: item.brand_name,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, brandFilter]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (brandFilter !== "all" && item.brand_id !== brandFilter) return false;
      const itemSeriesKey = item.content_type_id || item.content_type_name;
      if (seriesFilter !== "all" && itemSeriesKey !== seriesFilter) return false;
      return true;
    });
  }, [items, brandFilter, seriesFilter]);

  const filteredUsageBytes = useMemo(
    () => filteredItems.reduce((sum, item) => sum + (item.total_size_bytes || 0), 0),
    [filteredItems]
  );

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal) return;
    setIsDeleting(true);
    try {
      await onDeleteItemTarget(confirmModal.item.id, confirmModal.target);
      setConfirmModal(null);
      await onRefresh();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between px-3 py-3 pb-24 md:p-8">
      {/* Page Title Header */}
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            href="/tracker"
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all"
            style={{ borderRadius: "var(--radius)" }}
            title="Back to Index"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-tight">Storage Clean Up</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 uppercase font-bold">
                  Google Drive Management
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Reclaim cloud space safely • Oldest videos listed first
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="w-full max-w-7xl mx-auto my-6 flex-1 space-y-4">
        {/* Total Storage Summary Banner */}
        <div className="p-5 rounded-2xl card-theme flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-mono text-muted-foreground">Total Drive Usage Tracked</span>
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {formatSize(totalUsageBytes)}
              </div>
            </div>
          </div>

          {/* Hard Protection Rule Alert */}
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/40 border border-border text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Hard Protection Rule:</strong> Scripts, review comments, and database records can NEVER be deleted from this tool.
            </span>
          </div>
        </div>

        {/* Brand & Content Series Filters Bar */}
        <div className="p-3 sm:p-3.5 rounded-2xl glass-nav border border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono w-full md:w-auto">
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-[140px]">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
                Brand:
              </span>
              <select
                value={brandFilter}
                onChange={(e) => {
                  setBrandFilter(e.target.value);
                  setSeriesFilter("all");
                }}
                aria-label="Filter by Brand"
                className="h-9 sm:h-8 px-2.5 rounded-xl glass-input cursor-pointer text-xs font-semibold w-full sm:w-auto"
              >
                <option value="all">All Brands</option>
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-[160px]">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="hidden sm:inline text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
                Content Series:
              </span>
              <select
                value={seriesFilter}
                onChange={(e) => setSeriesFilter(e.target.value)}
                aria-label="Filter by Content Series"
                className="h-9 sm:h-8 px-2.5 rounded-xl glass-input cursor-pointer text-xs font-semibold w-full sm:w-auto"
              >
                <option value="all">All Content Series</option>
                {seriesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {brandFilter === "all" && s.brandName ? `${s.brandName} • ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] font-mono text-muted-foreground">
            Showing <strong className="text-foreground">{filteredItems.length}</strong> of {items.length} videos •{" "}
            <strong className="text-foreground">{formatSize(filteredUsageBytes)}</strong>
          </div>
        </div>

        {/* Mobile Project Storage Cards (< md) */}
        <div className="md:hidden space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="card-theme p-8 rounded-2xl text-center text-xs text-muted-foreground font-mono">
              No video projects match the selected Brand / Content Series filter.
            </div>
          ) : (
            filteredItems.map((item) => {
              const pDate = new Date(item.publish_date);
              const formattedDate = pDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <div
                  key={item.id}
                  className="card-theme p-3.5 rounded-2xl space-y-3"
                >
                  {/* Card Header: ID + Status + Total Size */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.unique_content_id ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                          {item.unique_content_id}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-muted-foreground bg-muted">
                          No ID
                        </span>
                      )}

                      {item.is_archived ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-muted text-muted-foreground border border-border">
                          Archived
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      )}
                    </div>

                    <span className="text-xs font-mono font-bold text-foreground">
                      {formatSize(item.total_size_bytes)}
                    </span>
                  </div>

                  {/* Title & Series Meta */}
                  <div className="space-y-0.5">
                    <h4 className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground flex-wrap">
                      {item.brand_name && (
                        <>
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.brand_color || "#6366f1" }}
                          />
                          <span className="text-foreground/80">{item.brand_name}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{item.content_type_name}</span>
                      <span>•</span>
                      <span>{formattedDate}</span>
                    </div>
                  </div>

                  {/* 1-Tap Cleanup Buttons */}
                  <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-border/60">
                    <button
                      type="button"
                      disabled={item.raw_size_bytes <= 0}
                      onClick={() =>
                        setConfirmModal({
                          item,
                          target: "raw_footage",
                          targetLabel: "Raw Footage & B-Roll",
                          sizeBytes: item.raw_size_bytes,
                        })
                      }
                      className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-mono flex items-center justify-between border transition-colors ${
                        item.raw_size_bytes > 0
                          ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-pointer font-semibold"
                          : "glass-subtle text-muted-foreground border-border/50 opacity-55 cursor-default"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Raw Footage</span>
                      </span>
                      <span>{formatSize(item.raw_size_bytes)}</span>
                    </button>

                    <button
                      type="button"
                      disabled={item.drafts_size_bytes <= 0}
                      onClick={() =>
                        setConfirmModal({
                          item,
                          target: "draft_iterations",
                          targetLabel: "Draft Iterations (V1, V2...)",
                          sizeBytes: item.drafts_size_bytes,
                        })
                      }
                      className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-mono flex items-center justify-between border transition-colors ${
                        item.drafts_size_bytes > 0
                          ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-pointer font-semibold"
                          : "glass-subtle text-muted-foreground border-border/50 opacity-55 cursor-default"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Draft Cuts</span>
                      </span>
                      <span>{formatSize(item.drafts_size_bytes)}</span>
                    </button>

                    <button
                      type="button"
                      disabled={item.final_size_bytes <= 0}
                      onClick={() =>
                        setConfirmModal({
                          item,
                          target: "final_export",
                          targetLabel: "Final Export Video",
                          sizeBytes: item.final_size_bytes,
                        })
                      }
                      className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-mono flex items-center justify-between border transition-colors ${
                        item.final_size_bytes > 0
                          ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-pointer font-semibold"
                          : "glass-subtle text-muted-foreground border-border/50 opacity-55 cursor-default"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Final Export</span>
                      </span>
                      <span>{formatSize(item.final_size_bytes)}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Storage Management Matrix Table */}
        <div className="hidden md:block card-theme rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-3 w-28">Content ID</th>
                  <th className="py-3 px-4 min-w-[200px]">Video Title</th>
                  <th className="py-3 px-3 w-28">Publish Date</th>
                  <th className="py-3 px-3 w-24 text-center">Status</th>
                  <th className="py-3 px-3 min-w-[140px] text-center">01_Raw Footage</th>
                  <th className="py-3 px-3 min-w-[140px] text-center">02_Draft Cuts</th>
                  <th className="py-3 px-3 min-w-[140px] text-center">03_Final Export</th>
                  <th className="py-3 px-3 w-24 text-right">Total</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground font-mono">
                      No video projects match the selected Brand / Content Series filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const pDate = new Date(item.publish_date);
                    const formattedDate = pDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        {/* Content ID */}
                        <td className="py-3 px-3 font-mono font-bold">
                          {item.unique_content_id ? (
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {item.unique_content_id}
                            </span>
                          ) : (
                            <span className="text-muted-foreground opacity-50">—</span>
                          )}
                        </td>

                        {/* Title + Brand • Content Series */}
                        <td className="py-3 px-4">
                          <div className="font-semibold truncate max-w-xs">{item.title}</div>
                          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                            {item.brand_name && (
                              <>
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: item.brand_color || "#6366f1" }}
                                />
                                <span className="text-foreground/80">{item.brand_name}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{item.content_type_name}</span>
                          </span>
                        </td>

                        {/* Publish Date */}
                        <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {formattedDate}
                        </td>

                        {/* Archive Status */}
                        <td className="py-3 px-3 text-center">
                          {item.is_archived ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-muted text-muted-foreground border border-border">
                              Archived
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          )}
                        </td>

                        {/* 01_Raw Footage */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-mono font-bold text-[11px]">
                              {formatSize(item.raw_size_bytes)}
                            </span>
                            {item.raw_size_bytes > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmModal({
                                    item,
                                    target: "raw_footage",
                                    targetLabel: "Raw Footage & B-Roll",
                                    sizeBytes: item.raw_size_bytes,
                                  })
                                }
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30 flex items-center gap-1 cursor-pointer"
                                title="Delete 01_Raw_Footage on Google Drive"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete Raw</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 02_Draft Cuts */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-mono font-bold text-[11px]">
                              {formatSize(item.drafts_size_bytes)}
                            </span>
                            {item.drafts_size_bytes > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmModal({
                                    item,
                                    target: "draft_iterations",
                                    targetLabel: "Draft Iterations (V1, V2...)",
                                    sizeBytes: item.drafts_size_bytes,
                                  })
                                }
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30 flex items-center gap-1 cursor-pointer"
                                title="Delete draft iterations, preserving approved cut"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete Drafts</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 03_Final Export */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-mono font-bold text-[11px]">
                              {formatSize(item.final_size_bytes)}
                            </span>
                            {item.final_size_bytes > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmModal({
                                    item,
                                    target: "final_export",
                                    targetLabel: "Final Export Video",
                                    sizeBytes: item.final_size_bytes,
                                  })
                                }
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30 flex items-center gap-1 cursor-pointer"
                                title="Delete final export file"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete Final</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Total Consumed */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                          {formatSize(item.total_size_bytes)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setConfirmModal(null);
          }}
        >
          <div className="glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-5 sm:p-6 space-y-4 border-destructive/40">
            <div className="sm:hidden mobile-sheet-handle -mt-1" />
            <div className="flex items-center gap-2 text-destructive pb-2 border-b border-border">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">Confirm Google Drive Deletion</h3>
            </div>

            <div className="space-y-2 text-xs">
              <p>
                Are you sure you want to permanently delete{" "}
                <strong className="text-foreground">{confirmModal.targetLabel}</strong> for:
              </p>
              <div className="p-2.5 rounded bg-muted/40 border border-border font-mono text-[11px]">
                <div>
                  <strong>ID:</strong> {confirmModal.item.unique_content_id || "N/A"}
                </div>
                <div className="truncate">
                  <strong>Title:</strong> {confirmModal.item.title}
                </div>
                <div>
                  <strong>Space to reclaim:</strong> {formatSize(confirmModal.sizeBytes)}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This action frees storage from Google Drive. Your script notes and database records remain protected.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground"
                style={{ borderRadius: "var(--radius)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 cursor-pointer shadow-xs"
                style={{ borderRadius: "var(--radius)" }}
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="hidden md:block w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-7xl mx-auto">
        ContentPipe • Google Drive Storage Cleanup Utility
      </footer>
    </div>
  );
}
