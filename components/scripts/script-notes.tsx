"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  NotebookPen,
  Star,
  Plus,
  X,
  Pencil,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  RemoveFormatting,
  Minus,
  Minimize2,
  Maximize2,
  PenTool,
  Type as TypeIcon,
  Highlighter,
  Eraser,
  Scissors,
  Eye,
  EyeOff,
  Hand,
  ShieldCheck,
  Trash2,
  ArrowDownToLine,
} from "lucide-react";
import {
  NotesDocument,
  NotesPage,
  NotesPageWidth,
  NoteStroke,
  NOTES_FONT_SIZES,
  DEFAULT_NOTES_FONT_SIZE,
  INK_COLOR_PRESETS,
  createNotesPage,
  parseNotesDocument,
  serializeNotesDocument,
  htmlToPlainText,
  sanitizeNotesHtml,
  plainTextToHtml,
} from "@/lib/notes-utils";
import {
  NotesInkLayer,
  NotesInkLayerHandle,
  ScribeActiveTool,
} from "@/components/scripts/notes-ink-layer";
import { useTheme } from "@/components/providers/theme-provider";

interface ScriptNotesProps {
  notes: string;
  canEdit: boolean;
  onUpdateNotes: (text: string) => void;
  isMainScript?: boolean;
  onToggleMainScript?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  isExpandedWorkspace?: boolean;
}

type BlockFormat = "p" | "h1" | "h2" | "h3" | "blockquote";

