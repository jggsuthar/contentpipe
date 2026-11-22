"use client";

import React from "react";
import Link from "next/link";
import { Activity, Layers, ArrowUpRight } from "lucide-react";

export interface PipelineHealthType {
  id: string;
  name: string;
  prefix: string | null;
  brandId?: string | null;
  brandName?: string | null;
  brandColor?: string | null;
  activeProjectsCount: number;
  velocityPercentage: number;
  tasksHealth: {
    id: string;
    taskName: string;
    completedCount: number;
    totalCount: number;
    lightStatus: "green" | "yellow" | "red";
  }[];
}

interface PipelineHealthMatrixProps {
  pipelines: PipelineHealthType[];
}

export function PipelineHealthMatrix({ pipelines }: PipelineHealthMatrixProps) {
  return (
    <div className="card-theme p-6 rounded-2xl space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold border border-primary/25">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Pipeline Health & Production Velocity</h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              Live step completion vs drop-dead deadlines (SPEC.md Section 7.1.1)
            </p>
          </div>
        </div>

        <Link
          href="/tracker"
          className="px-3 py-1.5 rounded-xl glass-subtle text-xs font-mono text-primary hover:bg-primary/15 flex items-center gap-1 transition-all duration-250"
        >
          <span>Open Matrix Board</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-4">
        {pipelines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-mono text-xs border border-dashed border-border/80 rounded-xl glass-subtle">
            No Content Series configured for this Brand yet. Visit Settings to add one.
          </div>
        ) : (
          pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="p-4 rounded-xl glass-subtle space-y-3.5"
          >
            {/* Content Series Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-primary" />
                {pipeline.brandName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: pipeline.brandColor || "#6366f1" }}
                    />
                    <span>{pipeline.brandName}</span>
                  </span>
                )}
                <span className="font-bold text-xs">{pipeline.name}</span>
                {pipeline.prefix && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    ({pipeline.prefix})
                  </span>
                )}
                <span className="text-muted-foreground text-xs">•</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {pipeline.activeProjectsCount} active slots
                </span>
              </div>

              {/* Velocity Percentage Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground">Velocity:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-mono font-bold">
                  {pipeline.velocityPercentage}%
                </span>
              </div>
            </div>

            {/* Velocity Progress Bar */}
            <div className="w-full h-2 rounded-full bg-muted/70 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${pipeline.velocityPercentage}%` }}
              />
            </div>

            {/* Tasks Health Matrix (Traffic Light Indicators) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
              {pipeline.tasksHealth.map((th) => {
                return (
                  <div
                    key={th.id}
                    className="p-3 rounded-xl glass-subtle flex flex-col justify-between space-y-1.5 text-xs hover:border-primary/35 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-medium text-[11px] truncate">{th.taskName}</span>

                      {/* Traffic Light Dot */}
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ${
                          th.lightStatus === "red"
                            ? "bg-rose-500 animate-pulse"
                            : th.lightStatus === "yellow"
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                        }`}
                        title={
                          th.lightStatus === "red"
                            ? "Delayed past worst-case drop-dead deadline"
                            : th.lightStatus === "yellow"
                            ? "Encroaching on Creator buffer window"
                            : "On track"
                        }
                      />
                    </div>

                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-xs font-bold text-foreground">
                        {th.completedCount}/{th.totalCount}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {th.totalCount > 0 ? `${Math.round((th.completedCount / th.totalCount) * 100)}%` : "0%"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
        )}
      </div>
    </div>
  );
}
