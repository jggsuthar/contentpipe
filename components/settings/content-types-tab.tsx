"use client";

import React, { useState, useEffect } from "react";
import {
  Film,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Layers,
  Check,
  CheckSquare,
  AlertTriangle,
  Calendar,
  Lock,
  ChevronRight,
  Loader2,
  X,
  Save,
  Columns3,
  FolderTree,
  FolderPlus,
  Folder,
  CornerDownRight,
  Sparkles,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { getRoleConfigForContentType } from "@/lib/permissions";
import { PublishDatesOrganizerModal } from "@/components/tracker/publish-dates-organizer-modal";

interface WorkflowTaskItem {
  id: string;
  content_type_id: string;
  task_name: string;
  sequence_order: number;
  n_days_offset: number;
  team_buffer_days: number;
  team_final_buffer_days: number;
  is_hidden: boolean;
  color?: string | null;
  update_mode?: "manual" | "automatic";
  automation_trigger?: "script_studio" | "drive_raw_footage" | "content_submission" | null;
  automation_role_id?: string | null;
  require_closure_link?: boolean;
}

function normalizeTaskForEditor(
  task: Partial<WorkflowTaskItem> & {
    id: string;
    content_type_id: string;
    task_name: string;
    sequence_order: number;
  }
): WorkflowTaskItem {
  return {
    id: task.id,
    content_type_id: task.content_type_id,
    task_name: task.task_name,
    sequence_order: task.sequence_order,
    n_days_offset: task.n_days_offset ?? 1,
    team_buffer_days: task.team_buffer_days ?? 0,
    team_final_buffer_days: task.team_final_buffer_days ?? 0,
    is_hidden: Boolean(task.is_hidden),
    color: task.color ?? null,
    update_mode: task.update_mode || "manual",
    automation_trigger: task.automation_trigger ?? null,
    automation_role_id: task.automation_role_id ?? null,
    require_closure_link: Boolean(task.require_closure_link),
  };
}

interface MiscTaskItem {
  id: string;
  content_type_id: string;
  task_name: string;
}

export interface ScriptColumnDef {
  id: string;
  name: string;
  type: "text" | "dropdown";
  width?: string;
  options?: string[];
}

export interface FolderArchitectureItem {
  id: string;
  name: string;
  parent_id?: string | null;
}

export const DEFAULT_FOLDER_ARCHITECTURE: FolderArchitectureItem[] = [
  { id: "fld_raw", name: "Raw_Footage", parent_id: null },
];

export const FOLDER_ARCHITECTURE_PRESETS: {
  name: string;
  description: string;
  folders: FolderArchitectureItem[];
}[] = [
  {
    name: "Minimal (Default)",
    description: "Single Raw Footage folder",
    folders: [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }],
  },
  {
    name: "YouTube Standard",
    description: "Footage, B-Roll, Thumbnails, Audio, Project Files",
    folders: [
      { id: "fld_raw", name: "Raw_Footage", parent_id: null },
      { id: "fld_broll", name: "B-Roll", parent_id: null },
      { id: "fld_thumb", name: "Thumbnails", parent_id: null },
      { id: "fld_audio", name: "Audio", parent_id: null },
      { id: "fld_proj", name: "Project_Files", parent_id: null },
    ],
  },
  {
    name: "Podcast / Interview",
    description: "Footage, Multitrack Audio, Graphics, Social Cuts",
    folders: [
      { id: "fld_raw", name: "Raw_Footage", parent_id: null },
      { id: "fld_audio", name: "Audio_Multitrack", parent_id: null },
      { id: "fld_graphics", name: "Graphics_Assets", parent_id: null },
      { id: "fld_clips", name: "Social_Cuts", parent_id: null },
    ],
  },
  {
    name: "Organized Multi-Tier",
    description: "Numbered folders with nested Assets subfolders",
    folders: [
      { id: "fld_raw", name: "01_Raw_Footage", parent_id: null },
      { id: "fld_assets", name: "02_Assets", parent_id: null },
      { id: "fld_broll", name: "B-Roll", parent_id: "fld_assets" },
      { id: "fld_sfx", name: "SFX_Music", parent_id: "fld_assets" },
      { id: "fld_thumb", name: "03_Thumbnails", parent_id: null },
      { id: "fld_proj", name: "04_Project_Files", parent_id: null },
    ],
  },
];

export const DEFAULT_SCRIPT_COL_DEFS: ScriptColumnDef[] = [
  {
    id: "col_roll",
    name: "Roll Type",
    type: "dropdown",
    width: "140px",
    options: ["A-Roll", "B-Roll", "Screen Recording", "Skit"],
  },
  { id: "col_dialogue", name: "Dialogue / Spoken Words", type: "text", width: "340px" },
  { id: "col_visual", name: "Visual / B-Roll Cue", type: "text", width: "220px" },
  { id: "col_audio", name: "Audio / SFX Cue", type: "text", width: "180px" },
];

interface BrandItem {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  color: string | null;
  is_default: boolean;
  _count?: {
    content_series: number;
  };
  content_series?: {
    id: string;
    name: string;
    prefix: string | null;
  }[];
}

interface ContentTypeItem {
  id: string;
  brand_id?: string | null;
  brand?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  name: string;
  prefix: string | null;
  suffix: string | null;
  id_generation_type: "sequential" | "date_counter";
  default_months_open: number;
  cadence_type: "weekly" | "biweekly" | "triweekly" | "quadrupleweekly";
  cadence_start_date: string | null;
  upload_days: string[];
  workflow_tasks: WorkflowTaskItem[];
  misc_tasks: MiscTaskItem[];
  script_default_columns?: ScriptColumnDef[] | null;
  default_folder_architecture?: FolderArchitectureItem[] | null;
}

