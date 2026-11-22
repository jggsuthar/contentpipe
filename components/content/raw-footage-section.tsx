"use client";

import React, { useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import {
  Folder,
  FolderPlus,
  UploadCloud,
  FileVideo,
  FileAudio,
  FileImage,
  FileArchive,
  File as FileIcon,
  Download,
  Trash2,
  ExternalLink,
  X,
  Play,
  Film,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { DriveFolders, DriveFileItem } from "@/types/database";

interface RawFootageSectionProps {
  contentId: string;
  contentTitle?: string;
  rawFootageUploaded: boolean;
  driveFolders: DriveFolders;
  canUploadRaw: boolean;
  canDeleteRaw: boolean;
  onToggleRawFootageUploaded: (isDone: boolean) => Promise<void>;
}

export function RawFootageSection({
  contentId,
  contentTitle,
  rawFootageUploaded,
  driveFolders,
  canUploadRaw,
  canDeleteRaw,
  onToggleRawFootageUploaded,
}: RawFootageSectionProps) {
  // Root defaults to the Content Project Folder (main_folder_id), with raw_footage_id as fallback
  const rootFolderId = driveFolders.main_folder_id || driveFolders.raw_footage_id || "";
  const rootFolderName = contentTitle || "Content Folder";

  const [activeFolderId, setActiveFolderId] = useState<string>(rootFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    ...(rootFolderId ? [{ id: rootFolderId, name: rootFolderName }] : []),
  ]);

  // Files & Sync state
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderAccess, setCurrentFolderAccess] = useState<"none" | "view" | "edit">("edit");

  // Effective permission for active folder
  const canEditInCurrentFolder = canUploadRaw && currentFolderAccess === "edit";

  // Uploading state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    current: number;
    currentFileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New folder modal state
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // File Preview modal
  const [previewItem, setPreviewItem] = useState<DriveFileItem | null>(null);

  // Declaration state
  const [isTogglingDeclared, setIsTogglingDeclared] = useState(false);

  // Track initial auto-sync execution per content item
  const lastLoadedFolderRef = useRef<string | null>(null);

  // Sort helper: strictly folders first, then files alphabetically (A-Z)
  const sortDriveItems = (items: DriveFileItem[]) => {
    return [...items].sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
  };

  // Auto-sync immediately when landing on page or refreshing
  useEffect(() => {
    const rootId = driveFolders.main_folder_id || driveFolders.raw_footage_id;
    if (!rootId) return;

    const loadKey = `${contentId}-${rootId}`;
    if (lastLoadedFolderRef.current !== loadKey) {
      lastLoadedFolderRef.current = loadKey;
      setActiveFolderId(rootId);
      setBreadcrumbs([{ id: rootId, name: rootFolderName }]);
      loadFolderContents(rootId);
    }
  }, [contentId, driveFolders.main_folder_id, driveFolders.raw_footage_id, rootFolderName]);

  const loadFolderContents = async (folderId: string, isManualSync = false) => {
    if (!folderId) return;
    if (isManualSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(
        `/api/content/${contentId}/drive-files?folderId=${encodeURIComponent(folderId)}&_t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load Drive contents");
      }

      const sorted = sortDriveItems(data.files || []);
      setFiles(sorted);
      if (data.folderAccess) {
        setCurrentFolderAccess(data.folderAccess);
      }

      // Update current breadcrumb label if server returned a verified folder name
      if (data.folderName) {
        setBreadcrumbs((prev) => {
          if (prev.length === 0) return [{ id: folderId, name: data.folderName }];
          const last = prev[prev.length - 1];
          if (last && last.id === folderId && last.name !== data.folderName) {
            const next = [...prev];
            next[next.length - 1] = { id: folderId, name: data.folderName };
            return next;
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error("Error loading Drive files:", err);
      setError(err.message || "Failed to load Google Drive folder");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // Automatic Sync: 1. On tab focus (user returns from Google Drive tab)
  useEffect(() => {
    const handleFocus = () => {
      const currentId = activeFolderId || rootFolderId;
      if (currentId) {
        loadFolderContents(currentId, true);
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeFolderId, rootFolderId]);

  // Automatic Sync: 2. On document visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const currentId = activeFolderId || rootFolderId;
        if (currentId) {
          loadFolderContents(currentId, true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [activeFolderId, rootFolderId]);

  // Automatic Sync: 3. Periodic background poll every 12 seconds when document is visible
  useEffect(() => {
    const currentId = activeFolderId || rootFolderId;
    if (!currentId) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadFolderContents(currentId, true);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [activeFolderId, rootFolderId]);

  // Subfolder navigation
  const handleOpenFolder = (folder: DriveFileItem) => {
    if (folder.id === activeFolderId) return;

    const existingIndex = breadcrumbs.findIndex((c) => c.id === folder.id);
    if (existingIndex >= 0) {
      handleBreadcrumbClick(existingIndex);
      return;
    }

    const nextBreadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    setBreadcrumbs(nextBreadcrumbs);
    setActiveFolderId(folder.id);
    loadFolderContents(folder.id);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    if (target.id === activeFolderId && index === breadcrumbs.length - 1) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setActiveFolderId(target.id);
    loadFolderContents(target.id);
  };

  const handleGoBack = () => {
    if (breadcrumbs.length <= 1) return;
    handleBreadcrumbClick(breadcrumbs.length - 2);
  };

  // Quick jump directly to Raw_Footage folder
  const handleJumpToRawFootage = () => {
    if (!driveFolders.raw_footage_id || activeFolderId === driveFolders.raw_footage_id) return;
    const rootId = driveFolders.main_folder_id || "";

    if (rootId && rootId !== driveFolders.raw_footage_id) {
      setBreadcrumbs([
        { id: rootId, name: rootFolderName },
        { id: driveFolders.raw_footage_id, name: "Raw_Footage" },
      ]);
    } else {
      setBreadcrumbs([
        { id: driveFolders.raw_footage_id, name: "Raw_Footage" },
      ]);
    }
    setActiveFolderId(driveFolders.raw_footage_id);
    loadFolderContents(driveFolders.raw_footage_id);
  };

  // Quick jump to Main Content Folder root
  const handleJumpToRoot = () => {
    const rootId = driveFolders.main_folder_id || driveFolders.raw_footage_id || "";
    if (!rootId || activeFolderId === rootId) return;
    setBreadcrumbs([{ id: rootId, name: rootFolderName }]);
    setActiveFolderId(rootId);
    loadFolderContents(rootId);
  };

  // Upload handler
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0 || !canEditInCurrentFolder) return;
    const filesToUpload = Array.from(fileList);
    const targetFolder = activeFolderId || rootFolderId;

    if (!targetFolder) {
      setError("No target Google Drive folder available");
      return;
    }

    setError(null);
    setUploadProgress({
      total: filesToUpload.length,
      current: 0,
      currentFileName: filesToUpload[0].name,
    });

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress({
          total: filesToUpload.length,
          current: i + 1,
          currentFileName: file.name,
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folderId", targetFolder);

        const res = await fetch(`/api/content/${contentId}/upload-asset`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to upload ${file.name}`);
        }
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Upload failed");
    } finally {
      setUploadProgress(null);
      // Refresh current directory
      loadFolderContents(targetFolder);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Create subfolder handler
  const handleCreateSubfolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !canUploadRaw) return;

    setIsCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentId}/drive-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentFolderId: activeFolderId || rootFolderId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create folder");
      }

      setNewFolderName("");
      setFolderModalOpen(false);
      loadFolderContents(activeFolderId || rootFolderId);
    } catch (err: any) {
      setError(err.message || "Failed to create subfolder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Delete file handler
  const handleDeleteFile = async (fileId: string) => {
    if (!canEditInCurrentFolder) return;
    if (!confirm("Are you sure you want to delete this file from Google Drive?")) return;

    try {
      const res = await fetch(`/api/content/${contentId}/raw-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          drive_file_id: fileId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete file");
      }

      loadFolderContents(activeFolderId || rootFolderId);
    } catch (err: any) {
      setError(err.message || "Failed to delete file");
    }
  };

  // Declare / Undeclare
  const handleToggleDeclared = async () => {
    setIsTogglingDeclared(true);
    try {
      await onToggleRawFootageUploaded(!rawFootageUploaded);
    } finally {
      setIsTogglingDeclared(false);
    }
  };

  // Size formatter
  const formatSize = (bytes?: number) => {
    if (!bytes && bytes !== 0) return "—";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  // Helper for direct download URL
  const getDownloadUrl = (item: DriveFileItem) => {
    if (item.directDownloadUrl) return item.directDownloadUrl;
    const isLarge = Boolean(item.sizeBytes && item.sizeBytes > 100 * 1024 * 1024);
    if (isLarge) {
      return `https://drive.usercontent.google.com/download?id=${item.id}&export=download&confirm=t`;
    }
    return `https://drive.google.com/uc?export=download&id=${item.id}`;
  };

  // Icon selector
  const getFileIcon = (item: DriveFileItem) => {
    if (item.isFolder) {
      return <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />;
    }
    const mime = item.mimeType?.toLowerCase() || "";
    const name = item.name.toLowerCase();

    if (
      mime.startsWith("video/") ||
      name.endsWith(".mp4") ||
      name.endsWith(".mov") ||
      name.endsWith(".mkv") ||
      name.endsWith(".m4v")
    ) {
      return <FileVideo className="w-4 h-4 text-purple-400 shrink-0" />;
    }
    if (
      mime.startsWith("audio/") ||
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".aac")
    ) {
      return <FileAudio className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (
      mime.startsWith("image/") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    ) {
      return <FileImage className="w-4 h-4 text-blue-400 shrink-0" />;
    }
    if (
      name.endsWith(".zip") ||
      name.endsWith(".rar") ||
      name.endsWith(".7z") ||
      name.endsWith(".tar")
    ) {
      return <FileArchive className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    return <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  const isCurrentFolderRoot = activeFolderId === rootFolderId;
  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || "Raw_Footage";

  return (
    <div
      className={`card-theme p-5 rounded-2xl space-y-4 relative transition-all duration-250 ${
        isDragging ? "ring-2 ring-primary ring-offset-2 bg-primary/5" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canUploadRaw) setIsDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canUploadRaw) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (canUploadRaw && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Hidden File Input for Upload Button */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleUploadFiles(e.target.files);
          }
        }}
      />

      {/* Drag Overlay Feedback */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-background/90 backdrop-blur-xs flex flex-col items-center justify-center border-2 border-dashed border-primary rounded-md p-6 pointer-events-none">
          <UploadCloud className="w-12 h-12 text-primary animate-bounce mb-2" />
          <h4 className="font-bold text-sm text-foreground">Drop files to upload</h4>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Uploading directly to Google Drive: /{currentFolderName}
          </p>
        </div>
      )}

      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border">
        {/* Left: Title & Live Drive Sync Info */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">
                Raw Footage & Assets
              </h3>
              {rawFootageUploaded ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Uploaded Done
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground bg-muted border border-border">
                  Pending Upload
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              Live Google Drive Sync • {files.filter((f) => f.isFolder).length} folders, {files.filter((f) => !f.isFolder).length} files in /{currentFolderName}
            </p>
          </div>
        </div>

        {/* Right: Actions Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Declare / Undeclare Button */}
          {canUploadRaw && (
            rawFootageUploaded ? (
              <button
                type="button"
                onClick={handleToggleDeclared}
                disabled={isTogglingDeclared}
                className="px-2.5 py-1 rounded text-[11px] font-mono bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Revert raw footage declaration back to pending"
              >
                {isTogglingDeclared ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                )}
                <span>Undeclare</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleDeclared}
                disabled={isTogglingDeclared}
                className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                style={{ borderRadius: "var(--radius)" }}
                title="Declare that all raw footages have been uploaded"
              >
                {isTogglingDeclared ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Declare Raw Footage Done</span>
              </button>
            )
          )}

          {/* Sync from Google Drive */}
          <button
            type="button"
            onClick={() => loadFolderContents(activeFolderId || rootFolderId, true)}
            disabled={syncing || loading}
            className="p-1.5 rounded text-xs font-mono bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border flex items-center gap-1 transition-colors cursor-pointer"
            title="Refresh & sync files from Google Drive"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline text-[11px]">{syncing ? "Syncing..." : "Sync"}</span>
          </button>

          {/* New Subfolder */}
          {canEditInCurrentFolder && (
            <button
              type="button"
              onClick={() => setFolderModalOpen(true)}
              className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1.5 cursor-pointer transition-colors"
              style={{ borderRadius: "var(--radius)" }}
              title="Create a new subfolder in Google Drive"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
              <span>+ New Folder</span>
            </button>
          )}

          {/* Upload Button */}
          {canEditInCurrentFolder && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(uploadProgress)}
              className="px-3 py-1 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              style={{ borderRadius: "var(--radius)" }}
              title="Upload files to this Drive folder"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload</span>
            </button>
          )}

          {/* Open Active Folder in Google Drive */}
          {activeFolderId && (
            <a
              href={`https://drive.google.com/drive/folders/${activeFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded text-[11px] font-mono bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border flex items-center gap-1 transition-colors"
              title="Open current directory in Google Drive"
            >
              <Folder className="w-3 h-3 text-amber-500" />
              <span className="hidden sm:inline">Drive</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
        </div>
      </div>

      {/* Directory Breadcrumbs Bar & Quick Switchers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded bg-muted/30 border border-border/80 text-xs font-mono">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1 min-w-0">
          {!isCurrentFolderRoot && (
            <button
              type="button"
              onClick={handleGoBack}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground mr-1 cursor-pointer"
              title="Back to parent folder"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.id || "crumb"}-${idx}`}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`px-1.5 py-0.5 rounded transition-colors truncate max-w-[200px] ${
                    isLast
                      ? "font-bold text-foreground bg-muted/80 cursor-default"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  }`}
                  title={crumb.name}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Quick Folder Switchers */}
        <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
          {driveFolders.main_folder_id && (
            <button
              type="button"
              onClick={handleJumpToRoot}
              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer border ${
                activeFolderId === driveFolders.main_folder_id
                  ? "bg-primary/15 text-primary border-primary/30 font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
              }`}
              title="Jump to Main Content Folder root"
            >
              <Folder className="w-3 h-3 text-amber-500" />
              <span>Content Root</span>
            </button>
          )}

          {driveFolders.raw_footage_id && (
            <button
              type="button"
              onClick={handleJumpToRawFootage}
              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer border ${
                activeFolderId === driveFolders.raw_footage_id
                  ? "bg-primary/15 text-primary border-primary/30 font-semibold"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
              }`}
              title="Jump directly to Raw_Footage folder"
            >
              <Film className="w-3 h-3 text-purple-400" />
              <span>Raw_Footage</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Progress Bar */}
      {uploadProgress && (
        <div className="p-3 rounded-md bg-primary/10 border border-primary/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-primary flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Uploading to Google Drive: {uploadProgress.currentFileName}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {uploadProgress.current} / {uploadProgress.total}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-destructive/80 hover:text-destructive cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-mono">Syncing with Google Drive...</span>
        </div>
      ) : files.length === 0 ? (
        /* Empty state */
        <div
          onClick={() => canEditInCurrentFolder && fileInputRef.current?.click()}
          className={`py-12 px-4 text-center border border-dashed border-border/80 rounded-md bg-muted/10 transition-colors ${
            canEditInCurrentFolder ? "cursor-pointer hover:bg-muted/20" : ""
          }`}
        >
          {canEditInCurrentFolder ? (
            <UploadCloud className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          ) : (
            <Folder className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          )}
          <p className="text-xs font-medium text-foreground">
            No files or folders found in /{currentFolderName}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground mt-1">
            {canEditInCurrentFolder
              ? "Click to upload files, or drag and drop files from your computer"
              : "Files uploaded to this folder will appear here (view-only access)"}
          </p>
        </div>
      ) : (
        /* File & Folder Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {files.map((item) => {
            const isFolder = item.isFolder;
            const downloadUrl = getDownloadUrl(item);
            const isLarge = Boolean(item.sizeBytes && item.sizeBytes > 100 * 1024 * 1024);

            return (
              <div
                key={item.id}
                className={`p-2.5 rounded-md border border-border transition-all flex items-center justify-between gap-2.5 text-xs ${
                  isFolder
                    ? "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20 cursor-pointer"
                    : "bg-background/60 hover:bg-muted/30"
                }`}
                style={{ borderRadius: "var(--radius)" }}
                onClick={() => {
                  if (isFolder) handleOpenFolder(item);
                }}
              >
                {/* Left: Icon & Name */}
                <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                      isFolder
                        ? "bg-amber-500/15"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {getFileIcon(item)}
                  </div>

                  <div className="overflow-hidden flex-1 min-w-0">
                    <div
                      className="font-medium truncate text-xs text-foreground"
                      title={item.name}
                    >
                      {item.name}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      {isFolder ? (
                        <span className="text-amber-500 font-semibold">Folder</span>
                      ) : (
                        <>
                          <span>{formatSize(item.sizeBytes)}</span>
                          {item.createdTime && (
                            <>
                              <span>•</span>
                              <span>
                                {new Date(item.createdTime).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* File preview button (video/image) */}
                  {!isFolder && (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      title="Preview file"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Direct Download Link */}
                  {!isFolder && (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      title={
                        isLarge
                          ? "Direct Download (Large File - Virus Scan Bypassed)"
                          : "Direct Download"
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Open in Drive */}
                  {item.webViewLink && (
                    <a
                      href={item.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      title={isFolder ? "Open folder in Google Drive" : "View in Google Drive"}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Delete Button */}
                  {canEditInCurrentFolder && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(item.id)}
                      className="p-1.5 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded cursor-pointer transition-colors"
                      title="Delete from Google Drive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Folder Modal */}
      {folderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-xs uppercase tracking-wide">
                  New Subfolder in /{currentFolderName}
                </h3>
              </div>
              <button
                onClick={() => setFolderModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubfolder} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Day 01 - A Roll, B-Roll, Drone..."
                  className="w-full h-9 px-3 rounded-xl glass-input text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(false)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim() || isCreatingFolder}
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  style={{ borderRadius: "var(--radius)" }}
                >
                  {isCreatingFolder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Subfolder</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video / File Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating rounded-2xl w-full max-w-4xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2 overflow-hidden">
                {getFileIcon(previewItem)}
                <h4 className="font-bold text-xs truncate max-w-md">
                  {previewItem.name}
                </h4>
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({formatSize(previewItem.sizeBytes)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getDownloadUrl(previewItem)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded text-xs font-mono bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
                  title="Direct download"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Embedded Google Drive Streaming Preview */}
            <div className="w-full aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
              <iframe
                src={`https://drive.google.com/file/d/${previewItem.id}/preview`}
                className="w-full h-full border-0"
                allow="autoplay"
                title={previewItem.name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
