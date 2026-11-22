"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { MatrixTable, MatrixRowItem } from "@/components/tracker/matrix-table";
import { PublishCalendar } from "@/components/tracker/publish-calendar";
import { AddPlaceholderModal } from "@/components/tracker/add-placeholder-modal";
import { DeletePlaceholderModal } from "@/components/tracker/delete-placeholder-modal";
import { ChangePublishDateModal } from "@/components/tracker/change-publish-date-modal";
import { PublishDatesOrganizerModal } from "@/components/tracker/publish-dates-organizer-modal";
import {
  Calendar,
  CalendarDays,
  Layers,
  CheckCircle2,
  FolderArchive,
  Loader2,
  PlusCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TaskStatus } from "@/types/database";

interface BrandOption {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  is_default?: boolean;
}

interface ContentSeriesOption {
  id: string;
  name: string;
  prefix: string | null;
  brand_id?: string | null;
  brand?: { id: string; name: string; color?: string | null } | null;
}

function IndexContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [activeBrand, setActiveBrand] = useState<BrandOption | null>(null);
  const [contentTypes, setContentTypes] = useState<ContentSeriesOption[]>([]);
  const [activeContentType, setActiveContentType] = useState<any>(null);
  const [matrixRows, setMatrixRows] = useState<MatrixRowItem[]>([]);
  const [horizonMonths, setHorizonMonths] = useState<number | null>(6);
  const [currentView, setCurrentView] = useState<"active" | "archive">("active");
  const [isCreator, setIsCreator] = useState<boolean>(true);
  const [canInputIdeation, setCanInputIdeation] = useState<boolean>(true);
  const [canChangePublish, setCanChangePublish] = useState<boolean>(true);
  const [indexPermissions, setIndexPermissions] = useState<any>(null);

  // 6-Month Publish Calendar State
  const [calendarMode, setCalendarMode] = useState<"closed" | "docked" | "floating" | "minimized">("closed");

  // Modals for Custom Placeholder & Publish Dates Organizer
  const [isAddPlaceholderOpen, setIsAddPlaceholderOpen] = useState(false);
  const [addPlaceholderDate, setAddPlaceholderDate] = useState<string | undefined>(undefined);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<MatrixRowItem | null>(null);
  const [changingPublishDateRow, setChangingPublishDateRow] = useState<MatrixRowItem | null>(null);

  // Single-scroller & Floating Horizontal Scroller state
  const mainRef = useRef<HTMLDivElement>(null);
  const [hScroll, setHScroll] = useState({ hasOverflow: false, left: 0, max: 0 });

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const updateScrollMetrics = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      setHScroll({
        hasOverflow: max > 4,
        left: el.scrollLeft,
        max,
      });
    };

    updateScrollMetrics();
    el.addEventListener("scroll", updateScrollMetrics, { passive: true });
    const ro = new ResizeObserver(updateScrollMetrics);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", updateScrollMetrics);
      ro.disconnect();
    };
  }, [loading, matrixRows, activeContentType]);

  const selectedBrandId = searchParams?.get("brand") || null;
  const selectedTypeId = searchParams?.get("type") || null;

  const fetchTrackerData = async (
    typeId?: string | null,
    horizon?: number | null,
    view: "active" | "archive" = currentView,
    brandId?: string | null
  ) => {
    try {
      setLoading(true);
      const queryBrand = brandId !== undefined ? brandId : selectedBrandId || "";
      const queryType = typeId !== undefined ? typeId : selectedTypeId || "";
      const params = new URLSearchParams();
      if (queryBrand) params.set("brandId", queryBrand);
      if (queryType) params.set("contentTypeId", queryType);
      if (horizon !== null && horizon !== undefined) {
        params.set("horizonMonths", String(horizon));
      }
      params.set("view", view);

      const url = `/api/tracker?${params.toString()}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBrands(data.brands || []);
        setActiveBrand(data.activeBrand || null);
        setContentTypes(data.contentTypes || []);
        setActiveContentType(data.activeContentType);
        setMatrixRows(data.matrixRows || []);
        setIsCreator(data.isCreator ?? true);
        setCanInputIdeation(data.canInputIdeation ?? (data.isCreator ?? true));
        setCanChangePublish(data.canChangePublish ?? (data.isCreator ?? true));
        setIndexPermissions(data.indexPermissions || null);
        if (horizon === null || horizon === undefined) {
          setHorizonMonths(data.horizonMonths || data.defaultMonthsOpen || 6);
        }
      } else if (res.status === 403 && view === "archive") {
        setCurrentView("active");
      }
    } catch (err) {
      console.error("Error fetching tracker data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackerData(selectedTypeId, horizonMonths, currentView, selectedBrandId);
  }, [selectedBrandId, selectedTypeId, horizonMonths, currentView]);

  // Refresh matrix when an Idea Bank item is promoted from the global Idea Bank modal
  useEffect(() => {
    const handleIdeasUpdated = () => {
      fetchTrackerData(
        activeContentType?.id || selectedTypeId,
        horizonMonths,
        currentView,
        activeBrand?.id || selectedBrandId
      );
    };
    window.addEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
    return () =>
      window.removeEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
  }, [activeContentType?.id, selectedTypeId, horizonMonths, currentView, activeBrand?.id, selectedBrandId]);

  // Handler: Update Title (Auto-claims ID & Marks Ideation Done OR Reverts on Clear)
  const handleUpdateTitle = async (row: MatrixRowItem, newTitle: string) => {
    if (!activeContentType) return;

    try {
      const res = await fetch("/api/tracker/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type_id: activeContentType.id,
          item_id: row.id,
          publish_date: row.publish_date,
          title: newTitle,
        }),
      });

      if (res.ok) {
        await fetchTrackerData(activeContentType.id, horizonMonths, currentView);
      }
    } catch (err) {
      console.error("Error updating title:", err);
    }
  };

  // Handler: Swap Slots
  const handleSwapSlots = async (sourceRow: MatrixRowItem, targetRow: MatrixRowItem) => {
    if (!activeContentType) return;

    try {
      const res = await fetch("/api/tracker/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: sourceRow.id,
          target_item_id: targetRow.id,
          target_publish_date: targetRow.publish_date,
          content_type_id: activeContentType.id,
        }),
      });

      if (res.ok) {
        await fetchTrackerData(activeContentType.id, horizonMonths, currentView);
      }
    } catch (err) {
      console.error("Error swapping slots:", err);
    }
  };

  // Handler: Toggle Action Item
  const handleToggleActionItem = async (itemId: string, actionItemId: string) => {
    try {
      await fetch("/api/tracker/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          toggle_id: actionItemId,
        }),
      });
      await fetchTrackerData(activeContentType?.id, horizonMonths, currentView);
    } catch (err) {
      console.error("Error toggling action item:", err);
    }
  };

  // Handler: Add Action Item
  const handleAddActionItem = async (itemId: string, text: string) => {
    try {
      await fetch("/api/tracker/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          text,
        }),
      });
      await fetchTrackerData(activeContentType?.id, horizonMonths, currentView);
    } catch (err) {
      console.error("Error adding action item:", err);
    }
  };

  // Handler: Update Task Status with Strict Sequential Validation Check
  const handleUpdateTaskStatus = async (
    itemId: string,
    taskName: string,
    newStatus: TaskStatus,
    publishedUrl?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeContentType) return { success: false, error: "Active pipeline not found" };

    try {
      const res = await fetch("/api/tracker/task-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_item_id: itemId,
          item_id: itemId,
          task_name: taskName,
          status: newStatus,
          published_url: publishedUrl,
          content_type_id: activeContentType.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to update task status" };
      }

      await fetchTrackerData(activeContentType.id, horizonMonths, currentView);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error updating task status" };
    }
  };

  // Handler: Update Published Content Link
  const handleUpdatePublishedUrl = async (itemId: string, publishedUrl: string | null) => {
    try {
      const res = await fetch("/api/tracker/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          published_url: publishedUrl,
        }),
      });
      if (res.ok) {
        await fetchTrackerData(activeContentType?.id, horizonMonths, currentView);
      }
    } catch (err) {
      console.error("Error updating published content link:", err);
    }
  };

  // Handler: Toggle Misc Task Checkbox
  const handleToggleMiscTask = async (itemId: string, taskName: string, isDone: boolean) => {
    try {
      await fetch("/api/tracker/misc-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_item_id: itemId,
          item_id: itemId,
          task_name: taskName,
          is_done: isDone,
        }),
      });
      await fetchTrackerData(activeContentType?.id, horizonMonths, currentView);
    } catch (err) {
      console.error("Error toggling misc task:", err);
    }
  };

  // Handler: Archive or Unarchive Content Item
  const handleArchiveItem = async (
    itemId: string,
    action: "archive" | "unarchive"
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/tracker/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          action,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || (data.missing_requirements ? `Missing: ${data.missing_requirements.join(", ")}` : "Cannot archive"),
        };
      }

      await fetchTrackerData(activeContentType?.id, horizonMonths, currentView);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  };

  // Chained Brand -> Content Series selectors
  const seriesForActiveBrand = activeBrand
    ? contentTypes.filter((t) => t.brand_id === activeBrand.id)
    : contentTypes;

  const handleBrandChange = (nextBrandId: string) => {
    const firstSeries = contentTypes.find((t) => t.brand_id === nextBrandId);
    if (firstSeries) {
      router.push(`/index?brand=${nextBrandId}&type=${firstSeries.id}`);
    } else {
      router.push(`/index?brand=${nextBrandId}`);
    }
  };

  const handleSeriesChange = (nextSeriesId: string) => {
    const brandQuery = activeBrand?.id ? `brand=${activeBrand.id}&` : "";
    router.push(`/index?${brandQuery}type=${nextSeriesId}`);
  };

  return (
    <div className="h-[calc(100dvh-65px)] flex flex-col w-full overflow-hidden">
      {/* Consolidated Frosted Command Bar */}
      <div className="shrink-0 mx-2 sm:mx-4 mt-2 sm:mt-3 mb-1.5 sm:mb-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl glass-nav border border-border shadow-sm flex flex-wrap items-center justify-between gap-2 sm:gap-3 relative z-30">
        {/* Left: Title + Badge + Chained Brand -> Content Series Selector */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <h1 className="font-bold text-sm sm:text-base tracking-tight text-foreground">Index</h1>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold tracking-wider bg-primary/15 text-primary border border-primary/25">
              {currentView === "archive" ? "Archive Vault" : "Matrix Board"}
            </span>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block shrink-0" />

          {/* Chained Brand -> Series Dropdowns */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
            {/* Brand Dropdown */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/25"
                style={{ backgroundColor: activeBrand?.color || "#6366f1" }}
                aria-hidden="true"
              />
              <span className="hidden md:inline text-[11px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                Brand:
              </span>
              <select
                value={activeBrand?.id || ""}
                onChange={(e) => handleBrandChange(e.target.value)}
                aria-label="Select Brand"
                className="h-8 px-2 sm:px-2.5 rounded-xl text-xs font-semibold font-mono glass-input cursor-pointer max-w-[125px] sm:max-w-[175px] truncate"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-muted-foreground/50 text-xs font-mono hidden sm:inline">/</span>

            {/* Content Series Dropdown */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="hidden md:inline text-[11px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                Series:
              </span>
              <select
                value={activeContentType?.id || ""}
                onChange={(e) => handleSeriesChange(e.target.value)}
                disabled={seriesForActiveBrand.length === 0}
                aria-label="Select Content Series"
                className="h-8 px-2 sm:px-2.5 rounded-xl text-xs font-semibold font-mono glass-input cursor-pointer max-w-[130px] sm:max-w-[195px] truncate disabled:opacity-60"
              >
                {seriesForActiveBrand.length === 0 ? (
                  <option value="">No series</option>
                ) : (
                  seriesForActiveBrand.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.prefix ? `(${t.prefix})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Right Tools: View Toggle + Horizon Window Switcher + Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 6-Month Publish Calendar Icon Button */}
          <button
            type="button"
            onClick={() => {
              if (calendarMode === "closed") {
                setCalendarMode("docked");
              } else if (calendarMode === "minimized") {
                setCalendarMode("floating");
              } else {
                setCalendarMode("closed");
              }
            }}
            className={`p-2 rounded-xl transition-all duration-250 cursor-pointer flex items-center justify-center border ${
              calendarMode !== "closed"
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "glass-subtle text-muted-foreground hover:text-foreground"
            }`}
            title="Next 6 Months Publish Calendar"
            aria-label="Next 6 Months Publish Calendar"
          >
            <CalendarDays className="w-4 h-4" />
          </button>

          {/* View Mode Toggle: Active vs Archive */}
          {(isCreator || indexPermissions?.archive !== "none") && (
            <div className="flex items-center p-1 rounded-xl glass-subtle text-xs font-mono gap-0.5">
              <button
                type="button"
                onClick={() => setCurrentView("active")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-250 flex items-center gap-1.5 cursor-pointer ${
                  currentView === "active"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Active</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView("archive")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-250 flex items-center gap-1.5 cursor-pointer ${
                  currentView === "archive"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderArchive className="w-3 h-3" />
                <span>Archive</span>
              </button>
            </div>
          )}

          {/* Horizon Switcher (1M - 6M) */}
          <div className="flex items-center gap-0.5 p-1 rounded-xl glass-subtle text-xs font-mono">
            <Calendar className="w-3 h-3 text-muted-foreground ml-1.5 mr-1" />
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <button
                key={m}
                onClick={() => setHorizonMonths(m)}
                className={`px-2 py-0.5 rounded-lg text-[11px] transition-all duration-250 cursor-pointer ${
                  horizonMonths === m
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}M
              </button>
            ))}
          </div>

          {/* Add Custom Placeholder Button */}
          {(isCreator || canInputIdeation) && currentView === "active" && (
            <button
              type="button"
              onClick={() => {
                setAddPlaceholderDate(undefined);
                setIsAddPlaceholderOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold glass-subtle text-foreground hover:border-primary/40 flex items-center gap-1.5 transition-all duration-250 cursor-pointer shadow-xs"
              title="Add a custom placeholder on a custom publish date"
            >
              <PlusCircle className="w-3.5 h-3.5 text-primary" />
              <span>+ Placeholder</span>
            </button>
          )}

          {/* Publish Dates Organizer Button */}
          {isCreator && currentView === "active" && (
            <button
              type="button"
              onClick={() => setIsOrganizerOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25 flex items-center gap-1.5 transition-all duration-250 cursor-pointer shadow-xs"
              title="Reorganize upcoming placeholders according to current cadence schedule"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Organize Dates</span>
            </button>
          )}
        </div>

        {/* 6-Month Publish Calendar: Docked or Floating View */}
        {calendarMode !== "closed" && activeContentType && (
          <PublishCalendar
            contentTypeId={activeContentType.id}
            contentTypeName={activeContentType.name}
            mode={calendarMode}
            onModeChange={setCalendarMode}
            onSelectDate={(dateStr, item) => {
              if (!item) {
                setAddPlaceholderDate(dateStr);
                setIsAddPlaceholderOpen(true);
              }
            }}
          />
        )}
      </div>

      {/* Main Board Body (Single Scroller) */}
      <main ref={mainRef} className="flex-1 min-h-0 overflow-auto w-full px-2 sm:px-4 pb-14 sm:pb-4 relative">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="font-mono text-xs text-muted-foreground">
              Calculating dual target dates and loading matrix...
            </span>
          </div>
        ) : activeContentType ? (
          <MatrixTable
            rows={matrixRows}
            workflowTasks={activeContentType.workflow_tasks || []}
            miscTasks={activeContentType.misc_tasks || []}
            contentTypeId={activeContentType.id}
            isCreator={isCreator}
            canInputIdeation={canInputIdeation}
            canChangePublish={canChangePublish}
            indexPermissions={indexPermissions}
            onUpdateTitle={handleUpdateTitle}
            onSwapSlots={handleSwapSlots}
            onToggleActionItem={handleToggleActionItem}
            onAddActionItem={handleAddActionItem}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onUpdatePublishedUrl={handleUpdatePublishedUrl}
            onToggleMiscTask={handleToggleMiscTask}
            onArchiveItem={handleArchiveItem}
            onDeletePlaceholder={(row) => setDeletingRow(row)}
            onChangePublishDate={(row) => setChangingPublishDateRow(row)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
            No active Content Series found{activeBrand ? ` for ${activeBrand.name}` : ""}. Please visit Settings to create a Content Series.
          </div>
        )}
      </main>

      {/* Floating Horizontal Scroller for Narrow Screens */}
      {hScroll.hasOverflow && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full glass-floating border border-border shadow-xl w-[min(92vw,340px)]">
          <button
            type="button"
            onClick={() => mainRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Scroll table left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={0}
            max={hScroll.max}
            value={Math.min(hScroll.left, hScroll.max)}
            onChange={(e) => {
              if (mainRef.current) {
                mainRef.current.scrollLeft = Number(e.target.value);
              }
            }}
            aria-label="Horizontal table scroller"
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <button
            type="button"
            onClick={() => mainRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Scroll table right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Custom Placeholder Modal */}
      {isAddPlaceholderOpen && activeContentType && (
        <AddPlaceholderModal
          isOpen={isAddPlaceholderOpen}
          onClose={() => setIsAddPlaceholderOpen(false)}
          contentType={activeContentType}
          initialDate={addPlaceholderDate}
          existingRows={matrixRows}
          onPlaceholderAdded={() => fetchTrackerData()}
        />
      )}

      {/* Delete Placeholder / Content Tiered Confirmation Modal */}
      {deletingRow && activeContentType && (
        <DeletePlaceholderModal
          isOpen={!!deletingRow}
          onClose={() => setDeletingRow(null)}
          row={deletingRow}
          contentTypeId={activeContentType.id}
          contentSeriesName={activeContentType.name}
          brandName={activeContentType.brand?.name || activeBrand?.name}
          brandColor={activeContentType.brand?.color || activeBrand?.color}
          onDeleted={() => {
            setDeletingRow(null);
            fetchTrackerData();
          }}
        />
      )}

      {/* Change Publish Date Double Confirmation Modal */}
      {changingPublishDateRow && activeContentType && (
        <ChangePublishDateModal
          isOpen={!!changingPublishDateRow}
          onClose={() => setChangingPublishDateRow(null)}
          row={changingPublishDateRow}
          contentTypeId={activeContentType.id}
          contentSeriesName={activeContentType.name}
          brandName={activeContentType.brand?.name || activeBrand?.name}
          brandColor={activeContentType.brand?.color || activeBrand?.color}
          onUpdated={() => {
            setChangingPublishDateRow(null);
            fetchTrackerData();
          }}
        />
      )}

      {/* Publish Dates Organizer Modal */}
      {isOrganizerOpen && activeContentType && (
        <PublishDatesOrganizerModal
          isOpen={isOrganizerOpen}
          onClose={() => setIsOrganizerOpen(false)}
          contentType={activeContentType}
          onOrganized={() => fetchTrackerData()}
        />
      )}
    </div>
  );
}

export default function IndexPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-mono text-xs">
          Loading matrix board...
        </div>
      }
    >
      <IndexContent />
    </Suspense>
  );
}
