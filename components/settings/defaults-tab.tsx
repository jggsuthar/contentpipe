"use client";

import React, { useState, useEffect } from "react";
import { useTheme, THEME_CONFIGS, migrateTheme } from "@/components/providers/theme-provider";
import {
  Sparkles,
  Sliders,
  Check,
  Calendar,
  Hash,
  Palette,
  Tags,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  getSessionCache,
  hydrateSessionCacheFromStorage,
  setSessionCache,
} from "@/lib/session-cache";

const DEFAULTS_CACHE_KEY = "settings:defaults";

interface DefaultsTabProps {
  isCreator?: boolean;
}

export function DefaultsTab({ isCreator = true }: DefaultsTabProps) {
  const { theme, setTheme } = useTheme();
  const initialCache = getSessionCache<any>(DEFAULTS_CACHE_KEY);

  const [loading, setLoading] = useState(!initialCache);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [monthsOpen, setMonthsOpen] = useState<number>(
    initialCache?.default_months_open || 3
  );
  const [categories, setCategories] = useState<string[]>(
    Array.isArray(initialCache?.feedback_categories)
      ? initialCache.feedback_categories
      : [
          "Pacing / Dead Air",
          "Audio / SFX",
          "B-Roll / Visuals",
          "Typography",
          "Retention Hook",
          "SOP Miss",
        ]
  );
  const [newCatInput, setNewCatInput] = useState("");

  // Fetch saved defaults from database (SWR)
  useEffect(() => {
    async function fetchDefaults(silent = false) {
      try {
        if (!silent) setLoading(true);
        const res = await fetch("/api/settings/defaults");
        if (res.ok) {
          const data = await res.json();
          if (data.default_months_open) setMonthsOpen(data.default_months_open);
          const savedLocal = typeof window !== "undefined" ? localStorage.getItem("creator_theme") : null;
          if (!savedLocal && data.default_theme) {
            setTheme(migrateTheme(data.default_theme));
          }
          if (Array.isArray(data.feedback_categories)) setCategories(data.feedback_categories);
          setSessionCache(DEFAULTS_CACHE_KEY, data);
        }
      } catch (err) {
        console.error("Failed to load settings defaults:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    }

    const cached =
      getSessionCache<any>(DEFAULTS_CACHE_KEY) ||
      hydrateSessionCacheFromStorage<any>(DEFAULTS_CACHE_KEY);
    if (cached) {
      if (cached.default_months_open) setMonthsOpen(cached.default_months_open);
      if (Array.isArray(cached.feedback_categories)) setCategories(cached.feedback_categories);
      setLoading(false);
      fetchDefaults(true);
    } else {
      fetchDefaults(false);
    }
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);

      const payload = {
        default_months_open: monthsOpen,
        default_id_generation_type: "date_counter",
        default_theme: theme,
        feedback_categories: categories,
      };
      const res = await fetch("/api/settings/defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSessionCache(DEFAULTS_CACHE_KEY, payload);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save defaults:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = () => {
    if (!newCatInput.trim()) return;
    if (categories.includes(newCatInput.trim())) return;
    setCategories([...categories, newCatInput.trim()]);
    setNewCatInput("");
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
  };

  if (loading) {
    return (
      <div className="card-theme p-12 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="font-mono text-xs text-muted-foreground">Loading creator preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Visual Theme Selector */}
      <div className="card-theme p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <Palette className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Interface Theme & Aesthetic Mode</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Per SPEC.md Section 3.1: Switch CSS Custom Properties instantly across the entire application without page reloads.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {THEME_CONFIGS.map((t) => {
            const isSelected = theme === t.id;
            return (
              <div
                key={t.id}
                onClick={async () => {
                  setTheme(t.id);
                  try {
                    await fetch("/api/settings/defaults", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ default_theme: t.id }),
                    });
                  } catch {}
                }}
                className={`p-5 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-md"
                    : "border-border hover:border-muted-foreground/40 glass-subtle"
                }`}
                style={{ borderRadius: "var(--radius)" }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm tracking-tight">{t.name}</span>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary text-primary-foreground flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    {t.vibe}
                  </p>
                </div>

                {/* Visual Palette Preview Dots */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  {t.id === "theme-dark" && (
                    <>
                      <div className="w-4 h-4 rounded-full bg-[#090d16] border border-white/20" title="Obsidian Base" />
                      <div className="w-4 h-4 rounded-full bg-[#111928] border border-white/20" title="Frosted Surface" />
                      <div className="w-4 h-4 rounded-full bg-[#6366f1]" title="Electric Indigo" />
                      <div className="w-4 h-4 rounded-full bg-[#10b981]" title="Emerald Jewel" />
                    </>
                  )}
                  {t.id === "theme-bright" && (
                    <>
                      <div className="w-4 h-4 rounded-full bg-[#f4f7fb] border border-slate-300" title="Pearl Sky" />
                      <div className="w-4 h-4 rounded-full bg-white border border-slate-300" title="Daylight Frost" />
                      <div className="w-4 h-4 rounded-full bg-[#4f46e5]" title="Royal Indigo" />
                      <div className="w-4 h-4 rounded-full bg-[#059669]" title="Emerald Contrast" />
                    </>
                  )}
                  <span className="text-[11px] font-mono text-muted-foreground ml-auto">
                    {t.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Tracker Defaults */}
      <div className="card-theme p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">Default Tracker Horizon</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          How far into the future the Main Tracker automatically generates placeholder rows by default.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 max-w-xl">
          {[1, 2, 3, 4, 5, 6].map((months) => (
            <button
              key={months}
              type="button"
              onClick={() => setMonthsOpen(months)}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold font-mono transition-all duration-250 border cursor-pointer ${
                monthsOpen === months
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "glass-subtle hover:bg-muted/60 text-foreground"
              }`}
            >
              {months} {months === 1 ? "Month" : "Months"}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border text-[11px] font-mono text-muted-foreground">
          Current Active Default: <strong className="text-foreground">{monthsOpen} Months</strong>
        </div>
      </div>

      {/* Section 3: Review Mistake Categories (Creator Only) */}
      {isCreator && (
        <div className="card-theme p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Tags className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base">Standardized Review & Mistake Categories</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Tags used when reviewing team submissions to track learning loops and count repeat mistakes over time.
          </p>

          {/* Existing tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium glass-subtle"
              >
                <span>{cat}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(cat)}
                  className="text-muted-foreground hover:text-destructive transition-colors duration-200 ml-1 cursor-pointer"
                  title={`Remove ${cat}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Add tag input */}
          <div className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCategory())}
              placeholder="Add new tag (e.g. Color Grading)..."
              className="flex-1 h-9 px-3 text-xs glass-input rounded-xl"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="h-9 px-3.5 rounded-xl text-xs font-semibold glass-subtle hover:bg-muted/60 text-foreground flex items-center gap-1.5 transition-all duration-250 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Tag</span>
            </button>
          </div>
        </div>
      )}

      {/* Save Action Bar */}
      <div className="flex items-center justify-between p-4 rounded-2xl card-theme">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-semibold text-status-done flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="w-4 h-4" /> Preferences saved successfully to database!
            </span>
          )}
          {!saveSuccess && (
            <span className="text-xs text-muted-foreground font-mono">
              Changes apply instantly across your channel matrix.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          style={{ borderRadius: "var(--radius)" }}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>Save Preferences</span>
        </button>
      </div>
    </div>
  );
}
