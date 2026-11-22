"use client";

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { NoteStroke, NoteInkTool } from "@/lib/notes-utils";
import { useTheme } from "@/components/providers/theme-provider";

export type ScribeActiveTool =
  | "pen"
  | "highlighter"
  | "eraser_stroke"
  | "eraser_partial";

export interface NotesInkLayerHandle {
  beginExternalPenStroke: (e: PointerEvent) => void;
}

interface NotesInkLayerProps {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  strokes: NoteStroke[];
  canEdit: boolean;
  isScribeMode: boolean;
  showInk: boolean;
  activeTool: ScribeActiveTool;
  inkColor: string; // "auto" or hex
  penSize: number;
  eraserSize: number;
  allowFingerDraw: boolean;
  palmRejection: boolean;
  onStrokesChange: (nextStrokes: NoteStroke[]) => void;
}

function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

function distSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

function distToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = distSq(x1, y1, x2, y2);
  if (l2 === 0) return distSq(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distSq(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

function resolveColor(color: string, isDark: boolean): string {
  if (color === "auto") {
    return isDark ? "#f4f4f5" : "#18181b";
  }
  return color;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: NoteStroke,
  isDark: boolean
) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const color = resolveColor(stroke.color, isDark);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.32 : 1;

  if (pts.length === 1) {
    const p0 = pts[0];
    const pressureFactor =
      stroke.tool === "pen" && typeof p0[2] === "number" && p0[2] > 0
        ? 0.55 + p0[2] * 0.85
        : 1;
    const radius = Math.max(0.5, (stroke.size * pressureFactor) / 2);
    ctx.beginPath();
    ctx.arc(p0[0], p0[1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const hasPressure =
    stroke.tool === "pen" && pts.some((p) => typeof p[2] === "number" && p[2] > 0);

  if (!hasPressure) {
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  } else {
    // Pressure-sensitive smooth segments for S Pen
    for (let i = 0; i < pts.length - 1; i++) {
      const pA = pts[i];
      const pB = pts[i + 1];
      const pPrev = i > 0 ? pts[i - 1] : pA;
      const startX = i === 0 ? pA[0] : (pPrev[0] + pA[0]) / 2;
      const startY = i === 0 ? pA[1] : (pPrev[1] + pA[1]) / 2;
      const endX = i === pts.length - 2 ? pB[0] : (pA[0] + pB[0]) / 2;
      const endY = i === pts.length - 2 ? pB[1] : (pA[1] + pB[1]) / 2;

      const pressure =
        typeof pA[2] === "number" && pA[2] > 0 ? pA[2] : 0.5;
      ctx.lineWidth = Math.max(0.75, stroke.size * (0.55 + pressure * 0.85));
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(pA[0], pA[1], endX, endY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Whole-line eraser: removes any stroke whose curve passes within hit radius of (x, y).
 */
function eraseWholeStrokesAt(
  strokes: NoteStroke[],
  x: number,
  y: number
): { next: NoteStroke[]; changed: boolean } {
  let changed = false;
  const next = strokes.filter((s) => {
    const hitR = Math.max(12, s.size * 1.4);
    const hitR2 = hitR * hitR;

    // Quick bounding-box check
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of s.points) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    if (x < minX - hitR || x > maxX + hitR || y < minY - hitR || y > maxY + hitR) {
      return true;
    }

    if (s.points.length === 1) {
      if (distSq(x, y, s.points[0][0], s.points[0][1]) <= hitR2) {
        changed = true;
        return false;
      }
      return true;
    }

    for (let i = 0; i < s.points.length - 1; i++) {
      if (
        distToSegmentSq(
          x,
          y,
          s.points[i][0],
          s.points[i][1],
          s.points[i + 1][0],
          s.points[i + 1][1]
        ) <= hitR2
      ) {
        changed = true;
        return false;
      }
    }
    return true;
  });

  return { next, changed };
}

/**
 * Partial vector eraser: splits strokes cleanly wherever segments intersect the eraser circle.
 */
function erasePartialAt(
  strokes: NoteStroke[],
  x: number,
  y: number,
  eraserSize: number
): { next: NoteStroke[]; changed: boolean } {
  let changed = false;
  const baseRadius = Math.max(4, eraserSize / 2);
  const next: NoteStroke[] = [];

  for (const s of strokes) {
    const effR = baseRadius + s.size * 0.45;
    const effR2 = effR * effR;

    // Fast bounding-box skip
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of s.points) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    if (x < minX - effR || x > maxX + effR || y < minY - effR || y > maxY + effR) {
      next.push(s);
      continue;
    }

    // Subdivide long segments locally so even straight 2-point lines split smoothly
    const densePts: [number, number, number?][] = [];
    const stepMax = Math.max(4, effR * 0.45);
    for (let i = 0; i < s.points.length; i++) {
      const curr = s.points[i];
      densePts.push(curr);
      if (i < s.points.length - 1) {
        const nxt = s.points[i + 1];
        const segLen = Math.hypot(nxt[0] - curr[0], nxt[1] - curr[1]);
        if (segLen > stepMax) {
          const steps = Math.ceil(segLen / stepMax);
          for (let k = 1; k < steps; k++) {
            const ratio = k / steps;
            const pInterp =
              typeof curr[2] === "number" && typeof nxt[2] === "number"
                ? roundCoord(curr[2] + (nxt[2] - curr[2]) * ratio)
                : curr[2];
            densePts.push([
              roundCoord(curr[0] + (nxt[0] - curr[0]) * ratio),
              roundCoord(curr[1] + (nxt[1] - curr[1]) * ratio),
              pInterp,
            ]);
          }
        }
      }
    }

    // Partition surviving points into contiguous fragments
    const fragments: [number, number, number?][][] = [];
    let currentFrag: [number, number, number?][] = [];
    let strokeTouched = false;

    for (const pt of densePts) {
      if (distSq(x, y, pt[0], pt[1]) <= effR2) {
        strokeTouched = true;
        if (currentFrag.length > 0) {
          fragments.push(currentFrag);
          currentFrag = [];
        }
      } else {
        currentFrag.push(pt);
      }
    }
    if (currentFrag.length > 0) {
      fragments.push(currentFrag);
    }

    if (!strokeTouched) {
      next.push(s);
    } else {
      changed = true;
      fragments.forEach((fragPts, fIdx) => {
        if (fragPts.length > 0) {
          next.push({
            ...s,
            id: fIdx === 0 ? s.id : `${s.id}_f${fIdx}_${Math.random().toString(36).slice(2, 5)}`,
            points: fragPts,
          });
        }
      });
    }
  }

  return { next, changed };
}

export const NotesInkLayer = forwardRef<NotesInkLayerHandle, NotesInkLayerProps>(
  function NotesInkLayer(
    {
      surfaceRef,
      strokes,
      canEdit,
      isScribeMode,
      showInk,
      activeTool,
      inkColor,
      penSize,
      eraserSize,
      allowFingerDraw,
      palmRejection,
      onStrokesChange,
    },
    ref
  ) {
    const { theme } = useTheme();
    const isDark = theme === "theme-dark";

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const activeGestureModeRef = useRef<ScribeActiveTool | null>(null);
    const draftStrokeRef = useRef<NoteStroke | null>(null);
    const workingStrokesRef = useRef<NoteStroke[]>(strokes);
    const lastPenActivityRef = useRef<number>(0);
    const dirtyEraseRef = useRef<boolean>(false);

    const [eraserCursor, setEraserCursor] = useState<{
      x: number;
      y: number;
      mode: "eraser_stroke" | "eraser_partial";
    } | null>(null);

    // Sync working strokes when prop updates externally (and no gesture is active)
    useEffect(() => {
      if (activePointerIdRef.current === null) {
        workingStrokesRef.current = strokes;
      }
    }, [strokes]);

    const redrawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      ctx.clearRect(0, 0, cssW, cssH);

      if (!showInk) return;

      const allStrokes = [...workingStrokesRef.current];
      if (draftStrokeRef.current) {
        allStrokes.push(draftStrokeRef.current);
      }

      // Pass 1: Highlighter under pen strokes
      for (const s of allStrokes) {
        if (s.tool === "highlighter") drawStroke(ctx, s, isDark);
      }
      // Pass 2: Pen strokes on top
      for (const s of allStrokes) {
        if (s.tool !== "highlighter") drawStroke(ctx, s, isDark);
      }

      // Eraser visual cursor indicator
      if (isScribeMode && eraserCursor) {
        const radius =
          eraserCursor.mode === "eraser_partial"
            ? Math.max(4, eraserSize / 2)
            : 12;
        ctx.save();
        ctx.beginPath();
        ctx.arc(eraserCursor.x, eraserCursor.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle =
          eraserCursor.mode === "eraser_stroke"
            ? "rgba(239, 68, 68, 0.85)"
            : isDark
            ? "rgba(244, 244, 245, 0.75)"
            : "rgba(24, 24, 27, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash(eraserCursor.mode === "eraser_stroke" ? [3, 3] : []);
        ctx.stroke();
        ctx.restore();
      }
    }, [showInk, isDark, isScribeMode, eraserCursor, eraserSize]);

    // Resize canvas cleanly whenever the shared paper surface grows/shrinks
    useEffect(() => {
      const surface = surfaceRef.current;
      const canvas = canvasRef.current;
      if (!surface || !canvas) return;

      const syncSize = () => {
        const rect = surface.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const targetW = Math.max(1, Math.round(rect.width * dpr));
        const targetH = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          redrawCanvas();
        }
      };

      syncSize();
      const ro = new ResizeObserver(syncSize);
      ro.observe(surface);
      return () => ro.disconnect();
    }, [surfaceRef, redrawCanvas]);

    useEffect(() => {
      redrawCanvas();
    }, [strokes, isDark, showInk, redrawCanvas]);

    const getLocalCoords = (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: roundCoord(e.clientX - rect.left),
        y: roundCoord(e.clientY - rect.top),
      };
    };

    const shouldRejectTouch = useCallback(
      (e: PointerEvent) => {
        if (e.pointerType === "pen") {
          lastPenActivityRef.current = Date.now();
          return false;
        }
        if (e.pointerType === "touch") {
          if (!allowFingerDraw) return true;
          if (palmRejection) {
            // Wide palm/wrist contact rejection
            if ((e.width && e.width > 24) || (e.height && e.height > 24)) {
              return true;
            }
            // Active S Pen lockout (ignore resting palm while writing with S Pen)
            if (Date.now() - lastPenActivityRef.current < 1200) {
              return true;
            }
          }
        }
        return false;
      },
      [allowFingerDraw, palmRejection]
    );

    const startPointerGesture = useCallback(
      (e: PointerEvent) => {
        if (!canEdit || !showInk) return;
        if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 5) return;
        if (shouldRejectTouch(e)) return;
        if (activePointerIdRef.current !== null) return;

        // S Pen side-button press temporarily acts as Whole-Line Stroke Eraser
        const isPenBarrelErase =
          e.pointerType === "pen" && ((e.buttons & 32) !== 0 || e.button === 5);

        const effectiveTool: ScribeActiveTool = isPenBarrelErase
          ? activeTool === "eraser_partial"
            ? "eraser_partial"
            : "eraser_stroke"
          : activeTool;

        activePointerIdRef.current = e.pointerId;
        activeGestureModeRef.current = effectiveTool;
        dirtyEraseRef.current = false;

        try {
          canvasRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // Safe fallback if pointer capture unavailable
        }

        const { x, y } = getLocalCoords(e);
        const pressure =
          e.pointerType === "pen" && e.pressure > 0
            ? roundCoord(e.pressure)
            : undefined;

        if (
          effectiveTool === "eraser_stroke" ||
          effectiveTool === "eraser_partial"
        ) {
          setEraserCursor({ x, y, mode: effectiveTool });
          const result =
            effectiveTool === "eraser_stroke"
              ? eraseWholeStrokesAt(workingStrokesRef.current, x, y)
              : erasePartialAt(workingStrokesRef.current, x, y, eraserSize);
          if (result.changed) {
            workingStrokesRef.current = result.next;
            dirtyEraseRef.current = true;
          }
          redrawCanvas();
        } else {
          const toolKind: NoteInkTool =
            effectiveTool === "highlighter" ? "highlighter" : "pen";
          draftStrokeRef.current = {
            id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tool: toolKind,
            color: inkColor,
            size: toolKind === "highlighter" ? 18 : penSize,
            points: [pressure !== undefined ? [x, y, pressure] : [x, y]],
          };
          redrawCanvas();
        }
      },
      [
        canEdit,
        showInk,
        shouldRejectTouch,
        activeTool,
        eraserSize,
        inkColor,
        penSize,
        redrawCanvas,
      ]
    );

    useImperativeHandle(
      ref,
      () => ({
        beginExternalPenStroke: (e: PointerEvent) => {
          lastPenActivityRef.current = Date.now();
          startPointerGesture(e);
        },
      }),
      [startPointerGesture]
    );

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.nativeEvent.pointerType === "pen") {
        lastPenActivityRef.current = Date.now();
      }

      const { x, y } = getLocalCoords(e.nativeEvent);

      // Update hover cursor for erasers
      if (
        isScribeMode &&
        activePointerIdRef.current === null &&
        (activeTool === "eraser_stroke" || activeTool === "eraser_partial")
      ) {
        setEraserCursor({ x, y, mode: activeTool });
      }

      if (activePointerIdRef.current !== e.pointerId) return;

      const mode = activeGestureModeRef.current;
      if (mode === "eraser_stroke" || mode === "eraser_partial") {
        setEraserCursor({ x, y, mode });
        const result =
          mode === "eraser_stroke"
            ? eraseWholeStrokesAt(workingStrokesRef.current, x, y)
            : erasePartialAt(workingStrokesRef.current, x, y, eraserSize);
        if (result.changed) {
          workingStrokesRef.current = result.next;
          dirtyEraseRef.current = true;
        }
        redrawCanvas();
        return;
      }

      const draft = draftStrokeRef.current;
      if (!draft) return;

      // Use coalesced events when available for ultra-smooth S Pen curves
      const nativeEv = e.nativeEvent;
      const coalesced =
        typeof nativeEv.getCoalescedEvents === "function"
          ? nativeEv.getCoalescedEvents()
          : [nativeEv];

      const eventsToProcess = coalesced.length > 0 ? coalesced : [nativeEv];
      let added = false;

      for (const ce of eventsToProcess) {
        const ptCoords = getLocalCoords(ce);
        const lastPt = draft.points[draft.points.length - 1];
        if (!lastPt || distSq(ptCoords.x, ptCoords.y, lastPt[0], lastPt[1]) >= 3.2) {
          const p =
            ce.pointerType === "pen" && ce.pressure > 0
              ? roundCoord(ce.pressure)
              : undefined;
          draft.points.push(
            p !== undefined
              ? [ptCoords.x, ptCoords.y, p]
              : [ptCoords.x, ptCoords.y]
          );
          added = true;
        }
      }

      if (added) {
        redrawCanvas();
      }
    };

    const finishGesture = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      try {
        if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {}

      const mode = activeGestureModeRef.current;
      activePointerIdRef.current = null;
      activeGestureModeRef.current = null;

      if (mode === "eraser_stroke" || mode === "eraser_partial") {
        if (dirtyEraseRef.current) {
          dirtyEraseRef.current = false;
          onStrokesChange([...workingStrokesRef.current]);
        }
        return;
      }

      if (draftStrokeRef.current) {
        const finalized = draftStrokeRef.current;
        draftStrokeRef.current = null;
        const next = [...workingStrokesRef.current, finalized];
        workingStrokesRef.current = next;
        redrawCanvas();
        onStrokesChange(next);
      }
    };

    const touchActionClass =
      !isScribeMode || !allowFingerDraw ? "touch-pan-y" : "touch-none";

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          if (!isScribeMode) return;
          if (!shouldRejectTouch(e.nativeEvent)) {
            e.preventDefault();
          }
          startPointerGesture(e.nativeEvent);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onPointerLeave={() => setEraserCursor(null)}
        className={`absolute inset-0 w-full h-full z-10 ${touchActionClass} ${
          isScribeMode && canEdit
            ? activeTool === "eraser_stroke" || activeTool === "eraser_partial"
              ? "pointer-events-auto cursor-crosshair"
              : "pointer-events-auto cursor-crosshair"
            : "pointer-events-none"
        }`}
      />
    );
  }
);
