"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Lightbulb,
  Plus,
  X,
  Search,
  Pin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FileText,
  FolderOpen,
  CalendarPlus,
  Trash2,
  Check,
  Copy,
  Edit3,
  Loader2,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { AssignIdeaModal } from "@/components/ideas/assign-idea-modal";

export interface BrandOption {
  id: string;
  name: string;
  color?: string | null;
}

export interface ContentSeriesOption {
  id: string;
  name: string;
  prefix: string | null;
  brand_id?: string | null;
  brand?: { id: string; name: string; color?: string | null } | null;
}

export interface IdeaBankItem {
  id: string;
  unique_content_id: string | null;
  title: string;
  excerpt: string;
  idea_status: string | null;
  is_pinned: boolean;
  brand_id: string | null;
  content_type_id: string | null;
  created_at: string;
  brand?: { id: string; name: string; color?: string | null } | null;
  content_type?: {
    id: string;
    name: string;
    prefix: string | null;
    brand_id?: string | null;
    brand?: { id: string; name: string; color?: string | null } | null;
  } | null;
  has_script: boolean;
  has_content: boolean;
}

type SortKey =
  | "unique_content_id"
  | "title"
  | "idea_status"
  | "content_type"
  | "brand"
  | "created_at";

interface IdeaBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  ideas: IdeaBankItem[];
  loading: boolean;
  brands: BrandOption[];
  contentTypes: ContentSeriesOption[];
  onRefreshIdeas: () => Promise<void>;
  onIdeaCreated: (idea: IdeaBankItem) => void;
  onIdeaUpdated: (idea: IdeaBankItem) => void;
  onIdeaDeleted: (id: string) => void;
}

function StatusInputCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (nextVal: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    const current = (value || "").trim();
    if (trimmed === current) return;
    setSaving(true);
    try {
      await onSave(trimmed || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        list="idea-status-suggestions"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value || "");
            e.currentTarget.blur();
          }
        }}
        placeholder="Add status..."
        disabled={saving}
        className={`w-full min-w-[120px] max-w-[165px] h-7 px-2.5 text-[11px] font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          draft.trim()
            ? "glass-input text-foreground"
            : "bg-transparent border border-dashed border-border/70 text-muted-foreground hover:border-border focus:glass-input"
        }`}
      />
      {saving && (
        <Loader2 className="w-3 h-3 animate-spin text-primary absolute right-2 pointer-events-none" />
      )}
    </div>
  );
}

