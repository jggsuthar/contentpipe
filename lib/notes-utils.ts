export type NoteInkTool = "pen" | "highlighter";
export type NotesPageWidth = "full" | "a4";

export interface NoteStroke {
  id: string;
  tool: NoteInkTool;
  color: string; // "auto" resolves dynamically for Dark/Bright themes, or hex color
  size: number;
  points: [number, number, number?][]; // [x, y, pressure?]
}

export interface NotesPage {
  id: string;
  title: string;
  contentHtml: string;
  plainText: string;
  fontSize?: number;
  pageWidth?: NotesPageWidth;
  strokes?: NoteStroke[];
  extraHeight?: number;
}

export interface NotesDocument {
  version: 2;
  activePageId: string;
  pages: NotesPage[];
}

export const NOTES_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;
export const DEFAULT_NOTES_FONT_SIZE = 14;

export const INK_COLOR_PRESETS = [
  { id: "auto", label: "Auto Ink (Theme Adaptive)" },
  { id: "#3b82f6", label: "Blue" },
  { id: "#ef4444", label: "Red" },
  { id: "#10b981", label: "Emerald" },
  { id: "#f59e0b", label: "Amber" },
  { id: "#8b5cf6", label: "Purple" },
] as const;

export function createNotesPage(
  title = "Page 1",
  id?: string,
  pageWidth: NotesPageWidth = "a4"
): NotesPage {
  return {
    id: id || `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    contentHtml: "",
    plainText: "",
    fontSize: DEFAULT_NOTES_FONT_SIZE,
    pageWidth,
    strokes: [],
    extraHeight: 0,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Converts plain text (e.g. legacy notes) into safe HTML paragraphs/line breaks.
 */
export function plainTextToHtml(text: string): string {
  if (!text || !text.trim()) return "";
  return escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>");
}

/**
 * Converts stored rich HTML into clean readable plain text while preserving paragraphs & list breaks.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const normalized = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|h4|blockquote)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<\/li>/gi, "\n");
      const doc = new DOMParser().parseFromString(normalized, "text/html");
      const rawText = doc.body.textContent || "";
      return rawText
        .replace(/\u00a0/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } catch {
      // Fall through to regex extractor
    }
  }

  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h1|h2|h3|h4|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeStrokes(rawStrokes: unknown): NoteStroke[] {
  if (!Array.isArray(rawStrokes)) return [];
  const valid: NoteStroke[] = [];
  for (const s of rawStrokes) {
    if (!s || typeof s !== "object") continue;
    const obj = s as any;
    if (!Array.isArray(obj.points) || obj.points.length === 0) continue;
    valid.push({
      id:
        typeof obj.id === "string" && obj.id
          ? obj.id
          : `st_${Math.random().toString(36).slice(2, 9)}`,
      tool: obj.tool === "highlighter" ? "highlighter" : "pen",
      color: typeof obj.color === "string" && obj.color ? obj.color : "auto",
      size:
        typeof obj.size === "number" && obj.size > 0 && obj.size <= 48
          ? obj.size
          : 2,
      points: obj.points.filter(
        (pt: any) =>
          Array.isArray(pt) &&
          typeof pt[0] === "number" &&
          typeof pt[1] === "number"
      ),
    });
  }
  return valid;
}

/**
 * Sanitizes pasted or stored rich HTML down to ONLY formats supported by Notes & Teleprompter:
 * h1/h2/h3, p/div/blockquote, ul/ol/li, b/strong, i/em, u, s/strike/del, br, and safe text-align.
 * Strips all foreign colors, background colors, fonts, scripts, classes, and Google Docs wrapper artifacts.
 */
export function sanitizeNotesHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return "";

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return rawHtml;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    const stripTags = new Set([
      "script",
      "style",
      "meta",
      "link",
      "head",
      "title",
      "iframe",
      "object",
      "embed",
      "svg",
      "noscript",
    ]);

    const sanitizeNode = (node: Node, outDoc: Document, inListItem = false): Node | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        return outDoc.createTextNode(node.textContent || "");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (stripTags.has(tag)) return null;
      if (tag === "br") return outDoc.createElement("br");
      if (tag === "hr") return outDoc.createElement("br");

      const appendSanitizedChildren = (target: Node, insideLi = inListItem) => {
        el.childNodes.forEach((child) => {
          const clean = sanitizeNode(child, outDoc, insideLi);
          if (clean) target.appendChild(clean);
        });
      };

      // Convert tables cleanly to line-separated blocks so pasted tables remain readable
      if (tag === "tr") {
        const p = outDoc.createElement("p");
        const cells = Array.from(el.children);
        cells.forEach((cell, idx) => {
          if (idx > 0) p.appendChild(outDoc.createTextNode("  •  "));
          cell.childNodes.forEach((child) => {
            const clean = sanitizeNode(child, outDoc, true);
            if (clean) p.appendChild(clean);
          });
        });
        return p.textContent?.trim() ? p : null;
      }

      // Block-level tags
      const headingMap: Record<string, string> = {
        h1: "h1",
        h2: "h2",
        h3: "h3",
        h4: "h3",
        h5: "h3",
        h6: "h3",
      };

      if (
        tag in headingMap ||
        tag === "p" ||
        tag === "div" ||
        tag === "blockquote" ||
        tag === "pre" ||
        tag === "ul" ||
        tag === "ol" ||
        tag === "li"
      ) {
        // Google Docs / Notion wrap list item text in <p>; flatten inside <li> to avoid double spacing
        if (inListItem && (tag === "p" || tag === "div")) {
          const frag = outDoc.createDocumentFragment();
          appendSanitizedChildren(frag, true);
          return frag;
        }

        const targetTag = headingMap[tag] || (tag === "pre" ? "p" : tag);
        const outEl = outDoc.createElement(targetTag);

        const align = el.style?.textAlign;
        if (align === "left" || align === "center" || align === "right") {
          outEl.style.textAlign = align;
        }

        appendSanitizedChildren(outEl, tag === "li" ? true : inListItem);
        return outEl;
      }

      // Inline formatting detection (covers semantic tags + CSS-styled spans from Docs/Word/ChatGPT)
      const style = el.style;
      const weight = style?.fontWeight?.toLowerCase() || "";
      const weightNum = parseInt(weight, 10);
      const hasExplicitNormalWeight = weight === "normal" || (!Number.isNaN(weightNum) && weightNum < 600);
      const isBoldTag = (tag === "b" || tag === "strong") && !hasExplicitNormalWeight;
      const isBoldStyle =
        weight === "bold" || weight === "bolder" || (!Number.isNaN(weightNum) && weightNum >= 600);

      const fontStyle = style?.fontStyle?.toLowerCase() || "";
      const isItalic =
        ((tag === "i" || tag === "em") && fontStyle !== "normal") || fontStyle === "italic";

      const deco = `${style?.textDecorationLine || ""} ${style?.textDecoration || ""}`.toLowerCase();
      const isUnderline =
        ((tag === "u" || tag === "ins") && !deco.includes("none")) || deco.includes("underline");
      const isStrike =
        tag === "s" ||
        tag === "strike" ||
        tag === "del" ||
        deco.includes("line-through");

      const innerFrag = outDoc.createDocumentFragment();
      appendSanitizedChildren(innerFrag, inListItem);

      let wrapped: Node = innerFrag;
      const wrapWith = (wrapperTag: string) => {
        const wrapper = outDoc.createElement(wrapperTag);
        wrapper.appendChild(wrapped);
        wrapped = wrapper;
      };

      if (isStrike) wrapWith("s");
      if (isUnderline) wrapWith("u");
      if (isItalic) wrapWith("em");
      if (isBoldTag || isBoldStyle) wrapWith("strong");

      return wrapped;
    };

    const container = doc.createElement("div");
    doc.body.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, doc, false);
      if (clean) container.appendChild(clean);
    });

    // Preserve explicit newlines inside raw text nodes that came from <pre>
    return container.innerHTML;
  } catch {
    return rawHtml;
  }
}

/**
 * Parses raw `Script.custom_notes` (either v2 multi-page JSON or legacy plain text)
 * into a guaranteed valid `NotesDocument`.
 */
export function parseNotesDocument(raw: string | null | undefined): NotesDocument {
  if (raw && typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (
          parsed &&
          parsed.version === 2 &&
          Array.isArray(parsed.pages) &&
          parsed.pages.length > 0
        ) {
          const pages: NotesPage[] = parsed.pages.map((p: any, idx: number) => {
            const contentHtml = typeof p.contentHtml === "string" ? p.contentHtml : "";
            const plainText =
              typeof p.plainText === "string"
                ? p.plainText
                : htmlToPlainText(contentHtml);
            const strokes = sanitizeStrokes(p.strokes);
            const resolvedPageWidth: NotesPageWidth =
              p.pageWidth === "full" || p.pageWidth === "a4"
                ? p.pageWidth
                : strokes.length > 0
                ? "full"
                : "a4";

            return {
              id: typeof p.id === "string" && p.id ? p.id : `page_${idx + 1}`,
              title: typeof p.title === "string" && p.title.trim() ? p.title : `Page ${idx + 1}`,
              contentHtml,
              plainText,
              fontSize:
                typeof p.fontSize === "number" && p.fontSize >= 10 && p.fontSize <= 48
                  ? p.fontSize
                  : DEFAULT_NOTES_FONT_SIZE,
              pageWidth: resolvedPageWidth,
              strokes,
              extraHeight:
                typeof p.extraHeight === "number" && p.extraHeight >= 0
                  ? Math.min(4000, p.extraHeight)
                  : 0,
            };
          });

          const activeExists = pages.some((p) => p.id === parsed.activePageId);
          return {
            version: 2,
            activePageId: activeExists ? parsed.activePageId : pages[0].id,
            pages,
          };
        }
      } catch {
        // Not JSON; fall back to legacy plain-text note
      }
    }

    if (trimmed.length > 0) {
      const legacyPage: NotesPage = {
        id: "page_1",
        title: "Page 1",
        contentHtml: plainTextToHtml(raw),
        plainText: raw.trim(),
        fontSize: DEFAULT_NOTES_FONT_SIZE,
        pageWidth: "a4",
        strokes: [],
        extraHeight: 0,
      };
      return {
        version: 2,
        activePageId: "page_1",
        pages: [legacyPage],
      };
    }
  }

  const initialPage = createNotesPage("Page 1", "page_1", "a4");
  return {
    version: 2,
    activePageId: initialPage.id,
    pages: [initialPage],
  };
}

/**
 * Serializes a `NotesDocument` for persistence in `Script.custom_notes`.
 * Returns `""` when there is only 1 blank default page with no ink so empty scripts don't trigger `has_script`.
 */
export function serializeNotesDocument(doc: NotesDocument): string {
  const isSingleBlankDefault =
    doc.pages.length === 1 &&
    doc.pages[0].title === "Page 1" &&
    htmlToPlainText(doc.pages[0].contentHtml).trim() === "" &&
    (!doc.pages[0].fontSize || doc.pages[0].fontSize === DEFAULT_NOTES_FONT_SIZE) &&
    (!doc.pages[0].pageWidth || doc.pages[0].pageWidth === "a4") &&
    (!doc.pages[0].strokes || doc.pages[0].strokes.length === 0) &&
    (!doc.pages[0].extraHeight || doc.pages[0].extraHeight === 0);

  if (isSingleBlankDefault) {
    return "";
  }

  return JSON.stringify(doc);
}

/**
 * Checks whether stored `custom_notes` actually contains non-empty text OR handwritten strokes on any page.
 */
export function hasNotesContent(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  const doc = parseNotesDocument(raw);
  return doc.pages.some(
    (p) =>
      (p.plainText || htmlToPlainText(p.contentHtml)).trim().length > 0 ||
      (p.strokes && p.strokes.length > 0)
  );
}

/**
 * Extracts clean plain text from stored `custom_notes` (all pages with headings, or active page only).
 */
export function extractNotesPlainText(
  raw: string | null | undefined,
  options?: { activeOnly?: boolean }
): string {
  const doc = parseNotesDocument(raw);
  const pagesToRead = options?.activeOnly
    ? doc.pages.filter((p) => p.id === doc.activePageId)
    : doc.pages;

  const nonEmpty = pagesToRead
    .map((p) => ({
      title: p.title,
      text: (p.plainText || htmlToPlainText(p.contentHtml)).trim(),
    }))
    .filter((p) => p.text.length > 0);

  if (nonEmpty.length === 0) return "";
  if (doc.pages.length === 1) return nonEmpty[0].text;

  return nonEmpty.map((p) => `--- ${p.title} ---\n${p.text}`).join("\n\n");
}

/**
 * Extracts structured page paragraphs & sanitized rich HTML for the Teleprompter view.
 */
export function extractNotesPagesForTeleprompter(
  raw: string | null | undefined
): { pageId: string; pageTitle: string; paragraphs: string[]; contentHtml: string }[] {
  const doc = parseNotesDocument(raw);
  return doc.pages
    .map((page) => {
      const text = (page.plainText || htmlToPlainText(page.contentHtml)).trim();
      const paragraphs = text
        ? text
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      const contentHtml = page.contentHtml
        ? sanitizeNotesHtml(page.contentHtml)
        : plainTextToHtml(text);
      return {
        pageId: page.id,
        pageTitle: page.title,
        paragraphs,
        contentHtml,
      };
    })
    .filter((p) => p.paragraphs.length > 0);
}
