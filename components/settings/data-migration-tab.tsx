"use client";

import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { parseMigrationDate } from "@/lib/migration-parser";
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Layers,
  Database,
  FileCheck2,
  Calendar,
  Sparkles,
  Info,
  ShieldCheck,
  ExternalLink,
  Tag,
} from "lucide-react";

interface BrandSummary {
  id: string;
  name: string;
  color: string | null;
  is_default: boolean;
}

interface ContentTypeSummary {
  id: string;
  brand_id?: string | null;
  brand?: { id: string; name: string; color: string | null } | null;
  name: string;
  prefix: string | null;
  workflow_tasks?: { id: string; task_name: string; sequence_order: number; is_hidden: boolean }[];
  script_default_columns?: string | null;
}

export function DataMigrationTab() {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [loadingTypes, setLoadingTypes] = useState<boolean>(true);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsingFile, setParsingFile] = useState<boolean>(false);
  const [rawIndexRows, setRawIndexRows] = useState<any[]>([]);
  const [rawScriptRows, setRawScriptRows] = useState<any[]>([]);
  const [sampleRawDate, setSampleRawDate] = useState<any>(null);
  const [sampleRawDates, setSampleRawDates] = useState<any[]>([]);

  // Date mapping state
  const [dateMode, setDateMode] = useState<"excel_serial" | "custom_format">("custom_format");
  const [dateFormatPattern, setDateFormatPattern] = useState<string>("YYYY-MM-DD");
  const [customPatternInput, setCustomPatternInput] = useState<string>("");

  // Conflict resolution
  const [conflictResolution, setConflictResolution] = useState<"overwrite" | "skip">("overwrite");

  // Validation state
  const [validating, setValidating] = useState<boolean>(false);
  const [validationReport, setValidationReport] = useState<any | null>(null);

  // Execution state
  const [executing, setExecuting] = useState<boolean>(false);
  const [migrationSuccess, setMigrationSuccess] = useState<any | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch available Brands and Content Series
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        setLoadingTypes(true);
        const [brandsRes, typesRes] = await Promise.all([
          fetch("/api/settings/brands"),
          fetch("/api/settings/content-types"),
        ]);

        let fetchedBrands: BrandSummary[] = [];
        if (brandsRes.ok) {
          fetchedBrands = await brandsRes.json();
          setBrands(fetchedBrands);
        }

        let types: ContentTypeSummary[] = [];
        if (typesRes.ok) {
          const data = await typesRes.json();
          types = Array.isArray(data) ? data : data.contentTypes || [];
          setContentTypes(types);
        }

        const defaultBrandId =
          fetchedBrands.find((b) => b.is_default)?.id ||
          fetchedBrands[0]?.id ||
          "";
        setSelectedBrandId((prev) => prev || defaultBrandId);

        const initialBrandSeries = defaultBrandId
          ? types.filter((t) => t.brand_id === defaultBrandId)
          : types;
        if (initialBrandSeries.length > 0) {
          setSelectedTypeId((prev) => prev || initialBrandSeries[0].id);
        }
      } catch (err) {
        console.error("Error fetching brands or content series:", err);
      } finally {
        setLoadingTypes(false);
      }
    };
    fetchTypes();
  }, []);

  const brandScopedSeries = React.useMemo(() => {
    if (!selectedBrandId) return contentTypes;
    return contentTypes.filter((t) => t.brand_id === selectedBrandId);
  }, [contentTypes, selectedBrandId]);

  const selectedType = brandScopedSeries.find((t) => t.id === selectedTypeId);

  // Handle template download
  const handleDownloadTemplate = () => {
    if (!selectedTypeId) return;
    window.location.href = `/api/settings/migration/template?content_type_id=${encodeURIComponent(
      selectedTypeId
    )}`;
  };

  // 2. Parse uploaded workbook
  const handleFileUpload = async (uploadedFile: File) => {
    if (!uploadedFile.name.endsWith(".xlsx") && !uploadedFile.name.endsWith(".xls")) {
      alert("Please upload a valid Excel workbook (.xlsx or .xls)");
      return;
    }

    try {
      setParsingFile(true);
      setFile(uploadedFile);
      setValidationReport(null);
      setMigrationSuccess(null);
      setExecutionError(null);

      const arrayBuffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const sheetNames = workbook.SheetNames;

      // Locate Index and Scripts sheets
      const indexSheetName =
        sheetNames.find((s) => s.trim().toLowerCase() === "index") || sheetNames[0];
      const scriptsSheetName =
        sheetNames.find((s) => s.trim().toLowerCase() === "scripts") ||
        sheetNames.find((s) => s !== indexSheetName);

      const indexSheet = workbook.Sheets[indexSheetName];
      const scriptsSheet = scriptsSheetName ? workbook.Sheets[scriptsSheetName] : null;

      const parsedIndex = indexSheet ? XLSX.utils.sheet_to_json(indexSheet) : [];
      const parsedScripts = scriptsSheet ? XLSX.utils.sheet_to_json(scriptsSheet) : [];

      setRawIndexRows(parsedIndex);
      setRawScriptRows(parsedScripts);

      // Detect sample raw dates for date mapping step
      const collectedSamples: any[] = [];
      const seenSampleVals = new Set<string>();

      for (const row of parsedIndex) {
        for (const [k, v] of Object.entries(row as any)) {
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            (cleanK.includes("publish") || cleanK.includes("date")) &&
            v !== undefined &&
            v !== null &&
            String(v).trim() !== ""
          ) {
            const strVal = String(v).trim();
            if (!seenSampleVals.has(strVal)) {
              seenSampleVals.add(strVal);
              collectedSamples.push(v);
              if (collectedSamples.length >= 6) break;
            }
          }
        }
        if (collectedSamples.length >= 6) break;
      }

      setSampleRawDates(collectedSamples);
      const sampleDate = collectedSamples[0] ?? null;
      setSampleRawDate(sampleDate);

      // Auto-detect date format
      if (typeof sampleDate === "number" || (!isNaN(Number(sampleDate)) && Number(sampleDate) > 10000 && !String(sampleDate).includes("-") && !String(sampleDate).includes("/"))) {
        setDateMode("excel_serial");
      } else if (typeof sampleDate === "string") {
        setDateMode("custom_format");
        if (sampleDate.includes("-")) {
          const parts = sampleDate.split("-");
          if (parts[0].length === 4) setDateFormatPattern("YYYY-MM-DD");
          else setDateFormatPattern("DD-MM-YYYY");
        } else if (sampleDate.includes("/")) {
          const parts = sampleDate.split("/");
          if (parts[0].length === 4) setDateFormatPattern("YYYY/MM/DD");
          else setDateFormatPattern("DD/MM/YYYY");
        } else if (sampleDate.includes(".")) {
          setDateFormatPattern("DD.MM.YYYY");
        }
      }
    } catch (err: any) {
      console.error("Error parsing workbook:", err);
      alert("Failed to parse Excel file: " + (err.message || "Invalid file format"));
    } finally {
      setParsingFile(false);
    }
  };

  // 3. Trigger Validation API
  const handleValidate = async () => {
    if (!selectedTypeId || rawIndexRows.length === 0) return;

    try {
      setValidating(true);
      setExecutionError(null);

      const activePattern =
        dateFormatPattern === "CUSTOM" ? customPatternInput : dateFormatPattern;

      const res = await fetch("/api/settings/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          content_type_id: selectedTypeId,
          index_rows: rawIndexRows,
          scripts_rows: rawScriptRows,
          date_mapping: {
            mode: dateMode,
            formatPattern: activePattern,
          },
          conflict_resolution: conflictResolution,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Validation request failed");
      }

      setValidationReport(data);
    } catch (err: any) {
      setExecutionError(err.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  // 4. Trigger Execution API (Atomic Migration Transaction)
  const handleExecuteMigration = async () => {
    if (!selectedTypeId || rawIndexRows.length === 0) return;

    try {
      setExecuting(true);
      setExecutionError(null);

      const activePattern =
        dateFormatPattern === "CUSTOM" ? customPatternInput : dateFormatPattern;

      const res = await fetch("/api/settings/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          content_type_id: selectedTypeId,
          index_rows: rawIndexRows,
          scripts_rows: rawScriptRows,
          date_mapping: {
            mode: dateMode,
            formatPattern: activePattern,
          },
          conflict_resolution: conflictResolution,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Migration failed and database rolled back");
      }

      setMigrationSuccess(data);
    } catch (err: any) {
      setExecutionError(err.message || "Failed to execute migration");
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRawIndexRows([]);
    setRawScriptRows([]);
    setValidationReport(null);
    setMigrationSuccess(null);
    setExecutionError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="card-theme p-5 border-l-4 border-l-primary flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Data Migration Studio</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-primary/10 text-primary border border-primary/20">
              Excel Import
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Import legacy video registers and row-by-row scripts from Excel into this pipeline. 
            All workflow tasks, custom script columns, and archive statuses will be created atomically with automated triggers bypassed.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          disabled={!selectedTypeId || loadingTypes}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-2 transition-all cursor-pointer shadow-sm shrink-0 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Migration Template (.xlsx)</span>
        </button>
      </div>

      {/* STEP 1: Brand & Content Series Selection */}
      <div className="card-theme p-5 space-y-4">
        <div className="flex items-center justify-between">
          <label className="font-bold text-xs text-foreground flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-primary" />
            <span>1. Select Brand &amp; Target Content Series</span>
          </label>
          <span className="text-[11px] font-mono text-muted-foreground">
            Series pipeline schema determines required Excel columns
          </span>
        </div>

        {loadingTypes ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 font-mono">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading brands &amp; content series...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Select Brand */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-primary" />
                  <span>Select Brand</span>
                </label>
                <select
                  value={selectedBrandId}
                  onChange={(e) => {
                    const nextBrandId = e.target.value;
                    setSelectedBrandId(nextBrandId);
                    const nextSeries = contentTypes.filter(
                      (t) => !nextBrandId || t.brand_id === nextBrandId
                    );
                    setSelectedTypeId(nextSeries[0]?.id || "");
                    handleReset();
                  }}
                  className="w-full h-10 px-3 rounded-xl glass-input text-foreground font-mono text-xs cursor-pointer"
                >
                  {brands.length === 0 ? (
                    <option value="">No Brands available</option>
                  ) : (
                    brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.is_default ? "(Default)" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Select Target Content Series */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-primary" />
                  <span>Select Target Content Series</span>
                </label>
                <select
                  value={selectedTypeId}
                  onChange={(e) => {
                    setSelectedTypeId(e.target.value);
                    handleReset();
                  }}
                  className="w-full h-10 px-3 rounded-xl glass-input text-foreground font-mono text-xs cursor-pointer"
                >
                  {brandScopedSeries.length === 0 ? (
                    <option value="">No Content Series in this Brand</option>
                  ) : (
                    brandScopedSeries.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.prefix ? `(Prefix: ${t.prefix})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {selectedType && (
              <div className="text-xs font-mono text-muted-foreground p-2.5 rounded-xl glass-subtle border border-border flex items-center justify-between">
                <span>
                  Workflow Tasks:{" "}
                  <strong className="text-foreground">
                    {selectedType.workflow_tasks?.filter((w) => !w.is_hidden).length || 0}
                  </strong>
                </span>
                <span>
                  Prefix: <strong className="text-foreground">{selectedType.prefix || "None"}</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: File Upload Zone */}
      {!migrationSuccess && (
        <div className="card-theme p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-primary" />
              <span>2. Upload Completed Excel Workbook</span>
            </label>
            {file && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Replace file</span>
              </button>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-250 cursor-pointer flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? "border-primary bg-primary/10"
                : file
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border glass-subtle hover:border-primary/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {parsingFile ? (
              <div className="flex flex-col items-center gap-2 text-xs font-mono text-muted-foreground py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>Reading sheets and parsing tabular records...</span>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-1.5 text-xs">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <span className="font-bold text-foreground text-sm font-mono">{file.name}</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  Detected: <strong className="text-foreground">{rawIndexRows.length}</strong> items in `Index` •{" "}
                  <strong className="text-foreground">{rawScriptRows.length}</strong> script rows in `Scripts`
                </span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <p className="font-semibold text-xs text-foreground">
                  Drag and drop your migration `.xlsx` file here, or click to browse
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Must contain `Index` and `Scripts` sheets matching the template layout.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Date Mapping Step */}
      {file && rawIndexRows.length > 0 && !migrationSuccess && (
        <div className="card-theme p-5 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <label className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <span>3. Date Mapping & Format Configuration</span>
            </label>
            <span className="text-[11px] font-mono text-muted-foreground">
              Ensures accurate parsing across calendar boundaries
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Option A: Excel Numeric Serial */}
            <button
              type="button"
              onClick={() => {
                setDateMode("excel_serial");
                setValidationReport(null);
              }}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                dateMode === "excel_serial"
                  ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                  : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    dateMode === "excel_serial" ? "border-primary" : "border-muted-foreground"
                  }`}
                >
                  {dateMode === "excel_serial" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className="text-xs font-bold text-foreground">Option A: Excel Numeric Serial</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 ml-5.5 leading-relaxed">
                Use for numeric dates generated natively by Excel (e.g. <span className="font-mono text-foreground font-bold">46326</span>).
              </p>
            </button>

            {/* Option B: Custom String Format */}
            <button
              type="button"
              onClick={() => {
                setDateMode("custom_format");
                setValidationReport(null);
              }}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                dateMode === "custom_format"
                  ? "bg-primary/10 border-primary text-foreground font-semibold shadow-xs"
                  : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    dateMode === "custom_format" ? "border-primary" : "border-muted-foreground"
                  }`}
                >
                  {dateMode === "custom_format" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className="text-xs font-bold text-foreground">Option B: Custom String Format</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 ml-5.5 leading-relaxed">
                Use for textual calendar dates (e.g. <span className="font-mono text-foreground font-bold">DD-MM-YYYY</span>, <span className="font-mono text-foreground font-bold">YYYY-MM-DD</span>).
              </p>
            </button>
          </div>

          {/* Custom String Format Selector */}
          {dateMode === "custom_format" && (
            <div className="p-3.5 rounded-lg bg-muted/20 border border-border space-y-2 animate-in fade-in duration-150">
              <label className="text-[11px] font-mono text-foreground block font-bold">
                Select Date Pattern Pattern Used in Excel:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "DD.MM.YYYY", "CUSTOM"].map(
                  (pattern) => (
                    <button
                      key={pattern}
                      type="button"
                      onClick={() => {
                        setDateFormatPattern(pattern);
                        setValidationReport(null);
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer border ${
                        dateFormatPattern === pattern
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                      }`}
                    >
                      {pattern}
                    </button>
                  )
                )}
              </div>

              {dateFormatPattern === "CUSTOM" && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={customPatternInput}
                    onChange={(e) => {
                      setCustomPatternInput(e.target.value.toUpperCase());
                      setValidationReport(null);
                    }}
                    placeholder="Enter pattern, e.g. DD-MM-YYYY"
                    className="w-full h-8 px-2.5 rounded bg-background border border-border text-foreground font-mono text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
          )}

          {/* Sample Dates and Live Preview */}
          <div className="p-4 rounded-lg bg-muted/20 border border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Sample Dates from Uploaded File ({sampleRawDates.length} sample{sampleRawDates.length === 1 ? "" : "s"} detected)
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                Live preview with selected pattern:{" "}
                <strong className="text-foreground font-mono">
                  {dateMode === "excel_serial"
                    ? "Excel Serial Number"
                    : dateFormatPattern === "CUSTOM"
                    ? customPatternInput || "CUSTOM"
                    : dateFormatPattern}
                </strong>
              </span>
            </div>

            {sampleRawDates.length === 0 ? (
              <div className="text-xs text-muted-foreground font-mono italic py-2">
                No publish date values detected in the uploaded Index sheet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {sampleRawDates.map((sampleVal, idx) => {
                  const activePattern =
                    dateFormatPattern === "CUSTOM" ? customPatternInput : dateFormatPattern;
                  const parsed = parseMigrationDate(sampleVal, {
                    mode: dateMode,
                    formatPattern: activePattern,
                  });
                  const isValid = parsed instanceof Date && !isNaN(parsed.getTime());
                  let formattedDate = "";
                  let dayOfWeek = "";

                  if (isValid && parsed) {
                    const yyyy = parsed.getUTCFullYear();
                    const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
                    const dd = String(parsed.getUTCDate()).padStart(2, "0");
                    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    dayOfWeek = days[parsed.getUTCDay()];
                    formattedDate = `${yyyy}-${mm}-${dd}`;
                  }

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-md border text-xs font-mono flex flex-col justify-between gap-1.5 transition-all shadow-2xs ${
                        isValid
                          ? "bg-background/90 border-border hover:border-primary/40"
                          : "bg-destructive/5 border-destructive/30"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Excel Value:</span>
                        <span className="font-bold text-foreground px-1.5 py-0.5 rounded bg-muted/60 border border-border/40">
                          {String(sampleVal)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/50">
                        <span className="text-muted-foreground">Parsed:</span>
                        {isValid ? (
                          <span className="font-bold text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>
                              {formattedDate} <span className="text-[10px] opacity-80">({dayOfWeek})</span>
                            </span>
                          </span>
                        ) : (
                          <span className="font-semibold text-rose-500 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>Unparsed / Invalid</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                💡 <strong className="text-foreground">Format Check:</strong> Ensure the day and month in the preview match your intended date before validating.
              </span>

              <button
                type="button"
                onClick={handleValidate}
                disabled={validating}
                className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
              >
                {validating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating...</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Validate & Preview Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Preview & Validate Report */}
      {validationReport && !migrationSuccess && (
        <div className="card-theme p-5 space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-xs text-foreground">4. Validation Report & Data Preview</h3>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              {validationReport.success ? (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Ready to Migrate</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-1 font-bold">
                  <XCircle className="w-3 h-3" />
                  <span>{validationReport.summary.errorCount} Error(s) Detected</span>
                </span>
              )}
            </div>
          </div>

          {/* Summary Stat Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
              <span className="text-[10px] text-muted-foreground block uppercase">Valid Videos</span>
              <span className="text-lg font-bold text-foreground">
                {validationReport.summary.validIndexItemsCount}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {validationReport.summary.activeCount} Active • {validationReport.summary.archiveCount} Archived
              </span>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
              <span className="text-[10px] text-muted-foreground block uppercase">Script Rows</span>
              <span className="text-lg font-bold text-foreground">
                {validationReport.summary.totalScriptRows}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Across {validationReport.summary.uniqueScriptsCount} unique video(s)
              </span>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
              <span className="text-[10px] text-muted-foreground block uppercase">DB Conflicts</span>
              <span className={`text-lg font-bold ${validationReport.summary.conflictCount > 0 ? "text-amber-400" : "text-foreground"}`}>
                {validationReport.summary.conflictCount}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Already existing Content IDs
              </span>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
              <span className="text-[10px] text-muted-foreground block uppercase">Issues</span>
              <span className={`text-lg font-bold ${validationReport.summary.errorCount > 0 ? "text-destructive" : "text-emerald-400"}`}>
                {validationReport.summary.errorCount} Err / {validationReport.summary.warningCount} Warn
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {validationReport.summary.errorCount === 0 ? "All blocks passed" : "Fix errors to proceed"}
              </span>
            </div>
          </div>

          {/* Validation Issues Alert Box */}
          {validationReport.issues && validationReport.issues.length > 0 && (
            <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2 text-xs">
              <span className="font-bold text-[11px] font-mono text-foreground block">
                Issues Flagged ({validationReport.issues.length}):
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                {validationReport.issues.map((issue: any, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded flex items-start gap-2 border ${
                      issue.severity === "error"
                        ? "bg-destructive/10 border-destructive/30 text-destructive"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    {issue.severity === "error" ? (
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    )}
                    <div>
                      <span className="font-bold">
                        [{issue.sheet} Row {issue.rowNumber}]:
                      </span>{" "}
                      {issue.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflict Resolution Selector if existing items detected */}
          {validationReport.summary.conflictCount > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-amber-300">Conflict Handling for Existing Content IDs</p>
                <p className="text-[11px] text-muted-foreground">
                  {validationReport.summary.conflictCount} video ID(s) match items already registered in ContentPipe.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConflictResolution("overwrite")}
                  className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all cursor-pointer border ${
                    conflictResolution === "overwrite"
                      ? "bg-amber-500 text-black border-amber-500 font-bold"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  Overwrite (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setConflictResolution("skip")}
                  className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all cursor-pointer border ${
                    conflictResolution === "skip"
                      ? "bg-amber-500 text-black border-amber-500 font-bold"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  Skip Existing
                </button>
              </div>
            </div>
          )}

          {/* Table Preview */}
          {validationReport.previewIndex && validationReport.previewIndex.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>Sample Parsed Content Items Preview (First 10 rows):</span>
                <span>{validationReport.previewIndex.length} of {validationReport.summary.validIndexItemsCount} shown</span>
              </div>

              <div className="glass-subtle rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono text-left">
                  <thead className="bg-muted/40 border-b border-border text-[11px] text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3">Content ID</th>
                      <th className="py-2 px-3">Title</th>
                      <th className="py-2 px-3">Publish Date</th>
                      <th className="py-2 px-3">Archive</th>
                      <th className="py-2 px-3">Task Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {validationReport.previewIndex.map((row: any, idx: number) => {
                      const completedCount = Object.values(row.taskStatuses || {}).filter(Boolean).length;
                      const totalTasks = Object.keys(row.taskStatuses || {}).length;

                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-bold text-foreground">{row.contentId}</td>
                          <td className="py-2 px-3 max-w-xs truncate text-foreground">{row.title}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(row.publishDate).toISOString().split("T")[0]}
                          </td>
                          <td className="py-2 px-3">
                            {row.isArchived ? (
                              <span className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-400 text-[10px] font-bold">
                                Archived
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                Active Tracker
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-muted-foreground">
                            {completedCount} / {totalTasks} Tasks Done
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Execution Error Banner */}
          {executionError && (
            <div className="p-3 rounded-lg bg-destructive/15 text-destructive border border-destructive/30 text-xs font-mono">
              {executionError}
            </div>
          )}

          {/* Action Buttons: Confirm & Migrate */}
          <div className="pt-2 flex items-center justify-between border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Automations Bypassed • Atomic Rollback Guaranteed</span>
            </div>

            <button
              type="button"
              onClick={handleExecuteMigration}
              disabled={executing || !validationReport.success}
              className="px-5 py-2.5 rounded bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Migrating Records to Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Migrate {validationReport.summary.validIndexItemsCount} Items</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Migration Success View */}
      {migrationSuccess && (
        <div className="card-theme p-8 text-center space-y-4 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">Migration Completed Successfully!</h3>
            <p className="text-xs text-muted-foreground font-mono max-w-md mx-auto">
              {migrationSuccess.message}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4">
            <Link
              href={`/tracker?type=${selectedTypeId}`}
              className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <span>Open Tracker Matrix</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted text-xs font-semibold transition-all cursor-pointer"
            >
              Migrate Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
