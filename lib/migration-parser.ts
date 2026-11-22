import * as XLSX from "xlsx";

export type DateFormatPattern =
  | "YYYY-MM-DD"
  | "DD-MM-YYYY"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "YYYY/MM/DD"
  | "DD.MM.YYYY"
  | string;

export interface DateMappingConfig {
  mode: "excel_serial" | "custom_format";
  formatPattern: DateFormatPattern;
}

/**
 * Parses raw date value from Excel into a standard JavaScript Date (at noon UTC)
 */
export function parseMigrationDate(
  rawVal: any,
  config: DateMappingConfig
): Date | null {
  if (rawVal === null || rawVal === undefined || rawVal === "") {
    return null;
  }

  // If already a valid JavaScript Date object
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return new Date(Date.UTC(rawVal.getFullYear(), rawVal.getMonth(), rawVal.getDate(), 12, 0, 0));
  }

  // 1. Excel Numeric Serial parsing (e.g. 45612)
  if (config.mode === "excel_serial" || typeof rawVal === "number" || (!isNaN(Number(rawVal)) && Number(rawVal) > 10000 && Number(rawVal) < 100000 && !String(rawVal).includes("-") && !String(rawVal).includes("/"))) {
    const num = Number(rawVal);
    if (!isNaN(num) && num > 0) {
      try {
        const parsed = XLSX.SSF.parse_date_code(num);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0));
        }
      } catch (e) {
        // Fallback to standard 1900 date math
        const epochMs = (num - 25569) * 86400 * 1000;
        const d = new Date(epochMs);
        if (!isNaN(d.getTime())) {
          return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
        }
      }
    }
  }

  // 2. Custom String Format parsing
  const str = String(rawVal).trim();
  if (!str) return null;

  const pattern = (config.formatPattern || "YYYY-MM-DD").toUpperCase();

  // Extract separator: '-' or '/' or '.'
  const sepMatch = pattern.match(/[-/.]/);
  const sep = sepMatch ? sepMatch[0] : "-";

  const parts = str.split(/[-/.]/);
  const patternParts = pattern.split(/[-/.]/);

  if (parts.length === 3 && patternParts.length === 3) {
    let year = 0;
    let month = 0;
    let day = 0;

    for (let i = 0; i < 3; i++) {
      const p = patternParts[i].trim();
      const val = parseInt(parts[i].trim(), 10);
      if (isNaN(val)) return null;

      if (p.startsWith("Y")) {
        year = val < 100 ? (val > 50 ? 1900 + val : 2000 + val) : val;
      } else if (p.startsWith("M")) {
        month = val;
      } else if (p.startsWith("D")) {
        day = val;
      }
    }

    if (year >= 1970 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Standard fallback ISO attempt: new Date(str)
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12, 0, 0));
  }

  return null;
}

/**
 * Parses boolean task status or archive flag from Excel cell value
 */
export function parseMigrationBoolean(val: any): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (!val) return false;

  const s = String(val).trim().toLowerCase();
  return ["true", "1", "yes", "y", "done", "t", "closed", "pass"].includes(s);
}

export interface MigrationIssue {
  sheet: "Index" | "Scripts";
  rowNumber: number;
  contentId?: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedIndexItem {
  rowNumber: number;
  contentId: string;
  title: string;
  taskStatuses: Record<string, boolean>; // task_name -> true (done) / false (not_done)
  publishDate: Date;
  publishDateRaw: any;
  contentLink?: string | null;
  isArchived: boolean;
}

export interface ParsedScriptRow {
  rowNumber: number;
  contentId: string;
  srNo: number;
  data: Record<string, any>; // column_name -> cell_value
}
