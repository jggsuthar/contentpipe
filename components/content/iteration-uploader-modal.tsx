"use client";

import React, { useState } from "react";
import { UploadCloud, X, Loader2, FileVideo, Image as ImageIcon } from "lucide-react";

interface IterationUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowTasks: string[];
  defaultTask?: string;
  nextVersion: string;
  onSubmitIteration: (data: {
    task_name: string;
    version: string;
    file_url: string;
    file_name: string;
    file_type: "video" | "image";
    file_size_bytes: number;
    drive_file_id?: string;
  }) => Promise<void>;
}

export function IterationUploaderModal({
  isOpen,
  onClose,
  workflowTasks,
  defaultTask = "Edit",
  nextVersion = "V1",
  onSubmitIteration,
}: IterationUploaderModalProps) {
  const [taskName, setTaskName] = useState(defaultTask);
  const [version, setVersion] = useState(nextVersion);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState<"video" | "image">("video");
  const [sizeMb, setSizeMb] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const bytes = (parseFloat(sizeMb) || 0) * 1024 * 1024;
      await onSubmitIteration({
        task_name: taskName,
        version: version.trim() || nextVersion,
        file_url: fileUrl.trim(),
        file_name: fileName.trim(),
        file_type: fileType,
        file_size_bytes: bytes,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-floating rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-xs">Submit Deliverable Iteration</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Upload and submit a new deliverable iteration for review. Tracker workflow task statuses remain strictly manual.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Task selector & Version */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Workflow Task
              </label>
              <select
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-xl glass-input cursor-pointer font-mono text-xs"
              >
                {workflowTasks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Version Tag
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="V1, V2, etc."
                className="w-full h-9 px-2.5 rounded-xl glass-input font-mono text-xs"
              />
            </div>
          </div>

          {/* Deliverable Type: Video vs Image */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Deliverable Media Type
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFileType("video")}
                className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border cursor-pointer ${
                  fileType === "video"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-border"
                }`}
              >
                <FileVideo className="w-3.5 h-3.5" />
                <span>Video Cut (MP4/WebM)</span>
              </button>
              <button
                type="button"
                onClick={() => setFileType("image")}
                className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border cursor-pointer ${
                  fileType === "image"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-border"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Image / Thumbnail</span>
              </button>
            </div>
          </div>

          {/* File Name */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">File Name</label>
            <input
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. Rough_Cut_V1.mp4 or Thumbnail_Option_A.png"
              className="w-full h-8 px-2.5 rounded bg-background border border-border focus:outline-none focus:border-primary"
              style={{ borderRadius: "var(--radius)" }}
            />
          </div>

          {/* File Stream URL or Google Drive link */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Direct Stream URL / Google Drive Preview Link
            </label>
            <input
              type="text"
              required
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... or direct .mp4/.webm URL"
              className="w-full h-8 px-2.5 rounded bg-background border border-border focus:outline-none focus:border-primary"
              style={{ borderRadius: "var(--radius)" }}
            />
          </div>

          {/* Approx File Size */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              Approx. Size (MB)
            </label>
            <input
              type="number"
              value={sizeMb}
              onChange={(e) => setSizeMb(e.target.value)}
              placeholder="e.g. 450"
              className="w-full h-8 px-2.5 rounded bg-background border border-border focus:outline-none focus:border-primary"
              style={{ borderRadius: "var(--radius)" }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground cursor-pointer"
              style={{ borderRadius: "var(--radius)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!fileName.trim() || !fileUrl.trim() || isSubmitting}
              className="px-3.5 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
              style={{ borderRadius: "var(--radius)" }}
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit for Review</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
