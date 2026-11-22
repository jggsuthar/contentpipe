"use client";

import React from "react";
import Link from "next/link";
import { CalendarCheck, AlertTriangle, Clock } from "lucide-react";

export interface CreatorAgendaItem {
  contentItemId: string;
  uniqueContentId: string | null;
  title: string;
  contentTypeName: string;
  brandName?: string | null;
  brandColor?: string | null;
  taskName: string;
  dueDate: string;
  targetUrl: string;
}

function SeriesContextBadge({ item }: { item: CreatorAgendaItem }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground max-w-[140px] truncate">
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
  );
}

interface CreatorAgendaProps {
  agenda: {
    overdue: CreatorAgendaItem[];
    dueToday: CreatorAgendaItem[];
    upcomingThisWeek: CreatorAgendaItem[];
  };
}

export function CreatorAgenda({ agenda }: CreatorAgendaProps) {
  const totalTasks =
    agenda.overdue.length + agenda.dueToday.length + agenda.upcomingThisWeek.length;

  return (
    <div className="card-theme p-6 rounded-2xl space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold border border-primary/25">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Creator Agenda: Today & This Week</h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              Tasks owned by Creator (Ideation, Shoot, Schedule) sorted by urgency
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full glass-subtle text-xs font-mono text-muted-foreground">
          {totalTasks} pending action items
        </span>
      </div>

      {totalTasks === 0 ? (
        <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl glass-subtle">
          No Creator tasks scheduled for this week.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Overdue Column */}
          <div className="p-3.5 rounded-xl glass-subtle space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-rose-500">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Overdue</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px]">
                {agenda.overdue.length}
              </span>
            </div>

            <div className="space-y-2">
              {agenda.overdue.length === 0 ? (
                <div className="p-3 rounded-xl border border-border/50 text-center text-[11px] text-muted-foreground font-mono bg-muted/15">
                  None overdue
                </div>
              ) : (
                agenda.overdue.map((item, idx) => (
                  <Link
                    key={idx}
                    href={item.targetUrl}
                    className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/8 hover:bg-rose-500/15 hover:-translate-y-0.5 transition-all duration-200 block text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-rose-400">
                        {item.uniqueContentId || "Slot"}
                      </span>
                      <SeriesContextBadge item={item} />
                    </div>
                    <div className="font-semibold truncate text-foreground">{item.title}</div>
                    <div className="text-[10px] font-mono text-rose-400 font-bold">
                      Task: {item.taskName}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Due Today Column */}
          <div className="p-3.5 rounded-xl glass-subtle space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-500">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Due Today</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px]">
                {agenda.dueToday.length}
              </span>
            </div>

            <div className="space-y-2">
              {agenda.dueToday.length === 0 ? (
                <div className="p-3 rounded-xl border border-border/50 text-center text-[11px] text-muted-foreground font-mono bg-muted/15">
                  Zero tasks due today
                </div>
              ) : (
                agenda.dueToday.map((item, idx) => (
                  <Link
                    key={idx}
                    href={item.targetUrl}
                    className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/15 hover:-translate-y-0.5 transition-all duration-200 block text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-amber-400">
                        {item.uniqueContentId || "Slot"}
                      </span>
                      <SeriesContextBadge item={item} />
                    </div>
                    <div className="font-semibold truncate text-foreground">{item.title}</div>
                    <div className="text-[10px] font-mono text-amber-400 font-bold">
                      Task: {item.taskName}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Upcoming This Week Column */}
          <div className="p-3.5 rounded-xl glass-subtle space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5 text-primary" />
                <span>Upcoming This Week</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">
                {agenda.upcomingThisWeek.length}
              </span>
            </div>

            <div className="space-y-2">
              {agenda.upcomingThisWeek.length === 0 ? (
                <div className="p-3 rounded-xl border border-border/50 text-center text-[11px] text-muted-foreground font-mono bg-muted/15">
                  No upcoming tasks
                </div>
              ) : (
                agenda.upcomingThisWeek.map((item, idx) => (
                  <Link
                    key={idx}
                    href={item.targetUrl}
                    className="p-3 rounded-xl glass-subtle hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 block text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-primary">
                        {item.uniqueContentId || "Slot"}
                      </span>
                      <SeriesContextBadge item={item} />
                    </div>
                    <div className="font-semibold truncate text-foreground">{item.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      Task: {item.taskName}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