export function IdeaBankModal({
  isOpen,
  onClose,
  ideas,
  loading,
  brands,
  contentTypes,
  onRefreshIdeas,
  onIdeaCreated,
  onIdeaUpdated,
  onIdeaDeleted,
}: IdeaBankModalProps) {
  // Quick capture form state
  const [isAdding, setIsAdding] = useState(false);
  const [showOptionalQuickFields, setShowOptionalQuickFields] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newExcerpt, setNewExcerpt] = useState("");
  const [newBrandId, setNewBrandId] = useState("");
  const [newSeriesId, setNewSeriesId] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pipeFilter, setPipeFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Row expansion & inline title/excerpt editing
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDeleteIdea, setConfirmDeleteIdea] = useState<IdeaBankItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Slot assignment sub-modal
  const [assigningIdea, setAssigningIdea] = useState<IdeaBankItem | null>(null);

  // Action error banner
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (assigningIdea) {
          setAssigningIdea(null);
        } else if (confirmDeleteIdea) {
          setConfirmDeleteIdea(null);
        } else if (editingRowId) {
          setEditingRowId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, assigningIdea, confirmDeleteIdea, editingRowId, onClose]);

  const totalCount = ideas.length;
  const pinnedCount = useMemo(() => ideas.filter((i) => i.is_pinned).length, [ideas]);
  const needDetailsCount = useMemo(
    () => ideas.filter((i) => !i.brand_id || !i.content_type_id).length,
    [ideas]
  );

  const distinctStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const idea of ideas) {
      const s = idea.idea_status?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [ideas]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      statusFilter !== "all" ||
      pipeFilter !== "all" ||
      brandFilter !== "all" ||
      pinnedOnly ||
      incompleteOnly
  );

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPipeFilter("all");
    setBrandFilter("all");
    setPinnedOnly(false);
    setIncompleteOnly(false);
  };

  const quickCaptureSeriesOptions = useMemo(() => {
    if (!newBrandId) return contentTypes;
    return contentTypes.filter((ct) => ct.brand_id === newBrandId);
  }, [contentTypes, newBrandId]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const filteredAndSortedIdeas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = ideas.filter((idea) => {
      if (pinnedOnly && !idea.is_pinned) return false;
      if (incompleteOnly && idea.brand_id && idea.content_type_id) return false;

      if (statusFilter === "__empty__") {
        if (idea.idea_status && idea.idea_status.trim() !== "") return false;
      } else if (statusFilter !== "all") {
        if ((idea.idea_status || "").trim() !== statusFilter) return false;
      }

      if (pipeFilter === "__missing__") {
        if (idea.content_type_id) return false;
      } else if (pipeFilter !== "all") {
        if (idea.content_type_id !== pipeFilter) return false;
      }

      if (brandFilter === "__missing__") {
        if (idea.brand_id) return false;
      } else if (brandFilter !== "all") {
        if (idea.brand_id !== brandFilter) return false;
      }

      if (q) {
        const hay = [
          idea.unique_content_id || "",
          idea.title || "",
          idea.excerpt || "",
          idea.idea_status || "",
          idea.brand?.name || "",
          idea.content_type?.name || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const getSortVal = (item: IdeaBankItem): string | number => {
      switch (sortKey) {
        case "unique_content_id":
          return (item.unique_content_id || "").toLowerCase();
        case "title":
          return (item.title || "").toLowerCase();
        case "idea_status":
          return (item.idea_status || "").toLowerCase();
        case "content_type":
          return (item.content_type?.name || "").toLowerCase();
        case "brand":
          return (item.brand?.name || "").toLowerCase();
        case "created_at":
        default:
          return new Date(item.created_at).getTime();
      }
    };

    const compare = (a: IdeaBankItem, b: IdeaBankItem) => {
      const va = getSortVal(a);
      const vb = getSortVal(b);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    };

    const pinned = filtered.filter((i) => i.is_pinned).sort(compare);
    const unpinned = filtered.filter((i) => !i.is_pinned).sort(compare);
    return [...pinned, ...unpinned];
  }, [
    ideas,
    searchQuery,
    statusFilter,
    pipeFilter,
    brandFilter,
    pinnedOnly,
    incompleteOnly,
    sortKey,
    sortDir,
  ]);

  const handleCreateQuickIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newTitle.trim() || !newExcerpt.trim()) {
      setFormError("Both Title and Excerpt are required.");
      return;
    }

    setSavingNew(true);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          excerpt: newExcerpt.trim(),
          brand_id: newBrandId || null,
          content_type_id: newSeriesId || null,
          idea_status: newStatus.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save idea.");
        return;
      }

      onIdeaCreated(data);
      setNewTitle("");
      setNewExcerpt("");
      setNewBrandId("");
      setNewSeriesId("");
      setNewStatus("");
      setShowOptionalQuickFields(false);
      setIsAdding(false);
    } catch {
      setFormError("Network error while creating idea.");
    } finally {
      setSavingNew(false);
    }
  };

  const patchIdea = async (id: string, payload: Record<string, unknown>) => {
    setActionError(null);
    const res = await fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error || "Failed to update idea.");
      return null;
    }
    onIdeaUpdated(data);
    return data as IdeaBankItem;
  };

  const handleToggleExpand = (idea: IdeaBankItem) => {
    if (expandedRowId === idea.id) {
      setExpandedRowId(null);
      if (editingRowId === idea.id) setEditingRowId(null);
    } else {
      setExpandedRowId(idea.id);
    }
  };

  const handleStartEdit = (idea: IdeaBankItem) => {
    setExpandedRowId(idea.id);
    setEditingRowId(idea.id);
    setEditTitle(idea.title);
    setEditExcerpt(idea.excerpt);
  };

  const handleSaveInlineEdit = async (idea: IdeaBankItem) => {
    if (!editTitle.trim() || !editExcerpt.trim()) {
      setActionError("Title and Excerpt cannot be empty.");
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await patchIdea(idea.id, {
        title: editTitle.trim(),
        excerpt: editExcerpt.trim(),
      });
      if (updated) {
        setEditingRowId(null);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopyId = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(code);
      setTimeout(() => setCopiedId((prev) => (prev === code ? null : prev)), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteIdea) return;
    setDeletingId(confirmDeleteIdea.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/ideas?id=${encodeURIComponent(confirmDeleteIdea.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Failed to delete idea.");
        return;
      }
      onIdeaDeleted(confirmDeleteIdea.id);
      if (expandedRowId === confirmDeleteIdea.id) setExpandedRowId(null);
      setConfirmDeleteIdea(null);
    } catch {
      setActionError("Network error while deleting idea.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenAssignModal = (idea: IdeaBankItem) => {
    setAssigningIdea(idea);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 opacity-35 group-hover:opacity-75 transition-opacity" />;
    }
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 text-primary" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-primary" />
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <datalist id="idea-status-suggestions">
        {distinctStatuses.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="glass-modal mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl w-full sm:w-[95vw] max-w-[1440px] h-[90dvh] sm:h-[86vh] flex flex-col overflow-hidden border border-border shadow-2xl">
        <div className="sm:hidden mobile-sheet-handle mt-2.5 mb-0.5" />

        {/* 1. Modal Header */}
        <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight leading-none">
                Idea Bank
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ideas &amp; Future Projects Workspace
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-1 sm:ml-3">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-muted/80 text-foreground border border-border">
                {totalCount} Total
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-primary/10 text-primary border border-primary/25">
                {pinnedCount} Pinned
              </span>
              <button
                type="button"
                onClick={() => setIncompleteOnly((prev) => !prev)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  incompleteOnly
                    ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                    : needDetailsCount > 0
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/25"
                    : "bg-muted/50 text-muted-foreground border-border"
                }`}
                title="Filter ideas missing Brand or Content Pipe"
              >
                {needDetailsCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
                <span>{needDetailsCount} Need Details</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setIsAdding((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                isAdding
                  ? "bg-muted text-foreground border border-border"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isAdding ? "Close Form" : "+ New Quick Idea"}</span>
            </button>

            <button
              type="button"
              onClick={() => onRefreshIdeas()}
              className="p-1.5 rounded-xl glass-subtle text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Refresh ideas"
              aria-label="Refresh ideas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close Idea Bank"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Capture Collapsible Form */}
        {isAdding && (
          <form
            onSubmit={handleCreateQuickIdea}
            className="px-3.5 sm:px-5 py-3.5 border-b border-border bg-muted/30 space-y-3 shrink-0"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <div className="md:col-span-5 space-y-1">
                <label className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Working title or hook..."
                  className="w-full h-9 px-3 text-base sm:text-xs glass-input"
                />
              </div>

              <div className="md:col-span-7 space-y-1">
                <label className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  Excerpt <span className="text-rose-500">*</span>
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">
                    (Premise, angle, or key notes)
                  </span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={newExcerpt}
                  onChange={(e) => setNewExcerpt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      handleCreateQuickIdea(e as any);
                    }
                  }}
                  placeholder="Why this video works, hook idea, key beats..."
                  className="w-full px-3 py-2 text-base sm:text-xs glass-input resize-y min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOptionalQuickFields((prev) => !prev)}
                  className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  {showOptionalQuickFields ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>Optional details (Brand, Content Pipe, Status)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {formError && (
                  <span className="text-[11px] text-rose-500 font-medium">{formError}</span>
                )}
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNew || !newTitle.trim() || !newExcerpt.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {savingNew ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Idea</span>
                </button>
              </div>
            </div>

            {showOptionalQuickFields && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                    Brand (optional)
                  </label>
                  <select
                    value={newBrandId}
                    onChange={(e) => {
                      const nextBrand = e.target.value;
                      setNewBrandId(nextBrand);
                      if (
                        newSeriesId &&
                        nextBrand &&
                        contentTypes.find((ct) => ct.id === newSeriesId)?.brand_id !== nextBrand
                      ) {
                        setNewSeriesId("");
                      }
                    }}
                    className="w-full h-8 px-2.5 text-xs glass-input"
                  >
                    <option value="">Leave unassigned</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                    Content Pipe (optional)
                  </label>
                  <select
                    value={newSeriesId}
                    onChange={(e) => {
                      const nextSeries = e.target.value;
                      setNewSeriesId(nextSeries);
                      if (nextSeries) {
                        const matched = contentTypes.find((ct) => ct.id === nextSeries);
                        if (matched?.brand_id) setNewBrandId(matched.brand_id);
                      }
                    }}
                    className="w-full h-8 px-2.5 text-xs glass-input"
                  >
                    <option value="">Leave unassigned</option>
                    {quickCaptureSeriesOptions.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {!newBrandId && ct.brand?.name ? `${ct.brand.name} • ${ct.name}` : ct.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                    Status (optional free text)
                  </label>
                  <input
                    type="text"
                    list="idea-status-suggestions"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    placeholder="e.g. Researching, Hot Take..."
                    className="w-full h-8 px-2.5 text-xs glass-input"
                  />
                </div>
              </div>
            )}
          </form>
        )}

        {/* 2. Full-Column Filter & Search Toolbar */}
        <div className="px-3.5 sm:px-5 py-2.5 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[180px] sm:min-w-[210px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, excerpt, or status..."
              className="w-full h-9 sm:h-8 pl-8 pr-7 text-base sm:text-xs glass-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-[11px] font-medium glass-input min-w-[130px]"
            aria-label="Filter by Status"
          >
            <option value="all">All Statuses</option>
            <option value="__empty__">Empty Status</option>
            {distinctStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={pipeFilter}
            onChange={(e) => setPipeFilter(e.target.value)}
            className="h-8 px-2.5 text-[11px] font-medium glass-input min-w-[155px]"
            aria-label="Filter by Content Pipe"
          >
            <option value="all">All Content Pipes</option>
            <option value="__missing__">⚠ Missing Content Pipe</option>
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.brand?.name ? `${ct.brand.name} • ${ct.name}` : ct.name}
              </option>
            ))}
          </select>

          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="h-8 px-2.5 text-[11px] font-medium glass-input min-w-[135px]"
            aria-label="Filter by Brand"
          >
            <option value="all">All Brands</option>
            <option value="__missing__">⚠ Missing Brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setPinnedOnly((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
              pinnedOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "glass-subtle text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pin className="w-3 h-3" />
            <span>Pinned Only</span>
          </button>

          <button
            type="button"
            onClick={() => setIncompleteOnly((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
              incompleteOnly
                ? "bg-amber-500 text-white border-amber-500"
                : "glass-subtle text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Incomplete Only</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {actionError && (
          <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-500 text-xs flex items-center justify-between shrink-0">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3. Single Scrollable Table Container with Sticky Header */}
        <div className="flex-1 min-h-0 overflow-auto">
          {loading && ideas.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs font-mono">Loading Idea Bank workspace...</span>
            </div>
          ) : filteredAndSortedIdeas.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6 py-16 text-muted-foreground">
              <Lightbulb className="w-8 h-8 opacity-30" />
              <p className="text-sm font-semibold text-foreground/80">
                {ideas.length === 0
                  ? "Your Idea Bank is empty"
                  : "No ideas match the active filters"}
              </p>
              <p className="text-xs max-w-md">
                {ideas.length === 0
                  ? 'Click "+ New Quick Idea" above to capture a title and excerpt in seconds.'
                  : "Try clearing search or filter chips to see all ideas."}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1080px]">
              <thead className="sticky top-0 z-10 glass-nav border-b border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-2 w-10 text-center">Pin</th>
                  <th className="py-2.5 px-2.5 w-32">
                    <button
                      type="button"
                      onClick={() => handleSort("unique_content_id")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Content ID</span>
                      {renderSortIcon("unique_content_id")}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[260px]">
                    <button
                      type="button"
                      onClick={() => handleSort("title")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Title</span>
                      <span className="text-[9px] normal-case opacity-65">(click for excerpt)</span>
                      {renderSortIcon("title")}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 w-44">
                    <button
                      type="button"
                      onClick={() => handleSort("idea_status")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Status</span>
                      {renderSortIcon("idea_status")}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 w-48">
                    <button
                      type="button"
                      onClick={() => handleSort("content_type")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Content Pipe</span>
                      {renderSortIcon("content_type")}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 w-44">
                    <button
                      type="button"
                      onClick={() => handleSort("brand")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Brand</span>
                      {renderSortIcon("brand")}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 w-44">Workspace</th>
                  <th className="py-2.5 pl-2.5 pr-4 w-44 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("created_at")}
                      className="group inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Actions</span>
                      {renderSortIcon("created_at")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {filteredAndSortedIdeas.map((idea) => {
                  const isExpanded = expandedRowId === idea.id;
                  const isEditing = editingRowId === idea.id;
                  const rowBrand = brands.find((b) => b.id === idea.brand_id) || idea.brand;
                  const rowSeriesOptions = idea.brand_id
                    ? contentTypes.filter((ct) => ct.brand_id === idea.brand_id)
                    : contentTypes;

                  return (
                    <React.Fragment key={idea.id}>
                      <tr
                        className={`transition-colors hover:bg-muted/35 ${
                          idea.is_pinned
                            ? "border-l-2 border-l-primary bg-primary/5"
                            : ""
                        }`}
                      >
                        {/* Pin */}
                        <td className="py-2.5 pl-4 pr-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => patchIdea(idea.id, { is_pinned: !idea.is_pinned })}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              idea.is_pinned
                                ? "text-primary bg-primary/15 hover:bg-primary/25"
                                : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/60"
                            }`}
                            title={idea.is_pinned ? "Unpin idea" : "Pin to top"}
                          >
                            <Pin className={`w-3.5 h-3.5 ${idea.is_pinned ? "fill-current" : ""}`} />
                          </button>
                        </td>

                        {/* Content ID */}
                        <td className="py-2.5 px-2.5 align-middle">
                          {idea.unique_content_id ? (
                            <button
                              type="button"
                              onClick={() => handleCopyId(idea.unique_content_id!)}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-muted/80 border border-border text-foreground hover:border-primary/40 transition-colors cursor-pointer"
                              title="Click to copy Content ID"
                            >
                              <span>{idea.unique_content_id}</span>
                              {copiedId === idea.unique_content_id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 opacity-45" />
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Title (Click to view Excerpt) */}
                        <td className="py-2.5 px-3 align-middle max-w-[360px]">
                          <button
                            type="button"
                            onClick={() => handleToggleExpand(idea)}
                            className="w-full text-left group cursor-pointer flex items-start gap-1.5"
                            title="Click title to read or edit excerpt"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                                {idea.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {idea.excerpt || "Click title to add excerpt"}
                              </div>
                            </div>
                          </button>
                        </td>

                        {/* Status (Free Text) */}
                        <td className="py-2.5 px-2.5 align-middle">
                          <StatusInputCell
                            value={idea.idea_status}
                            onSave={async (nextStatus) => {
                              await patchIdea(idea.id, { idea_status: nextStatus });
                            }}
                          />
                        </td>

                        {/* Content Pipe */}
                        <td className="py-2.5 px-2.5 align-middle">
                          <div className="relative flex items-center">
                            {!idea.content_type_id && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute left-2.5 pointer-events-none" />
                            )}
                            <select
                              value={idea.content_type_id || ""}
                              onChange={(e) =>
                                patchIdea(idea.id, { content_type_id: e.target.value || null })
                              }
                              className={`w-full h-7 text-[11px] font-medium rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                idea.content_type_id
                                  ? "glass-input px-2 text-foreground"
                                  : "pl-5 pr-2 border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              <option value="">+ Set Content Pipe</option>
                              {rowSeriesOptions.map((ct) => (
                                <option key={ct.id} value={ct.id}>
                                  {!idea.brand_id && ct.brand?.name
                                    ? `${ct.brand.name} • ${ct.name}`
                                    : ct.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Brand */}
                        <td className="py-2.5 px-2.5 align-middle">
                          <div className="relative flex items-center">
                            {idea.brand_id && rowBrand ? (
                              <span
                                className="w-2 h-2 rounded-full absolute left-2.5 pointer-events-none"
                                style={{ backgroundColor: rowBrand.color || "#6366f1" }}
                              />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute left-2.5 pointer-events-none" />
                            )}
                            <select
                              value={idea.brand_id || ""}
                              onChange={(e) =>
                                patchIdea(idea.id, { brand_id: e.target.value || null })
                              }
                              className={`w-full h-7 pl-6 pr-2 text-[11px] font-medium rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                idea.brand_id
                                  ? "glass-input text-foreground"
                                  : "border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              <option value="">+ Set Brand</option>
                              {brands.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Workspace (Script & Content) */}
                        <td className="py-2.5 px-2.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/scripts/${idea.unique_content_id || idea.id}`}
                              onClick={() => onClose()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-subtle border border-border hover:border-primary/40 hover:text-primary transition-all"
                              title="Open Script Studio"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Script</span>
                              {idea.has_script && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              )}
                            </Link>

                            <Link
                              href={`/content/${idea.unique_content_id || idea.id}`}
                              onClick={() => onClose()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-subtle border border-border hover:border-primary/40 hover:text-primary transition-all"
                              title="Open Content & Google Drive Hub"
                            >
                              <FolderOpen className="w-3 h-3" />
                              <span>Content</span>
                              {idea.has_content && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              )}
                            </Link>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 pl-2.5 pr-4 align-middle text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(idea)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
                              title="Promote idea to an open /index slot"
                            >
                              <CalendarPlus className="w-3 h-3" />
                              <span>Assign to Slot</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteIdea(idea)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete idea"
                              aria-label="Delete idea"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Excerpt & Inline Edit Row */}
                      {isExpanded && (
                        <tr className="bg-muted/25">
                          <td colSpan={8} className="px-6 py-3.5 border-t border-border/40">
                            {isEditing ? (
                              <div className="space-y-2.5 max-w-3xl">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                    Title
                                  </label>
                                  <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full h-8 px-2.5 text-xs glass-input"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                    Excerpt
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editExcerpt}
                                    onChange={(e) => setEditExcerpt(e.target.value)}
                                    className="w-full px-2.5 py-2 text-xs glass-input resize-y"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineEdit(idea)}
                                    disabled={savingEdit}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  >
                                    {savingEdit ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                    <span>Save</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingRowId(null)}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="space-y-1 max-w-4xl">
                                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                    Excerpt / Premise
                                  </div>
                                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                    {idea.excerpt || "No excerpt provided."}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(idea)}
                                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold glass-subtle border border-border hover:border-primary/40 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit Title &amp; Excerpt</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Assign to Slot Modal */}
      <AssignIdeaModal
        idea={assigningIdea}
        brands={brands}
        contentTypes={contentTypes}
        onClose={() => setAssigningIdea(null)}
        onAssigned={(assignedId) => onIdeaDeleted(assignedId)}
      />

      {/* Delete Confirmation Sub-Modal */}
      {confirmDeleteIdea && (
        <div
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteIdea(null);
          }}
        >
          <div className="glass-floating mobile-bottom-sheet rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4 border border-border shadow-2xl">
            <div className="sm:hidden mobile-sheet-handle -mt-1 mb-2" />
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-4 h-4" />
              <h4 className="font-bold text-xs">Delete Idea Permanently?</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will permanently remove{" "}
              <strong className="text-foreground">&quot;{confirmDeleteIdea.title}&quot;</strong>{" "}
              ({confirmDeleteIdea.unique_content_id || "unassigned"}) from your Idea Bank.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmDeleteIdea(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === confirmDeleteIdea.id}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {deletingId === confirmDeleteIdea.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
