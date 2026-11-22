"use client";

import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { StorageCleanupView, StorageCleanupItem } from "@/components/content/storage-cleanup-view";
import {
  getSessionCache,
  hydrateSessionCacheFromStorage,
  setSessionCache,
} from "@/lib/session-cache";

interface StorageCleanupCache {
  items: StorageCleanupItem[];
  totalUsageBytes: number;
}

const STORAGE_CACHE_KEY = "storage-cleanup";

export default function StorageCleanupPage() {
  const initialCache = getSessionCache<StorageCleanupCache>(STORAGE_CACHE_KEY);

  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StorageCleanupItem[]>(initialCache?.items || []);
  const [totalUsageBytes, setTotalUsageBytes] = useState(
    initialCache?.totalUsageBytes || 0
  );

  const fetchStorageData = async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch("/api/storage-cleanup");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load storage cleanup data");
      }
      const data = await res.json();
      const nextItems = data.items || [];
      const nextBytes = data.totalDriveUsageBytes || 0;
      setItems(nextItems);
      setTotalUsageBytes(nextBytes);
      setSessionCache<StorageCleanupCache>(STORAGE_CACHE_KEY, {
        items: nextItems,
        totalUsageBytes: nextBytes,
      });
    } catch (err: any) {
      console.error("Error loading storage cleanup:", err);
      if (!options?.silent) {
        setError(err.message || "Failed to load storage data");
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const cached =
      getSessionCache<StorageCleanupCache>(STORAGE_CACHE_KEY) ||
      hydrateSessionCacheFromStorage<StorageCleanupCache>(STORAGE_CACHE_KEY);
    if (cached) {
      setItems(cached.items || []);
      setTotalUsageBytes(cached.totalUsageBytes || 0);
      setLoading(false);
      fetchStorageData({ silent: true });
    } else {
      fetchStorageData();
    }
  }, []);

  const handleDeleteItemTarget = async (
    itemId: string,
    target: "raw_footage" | "draft_iterations" | "final_export"
  ) => {
    const res = await fetch("/api/storage-cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_item_id: itemId,
        target,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Deletion failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="font-mono text-xs text-muted-foreground">
          Calculating Google Drive storage usage across projects...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card-theme p-8 max-w-md text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <h3 className="font-bold text-sm">Storage Cleanup Restricted</h3>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <StorageCleanupView
      items={items}
      totalUsageBytes={totalUsageBytes}
      onDeleteItemTarget={handleDeleteItemTarget}
      onRefresh={() => fetchStorageData({ silent: true })}
    />
  );
}