export function ScriptNotes({
  notes,
  canEdit,
  onUpdateNotes,
  isMainScript = false,
  onToggleMainScript,
  isMinimized = false,
  onToggleMinimize,
  isExpandedWorkspace = false,
}: ScriptNotesProps) {
  const doc: NotesDocument = useMemo(() => parseNotesDocument(notes), [notes]);

  const activePage: NotesPage = useMemo(
    () => doc.pages.find((p) => p.id === doc.activePageId) || doc.pages[0],
    [doc]
  );

  const { theme } = useTheme();
  const isDarkTheme = theme === "theme-dark";

  const editorRef = useRef<HTMLDivElement | null>(null);
  const paperSurfaceRef = useRef<HTMLDivElement | null>(null);
  const inkLayerRef = useRef<NotesInkLayerHandle | null>(null);
  const hasInitializedEditorRef = useRef<boolean>(false);
  const lastEmittedSerializedRef = useRef<string>(notes);
  const lastSyncedPageIdRef = useRef<string>(activePage.id);
  const savedRangeRef = useRef<Range | null>(null);

  // Page renaming state
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  // Mode: Type (rich text) vs Scribe (S Pen / Touch / Mouse ink directly on Notes)
  const [noteMode, setNoteMode] = useState<"type" | "scribe">("type");
  const [showInk, setShowInk] = useState<boolean>(true);
  const [scribeTool, setScribeTool] = useState<ScribeActiveTool>("pen");
  const [inkColor, setInkColor] = useState<string>("auto");
  const [penSize, setPenSize] = useState<number>(2);
  const [eraserSize, setEraserSize] = useState<number>(18);
  const [allowFingerDraw, setAllowFingerDraw] = useState<boolean>(true);
  const [palmRejection, setPalmRejection] = useState<boolean>(true);
  const [viewerPageWidths, setViewerPageWidths] = useState<Record<string, NotesPageWidth>>({});
  const effectivePageWidth: NotesPageWidth =
    viewerPageWidths[activePage.id] || activePage.pageWidth || "a4";

  // Active toolbar state
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
    align: "left" as "left" | "center" | "right",
    block: "p" as BlockFormat,
    fontSize: activePage.fontSize || DEFAULT_NOTES_FONT_SIZE,
  });

  // Track editor HTML sync on initial mount, expand, page switch, or external Undo/Redo update
  useEffect(() => {
    if (isMinimized) {
      hasInitializedEditorRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;

    const isInitialMount = !hasInitializedEditorRef.current;
    const pageChanged = lastSyncedPageIdRef.current !== activePage.id;
    const externalUpdate = notes !== lastEmittedSerializedRef.current;

    if (isInitialMount || pageChanged || externalUpdate) {
      if (el.innerHTML !== activePage.contentHtml) {
        el.innerHTML = activePage.contentHtml || "";
      }
      hasInitializedEditorRef.current = true;
      lastSyncedPageIdRef.current = activePage.id;
      lastEmittedSerializedRef.current = notes;
    }
  }, [isMinimized, activePage.id, activePage.contentHtml, notes]);

  // Keep fontSize indicator synced when switching pages
  useEffect(() => {
    setActiveFormats((prev) => ({
      ...prev,
      fontSize: activePage.fontSize || DEFAULT_NOTES_FONT_SIZE,
    }));
  }, [activePage.id, activePage.fontSize]);

  const emitDocument = useCallback(
    (nextDoc: NotesDocument) => {
      const serialized = serializeNotesDocument(nextDoc);
      lastEmittedSerializedRef.current = serialized;
      onUpdateNotes(serialized);
    },
    [onUpdateNotes]
  );

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || !savedRangeRef.current) return;
    if (el.contains(savedRangeRef.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  }, []);

  const refreshToolbarState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (!el.contains(sel.anchorNode)) return;

    saveSelection();

    let detectedBlock: BlockFormat = "p";
    let detectedFontSize = activePage.fontSize || DEFAULT_NOTES_FONT_SIZE;

    let node: Node | null = sel.anchorNode;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const htmlEl = node as HTMLElement;
        const tag = htmlEl.tagName.toLowerCase();
        if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "blockquote") {
          detectedBlock = tag as BlockFormat;
        }
        if (htmlEl.style?.fontSize && htmlEl.style.fontSize.endsWith("px")) {
          const parsedPx = parseInt(htmlEl.style.fontSize, 10);
          if (!Number.isNaN(parsedPx)) {
            detectedFontSize = parsedPx;
          }
        }
      }
      node = node.parentNode;
    }

    let align: "left" | "center" | "right" = "left";
    try {
      if (document.queryCommandState("justifyCenter")) align = "center";
      else if (document.queryCommandState("justifyRight")) align = "right";

      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        unorderedList: document.queryCommandState("insertUnorderedList"),
        orderedList: document.queryCommandState("insertOrderedList"),
        align,
        block: detectedBlock,
        fontSize: detectedFontSize,
      });
    } catch {
      // queryCommandState can throw in edge browsers
    }
  }, [activePage.fontSize, saveSelection]);

  useEffect(() => {
    const handleSelectionChange = () => refreshToolbarState();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [refreshToolbarState]);

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current;
    if (!el || !canEdit) return;
    const html = el.innerHTML;
    const plain = htmlToPlainText(html);

    const nextPages = doc.pages.map((p) =>
      p.id === activePage.id
        ? { ...p, contentHtml: html, plainText: plain }
        : p
    );

    emitDocument({
      ...doc,
      pages: nextPages,
    });
  }, [canEdit, doc, activePage.id, emitDocument]);

  const execCommand = (command: string, value?: string) => {
    if (!canEdit) return;
    restoreSelection();
    document.execCommand(command, false, value);
    handleEditorInput();
    refreshToolbarState();
  };

  const applyBlockFormat = (format: BlockFormat) => {
    if (!canEdit) return;
    restoreSelection();
    const tagMap: Record<BlockFormat, string> = {
      p: "P",
      h1: "H1",
      h2: "H2",
      h3: "H3",
      blockquote: "BLOCKQUOTE",
    };
    document.execCommand("formatBlock", false, tagMap[format]);
    handleEditorInput();
    refreshToolbarState();
  };

  const applyFontSize = (sizePx: number) => {
    if (!canEdit) return;
    const clamped = Math.max(10, Math.min(48, sizePx));
    const el = editorRef.current;
    if (!el) return;

    restoreSelection();
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      // Apply font size cleanly to highlighted range
      document.execCommand("fontSize", false, "7");
      const fontTags = el.querySelectorAll('font[size="7"]');
      fontTags.forEach((fontEl) => {
        const span = document.createElement("span");
        span.style.fontSize = `${clamped}px`;
        span.innerHTML = fontEl.innerHTML;
        fontEl.parentNode?.replaceChild(span, fontEl);
      });
      handleEditorInput();
    } else {
      // No text selected: set page base font size so all unstyled text / new typing reflects it
      const nextPages = doc.pages.map((p) =>
        p.id === activePage.id ? { ...p, fontSize: clamped } : p
      );
      emitDocument({
        ...doc,
        pages: nextPages,
      });
    }

    setActiveFormats((prev) => ({ ...prev, fontSize: clamped }));
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;

    // Tab / Shift+Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand(e.shiftKey ? "outdent" : "indent", false);
      handleEditorInput();
      return;
    }

    // Inline formatting shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        execCommand("bold");
      } else if (k === "i") {
        e.preventDefault();
        execCommand("italic");
      } else if (k === "u") {
        e.preventDefault();
        execCommand("underline");
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.preventDefault();

    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");

    if (html && html.trim()) {
      const cleanedHtml = sanitizeNotesHtml(html);
      if (cleanedHtml && cleanedHtml.trim()) {
        const inserted = document.execCommand("insertHTML", false, cleanedHtml);
        if (inserted) {
          handleEditorInput();
          refreshToolbarState();
          return;
        }
      }
    }

    if (plain) {
      const fallbackHtml = plainTextToHtml(plain);
      if (fallbackHtml) {
        document.execCommand("insertHTML", false, fallbackHtml);
      } else {
        document.execCommand("insertText", false, plain);
      }
      handleEditorInput();
      refreshToolbarState();
    }
  };

  const handleSetPageWidth = (nextWidth: NotesPageWidth) => {
    setViewerPageWidths((prev) => ({ ...prev, [activePage.id]: nextWidth }));
    if (!canEdit) return;
    const nextPages = doc.pages.map((p) =>
      p.id === activePage.id ? { ...p, pageWidth: nextWidth } : p
    );
    emitDocument({
      ...doc,
      pages: nextPages,
    });
  };

  // Page management handlers
  const handleSelectPage = (pageId: string) => {
    if (pageId === activePage.id) return;
    emitDocument({
      ...doc,
      activePageId: pageId,
    });
  };

  const handleAddPage = () => {
    if (!canEdit) return;
    let nextNum = doc.pages.length + 1;
    const existingNames = new Set(doc.pages.map((p) => p.title.toLowerCase()));
    while (existingNames.has(`page ${nextNum}`)) {
      nextNum++;
    }
    const newPage = createNotesPage(`Page ${nextNum}`);
    newPage.fontSize = activePage.fontSize || DEFAULT_NOTES_FONT_SIZE;

    emitDocument({
      ...doc,
      activePageId: newPage.id,
      pages: [...doc.pages, newPage],
    });
  };

  const handleDeletePage = (e: React.MouseEvent, page: NotesPage) => {
    e.stopPropagation();
    if (!canEdit || doc.pages.length <= 1) return;

    const hasContent =
      (page.plainText || htmlToPlainText(page.contentHtml)).trim().length > 0 ||
      (page.strokes?.length || 0) > 0;
    if (hasContent) {
      const confirmed = window.confirm(
        `Delete page "${page.title}"? (You can also undo with Ctrl+Z.)`
      );
      if (!confirmed) return;
    }

    const idx = doc.pages.findIndex((p) => p.id === page.id);
    const remaining = doc.pages.filter((p) => p.id !== page.id);
    const nextActiveId =
      doc.activePageId === page.id
        ? (remaining[Math.max(0, idx - 1)] || remaining[0]).id
        : doc.activePageId;

    emitDocument({
      ...doc,
      activePageId: nextActiveId,
      pages: remaining,
    });
  };

  const startRenamePage = (page: NotesPage) => {
    if (!canEdit) return;
    setRenamingPageId(page.id);
    setRenameValue(page.title);
  };

  const commitRenamePage = () => {
    if (!renamingPageId) return;
    const clean = renameValue.trim();
    if (clean) {
      const nextPages = doc.pages.map((p) =>
        p.id === renamingPageId ? { ...p, title: clean } : p
      );
      emitDocument({ ...doc, pages: nextPages });
    }
    setRenamingPageId(null);
  };

  // Ink / Scribing handlers (per page, automatically saved & undoable)
  const handleStrokesChange = useCallback(
    (nextStrokes: NoteStroke[]) => {
      if (!canEdit) return;
      const nextPages = doc.pages.map((p) =>
        p.id === activePage.id ? { ...p, strokes: nextStrokes } : p
      );
      emitDocument({ ...doc, pages: nextPages });
    },
    [canEdit, doc, activePage.id, emitDocument]
  );

  const handleClearPageInk = () => {
    if (!canEdit || !activePage.strokes?.length) return;
    const confirmed = window.confirm(
      `Clear all ink drawings on "${activePage.title}"? (Undoable with Ctrl+Z)`
    );
    if (!confirmed) return;
    handleStrokesChange([]);
  };

  const handleAddWritingSpace = (deltaPx: number) => {
    if (!canEdit) return;
    const current = activePage.extraHeight || 0;
    const nextExtra = deltaPx === 0 ? 0 : Math.min(4000, current + deltaPx);
    const nextPages = doc.pages.map((p) =>
      p.id === activePage.id ? { ...p, extraHeight: nextExtra } : p
    );
    emitDocument({ ...doc, pages: nextPages });
  };

  const handleSwitchMode = (nextMode: "type" | "scribe") => {
    setNoteMode(nextMode);
    if (nextMode === "scribe" && !showInk) {
      setShowInk(true);
    }
  };

  // Word & character counts across active page and total document
  const activePlain = activePage.plainText || htmlToPlainText(activePage.contentHtml);
  const activeWords = activePlain.trim() ? activePlain.trim().split(/\s+/).length : 0;
  const totalWords = doc.pages.reduce((sum, p) => {
    const t = (p.plainText || htmlToPlainText(p.contentHtml)).trim();
    return sum + (t ? t.split(/\s+/).length : 0);
  }, 0);

  const activeStrokeCount = activePage.strokes?.length || 0;
  const isEditorEmpty = activePlain.trim().length === 0 && activeStrokeCount === 0;
  const baseFontSize = activePage.fontSize || DEFAULT_NOTES_FONT_SIZE;
  const extraHeight = activePage.extraHeight || 0;

  return (
    <div
      className={`card-theme rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-250 ${
        isMainScript ? "border-primary/50 shadow-md ring-1 ring-primary/25" : ""
      }`}
    >
      {/* Persistent Header Bar (identical across minimized & expanded views) */}
      <div
        onClick={() => onToggleMinimize?.()}
        role={onToggleMinimize ? "button" : undefined}
        tabIndex={onToggleMinimize ? 0 : undefined}
        onKeyDown={(e) => {
          if (onToggleMinimize && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggleMinimize();
          }
        }}
        title={
          onToggleMinimize
            ? isMinimized
              ? "Click bar to expand Notes"
              : "Click bar to minimize Notes"
            : undefined
        }
        className={`px-2.5 py-2 sm:px-4 sm:py-2.5 bg-muted/40 flex flex-wrap items-center justify-between gap-2 text-xs select-none transition-colors ${
          onToggleMinimize ? "cursor-pointer hover:bg-muted/60" : ""
        } ${isMinimized ? "" : "border-b border-border/60"}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <div
            className={`p-1.5 rounded-md shrink-0 ${
              isMainScript
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            <NotebookPen className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold font-mono text-foreground">Notes</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60">
            {doc.pages.length} {doc.pages.length === 1 ? "Page" : "Pages"} • Page: {activeWords}w
            {doc.pages.length > 1 ? ` • All: ${totalWords}w` : ""}
            {activeStrokeCount > 0 ? ` • ${activeStrokeCount} ink` : ""}
          </span>
          {isMainScript && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
              <Star className="w-2.5 h-2.5 fill-primary text-primary" />
              <span>Main Script Active</span>
            </span>
          )}
          <span className="hidden xl:inline text-[10px] font-mono text-muted-foreground/80">
            {isMainScript
              ? "Hero view • All pages feed Teleprompter"
              : "Multi-page rich notes & formatting scratchpad"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onToggleMainScript && canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMainScript();
              }}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-all duration-250 border shadow-xs ${
                isMainScript
                  ? "bg-primary/15 hover:bg-primary/25 text-primary border-primary/40 font-bold"
                  : "glass-subtle hover:border-primary/40 text-foreground"
              }`}
              title={
                isMainScript
                  ? "Switch back to Tabular Script as primary"
                  : "Promote Notes to Hero Main Script and use for Teleprompter"
              }
            >
              <Star
                className={`w-3 h-3 ${
                  isMainScript ? "fill-primary text-primary" : "text-muted-foreground"
                }`}
              />
              <span>{isMainScript ? "Primary Script (Active)" : "Make Main Script"}</span>
            </button>
          )}

          {onToggleMinimize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMinimize();
              }}
              className="px-2.5 py-1 rounded-xl text-[11px] font-semibold glass-subtle hover:border-primary/40 text-foreground flex items-center gap-1.5 cursor-pointer transition-all"
              title={
                isMinimized
                  ? "Expand Notes section"
                  : "Minimize Notes to give Script Table more screen space"
              }
            >
              {isMinimized ? (
                <>
                  <Maximize2 className="w-3 h-3 text-primary" />
                  <span>Expand</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Minimize</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <div className="p-1.5 sm:p-4 md:p-5 space-y-2 sm:space-y-3">
          {/* Pages Tab Strip + Type/Scribe Mode Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 min-w-0 max-w-full">
              {doc.pages.map((page) => {
                const isActive = page.id === activePage.id;
                const isRenaming = renamingPageId === page.id;

                return (
                  <div
                    key={page.id}
                    onClick={() => !isRenaming && handleSelectPage(page.id)}
                    onDoubleClick={() => startRenamePage(page)}
                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all shrink-0 border cursor-pointer ${
                      isActive
                        ? "bg-primary/15 text-primary border-primary/40 font-semibold shadow-xs"
                        : "glass-subtle text-muted-foreground hover:text-foreground hover:border-primary/30"
                    }`}
                    title={canEdit ? "Click to open • Double-click to rename" : page.title}
                  >
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRenamePage}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRenamePage();
                          } else if (e.key === "Escape") {
                            setRenamingPageId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-24 bg-background/80 border border-primary/50 rounded px-1.5 py-0.5 text-[11px] focus:outline-none text-foreground"
                      />
                    ) : (
                      <>
                        <span className="max-w-[140px] truncate text-[11px]">
                          {page.title}
                        </span>
                        {(page.strokes?.length || 0) > 0 && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0"
                            title={`${page.strokes?.length} ink strokes`}
                          />
                        )}
                        {canEdit && isActive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenamePage(page);
                            }}
                            className="opacity-60 hover:opacity-100 p-0.5 rounded hover:bg-primary/15 transition-opacity cursor-pointer"
                            title="Rename page"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {canEdit && doc.pages.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeletePage(e, page)}
                            className="opacity-60 hover:opacity-100 hover:text-destructive p-0.5 rounded hover:bg-destructive/15 transition-all cursor-pointer"
                            title="Delete page"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleAddPage}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-primary hover:border-primary/40 transition-all shrink-0 cursor-pointer"
                  title="Add a new Notes page"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Page</span>
                </button>
              )}
            </div>

            {/* Right: Per-Page Width (A4 vs Full) + Ink Toggle + Mode Switch */}
            <div className="flex items-center gap-1.5 shrink-0 flex-nowrap overflow-x-auto no-scrollbar max-w-full">
              {/* Per-Page Width Segmented Switch */}
              <div
                className="flex items-center p-0.5 rounded-xl glass-subtle border border-border/70"
                title={`Page width for "${activePage.title}" (A4 sheet vs Full width)`}
              >
                <button
                  type="button"
                  onClick={() => handleSetPageWidth("a4")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                    effectivePageWidth === "a4"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  A4
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPageWidth("full")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                    effectivePageWidth === "full"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Full
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowInk((v) => !v)}
                className={`px-2 py-1 rounded-xl text-[11px] font-medium flex items-center gap-1 border transition-all cursor-pointer ${
                  showInk
                    ? "glass-subtle text-foreground border-border/70"
                    : "bg-muted/40 text-muted-foreground border-border/40"
                }`}
                title={showInk ? "Hide handwriting ink" : "Show handwriting ink"}
              >
                {showInk ? (
                  <Eye className="w-3 h-3 text-primary" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">
                  {showInk ? "Ink On" : "Ink Hidden"}
                </span>
              </button>

              {canEdit && (
                <div className="flex items-center p-0.5 rounded-xl glass-subtle border border-border/70">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode("type")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      noteMode === "type"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Rich Text Typing Mode"
                  >
                    <TypeIcon className="w-3 h-3" />
                    <span>Type</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode("scribe")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      noteMode === "scribe"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Scribe with S Pen, Finger, or Mouse directly on this page"
                  >
                    <PenTool className="w-3 h-3" />
                    <span>Scribe</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mode-Specific Toolbar: Rich Text Formatting OR Focused Scribing Bar */}
          {canEdit && noteMode === "type" && (
            <div className="flex flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap items-center gap-1.5 p-1.5 rounded-xl glass-subtle border border-border/70">
          {/* Block Heading Style */}
          <select
            value={activeFormats.block}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => applyBlockFormat(e.target.value as BlockFormat)}
            aria-label="Text style"
            className="h-9 md:h-7 px-2 rounded-lg text-xs md:text-[11px] font-medium glass-input cursor-pointer shrink-0"
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>

          {/* Font Size Controls */}
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-background/40 border border-border/60 shrink-0 min-h-[36px] md:min-h-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFontSize(activeFormats.fontSize - 2)}
              className="p-1.5 md:p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              title="Decrease font size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <select
              value={
                NOTES_FONT_SIZES.includes(activeFormats.fontSize as any)
                  ? activeFormats.fontSize
                  : "custom"
              }
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) applyFontSize(v);
              }}
              aria-label="Font size"
              className="h-6 px-1 rounded text-[11px] font-mono bg-transparent focus:outline-none cursor-pointer"
            >
              {!NOTES_FONT_SIZES.includes(activeFormats.fontSize as any) && (
                <option value="custom">{activeFormats.fontSize}px</option>
              )}
              {NOTES_FONT_SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}px
                </option>
              ))}
            </select>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFontSize(activeFormats.fontSize + 2)}
              className="p-1.5 md:p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              title="Increase font size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Inline Formatting */}
          <ToolbarBtn
            active={activeFormats.bold}
            onClick={() => execCommand("bold")}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.italic}
            onClick={() => execCommand("italic")}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.underline}
            onClick={() => execCommand("underline")}
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.strikeThrough}
            onClick={() => execCommand("strikeThrough")}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Lists & Quote */}
          <ToolbarBtn
            active={activeFormats.unorderedList}
            onClick={() => execCommand("insertUnorderedList")}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.orderedList}
            onClick={() => execCommand("insertOrderedList")}
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.block === "blockquote"}
            onClick={() =>
              applyBlockFormat(activeFormats.block === "blockquote" ? "p" : "blockquote")
            }
            title="Blockquote"
          >
            <Quote className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Indentation */}
          <ToolbarBtn
            active={false}
            onClick={() => execCommand("indent")}
            title="Increase Indent (Tab)"
          >
            <IndentIncrease className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            onClick={() => execCommand("outdent")}
            title="Decrease Indent (Shift+Tab)"
          >
            <IndentDecrease className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-border/70 mx-0.5 hidden sm:block" />

          {/* Alignment */}
          <ToolbarBtn
            active={activeFormats.align === "left"}
            onClick={() => execCommand("justifyLeft")}
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.align === "center"}
            onClick={() => execCommand("justifyCenter")}
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            active={activeFormats.align === "right"}
            onClick={() => execCommand("justifyRight")}
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Clear Formatting */}
          <ToolbarBtn
            active={false}
            onClick={() => {
              execCommand("removeFormat");
              applyBlockFormat("p");
            }}
            title="Clear Formatting"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>
      )}

      {/* Focused Scribing Toolbar (S Pen, Touch & Mouse) */}
      {canEdit && noteMode === "scribe" && (
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar md:flex-wrap items-center gap-1.5 p-1.5 rounded-xl glass-subtle border border-primary/30 bg-primary/5">
          {/* Pen & Highlighter */}
          <div className="flex items-center gap-1 shrink-0">
            <ToolbarBtn
              active={scribeTool === "pen"}
              onClick={() => setScribeTool("pen")}
              title="Pen (S Pen pressure-sensitive)"
            >
              <PenTool className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              active={scribeTool === "highlighter"}
              onClick={() => setScribeTool("highlighter")}
              title="Highlighter (renders underneath ink)"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </div>

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Two Erasers: Whole-Line Stroke Eraser + Partial Vector Eraser */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setScribeTool("eraser_stroke")}
              title="Stroke Eraser: tap or swipe anywhere on a line to erase the entire line"
              className={`min-h-[36px] md:min-h-0 px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
                scribeTool === "eraser_stroke"
                  ? "bg-rose-500/20 text-rose-500 border-rose-500/40 shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent"
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Line Eraser</span>
            </button>
            <button
              type="button"
              onClick={() => setScribeTool("eraser_partial")}
              title="Partial Eraser: precision vector split eraser"
              className={`min-h-[36px] md:min-h-0 px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
                scribeTool === "eraser_partial"
                  ? "bg-primary/20 text-primary border-primary/40 shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent"
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Partial</span>
            </button>
          </div>

          {/* Size Presets (Pen thickness OR Partial Eraser size) */}
          {scribeTool === "pen" && (
            <>
              <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {[1, 2, 4, 6].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setPenSize(sz)}
                    className={`min-h-[36px] md:min-h-0 px-2 md:px-1.5 py-0.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer border shrink-0 ${
                      penSize === sz
                        ? "bg-primary/20 text-primary border-primary/40 font-bold"
                        : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/50"
                    }`}
                    title={`${sz}px stroke`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </>
          )}

          {scribeTool === "eraser_partial" && (
            <>
              <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                {[
                  { sz: 10, label: "S" },
                  { sz: 18, label: "M" },
                  { sz: 30, label: "L" },
                ].map((opt) => (
                  <button
                    key={opt.sz}
                    type="button"
                    onClick={() => setEraserSize(opt.sz)}
                    className={`min-h-[36px] md:min-h-0 px-2.5 md:px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer border shrink-0 ${
                      eraserSize === opt.sz
                        ? "bg-primary/20 text-primary border-primary/40 font-bold"
                        : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/50"
                    }`}
                    title={`${opt.sz}px precision eraser`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 6 Curated Ink Colors (shown for Pen & Highlighter) */}
          {(scribeTool === "pen" || scribeTool === "highlighter") && (
            <>
              <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />
              <div className="flex items-center gap-1.5 px-1 shrink-0">
                {INK_COLOR_PRESETS.map((preset) => {
                  const swatchColor =
                    preset.id === "auto"
                      ? isDarkTheme
                        ? "#f4f4f5"
                        : "#18181b"
                      : preset.id;
                  const isSelected = inkColor === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setInkColor(preset.id)}
                      title={preset.label}
                      className={`w-6 h-6 md:w-5 md:h-5 rounded-full flex items-center justify-center transition-transform cursor-pointer border shrink-0 ${
                        isSelected
                          ? "scale-115 ring-2 ring-primary ring-offset-1 ring-offset-background border-primary"
                          : "border-border/80 hover:scale-105"
                      }`}
                      style={{ backgroundColor: swatchColor }}
                    >
                      {preset.id === "auto" && (
                        <span
                          className={`text-[8px] font-bold leading-none ${
                            isDarkTheme ? "text-zinc-900" : "text-white"
                          }`}
                        >
                          A
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="w-px h-5 bg-border/70 mx-0.5 shrink-0" />

          {/* Touch & Samsung S Pen Controls */}
          <button
            type="button"
            onClick={() => setAllowFingerDraw((v) => !v)}
            className={`min-h-[36px] md:min-h-0 px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
              allowFingerDraw
                ? "bg-primary/15 text-primary border-primary/35"
                : "bg-muted/50 text-muted-foreground border-border/70 hover:text-foreground"
            }`}
            title={
              allowFingerDraw
                ? "Finger Drawing ON (Click to switch to S Pen Only so 1 finger scrolls)"
                : "S Pen Only (1 finger scrolls naturally while S Pen draws)"
            }
          >
            <Hand className="w-3 h-3" />
            <span>{allowFingerDraw ? "Finger: ON" : "S Pen Only"}</span>
          </button>

          <button
            type="button"
            onClick={() => setPalmRejection((v) => !v)}
            className={`min-h-[36px] md:min-h-0 px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
              palmRejection
                ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/35"
                : "bg-muted/50 text-muted-foreground border-border/70"
            }`}
            title="Palm Rejection: ignores resting palm and finger touches while S Pen is active"
          >
            <ShieldCheck className="w-3 h-3" />
            <span className="hidden md:inline">Palm Reject</span>
          </button>

          {activeStrokeCount > 0 && (
            <button
              type="button"
              onClick={handleClearPageInk}
              className="ml-auto min-h-[36px] md:min-h-0 px-2 py-1 rounded-lg text-[11px] font-medium text-destructive hover:bg-destructive/15 border border-transparent hover:border-destructive/30 flex items-center gap-1 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="Clear all ink strokes on this page (Undoable with Ctrl+Z)"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Clear Ink</span>
            </button>
          )}
        </div>
      )}

      {/* Unified Scrollable Paper (Rich Text + Synchronized Vector Ink Overlay) */}
      <div
        className={`relative w-full rounded-xl glass-input overflow-y-auto resize-y ${
          effectivePageWidth === "a4"
            ? "bg-background/85 sm:bg-muted/25 px-0 py-0 sm:px-6 sm:py-5"
            : ""
        } ${
          isExpandedWorkspace
            ? "h-[calc(100dvh-355px)] min-h-[260px]"
            : isMainScript
            ? "h-[360px] min-h-[240px]"
            : "h-[240px] min-h-[180px]"
        }`}
      >
        <div
          ref={paperSurfaceRef}
          onPointerDownCapture={(e) => {
            // Instant S Pen auto-switch from Type mode -> Scribe mode on first contact
            if (
              canEdit &&
              noteMode === "type" &&
              e.nativeEvent.pointerType === "pen"
            ) {
              e.preventDefault();
              setNoteMode("scribe");
              if (!showInk) setShowInk(true);
              inkLayerRef.current?.beginExternalPenStroke(e.nativeEvent);
            }
          }}
          style={{ paddingBottom: `${extraHeight}px` }}
          className={`relative min-h-full transition-[max-width] duration-200 ${
            effectivePageWidth === "a4"
              ? "max-w-[794px] w-full mx-auto rounded-none sm:rounded-xl bg-background/85 border-0 sm:border sm:border-border/70 sm:shadow-sm"
              : "w-full"
          }`}
        >
          {isEditorEmpty && (
            <div
              className={`pointer-events-none absolute top-2.5 left-2.5 right-2.5 text-muted-foreground/60 select-none z-0 ${
                effectivePageWidth === "a4"
                  ? "sm:top-8 sm:left-8 sm:right-8"
                  : "sm:top-4 sm:left-4 sm:right-4"
              }`}
              style={{ fontSize: `${baseFontSize}px` }}
            >
              {noteMode === "scribe"
                ? `Draw or handwrite freely on "${activePage.title}" with your S Pen, finger, or mouse...`
                : isMainScript
                ? `Write your main script on "${activePage.title}" — or touch with your S Pen anytime to scribe.`
                : `Jot notes, outlines, or scribe with your S Pen on "${activePage.title}"...`}
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable={canEdit && noteMode === "type"}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleEditorKeyDown}
            onKeyUp={refreshToolbarState}
            onMouseUp={refreshToolbarState}
            onPaste={handlePaste}
            style={{ fontSize: `${baseFontSize}px` }}
            className={`relative z-0 w-full min-h-full leading-relaxed font-sans focus:outline-none ${
              effectivePageWidth === "a4" ? "p-3 sm:p-8" : "p-2.5 sm:p-4"
            } ${
              noteMode === "scribe" ? "select-none" : ""
            } ${
              !canEdit ? "opacity-75 cursor-default" : ""
            } [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-1 [&_blockquote]:border-l-3 [&_blockquote]:border-primary/60 [&_blockquote]:pl-3.5 [&_blockquote]:my-2 [&_blockquote]:italic [&_blockquote]:text-muted-foreground`}
          />

          <NotesInkLayer
            ref={inkLayerRef}
            surfaceRef={paperSurfaceRef}
            strokes={activePage.strokes || []}
            canEdit={canEdit}
            isScribeMode={noteMode === "scribe"}
            showInk={showInk}
            activeTool={scribeTool}
            inkColor={inkColor}
            penSize={penSize}
            eraserSize={eraserSize}
            allowFingerDraw={allowFingerDraw}
            palmRejection={palmRejection}
            onStrokesChange={handleStrokesChange}
          />
        </div>
      </div>

      {/* Bottom Writing Space & Helpful Ergonomic Hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
        <span>
          {noteMode === "scribe"
            ? "Tip: Hold S Pen side button to erase • Toggle 'S Pen Only' for 1-finger scroll"
            : "Tip: Touch with S Pen anytime to auto-scribe • Tab/Shift+Tab to indent"}
        </span>

        {canEdit && (
          <div className="flex items-center gap-2">
            {extraHeight > 0 && (
              <button
                type="button"
                onClick={() => handleAddWritingSpace(0)}
                className="px-2 py-0.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Reset added writing space"
              >
                Reset Space
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAddWritingSpace(240)}
              className="px-2.5 py-1 rounded-xl glass-subtle hover:border-primary/40 text-foreground font-semibold flex items-center gap-1 transition-all cursor-pointer"
              title="Add extra blank space at the bottom for scribing"
            >
              <ArrowDownToLine className="w-3 h-3 text-primary" />
              <span>+ Add Writing Space</span>
            </button>
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`min-w-[36px] min-h-[36px] md:min-w-0 md:min-h-0 flex items-center justify-center p-1.5 rounded-lg transition-all cursor-pointer shrink-0 ${
        active
          ? "bg-primary/20 text-primary border border-primary/35 shadow-xs"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}