const BRAND_COLOR_SWATCHES = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const TASK_COLOR_OPTIONS: {
  id: string;
  name: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  lineThrough?: boolean;
}[] = [
  { id: "yellow", name: "Yellow (Ideation)", bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", dot: "#f59e0b" },
  { id: "orange", name: "Orange (Script)", bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", dot: "#f97316" },
  { id: "blue", name: "Blue (Shoot)", bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", dot: "#3b82f6" },
  { id: "light-green", name: "Light Green (Edit)", bg: "bg-lime-500/15", text: "text-lime-400", border: "border-lime-500/30", dot: "#84cc16" },
  { id: "green", name: "Green (Schedule)", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "#10b981" },
  { id: "green-strikethrough", name: "Green (Publish Strikethrough)", bg: "bg-emerald-500/15", text: "text-emerald-400 line-through", border: "border-emerald-500/30", dot: "#10b981", lineThrough: true },
  { id: "purple", name: "Purple", bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30", dot: "#a855f7" },
  { id: "rose", name: "Rose / Red", bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30", dot: "#f43f5e" },
];

export function getTaskColorInfo(taskName: string, customColor?: string | null) {
  if (customColor) {
    const found = TASK_COLOR_OPTIONS.find((c) => c.id === customColor);
    if (found) return found;
  }
  const key = taskName.toLowerCase().trim();
  if (key === "ideation") return TASK_COLOR_OPTIONS[0];
  if (key === "script") return TASK_COLOR_OPTIONS[1];
  if (key === "shoot") return TASK_COLOR_OPTIONS[2];
  if (key === "edit") return TASK_COLOR_OPTIONS[3];
  if (key === "schedule") return TASK_COLOR_OPTIONS[4];
  if (key === "publish") return TASK_COLOR_OPTIONS[5];
  return TASK_COLOR_OPTIONS[2];
}

export const DEFAULT_TASK_HEX_COLORS: Record<string, string> = {
  ideation: "#FFFF00",
  script: "#f97316",
  shoot: "#3b82f6",
  edit: "#84cc16",
  schedule: "#10b981",
  publish: "#6b7280",
};

export const COLOR_ID_TO_HEX: Record<string, string> = {
  yellow: "#FFFF00",
  orange: "#f97316",
  blue: "#3b82f6",
  "light-green": "#84cc16",
  green: "#10b981",
  "green-strikethrough": "#6b7280",
  purple: "#a855f7",
  rose: "#f43f5e",
  gray: "#6b7280",
};

export const PRESET_SWATCH_COLORS = [
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Orange", hex: "#f97316" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Light Green", hex: "#84cc16" },
  { name: "Green", hex: "#10b981" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Gray", hex: "#6b7280" },
];

export function resolveTaskColorHex(taskName: string, colorValue?: string | null): string {
  if (colorValue) {
    if (colorValue.startsWith("#")) return colorValue;
    if (COLOR_ID_TO_HEX[colorValue.toLowerCase()]) return COLOR_ID_TO_HEX[colorValue.toLowerCase()];
  }
  const key = taskName.toLowerCase().trim();
  return DEFAULT_TASK_HEX_COLORS[key] || "#3b82f6";
}

function TaskColorSwatch({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`w-6 h-6 rounded-md border border-border shadow-xs block transition-transform shrink-0 relative overflow-hidden ${
        disabled
          ? "cursor-default opacity-80"
          : "cursor-pointer hover:scale-110 hover:border-primary/60"
      }`}
      style={{ backgroundColor: color }}
      title={disabled ? `Color: ${color}` : `Click to choose color (${color})`}
    >
      {!disabled && (
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="opacity-0 w-full h-full cursor-pointer absolute inset-0 p-0 m-0 border-0"
        />
      )}
    </label>
  );
}

interface CadenceUploadDaysPickerProps {
  cadence: "weekly" | "biweekly" | "triweekly" | "quadrupleweekly";
  uploadDays: string[];
  onChange: (days: string[]) => void;
}

export function CadenceUploadDaysPicker({
  cadence,
  uploadDays,
  onChange,
}: CadenceUploadDaysPickerProps) {
  const numWeeks =
    cadence === "biweekly"
      ? 2
      : cadence === "triweekly"
      ? 3
      : cadence === "quadrupleweekly"
      ? 4
      : 1;

  const isDaySelected = (weekNum: number, day: string) => {
    if (numWeeks === 1) {
      return (
        uploadDays.includes(day) ||
        uploadDays.includes(`W1-${day}`) ||
        uploadDays.map((d) => d.toLowerCase()).includes(day.toLowerCase())
      );
    }
    const tag = `W${weekNum}-${day}`;
    const hasTags = uploadDays.some((d) => /^W\d+-/i.test(d));
    if (!hasTags && weekNum === 1) {
      return uploadDays.includes(day) || uploadDays.includes(tag);
    }
    return uploadDays.some((d) => d.toLowerCase() === tag.toLowerCase());
  };

  const toggleDay = (weekNum: number, day: string) => {
    const isSelected = isDaySelected(weekNum, day);
    const tag = numWeeks === 1 ? day : `W${weekNum}-${day}`;

    if (isSelected) {
      if (uploadDays.length <= 1) return;
      const updated = uploadDays.filter((d) => {
        if (numWeeks === 1) {
          return d !== day && d !== `W1-${day}`;
        }
        return d.toLowerCase() !== tag.toLowerCase() && (weekNum !== 1 || d !== day);
      });
      onChange(updated.length > 0 ? updated : [tag]);
    } else {
      if (numWeeks === 1) {
        const cleaned = uploadDays.map((d) => d.replace(/^W\d+-/i, ""));
        onChange(Array.from(new Set([...cleaned, day])));
      } else {
        const normalized = uploadDays.map((d) => (/^W\d+-/i.test(d) ? d : `W1-${d}`));
        onChange(Array.from(new Set([...normalized, tag])));
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="font-semibold block text-xs">
          Upload Days ({numWeeks} Week{numWeeks > 1 ? "s" : ""} Cycle) *
        </label>
        <span className="text-[10px] font-mono text-muted-foreground">
          {numWeeks === 1
            ? "1-week repeating cadence"
            : `${numWeeks}-week rotating timetable`}
        </span>
      </div>

      <div
        className={`grid gap-2.5 ${
          numWeeks === 1
            ? "grid-cols-1"
            : numWeeks === 2
            ? "grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2"
        }`}
      >
        {Array.from({ length: numWeeks }, (_, i) => i + 1).map((weekNum) => {
          const selectedInWeek = ALL_DAYS.filter((d) => isDaySelected(weekNum, d));
          return (
            <div
              key={weekNum}
              className="p-2.5 rounded-xl bg-muted/20 border border-border flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-primary" />
                  Week {weekNum}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {selectedInWeek.length} video{selectedInWeek.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {ALL_DAYS.map((day) => {
                  const active = isDaySelected(weekNum, day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(weekNum, day)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                          : "bg-background/80 text-muted-foreground border-border hover:bg-muted"
                      }`}
                      title={`${day} (Week ${weekNum})`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCadenceSummary(selectedType: ContentTypeItem): string {
  const numWeeks =
    selectedType.cadence_type === "biweekly"
      ? 2
      : selectedType.cadence_type === "triweekly"
      ? 3
      : selectedType.cadence_type === "quadrupleweekly"
      ? 4
      : 1;

  if (numWeeks === 1) {
    const days = (selectedType.upload_days || ["Tuesday"]).map((d) =>
      d.replace(/^W1-/i, "")
    );
    return days.join(", ") || "None";
  }

  const parts: string[] = [];
  for (let w = 1; w <= numWeeks; w++) {
    const days = (selectedType.upload_days || [])
      .filter((d) => d.toLowerCase().startsWith(`w${w}-`))
      .map((d) => d.replace(new RegExp(`^w${w}-`, "i"), ""));
    parts.push(`W${w}: ${days.length > 0 ? days.map((d) => d.slice(0, 3)).join(", ") : "None"}`);
  }
  return parts.join(" • ");
}

export function ContentTypesTab() {
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [contentTypes, setContentTypes] = useState<ContentTypeItem[]>([]);
  const [roles, setRoles] = useState<
    {
      id: string;
      name: string;
      email: string;
      role_title: string;
      assigned_content_types: string[] | string;
      permissions: any;
    }[]
  >([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pipeline Sequence Form State & Unified Save State
  const [localTasks, setLocalTasks] = useState<WorkflowTaskItem[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Brand Modal & Form States
  const [isNewBrandModalOpen, setIsNewBrandModalOpen] = useState(false);
  const [isEditBrandModalOpen, setIsEditBrandModalOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [brandIsDefault, setBrandIsDefault] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandFormError, setBrandFormError] = useState<string | null>(null);

  const [deleteConfirmBrand, setDeleteConfirmBrand] = useState<BrandItem | null>(null);
  const [deleteBrandError, setDeleteBrandError] = useState<string | null>(null);
  const [deleteBrandNeedsConfirm, setDeleteBrandNeedsConfirm] = useState(false);
  const [deleteBrandDriveData, setDeleteBrandDriveData] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState(false);

  // Modal states (Content Series & Tasks)
  const [isNewTypeModalOpen, setIsNewTypeModalOpen] = useState(false);
  const [isEditTypeModalOpen, setIsEditTypeModalOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newMiscInput, setNewMiscInput] = useState("");
  const [editingMiscId, setEditingMiscId] = useState<string | null>(null);
  const [editingMiscName, setEditingMiscName] = useState("");
  const [typeFormError, setTypeFormError] = useState<string | null>(null);

  // Confirmation Modals
  const [hideConfirmTask, setHideConfirmTask] = useState<WorkflowTaskItem | null>(null);
  const [hideStep, setHideStep] = useState<1 | 2>(1);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<WorkflowTaskItem | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);

  // Content Series Form State
  const [typeBrandId, setTypeBrandId] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typePrefix, setTypePrefix] = useState("");
  const [typeSuffix, setTypeSuffix] = useState("");
  const [typeCadence, setTypeCadence] = useState<
    "weekly" | "biweekly" | "triweekly" | "quadrupleweekly"
  >("weekly");
  const [typeUploadDays, setTypeUploadDays] = useState<string[]>(["Tuesday"]);
  const [typeIdGen, setTypeIdGen] = useState<"sequential" | "date_counter">("date_counter");

  // Publish Dates Organizer Pop-up State (Triggered upon Cadence modification)
  const [isOrganizerModalOpen, setIsOrganizerModalOpen] = useState(false);
  const [organizerTargetType, setOrganizerTargetType] = useState<any>(null);

  // New Workflow Task Form State
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskOffset, setNewTaskOffset] = useState<number>(3);
  const [newTaskBuffer1, setNewTaskBuffer1] = useState<number>(2);
  const [newTaskBufferFinal, setNewTaskBufferFinal] = useState<number>(1);
  const [newTaskColor, setNewTaskColor] = useState<string>("#3b82f6");

  // Fetch all brands, content series, and team roles
  const fetchContentTypes = async (
    preferredBrandId?: string | null,
    preferredTypeId?: string | null,
    options?: { silent?: boolean }
  ) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setLoadError(null);
      const [brandsRes, res, rolesRes] = await Promise.all([
        fetch("/api/settings/brands"),
        fetch("/api/settings/content-types"),
        fetch("/api/settings/roles"),
      ]);

      let fetchedBrands: BrandItem[] = [];
      let fetchedSeries: ContentTypeItem[] = [];

      if (brandsRes.ok) {
        fetchedBrands = await brandsRes.json();
        setBrands(fetchedBrands);
      } else {
        const errData = await brandsRes.json().catch(() => ({}));
        setLoadError(errData.error || `Failed to load brands (HTTP ${brandsRes.status}).`);
      }

      if (res.ok) {
        fetchedSeries = await res.json();
        setContentTypes(fetchedSeries);
      } else {
        const errData = await res.json().catch(() => ({}));
        setLoadError(
          errData.error || `Failed to load content series (HTTP ${res.status}).`
        );
      }

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }

      const targetBrandId =
        preferredBrandId !== undefined
          ? preferredBrandId
          : selectedBrandId && fetchedBrands.some((b) => b.id === selectedBrandId)
          ? selectedBrandId
          : fetchedBrands.find((b) => b.is_default)?.id || fetchedBrands[0]?.id || null;

      setSelectedBrandId(targetBrandId);

      const scoped = targetBrandId
        ? fetchedSeries.filter((t) => t.brand_id === targetBrandId)
        : fetchedSeries;

      const candidateTypeId =
        preferredTypeId !== undefined ? preferredTypeId : selectedTypeId;

      if (candidateTypeId && scoped.some((t) => t.id === candidateTypeId)) {
        setSelectedTypeId(candidateTypeId);
      } else {
        setSelectedTypeId(scoped[0]?.id || null);
      }
    } catch (err) {
      console.error("Error fetching brands, content series, or roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContentTypes();
  }, []);

  const selectedBrand =
    brands.find((b) => b.id === selectedBrandId) ||
    brands.find((b) => b.is_default) ||
    brands[0] ||
    null;

  const scopedContentTypes = React.useMemo(() => {
    if (!selectedBrand) return contentTypes;
    return contentTypes.filter((t) => t.brand_id === selectedBrand.id);
  }, [contentTypes, selectedBrand]);

  const selectedType =
    scopedContentTypes.find((t) => t.id === selectedTypeId) ||
    scopedContentTypes[0] ||
    null;

  const handleSelectBrand = (brandId: string) => {
    setSelectedBrandId(brandId);
    const firstInBrand = contentTypes.find((t) => t.brand_id === brandId);
    setSelectedTypeId(firstInBrand ? firstInBrand.id : null);
  };

  const resetBrandForm = () => {
    setBrandName("");
    setBrandDescription("");
    setBrandColor("#6366f1");
    setBrandIsDefault(false);
    setBrandFormError(null);
  };

  const openEditBrandModal = (brand: BrandItem) => {
    setBrandName(brand.name);
    setBrandDescription(brand.description || "");
    setBrandColor(brand.color || "#6366f1");
    setBrandIsDefault(Boolean(brand.is_default));
    setBrandFormError(null);
    setIsEditBrandModalOpen(true);
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim() || brandSaving) return;

    try {
      setBrandSaving(true);
      setBrandFormError(null);
      const res = await fetch("/api/settings/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brandName.trim(),
          description: brandDescription.trim() || null,
          color: brandColor,
          is_default: brandIsDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBrandFormError(data.error || "Failed to create brand.");
        return;
      }
      setIsNewBrandModalOpen(false);
      resetBrandForm();
      await fetchContentTypes(data.id, null, { silent: true });
    } catch (err) {
      console.error("Error creating brand:", err);
      setBrandFormError("Network error creating brand.");
    } finally {
      setBrandSaving(false);
    }
  };

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrand || !brandName.trim() || brandSaving) return;

    try {
      setBrandSaving(true);
      setBrandFormError(null);
      const res = await fetch(`/api/settings/brands/${selectedBrand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brandName.trim(),
          description: brandDescription.trim() || null,
          color: brandColor,
          is_default: brandIsDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBrandFormError(data.error || "Failed to update brand.");
        return;
      }
      setIsEditBrandModalOpen(false);
      resetBrandForm();
      await fetchContentTypes(selectedBrand.id, selectedType?.id || null, { silent: true });
    } catch (err) {
      console.error("Error updating brand:", err);
      setBrandFormError("Network error updating brand.");
    } finally {
      setBrandSaving(false);
    }
  };

  const handleOpenDeleteBrand = (brand: BrandItem) => {
    setDeleteConfirmBrand(brand);
    setDeleteBrandError(null);
    setDeleteBrandNeedsConfirm(false);
    setDeleteBrandDriveData(false);
  };

  const executeDeleteBrand = async (forceConfirm = false) => {
    if (!deleteConfirmBrand || deletingBrand) return;
    try {
      setDeletingBrand(true);
      setDeleteBrandError(null);
      const params = new URLSearchParams();
      if (forceConfirm) params.set("confirm", "true");
      if (deleteBrandDriveData) params.set("deleteDrive", "true");
      const qs = params.toString();
      const url = `/api/settings/brands/${deleteConfirmBrand.id}${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setDeleteBrandError(data.error || "Failed to delete brand.");
        if (data.requiresConfirmation) {
          setDeleteBrandNeedsConfirm(true);
        }
        return;
      }

      const remainingBrand = brands.find((b) => b.id !== deleteConfirmBrand.id);
      setDeleteConfirmBrand(null);
      setDeleteBrandError(null);
      setDeleteBrandNeedsConfirm(false);
      setDeleteBrandDriveData(false);
      await fetchContentTypes(remainingBrand?.id || null, null, { silent: true });
    } catch (err) {
      console.error("Error deleting brand:", err);
      setDeleteBrandError("Network error deleting brand.");
    } finally {
      setDeletingBrand(false);
    }
  };

  // Team members qualified for Content Submission for currently selected Content Series
  const qualifiedSubmissionRoles = React.useMemo(() => {
    if (!selectedType || roles.length === 0) return [];
    return roles.filter((role) => {
      let perms: any = {};
      try {
        perms =
          typeof role.permissions === "string"
            ? JSON.parse(role.permissions)
            : role.permissions || {};
      } catch {
        perms = {};
      }

      let assignedTypes: string[] = [];
      try {
        assignedTypes = Array.isArray(role.assigned_content_types)
          ? role.assigned_content_types
          : JSON.parse((role.assigned_content_types as string) || "[]");
      } catch {
        assignedTypes = [];
      }

      const isAssigned =
        assignedTypes.length === 0 ||
        assignedTypes.includes("ALL") ||
        assignedTypes.includes(selectedType.id) ||
        assignedTypes.includes(selectedType.name);

      if (!isAssigned) return false;

      const config = getRoleConfigForContentType(perms, selectedType.id);
      return (
        config.responsibilities?.content_submission?.enabled === true ||
        perms.responsibilities?.content_submission?.enabled === true
      );
    });
  }, [roles, selectedType]);

  // Handler: Create Content Series
  const handleCreateContentType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) return;

    try {
      setTypeFormError(null);
      const targetBrandId = typeBrandId || selectedBrand?.id || undefined;
      const res = await fetch("/api/settings/content-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: targetBrandId,
          name: typeName.trim(),
          prefix: typePrefix.trim() || null,
          suffix: typeSuffix.trim() || null,
          cadence_type: typeCadence,
          upload_days: typeUploadDays,
          id_generation_type: typeIdGen,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTypeFormError(data.error || "Failed to create content series.");
        return;
      }

      setIsNewTypeModalOpen(false);
      resetTypeForm();
      await fetchContentTypes(data.brand_id || targetBrandId || null, data.id, { silent: true });
    } catch (err) {
      console.error("Error creating content series:", err);
      setTypeFormError("Network error creating content series.");
    }
  };

  // Handler: Update Content Series
  const handleUpdateContentType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !typeName.trim()) return;

    const cadenceChanged =
      selectedType.cadence_type !== typeCadence ||
      JSON.stringify(selectedType.upload_days || []) !== JSON.stringify(typeUploadDays);

    try {
      setTypeFormError(null);
      const targetBrandId = typeBrandId || selectedType.brand_id || selectedBrand?.id;
      const res = await fetch(`/api/settings/content-types/${selectedType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: targetBrandId,
          name: typeName.trim(),
          prefix: typePrefix.trim() || null,
          suffix: typeSuffix.trim() || null,
          cadence_type: typeCadence,
          upload_days: typeUploadDays,
          id_generation_type: typeIdGen,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTypeFormError(data.error || "Failed to update content series.");
        return;
      }

      setIsEditTypeModalOpen(false);
      const updatedTarget = {
        ...selectedType,
        brand_id: targetBrandId,
        name: typeName.trim(),
        cadence_type: typeCadence,
        upload_days: typeUploadDays,
      };
      resetTypeForm();
      await fetchContentTypes(targetBrandId || null, selectedType.id, { silent: true });

      if (cadenceChanged) {
        setOrganizerTargetType(updatedTarget);
        setIsOrganizerModalOpen(true);
      }
    } catch (err) {
      console.error("Error updating content series:", err);
      setTypeFormError("Network error updating content series.");
    }
  };

  // Handler: Delete Content Series
  const handleDeleteContentType = async (typeId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this Content Series and all its workflow settings?"
      )
    )
      return;
    try {
      const res = await fetch(`/api/settings/content-types/${typeId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchContentTypes(selectedBrand?.id || null, null, { silent: true });
      }
    } catch (err) {
      console.error("Error deleting content series:", err);
    }
  };

  // Synchronize local pipeline tasks when selected Content Type changes
  useEffect(() => {
    if (selectedType?.workflow_tasks) {
      const sorted = [...selectedType.workflow_tasks]
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map(normalizeTaskForEditor);
      setLocalTasks(sorted);
    }
  }, [selectedType?.id, selectedType?.workflow_tasks]);

  // Compute workflow dirty state
  const isWorkflowDirty = React.useMemo(() => {
    if (!selectedType?.workflow_tasks || localTasks.length === 0) return false;
    const original = [...selectedType.workflow_tasks]
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map(normalizeTaskForEditor);
    if (localTasks.length !== original.length) return true;
    return localTasks.some((task, i) => {
      const orig = original[i];
      if (!orig) return true;
      return (
        task.id !== orig.id ||
        task.task_name !== orig.task_name ||
        task.sequence_order !== orig.sequence_order ||
        task.n_days_offset !== orig.n_days_offset ||
        task.team_buffer_days !== orig.team_buffer_days ||
        task.team_final_buffer_days !== orig.team_final_buffer_days ||
        (task.color || "") !== (orig.color || "") ||
        Boolean(task.is_hidden) !== Boolean(orig.is_hidden) ||
        (task.update_mode || "manual") !== (orig.update_mode || "manual") ||
        (task.automation_trigger || null) !== (orig.automation_trigger || null) ||
        (task.automation_role_id || null) !== (orig.automation_role_id || null) ||
        Boolean(task.require_closure_link) !== Boolean(orig.require_closure_link)
      );
    });
  }, [localTasks, selectedType?.workflow_tasks]);

  const updateLocalTask = (taskId: string, partial: Partial<WorkflowTaskItem>) => {
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...partial } : t))
    );
  };

  const moveLocalTask = (currentIndex: number, direction: "up" | "down") => {
    if (currentIndex <= 0 || currentIndex >= localTasks.length - 1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex <= 0 || targetIndex >= localTasks.length - 1) return;

    setLocalTasks((prev) => {
      const next = [...prev];
      const temp = next[currentIndex];
      next[currentIndex] = next[targetIndex];
      next[targetIndex] = temp;
      return next.map((t, idx) => ({ ...t, sequence_order: idx + 1 }));
    });
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !newTaskName.trim()) return;

    try {
      const res = await fetch("/api/settings/workflow-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type_id: selectedType.id,
          task_name: newTaskName.trim(),
          n_days_offset: newTaskOffset,
          team_buffer_days: newTaskBuffer1,
          team_final_buffer_days: newTaskBufferFinal,
          color: newTaskColor,
        }),
      });

      if (res.ok) {
        setIsNewTaskModalOpen(false);
        setNewTaskName("");
        await fetchContentTypes(selectedBrand?.id || null, selectedType.id, { silent: true });
      }
    } catch (err) {
      console.error("Error adding task:", err);
    }
  };

  const executeHideTask = async () => {
    if (!hideConfirmTask) return;
    try {
      await fetch(`/api/settings/workflow-tasks/${hideConfirmTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_hidden: !hideConfirmTask.is_hidden,
        }),
      });
      setHideConfirmTask(null);
      setHideStep(1);
      await fetchContentTypes(selectedBrand?.id || null, selectedType?.id || null, {
        silent: true,
      });
    } catch (err) {
      console.error("Error toggling task hidden status:", err);
    }
  };

  const executeDeleteTask = async () => {
    if (!deleteConfirmTask) return;
    try {
      await fetch(`/api/settings/workflow-tasks/${deleteConfirmTask.id}`, {
        method: "DELETE",
      });
      setDeleteConfirmTask(null);
      setDeleteStep(1);
      await fetchContentTypes(selectedBrand?.id || null, selectedType?.id || null, {
        silent: true,
      });
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  // Misc Checklist Task handlers (smooth optimistic updates + silent refresh)
  const handleAddMiscTask = async () => {
    if (!selectedType || !newMiscInput.trim()) return;
    const taskName = newMiscInput.trim();
    setNewMiscInput("");
    try {
      const res = await fetch("/api/settings/misc-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type_id: selectedType.id,
          task_name: taskName,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setContentTypes((prev) =>
          prev.map((ct) =>
            ct.id === selectedType.id
              ? { ...ct, misc_tasks: [...(ct.misc_tasks || []), created] }
              : ct
          )
        );
      }
    } catch (err) {
      console.error("Error adding misc task:", err);
    }
  };

  const handleRenameMiscTask = async (miscId: string) => {
    const trimmed = editingMiscName.trim();
    setEditingMiscId(null);
    if (!trimmed || !selectedType) return;
    setContentTypes((prev) =>
      prev.map((ct) =>
        ct.id === selectedType.id
          ? {
              ...ct,
              misc_tasks: (ct.misc_tasks || []).map((m) =>
                m.id === miscId ? { ...m, task_name: trimmed } : m
              ),
            }
          : ct
      )
    );
    try {
      await fetch(`/api/settings/misc-tasks/${miscId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_name: trimmed }),
      });
    } catch (err) {
      console.error("Error renaming misc task:", err);
    }
  };

  const handleDeleteMiscTask = async (miscId: string) => {
    if (!selectedType) return;
    setContentTypes((prev) =>
      prev.map((ct) =>
        ct.id === selectedType.id
          ? {
              ...ct,
              misc_tasks: (ct.misc_tasks || []).filter((m) => m.id !== miscId),
            }
          : ct
      )
    );
    try {
      await fetch(`/api/settings/misc-tasks/${miscId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Error deleting misc task:", err);
    }
  };

  // Script Default Columns States & Handlers
  const [scriptColumns, setScriptColumns] = useState<ScriptColumnDef[]>([]);
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedType) {
      if (
        selectedType.script_default_columns &&
        Array.isArray(selectedType.script_default_columns) &&
        selectedType.script_default_columns.length > 0
      ) {
        setScriptColumns(
          selectedType.script_default_columns.filter(
            (c) => c.id !== "col_sr" && c.id !== "sr_no"
          )
        );
      } else {
        setScriptColumns(DEFAULT_SCRIPT_COL_DEFS);
      }
    }
  }, [selectedType?.id, selectedType?.script_default_columns]);

  const handleAddScriptColumn = () => {
    const newCol: ScriptColumnDef = {
      id: `col_${Date.now()}`,
      name: `Column ${scriptColumns.length + 1}`,
      type: "text",
      width: "220px",
    };
    setScriptColumns([...scriptColumns, newCol]);
  };

  const handleDeleteScriptColumn = (colId: string) => {
    if (scriptColumns.length <= 1) return;
    setScriptColumns(scriptColumns.filter((c) => c.id !== colId));
  };

  const handleMoveScriptColumn = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= scriptColumns.length) return;
    const updated = [...scriptColumns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setScriptColumns(updated);
  };

  const handleUpdateScriptColField = (
    colId: string,
    field: "name" | "type" | "width",
    value: string
  ) => {
    setScriptColumns(
      scriptColumns.map((col) => {
        if (col.id === colId) {
          if (field === "type") {
            const nextType = value as "text" | "dropdown";
            return {
              ...col,
              type: nextType,
              options:
                nextType === "dropdown"
                  ? col.options && col.options.length > 0
                    ? col.options
                    : ["Option 1", "Option 2"]
                  : undefined,
            };
          }
          return { ...col, [field]: value };
        }
        return col;
      })
    );
  };

  const handleAddDropdownOption = (colId: string) => {
    const optVal = (newOptionInputs[colId] || "").trim();
    if (!optVal) return;
    setScriptColumns(
      scriptColumns.map((col) => {
        if (col.id === colId) {
          const current = col.options || [];
          if (!current.includes(optVal)) {
            return { ...col, options: [...current, optVal] };
          }
        }
        return col;
      })
    );
    setNewOptionInputs((prev) => ({ ...prev, [colId]: "" }));
  };

  const handleRemoveDropdownOption = (colId: string, optToRemove: string) => {
    setScriptColumns(
      scriptColumns.map((col) => {
        if (col.id === colId) {
          return {
            ...col,
            options: (col.options || []).filter((o) => o !== optToRemove),
          };
        }
        return col;
      })
    );
  };

  // Default Content Folder Architecture State & Handlers
  const [folderArchitecture, setFolderArchitecture] = useState<FolderArchitectureItem[]>([]);
  const [newTopFolderInput, setNewTopFolderInput] = useState("");

  useEffect(() => {
    if (selectedType) {
      if (
        selectedType.default_folder_architecture &&
        Array.isArray(selectedType.default_folder_architecture) &&
        selectedType.default_folder_architecture.length > 0
      ) {
        setFolderArchitecture(selectedType.default_folder_architecture);
      } else {
        setFolderArchitecture(DEFAULT_FOLDER_ARCHITECTURE);
      }
    }
  }, [selectedType?.id, selectedType?.default_folder_architecture]);

  const handleAddTopFolder = (customName?: string) => {
    const rawName = (customName || newTopFolderInput || "New_Folder").trim();
    const cleanName =
      rawName.replace(/[\/\\:*?"<>|]/g, "_") || `Folder_${folderArchitecture.length + 1}`;
    const newFolder: FolderArchitectureItem = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      parent_id: null,
    };
    setFolderArchitecture((prev) => [...prev, newFolder]);
    setNewTopFolderInput("");
  };

  const handleAddSubfolder = (parentId: string) => {
    const parent = folderArchitecture.find((f) => f.id === parentId);
    const cleanName = parent ? `Sub_${parent.name}` : "New_Subfolder";
    const newFolder: FolderArchitectureItem = {
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      parent_id: parentId,
    };
    setFolderArchitecture((prev) => {
      const parentIdx = prev.findIndex((f) => f.id === parentId);
      if (parentIdx === -1) return [...prev, newFolder];
      const copy = [...prev];
      copy.splice(parentIdx + 1, 0, newFolder);
      return copy;
    });
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    const cleanName = newName.replace(/[\/\\:*?"<>|]/g, "_");
    setFolderArchitecture((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: cleanName } : f))
    );
  };

  const handleDeleteFolder = (folderId: string) => {
    if (folderArchitecture.length <= 1) return;
    setFolderArchitecture((prev) =>
      prev
        .filter((f) => f.id !== folderId)
        .map((f) => (f.parent_id === folderId ? { ...f, parent_id: null } : f))
    );
  };

  const handleMoveFolder = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= folderArchitecture.length) return;
    const updated = [...folderArchitecture];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setFolderArchitecture(updated);
  };

  const handleApplyFolderPreset = (presetFolders: FolderArchitectureItem[]) => {
    const cloned = presetFolders.map((f) => ({
      ...f,
      id: `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    }));
    const idMap: Record<string, string> = {};
    presetFolders.forEach((orig, i) => {
      idMap[orig.id] = cloned[i].id;
    });
    cloned.forEach((item, i) => {
      if (presetFolders[i].parent_id && idMap[presetFolders[i].parent_id!]) {
        item.parent_id = idMap[presetFolders[i].parent_id!];
      }
    });
    setFolderArchitecture(cloned);
  };

  // Compute dirty state for Script Columns & Folder Architecture
  const isScriptColsDirty = React.useMemo(() => {
    if (!selectedType) return false;
    const savedCols =
      selectedType.script_default_columns &&
      Array.isArray(selectedType.script_default_columns) &&
      selectedType.script_default_columns.length > 0
        ? selectedType.script_default_columns.filter(
            (c) => c.id !== "col_sr" && c.id !== "sr_no"
          )
        : DEFAULT_SCRIPT_COL_DEFS;
    return JSON.stringify(scriptColumns) !== JSON.stringify(savedCols);
  }, [scriptColumns, selectedType]);

  const isFolderArchDirty = React.useMemo(() => {
    if (!selectedType) return false;
    const savedArch =
      selectedType.default_folder_architecture &&
      Array.isArray(selectedType.default_folder_architecture) &&
      selectedType.default_folder_architecture.length > 0
        ? selectedType.default_folder_architecture
        : DEFAULT_FOLDER_ARCHITECTURE;
    return JSON.stringify(folderArchitecture) !== JSON.stringify(savedArch);
  }, [folderArchitecture, selectedType]);

  const hasUnsavedChanges = isWorkflowDirty || isScriptColsDirty || isFolderArchDirty;

  // Unified smooth Save All handler (used by both top and bottom Save buttons)
  const handleSaveAllChanges = async () => {
    if (!selectedType || !hasUnsavedChanges || isSavingAll) return;

    try {
      setIsSavingAll(true);
      const requests: Promise<Response>[] = [];
      let updatedTasksResult: WorkflowTaskItem[] | null = null;
      let updatedSeriesResult: ContentTypeItem | null = null;

      if (isWorkflowDirty) {
        requests.push(
          fetch("/api/settings/workflow-tasks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content_type_id: selectedType.id,
              tasks: localTasks.map((t, idx) => {
                const isPublish = t.task_name.toLowerCase() === "publish";
                return {
                  id: t.id,
                  task_name: t.task_name,
                  sequence_order: idx + 1,
                  n_days_offset: isPublish ? 0 : t.n_days_offset,
                  team_buffer_days: t.team_buffer_days,
                  team_final_buffer_days: t.team_final_buffer_days,
                  is_hidden: t.is_hidden,
                  color: t.color,
                  update_mode: isPublish ? "automatic" : t.update_mode || "manual",
                  automation_trigger: isPublish
                    ? "publish_rules"
                    : t.update_mode === "automatic"
                    ? t.automation_trigger || "script_studio"
                    : null,
                  automation_role_id:
                    !isPublish &&
                    t.update_mode === "automatic" &&
                    t.automation_trigger === "content_submission"
                      ? t.automation_role_id || null
                      : null,
                  require_closure_link: isPublish ? false : Boolean(t.require_closure_link),
                };
              }),
            }),
          }).then(async (res) => {
            if (res.ok) {
              updatedTasksResult = await res.json();
            }
            return res;
          })
        );
      }

      if (isScriptColsDirty || isFolderArchDirty) {
        requests.push(
          fetch(`/api/settings/content-types/${selectedType.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(isScriptColsDirty ? { script_default_columns: scriptColumns } : {}),
              ...(isFolderArchDirty
                ? { default_folder_architecture: folderArchitecture }
                : {}),
            }),
          }).then(async (res) => {
            if (res.ok) {
              updatedSeriesResult = await res.json();
            }
            return res;
          })
        );
      }

      const responses = await Promise.all(requests);
      if (responses.every((r) => r.ok)) {
        // Update React state directly without page reload or scroll reset
        setContentTypes((prev) =>
          prev.map((ct) => {
            if (ct.id !== selectedType.id) return ct;
            return {
              ...ct,
              ...(updatedSeriesResult
                ? {
                    script_default_columns: updatedSeriesResult.script_default_columns,
                    default_folder_architecture:
                      updatedSeriesResult.default_folder_architecture,
                  }
                : {}),
              ...(updatedTasksResult ? { workflow_tasks: updatedTasksResult } : {}),
            };
          })
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error("Error saving content series settings:", err);
    } finally {
      setIsSavingAll(false);
    }
  };

  const resetTypeForm = () => {
    setTypeBrandId(selectedBrand?.id || brands[0]?.id || "");
    setTypeName("");
    setTypePrefix("");
    setTypeSuffix("");
    setTypeCadence("weekly");
    setTypeUploadDays(["Tuesday"]);
    setTypeIdGen("date_counter");
    setTypeFormError(null);
  };

  const openEditModal = (type: ContentTypeItem) => {
    setTypeBrandId(type.brand_id || selectedBrand?.id || brands[0]?.id || "");
    setTypeName(type.name);
    setTypePrefix(type.prefix || "");
    setTypeSuffix(type.suffix || "");
    setTypeCadence(type.cadence_type);
    setTypeUploadDays(type.upload_days || ["Tuesday"]);
    setTypeIdGen(type.id_generation_type || "date_counter");
    setTypeFormError(null);
    setIsEditTypeModalOpen(true);
  };

  if (loading) {
    return (
      <div className="card-theme p-12 text-center flex flex-col items-center justify-center gap-3 rounded-2xl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="font-mono text-xs text-muted-foreground">
          Loading brands, workflows &amp; content series...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchContentTypes()}
            className="px-3 py-1 rounded-lg bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Unified Hierarchy Navigation Card: Brand -> Content Series    */}
      {/* ------------------------------------------------------------- */}
      <div className="card-theme rounded-2xl overflow-hidden">
        {/* Tier 1: Brand Switcher */}
        <div className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border/60">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>Brand</span>
            </div>

            {brands.map((b) => {
              const isSelected = selectedBrand?.id === b.id;
              const seriesCount =
                b._count?.content_series ??
                contentTypes.filter((ct) => ct.brand_id === b.id).length;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelectBrand(b.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "glass-subtle hover:bg-muted/70 text-foreground border-border"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: b.color || "#6366f1" }}
                  />
                  <span>{b.name}</span>
                  {b.is_default && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase ${
                        isSelected
                          ? "bg-white/20 text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      Default
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isSelected
                        ? "bg-white/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {seriesCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {selectedBrand && (
              <>
                <button
                  type="button"
                  onClick={() => openEditBrandModal(selectedBrand)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium glass-subtle hover:bg-muted/70 text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer"
                  title={`Edit ${selectedBrand.name}`}
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit Brand</span>
                </button>
                <button
                  type="button"
                  disabled={brands.length <= 1}
                  onClick={() => handleOpenDeleteBrand(selectedBrand)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                  title={
                    brands.length <= 1
                      ? "Cannot delete the last remaining brand"
                      : `Delete ${selectedBrand.name}`
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                resetBrandForm();
                setIsNewBrandModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Brand</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Content Series Selector inside Active Brand */}
        <div className="p-4 sm:px-5 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
              <Film className="w-3.5 h-3.5 text-primary" />
              <span>Series</span>
            </div>

            {scopedContentTypes.length === 0 ? (
              <span className="text-xs font-mono text-muted-foreground italic">
                No series yet in {selectedBrand?.name || "this Brand"}
              </span>
            ) : (
              scopedContentTypes.map((t) => {
                const isSelected = selectedType?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTypeId(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background/70 hover:bg-muted text-foreground border-border"
                    }`}
                  >
                    <span>{t.name}</span>
                    {(t.prefix || t.suffix) && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isSelected
                            ? "bg-white/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.prefix || ""}#{t.suffix || ""}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              resetTypeForm();
              setIsNewTypeModalOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold glass-subtle hover:bg-primary hover:text-primary-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Content Series</span>
          </button>
        </div>
      </div>

      {/* Empty State when Brand has no Content Series */}
      {!selectedType && selectedBrand && (
        <div className="card-theme rounded-2xl p-10 text-center space-y-3 border-dashed border-2 border-border/80">
          <Layers className="w-9 h-9 text-muted-foreground/40 mx-auto" />
          <h3 className="font-bold text-sm text-foreground">
            No Content Series in {selectedBrand.name}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Create a Content Series under <strong>{selectedBrand.name}</strong> to configure
            its upload cadence, ID prefix, sequential workflow pipeline, script columns, and
            Google Drive folders.
          </p>
          <button
            type="button"
            onClick={() => {
              resetTypeForm();
              setIsNewTypeModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Content Series</span>
          </button>
        </div>
      )}

      {/* Active Content Series Configuration Workspace */}
      {selectedType && (
        <div className="space-y-6">
          {/* 1. Series Identity & Cadence Summary Header Card */}
          <div className="card-theme rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                {selectedBrand && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium glass-subtle border border-border">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selectedBrand.color || "#6366f1" }}
                    />
                    <span>{selectedBrand.name}</span>
                  </span>
                )}
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {selectedType.name}
                </h2>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-muted border border-border text-muted-foreground">
                  ID: {selectedType.prefix || "—"}001{selectedType.suffix || ""}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium capitalize">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{selectedType.cadence_type} Cadence</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg glass-subtle font-mono text-[11px] text-foreground">
                  {formatCadenceSummary(selectedType)}
                </span>
                <span className="px-2.5 py-1 rounded-lg glass-subtle font-mono text-[11px] text-muted-foreground">
                  {localTasks.length} Stages • {selectedType.misc_tasks?.length || 0} Misc Checks
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasUnsavedChanges && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1.5 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
              <button
                type="button"
                onClick={() => openEditModal(selectedType)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Cadence &amp; Config</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAllChanges}
                disabled={!hasUnsavedChanges || isSavingAll}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
                  saveSuccess
                    ? "bg-emerald-600 text-white border border-emerald-600"
                    : hasUnsavedChanges
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary cursor-pointer ring-2 ring-primary/20"
                    : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                }`}
              >
                {isSavingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{saveSuccess ? "Saved!" : "Save Changes"}</span>
              </button>
              {contentTypes.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeleteContentType(selectedType.id)}
                  className="p-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all cursor-pointer"
                  title="Delete Content Series"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Streamlined Sequential Workflow Pipeline Card */}
          <div className="card-theme rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-border/60">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="font-bold text-sm">Sequential Workflow Pipeline</h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted border border-border">
                    {localTasks.length} Stages
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Locked endpoints: starts with <strong>Ideation</strong> and ends with{" "}
                  <strong>Publish</strong>. Use the up/down arrows to reorder, and configure
                  offsets (P - n), review buffers, and status triggers.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Task</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="min-w-[740px] space-y-2">
                {/* Table Header */}
                <div className="grid grid-cols-[4rem_2.5rem_1fr_5.5rem_5rem_5rem_6rem_4.5rem] items-center gap-2 px-3 py-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider glass-subtle rounded-xl">
                  <div className="text-center">Order</div>
                  <div className="text-center">Color</div>
                  <div>Stage Title</div>
                  <div className="text-center">Days (n)</div>
                  <div className="text-center">1st Buf</div>
                  <div className="text-center">Final Buf</div>
                  <div className="text-center">Target</div>
                  <div className="text-center">Actions</div>
                </div>

                {/* Stage Rows */}
                {localTasks.map((task, idx) => {
                  const isIdeation = task.task_name.toLowerCase() === "ideation";
                  const isPublish = task.task_name.toLowerCase() === "publish";
                  const isLocked = isIdeation || isPublish;

                  const cumulativeOffset = localTasks
                    .slice(idx)
                    .reduce((acc, t) => acc + (Number(t.n_days_offset) || 0), 0);

                  const colorHex = resolveTaskColorHex(task.task_name, task.color);

                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border transition-all duration-200 text-xs px-3 py-2.5 ${
                        task.is_hidden
                          ? "opacity-55 glass-subtle border-dashed"
                          : isLocked
                          ? "glass-subtle border-border/80"
                          : "glass-subtle hover:border-primary/40 shadow-xs"
                      }`}
                    >
                      <div className="grid grid-cols-[4rem_2.5rem_1fr_5.5rem_5rem_5rem_6rem_4.5rem] items-center gap-2">
                        {/* Order (Up / Down arrows only) */}
                        <div className="flex items-center justify-center gap-1">
                          {isLocked ? (
                            <span className="w-6 h-6 rounded-full bg-muted border border-border text-[10px] font-mono font-bold flex items-center justify-center text-muted-foreground">
                              <Lock className="w-3 h-3" />
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveLocalTask(idx, "up")}
                                disabled={idx <= 1}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                                title="Move earlier"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveLocalTask(idx, "down")}
                                disabled={idx >= localTasks.length - 2}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                                title="Move later"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-center">
                          <TaskColorSwatch
                            color={colorHex}
                            onChange={(newHex) => updateLocalTask(task.id, { color: newHex })}
                          />
                        </div>

                        {/* Task Title */}
                        <div className="min-w-0">
                          <input
                            type="text"
                            readOnly={isLocked}
                            disabled={isLocked}
                            value={task.task_name}
                            onChange={(e) =>
                              updateLocalTask(task.id, { task_name: e.target.value })
                            }
                            className={`w-full h-8 px-2.5 text-xs rounded-lg border transition-colors ${
                              isLocked
                                ? "bg-muted/40 border-transparent font-bold text-muted-foreground cursor-not-allowed"
                                : "bg-background border-border focus:border-primary font-medium"
                            }`}
                            placeholder="Task Title..."
                          />
                        </div>

                        {/* Offset */}
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            readOnly={isPublish}
                            disabled={isPublish}
                            value={isPublish ? 0 : task.n_days_offset}
                            onChange={(e) => {
                              if (isPublish) return;
                              updateLocalTask(task.id, {
                                n_days_offset: Math.max(0, parseInt(e.target.value) || 0),
                              });
                            }}
                            className={`w-full h-8 px-2 text-center text-xs font-mono rounded-lg border ${
                              isPublish
                                ? "bg-muted/40 border-transparent text-muted-foreground font-bold cursor-not-allowed"
                                : "bg-background border-border focus:border-primary"
                            }`}
                            title={
                              isPublish
                                ? "Publish offset is fixed at 0"
                                : "Days needed for this step (n)"
                            }
                          />
                        </div>

                        {/* 1st Buffer */}
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            disabled={isLocked}
                            value={task.team_buffer_days}
                            onChange={(e) =>
                              updateLocalTask(task.id, {
                                team_buffer_days: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="w-full h-8 px-2 text-center text-xs font-mono rounded-lg bg-background border border-border focus:border-primary disabled:opacity-30 disabled:bg-muted/30"
                            title="1st submission buffer (days prior to worst-case)"
                          />
                        </div>

                        {/* Final Buffer */}
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            disabled={isLocked}
                            value={task.team_final_buffer_days}
                            onChange={(e) =>
                              updateLocalTask(task.id, {
                                team_final_buffer_days: Math.max(
                                  0,
                                  parseInt(e.target.value) || 0
                                ),
                              })
                            }
                            className="w-full h-8 px-2 text-center text-xs font-mono rounded-lg bg-background border border-border focus:border-primary disabled:opacity-30 disabled:bg-muted/30"
                            title="Final submission revision buffer"
                          />
                        </div>

                        {/* Cumulative Worst-Case Preview */}
                        <div className="flex items-center justify-center">
                          <span
                            className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap ${
                              cumulativeOffset === 0
                                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                                : "bg-primary/10 text-primary border border-primary/20"
                            }`}
                          >
                            {cumulativeOffset === 0 ? "P" : `P - ${cumulativeOffset}d`}
                          </span>
                        </div>

                        {/* Hide / Delete */}
                        <div className="flex items-center justify-center gap-1">
                          {!isLocked ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updateLocalTask(task.id, { is_hidden: !task.is_hidden })
                                }
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  task.is_hidden
                                    ? "text-amber-500 hover:bg-amber-500/15"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                                title={
                                  task.is_hidden
                                    ? "Task is hidden (Click to unhide)"
                                    : "Hide task from tracker"
                                }
                              >
                                {task.is_hidden ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmTask(task);
                                  setDeleteStep(1);
                                }}
                                className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                title="Delete task permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground/60 italic">
                              Fixed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Slim Mode & Automation Strip */}
                      {isPublish && (
                        <div className="pt-2 mt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-500">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Auto-completes when prior stages are Done and publish date has
                              passed.
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border">
                            Automatic ⚡
                          </span>
                        </div>
                      )}

                      {!isIdeation && !isPublish && (
                        <div className="pt-2 mt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border text-[11px] font-mono">
                              <button
                                type="button"
                                onClick={() =>
                                  updateLocalTask(task.id, {
                                    update_mode: "manual",
                                    automation_trigger: null,
                                    automation_role_id: null,
                                  })
                                }
                                className={`px-2.5 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                                  task.update_mode !== "automatic"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                Manual
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateLocalTask(task.id, {
                                    update_mode: "automatic",
                                    automation_trigger:
                                      task.automation_trigger || "script_studio",
                                    automation_role_id:
                                      (task.automation_trigger || "script_studio") ===
                                      "content_submission"
                                        ? task.automation_role_id ||
                                          qualifiedSubmissionRoles[0]?.id ||
                                          null
                                        : null,
                                    require_closure_link: false,
                                  })
                                }
                                className={`px-2.5 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                                  task.update_mode === "automatic"
                                    ? "bg-amber-500 text-amber-950 font-bold shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                Automatic ⚡
                              </button>
                            </div>

                            {task.update_mode === "automatic" && (
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={task.automation_trigger || "script_studio"}
                                  onChange={(e) => {
                                    const nextTrigger = e.target.value as any;
                                    updateLocalTask(task.id, {
                                      automation_trigger: nextTrigger,
                                      automation_role_id:
                                        nextTrigger === "content_submission"
                                          ? task.automation_role_id ||
                                            qualifiedSubmissionRoles[0]?.id ||
                                            null
                                          : null,
                                    });
                                  }}
                                  className="h-7 px-2 text-[11px] font-mono bg-background border border-amber-500/50 text-foreground rounded-lg focus:outline-none focus:border-amber-500 cursor-pointer"
                                >
                                  <option value="script_studio">
                                    Trigger: Scripting Studio update
                                  </option>
                                  <option value="drive_raw_footage">
                                    Trigger: Drive Raw Footage upload
                                  </option>
                                  <option
                                    value="content_submission"
                                    disabled={qualifiedSubmissionRoles.length === 0}
                                  >
                                    {qualifiedSubmissionRoles.length === 0
                                      ? "Trigger: Submission (No member assigned)"
                                      : "Trigger: Deliverable Submission"}
                                  </option>
                                </select>

                                {task.automation_trigger === "content_submission" &&
                                  qualifiedSubmissionRoles.length > 0 && (
                                    <select
                                      value={
                                        task.automation_role_id ||
                                        qualifiedSubmissionRoles[0]?.id ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        updateLocalTask(task.id, {
                                          automation_role_id: e.target.value,
                                        })
                                      }
                                      className="h-7 px-2 text-[11px] font-mono bg-background border border-amber-500/50 text-foreground rounded-lg focus:outline-none focus:border-amber-500 cursor-pointer"
                                    >
                                      {qualifiedSubmissionRoles.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.name} ({r.role_title})
                                        </option>
                                      ))}
                                    </select>
                                  )}
                              </div>
                            )}

                            {task.update_mode !== "automatic" && (
                              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
                                <input
                                  type="checkbox"
                                  checked={Boolean(task.require_closure_link)}
                                  onChange={(e) =>
                                    updateLocalTask(task.id, {
                                      require_closure_link: e.target.checked,
                                    })
                                  }
                                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                />
                                <span>Require published URL on completion</span>
                              </label>
                            )}
                          </div>

                          <div className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                            {task.update_mode === "automatic" ? (
                              task.automation_trigger === "script_studio" ? (
                                <span className="text-amber-500 font-medium">
                                  ⚡ Syncs with Script Studio review
                                </span>
                              ) : task.automation_trigger === "drive_raw_footage" ? (
                                <span className="text-amber-500 font-medium">
                                  ⚡ Syncs with Raw Footage declaration
                                </span>
                              ) : (
                                <span className="text-amber-500 font-medium">
                                  ⚡ Syncs with{" "}
                                  {roles.find((r) => r.id === task.automation_role_id)
                                    ?.name || "member"}
                                  &apos;s approval
                                </span>
                              )
                            ) : task.require_closure_link ? (
                              <span className="text-emerald-500 font-medium">
                                🔗 Prompts for final URL
                              </span>
                            ) : (
                              <span>✋ Manual toggle</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Responsive 2-Column Split: Misc Checklist & Script Studio Columns */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left (5 cols): Compact Misc Tasks Checklist Card */}
            <div className="xl:col-span-5 card-theme rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm">Misc Tasks Checklist</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted border border-border">
                    {selectedType.misc_tasks?.length || 0} Items
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Parallel checklist items required before archiving an episode.
                </p>
              </div>

              {/* Quick Add Bar */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMiscInput}
                  onChange={(e) => setNewMiscInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), handleAddMiscTask())
                  }
                  placeholder="e.g. Thumbnail, Shorts teaser..."
                  className="flex-1 h-8 px-3 text-xs rounded-xl bg-background border border-border focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddMiscTask}
                  className="h-8 px-3 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {/* Compact Checklist List */}
              <div className="space-y-1.5">
                {(!selectedType.misc_tasks || selectedType.misc_tasks.length === 0) && (
                  <p className="text-xs text-muted-foreground italic py-4 text-center glass-subtle rounded-xl">
                    No misc checklist items configured yet.
                  </p>
                )}

                {selectedType.misc_tasks?.map((misc) => {
                  const isEditing = editingMiscId === misc.id;
                  return (
                    <div
                      key={misc.id}
                      className="px-3 py-2 rounded-xl glass-subtle border border-border/80 flex items-center justify-between gap-2 group"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingMiscName}
                          onChange={(e) => setEditingMiscName(e.target.value)}
                          onBlur={() => void handleRenameMiscTask(misc.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleRenameMiscTask(misc.id);
                            } else if (e.key === "Escape") {
                              setEditingMiscId(null);
                            }
                          }}
                          className="flex-1 h-7 px-2 text-xs rounded-lg bg-background border border-primary focus:outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">
                            {misc.task_name}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMiscId(misc.id);
                              setEditingMiscName(misc.task_name);
                            }}
                            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title="Rename item"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteMiscTask(misc.id)}
                          className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Remove misc task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right (7 cols): Default Script Columns Card */}
            <div className="xl:col-span-7 card-theme rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Columns3 className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm">Default Script Columns</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Custom columns for new scripts (Sr. No. and Actions are added
                    automatically).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAddScriptColumn}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 border border-border flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {scriptColumns.map((col, idx) => (
                  <div
                    key={col.id}
                    className="p-3 rounded-xl glass-subtle border border-border/80 flex flex-col gap-2.5 text-xs"
                  >
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5">
                      {/* Reorder & Index */}
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveScriptColumn(idx, "up")}
                            className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === scriptColumns.length - 1}
                            onClick={() => handleMoveScriptColumn(idx, "down")}
                            className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-mono text-muted-foreground w-5 text-center">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-[140px]">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) =>
                            handleUpdateScriptColField(col.id, "name", e.target.value)
                          }
                          placeholder="Column name..."
                          className="w-full h-8 px-2.5 text-xs rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
                        />
                      </div>

                      {/* Type */}
                      <div className="w-28 shrink-0">
                        <select
                          value={col.type}
                          onChange={(e) =>
                            handleUpdateScriptColField(col.id, "type", e.target.value)
                          }
                          className="w-full h-8 px-2 text-xs rounded-lg bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="text">Text</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                      </div>

                      {/* Width */}
                      <div className="w-20 shrink-0">
                        <input
                          type="text"
                          value={col.width || ""}
                          onChange={(e) =>
                            handleUpdateScriptColField(col.id, "width", e.target.value)
                          }
                          placeholder="220px"
                          className="w-full h-8 px-2 text-xs font-mono rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
                        />
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteScriptColumn(col.id)}
                        disabled={scriptColumns.length <= 1}
                        className="h-8 px-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-20 transition-colors cursor-pointer shrink-0"
                        title="Delete column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Dropdown Options Strip */}
                    {col.type === "dropdown" && (
                      <div className="pl-7 pt-2 border-t border-border/40 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase text-muted-foreground mr-1">
                          Options:
                        </span>
                        {col.options?.map((opt) => (
                          <span
                            key={opt}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-background border border-border"
                          >
                            <span>{opt}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDropdownOption(col.id, opt)}
                              className="text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                        <div className="inline-flex items-center gap-1 ml-auto">
                          <input
                            type="text"
                            value={newOptionInputs[col.id] || ""}
                            onChange={(e) =>
                              setNewOptionInputs((prev) => ({
                                ...prev,
                                [col.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              (e.preventDefault(), handleAddDropdownOption(col.id))
                            }
                            placeholder="Add option..."
                            className="h-7 w-28 px-2 text-[11px] rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddDropdownOption(col.id)}
                            className="h-7 px-2 text-[11px] font-semibold bg-muted hover:bg-muted/80 rounded-lg border border-border cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Google Drive Folder Architecture (Side-by-Side Builder + Live Tree) */}
          <div className="card-theme rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-border/60">
              <div>
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-sm">
                    Default Content Folder Architecture
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    Google Drive Sync
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Subfolder structure auto-created in Google Drive for every new Content
                  ID in this series.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left (7 cols): Presets & Interactive Builder */}
              <div className="lg:col-span-7 space-y-4">
                {/* Quick Presets */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Presets:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_ARCHITECTURE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleApplyFolderPreset(preset.folders)}
                        className="px-2.5 py-1.5 rounded-xl text-xs border border-border glass-subtle hover:border-primary/40 text-foreground transition-all flex items-center gap-1.5 cursor-pointer"
                        title={preset.description}
                      >
                        <Folder className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-medium">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Folder Builder Rows */}
                <div className="space-y-2">
                  {folderArchitecture.map((folder, idx) => {
                    const isSubfolder = Boolean(folder.parent_id);
                    const parentFolder = isSubfolder
                      ? folderArchitecture.find((f) => f.id === folder.parent_id)
                      : null;

                    return (
                      <div
                        key={folder.id}
                        className={`p-2.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                          isSubfolder
                            ? "ml-6 pl-3.5 border-l-2 border-l-amber-500/60 bg-muted/20 border-border/70"
                            : "glass-subtle border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveFolder(idx, "up")}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === folderArchitecture.length - 1}
                              onClick={() => handleMoveFolder(idx, "down")}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSubfolder && (
                              <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                            )}
                            <Folder
                              className={`w-4 h-4 ${
                                isSubfolder ? "text-amber-400" : "text-amber-500"
                              }`}
                            />
                          </div>

                          <input
                            type="text"
                            value={folder.name}
                            onChange={(e) => handleRenameFolder(folder.id, e.target.value)}
                            placeholder="e.g. Raw_Footage"
                            className="flex-1 min-w-[140px] h-8 px-2.5 text-xs font-mono rounded-lg bg-background border border-border focus:outline-none focus:border-primary"
                          />

                          {isSubfolder && (
                            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-muted text-muted-foreground border border-border/60 shrink-0">
                              in {parentFolder?.name || "Parent"}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                          {!isSubfolder && (
                            <button
                              type="button"
                              onClick={() => handleAddSubfolder(folder.id)}
                              className="h-8 px-2.5 rounded-lg text-[11px] font-medium bg-muted/60 hover:bg-muted border border-border text-foreground flex items-center gap-1 cursor-pointer"
                              title="Add subfolder inside this folder"
                            >
                              <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                              <span>Subfolder</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteFolder(folder.id)}
                            disabled={folderArchitecture.length <= 1}
                            className="h-8 px-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-20 cursor-pointer"
                            title="Delete folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Top-Level Folder */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTopFolderInput}
                    onChange={(e) => setNewTopFolderInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTopFolder();
                      }
                    }}
                    placeholder="New folder name..."
                    className="flex-1 max-w-xs h-8 px-3 text-xs font-mono rounded-xl bg-background border border-border focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTopFolder()}
                    className="h-8 px-3 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 border border-border flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Top Folder</span>
                  </button>
                </div>
              </div>

              {/* Right (5 cols): Live Drive Tree Preview */}
              <div className="lg:col-span-5 space-y-3">
                <div className="p-4 rounded-2xl glass-subtle border border-border">
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-foreground">
                    <FolderTree className="w-3.5 h-3.5 text-primary" />
                    <span>Live Google Drive Hierarchy</span>
                  </div>
                  <div className="bg-background/80 p-3.5 rounded-xl border border-border font-mono text-[11px] text-muted-foreground overflow-x-auto space-y-1.5">
                    <div className="text-foreground font-semibold flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>
                        Google Drive / ContentPipe /{" "}
                        {selectedBrand ? `${selectedBrand.name} / ` : ""}
                        {selectedType.name} /
                      </span>
                    </div>
                    <div className="pl-4 text-foreground/90 font-medium flex items-center gap-1.5">
                      <CornerDownRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      <span>[ContentID - Title] /</span>
                    </div>
                    {folderArchitecture.map((f) => {
                      const isSub = Boolean(f.parent_id);
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center gap-1.5 ${
                            isSub ? "pl-12 text-foreground/75" : "pl-8 text-foreground/85"
                          }`}
                        >
                          <CornerDownRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="font-semibold text-foreground">{f.name}/</span>
                        </div>
                      );
                    })}
                    <div className="pl-8 text-muted-foreground/60 italic text-[10px] pt-1">
                      * Submissions &amp; final cuts live inside the project folder.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl glass-subtle border border-border/80 flex items-start gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    Per-folder access permissions can be configured for each team member in{" "}
                    <strong className="text-foreground">Team &amp; Roles</strong>.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Bottom Unified Save Bar */}
          <div className="card-theme rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
              {hasUnsavedChanges ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="text-amber-500 font-semibold">
                    You have unsaved changes to workflow, script columns, or folders.
                  </span>
                </>
              ) : saveSuccess ? (
                <span className="text-emerald-500 font-semibold">
                  All changes saved to {selectedType.name}.
                </span>
              ) : (
                <span>All changes synced for {selectedType.name}.</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={!hasUnsavedChanges || isSavingAll}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs shrink-0 ${
                saveSuccess
                  ? "bg-emerald-600 text-white border border-emerald-600"
                  : hasUnsavedChanges
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary cursor-pointer ring-2 ring-primary/20"
                  : "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
              }`}
            >
              {isSavingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saveSuccess ? "Saved!" : "Save Changes"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal 1: Create New Content Series                            */}
      {/* ------------------------------------------------------------- */}
      {isNewTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-lg p-6 rounded-2xl relative border border-border">
            <button
              onClick={() => setIsNewTypeModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold font-display mb-1">
              Create New Content Series
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Set up a distinct series pipeline with its own brand, cadence, auto-numbering,
              and default workflow.
            </p>

            {typeFormError && (
              <div className="mb-3 p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono">
                {typeFormError}
              </div>
            )}

            <form onSubmit={handleCreateContentType} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Brand *</label>
                <select
                  value={typeBrandId}
                  onChange={(e) => setTypeBrandId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.is_default ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Content Series Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Long-Form, Podcast, Shorts"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">ID Prefix (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. LF-, POD-"
                    value={typePrefix}
                    onChange={(e) => setTypePrefix(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">ID Suffix (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. -HD, -V"
                    value={typeSuffix}
                    onChange={(e) => setTypeSuffix(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Cadence Cycle</label>
                <select
                  value={typeCadence}
                  onChange={(e) => setTypeCadence(e.target.value as any)}
                  className="w-full h-9 px-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="weekly">Weekly (1 Week)</option>
                  <option value="biweekly">Bi-weekly (2 Weeks)</option>
                  <option value="triweekly">Tri-weekly (3 Weeks)</option>
                  <option value="quadrupleweekly">Quad-weekly (4 Weeks)</option>
                </select>
              </div>

              <CadenceUploadDaysPicker
                cadence={typeCadence}
                uploadDays={typeUploadDays}
                onChange={setTypeUploadDays}
              />

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTypeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Create Content Series</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal 2: Edit Content Series                                  */}
      {/* ------------------------------------------------------------- */}
      {isEditTypeModalOpen && selectedType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-lg p-6 rounded-2xl relative border border-border">
            <button
              onClick={() => setIsEditTypeModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold font-display mb-1">
              Edit {selectedType.name} Configuration
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Update brand assignment, cadence, upload days, and ID prefix.
            </p>

            {typeFormError && (
              <div className="mb-3 p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono">
                {typeFormError}
              </div>
            )}

            <form onSubmit={handleUpdateContentType} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Brand *</label>
                <select
                  value={typeBrandId}
                  onChange={(e) => setTypeBrandId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.is_default ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Content Series Name *</label>
                <input
                  type="text"
                  required
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">ID Prefix</label>
                  <input
                    type="text"
                    value={typePrefix}
                    onChange={(e) => setTypePrefix(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">ID Suffix</label>
                  <input
                    type="text"
                    value={typeSuffix}
                    onChange={(e) => setTypeSuffix(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Cadence Cycle</label>
                <select
                  value={typeCadence}
                  onChange={(e) => setTypeCadence(e.target.value as any)}
                  className="w-full h-9 px-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="weekly">Weekly (1 Week)</option>
                  <option value="biweekly">Bi-weekly (2 Weeks)</option>
                  <option value="triweekly">Tri-weekly (3 Weeks)</option>
                  <option value="quadrupleweekly">Quad-weekly (4 Weeks)</option>
                </select>
              </div>

              <CadenceUploadDaysPicker
                cadence={typeCadence}
                uploadDays={typeUploadDays}
                onChange={setTypeUploadDays}
              />

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditTypeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update Content Series</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Brand Modal: Create / Edit Brand                              */}
      {/* ------------------------------------------------------------- */}
      {(isNewBrandModalOpen || (isEditBrandModalOpen && selectedBrand)) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-md p-6 rounded-2xl relative border border-border">
            <button
              type="button"
              onClick={() => {
                setIsNewBrandModalOpen(false);
                setIsEditBrandModalOpen(false);
                resetBrandForm();
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: brandColor }}
              />
              <h3 className="text-lg font-bold font-display">
                {isEditBrandModalOpen
                  ? `Edit Brand: ${selectedBrand?.name}`
                  : "Create New Brand"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {isEditBrandModalOpen
                ? "Update this brand's identity, accent color, or default status."
                : "Organize channels, clients, or product lines with isolated Content Series."}
            </p>

            {brandFormError && (
              <div className="mb-3 p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono">
                {brandFormError}
              </div>
            )}

            <form
              onSubmit={isEditBrandModalOpen ? handleUpdateBrand : handleCreateBrand}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-semibold block mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tech Channel, Podcast Network, Client X"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl glass-input text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Short note about this brand or channel"
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl glass-input text-foreground"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1.5">Brand Color</label>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl glass-subtle">
                  <label
                    className="w-7 h-7 rounded-lg border border-border shrink-0 relative overflow-hidden cursor-pointer"
                    style={{ backgroundColor: brandColor }}
                    title={`Pick custom color (${brandColor})`}
                  >
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="opacity-0 w-full h-full cursor-pointer absolute inset-0"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BRAND_COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setBrandColor(hex)}
                        className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                          brandColor.toLowerCase() === hex.toLowerCase()
                            ? "ring-2 ring-primary ring-offset-1 ring-offset-background border-white"
                            : "border-border/60"
                        }`}
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground ml-auto">
                    {brandColor}
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={brandIsDefault}
                  disabled={Boolean(isEditBrandModalOpen && selectedBrand?.is_default)}
                  onChange={(e) => setBrandIsDefault(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-primary cursor-pointer disabled:opacity-50"
                />
                <span className="text-xs text-foreground font-medium">
                  Set as Default Brand
                  {isEditBrandModalOpen && selectedBrand?.is_default && (
                    <span className="text-muted-foreground font-mono text-[10px] ml-1">
                      (Already default)
                    </span>
                  )}
                </span>
              </label>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewBrandModalOpen(false);
                    setIsEditBrandModalOpen(false);
                    resetBrandForm();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={brandSaving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {brandSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isEditBrandModalOpen ? "Save Brand" : "Create Brand"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Brand Modal: Delete Confirmation                              */}
      {/* ------------------------------------------------------------- */}
      {deleteConfirmBrand && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-md p-6 rounded-2xl border border-destructive/40 relative">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base">
                Delete Brand: {deleteConfirmBrand.name}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Deleting this Brand will permanently delete all Content Series and items
              inside it from the database.
            </p>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/10 border border-destructive/25 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={deleteBrandDriveData}
                onChange={(e) => setDeleteBrandDriveData(e.target.checked)}
                className="mt-0.5 accent-destructive cursor-pointer"
              />
              <span className="text-xs text-foreground leading-snug">
                <strong className="text-destructive">
                  Also delete all data from Google Drive &amp; database
                </strong>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Permanently deletes all Drive folders, raw footage, drafts, final
                  exports, and Brand ideas. This cannot be undone.
                </span>
              </span>
            </label>

            {deleteBrandError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-mono leading-relaxed">
                {deleteBrandError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmBrand(null);
                  setDeleteBrandError(null);
                  setDeleteBrandNeedsConfirm(false);
                  setDeleteBrandDriveData(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBrand}
                onClick={() => executeDeleteBrand(deleteBrandNeedsConfirm)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingBrand ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {deleteBrandNeedsConfirm
                    ? "Confirm & Delete Everything"
                    : "Delete Brand"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Modal 3: Insert Workflow Task                                 */}
      {/* ------------------------------------------------------------- */}
      {isNewTaskModalOpen && selectedType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-md p-6 rounded-2xl relative border border-border">
            <button
              onClick={() => setIsNewTaskModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold font-display mb-1">Insert Workflow Task</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Inserted into <strong>{selectedType.name}</strong> pipeline right before
              Publish.
            </p>

            <form onSubmit={handleAddTask} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold block mb-1">Task Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Color Grading, Audio Mix, Subtitles"
                  value={newTaskName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewTaskName(val);
                    const def = DEFAULT_TASK_HEX_COLORS[val.toLowerCase().trim()];
                    if (def) setNewTaskColor(def);
                  }}
                  className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">
                  Days Needed For This Step (n)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  required
                  value={newTaskOffset}
                  onChange={(e) => setNewTaskOffset(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Pushes earlier tasks back by n days according to worst-case math (P - sum
                  of n).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">
                    Team 1st Sub Due (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={newTaskBuffer1}
                    onChange={(e) => setNewTaskBuffer1(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border font-mono text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Days prior to worst-case
                  </span>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Team Final Sub (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={newTaskBufferFinal}
                    onChange={(e) => setNewTaskBufferFinal(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-xl bg-background border border-border font-mono text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Revision safety buffer
                  </span>
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1.5">Color / Swatch</label>
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border">
                  <TaskColorSwatch color={newTaskColor} onChange={setNewTaskColor} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_SWATCH_COLORS.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => setNewTaskColor(p.hex)}
                        className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
                          newTaskColor.toLowerCase() === p.hex.toLowerCase()
                            ? "ring-2 ring-primary ring-offset-1 ring-offset-background border-primary"
                            : "border-border/60"
                        }`}
                        style={{ backgroundColor: p.hex }}
                        title={p.name}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground ml-auto">
                    {newTaskColor}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Safeguard Modal 1: Double Confirmation for Hiding Task         */}
      {/* ------------------------------------------------------------- */}
      {hideConfirmTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-md p-6 rounded-2xl border border-border">
            <div className="flex items-center gap-2 text-status-review mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base">Double Confirmation: Hide Task</h3>
            </div>

            {hideStep === 1 && (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Hiding <strong>{hideConfirmTask.task_name}</strong> will remove its column
                  from the Main Tracker and bypass predecessor-successor blocking rules. Saved
                  history is safely preserved.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHideConfirmTask(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideStep(2)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-status-review text-status-review-foreground hover:opacity-90 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Proceed to Confirm (1/2)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {hideStep === 2 && (
              <>
                <p className="text-xs text-foreground font-semibold leading-relaxed mb-4">
                  Final Check (Step 2/2): Are you completely sure you want to hide{" "}
                  <strong>{hideConfirmTask.task_name}</strong> from open workflows?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHideConfirmTask(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={executeHideTask}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Confirm &amp; Hide Task</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Safeguard Modal 2: Triple Confirmation for Deleting Task       */}
      {/* ------------------------------------------------------------- */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-floating w-full max-w-md p-6 rounded-2xl border border-destructive/50">
            <div className="flex items-center gap-2 text-destructive mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base">Triple Confirmation: Delete Task</h3>
            </div>

            {deleteStep === 1 && (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Deleting <strong>{deleteConfirmTask.task_name}</strong> will{" "}
                  <strong>permanently erase</strong> all completion records, submission
                  histories, and comments linked to this step across all videos.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTask(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-destructive/20 text-destructive hover:bg-destructive/30 flex items-center gap-1 cursor-pointer"
                  >
                    <span>I understand (Step 1/3)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {deleteStep === 2 && (
              <>
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold mb-4">
                  Irreversible Data Loss: All historical team approval timestamps for &quot;
                  {deleteConfirmTask.task_name}&quot; will be purged.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTask(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(3)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Proceed to Final Gate (Step 2/3)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {deleteStep === 3 && (
              <>
                <p className="text-xs font-bold text-destructive leading-relaxed mb-4">
                  Final Authorization (Step 3/3): Permanently destroy task &quot;
                  {deleteConfirmTask.task_name}&quot; and recalculate target dates for
                  downstream tasks?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTask(null)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 cursor-pointer"
                  >
                    Abort
                  </button>
                  <button
                    type="button"
                    onClick={executeDeleteTask}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Erase Task</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Publish Dates Organizer Modal (Triggered automatically when Cadence changes) */}
      {isOrganizerModalOpen && organizerTargetType && (
        <PublishDatesOrganizerModal
          isOpen={isOrganizerModalOpen}
          onClose={() => {
            setIsOrganizerModalOpen(false);
            setOrganizerTargetType(null);
          }}
          contentType={organizerTargetType}
          onOrganized={() => {
            fetchContentTypes(
              selectedBrand?.id || null,
              organizerTargetType?.id || selectedType?.id || null,
              { silent: true }
            );
          }}
          isTriggeredFromSettings={true}
        />
      )}
    </div>
  );
}
