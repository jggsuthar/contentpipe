"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ListTodo,
  Archive,
  Check,
} from "lucide-react";
import { CustomActionItem } from "@/types/database";

export interface ActionItemPayload {
  itemId: string;
  uniqueContentId: string | null;
  title: string;
  contentTypeName: string;
  brandName?: string | null;
  brandColor?: string | null;
  isArchived: boolean;
  actionItem: CustomActionItem;
}

interface ActionItemsWidgetProps {
  openItems: ActionItemPayload[];
  closedItems: ActionItemPayload[];
  onToggleActionItem: (itemId: string, actionItemId: string) => Promise<void>;
}

export function ActionItemsWidget({
  openItems,
  closedItems,
  onToggleActionItem,
}: ActionItemsWidgetProps) {
  const [showClosed, setShowClosed] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = async (itemId: string, actionItemId: string) => {
    setTogglingId(actionItemId);
    try {
      await onToggleActionItem(itemId, actionItemId);
    } finally {
      setTogglingId(null);
    }
  };

  const currentList = showClosed ? closedItems : openItems;

  return (
    <div className="card-theme p-4 sm:p-6 rounded-2xl space-y-4 sm:space-y-5">
      {/* Header & Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-border/70">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold border border-primary/25 shrink-0">
            <ListTodo className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm">Action Items</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary text-primary-foreground">
                {openItems.length} Open
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Custom remarks &amp; notes across pipeline slots
            </p>
          </div>
        </div>

        {/* View Open vs Closed Toggle */}
        <button
          type="button"
          onClick={() => setShowClosed(!showClosed)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold transition-all duration-250 cursor-pointer shrink-0 ${
            showClosed
              ? "bg-primary text-primary-foreground shadow-xs"
              : "glass-subtle hover:bg-muted/60 text-foreground"
          }`}
        >
          {showClosed ? `Showing Closed (${closedItems.length})` : "View Recently Closed"}
        </button>
      </div>

      {/* Action Items Cards Grid */}
      {currentList.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl glass-subtle">
          {showClosed
            ? "No recently closed action items."
            : "Zero open action items! All project to-dos are fulfilled."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
          {currentList.map(({ itemId, uniqueContentId, title, contentTypeName, brandName, brandColor, isArchived, actionItem }) => {
            const isToggling = togglingId === actionItem.id;

            return (
              <div
                key={actionItem.id}
                className={`group relative p-3.5 rounded-xl glass-subtle hover:border-primary/45 transition-all duration-200 flex items-start gap-3 text-xs ${
                  actionItem.is_closed ? "opacity-75" : ""
                }`}
              >
                {/* One-click Checkbox */}
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggle(itemId, actionItem.id)}
                  className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
                    actionItem.is_closed
                      ? "bg-status-done text-status-done-foreground border-status-done scale-105"
                      : "border-border hover:border-primary bg-background/60"
                  }`}
                  title={actionItem.is_closed ? "Click to reopen action item" : "Click to mark as done"}
                >
                  {actionItem.is_closed && <Check className="w-3 h-3 stroke-[3]" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Content ID Badge with Hover tooltip & Link */}
                    <Link
                      href={`/tracker?highlight=${itemId}`}
                      className="px-2 py-0.5 rounded-full font-mono font-bold text-[10px] bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25 transition-colors"
                      title={`${title} (${contentTypeName})`}
                    >
                      {uniqueContentId || "Slot"}
                    </Link>

                    {isArchived && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono glass-subtle text-muted-foreground flex items-center gap-0.5">
                        <Archive className="w-2.5 h-2.5" />
                        <span>Archived</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground truncate max-w-[165px]">
                      {brandName && (
                        <>
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: brandColor || "#6366f1" }}
                          />
                          <span className="text-foreground/80 truncate">{brandName}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="truncate">{contentTypeName}</span>
                    </span>
                  </div>

                  {/* Action Item Text */}
                  <p
                    className={`text-xs leading-relaxed ${
                      actionItem.is_closed
                        ? "line-through text-muted-foreground"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {actionItem.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
