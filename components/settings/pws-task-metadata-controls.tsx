"use client";

import React from "react";
import { Clock, Flame, Split, MapPin } from "lucide-react";
import type { DbScheduleZone, ResistanceLevel } from "@/types/database";

export interface PwsMetadataValues {
  durationMins: number;
  setupBufferMins: number;
  isSplittable: boolean;
  minSplitChunkMins: number;
  resistance: ResistanceLevel;
  eligibleZoneIds: string[];
}

interface PwsTaskMetadataControlsProps {
  values: PwsMetadataValues;
  zones: DbScheduleZone[];
  onChange: (partial: Partial<PwsMetadataValues>) => void;
  compact?: boolean;
}

const RESISTANCE_OPTIONS: {
  value: ResistanceLevel;
  label: string;
  activeClass: string;
}[] = [
  {
    value: "LOW",
    label: "LOW",
    activeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-bold",
  },
  {
    value: "MEDIUM",
    label: "MED",
    activeClass: "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold",
  },
  {
    value: "HIGH",
    label: "HIGH",
    activeClass: "bg-rose-500/20 text-rose-400 border-rose-500/50 font-bold",
  },
];

export function PwsTaskMetadataControls({
  values,
  zones,
  onChange,
  compact = false,
}: PwsTaskMetadataControlsProps) {
  const toggleZone = (zoneId: string) => {
    const exists = values.eligibleZoneIds.includes(zoneId);
    const next = exists
      ? values.eligibleZoneIds.filter((id) => id !== zoneId)
      : [...values.eligibleZoneIds, zoneId];
    onChange({ eligibleZoneIds: next });
  };

  const selectedZoneNames = values.eligibleZoneIds
    .map((id) => zones.find((z) => z.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div
      className={`flex flex-col gap-2 text-xs ${
        compact ? "" : "pt-2 mt-1 border-t border-border/40"
      }`}
    >
      {/* Row 1: Timing, Resistance & Split Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3 h-3 text-primary" />
          PWS Metadata:
        </span>

        {/* Duration (mins) */}
        <label className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          <span>Duration</span>
          <div className="relative flex items-center">
            <input
              type="number"
              min={5}
              max={1440}
              step={5}
              value={values.durationMins}
              onChange={(e) =>
                onChange({
                  durationMins: Math.max(5, parseInt(e.target.value, 10) || 5),
                })
              }
              className="w-16 h-6 pl-2 pr-5 text-center text-[11px] font-mono rounded bg-background border border-border focus:border-primary text-foreground"
              title="Task execution duration in minutes (minimum 5m)"
            />
            <span className="absolute right-1.5 text-[9px] text-muted-foreground pointer-events-none">
              m
            </span>
          </div>
        </label>

        {/* Setup Buffer (mins) */}
        <label className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          <span>Setup Buffer</span>
          <div className="relative flex items-center">
            <input
              type="number"
              min={0}
              max={240}
              step={5}
              value={values.setupBufferMins}
              onChange={(e) =>
                onChange({
                  setupBufferMins: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className="w-14 h-6 pl-1.5 pr-5 text-center text-[11px] font-mono rounded bg-background border border-border focus:border-primary text-foreground"
              title="Setup / context-switch buffer in minutes"
            />
            <span className="absolute right-1.5 text-[9px] text-muted-foreground pointer-events-none">
              m
            </span>
          </div>
        </label>

        {/* Resistance */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" />
            Resistance
          </span>
          <div className="inline-flex items-center p-0.5 rounded bg-muted/60 border border-border text-[10px] font-mono">
            {RESISTANCE_OPTIONS.map((opt) => {
              const isSelected = values.resistance === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ resistance: opt.value })}
                  className={`px-2 py-0.5 rounded border transition-all cursor-pointer ${
                    isSelected
                      ? opt.activeClass
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Splittable Toggle + Min Chunk */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ isSplittable: !values.isSplittable })}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono transition-all cursor-pointer ${
              values.isSplittable
                ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Allow PWS to split this task across multiple time slots"
          >
            <Split className="w-3 h-3" />
            <span>{values.isSplittable ? "Splittable: ON" : "Splittable: OFF"}</span>
          </button>

          {values.isSplittable && (
            <label className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground animate-in fade-in duration-150">
              <span>Min Chunk</span>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={values.minSplitChunkMins}
                  onChange={(e) =>
                    onChange({
                      minSplitChunkMins: Math.max(5, parseInt(e.target.value, 10) || 15),
                    })
                  }
                  className="w-14 h-6 pl-1.5 pr-5 text-center text-[11px] font-mono rounded bg-background border border-border focus:border-primary text-foreground"
                  title="Minimum split chunk size in minutes"
                />
                <span className="absolute right-1.5 text-[9px] text-muted-foreground pointer-events-none">
                  m
                </span>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Row 2: Eligible Zones ('OR' Multi-Select Pills) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <MapPin className="w-3 h-3 text-primary" />
          Eligible Zones:
        </span>

        {zones.length === 0 ? (
          <span className="text-[10px] font-mono text-muted-foreground italic">
            No custom zones — whole working day acts as a single open zone
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {zones.map((zone) => {
              const selected = values.eligibleZoneIds.includes(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleZone(zone.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                    selected
                      ? "text-foreground shadow-xs font-semibold"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground hover:bg-muted/70"
                  }`}
                  style={
                    selected
                      ? {
                          backgroundColor: `${zone.color}22`,
                          borderColor: `${zone.color}88`,
                        }
                      : undefined
                  }
                  title={
                    selected
                      ? `Remove '${zone.name}' from eligible placement zones`
                      : `Allow placement in '${zone.name}'`
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  <span>{zone.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 'OR' placement badge when multiple zones selected, or fallback hint */}
        {selectedZoneNames.length > 1 ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/30">
            {selectedZoneNames.join(" OR ")}
          </span>
        ) : selectedZoneNames.length === 0 && zones.length > 0 ? (
          <span className="text-[10px] font-mono text-muted-foreground/75">
            (Any zone if none selected)
          </span>
        ) : null}
      </div>
    </div>
  );
}
