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
  AlertTriangle,
  X,
} from "lucide-react";
import { TaskStatus } from "@/types/database";
import {
  getSessionCache,
  hydrateSessionCacheFromStorage,
  setSessionCache,
  invalidateDashboardCache,
} from "@/lib/session-cache";
import {
  getBrandUrlSegment,
  getSeriesUrlSegment,
} from "@/lib/slug-utils";
import {
  validateSequentialDependency,
  checkArchiveEligibility,
  WorkflowTaskDefinition,
} from "@/lib/task-engine";

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

interface TrackerCacheSnapshot {
  brands: BrandOption[];
  activeBrand: BrandOption | null;
  contentTypes: ContentSeriesOption[];
  activeContentType: any;
  matrixRows: MatrixRowItem[];
  isCreator: boolean;
  canInputIdeation: boolean;
  canChangePublish: boolean;
  indexPermissions: any;
  horizonMonths: number;
}

function getTrackerCacheKey(
  brandId: string | null,
  typeId: string | null,
  view: "active" | "archive"
) {
  return `tracker:${brandId || "default"}:${typeId || "default"}:${view}`;
}

interface IndexBoardProps {
  brandParam?: string | null;
  seriesParam?: string | null;
}

function IndexContent({ brandParam = null, seriesParam = null }: IndexBoardProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [routeBrand, setRouteBrand] = useState<string | null>(
    brandParam ?? searchParams?.get("brand") ?? null
  );
  const [routeSeries, setRouteSeries] = useState<string | null>(
    seriesParam ?? searchParams?.get("type") ?? null
  );

  useEffect(() => {
    if (brandParam !== null || seriesParam !== null) {
      setRouteBrand(brandParam);
      setRouteSeries(seriesParam);
    }
  }, [brandParam, seriesParam]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/tracker")) {
      setRouteBrand(searchParams?.get("brand") ?? null);
      setRouteSeries(searchParams?.get("type") ?? null);
    }
  }, [searchParams]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith("/index")) {
        const parts = path.split("/").filter(Boolean); // ["index", brand?, series?]
        setRouteBrand(parts[1] ? decodeURIComponent(parts[1]) : null);
        setRouteSeries(parts[2] ? decodeURIComponent(parts[2]) : null);
      } else if (path.startsWith("/tracker")) {
        const sp = new URLSearchParams(window.location.search);
        setRouteBrand(sp.get("brand"));
        setRouteSeries(sp.get("type"));
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectedBrandId = routeBrand;
  const selectedTypeId = routeSeries;
  const initialCache = getSessionCache<TrackerCacheSnapshot>(
    getTrackerCacheKey(selectedBrandId, selectedTypeId, "active")
  );

  const [loading, setLoading] = useState(!initialCache);
  const [isSwitchingSeries, setIsSwitchingSeries] = useState(false);
  const fetchSequenceRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>(initialCache?.brands || []);
  const [activeBrand, setActiveBrand] = useState<BrandOption | null>(
    initialCache?.activeBrand || null
  );
  const [contentTypes, setContentTypes] = useState<ContentSeriesOption[]>(
    initialCache?.contentTypes || []
  );
  const [activeContentType, setActiveContentType] = useState<any>(
    initialCache?.activeContentType || null
  );
  const [matrixRows, setMatrixRows] = useState<MatrixRowItem[]>(
    initialCache?.matrixRows || []
  );
  const [horizonMonths, setHorizonMonths] = useState<number | null>(
    initialCache?.horizonMonths ?? 6
  );
  const [currentView, setCurrentView] = useState<"active" | "archive">("active");
  const [isCreator, setIsCreator] = useState<boolean>(initialCache?.isCreator ?? true);
  const [canInputIdeation, setCanInputIdeation] = useState<boolean>(
    initialCache?.canInputIdeation ?? true
  );
  const [canChangePublish, setCanChangePublish] = useState<boolean>(
    initialCache?.canChangePublish ?? true
  );
  const [indexPermissions, setIndexPermissions] = useState<any>(
    initialCache?.indexPermissions || null
  );

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

  // ---------------------------------------------------------------------------
  // Optimistic Queue + Temp-ID Resolution + Sync Status State (Ideas 1, 3, 4)
  // ---------------------------------------------------------------------------
  const matrixRowsRef = useRef<MatrixRowItem[]>(initialCache?.matrixRows || []);
  const rowQueuesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const resolvedIdMapRef = useRef<Map<string, string>>(new Map());
  const queueKeyAliasRef = useRef<Map<string, string>>(new Map());
  const pendingMutationsRef = useRef<number>(0);
  const mutationEpochRef = useRef<number>(0);

  const [pendingMutationsCount, setPendingMutationsCount] = useState(0);
  const [showSavedBadge, setShowSavedBadge] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync ref + SWR session cache wrapper so rapid clicks and tab switches stay in sync
  const applyRowsUpdate = (updater: (prev: MatrixRowItem[]) => MatrixRowItem[]) => {
    const next = updater(matrixRowsRef.current);
    matrixRowsRef.current = next;
    setMatrixRows(next);
    if (activeContentType) {
      const snapshot: TrackerCacheSnapshot = {
        brands,
        activeBrand,
        contentTypes,
        activeContentType,
        matrixRows: next,
        isCreator,
        canInputIdeation,
        canChangePublish,
        indexPermissions,
        horizonMonths: horizonMonths ?? 6,
      };
      setSessionCache(
        getTrackerCacheKey(selectedBrandId, selectedTypeId, currentView),
        snapshot
      );
      if (activeBrand?.id || activeContentType?.id) {
        setSessionCache(
          getTrackerCacheKey(activeBrand?.id || null, activeContentType?.id || null, currentView),
          snapshot
        );
      }
    }
  };

  // Resolve placeholder/temp ID to its real database ID if created earlier in queue
  const resolveItemId = (id: string): string => {
    let current = id;
    const seen = new Set<string>();
    while (resolvedIdMapRef.current.has(current) && !seen.has(current)) {
      seen.add(current);
      current = resolvedIdMapRef.current.get(current)!;
    }
    return current;
  };

  // Resolve canonical queue key so newly resolved real IDs chain onto the same FIFO queue
  const resolveQueueKey = (id: string): string => {
    let current = id;
    const seen = new Set<string>();
    while (queueKeyAliasRef.current.has(current) && !seen.has(current)) {
      seen.add(current);
      current = queueKeyAliasRef.current.get(current)!;
    }
    return current;
  };

  // Protect against accidental tab close / reload while background writes are in flight
  useEffect(() => {
    if (pendingMutationsCount <= 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingMutationsCount]);

  // Synchronously recompute derived Publish state & Archive eligibility from optimistic row
  const recomputeRowDerivedState = (row: MatrixRowItem, seriesConfig: any): MatrixRowItem => {
    if (!seriesConfig || !row.publish_date) return row;

    const workflowDefs: WorkflowTaskDefinition[] = (seriesConfig.workflow_tasks || []).map(
      (t: any) => ({
        id: t.id,
        task_name: t.task_name,
        sequence_order: t.sequence_order,
        n_days_offset: t.n_days_offset,
        team_buffer_days: t.team_buffer_days,
        team_final_buffer_days: t.team_final_buffer_days,
        is_hidden: t.is_hidden,
        color: t.color,
        update_mode: t.update_mode || "manual",
        automation_trigger: t.automation_trigger || null,
        automation_role_id: t.automation_role_id || null,
        require_closure_link: Boolean(t.require_closure_link),
      })
    );

    const visibleTasks = [...workflowDefs]
      .filter((t) => !t.is_hidden)
      .sort((a, b) => a.sequence_order - b.sequence_order);

    const taskInstances = [...(row.task_instances || [])];
    for (const wt of workflowDefs) {
      if (!taskInstances.some((ti) => ti.task_name.toLowerCase() === wt.task_name.toLowerCase())) {
        const dates = row.task_target_dates?.[wt.task_name.toLowerCase()];
        taskInstances.push({
          id: `opt_${row.id}_${wt.task_name.toLowerCase()}`,
          task_name: wt.task_name,
          status:
            wt.task_name.toLowerCase() === "ideation" && row.title.trim().length > 0
              ? "done"
              : "not_done",
          target_date_worst_case: dates?.worst_case || null,
          target_date_team: dates?.team || null,
          target_date_team_1st: dates?.team_1st || null,
          target_date_team_final: dates?.team_final || null,
        });
      }
    }

    // Re-evaluate automatic 'Publish' status
    const publishTaskDef = visibleTasks.find((t) => t.task_name.toLowerCase() === "publish");
    if (publishTaskDef) {
      const publishIdx = visibleTasks.findIndex((t) => t.id === publishTaskDef.id);
      const priorTasks = visibleTasks.slice(0, publishIdx);
      let allPriorDone = true;
      for (const prior of priorTasks) {
        const priorKey = prior.task_name.toLowerCase();
        if (priorKey === "ideation") {
          if (!row.title || !row.title.trim()) {
            allPriorDone = false;
            break;
          }
        } else {
          const inst = taskInstances.find((ti) => ti.task_name.toLowerCase() === priorKey);
          if (inst?.status !== "done") {
            allPriorDone = false;
            break;
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const itemPubDate = new Date(row.publish_date);
      itemPubDate.setHours(0, 0, 0, 0);
      const isPublishDone = allPriorDone && today.getTime() >= itemPubDate.getTime();

      const pubIdx = taskInstances.findIndex((ti) => ti.task_name.toLowerCase() === "publish");
      if (pubIdx >= 0) {
        taskInstances[pubIdx] = {
          ...taskInstances[pubIdx],
          status: isPublishDone ? "done" : "not_done",
        };
      }
    }

    const currentStatuses = taskInstances.map((ti) => ({
      task_name: ti.task_name,
      status:
        ti.task_name.toLowerCase() === "ideation" && row.title.trim().length > 0
          ? "done"
          : ti.status,
    }));

    const eligibility = checkArchiveEligibility(
      row.publish_date,
      workflowDefs,
      currentStatuses,
      row.misc_tasks_status || [],
      seriesConfig.misc_tasks || []
    );

    return {
      ...row,
      task_instances: taskInstances,
      is_archive_eligible: eligibility.isEligible,
      archive_missing_requirements: eligibility.missingRequirements,
    };
  };

  const fetchTrackerData = async (
    typeId?: string | null,
    horizon?: number | null,
    view: "active" | "archive" = currentView,
    brandId?: string | null,
    options?: { silent?: boolean; expectedEpoch?: number }
  ) => {
    const seq = ++fetchSequenceRef.current;
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    try {
      if (!options?.silent) {
        if (matrixRowsRef.current.length === 0) {
          setLoading(true);
        } else {
          setIsSwitchingSeries(true);
        }
      }
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

      const res = await fetch(url, { signal: controller.signal });
      if (seq !== fetchSequenceRef.current) {
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (seq !== fetchSequenceRef.current) {
          return;
        }
        // If new optimistic mutations started during this silent GET, discard stale snapshot
        if (
          options?.silent &&
          (pendingMutationsRef.current > 0 ||
            (options.expectedEpoch !== undefined &&
              options.expectedEpoch !== mutationEpochRef.current))
        ) {
          return;
        }
        setBrands(data.brands || []);
        setActiveBrand(data.activeBrand || null);
        setContentTypes(data.contentTypes || []);
        setActiveContentType(data.activeContentType);
        const rows = data.matrixRows || [];
        matrixRowsRef.current = rows;
        setMatrixRows(rows);
        setIsCreator(data.isCreator ?? true);
        setCanInputIdeation(data.canInputIdeation ?? (data.isCreator ?? true));
        setCanChangePublish(data.canChangePublish ?? (data.isCreator ?? true));
        setIndexPermissions(data.indexPermissions || null);
        const resolvedHorizon =
          horizon === null || horizon === undefined
            ? data.horizonMonths || data.defaultMonthsOpen || 6
            : horizon;
        if (horizon === null || horizon === undefined) {
          setHorizonMonths(resolvedHorizon);
        }

        // Persist fresh snapshot to SWR cache (under exact requested key, resolved IDs, and slug URL keys)
        const snapshot: TrackerCacheSnapshot = {
          brands: data.brands || [],
          activeBrand: data.activeBrand || null,
          contentTypes: data.contentTypes || [],
          activeContentType: data.activeContentType,
          matrixRows: rows,
          isCreator: data.isCreator ?? true,
          canInputIdeation: data.canInputIdeation ?? (data.isCreator ?? true),
          canChangePublish: data.canChangePublish ?? (data.isCreator ?? true),
          indexPermissions: data.indexPermissions || null,
          horizonMonths: resolvedHorizon,
        };
        setSessionCache(
          getTrackerCacheKey(queryBrand || null, queryType || null, view),
          snapshot
        );
        if (data.activeBrand?.id || data.activeContentType?.id) {
          setSessionCache(
            getTrackerCacheKey(
              data.activeBrand?.id || null,
              data.activeContentType?.id || null,
              view
            ),
            snapshot
          );
        }
        if (data.activeBrand && data.activeContentType) {
          const bSeg = getBrandUrlSegment(data.activeBrand);
          const sSeg = getSeriesUrlSegment(data.activeContentType);
          setSessionCache(getTrackerCacheKey(bSeg, sSeg, view), snapshot);

          // Normalize bare /index or /index/[brand] URL cleanly to /index/brand/series
          if (typeof window !== "undefined") {
            const p = window.location.pathname;
            if (p === "/index" || p === "/index/" || p === `/index/${bSeg}`) {
              window.history.replaceState(null, "", `/index/${bSeg}/${sSeg}`);
            }
          }
        }
        // Also warm default key when viewing the default Brand's first series so navbar /index hits 0ms
        if (
          !getSessionCache(getTrackerCacheKey(null, null, view)) ||
          (!queryBrand && !queryType)
        ) {
          setSessionCache(getTrackerCacheKey(null, null, view), snapshot);
        }
      } else if (res.status === 403 && view === "archive") {
        setCurrentView("active");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      console.error("Error fetching tracker data:", err);
    } finally {
      if (seq === fetchSequenceRef.current) {
        setLoading(false);
        setIsSwitchingSeries(false);
      }
    }
  };

  // Per-row strict FIFO mutation queue runner
  const enqueueRowMutation = (
    rowKeyId: string,
    seriesIdSnapshot: string | undefined,
    horizonSnapshot: number | null,
    viewSnapshot: "active" | "archive",
    brandIdSnapshot: string | undefined,
    taskFn: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    const queueKey = resolveQueueKey(rowKeyId);
    const epoch = ++mutationEpochRef.current;

    pendingMutationsRef.current += 1;
    setPendingMutationsCount(pendingMutationsRef.current);
    setShowSavedBadge(false);
    setSyncError(null);
    invalidateDashboardCache();
    if (savedBadgeTimeoutRef.current) {
      clearTimeout(savedBadgeTimeoutRef.current);
      savedBadgeTimeoutRef.current = null;
    }

    const prevPromise = rowQueuesRef.current.get(queueKey) ?? Promise.resolve(true);

    const nextPromise = prevPromise
      .then(async (prevSucceeded) => {
        // Cancel downstream queued steps for this row if an upstream step failed
        if (!prevSucceeded) {
          return false;
        }
        const result = await taskFn();
        if (!result.ok) {
          setSyncError(result.error || "Failed to sync changes. Refreshing board...");
          return false;
        }
        return true;
      })
      .catch((err: any) => {
        console.error("Row mutation queue error:", err);
        setSyncError(err?.message || "Network error while syncing changes.");
        return false;
      })
      .finally(() => {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
        setPendingMutationsCount(pendingMutationsRef.current);

        // Coalesced background sync only once all pending queues across the board drain
        if (pendingMutationsRef.current === 0) {
          if (rowQueuesRef.current.get(queueKey) === nextPromise) {
            rowQueuesRef.current.delete(queueKey);
          }
          setShowSavedBadge(true);
          invalidateDashboardCache();
          savedBadgeTimeoutRef.current = setTimeout(() => {
            setShowSavedBadge(false);
          }, 2200);

          void fetchTrackerData(seriesIdSnapshot, horizonSnapshot, viewSnapshot, brandIdSnapshot, {
            silent: true,
            expectedEpoch: epoch,
          });
        }
      });

    rowQueuesRef.current.set(queueKey, nextPromise);
  };

  useEffect(() => {
    resolvedIdMapRef.current.clear();
    queueKeyAliasRef.current.clear();

    const cacheKey = getTrackerCacheKey(selectedBrandId, selectedTypeId, currentView);
    const cached =
      getSessionCache<TrackerCacheSnapshot>(cacheKey) ||
      hydrateSessionCacheFromStorage<TrackerCacheSnapshot>(cacheKey);

    if (cached && cached.activeContentType) {
      setBrands(cached.brands || []);
      setActiveBrand(cached.activeBrand || null);
      setContentTypes(cached.contentTypes || []);
      setActiveContentType(cached.activeContentType);
      matrixRowsRef.current = cached.matrixRows || [];
      setMatrixRows(cached.matrixRows || []);
      setIsCreator(cached.isCreator ?? true);
      setCanInputIdeation(cached.canInputIdeation ?? true);
      setCanChangePublish(cached.canChangePublish ?? true);
      setIndexPermissions(cached.indexPermissions || null);
      setLoading(false);

      // Revalidate silently in background so screen renders in 0ms
      fetchTrackerData(selectedTypeId, horizonMonths, currentView, selectedBrandId, {
        silent: true,
      });
    } else {
      fetchTrackerData(selectedTypeId, horizonMonths, currentView, selectedBrandId);
    }
  }, [selectedBrandId, selectedTypeId, horizonMonths, currentView]);

  // Refresh matrix silently when an Idea Bank item is promoted from the global Idea Bank modal
  useEffect(() => {
    const handleIdeasUpdated = () => {
      fetchTrackerData(
        activeContentType?.id || selectedTypeId,
        horizonMonths,
        currentView,
        activeBrand?.id || selectedBrandId,
        { silent: true }
      );
    };
    window.addEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
    return () =>
      window.removeEventListener("contentpipe:ideas-updated", handleIdeasUpdated);
  }, [activeContentType?.id, selectedTypeId, horizonMonths, currentView, activeBrand?.id, selectedBrandId]);

  // Handler: Update Title (Optimistic 0ms + Queue + Temp-ID Resolution Map)
  const handleUpdateTitle = async (row: MatrixRowItem, newTitle: string) => {
    if (!activeContentType) return;

    const clean = newTitle.trim();
    const seriesSnapshot = activeContentType;
    const queueKey = resolveQueueKey(row.id);

    // Immediate optimistic UI update + recompute Ideation / Archive eligibility
    applyRowsUpdate((prev) =>
      prev.map((r) => {
        if (r.id !== row.id && r.id !== resolveItemId(row.id)) return r;
        const updatedRow: MatrixRowItem = !clean
          ? {
              ...r,
              title: "",
              unique_content_id: null,
              is_placeholder: true,
            }
          : {
              ...r,
              title: clean,
              is_placeholder: false,
            };
        return recomputeRowDerivedState(updatedRow, seriesSnapshot);
      })
    );

    enqueueRowMutation(
      queueKey,
      seriesSnapshot.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const targetId = resolveItemId(row.id);
        const res = await fetch("/api/tracker/item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_type_id: seriesSnapshot.id,
            item_id: targetId,
            publish_date: row.publish_date,
            title: newTitle,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: data.error || "Failed to update video title" };
        }

        // Map placeholder ID -> real DB ID so subsequent queued steps use the real ID
        if (data && data.id) {
          if (targetId !== data.id) {
            resolvedIdMapRef.current.set(targetId, data.id);
            queueKeyAliasRef.current.set(data.id, queueKey);
          }

          applyRowsUpdate((prev) =>
            prev.map((r) => {
              if (r.id !== targetId && r.id !== row.id) return r;
              const merged: MatrixRowItem = {
                ...r,
                id: data.id,
                title: data.title ?? clean,
                unique_content_id: data.unique_content_id ?? r.unique_content_id,
                is_placeholder: Boolean(data.is_placeholder),
              };
              return recomputeRowDerivedState(merged, seriesSnapshot);
            })
          );
        }

        return { ok: true };
      }
    );
  };

  // Handler: Swap Slots
  const handleSwapSlots = async (sourceRow: MatrixRowItem, targetRow: MatrixRowItem) => {
    if (!activeContentType) return;

    try {
      const res = await fetch("/api/tracker/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_item_id: resolveItemId(sourceRow.id),
          target_item_id: resolveItemId(targetRow.id),
          target_publish_date: targetRow.publish_date,
          content_type_id: activeContentType.id,
        }),
      });

      if (res.ok) {
        await fetchTrackerData(activeContentType.id, horizonMonths, currentView, undefined, {
          silent: true,
        });
      }
    } catch (err) {
      console.error("Error swapping slots:", err);
    }
  };

  // Handler: Toggle Action Item (Optimistic 0ms + Queue)
  const handleToggleActionItem = async (itemId: string, actionItemId: string) => {
    const targetRowId = resolveItemId(itemId);

    applyRowsUpdate((prev) =>
      prev.map((r) =>
        r.id === itemId || r.id === targetRowId
          ? {
              ...r,
              custom_action_items: r.custom_action_items.map((a) =>
                a.id === actionItemId ? { ...a, is_closed: !a.is_closed } : a
              ),
            }
          : r
      )
    );

    enqueueRowMutation(
      itemId,
      activeContentType?.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/action-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: realId,
            toggle_id: actionItemId,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.error || "Failed to toggle action item" };
        }
        return { ok: true };
      }
    );
  };

  // Handler: Add Action Item (Optimistic 0ms + Queue)
  const handleAddActionItem = async (itemId: string, text: string) => {
    const targetRowId = resolveItemId(itemId);
    const tempActionId = `temp_${Date.now()}`;

    applyRowsUpdate((prev) =>
      prev.map((r) =>
        r.id === itemId || r.id === targetRowId
          ? {
              ...r,
              custom_action_items: [
                ...r.custom_action_items,
                { id: tempActionId, text, is_closed: false },
              ],
            }
          : r
      )
    );

    enqueueRowMutation(
      itemId,
      activeContentType?.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/action-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: realId,
            text,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.error || "Failed to add action item" };
        }
        return { ok: true };
      }
    );
  };

  // Handler: Update Task Status with Synchronous Local Sequential Check + Per-Row FIFO Queue
  const handleUpdateTaskStatus = async (
    itemId: string,
    taskName: string,
    newStatus: TaskStatus,
    publishedUrl?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeContentType) return { success: false, error: "Active pipeline not found" };

    const seriesSnapshot = activeContentType;
    const resolvedId = resolveItemId(itemId);
    const currentRow = matrixRowsRef.current.find(
      (r) => r.id === itemId || r.id === resolvedId
    );

    if (!currentRow || currentRow.is_placeholder) {
      return {
        success: false,
        error: "Please register a video title first before updating task statuses.",
      };
    }

    // Synchronous 0ms sequential dependency check against current optimistic state
    if (newStatus === "done") {
      const workflowDefs: WorkflowTaskDefinition[] = (seriesSnapshot.workflow_tasks || []).map(
        (t: any) => ({
          id: t.id,
          task_name: t.task_name,
          sequence_order: t.sequence_order,
          n_days_offset: t.n_days_offset,
          team_buffer_days: t.team_buffer_days,
          team_final_buffer_days: t.team_final_buffer_days,
          is_hidden: t.is_hidden,
          color: t.color,
          update_mode: t.update_mode || "manual",
          automation_trigger: t.automation_trigger || null,
          automation_role_id: t.automation_role_id || null,
          require_closure_link: Boolean(t.require_closure_link),
        })
      );

      const currentStatuses = (currentRow.task_instances || []).map((ti) => ({
        task_name: ti.task_name,
        status: ti.status,
      }));
      if (
        currentRow.title.trim().length > 0 &&
        !currentStatuses.some((s) => s.task_name.toLowerCase() === "ideation")
      ) {
        currentStatuses.push({ task_name: "Ideation", status: "done" });
      } else {
        const idx = currentStatuses.findIndex((s) => s.task_name.toLowerCase() === "ideation");
        if (idx >= 0 && currentRow.title.trim().length > 0) {
          currentStatuses[idx].status = "done";
        }
      }

      const depCheck = validateSequentialDependency(taskName, workflowDefs, currentStatuses);
      if (!depCheck.allowed) {
        return { success: false, error: depCheck.reason };
      }
    }

    // Apply optimistic task status + recompute Publish / Archive eligibility in 0ms
    applyRowsUpdate((prev) =>
      prev.map((r) => {
        if (r.id !== itemId && r.id !== resolvedId) return r;
        const hasTask = r.task_instances.some(
          (ti) => ti.task_name.toLowerCase() === taskName.toLowerCase()
        );
        const updatedInstances = hasTask
          ? r.task_instances.map((ti) =>
              ti.task_name.toLowerCase() === taskName.toLowerCase()
                ? { ...ti, status: newStatus }
                : ti
            )
          : [
              ...r.task_instances,
              {
                id: `opt_${r.id}_${taskName.toLowerCase()}`,
                task_name: taskName,
                status: newStatus,
                target_date_worst_case:
                  r.task_target_dates?.[taskName.toLowerCase()]?.worst_case || null,
                target_date_team: r.task_target_dates?.[taskName.toLowerCase()]?.team || null,
                target_date_team_1st:
                  r.task_target_dates?.[taskName.toLowerCase()]?.team_1st || null,
                target_date_team_final:
                  r.task_target_dates?.[taskName.toLowerCase()]?.team_final || null,
              },
            ];

        return recomputeRowDerivedState(
          {
            ...r,
            published_url: publishedUrl !== undefined ? publishedUrl : r.published_url,
            task_instances: updatedInstances,
          },
          seriesSnapshot
        );
      })
    );

    // Enqueue background network write strictly in FIFO order for this row
    enqueueRowMutation(
      itemId,
      seriesSnapshot.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/task-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_item_id: realId,
            item_id: realId,
            task_name: taskName,
            status: newStatus,
            published_url: publishedUrl,
            content_type_id: seriesSnapshot.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: data.error || "Failed to update task status" };
        }
        return { ok: true };
      }
    );

    return { success: true };
  };

  // Handler: Update Published Content Link (Optimistic 0ms + Queue)
  const handleUpdatePublishedUrl = async (itemId: string, publishedUrl: string | null) => {
    const resolvedId = resolveItemId(itemId);

    applyRowsUpdate((prev) =>
      prev.map((r) =>
        r.id === itemId || r.id === resolvedId ? { ...r, published_url: publishedUrl } : r
      )
    );

    enqueueRowMutation(
      itemId,
      activeContentType?.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/item", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: realId,
            published_url: publishedUrl,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.error || "Failed to update content URL" };
        }
        return { ok: true };
      }
    );
  };

  // Handler: Toggle Misc Task Checkbox (Optimistic 0ms + Archive Recompute + Queue)
  const handleToggleMiscTask = async (itemId: string, taskName: string, isDone: boolean) => {
    const resolvedId = resolveItemId(itemId);
    const seriesSnapshot = activeContentType;

    applyRowsUpdate((prev) =>
      prev.map((r) => {
        if (r.id !== itemId && r.id !== resolvedId) return r;
        const exists = r.misc_tasks_status.some(
          (m) => m.task_name.toLowerCase() === taskName.toLowerCase()
        );
        const updatedMisc = exists
          ? r.misc_tasks_status.map((m) =>
              m.task_name.toLowerCase() === taskName.toLowerCase()
                ? { ...m, is_done: isDone }
                : m
            )
          : [...r.misc_tasks_status, { task_name: taskName, is_done: isDone }];
        return recomputeRowDerivedState({ ...r, misc_tasks_status: updatedMisc }, seriesSnapshot);
      })
    );

    enqueueRowMutation(
      itemId,
      seriesSnapshot?.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/misc-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_item_id: realId,
            item_id: realId,
            task_name: taskName,
            is_done: isDone,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { ok: false, error: data.error || "Failed to update misc task" };
        }
        return { ok: true };
      }
    );
  };

  // Handler: Archive or Unarchive Content Item (Optimistic 0ms + Queue)
  const handleArchiveItem = async (
    itemId: string,
    action: "archive" | "unarchive"
  ): Promise<{ success: boolean; error?: string }> => {
    const resolvedId = resolveItemId(itemId);
    const currentRow = matrixRowsRef.current.find(
      (r) => r.id === itemId || r.id === resolvedId
    );

    if (action === "archive" && currentRow && !currentRow.is_archive_eligible) {
      return {
        success: false,
        error:
          currentRow.archive_missing_requirements && currentRow.archive_missing_requirements.length > 0
            ? `Missing: ${currentRow.archive_missing_requirements.join(", ")}`
            : "Cannot archive until all workflow tasks, misc tasks, and publish date pass.",
      };
    }

    applyRowsUpdate((prev) =>
      prev.filter((r) => r.id !== itemId && r.id !== resolvedId)
    );

    enqueueRowMutation(
      itemId,
      activeContentType?.id,
      horizonMonths,
      currentView,
      activeBrand?.id,
      async () => {
        const realId = resolveItemId(itemId);
        const res = await fetch("/api/tracker/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_item_id: realId,
            action,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            error:
              data.error ||
              (data.missing_requirements
                ? `Missing: ${data.missing_requirements.join(", ")}`
                : "Cannot archive item"),
          };
        }
        return { ok: true };
      }
    );

    return { success: true };
  };

  // Chained Brand -> Content Series selectors
  const seriesForActiveBrand = activeBrand
    ? contentTypes.filter((t) => t.brand_id === activeBrand.id)
    : contentTypes;

  const handleBrandChange = (nextBrandId: string) => {
    const targetBrand = brands.find((b) => b.id === nextBrandId) || null;
    const firstSeries = contentTypes.find((t) => t.brand_id === nextBrandId) || null;
    const bSeg = targetBrand ? getBrandUrlSegment(targetBrand) : nextBrandId;

    if (targetBrand) setActiveBrand(targetBrand);
    if (firstSeries) {
      const sSeg = getSeriesUrlSegment(firstSeries);
      setActiveContentType((prev: any) => (prev ? { ...prev, id: firstSeries.id, name: firstSeries.name } : firstSeries));
      const nextUrl = `/index/${bSeg}/${sSeg}`;
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", nextUrl);
      }
      setRouteBrand(bSeg);
      setRouteSeries(sSeg);
    } else {
      const nextUrl = `/index/${bSeg}`;
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", nextUrl);
      }
      setRouteBrand(bSeg);
      setRouteSeries(null);
    }
  };

  const handleSeriesChange = (nextSeriesId: string) => {
    const targetSeries = contentTypes.find((t) => t.id === nextSeriesId) || null;
    const currentBrand =
      activeBrand ||
      (targetSeries?.brand_id ? brands.find((b) => b.id === targetSeries.brand_id) : null) ||
      null;
    const bSeg = currentBrand ? getBrandUrlSegment(currentBrand) : selectedBrandId || "";
    const sSeg = targetSeries ? getSeriesUrlSegment(targetSeries) : nextSeriesId;

    if (targetSeries) {
      setActiveContentType((prev: any) =>
        prev ? { ...prev, id: targetSeries.id, name: targetSeries.name } : targetSeries
      );
    }

    const nextUrl = bSeg ? `/index/${bSeg}/${sSeg}` : `/index`;
    if (typeof window !== "undefined" && bSeg) {
      window.history.pushState(null, "", nextUrl);
    }
    if (bSeg) setRouteBrand(bSeg);
    setRouteSeries(sSeg);
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
            {isSwitchingSeries && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-muted text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Switching...</span>
              </span>
            )}
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

        {/* Right Tools: Sync Status + View Toggle + Horizon Window Switcher + Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {pendingMutationsCount > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30"
              title="Saving changes in order to cloud database"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Syncing ({pendingMutationsCount})</span>
            </span>
          ) : showSavedBadge ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 animate-in fade-in duration-150">
              <CheckCircle2 className="w-3 h-3" />
              <span>Saved</span>
            </span>
          ) : null}

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

      {/* Background Sync Error Banner */}
      {syncError && (
        <div className="shrink-0 mx-2 sm:mx-4 mb-2 px-3 py-2 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="p-1 rounded-lg hover:bg-destructive/15 cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
          onPlaceholderAdded={() => {
            invalidateDashboardCache();
            fetchTrackerData(undefined, undefined, currentView, undefined, { silent: true });
          }}
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
            invalidateDashboardCache();
            setDeletingRow(null);
            fetchTrackerData(undefined, undefined, currentView, undefined, { silent: true });
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
            invalidateDashboardCache();
            setChangingPublishDateRow(null);
            fetchTrackerData(undefined, undefined, currentView, undefined, { silent: true });
          }}
        />
      )}

      {/* Publish Dates Organizer Modal */}
      {isOrganizerOpen && activeContentType && (
        <PublishDatesOrganizerModal
          isOpen={isOrganizerOpen}
          onClose={() => setIsOrganizerOpen(false)}
          contentType={activeContentType}
          onOrganized={() => {
            invalidateDashboardCache();
            fetchTrackerData(undefined, undefined, currentView, undefined, { silent: true });
          }}
        />
      )}
    </div>
  );
}

export function IndexBoard({ brandParam = null, seriesParam = null }: IndexBoardProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center font-mono text-xs">
          Loading matrix board...
        </div>
      }
    >
      <IndexContent brandParam={brandParam} seriesParam={seriesParam} />
    </Suspense>
  );
}
