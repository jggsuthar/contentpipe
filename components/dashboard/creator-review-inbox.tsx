"use client";

import React from "react";
import Link from "next/link";
import {
  Inbox,
  ArrowRight,
  CheckCircle2,
  User,
} from "lucide-react";

export interface ReviewInboxItem {
  id: string;
  contentItemId: string;
  uniqueContentId: string | null;
  title: string;
  contentTypeName: string;
  brandName?: string | null;
  brandColor?: string | null;
  taskName: string;
  version: string;
  submitterName: string;
  roleTitle: string;
  submittedAt: string;
  targetUrl: string;
}

interface CreatorReviewInboxProps {
  items: ReviewInboxItem[];
}

export function CreatorReviewInbox({ items }: CreatorReviewInboxProps) {
  return (
    <div className="card-theme p-6 rounded-2xl space-y-5 relative overflow-hidden">
      {/* Subtle Amber/Indigo Ambient Header Accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500/80 via-primary/80 to-indigo-500/80" />

      <div className="flex items-center justify-between pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-status-review/15 text-status-review flex items-center justify-center font-bold border border-status-review/25">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">Needs Your Review</h3>
              {items.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-status-review text-status-review-foreground shadow-xs">
                  {items.length} Pending
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Deliverables submitted by team members waiting for Creator approval
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-border/80 glass-subtle space-y-2">
          <CheckCircle2 className="w-8 h-8 text-status-done mx-auto opacity-80" />
          <h4 className="font-bold text-xs">All Caught Up!</h4>
          <p className="text-[11px] text-muted-foreground font-mono max-w-sm mx-auto">
            Zero deliverables waiting for review. The production queue is running smoothly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {items.map((item) => {
            return (
              <Link
                key={item.id}
                href={item.targetUrl}
                className="group p-4 rounded-xl glass-subtle hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-250 flex flex-col justify-between space-y-3 cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                      {item.uniqueContentId || "Slot"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono glass-subtle text-muted-foreground max-w-[190px] truncate">
                      {item.brandName && (
                        <>
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.brandColor || "#6366f1" }}
                          />
                          <span className="text-foreground/80 truncate">{item.brandName}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="truncate">{item.contentTypeName}</span>
                    </span>
                  </div>

                  <h4 className="font-bold text-xs group-hover:text-primary transition-colors duration-200 line-clamp-2">
                    {item.title}
                  </h4>

                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold"
                      style={{
                        backgroundColor: "var(--status-review)",
                        color: "var(--status-review-foreground)",
                      }}
                    >
                      {item.taskName} • {item.version}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.submitterName}</span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-250 font-semibold">
                    <span>Review</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
