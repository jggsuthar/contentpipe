"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FlipHorizontal,
  X,
} from "lucide-react";
import { ScriptRowData, ScriptColumnSchema } from "@/types/database";
import {
  extractNotesPagesForTeleprompter,
  hasNotesContent,
} from "@/lib/notes-utils";

interface TeleprompterViewProps {
  rows: ScriptRowData[];
  columns?: ScriptColumnSchema[];
  notesText?: string;
  isNotesMainScript?: boolean;
  videoTitle: string;
  uniqueContentId: string | null;
  onExit: () => void;
}

export function TeleprompterView({
  rows,
  columns = [],
  notesText = "",
  isNotesMainScript = false,
  videoTitle,
  uniqueContentId,
  onExit,
}: TeleprompterViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const notesHasText = React.useMemo(
    () => hasNotesContent(notesText),
    [notesText]
  );

  // View Source State: Table vs Notes
  const [viewSource, setViewSource] = useState<"table" | "notes">(
    isNotesMainScript && notesHasText ? "notes" : "table"
  );

  const notesSections = React.useMemo(() => {
    const pages = extractNotesPagesForTeleprompter(notesText);
    const items: { label: string; text: string }[] = [];
    const multiPage = pages.length > 1;
    for (const page of pages) {
      page.paragraphs.forEach((para, idx) => {
        items.push({
          label: multiPage
            ? `${page.pageTitle} • Section #${idx + 1}`
            : `Section #${idx + 1}`,
          text: para,
        });
      });
    }
    return items;
  }, [notesText]);

  // Teleprompter Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2); // 0.5 to 8
  const [fontSize, setFontSize] = useState(36); // 20 to 64px
  const [lineHeight, setLineHeight] = useState(1.8);
  const [isMirrored, setIsMirrored] = useState(false); // Horizontal flip for glass beam-splitter rigs

  // Identify dynamic dialogue column
  const dialogueColId = React.useMemo(() => {
    if (!columns || columns.length === 0) return "col_dialogue";
    // 1. Look for explicit matches
    const exact = columns.find(
      (c) => c.id === "col_dialogue" || c.id === "dialogue"
    );
    if (exact) return exact.id;

    // 2. Look for name matches containing dialogue or spoken words
    const byName = columns.find((c) => {
      const n = (c.name || "").toLowerCase();
      return n.includes("dialogue") || n.includes("spoken") || n.includes("speech");
    });
    if (byName) return byName.id;

    // 3. Fallback to widest text column
    const textCols = columns.filter((c) => c.type === "text");
    if (textCols.length > 0) return textCols[0].id;

    return "col_dialogue";
  }, [columns]);

  // Identify roll / cue column
  const rollColId = React.useMemo(() => {
    if (!columns || columns.length === 0) return "col_roll";
    const exact = columns.find((c) => c.id === "col_roll" || c.id === "roll_type");
    if (exact) return exact.id;
    const byName = columns.find((c) => (c.name || "").toLowerCase().includes("roll"));
    if (byName) return byName.id;
    return "col_roll";
  }, [columns]);

  // Auto-scroll loop
  useEffect(() => {
    let animationFrameId: number;

    const scrollStep = () => {
      if (isPlaying && containerRef.current) {
        containerRef.current.scrollTop += scrollSpeed * 0.6;
        // Check if reached bottom
        if (
          containerRef.current.scrollTop + containerRef.current.clientHeight >=
          containerRef.current.scrollHeight - 5
        ) {
          setIsPlaying(false);
        }
      }
      if (isPlaying) {
        animationFrameId = requestAnimationFrame(scrollStep);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(scrollStep);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, scrollSpeed]);

  // Keyboard shortcut: Spacebar to toggle Play/Pause, Esc to Exit, R to reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === "Escape") {
        onExit();
      } else if (e.key === "r" || e.key === "R") {
        handleReset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  const handleReset = () => {
    setIsPlaying(false);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0c] text-[#f4f4f5] flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Floating HUD Control Bar */}
      <div className="w-full max-w-5xl mx-auto p-4 z-20">
        <div className="glass-floating bg-[#111928]/80 border border-white/15 backdrop-blur-2xl rounded-2xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Left: Video Meta & Return */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExit}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit Prompter</span>
            </button>

            <div className="hidden sm:block">
              <span className="font-bold text-white/90 truncate max-w-xs block">
                {videoTitle}
              </span>
              <span className="text-[10px] text-white/50">
                {uniqueContentId ? `ID: ${uniqueContentId} • ` : ""}
                Spacebar: Play/Pause • Esc: Exit
              </span>
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Reset to top (R)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                isPlaying
                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? "Pause" : "Scroll"}</span>
            </button>

            {/* Speed slider (0.5x to 8x) */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/5 rounded-lg border border-white/5">
              <span className="text-[10px] text-white/60">Speed:</span>
              <input
                type="range"
                min="0.5"
                max="8"
                step="0.5"
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                className="w-20 accent-emerald-500 cursor-pointer"
              />
              <span className="font-bold text-emerald-400 text-xs w-8">{scrollSpeed}x</span>
            </div>
          </div>

          {/* Right: Typography & Mirror Toggle */}
          <div className="flex items-center gap-2">
            {/* Font Size A- / A+ */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
              <span className="text-[10px] text-white/60">Size:</span>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.max(20, s - 4))}
                className="px-1.5 py-0.5 hover:bg-white/10 rounded cursor-pointer text-white"
                title="Decrease font size"
              >
                A-
              </button>
              <span className="font-bold text-xs">{fontSize}px</span>
              <button
                type="button"
                onClick={() => setFontSize((s) => Math.min(64, s + 4))}
                className="px-1.5 py-0.5 hover:bg-white/10 rounded cursor-pointer text-white"
                title="Increase font size"
              >
                A+
              </button>
            </div>

            {/* Mirror / Flip Toggle (Beamsplitter Rig) */}
            <button
              type="button"
              onClick={() => setIsMirrored(!isMirrored)}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isMirrored
                  ? "bg-emerald-500 text-black border-emerald-500 font-bold"
                  : "bg-white/5 hover:bg-white/10 text-white border-white/5"
              }`}
              title="Mirror / Flip horizontally for glass beamsplitter rigs"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Source Switcher: Notes Script vs Table Script */}
            {notesHasText && (
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setViewSource("notes")}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    viewSource === "notes"
                      ? "bg-emerald-500 text-black font-bold shadow-xs"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Notes Script
                </button>
                <button
                  type="button"
                  onClick={() => setViewSource("table")}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    viewSource === "table"
                      ? "bg-emerald-500 text-black font-bold shadow-xs"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Table Script
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reading Text Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 md:px-16 py-32 scroll-smooth text-center"
      >
        <div
          className={`max-w-4xl mx-auto transition-transform duration-200 ${
            isMirrored ? "-scale-x-100" : ""
          }`}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          {/* Reader Lines */}
          {viewSource === "notes" ? (
            notesSections.length === 0 ? (
              <div className="text-white/40 italic py-16 text-xl">
                No script text found in Notes.
              </div>
            ) : (
              notesSections.map((sec, idx) => (
                <div
                  key={idx}
                  className="py-6 border-b border-white/5 hover:bg-white/[0.02] transition-colors rounded-xl px-4"
                >
                  <div className="text-[11px] font-mono text-emerald-400/70 uppercase tracking-widest mb-2 select-none">
                    {sec.label}
                  </div>
                  <p className="font-medium text-white/95 tracking-wide antialiased whitespace-pre-wrap leading-relaxed">
                    {sec.text}
                  </p>
                </div>
              ))
            )
          ) : (
            rows.map((row) => {
            let rawDialogue: unknown =
              row[dialogueColId] ??
              row.col_dialogue ??
              row.dialogue ??
              "";

            // If empty, search other columns in this row for text content
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

            return (
              <div
                key={row.sr_no}
                className="py-6 border-b border-white/5 hover:bg-white/[0.02] transition-colors rounded-xl px-4"
              >
                <div className="text-[11px] font-mono text-emerald-400/70 uppercase tracking-widest mb-2 select-none">
                  Line #{row.sr_no} {rollText ? `• [${rollText}]` : ""}
                </div>

                <p className="font-medium text-white/95 tracking-wide antialiased">
                  {dialogueText}
                </p>

                {cueText && (
                  <p className="text-xs font-mono text-white/40 italic mt-2">
                    Action / Cue: {cueText}
                  </p>
                )}
              </div>
            );
          })
        )}

          <div className="py-48 text-center text-sm font-mono text-white/30 uppercase tracking-widest">
            — End of Script —
          </div>
        </div>
      </div>

      {/* Center Reading Guide Markers */}
      <div className="fixed left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-between px-4 z-10 opacity-20">
        <div className="w-12 h-[1px] bg-emerald-400" />
        <div className="w-12 h-[1px] bg-emerald-400" />
      </div>
    </div>
  );
}
