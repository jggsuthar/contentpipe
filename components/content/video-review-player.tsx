"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Clock,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ThumbsUp,
  Tag,
  Plus,
  Send,
  Trash2,
  Check,
  MapPin,
  FileVideo,
  Image as ImageIcon,
  ExternalLink,
  Loader2,
  FolderSync,
} from "lucide-react";
import { DbComment, DbSubmission, DriveFolders } from "@/types/database";

interface VideoReviewPlayerProps {
  submissions: (DbSubmission & {
    submitted_by?: { name: string; role_title: string } | null;
    comments: DbComment[];
  })[];
  driveFolders: DriveFolders;
  feedbackCategories: string[];
  canSubmit: boolean;
  canApprove: boolean;
  isCreator: boolean;
  userEmail: string;
  onOpenSubmitModal: () => void;
  onAddComment: (data: {
    submission_id: string;
    timestamp_seconds?: number | null;
    marker_x?: number | null;
    marker_y?: number | null;
    category: string;
    severity: "minor" | "critical";
    text: string;
  }) => Promise<void>;
  onToggleResolveComment: (commentId: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onApproveSubmission: (submissionId: string) => Promise<void>;
  onRequestRevision: (submissionId: string) => Promise<void>;
}

export function VideoReviewPlayer({
  submissions,
  driveFolders,
  feedbackCategories,
  canSubmit,
  canApprove,
  isCreator,
  userEmail,
  onOpenSubmitModal,
  onAddComment,
  onToggleResolveComment,
  onDeleteComment,
  onApproveSubmission,
  onRequestRevision,
}: VideoReviewPlayerProps) {
  // Active selected submission
  const [selectedSubId, setSelectedSubId] = useState<string>(
    submissions[0]?.id || ""
  );

  // Video player ref & playback states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Image pin marker state
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [activePin, setActivePin] = useState<{ x: number; y: number } | null>(null);

  // New Comment form states
  const [commentText, setCommentText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    feedbackCategories[0] || "Pacing / Dead Air"
  );
  const [severity, setSeverity] = useState<"minor" | "critical">("minor");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isProcessingReview, setIsProcessingReview] = useState(false);

  // Keep selectedSubId synced with submissions array
  useEffect(() => {
    if (!selectedSubId && submissions.length > 0) {
      setSelectedSubId(submissions[0].id);
    }
  }, [submissions, selectedSubId]);

  const activeSubmission = submissions.find((s) => s.id === selectedSubId) || submissions[0];

  // Format seconds to mm:ss
  const formatTimestamp = (totalSeconds?: number | null) => {
    if (totalSeconds === null || totalSeconds === undefined) return "";
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Jump video to timestamp
  const handleSeek = (seconds?: number | null) => {
    if (seconds === null || seconds === undefined || !videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play();
    setIsPlaying(true);
  };

  // Capture video timestamp on pause or button click
  const handleCaptureTimestamp = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle click on image review canvas to drop a pin marker
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setActivePin({ x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) });
  };

