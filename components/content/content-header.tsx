"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Video,
  FileText,
  ExternalLink,
  FolderSync,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { DriveFolders } from "@/types/database";

interface ContentHeaderProps {
  contentItem: {
    id: string;
    unique_content_id: string | null;
    title: string;
    publish_date: string | null;
    is_in_idea_bank?: boolean;
    content_type?: {
      id?: string | null;
      name: string;
      prefix: string | null;
      brand?: {
        id: string;
        name: string;
        color?: string | null;
      } | null;
    } | null;
  };
  driveFolders: DriveFolders;
  isCreator: boolean;
}

export function ContentHeader({
  contentItem,
  driveFolders,
  isCreator,
}: ContentHeaderProps) {
  const formattedDate = contentItem.publish_date
    ? new Date(contentItem.publish_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <header className="w-full max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 p-3.5 sm:p-4 rounded-2xl card-theme">
      {/* Left: Metadata & Navigation */}
      <div className="flex items-center gap-3">
        <Link
          href="/tracker"
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all"
          style={{ borderRadius: "var(--radius)" }}
          title="Return to Index"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
            <Video className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm tracking-tight truncate max-w-xs md:max-w-md">
                {contentItem.title}
              </span>

              {/* Crisp Breadcrumb Badge: Brand Name / Content Series / Unique ID */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-muted/80 text-muted-foreground border border-border max-w-full truncate">
                {contentItem.content_type?.brand?.name && (
                  <>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: contentItem.content_type.brand.color || "#6366f1" }}
                    />
                    <span className="text-foreground/85 font-semibold truncate">
                      {contentItem.content_type.brand.name}
                    </span>
                    <span className="opacity-50">/</span>
                  </>
                )}
                <span className="truncate">
                  {contentItem.content_type?.name || "Idea Bank (Unassigned Pipe)"}
                </span>
                {contentItem.unique_content_id && (
                  <>
                    <span className="opacity-50">/</span>
                    <span className="font-bold text-primary shrink-0">
                      {contentItem.unique_content_id}
                    </span>
                  </>
                )}
              </span>
            </div>

            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {formattedDate ? (
                <>
                  Target Publish: <span className="text-foreground font-medium">{formattedDate}</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                  Idea Bank • Unscheduled
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Quick Tools & Google Drive Link */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
        {/* Direct Google Drive Folder Link */}
        {driveFolders.main_folder_url && (
          <a
            href={driveFolders.main_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 sm:col-span-1 min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl sm:rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Open project folder in Google Drive"
          >
            <FolderSync className="w-3.5 h-3.5" />
            <span>Open in Google Drive</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
          </a>
        )}

        {/* Link to Script */}
        <Link
          href={`/scripts/${contentItem.unique_content_id || contentItem.id}`}
          className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl sm:rounded-md text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center justify-center gap-1.5 transition-all"
          title="Open Script Workspace"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Script</span>
        </Link>

        {/* Storage Cleanup link for Creator */}
        {isCreator && (
          <Link
            href="/storage-cleanup"
            className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-xl sm:rounded-md text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center justify-center gap-1.5 transition-all"
            title="Manage Google Drive Storage & Cleanup Old Footage"
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage Cleanup</span>
          </Link>
        )}
      </div>
    </header>
  );
}
