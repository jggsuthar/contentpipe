"use client";

import { useState } from "react";
import { X, Plus, Sparkles, Scissors } from "lucide-react";
import {
  DbScheduleZone,
  PersonalTodoItem,
  ResistanceLevel,
} from "./schedule-types";
import { ZoneIcon } from "./zone-icon";

interface PersonalTodoModalProps {
  open: boolean;
  onClose: () => void;
  zones: DbScheduleZone[];
  targetUserId: string;
  defaultDate?: string;
  editingTodo?: PersonalTodoItem | null;
  onSaved: () => Promise<void> | void;
}

const RESISTANCE_OPTIONS: { value: ResistanceLevel; label: string }[] = [
  { value: "LOW", label: "Low (1.0x)" },
  { value: "MEDIUM", label: "Medium (2.0x)" },
  { value: "HIGH", label: "High (3.5x)" },
];

function PersonalTodoFormModal({
  onClose,
  zones,
  targetUserId,
  defaultDate,
  editingTodo,
  onSaved,
}: Omit<PersonalTodoModalProps, "open">) {
  const [title, setTitle] = useState(editingTodo?.title ?? "");
  const [durationMins, setDurationMins] = useState(
    editingTodo?.durationMins ?? 30
  );
  const [setupBufferMins, setSetupBufferMins] = useState(
    editingTodo?.setupBufferMins ?? 0
  );
  const [resistance, setResistance] = useState<ResistanceLevel>(
    (editingTodo?.resistance as ResistanceLevel) || "LOW"
  );
  const [isSplittable, setIsSplittable] = useState(
    Boolean(editingTodo?.isSplittable)
  );
  const [minSplitChunkMins, setMinSplitChunkMins] = useState(
    editingTodo?.minSplitChunkMins ?? 15
  );
  const [targetDate, setTargetDate] = useState<string>(
    editingTodo?.targetDate ?? defaultDate ?? ""
  );
  const [eligibleZoneIds, setEligibleZoneIds] = useState<string[]>(
    editingTodo?.eligibleZoneIds ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleZone = (zoneId: string) => {
    setEligibleZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Please enter a to-do title.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(editingTodo ? { id: editingTodo.id } : {}),
        targetUserId,
        title: trimmed,
        durationMins: Math.max(5, Math.round(durationMins || 30)),
        setupBufferMins: Math.max(0, Math.round(setupBufferMins || 0)),
        resistance,
        isSplittable,
        minSplitChunkMins: Math.max(5, Math.round(minSplitChunkMins || 15)),
        eligibleZoneIds,
        targetDate: targetDate.trim() || null,
      };

      const res = await fetch("/api/schedule/todos", {
        method: editingTodo ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to save personal to-do.");
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setError("Network error while saving personal to-do.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-border/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {editingTodo ? "Edit Personal To-Do" : "New Personal To-Do"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Placed on your calendar by the PWS engine or dragged directly
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2 text-xs text-rose-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              To-Do Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review sponsor contract / Clean studio SD cards"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs text-foreground outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Duration (mins)
              </label>
              <input
                type="number"
                min={5}
                max={720}
                step={5}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="glass-input w-full rounded-xl px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Setup Buffer (m)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                step={5}
                value={setupBufferMins}
                onChange={(e) => setSetupBufferMins(Number(e.target.value))}
                className="glass-input w-full rounded-xl px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Target Deadline
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="glass-input w-full rounded-xl px-2.5 py-2 text-xs text-foreground outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Cognitive Resistance
              </label>
              <div className="grid grid-cols-3 gap-1">
                {RESISTANCE_OPTIONS.map((opt) => {
                  const active = resistance === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setResistance(opt.value)}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                        active
                          ? "bg-primary/15 text-primary border-primary/40"
                          : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground"
                      }`}
                    >
                      {opt.value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Splitting Rules
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSplittable((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    isSplittable
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground"
                  }`}
                >
                  <Scissors className="w-3 h-3" />
                  {isSplittable ? "Splittable" : "Single Block"}
                </button>
                {isSplittable && (
                  <input
                    type="number"
                    min={5}
                    max={durationMins}
                    step={5}
                    value={minSplitChunkMins}
                    onChange={(e) => setMinSplitChunkMins(Number(e.target.value))}
                    title="Minimum split chunk (mins)"
                    className="glass-input w-16 rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none"
                  />
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Eligible Zones (&apos;OR&apos; Placement Logic)
              </label>
              <span className="text-[10px] text-muted-foreground">
                {eligibleZoneIds.length === 0
                  ? "Any zone allowed"
                  : `${eligibleZoneIds.length} zone(s) selected`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {zones.map((zone) => {
                const selected = eligibleZoneIds.includes(zone.id);
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => toggleZone(zone.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                      selected
                        ? "text-foreground shadow-xs"
                        : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground"
                    }`}
                    style={
                      selected
                        ? {
                            backgroundColor: `${zone.color}22`,
                            borderColor: `${zone.color}66`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: zone.color }}
                    />
                    <ZoneIcon icon={zone.icon} className="w-3 h-3" />
                    <span>{zone.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              {saving ? "Saving..." : editingTodo ? "Save Changes" : "Add To-Do"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PersonalTodoModal({
  open,
  ...rest
}: PersonalTodoModalProps) {
  if (!open) return null;
  const key = rest.editingTodo?.id ?? `new-${rest.defaultDate ?? ""}`;
  return <PersonalTodoFormModal key={key} {...rest} />;
}