  const handleCreateComment = async () => {
    if (!commentText.trim() || !activeSubmission) return;
    setIsSubmittingComment(true);
    try {
      const isVideo = activeSubmission.file_type !== "image";
      await onAddComment({
        submission_id: activeSubmission.id,
        timestamp_seconds: isVideo ? Math.floor(currentTime) : null,
        marker_x: !isVideo && activePin ? activePin.x : null,
        marker_y: !isVideo && activePin ? activePin.y : null,
        category: selectedCategory,
        severity,
        text: commentText.trim(),
      });
      setCommentText("");
      setActivePin(null);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleApprove = async () => {
    if (!activeSubmission) return;
    setIsProcessingReview(true);
    try {
      await onApproveSubmission(activeSubmission.id);
    } finally {
      setIsProcessingReview(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!activeSubmission) return;
    setIsProcessingReview(true);
    try {
      await onRequestRevision(activeSubmission.id);
    } finally {
      setIsProcessingReview(false);
    }
  };

  if (!activeSubmission) {
    return (
      <div className="card-theme p-8 text-center rounded-2xl space-y-3">
        <FileVideo className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
        <h4 className="font-bold text-sm">No Iteration Submissions Yet</h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          When the Editor or Designer uploads V1, the interactive review player and categorized feedback engine will activate here.
        </p>
        {canSubmit && (
          <button
            type="button"
            onClick={onOpenSubmitModal}
            className="px-3.5 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            style={{ borderRadius: "var(--radius)" }}
          >
            Submit V1 Deliverable
          </button>
        )}
      </div>
    );
  }

  const isImage = activeSubmission.file_type === "image";

  return (
    <div className="card-theme p-3.5 sm:p-5 rounded-2xl space-y-4">
      {/* 1. Top Version Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-border">
        {/* Version Tabs: [V1], [V2], [V3] */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-mono text-muted-foreground mr-1 shrink-0">Iterations:</span>
          {submissions.map((sub) => {
            const isSelected = sub.id === activeSubmission.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  setSelectedSubId(sub.id);
                  setActivePin(null);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-xl sm:rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-foreground border-border"
                }`}
              >
                <span>{sub.version}</span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor:
                      sub.status === "approved"
                        ? "var(--status-done)"
                        : sub.status === "rejected"
                        ? "var(--status-revision)"
                        : "var(--status-review)",
                  }}
                  title={`Status: ${sub.status}`}
                />
              </button>
            );
          })}
        </div>

        {/* Right Tools: Submit Next Iteration + Drive Link */}
        <div className="flex items-center gap-2 flex-wrap">
          {driveFolders.submissions_url && (
            <a
              href={driveFolders.submissions_url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[36px] sm:min-h-0 px-2.5 py-1 rounded-xl sm:rounded text-[11px] font-mono bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border flex items-center gap-1 shrink-0"
              title="Open Project Folder in Google Drive"
            >
              <FolderSync className="w-3 h-3 text-primary" />
              <span>Drive Folder</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}

          {canSubmit && (
            <button
              type="button"
              onClick={onOpenSubmitModal}
              className="min-h-[36px] sm:min-h-0 px-3 py-1 rounded-xl sm:rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Submit New Iteration</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Player & Review Canvas + Feedback Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
        {/* Left Column: Media Player / Review Canvas (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Active Version Meta & Desktop Approval Controls */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/30 border border-border text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold font-mono text-primary text-sm shrink-0">
                {activeSubmission.version}
              </span>
              <span className="text-muted-foreground shrink-0">•</span>
              <span className="font-medium truncate min-w-0">{activeSubmission.file_name}</span>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold capitalize shrink-0"
                style={{
                  backgroundColor:
                    activeSubmission.status === "approved"
                      ? "var(--status-done)"
                      : activeSubmission.status === "rejected"
                      ? "var(--status-revision)"
                      : "var(--status-review)",
                  color:
                    activeSubmission.status === "approved"
                      ? "var(--status-done-foreground)"
                      : activeSubmission.status === "rejected"
                      ? "var(--status-revision-foreground)"
                      : "var(--status-review-foreground)",
                }}
              >
                {activeSubmission.status === "approved"
                  ? "Approved"
                  : activeSubmission.status === "rejected"
                  ? "Revision Needed"
                  : "Under Review"}
              </span>
            </div>

            {/* Desktop Creator Review Actions */}
            {canApprove && (
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isProcessingReview}
                  onClick={handleRequestRevision}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-status-revision/15 text-status-revision hover:bg-status-revision/25 border border-status-revision/30 flex items-center gap-1 cursor-pointer"
                  style={{ borderRadius: "var(--radius)" }}
                  title="Request revision and unlock next version upload"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Request Revision</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingReview || activeSubmission.status === "approved"}
                  onClick={handleApprove}
                  className={`px-3 py-1 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer shadow-xs ${
                    activeSubmission.status === "approved"
                      ? "bg-status-done text-status-done-foreground opacity-90 cursor-default"
                      : "bg-status-done text-status-done-foreground hover:opacity-95"
                  }`}
                  style={{ borderRadius: "var(--radius)" }}
                  title="Approve deliverable and copy to 04_Final_Exports"
                >
                  {isProcessingReview ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ThumbsUp className="w-3 h-3" />
                  )}
                  <span>Approve</span>
                </button>
              </div>
            )}
          </div>

          {/* Media Player Container (Sticky below mobile top header when scrolling comments) */}
          {isImage ? (
            /* Image Review Canvas with Pin-on-image Markers */
            <div className="space-y-1.5 sticky top-13 lg:static z-20 bg-background/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none pb-1.5 lg:pb-0 rounded-xl">
              <div
                ref={imageContainerRef}
                onClick={handleImageClick}
                className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video w-full flex items-center justify-center cursor-crosshair group select-none"
              >
                <img
                  src={activeSubmission.file_url || "/placeholder-image.png"}
                  alt="Review deliverable"
                  className="w-full h-full object-contain pointer-events-none"
                />

                {/* Render Existing Image Pins from Comments */}
                {activeSubmission.comments.map((comm) => {
                  if (comm.marker_x === null || comm.marker_y === null) return null;
                  return (
                    <div
                      key={comm.id}
                      style={{ left: `${comm.marker_x}%`, top: `${comm.marker_y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-lg border-2 border-white ${
                        comm.is_resolved ? "bg-status-done text-white" : "bg-destructive text-white"
                      }`}
                      title={`${comm.category || "Feedback"}: ${comm.body}`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                  );
                })}

                {/* Active Pin Placement */}
                {activePin && (
                  <div
                    style={{ left: `${activePin.x}%`, top: `${activePin.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center animate-bounce shadow-xl border-2 border-white"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-mono text-muted-foreground text-center">
                Click anywhere on the image canvas to drop a feedback pin marker
              </p>
            </div>
          ) : (
            /* Interactive Video Review Player */
            <div className="space-y-2 sticky top-13 lg:static z-20 bg-background/95 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none pb-1.5 lg:pb-0 rounded-xl">
              <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video w-full flex items-center justify-center shadow-md">
                <video
                  ref={videoRef}
                  src={activeSubmission.file_url || ""}
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                    }
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Timestamp Quick Tag Button */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono px-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden sm:inline">Playback Time:</span>
                  <strong className="text-foreground">{formatTimestamp(currentTime)}</strong>
                  <span>/ {formatTimestamp(duration)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleCaptureTimestamp}
                  className="min-h-[38px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-xl sm:rounded text-[11px] font-mono font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Pause video and pin current timestamp into feedback form"
                >
                  <Clock className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                  <span>Capture Timestamp ({formatTimestamp(currentTime)})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Categorized Comments Feed & Input Form (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between border border-border rounded-lg bg-card overflow-hidden">
          {/* Comments Feed Header */}
          <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs">Categorized Review Feedback</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {activeSubmission.comments.filter((c) => !c.is_resolved).length} open
            </span>
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[380px]">
            {activeSubmission.comments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xs font-mono">
                No feedback recorded on this cut yet.
              </div>
            ) : (
              activeSubmission.comments.map((comm) => (
                <div
                  key={comm.id}
                  className={`p-2.5 rounded border text-xs space-y-1.5 transition-all ${
                    comm.is_resolved
                      ? "bg-muted/30 border-border/60 opacity-60"
                      : comm.severity === "critical"
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-background border-border"
                  }`}
                  style={{ borderRadius: "var(--radius)" }}
                >
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1.5">
                      {/* Timestamp seek button */}
                      {comm.timestamp_seconds !== null && (
                        <button
                          type="button"
                          onClick={() => handleSeek(comm.timestamp_seconds)}
                          className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold hover:bg-primary/20 cursor-pointer flex items-center gap-1"
                          title="Seek video to this timestamp"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{formatTimestamp(comm.timestamp_seconds)}</span>
                        </button>
                      )}

                      {/* Image Pin coordinate badge */}
                      {comm.marker_x !== null && comm.marker_y !== null && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          <span>Pin ({comm.marker_x}%, {comm.marker_y}%)</span>
                        </span>
                      )}

                      {/* Mandatory Mistake Category Tag */}
                      {comm.category && (
                        <span className="px-1.5 py-0.5 rounded bg-muted border border-border font-medium">
                          {comm.category}
                        </span>
                      )}

                      {/* Severity Badge */}
                      {comm.severity === "critical" && (
                        <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-bold">
                          Critical
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Resolve toggle */}
                      <button
                        type="button"
                        onClick={() => onToggleResolveComment(comm.id)}
                        className={`p-1 rounded cursor-pointer transition-colors ${
                          comm.is_resolved
                            ? "bg-status-done text-status-done-foreground"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                        title={comm.is_resolved ? "Mark unresolved" : "Mark resolved"}
                      >
                        <Check className="w-3 h-3" />
                      </button>

                      {/* Delete (Author or Creator) */}
                      {(isCreator || comm.author_email === userEmail) && (
                        <button
                          type="button"
                          onClick={() => onDeleteComment(comm.id)}
                          className="p-1 hover:bg-destructive/20 hover:text-destructive rounded text-muted-foreground cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className={`text-xs ${comm.is_resolved ? "line-through text-muted-foreground" : "font-medium"}`}>
                    {comm.body}
                  </p>

                  <div className="text-[9px] text-muted-foreground font-mono flex items-center justify-between">
                    <span>{comm.author_email}</span>
                    <span>{new Date(comm.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* New Feedback Submission Form */}
          <div className="p-3 border-t border-border bg-muted/20 space-y-2.5">
            {/* Mobile Horizontal Category Pills (< md) */}
            <div className="flex md:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {feedbackCategories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-mono font-semibold border shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "glass-subtle text-muted-foreground border-border"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              {/* Desktop Category Dropdown */}
              <div className="hidden md:flex items-center gap-1 flex-1">
                <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full h-7 px-2 text-[11px] rounded bg-background border border-border focus:outline-none focus:border-primary font-mono cursor-pointer"
                  style={{ borderRadius: "var(--radius)" }}
                >
                  {feedbackCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Severity Toggle */}
              <button
                type="button"
                onClick={() => setSeverity(severity === "minor" ? "critical" : "minor")}
                className={`min-h-[34px] md:min-h-0 px-2.5 md:px-2 py-1 md:py-0.5 rounded-xl md:rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  severity === "critical"
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {severity === "critical" ? "Critical Error" : "Minor Tweak"}
              </button>
            </div>

            {/* Comment Input */}
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateComment();
                  }
                }}
                placeholder={
                  !isImage
                    ? `Feedback at ${formatTimestamp(currentTime)} (e.g. Cut 2s of dead air)...`
                    : activePin
                    ? `Feedback on pin (${activePin.x}%, ${activePin.y}%)...`
                    : "Feedback on this thumbnail/image..."
                }
                className="flex-1 p-2.5 sm:p-2 text-base sm:text-xs rounded-xl bg-background border border-border focus:outline-none focus:border-primary resize-none"
              />

              <button
                type="button"
                disabled={!commentText.trim() || isSubmittingComment}
                onClick={handleCreateComment}
                className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-9 px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer flex items-center justify-center shadow-xs"
              >
                {isSubmittingComment ? (
                  <Loader2 className="w-4 h-4 md:w-3.5 md:h-3.5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 md:w-3.5 md:h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Full-Width 2-Button Review Footer (< md) */}
      {canApprove && (
        <div className="md:hidden grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={isProcessingReview}
            onClick={handleRequestRevision}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-status-revision/15 text-status-revision hover:bg-status-revision/25 border border-status-revision/30 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Request Revisions</span>
          </button>

          <button
            type="button"
            disabled={isProcessingReview || activeSubmission.status === "approved"}
            onClick={handleApprove}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
              activeSubmission.status === "approved"
                ? "bg-status-done text-status-done-foreground opacity-90 cursor-default"
                : "bg-status-done text-status-done-foreground hover:opacity-95"
            }`}
          >
            {isProcessingReview ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ThumbsUp className="w-3.5 h-3.5" />
            )}
            <span>{activeSubmission.status === "approved" ? "Approved" : "Approve"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
