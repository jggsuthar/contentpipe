"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Loader2, AlertCircle, Lock, KeyRound, HardDrive } from "lucide-react";
import { ContentHeader } from "@/components/content/content-header";
import { RawFootageSection } from "@/components/content/raw-footage-section";
import { VideoReviewPlayer } from "@/components/content/video-review-player";
import { IterationUploaderModal } from "@/components/content/iteration-uploader-modal";
import { DriveFolders, RawAssetItem, DbSubmission } from "@/types/database";

export default function ContentHubPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);

  // Content Hub State
  const [contentItem, setContentItem] = useState<any>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolders>({});
  const [rawAssets, setRawAssets] = useState<RawAssetItem[]>([]);
  const [rawFootageUploaded, setRawFootageUploaded] = useState<boolean>(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [workflowTasks, setWorkflowTasks] = useState<string[]>([]);
  const [feedbackCategories, setFeedbackCategories] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<any>({
    canUploadRaw: false,
    canDeleteRaw: false,
    canSubmit: false,
    canApprove: false,
    isCreator: false,
    assignedTask: "Edit",
    userEmail: "",
  });

  // Uploader Modal state
  const [uploaderOpen, setUploaderOpen] = useState(false);

  const fetchContentData = async () => {
    try {
      setLoading(true);
      setError(null);
      setNeedsDriveAuth(false);
      const res = await fetch(`/api/content/${contentId}`);
      if (!res.ok) {
        const data = await res.json();
        if (data.needsDriveAuth || data.error === "DRIVE_AUTHORIZATION_REQUIRED") {
          setNeedsDriveAuth(true);
          return;
        }
        throw new Error(data.error || "Failed to load content hub");
      }
      const data = await res.json();
      setContentItem(data.contentItem);
      setDriveFolders(data.driveFolders || {});
      setRawAssets(data.rawAssets || []);
      setRawFootageUploaded(Boolean(data.contentItem?.raw_footage_uploaded));
      setSubmissions(data.submissions || []);
      setWorkflowTasks(data.workflowTasks || ["Edit", "Thumbnail"]);
      setFeedbackCategories(data.feedbackCategories || []);
      setUserPermissions(data.userPermissions || {});
    } catch (err: any) {
      console.error("Error fetching content hub data:", err);
      setError(err.message || "Failed to load content hub");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContentData();
  }, [contentId]);

  // Handlers for Raw Assets
  const handleAddRawAsset = async (data: {
    name: string;
    file_url?: string;
    drive_file_id?: string;
    size_bytes?: number;
    folder_type: "raw" | "b_roll";
  }) => {
    const res = await fetch(`/api/content/${contentId}/raw-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ...data }),
    });
    if (res.ok) {
      const resp = await res.json();
      setRawAssets(resp.rawAssets);
    }
  };

  const handleDeleteRawAsset = async (assetId: string) => {
    const res = await fetch(`/api/content/${contentId}/raw-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", asset_id: assetId }),
    });
    if (res.ok) {
      const resp = await res.json();
      setRawAssets(resp.rawAssets);
    }
  };

  const handleToggleRawFootageUploaded = async (isDone: boolean) => {
    try {
      const res = await fetch(`/api/content/${contentId}/raw-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone }),
      });
      if (res.ok) {
        setRawFootageUploaded(isDone);
        setContentItem((prev: any) =>
          prev ? { ...prev, raw_footage_uploaded: isDone } : prev
        );
      }
    } catch (err) {
      console.error("Failed to update raw footage status:", err);
    }
  };

  // Handlers for Iterations
  const handleSubmitIteration = async (data: {
    task_name: string;
    version: string;
    file_url: string;
    file_name: string;
    file_type: "video" | "image";
    file_size_bytes: number;
    drive_file_id?: string;
  }) => {
    const res = await fetch(`/api/content/${contentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  // Handlers for Review Comments
  const handleAddComment = async (data: {
    submission_id: string;
    timestamp_seconds?: number | null;
    marker_x?: number | null;
    marker_y?: number | null;
    category: string;
    severity: "minor" | "critical";
    text: string;
  }) => {
    const res = await fetch(`/api/content/${contentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ...data }),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  const handleToggleResolveComment = async (commentId: string) => {
    const res = await fetch(`/api/content/${contentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_resolve", comment_id: commentId }),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await fetch(`/api/content/${contentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", comment_id: commentId }),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  // Handlers for Review Approval / Revisions
  const handleApproveSubmission = async (submissionId: string) => {
    const res = await fetch(`/api/content/${contentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, action: "approve" }),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  const handleRequestRevision = async (submissionId: string) => {
    const res = await fetch(`/api/content/${contentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, action: "request_revision" }),
    });
    if (res.ok) {
      await fetchContentData();
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:p-8">
      {loading ? (
        <div className="card-theme p-16 text-center my-auto flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-mono text-xs text-muted-foreground">
            Synchronizing Google Drive folders and loading Content Hub...
          </span>
        </div>
      ) : needsDriveAuth ? (
        <div className="card-theme p-8 text-center my-auto max-w-md mx-auto space-y-5 border border-border shadow-xl rounded-lg">
          <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-500 mx-auto flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bold text-sm text-foreground">
              Google Drive Authorization Required
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To access the Content Hub and synchronize your footage and project files, the Creator must grant full Google Drive access permissions.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: window.location.pathname })}
              className="w-full py-2.5 px-4 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
            >
              <KeyRound className="w-4 h-4" />
              <span>Connect Google Drive with Full Permissions</span>
            </button>

            <Link
              href="/tracker"
              className="inline-block text-xs text-muted-foreground hover:text-foreground font-mono transition-colors pt-1"
            >
              ← Return to Index
            </Link>
          </div>
        </div>
      ) : error ? (
        <div className="card-theme p-8 text-center my-auto max-w-md mx-auto space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <h2 className="font-bold text-sm">Failed to Load Content Hub</h2>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/tracker")}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            style={{ borderRadius: "var(--radius)" }}
          >
            Return to Index
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <ContentHeader
            contentItem={contentItem}
            driveFolders={driveFolders}
            isCreator={userPermissions.isCreator}
          />

          {/* Main Body */}
          <main className="w-full max-w-7xl mx-auto my-6 flex-1 space-y-6">
            {/* Section 1: Raw Footage & B-Roll Assets */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Section 1: Production Assets & Camera Footage (SPEC.md Section 6.2)
                </span>
              </div>
              <RawFootageSection
                contentId={contentId}
                contentTitle={
                  contentItem?.unique_content_id && contentItem?.title
                    ? `${contentItem.unique_content_id} - ${contentItem.title}`
                    : contentItem?.title || contentItem?.unique_content_id || "Content Folder"
                }
                rawFootageUploaded={rawFootageUploaded}
                driveFolders={driveFolders}
                canUploadRaw={userPermissions.canUploadRaw}
                canDeleteRaw={userPermissions.canDeleteRaw}
                onToggleRawFootageUploaded={handleToggleRawFootageUploaded}
              />
            </section>

            {/* Section 2: Iteration Submissions & Video Review Player */}
            {Boolean(userPermissions.isCreator || userPermissions.submissionsVisible) && (
              <section className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Section 2: Iteration Review & Categorized Comments (SPEC.md Section 6.3)
                  </span>
                </div>
                <VideoReviewPlayer
                  submissions={submissions}
                  driveFolders={driveFolders}
                  feedbackCategories={feedbackCategories}
                  canSubmit={userPermissions.canSubmit}
                  canApprove={userPermissions.canApprove}
                  isCreator={userPermissions.isCreator}
                  userEmail={userPermissions.userEmail}
                  onOpenSubmitModal={() => setUploaderOpen(true)}
                  onAddComment={handleAddComment}
                  onToggleResolveComment={handleToggleResolveComment}
                  onDeleteComment={handleDeleteComment}
                  onApproveSubmission={handleApproveSubmission}
                  onRequestRevision={handleRequestRevision}
                />
              </section>
            )}
          </main>

          {/* Iteration Uploader Modal */}
          <IterationUploaderModal
            isOpen={uploaderOpen}
            onClose={() => setUploaderOpen(false)}
            workflowTasks={workflowTasks}
            defaultTask={userPermissions.assignedTask || "Edit"}
            nextVersion={`V${submissions.length + 1}`}
            onSubmitIteration={handleSubmitIteration}
          />

          {/* Footer */}
          <footer className="w-full text-center text-xs text-muted-foreground py-4 font-mono border-t border-border max-w-7xl mx-auto">
            ContentPipe • Content Hub, Google Drive Automation & Review (SPEC.md Section 6)
          </footer>
        </>
      )}
    </div>
  );
}
