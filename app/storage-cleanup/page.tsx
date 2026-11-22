"use client";

import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { StorageCleanupView, StorageCleanupItem } from "@/components/content/storage-cleanup-view";

export default function StorageCleanupPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StorageCleanupItem[]>([]);
  const [totalUsageBytes, setTotalUsageBytes] = useState(0);

  const fetchStorageData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/storage-cleanup");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load storage cleanup data");
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotalUsageBytes(data.totalDriveUsageBytes || 0);
    } catch (err: any) {
      console.error("Error loading storage cleanup:", err);
      setError(err.message || "Failed to load storage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageData();
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
      onRefresh={fetchStorageData}
    />
  );
}
