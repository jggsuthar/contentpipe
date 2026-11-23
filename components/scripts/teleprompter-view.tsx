"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FlipHorizontal,
  X,
  Sun,
  Moon,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  ScanLine,
  SlidersHorizontal,
} from "lucide-react";
import { ScriptRowData, ScriptColumnSchema } from "@/types/database";
import {
  extractNotesPagesForTeleprompter,
  hasNotesContent,
} from "@/lib/notes-utils";
import { useTheme } from "@/components/providers/theme-provider";

interface TeleprompterViewProps {
  rows: ScriptRowData[];
  columns?: ScriptColumnSchema[];
  notesText?: string;
  isNotesMainScript?: boolean;
  videoTitle: string;
  uniqueContentId: string | null;
  onExit: () => void;
}

type PrompterWidth = "narrow" | "medium" | "wide";

export function TeleprompterView({
  rows,
  columns = [],
  notesText = "",
  isNotesMainScript = false,
  videoTitle,
  uniqueContentId,
  onExit,
}: TeleprompterViewProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAccumRef = useRef<number>(0);

  const notesHasText = useMemo(() => hasNotesContent(notesText), [notesText]);

  // View Source: Table vs Notes
  const [viewSource, setViewSource] = useState<"table" | "notes">(
    isNotesMainScript && notesHasText ? "notes" : "table"
  );

  const notesPages = useMemo(
    () => extractNotesPagesForTeleprompter(notesText),
    [notesText]
  );

  // Surface color mode: defaults automatically to active app theme ("theme-dark" | "theme-bright"),
  // with 1-click manual override for glass beamsplitter rigs needing dark background during daytime.
  const [surfaceOverride, setSurfaceOverride] = useState<"dark" | "bright" | null>(null);
  const isDarkSurface =
    surfaceOverride !== null ? surfaceOverride === "dark" : theme === "theme-dark";

  // Teleprompter Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2); // 0.5x to 8x
  const [fontSize, setFontSize] = useState(34); // 20 to 64px
  const [lineHeight, setLineHeight] = useState(1.7);
  const [isMirrored, setIsMirrored] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "center">(
    isNotesMainScript && notesHasText ? "left" : "center"
  );
  const [readerWidth, setReaderWidth] = useState<PrompterWidth>("medium");
  const [showGuide, setShowGuide] = useState(true);
  const [hudHidden, setHudHidden] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Identify dynamic dialogue & roll columns
  const dialogueColId = useMemo(() => {
    if (!columns || columns.length === 0) return "col_dialogue";
    const exact = columns.find((c) => c.id === "col_dialogue" || c.id === "dialogue");
    if (exact) return exact.id;
    const byName = columns.find((c) => {
      const n = (c.name || "").toLowerCase();
      return n.includes("dialogue") || n.includes("spoken") || n.includes("speech");
    });
    if (byName) return byName.id;
    const textCols = columns.filter((c) => c.type === "text");
    return textCols[0]?.id || "col_dialogue";
  }, [columns]);

  const rollColId = useMemo(() => {
    if (!columns || columns.length === 0) return "col_roll";
    const exact = columns.find((c) => c.id === "col_roll" || c.id === "roll_type");
    if (exact) return exact.id;
    const byName = columns.find((c) => (c.name || "").toLowerCase().includes("roll"));
    return byName?.id || "col_roll";
  }, [columns]);

  const syncProgress = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    setScrollProgress(Math.min(100, Math.max(0, Math.round((el.scrollTop / maxScroll) * 100))));
  }, []);

  // Notify global AppHeader when teleprompter overlay is active so mobile bottom nav hides
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("contentpipe:teleprompter", { detail: { active: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("contentpipe:teleprompter", { detail: { active: false } }));
    };
  }, []);

  // Delta-time smooth sub-pixel auto-scroll loop
  useEffect(() => {
    if (!isPlaying) return;

    const el = containerRef.current;
    if (el) {
      scrollAccumRef.current = el.scrollTop;
    }

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const target = containerRef.current;
      if (!target) return;

      const dtSec = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
      if (target.scrollTop >= maxScroll - 1) {
        setIsPlaying(false);
        setScrollProgress(100);
        return;
      }

      // 32 px/sec baseline per 1.0x ensures even 0.5x scrolls smoothly on 60Hz-120Hz panels
      scrollAccumRef.current = Math.min(
        maxScroll,
        scrollAccumRef.current + scrollSpeed * 32 * dtSec
      );
      target.scrollTop = scrollAccumRef.current;
      syncProgress();

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, scrollSpeed, syncProgress]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    scrollAccumRef.current = 0;
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    setScrollProgress(0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.repeat) return;
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === "Escape") {
        onExit();
      } else if ((e.key === "r" || e.key === "R") && !e.repeat) {
        handleReset();
      } else if ((e.key === "m" || e.key === "M") && !e.repeat) {
        setIsMirrored((prev) => !prev);
      } else if ((e.key === "h" || e.key === "H") && !e.repeat) {
        setHudHidden((prev) => !prev);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setScrollSpeed((s) => Math.min(8, Number((s + 0.5).toFixed(1))));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setScrollSpeed((s) => Math.max(0.5, Number((s - 0.5).toFixed(1))));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit, handleReset]);

  const widthClass =
    readerWidth === "narrow"
      ? "max-w-xl"
      : readerWidth === "wide"
      ? "max-w-5xl"
      : "max-w-3xl";

  // Explicit theme-safe palettes (never rely on mismatched glass classes + hardcoded white text)
  const palette = isDarkSurface
    ? {
        root: "bg-[#06080e] text-[#f8fafc]",
        hud: "bg-[#0f172a]/92 text-[#f1f5f9] border-white/15 shadow-2xl",
        btn: "bg-white/10 hover:bg-white/20 text-white border-white/10",
        btnActive: "bg-emerald-500 text-slate-950 border-emerald-400 font-bold",
        pillTrack: "bg-white/8 border-white/10",
        muted: "text-slate-400",
        accent: "text-emerald-400",
        divider: "border-white/10",
        cardHover: "hover:bg-white/[0.03]",
        cueText: "text-slate-400",
        guideLine: "bg-emerald-400",
        guideBand: "bg-emerald-500/[0.05] border-y border-emerald-400/20",
        progressTrack: "bg-white/10",
        progressBar: "bg-emerald-400",
      }
    : {
        root: "bg-[#f8fafc] text-[#0f172a]",
        hud: "bg-white/95 text-[#0f172a] border-slate-200 shadow-lg",
        btn: "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200/80",
        btnActive: "bg-indigo-600 text-white border-indigo-600 font-bold",
        pillTrack: "bg-slate-100 border-slate-200",
        muted: "text-slate-500",
        accent: "text-indigo-600",
        divider: "border-slate-200",
        cardHover: "hover:bg-slate-900/[0.03]",
        cueText: "text-slate-500",
        guideLine: "bg-indigo-600",
        guideBand: "bg-indigo-600/[0.05] border-y border-indigo-600/20",
        progressTrack: "bg-slate-200",
        progressBar: "bg-indigo-600",
      };

  const renderedDialogueRows = useMemo(() => {
    return rows
      .map((row) => {
        let rawDialogue: unknown =
          row[dialogueColId] ?? row.col_dialogue ?? row.dialogue ?? "";

        if (!rawDialogue && columns && columns.length > 0) {
          for (const c of columns) {
            if (c.type === "text" && row[c.id]) {
              rawDialogue = row[c.id];
              break;
            }
          }
        }

        const dialogueText = String(rawDialogue || "").trim();
        if (!dialogueText) return null;

        const rawRoll = row[rollColId] ?? row.col_roll ?? row.roll_type ?? "";
        const rollText = String(rawRoll).trim();
        const rawCue = row.col_visual ?? row.description ?? "";
        const cueText = String(rawCue).trim();

        return { srNo: row.sr_no, dialogueText, rollText, cueText };
      })
      .filter(Boolean) as {
      srNo: number;
      dialogueText: string;
      rollText: string;
      cueText: string;
    }[];
  }, [rows, columns, dialogueColId, rollColId]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col overflow-hidden select-none font-sans transition-colors duration-200 ${palette.root}`}
    >
      {/* Top Reading Progress Bar */}
      <div className={`w-full h-1 shrink-0 ${palette.progressTrack}`}>
        <div
          className={`h-full transition-[width] duration-100 ${palette.progressBar}`}
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Compact Reveal Pill when HUD is Hidden */}
      {hudHidden && (
        <div className="fixed top-3 right-3 z-30 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold shadow-lg border cursor-pointer flex items-center gap-1.5 ${
              isPlaying
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400"
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? "Pause" : "Scroll"}</span>
          </button>
          <button
            type="button"
            onClick={() => setHudHidden(false)}
            className={`px-2.5 py-1.5 rounded-full text-xs font-mono border shadow-lg cursor-pointer flex items-center gap-1 backdrop-blur-md ${palette.hud}`}
            title="Show controls (H)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>HUD</span>
          </button>
        </div>
      )}

      {/* Mobile Portrait Slim Top Bar (< md) */}
      {!hudHidden && (
        <div className="md:hidden w-full px-2.5 pt-2.5 pb-1 z-20 shrink-0">
          <div
            className={`border backdrop-blur-xl rounded-2xl px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-mono ${palette.hud}`}
          >
            <button
              type="button"
              onClick={onExit}
              className={`min-h-[36px] px-2.5 py-1 rounded-xl border font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${palette.btn}`}
              title="Exit Teleprompter (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>

            <span className="font-bold text-xs truncate flex-1 min-w-0 text-center">
              {videoTitle}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {notesHasText && (
                <div className={`flex items-center p-0.5 rounded-xl border ${palette.pillTrack}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewSource("notes");
                      setTextAlign("left");
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                      viewSource === "notes" ? palette.btnActive : palette.muted
                    }`}
                  >
                    Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewSource("table")}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                      viewSource === "table" ? palette.btnActive : palette.muted
                    }`}
                  >
                    Table
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setHudHidden(true);
                }}
                className={`min-h-[36px] min-w-[36px] p-1.5 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${palette.btn}`}
                title="Hide controls (H)"
                aria-label="Hide HUD"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Top Floating HUD Control Bar (md+) */}
      {!hudHidden && (
        <div className="hidden md:block w-full max-w-6xl mx-auto px-3 pt-3 pb-1 z-20 shrink-0">
          <div
            className={`border backdrop-blur-xl rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono ${palette.hud}`}
          >
            {/* Left: Exit & Meta */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onExit}
                className={`px-2.5 py-1.5 rounded-xl border font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${palette.btn}`}
                title="Exit Teleprompter (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>

              <div className="hidden lg:block min-w-0">
                <span className="font-bold truncate max-w-[210px] block leading-tight">
                  {videoTitle}
                </span>
                <span className={`text-[10px] block ${palette.muted}`}>
                  {uniqueContentId ? `${uniqueContentId} • ` : ""}
                  Space: Play • ↑↓: Speed • H: Hide HUD
                </span>
              </div>
            </div>

            {/* Center: Playback & Speed */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleReset}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${palette.btn}`}
                title="Reset to top (R)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                  isPlaying
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                    : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? "Pause" : "Scroll"}</span>
              </button>

              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border ${palette.pillTrack}`}>
                <span className={`text-[10px] ${palette.muted}`}>Speed</span>
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                  className="w-16 sm:w-20 accent-emerald-500 cursor-pointer"
                />
                <span className={`font-bold text-xs w-8 ${palette.accent}`}>
                  {scrollSpeed}x
                </span>
              </div>
            </div>

            {/* Right: Size, Alignment, Width, Mirror, Surface Theme, Source */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Font Size */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-xl border ${palette.pillTrack}`}>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.max(20, s - 4))}
                  className="px-1.5 py-0.5 rounded hover:opacity-75 cursor-pointer font-bold"
                  title="Decrease font size"
                >
                  A-
                </button>
                <span className="font-bold text-[11px] w-9 text-center">{fontSize}px</span>
                <button
                  type="button"
                  onClick={() => setFontSize((s) => Math.min(64, s + 4))}
                  className="px-1.5 py-0.5 rounded hover:opacity-75 cursor-pointer font-bold"
                  title="Increase font size"
                >
                  A+
                </button>
              </div>

              {/* Line Width Selector */}
              <div className={`hidden sm:flex items-center p-0.5 rounded-xl border ${palette.pillTrack}`}>
                {(["narrow", "medium", "wide"] as PrompterWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setReaderWidth(w)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] capitalize transition-all cursor-pointer ${
                      readerWidth === w ? palette.btnActive : palette.muted
                    }`}
                    title={`Column width: ${w}`}
                  >
                    {w === "narrow" ? "S" : w === "medium" ? "M" : "L"}
                  </button>
                ))}
              </div>

              {/* Text Alignment Toggle */}
              <button
                type="button"
                onClick={() => setTextAlign((a) => (a === "center" ? "left" : "center"))}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${palette.btn}`}
                title={`Switch text alignment (currently ${textAlign})`}
              >
                {textAlign === "center" ? (
                  <AlignCenter className="w-3.5 h-3.5" />
                ) : (
                  <AlignLeft className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Reading Eye-Line Guide Toggle */}
              <button
                type="button"
                onClick={() => setShowGuide((g) => !g)}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                  showGuide ? palette.btnActive : palette.btn
                }`}
                title="Toggle camera eye-line guide"
              >
                <ScanLine className="w-3.5 h-3.5" />
              </button>

              {/* Mirror / Beamsplitter Flip */}
              <button
                type="button"
                onClick={() => setIsMirrored((m) => !m)}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                  isMirrored ? palette.btnActive : palette.btn
                }`}
                title="Mirror horizontally for beamsplitter glass rigs (M)"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>

              {/* Dark Rig vs Daylight Surface Switcher */}
              <button
                type="button"
                onClick={() => setSurfaceOverride(isDarkSurface ? "bright" : "dark")}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${palette.btn}`}
                title={
                  isDarkSurface
                    ? "Switch Teleprompter to Daylight Contrast"
                    : "Switch Teleprompter to Dark Studio Contrast"
                }
              >
                {isDarkSurface ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>

              {/* Hide HUD */}
              <button
                type="button"
                onClick={() => setHudHidden(true)}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${palette.btn}`}
                title="Hide controls (H)"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>

              {/* Source Switcher: Notes vs Table */}
              {notesHasText && (
                <div className={`flex items-center gap-0.5 p-0.5 rounded-xl border ${palette.pillTrack}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewSource("notes");
                      setTextAlign("left");
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                      viewSource === "notes" ? palette.btnActive : palette.muted
                    }`}
                  >
                    Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewSource("table")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                      viewSource === "table" ? palette.btnActive : palette.muted
                    }`}
                  >
                    Table
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Viewport Wrapper with Camera Eye-Line Guide */}
      <div className="relative flex-1 min-h-0">
        {showGuide && (
          <div
            className={`pointer-events-none absolute inset-x-0 top-[30%] -translate-y-1/2 h-24 z-10 flex items-center justify-between px-3 sm:px-6 ${palette.guideBand}`}
          >
            <div className={`w-6 sm:w-10 h-[2px] rounded-full opacity-80 ${palette.guideLine}`} />
            <div className={`w-6 sm:w-10 h-[2px] rounded-full opacity-80 ${palette.guideLine}`} />
          </div>
        )}

        {/* Scrollable Script Canvas (note: NO smooth-scroll class here so rAF stays silky) */}
        <div
          ref={containerRef}
          onScroll={() => {
            if (!isPlaying && containerRef.current) {
              scrollAccumRef.current = containerRef.current.scrollTop;
            }
            syncProgress();
          }}
          onClick={() => setIsPlaying((p) => !p)}
          className="h-full overflow-y-auto px-5 sm:px-10 md:px-16 pt-[24vh] pb-[60vh] cursor-pointer"
        >
          <div
            className={`${widthClass} mx-auto transition-transform duration-200 ${
              isMirrored ? "-scale-x-100" : ""
            } ${textAlign === "center" ? "text-center" : "text-left"}`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight,
            }}
          >
            {viewSource === "notes" ? (
              notesPages.length === 0 ? (
                <div className={`italic py-16 text-xl text-center ${palette.muted}`}>
                  No script text found in Notes.
                </div>
              ) : (
                notesPages.map((page) => (
                  <div
                    key={page.pageId}
                    className={`py-6 border-b rounded-2xl px-4 transition-colors ${palette.divider} ${palette.cardHover}`}
                  >
                    {notesPages.length > 1 && (
                      <div
                        className={`text-[11px] font-mono uppercase tracking-widest mb-3 select-none ${palette.accent}`}
                      >
                        {page.pageTitle}
                      </div>
                    )}
                    <div
                      className={`font-medium tracking-wide antialiased break-words space-y-4 [&_h1]:text-[1.4em] [&_h1]:font-extrabold [&_h1]:leading-tight [&_h2]:text-[1.22em] [&_h2]:font-bold [&_h2]:leading-tight [&_h3]:text-[1.1em] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-8 [&_ol]:list-decimal [&_ol]:pl-8 [&_li]:my-1.5 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:opacity-85 ${
                        textAlign === "center"
                          ? "[&_ul]:inline-block [&_ul]:text-left [&_ol]:inline-block [&_ol]:text-left"
                          : ""
                      }`}
                      dangerouslySetInnerHTML={{ __html: page.contentHtml }}
                    />
                  </div>
                ))
              )
            ) : renderedDialogueRows.length === 0 ? (
              <div className={`italic py-16 text-xl text-center ${palette.muted}`}>
                No dialogue lines found in Script Table.
              </div>
            ) : (
              renderedDialogueRows.map((row) => (
                <div
                  key={row.srNo}
                  className={`py-6 border-b rounded-2xl px-4 transition-colors ${palette.divider} ${palette.cardHover}`}
                >
                  <div
                    className={`text-[11px] font-mono uppercase tracking-widest mb-2 select-none ${palette.accent}`}
                  >
                    Line #{row.srNo} {row.rollText ? `• [${row.rollText}]` : ""}
                  </div>

                  <p className="font-medium tracking-wide antialiased whitespace-pre-wrap">
                    {row.dialogueText}
                  </p>

                  {row.cueText && (
                    <p className={`text-sm font-mono italic mt-2.5 ${palette.cueText}`}>
                      Action / Cue: {row.cueText}
                    </p>
                  )}
                </div>
              ))
            )}

            <div
              className={`py-36 text-center text-xs font-mono uppercase tracking-widest ${palette.muted}`}
            >
              — End of Script —
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Bottom Thumb Dock (< md) */}
      {!hudHidden && (
        <div className="md:hidden fixed bottom-4 inset-x-3 z-30 pb-[env(safe-area-inset-bottom)] font-mono text-xs">
          {/* Expandable Settings Popover */}
          {mobileMoreOpen && (
            <div
              className={`mb-2 rounded-2xl border p-3 backdrop-blur-xl shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150 ${palette.hud}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] ${palette.muted}`}>Width</span>
                <div className={`flex items-center p-0.5 rounded-xl border ${palette.pillTrack}`}>
                  {(["narrow", "medium", "wide"] as PrompterWidth[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setReaderWidth(w)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        readerWidth === w ? palette.btnActive : palette.muted
                      }`}
                    >
                      {w === "narrow" ? "S" : w === "medium" ? "M" : "L"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTextAlign((a) => (a === "center" ? "left" : "center"))}
                  className={`min-h-[38px] px-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${palette.btn}`}
                >
                  {textAlign === "center" ? (
                    <AlignCenter className="w-3.5 h-3.5" />
                  ) : (
                    <AlignLeft className="w-3.5 h-3.5" />
                  )}
                  <span>{textAlign === "center" ? "Center" : "Left"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGuide((g) => !g)}
                  className={`min-h-[38px] px-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${
                    showGuide ? palette.btnActive : palette.btn
                  }`}
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>Guide</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMirrored((m) => !m)}
                  className={`min-h-[38px] px-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${
                    isMirrored ? palette.btnActive : palette.btn
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Mirror</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSurfaceOverride(isDarkSurface ? "bright" : "dark")}
                  className={`min-h-[38px] px-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] cursor-pointer ${palette.btn}`}
                >
                  {isDarkSurface ? (
                    <Sun className="w-3.5 h-3.5" />
                  ) : (
                    <Moon className="w-3.5 h-3.5" />
                  )}
                  <span>{isDarkSurface ? "Day" : "Dark"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Thumb Dock Bar */}
          <div
            className={`border backdrop-blur-xl rounded-2xl px-2 py-2 shadow-2xl flex items-center justify-between gap-1.5 ${palette.hud}`}
          >
            <button
              type="button"
              onClick={handleReset}
              className={`min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${palette.btn}`}
              title="Reset to top"
              aria-label="Reset scroll"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className={`min-h-[38px] px-3 rounded-xl font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm shrink-0 ${
                isPlaying
                  ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>

            {/* Speed Slider */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border flex-1 min-w-0 ${palette.pillTrack}`}>
              <input
                type="range"
                min="0.5"
                max="8"
                step="0.5"
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                aria-label="Scroll speed"
                className="w-full min-w-[44px] accent-emerald-500 cursor-pointer"
              />
              <span className={`font-bold text-[11px] shrink-0 ${palette.accent}`}>
                {scrollSpeed}x
              </span>
            </div>

            {/* Font Size A- / A+ */}
            <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-xl border shrink-0 ${palette.pillTrack}`}>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.max(20, s - 4))}
                className="min-w-[28px] min-h-[34px] rounded-lg hover:opacity-75 cursor-pointer font-bold text-[11px]"
                title="Decrease font size"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.min(64, s + 4))}
                className="min-w-[28px] min-h-[34px] rounded-lg hover:opacity-75 cursor-pointer font-bold text-[11px]"
                title="Increase font size"
              >
                A+
              </button>
            </div>

            {/* Settings Popover Toggle */}
            <button
              type="button"
              onClick={() => setMobileMoreOpen((o) => !o)}
              className={`min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                mobileMoreOpen ? palette.btnActive : palette.btn
              }`}
              title="Teleprompter display settings"
              aria-label="More teleprompter settings"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
